/* =====================================================================
 * data_sync.js  —  Google Sheets (CSV) sync layer for Water POG Dashboard
 * โหลดหลังจาก config.js และ data.js
 *
 * วิธีทำงาน:
 *  1) เมื่อเปิดแอป → fetch CSV จากทุก tab ใน Google Sheets (ผ่าน gviz endpoint)
 *  2) parse CSV → build data structure → ส่งให้ React state
 *  3) Auto-refresh ทุก ๆ AUTO_REFRESH_MS
 *
 * Read-only — แก้ข้อมูลใน web app ไม่ sync กลับ Sheet (แก้ใน Sheet โดยตรงแทน)
 *
 * ต้องตั้งค่า Google Sheet ให้เป็น "Anyone with the link can view"
 * ===================================================================== */
(function () {
  'use strict';

  // ── Build marker ───────────────────────────────────────────────────
  // เปิด DevTools Console แล้วดูบรรทัดนี้ เพื่อยืนยันว่าเบราว์เซอร์โหลด "โค้ดใหม่" จริง
  // (ถ้าไม่เห็น = ยังรัน cache เก่า → hard refresh Ctrl+Shift+R + ปิดแท็บเก่าทุกอัน)
  // เช็คเร็ว: พิมพ์ WTPData.buildId ใน console
  var BUILD_ID = '20260608a';
  try {
    console.info('%c[WTP Sync] build ' + BUILD_ID + ' — base-reconcile + anti-flip + grace180s + anti-wedge',
                 'color:#2a6fdb;font-weight:bold');
    if (window.WTPData) WTPData.buildId = BUILD_ID;
  } catch (_) {}

  var cfg = window.WTP_CONFIG || {};
  var SHEET_ID = cfg.SHEET_ID || '';
  var POST_URL = cfg.APPS_SCRIPT_URL || '';

  if (!SHEET_ID) {
    console.info('[WTP Sync] Offline mode — ตั้งค่า SHEET_ID ใน app/config.js เพื่อเปิด sync');
    WTPData.getSyncStatus = function () { return { status: 'offline', time: null }; };
    WTPData.subscribe = function () { return function () {}; };
    return;
  }

  var BASE = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/gviz/tq?tqx=out:csv&sheet=';

  // Entities ที่รองรับ CRUD ผ่าน Apps Script POST
  var CRUD_ENTITIES = ['projects', 'invoices', 'forecastEntries',
                       'bankAccounts', 'pvVouchers', 'payables',
                       'debtLedger', 'receipts', 'bankEntries', 'checks',
                       'debtMaster', 'bankTransfers',
                       'stsServiceFee', 'stsPendingCalc', 'stsCalcResult',
                       'debtEvents', 'users', 'cashflowSnapshots',
                       'followUpsLog', 'manualOverrides'];

  // jsonFields per entity — for proper rowsToObjects parsing during safety re-fetch
  var ENTITY_JSON_FIELDS = {
    invoices:      ['followUps', 'actualReceive'],
    stsCalcResult: ['debtIds'],
  };

  // Fields the APP is allowed to intentionally CLEAR — for these, an empty app
  // value must WIN over a non-empty Sheet value. Without this, the
  // "keep Sheet value when app empty" guard makes "ล้าง" (clear) bounce back on
  // the next sync: app sets paymentDate='' → merge restores the old Sheet value.
  // Only list fields the app fully owns via UI (never hand-edited in the Sheet).
  var CLEARABLE_FIELDS = {
    debtLedger: ['paymentDate', 'paidBy', 'paidAt', 'paymentNote',
                 'interestOverride', 'overrideBy', 'overrideAt', 'overrideNote'],
    debtMaster: ['closedDate', 'closedReason', 'closedBy', 'closedAt'],
  };

  /* ── state ──────────────────────────────────────────────────────── */
  var subscribers      = [];
  var syncStatus       = 'syncing';
  var lastSyncTime     = null;          // last successful sync timestamp
  var lastSyncError    = null;          // last error message (for tooltip/debug)
  var failedSheets     = [];            // list of sheet names that failed last round
  var consecutiveFails = 0;             // count consecutive fail rounds (adaptive backoff)
  var cachedServerData = null;
  var lastSnapshot     = {};            // last known server state per entity (JSON)
  var serverDataLoaded = false;         // gate auto-push until first server read
  var syncTimer        = null;          // debounce timer for syncDiff
  var inSyncDiff       = false;         // re-entry guard for syncDiff
  var AUTO_MS          = cfg.AUTO_REFRESH_MS || 0;
  var currentInterval  = AUTO_MS;       // may grow via backoff
  var autoTimer        = null;          // setInterval handle (so we can restart)
  var recentPushAt     = {};            // entity → ts(ms) ของ push ล่าสุดที่สำเร็จ (anti-bounce)
  var cycleCount       = 0;             // นับรอบ auto-refresh (ใช้ตัดสิน hot vs full)

  // ── Anti-flip (กันยอด "เด้งไปเด้งมา") ──────────────────────────────
  // gviz CSV มีหลาย cache edge ที่ไม่ sync กัน → บางรอบ poll คืนค่าเก่า บางรอบค่าใหม่
  // → ค่าบนจอสลับเก่า↔ใหม่ทุกรอบ (อาการ "กระพริบ"). เกราะฝั่งเขียน (base-reconcile)
  // ไม่ช่วยเพราะนี่คือฝั่ง "อ่าน". กฎ: auto-poll จะ "รับ" ค่าที่เปลี่ยนก็ต่อเมื่ออ่านได้
  // ค่าเดิมซ้ำ 2 รอบติด (นิ่งแล้ว) เท่านั้น — ค่าที่ flap ไปมาจะถูกข้าม คงค่าที่แสดงอยู่.
  // trusted (เปิดแอป / กด ↻ / กลับ tab) ไม่ติดเงื่อนไข — รับทันที + ตั้ง baseline ให้ auto รอบถัดไป.
  var lastAutoRead = {};                // entity → JSON ของ sheet rows ที่ auto อ่านได้รอบก่อน
  function autoReadGate(entity, sheetJSON, isAuto) {
    if (!isAuto) { lastAutoRead[entity] = sheetJSON; return true; }   // trusted → รับทันที
    var prev = lastAutoRead[entity];
    lastAutoRead[entity] = sheetJSON;
    return prev === undefined || sheetJSON === prev;                   // รับเมื่อนิ่ง (ตรงรอบก่อน)
  }

  // ── Anti-bounce grace window ──────────────────────────────────────
  // หลัง push สำเร็จ gviz CSV อาจยังเสิร์ฟค่าเก่าได้อีกหลายสิบวินาที
  // (read-after-write lag). ในช่วงนี้ห้ามเอา CSV เก่ามาทับค่าที่เพิ่ง push
  // ไม่งั้นจอจะ "เด้งกลับ" เป็นค่าเดิม → user นึกว่าไม่บันทึก เลยแก้ซ้ำ
  // 180s — ขยายจาก 60s (2026-06-06): เซิร์ฟเวอร์มี base-reconcile กันข้อมูลหายถาวรแล้ว
  // เหลือแค่อาการ "วูบชั่วคราว" ตอน gviz CSV อ่านช้ากว่าเขียน (read-after-write lag).
  // ผู้ใช้ไม่ต้องการ real-time → กันค่าที่เพิ่ง push ไม่ให้ CSV เก่าทับนานขึ้น = วูบน้อยลง.
  // ผลข้างเคียงน้อย: เห็น edit ของคนอื่นช้าลง "เฉพาะตาราง+ช่วงที่ตัวเองเพิ่งแก้" เท่านั้น
  var GRACE_MS = 180000;                // 180 วินาที (3 นาที)

  // ── Hot vs Cold polling ───────────────────────────────────────────
  // HOT  = entity ที่ user แก้บ่อย (CRUD) — poll ทุกรอบ
  // COLD = แท็บสรุป/derived (meta/pipeline/warroom/daily/cashFlow/...) ที่
  //        เปลี่ยนนาน ๆ ครั้ง — ดึงเฉพาะตอน full load (เปิดแอป/manual/กลับ tab/
  //        ทุก COLD_EVERY รอบ) เพื่อลดจำนวน request → ลด 429 → ข้อมูลสดขึ้น
  var COLD_EVERY = 4;                   // full load ทุก 4 รอบ (เช่น 45s×4 = ~3 นาที)

  function setSyncStatus(s, ctx) {
    syncStatus = s;
    if (s === 'ok') {
      lastSyncTime     = new Date();
      lastSyncError    = null;
      failedSheets     = [];
      consecutiveFails = 0;
      // คืน interval กลับเป็นค่าปกติถ้าเคยขยายไว้
      if (currentInterval !== AUTO_MS && AUTO_MS > 0) {
        currentInterval = AUTO_MS;
        restartAutoTimer();
        console.info('[WTP Sync] ✓ sync ok — คืน interval เป็น', AUTO_MS / 1000, 'วินาที');
      }
    } else if (s === 'error') {
      lastSyncError = (ctx && ctx.error) || null;
      failedSheets  = (ctx && ctx.sheets) || [];
      consecutiveFails++;
      // Adaptive backoff — fail ติด 2+ รอบ → ขยาย interval x2 (max 4 เท่าของ base)
      if (consecutiveFails >= 2 && AUTO_MS > 0 && currentInterval < AUTO_MS * 4) {
        currentInterval = Math.min(currentInterval * 2, AUTO_MS * 4);
        restartAutoTimer();
        console.warn('[WTP Sync] ขยาย interval เป็น', currentInterval / 1000,
          'วินาที (consecutive fails:', consecutiveFails + ')');
      }
    }
    window.dispatchEvent(new CustomEvent('wtpSyncStatus', {
      detail: {
        status: s, time: lastSyncTime,
        lastError: lastSyncError, failedSheets: failedSheets.slice(),
        consecutiveFails: consecutiveFails, currentInterval: currentInterval,
      }
    }));
  }

  function restartAutoTimer() {
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
    if (currentInterval > 0) {
      autoTimer = setInterval(function () {
        // Page Visibility guard — tab idle ก็ไม่ต้องดึง
        if (document.hidden) return;
        cycleCount++;
        // ทุก COLD_EVERY รอบ → full load (ดึงแท็บ cold ด้วย); รอบอื่น → hot เท่านั้น
        // ★ ส่ง isAuto=true → ติดกฎ anti-flip (รับค่าใหม่เฉพาะที่นิ่ง) กันยอดเด้ง
        if (cycleCount % COLD_EVERY === 0) loadFromServer(true);
        else refreshHotEntities();
      }, currentInterval);
    }
  }

  /* ── CSV parser (handles quoted fields, commas inside quotes, "") ── */
  function parseCSV(text) {
    var rows = [], row = [], field = '', inQuotes = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (inQuotes) {
        if (ch === '"' && text[i+1] === '"') { field += '"'; i++; }
        else if (ch === '"') { inQuotes = false; }
        else { field += ch; }
      } else {
        if (ch === '"') { inQuotes = true; }
        else if (ch === ',') { row.push(field); field = ''; }
        else if (ch === '\r') { /* skip */ }
        else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
        else { field += ch; }
      }
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  /* ── helpers ─────────────────────────────────────────────────────── */
  function rowsToObjects(rows, jsonFields) {
    if (!rows || rows.length < 2) return [];
    // Trim header strings — kills leading/trailing spaces/newlines/zero-width chars
    // ที่อาจติดมาจาก Google Sheets ตอน user paste (เคยทำให้ p['Start'] = undefined
    // เพราะ header จริงเป็น " Start" หรือ "Start " มี space แอบอยู่)
    var headers = (rows[0] || []).map(function (h) {
      if (h == null) return h;
      return String(h).replace(/[​-‍﻿]/g, '').trim();
    });

    // Detect duplicate column headers — warn once so users can find/rename them.
    var seen = {};
    var dupes = [];
    headers.forEach(function (h) {
      if (!h) return;
      if (seen[h]) { if (dupes.indexOf(h) < 0) dupes.push(h); }
      seen[h] = true;
    });
    if (dupes.length) {
      console.warn('[WTP Sync] พบ header ซ้ำใน sheet:', dupes.join(', '),
        '— จะใช้ค่าที่ไม่ว่างเปล่าเป็นหลัก (ถ้ามีหลายคอลัมน์ชื่อเดียวกัน)');
    }

    var out = [];
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i];
      if (!r || r.every(function (c) { return !c; })) continue;
      var obj = {};
      headers.forEach(function (h, j) {
        if (!h) return;
        var v = r[j];
        if (v === '' || v === undefined) v = null;
        if (jsonFields && jsonFields.indexOf(h) >= 0 && typeof v === 'string' && v.length > 1) {
          try { v = JSON.parse(v); } catch (_) {}
        }
        var existing = obj[h];
        var existingHasVal = existing != null && existing !== '';
        var newIsEmpty    = v == null || v === '';
        if (existingHasVal && newIsEmpty) return;
        obj[h] = v;
      });
      out.push(obj);
    }
    return out;
  }

  function rowsToKV(rows) {
    if (!rows || rows.length < 2) return {};
    var out = {};
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i];
      if (!r[0]) continue;
      out[r[0]] = r[1] != null && r[1] !== '' ? r[1] : null;
    }
    return out;
  }

  function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }
  function tryParse(v, def) {
    if (v == null || v === '') return def;
    try { return JSON.parse(v); } catch (_) { return def; }
  }

  /* ── fetch one sheet as CSV rows ─────────────────────────────────── */
  // หมายเหตุ: ตั้งใจให้ throw error ออกไป (ไม่ catch ภายใน) เพื่อให้ caller
  // ใช้ Promise.allSettled แล้วตัดสินใจว่าจะ retry หรือใช้ cache เดิม
  // ★ ห้าม return [] ตอน fail เด็ดขาด — เพราะ [] จะถูกเอาไปทับข้อมูลใน
  //   localStorage (data loss bug) ตอนเจอ HTTP 429 / network error
  // ★ 429 resilience: จำกัดจำนวนคำขอพร้อมกัน + retry แบบ backoff เมื่อชน rate-limit
  var SHEET_FETCH_CONC = 6;     // ดึงทีละ ≤6 ชีต กัน burst → ลด HTTP 429
  var SHEET_MAX_RETRY  = 4;     // retry 429/5xx/network ก่อนยอมแพ้ (กันทิ้งทั้งรอบเพราะชน rate-limit)
  var SHEET_RETRY_BASE = 700;   // ms (exponential + jitter: ~0.7s, 1.4s, 2.8s, 5.6s)
  var lastRawRows = {};         // ★ raw rows ล่าสุดต่อชีต — ใช้เป็น fallback เมื่อชีตนั้นชน 429 (กันทิ้งทั้งรอบ)

  function fetchSheet(name, attempt) {
    attempt = attempt || 0;
    // Add cache-busting timestamp so we always get the latest Sheet state.
    // Without this, Google's gviz endpoint may serve stale CSV for several minutes.
    var url = BASE + encodeURIComponent(name) + '&_t=' + Date.now();
    return fetch(url, { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) { var e = new Error(name + ': HTTP ' + r.status); e.status = r.status; throw e; }
        return r.text();
      })
      .then(parseCSV)
      .catch(function (err) {
        // 429 (rate limit) / 5xx / network → หน่วงเวลาแล้วลองใหม่ (กระจายด้วย jitter)
        var st = err && err.status;
        var retryable = st === 429 || st === 500 || st === 502 || st === 503 ||
                        (err && /Failed to fetch|NetworkError|load failed/i.test(err.message || ''));
        if (retryable && attempt < SHEET_MAX_RETRY) {
          var delay = Math.min(SHEET_RETRY_BASE * Math.pow(2, attempt), 8000) + Math.floor(Math.random() * 400);
          return new Promise(function (res) { setTimeout(res, delay); })
            .then(function () { return fetchSheet(name, attempt + 1); });
        }
        throw err;  // ★ ยังต้อง throw — ให้ atomic rule รักษาข้อมูลเดิม (ห้าม return [])
      });
  }

  /* run fn over items with limited concurrency; returns a Promise.allSettled-shaped
   * array (order preserved) — กัน burst 32 requests พร้อมกันที่ทำให้ชน 429 */
  function mapLimit(items, limit, fn) {
    return new Promise(function (resolve) {
      var results = new Array(items.length);
      var next = 0, active = 0, finished = 0;
      if (items.length === 0) { resolve(results); return; }
      function pump() {
        while (active < limit && next < items.length) {
          (function (i) {
            active++;
            Promise.resolve().then(function () { return fn(items[i], i); })
              .then(function (v) { results[i] = { status: 'fulfilled', value: v }; },
                    function (e) { results[i] = { status: 'rejected', reason: e }; })
              .then(function () {
                active--; finished++;
                if (finished === items.length) resolve(results);
                else pump();
              });
          })(next++);
        }
      }
      pump();
    });
  }

  /* ── load all sheets in parallel + assemble data structure ─────────
   * isAuto=true  → เรียกจาก auto-timer (cold cycle) → ติดกฎ anti-flip (รับเฉพาะค่าที่นิ่ง)
   * isAuto=false → เปิดแอป / กด ↻ / กลับ tab → trusted, รับค่าทันที */
  function loadFromServer(isAuto) {
    setSyncStatus('syncing');

    var sheetOrder = [
      'meta', 'pipeline', 'warroomP1', 'warroomP2', 'daily', 'cashFlow',
      'ytdRevenue', 'weeklyExpectedReceipt', 'monthlyForecast',
      'daily_invoicesToday', 'cf_inflow', 'cf_outflow',
      'projects', 'invoices', 'forecastEntries',
      'bankAccounts', 'pvVouchers', 'payables',
      // v2 additions
      'debtLedger', 'receipts', 'bankEntries', 'checks',
      'debtMaster', 'bankTransfers',
      'stsServiceFee', 'stsPendingCalc', 'stsCalcResult',
      'debtEvents',
      'users',                  // user accounts (manager-only management)
      'cashflowSnapshots',      // daily bank balance snapshots
      'followUpsLog',           // flat log of all invoice follow-ups
      'manualOverrides',        // shared manual KPI overrides (visible to all users)
    ];

    return mapLimit(sheetOrder, SHEET_FETCH_CONC, function (n) { return fetchSheet(n); }).then(function (settled) {
      // ★ Per-sheet fallback (แทนกฎ atomic เดิมที่ทิ้งทั้งรอบ):
      //   • ชีตที่โหลดสำเร็จ → ใช้ค่าสด + จำไว้เป็น lastRawRows
      //   • ชีตที่ชน 429/พัง → ใช้ค่าที่โหลดไว้ล่าสุด (ไม่เคยทับด้วย [] → ยังกัน data loss)
      //   • ชีตที่พัง "และไม่เคยโหลดสำเร็จเลย" (ไม่มีค่าเดิม) → ทิ้งทั้งรอบ retry (กัน render ครึ่งๆ ตอนเปิดครั้งแรก)
      var failed = [], usedCache = [];
      var results = settled.map(function (s, idx) {
        var name = sheetOrder[idx];
        if (s.status === 'fulfilled') { lastRawRows[name] = s.value; return s.value; }
        failed.push({ name: name, err: s.reason && s.reason.message });
        if (lastRawRows[name] !== undefined) { usedCache.push(name); return lastRawRows[name]; }
        return undefined;  // ไม่มีค่าเดิม
      });
      if (failed.length > 0) {
        failed.forEach(function (f) { console.warn('[WTP Sync] ดึงชีต', f.name, 'ล้มเหลว:', f.err); });
      }
      var unrecoverable = failed.filter(function (f) { return lastRawRows[f.name] === undefined; });
      if (unrecoverable.length > 0) {
        console.warn('[WTP Sync] ⚠ ' + unrecoverable.length + '/' + sheetOrder.length +
          ' ชีตโหลดไม่สำเร็จและยังไม่มีค่าเดิม — รักษาข้อมูลเดิมไว้ (ไม่ทับ localStorage) จะ retry รอบหน้า');
        setSyncStatus('error', {
          error: (unrecoverable[0] && unrecoverable[0].err) || 'fetch failed',
          sheets: unrecoverable.map(function (f) { return f.name; }),
        });
        return;  // ★ early return — ยังไม่ commit เพราะมีชีตที่ไม่เคยมีข้อมูลเลย
      }
      if (usedCache.length > 0) {
        console.warn('[WTP Sync] ⚠ ' + usedCache.length + ' ชีตชน 429 — ใช้ค่าที่โหลดล่าสุดแทน, ชีตอื่น commit ปกติ:',
          usedCache.join(', '));
      }
      var i = 0;
      var metaKV     = rowsToKV(results[i++]);
      var pipelineKV = rowsToKV(results[i++]);
      var wp1KV      = rowsToKV(results[i++]);
      var wp2KV      = rowsToKV(results[i++]);
      var dailyKV    = rowsToKV(results[i++]);
      var cfKV       = rowsToKV(results[i++]);
      var ytdRevenue            = rowsToObjects(results[i++]);
      var weeklyExpectedReceipt = rowsToObjects(results[i++]);
      var monthlyForecast       = rowsToObjects(results[i++]);
      var dailyInv              = rowsToObjects(results[i++]);
      var cfIn                  = rowsToObjects(results[i++]);
      var cfOut                 = rowsToObjects(results[i++]);
      var projects        = rowsToObjects(results[i++]);
      var invoices        = rowsToObjects(results[i++], ['followUps', 'actualReceive']);
      var forecastEntries = rowsToObjects(results[i++]);
      var bankAccounts    = rowsToObjects(results[i++]);
      var pvVouchers      = rowsToObjects(results[i++]);
      var payables        = rowsToObjects(results[i++]);
      // v2 additions
      var debtLedger      = rowsToObjects(results[i++]);
      var receipts        = rowsToObjects(results[i++]);
      var bankEntries     = rowsToObjects(results[i++]);
      var checks          = rowsToObjects(results[i++]);
      var debtMaster      = rowsToObjects(results[i++]);
      var bankTransfers   = rowsToObjects(results[i++]);
      var stsServiceFee   = rowsToObjects(results[i++]);
      var stsPendingCalc  = rowsToObjects(results[i++]);
      var stsCalcResult   = rowsToObjects(results[i++], ['debtIds']);
      var debtEvents      = rowsToObjects(results[i++]);
      var users           = rowsToObjects(results[i++]);
      var cashflowSnapshots = rowsToObjects(results[i++]);
      var followUpsLog      = rowsToObjects(results[i++]);
      var manualOverrides   = rowsToObjects(results[i++]);

      var data = {
        meta: {
          companyName: metaKV.companyName || 'Water POG',
          shortName:   metaKV.shortName   || 'Water POG',
          asOf:        metaKV.asOf        || new Date().toISOString().slice(0, 10),
          year:        num(metaKV.year)   || new Date().getFullYear(),
          currency:    metaKV.currency    || 'THB',
        },
        pipeline: {
          waitingSign:           tryParse(pipelineKV.waitingSign,         { count:0, gross:0, debt:0, net:0 }),
          signedWip:             tryParse(pipelineKV.signedWip,           { count:0, gross:0, debt:0, net:0 }),
          invoicedOutstanding:   tryParse(pipelineKV.invoicedOutstanding, { count:0, gross:0, debt:0, net:0 }),
          totalProjectValue:     num(pipelineKV.totalProjectValue),
          invoiceBroughtForward: num(pipelineKV.invoiceBroughtForward),
          signedNotDelivered:    num(pipelineKV.signedNotDelivered),
          notSigned:             num(pipelineKV.notSigned),
          totalDebt:             num(pipelineKV.totalDebt),
          usableNet:             num(pipelineKV.usableNet),
        },
        warroomP1: {
          topKpis: {
            totalInvoices:       num(wp1KV.topKpis_totalInvoices),
            estimatedCashInflow: num(wp1KV.topKpis_estimatedCashInflow),
            estimatedDebt:       num(wp1KV.topKpis_estimatedDebt),
            netProjection:       num(wp1KV.topKpis_netProjection),
          },
          thisMonthNetProjection: num(wp1KV.thisMonthNetProjection),
          nextMonthNetProjection: num(wp1KV.nextMonthNetProjection),
          outstandingSummary: {
            systemTotal:       tryParse(wp1KV.outstandingSummary_systemTotal,       {}),
            thisMonthTracked:  tryParse(wp1KV.outstandingSummary_thisMonthTracked,  {}),
            nextMonthRollover: tryParse(wp1KV.outstandingSummary_nextMonthRollover, {}),
          },
          outstandingThisMonthByTransfer: tryParse(wp1KV.outstandingThisMonthByTransfer, []),
          outstandingThisMonthTotal:      tryParse(wp1KV.outstandingThisMonthTotal,      {}),
          outstandingByTransfer:          tryParse(wp1KV.outstandingByTransfer,          []),
          outstandingTotal:               tryParse(wp1KV.outstandingTotal,               {}),
          wipByTransfer:                  tryParse(wp1KV.wipByTransfer,                  []),
          wipTotal:                       tryParse(wp1KV.wipTotal,                       {}),
        },
        warroomP2: {
          totalProjectValue:   num(wp2KV.totalProjectValue),
          invoiceForwardTotal: num(wp2KV.invoiceForwardTotal),
          wipValue:            num(wp2KV.wipValue),
          unsignedTotal:       tryParse(wp2KV.unsignedTotal, {}),
          signedTotal:         tryParse(wp2KV.signedTotal,   {}),
        },
        ytdRevenue:            ytdRevenue,
        weeklyExpectedReceipt: weeklyExpectedReceipt,
        monthlyForecast:       monthlyForecast,
        daily: {
          asOfDate:   dailyKV.asOfDate || '',
          ytdAccum:   tryParse(dailyKV.ytdAccum,   {}),
          mtdAccum:   tryParse(dailyKV.mtdAccum,   {}),
          todayAccum: tryParse(dailyKV.todayAccum, {}),
          invoicesToday: dailyInv,
        },
        cashFlow: {
          month:        cfKV.month || '',
          bf:           num(cfKV.bf),
          planTotal:    num(cfKV.planTotal),
          actualPaid:   num(cfKV.actualPaid),
          paidPct:      num(cfKV.paidPct),
          revInflow:    num(cfKV.revInflow),
          loanReceived: num(cfKV.loanReceived),
          loanLine:     num(cfKV.loanLine),
          loanRemain:   num(cfKV.loanRemain),
          finalNet:     num(cfKV.finalNet),
          nowWeek:      num(cfKV.nowWeek),
          closing:      tryParse(cfKV.closing, []),
          inflow:  cfIn.map(function (r) { return { key:r.key, label:r.label, actual:tryParse(r.actual, []), plan:tryParse(r.plan, []) }; }),
          outflow: cfOut.map(function (r) { return { key:r.key, label:r.label, actual:tryParse(r.actual, []), plan:tryParse(r.plan, []) }; }),
        },
        projects:        projects,
        invoices:        invoices,
        forecastEntries: forecastEntries,
        bankAccounts:    bankAccounts,
        pvVouchers:      pvVouchers,
        payables:        payables,
        // v2 additions
        debtLedger:      debtLedger,
        receipts:        receipts,
        bankEntries:     bankEntries,
        checks:          checks,
        debtMaster:      debtMaster,
        bankTransfers:   bankTransfers,
        stsServiceFee:   stsServiceFee,
        stsPendingCalc:  stsPendingCalc,
        stsCalcResult:   stsCalcResult,
        debtEvents:      debtEvents,
        users:           users,
        cashflowSnapshots: cashflowSnapshots,
        followUpsLog:      followUpsLog,
        manualOverrides:   manualOverrides,
      };

      // Anti-bounce guard: ถ้า entity มี edit ค้าง (ยังไม่ push) หรือเพิ่ง push
      // ภายใน grace window → คงค่า local ไว้ ไม่เอา CSV (ที่อาจ stale) มาทับ
      // ส่วน entity ที่ไม่มีอะไรค้าง → รับค่าชีต + preserve app-only fields ตามเดิม
      try {
        var localData = WTPData.load();
        CRUD_ENTITIES.forEach(function (e) {
          if (!Array.isArray(data[e])) return;
          // anti-flip: ใน auto-load จะรับค่า server ก็ต่อเมื่อ "นิ่ง" (อ่านได้ซ้ำรอบก่อน)
          var stable = autoReadGate(e, JSON.stringify(data[e]), isAuto);
          var g = applyEntityGuard(e, data[e], localData);
          if (g.accepted && !stable && !g.recovered) {
            // server อยากให้รับค่าใหม่ แต่ค่ายังไม่นิ่ง (cache flap) + ไม่มี edit ค้าง
            // → คงค่าที่แสดงอยู่รอบก่อน กัน "ยอดเด้ง" (ไม่ขยับ snapshot, รอยืนยันรอบหน้า)
            // ★ ยกเว้น recovered (anti-wedge) → ต้องรับทันที ไม่ต้องรอนิ่ง กันค้าง
            if (cachedServerData && cachedServerData[e] !== undefined) data[e] = cachedServerData[e];
            return;
          }
          data[e] = g.rows;
          if (g.accepted) lastSnapshot[e] = JSON.stringify(g.rows);
          // ถ้า !accepted (มี edit ค้าง/เพิ่ง push) → ไม่ขยับ snapshot + คงค่า local (กันงานหาย)
        });
      } catch (_) {
        // fallback: localStorage parse พัง → ตั้ง snapshot ตามชีตแบบเดิม
        CRUD_ENTITIES.forEach(function (e) {
          lastSnapshot[e] = JSON.stringify(data[e] || []);
        });
      }
      cachedServerData = data;
      serverDataLoaded = true;
      origSave(data);                                    // persist to localStorage (skip syncDiff)
      subscribers.forEach(function (cb) { cb(data); });  // notify React
      setSyncStatus('ok');
    }).catch(function (err) {
      console.warn('[WTP Sync] โหลดข้อมูลล้มเหลว:', err);
      setSyncStatus('error');
    });
  }

  /* ── anti-bounce guard helper ─────────────────────────────────────
   * ตัดสินว่า entity นี้ควร "รับค่าจากชีต" หรือ "คงค่า local" ตอนโหลด
   *   - มี edit ค้าง (local != snapshot ที่ push ล่าสุด) → คงค่า local (รอ push)
   *   - เพิ่ง push สำเร็จภายใน GRACE_MS → คงค่า local (กัน CSV เก่าทับ)
   *   - อื่น ๆ → รับค่าชีต + preserve app-only fields
   * คืน { rows, accepted } ; accepted=true แปลว่าให้ caller อัป snapshot ตามชีตได้
   */
  function clearableOf(entity) {
    var clr = {};
    (CLEARABLE_FIELDS[entity] || []).forEach(function (k) { clr[k] = true; });
    return clr;
  }
  function applyEntityGuard(entity, sheetRows, localData) {
    var localRows = localData && localData[entity];
    var snap = lastSnapshot[entity];
    var hasPending = snap !== undefined &&
                     JSON.stringify(Array.isArray(localRows) ? localRows : []) !== snap;
    var inGrace = recentPushAt[entity] && (Date.now() - recentPushAt[entity] < GRACE_MS);

    // ── ANTI-WEDGE: local เล็กกว่า server มากผิดปกติ (>50%) → local "เพี้ยน" ไม่ใช่ edit จริง ──
    // อาการ wedge: ครั้งหนึ่ง state ถูกตั้งค่าแถวน้อยผิดปกติ (truncated read / stale-closure ทับ /
    // หน้าจอ crash ค้างค่าเก่า) แล้ว hasPending ทำให้ "คงค่า local" ตลอด (ไม่ยอมรับ server ที่ครบ)
    // + ฝั่ง push เจอ SAFETY GUARD บล็อก (rows ลด >50%) → วนค้าง: ผู้ใช้เพิ่มอะไรก็ไม่ติด เด้งกลับทุกครั้ง.
    // เซิร์ฟเวอร์เป็น source of truth (replaceAll มี base-reconcile กันชีตหาย >50% อยู่แล้ว) →
    // ทิ้ง local ที่เพี้ยน รับค่า server ทันที (recovered=true ให้ caller ข้าม anti-flip ด้วย) กันค้าง.
    var corruptLocal = Array.isArray(localRows) && localRows.length > 0 &&
                       Array.isArray(sheetRows) && sheetRows.length >= 10 &&
                       localRows.length < sheetRows.length * 0.5;
    if (corruptLocal) {
      console.warn('[WTP Sync] ⚠ anti-wedge: local ' + entity + ' (' + localRows.length +
        ' แถว) เล็กกว่า server (' + sheetRows.length + ' แถว) มากผิดปกติ — ถือว่า local เพี้ยน, ' +
        'รับค่าจากชีตแทน (กันค้าง wedge)');
      try {
        window.dispatchEvent(new CustomEvent('wtpSyncRecovered', {
          detail: { entity: entity, from: localRows.length, to: sheetRows.length }
        }));
      } catch (_) {}
      return {
        rows: preserveAppOnlyFields(sheetRows, localRows, clearableOf(entity)),
        accepted: true, recovered: true,
      };
    }

    if ((hasPending || inGrace) && Array.isArray(localRows)) {
      // protected → คงค่า local ที่กำลังจะ/เพิ่ง push ไว้ ไม่ให้ stale CSV ทับ
      return { rows: localRows, accepted: false };
    }
    var merged = Array.isArray(localRows)
      ? preserveAppOnlyFields(sheetRows, localRows, clearableOf(entity))
      : sheetRows;
    return { rows: merged, accepted: true };
  }

  /* ── HOT refresh: ดึงเฉพาะ CRUD entity (ไม่ดึงแท็บ cold) ───────────
   * ใช้ใน auto-refresh ส่วนใหญ่เพื่อลดจำนวน request → ลด 429
   * แท็บ cold (สรุป/derived) ยังอยู่จาก cachedServerData รอบก่อน */
  function refreshHotEntities() {
    if (!cachedServerData) return loadFromServer();  // ยังไม่มี base → full load
    setSyncStatus('syncing');
    return mapLimit(CRUD_ENTITIES, SHEET_FETCH_CONC, function (n) { return fetchSheet(n); }).then(function (settled) {
      // per-entity fallback: แท็บที่พัง → คงค่าเดิมจาก cache, แท็บที่โหลดได้ → อัปเดตปกติ
      // (ไม่ทิ้งทั้งรอบ — แท็บเดียวชน 429 จะได้ไม่บล็อกแท็บอื่นที่โหลดสำเร็จ)
      var failed = [];
      settled.forEach(function (s, idx) {
        if (s.status === 'rejected') failed.push(CRUD_ENTITIES[idx]);
      });
      if (failed.length) {
        console.warn('[WTP Sync] hot refresh: ' + failed.length + ' แท็บชน 429 — คงค่าเดิม, แท็บอื่นอัปเดตปกติ:',
          failed.join(', '));
      }
      var localData = null;
      try { localData = WTPData.load(); } catch (_) {}
      var data = Object.assign({}, cachedServerData);  // คง cold tab + แท็บที่พัง จาก cache
      CRUD_ENTITIES.forEach(function (e, idx) {
        if (settled[idx].status !== 'fulfilled') return;  // ★ ชีตนี้พัง → คงค่าเดิม (ไม่ทับ)
        var jsonFields = ENTITY_JSON_FIELDS[e] || null;
        var sheetRows = rowsToObjects(settled[idx].value, jsonFields);
        // anti-flip: hot poll รับค่า server ก็ต่อเมื่อ "นิ่ง" (อ่านได้ซ้ำรอบก่อน) — กันยอดเด้งจาก gviz cache ไม่ sync
        var stable = autoReadGate(e, JSON.stringify(sheetRows), true);
        var g = applyEntityGuard(e, sheetRows, localData);
        if (g.accepted && !stable && !g.recovered) return;  // ค่ายังไม่นิ่ง + ไม่มี edit ค้าง → คงค่าเดิม (recovered=anti-wedge รับทันที)
        data[e] = g.rows;
        if (g.accepted) lastSnapshot[e] = JSON.stringify(g.rows);
      });
      cachedServerData = data;
      serverDataLoaded = true;
      origSave(data);
      subscribers.forEach(function (cb) { cb(data); });
      setSyncStatus('ok');
    });
  }

  /* ── WRITE: POST to Apps Script ──────────────────────────────────── */
  function postToServer(body) {
    if (!POST_URL) return Promise.reject(new Error('APPS_SCRIPT_URL not configured'));
    return fetch(POST_URL, {
      method: 'POST',
      // text/plain avoids CORS preflight; Apps Script reads body as plain text and JSON.parse it
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
    }).then(function (r) { return r.json(); });
  }

  // Pull current session info — populated by app.jsx login flow.
  // Used to stamp who-did-what on every write so Apps Script can log it.
  function _currentMeta(entity, oldRows, newRows) {
    var sess = null;
    try { sess = JSON.parse(localStorage.getItem('wtp-session') || 'null'); } catch (_) {}
    var oldCount = (oldRows && oldRows.length) || 0;
    var newCount = (newRows && newRows.length) || 0;
    var delta    = newCount - oldCount;
    var summary  = entity + ': ' + oldCount + ' → ' + newCount + ' rows' +
                   (delta === 0 ? ' (edits only)' : ' (' + (delta > 0 ? '+' : '') + delta + ')');
    return {
      user:        (sess && sess.username) || 'unknown',
      displayName: (sess && sess.displayName) || '',
      role:        (sess && sess.role) || '',
      diffSummary: summary,
    };
  }

  function pushEntity(entity, rows, oldRows) {
    // baseIds = id ที่ "เคยเห็นบนชีตตอนโหลดล่าสุด" (จาก snapshot ก่อนแก้) — ส่งไปให้
    // เซิร์ฟเวอร์ทำ base reconcile: แถวในชีตที่ไม่อยู่ทั้งใน payload และ baseIds จะถูก
    // เก็บไว้ ไม่ลบ → กันข้อมูลที่ client ยังไม่เห็นถูก replaceAll ลบทิ้ง (ดู Code.standalone.gs)
    var baseIds = (oldRows || []).map(function (r) { return r && r.id; })
                                 .filter(function (x) { return x != null && x !== ''; });
    return postToServer({
      action: 'replaceAll',
      entity: entity,
      payload: rows,
      baseIds: baseIds,
      meta: _currentMeta(entity, oldRows, rows),
    }).then(function (resp) {
      if (resp && resp.error) throw new Error(entity + ': ' + resp.error);
      return resp;
    });
  }

  /* ── Merge helper: prefer non-empty Sheet values for fields empty in app ──
   * Protects against the "replaceAll overwrites manual Sheet edits" bug:
   * if the user fills a cell in the Sheet (e.g. docno for APS/APV) but the
   * app's in-memory row has that field empty, replaceAll would wipe it. This
   * merge keeps the Sheet's value whenever the app's value is null/empty.
   */
  function mergeRowKeepSheetForEmpty(appRow, sheetRow, clearable) {
    if (!sheetRow) return appRow;
    var skip = clearable || {};
    var result = Object.assign({}, appRow);
    Object.keys(sheetRow).forEach(function (k) {
      if (skip[k]) return;  // clearable field → trust app value (allow intentional clear)
      var appVal = result[k];
      var sheetVal = sheetRow[k];
      var appEmpty = appVal == null || appVal === '';
      var sheetHasVal = sheetVal != null && sheetVal !== '';
      if (appEmpty && sheetHasVal) result[k] = sheetVal;
    });
    // Also include sheet-only keys (in case app doesn't have those fields at all)
    Object.keys(sheetRow).forEach(function (k) {
      if (skip[k]) return;  // ห้ามดึง clearable field กลับมา แม้ app ลบ key ทิ้งทั้งตัว (เช่น ล้าง override)
      if (!(k in result)) result[k] = sheetRow[k];
    });
    return result;
  }

  /* ── Preserve app-only fields (fields present in localStorage but NOT in sheet)
   * Use case: app adds new fields (e.g. invType on receipts) before the user
   * adds the matching column in the Sheet. Without this, loadFromServer would
   * wipe those edits every time it runs.
   * Match strategy per entity: try id → receiptNo → ivNo → invoiceNo → fallback
   * to position. */
  function rowKey(r) {
    return r.id || r.receiptNo || r.ivNo || r.invoiceNo || null;
  }
  function preserveAppOnlyFields(sheetRows, localRows, clearable) {
    if (!localRows || !localRows.length) return sheetRows;
    var skip = clearable || {};
    var localByKey = {};
    localRows.forEach(function (r) { var k = rowKey(r); if (k) localByKey[k] = r; });
    return sheetRows.map(function (sr) {
      var k = rowKey(sr);
      var lr = k && localByKey[k];
      if (!lr) return sr;
      var merged = Object.assign({}, sr);
      Object.keys(lr).forEach(function (key) {
        // clearable field → ชีต (server) เป็นความจริง: ค่าว่าง = ถูกล้างตั้งใจ ห้ามฟื้นจาก local
        // (ไม่งั้น "ล้างวันจ่าย/override" จะเด้งกลับทุกครั้งที่โหลด)
        if (skip[key]) return;
        var srVal = sr[key];
        var srHasVal = srVal != null && srVal !== '';
        var lrVal   = lr[key];
        var lrHasVal = lrVal != null && lrVal !== '';
        // Use local value when sheet has nothing meaningful in that cell —
        // covers both "column missing entirely" and "column exists but empty"
        if (!srHasVal && lrHasVal) merged[key] = lrVal;
      });
      return merged;
    });
  }

  /* ── 3-way merge (base / ours / theirs) ──────────────────────────────
   * แก้บั๊ก multi-writer clobber: เดิม mergeRowKeepSheetForEmpty ใช้ค่าแอป
   * (ของเรา) ชนะทุก field ที่ "ไม่ว่าง" → ถ้าคนอื่นเพิ่งแก้ field เดียวกันในชีต
   * ระหว่างที่เราเปิดหน้าค้างไว้ การ replaceAll จะเขียนทับงานของเขาหายเงียบ
   * (followUps หาย, status เด้งกลับ).
   *
   * 3-way merge ตัดสินจาก "ใครเป็นคนแก้จริง" เทียบกับ base (snapshot ที่เรา
   * เห็นล่าสุดก่อนแก้):
   *   - field ที่เราแก้ (ours != base)            → ใช้ของเรา
   *   - field ที่เราไม่แตะ แต่เขาแก้ (theirs != base) → ใช้ของเขา (ค่าสดจากชีต)
   *   - แถวที่คนอื่นเพิ่งเพิ่ม (อยู่ในชีต ไม่อยู่ใน base) → คงไว้ ไม่ลบทิ้ง
   *   - แถวที่เราลบ (อยู่ใน base+ชีต ไม่อยู่ในของเรา) → ลบจริง เว้นแต่คนอื่น
   *     เพิ่งแก้แถวนั้น (theirs != base) ให้คงของเขาไว้ กันลบทับงานเขา
   */
  function _eq(a, b) {
    try { return JSON.stringify(a) === JSON.stringify(b); }
    catch (_) { return a === b; }
  }
  function mergeRowFields(base, ours, theirs, clearable) {
    var skip = clearable || {};
    var result = Object.assign({}, ours);
    var keys = {};
    [base, ours, theirs].forEach(function (o) {
      if (o) Object.keys(o).forEach(function (k) { keys[k] = true; });
    });
    Object.keys(keys).forEach(function (k) {
      if (skip[k]) return; // clearable → เชื่อค่าแอปเสมอ (อนุญาตให้ล้างตั้งใจ)
      var weChanged   = !_eq(ours[k], base ? base[k] : undefined);
      var theyChanged = !_eq(theirs[k], base ? base[k] : undefined);
      // เราไม่แก้ field นี้ แต่เขาแก้ → เอาค่าสดของเขา
      if (!weChanged && theyChanged) { result[k] = theirs[k]; return; }
      // ★ ANTI-WIPE: ห้ามให้ "ค่าว่างฝั่งเรา" ลบ "ค่าที่ชีตมีอยู่" (เว้น field ที่ clearable)
      //   กันบั๊ก: user เติมเลขบัญชีในชีต แล้วแอป push pvVouchers ที่ Bank_AC ว่างทับ → หาย
      //   หลักการเดียวกับฝั่งอ่าน (mergeRowKeepSheetForEmpty): เซลล์ว่าง = ไม่มีสิทธิ์ลบของจริง
      var oursEmpty = result[k] == null || result[k] === '';
      var theirsHas = theirs[k] != null && theirs[k] !== '';
      if (oursEmpty && theirsHas) result[k] = theirs[k];
      // กรณีอื่น (เราแก้จริง / ไม่มีใครแก้) → คงของเรา
    });
    return result;
  }
  function threeWayMergeRows(base, ours, theirs, clearable) {
    var baseById = {}, theirsById = {}, ourIds = {};
    (base   || []).forEach(function (r) { if (r && r.id != null) baseById[r.id]   = r; });
    (theirs || []).forEach(function (r) { if (r && r.id != null) theirsById[r.id] = r; });
    var out = [];
    (ours || []).forEach(function (o) {
      if (o == null) return;
      if (o.id == null) { out.push(o); return; } // ไม่มี id → จับคู่ไม่ได้ คงของเรา
      ourIds[o.id] = true;
      var b = baseById[o.id], t = theirsById[o.id];
      if (!b) { out.push(o); return; }            // แถวใหม่ที่เราสร้าง
      if (!t) {                                    // คนอื่นลบแถวนี้ไปจากชีต
        if (!_eq(o, b)) out.push(o);               // เราแก้ → คงของเราไว้ (ไม่ให้ลบกลืน)
        return;                                    // เราไม่แตะ → ยอมรับการลบของเขา
      }
      out.push(mergeRowFields(b, o, t, clearable));
    });
    // แถวที่อยู่ในชีตแต่ไม่อยู่ในของเรา
    (theirs || []).forEach(function (t) {
      if (t == null || t.id == null || ourIds[t.id]) return;
      var b = baseById[t.id];
      if (!b) { out.push(t); return; }             // คนอื่นเพิ่งเพิ่ม → คงไว้
      if (!_eq(t, b)) out.push(t);                 // เราลบ แต่เขาแก้ → คงของเขา
      // เราลบ และเขาไม่แตะ → ลบจริง (ไม่ push)
    });
    return out;
  }

  function syncDiff(data) {
    if (!POST_URL) return;
    if (inSyncDiff) return;

    var changes = [];
    CRUD_ENTITIES.forEach(function (entity) {
      // ★ gate รายตาราง: ห้าม push entity ที่ "ยังไม่เคยโหลดจากเซิร์ฟเวอร์สำเร็จ"
      //   (lastSnapshot ยัง undefined) — กันการดันสำเนา local/seed ทับชีตทั้งที่ยังไม่รู้
      //   ของจริง. พอโหลดสำเร็จแม้เป็น [] snapshot จะเป็น '[]' (ไม่ใช่ undefined) แล้ว
      if (lastSnapshot[entity] === undefined) return;
      var curr = JSON.stringify(data[entity] || []);
      if (curr !== lastSnapshot[entity]) {
        changes.push({ entity: entity, currentRows: data[entity] || [] });
      }
    });
    if (!changes.length) return;

    // ── SAFETY GUARD: ห้าม push ถ้า rows น้อยกว่า snapshot เกินครึ่ง ──
    // ป้องกัน race condition ที่ทำให้ app push state เก่า → ชีตหายเป็นจำนวนมาก
    // ถ้าจะลบจริงๆ user ต้องลบทีละน้อยให้ delta ค่อยๆ ลดลง
    var blocked = [];
    var allowed = [];
    changes.forEach(function (c) {
      var prevRows = [];
      try { prevRows = JSON.parse(lastSnapshot[c.entity] || '[]'); } catch (_) {}
      var prevCount = prevRows.length;
      var newCount  = c.currentRows.length;
      // ถ้า snapshot เคยมี ≥10 rows AND ใหม่น้อยกว่าครึ่ง → block
      if (prevCount >= 10 && newCount < prevCount * 0.5) {
        blocked.push({ entity: c.entity, prev: prevCount, now: newCount });
      } else {
        allowed.push(c);
      }
    });
    if (blocked.length) {
      console.error('[WTP Sync] 🛑 ห้าม push: ตรวจพบจะลด rows มากผิดปกติ — น่าจะเป็น race condition',
        blocked.map(function(b){ return b.entity + ': ' + b.prev + ' → ' + b.now; }).join(' · '));
      setSyncStatus('error');
      // ★ แจ้งผู้ใช้ให้เห็น (เดิมขึ้นแค่ console → ผู้ใช้นึกว่าบันทึกไม่ติด เลยทำซ้ำหลายรอบ)
      try {
        window.dispatchEvent(new CustomEvent('wtpSyncBlocked', { detail: { blocked: blocked.slice() } }));
      } catch (_) {}
      // ★ auto-recover: ถ้า "ทั้งรอบ" ถูกบล็อก → ดึงของจริงจากชีตมาตั้งต้นใหม่ (anti-wedge ใน
      //   applyEntityGuard จะทิ้ง local ที่เพี้ยนเล็กผิดปกติ แล้วรับ server) กันค้าง "เพิ่มอะไรก็ไม่ติด"
      if (!allowed.length) { setTimeout(function () { loadFromServer(); }, 0); return; }
    }
    changes = allowed;
    if (!changes.length) return;

    inSyncDiff = true;
    setSyncStatus('syncing');

    // Capture pre-change snapshots for audit log BEFORE step 3 overwrites them
    var preSnapshots = {};
    changes.forEach(function (c) {
      try { preSnapshots[c.entity] = JSON.parse(lastSnapshot[c.entity] || '[]'); }
      catch (_) { preSnapshots[c.entity] = []; }
    });

    // STEP 1: Re-fetch the Sheet for each changed entity (safety check).
    // Prevents stale empty values in the app from overwriting fresh manual
    // edits the user made directly in the Sheet.
    Promise.all(changes.map(function (c) {
      var jsonFields = ENTITY_JSON_FIELDS[c.entity] || null;
      return fetchSheet(c.entity).then(function (rows) {
        return {
          entity: c.entity,
          sheetRows: rowsToObjects(rows, jsonFields),
          currentRows: c.currentRows,
        };
      }, function (err) {
        // re-fetch ล้มเหลว (เช่น HTTP 429 rate-limit) — เดิม Promise.all จะ reject
        // ทำให้ push ทั้งรอบถูกยกเลิก → การแก้/ล้างของ user หายเงียบ + เด้งกลับรอบหน้า
        // แทนที่จะยกเลิก: push currentRows ตรงๆ (ข้าม safety-merge เฉพาะ entity นี้รอบนี้)
        console.warn('[WTP Sync] re-fetch ' + c.entity + ' ล้มเหลว — push ตรงๆ ไม่ merge รอบนี้:', err);
        return { entity: c.entity, sheetRows: null, currentRows: c.currentRows };
      });
    })).then(function (fetched) {
      // STEP 2: 3-way merge (base=preSnapshot / ours=app / theirs=sheet).
      // กันงานของ writer คนอื่นถูกเขียนทับ: field ที่เราไม่ได้แก้ ให้ค่าสดจากชีต
      // ชนะ, แถวที่คนอื่นเพิ่งเพิ่มก็คงไว้ไม่ลบทิ้ง (ดู threeWayMergeRows)
      var safeChanges = fetched.map(function (f) {
        // ★ re-fetch fail (เช่น 429) → ข้าม entity นี้รอบนี้ ไม่ push (กัน push ทับแบบไม่ merge
        //   ที่อาจลบงานของ writer คนอื่น เช่น เลขบัญชีที่เพิ่งเติมในชีต) — รอ retry รอบหน้า
        if (!f.sheetRows) {
          console.warn('[WTP Sync] re-fetch ' + f.entity + ' ล้มเหลว — ข้าม push รอบนี้ retry รอบหน้า (กันทับงานในชีต)');
          return null;
        }
        var clearable = {};
        (CLEARABLE_FIELDS[f.entity] || []).forEach(function (k) { clearable[k] = true; });
        var base = preSnapshots[f.entity] || [];
        var merged = threeWayMergeRows(base, f.currentRows, f.sheetRows, clearable);
        return { entity: f.entity, rows: merged };
      }).filter(Boolean);

      // STEP 3: Update localStorage + notify React with merged data.
      // ★ ยังไม่อัป lastSnapshot ตรงนี้ — รอจน push สำเร็จก่อน (STEP 5)
      //   ไม่งั้นถ้า push ล้มเหลว snapshot จะเลื่อนทั้งที่ขึ้นชีตไม่สำเร็จ →
      //   syncDiff รอบหน้าเห็นว่า "ไม่มีอะไรเปลี่ยน" → ไม่ retry → ข้อมูลเด้งกลับ
      var mergedData = Object.assign({}, data);
      safeChanges.forEach(function (c) {
        mergedData[c.entity] = c.rows;
      });
      origSave(mergedData);
      subscribers.forEach(function (cb) { cb(mergedData); });

      // STEP 4: Push merged data to Sheet (with audit metadata — old vs new row counts)
      return Promise.all(safeChanges.map(function (c) {
        return pushEntity(c.entity, c.rows, preSnapshots[c.entity] || []);
      })).then(function () {
        // STEP 5: push สำเร็จแล้วเท่านั้น จึงค่อยอัป snapshot ให้ตรงกับชีต
        // + stamp recentPushAt เพื่อเปิด grace window กัน CSV เก่าเด้งทับ (anti-bounce)
        safeChanges.forEach(function (c) {
          lastSnapshot[c.entity] = JSON.stringify(c.rows);
          recentPushAt[c.entity] = Date.now();
        });
      });
    }).then(function () {
      setSyncStatus('ok');
    }).catch(function (err) {
      console.warn('[WTP Sync] push ล้มเหลว:', err);
      setSyncStatus('error');
    }).then(function () {
      inSyncDiff = false;
    }, function () {
      inSyncDiff = false;
    });
  }

  /* ── wrap WTPData.save to auto-push on every change ──────────────── */
  var origSave = WTPData.save;
  WTPData.save = function (data) {
    origSave(data);
    // Don't push the initial localStorage state — wait until server data has
    // arrived (otherwise we'd overwrite the Sheet with stale local data).
    if (!serverDataLoaded) return;
    // Skip if we're already inside syncDiff (prevents re-entrant loops when
    // syncDiff calls subscribers, which might trigger React → setData → save).
    if (inSyncDiff) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function () { syncDiff(data); }, 3000);
  };

  /* ── subscribe (for React) ───────────────────────────────────────── */
  WTPData.subscribe = function (cb) {
    subscribers.push(cb);
    // Replay cached data to late subscribers (fast cached fetches can resolve
    // before React's useEffect registers — without this, React stays stuck
    // on initial localStorage data).
    if (cachedServerData) {
      setTimeout(function () { cb(cachedServerData); }, 0);
    }
    return function () {
      subscribers = subscribers.filter(function (s) { return s !== cb; });
    };
  };

  WTPData.getSyncStatus = function () {
    return {
      status: syncStatus,
      time: lastSyncTime,
      lastError: lastSyncError,
      failedSheets: failedSheets.slice(),
      consecutiveFails: consecutiveFails,
      currentInterval: currentInterval,
    };
  };

  // forceSyncNow: bypass debounce — push pending changes immediately.
  // Call from save handlers ที่ user-triggered (กดปุ่มบันทึก) เพื่อไม่ให้ข้อมูล
  // หายถ้า user refresh ก่อน debounce timer ครบ 3 วินาที
  WTPData.forceSyncNow = function (data) {
    if (!serverDataLoaded) return;
    if (inSyncDiff) return;
    if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
    // data param optional — use latest from localStorage if not provided
    var d = data || WTPData.load();
    syncDiff(d);
  };

  // Flush pending sync on page unload (best-effort, may not complete)
  window.addEventListener('beforeunload', function () {
    if (syncTimer && !inSyncDiff) {
      clearTimeout(syncTimer);
      try { syncDiff(WTPData.load()); } catch (_) {}
    }
  });

  // First load
  loadFromServer();

  // Auto-refresh (ใช้ restartAutoTimer เพื่อให้ adaptive backoff ทำงานได้)
  if (AUTO_MS > 0) {
    currentInterval = AUTO_MS;
    restartAutoTimer();
  }

  // ── Page Visibility — กลับมาที่ tab → sync ทันทีถ้าค้างเกิน 10 วินาที
  // (กัน user เปิด tab ค้างไว้ครึ่งวันแล้วเปิดมาเห็นข้อมูลเก่า)
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) return;
    var sinceLastOk = lastSyncTime ? (Date.now() - lastSyncTime.getTime()) : Infinity;
    if (sinceLastOk > 10000) {
      console.info('[WTP Sync] กลับมาที่ tab — refresh ทันที (last ok:', Math.round(sinceLastOk / 1000), 'วินาทีก่อน)');
      loadFromServer();
    }
  });

  // Expose manual refresh
  WTPData.refreshFromServer = loadFromServer;

  // Diagnostic: fetch raw rows from a specific Sheet tab, optionally filter by predicate.
  // Useful to verify what the Sheet actually contains vs what the app shows.
  WTPData.fetchSheetRows = function (entity, predicate) {
    return fetchSheet(entity).then(function (rows) {
      var jsonFields = ENTITY_JSON_FIELDS[entity] || null;
      var objs = rowsToObjects(rows, jsonFields);
      return predicate ? objs.filter(predicate) : objs;
    });
  };

  // Diagnostic: fetch RAW header+row pairs (position-preserving, includes duplicates).
  // Returns { headers: [...], row: [...] } for the first row matching predicate.
  // This bypasses rowsToObjects so duplicate headers are visible.
  WTPData.fetchSheetRowRaw = function (entity, matchCol, matchVal) {
    return fetchSheet(entity).then(function (rows) {
      if (!rows.length) return null;
      var headers = rows[0];
      var colIdx = headers.indexOf(matchCol);
      if (colIdx < 0) return { headers: headers, row: null, error: 'ไม่พบคอลัมน์ ' + matchCol };
      for (var i = 1; i < rows.length; i++) {
        if (rows[i][colIdx] === matchVal) {
          return { headers: headers, row: rows[i] };
        }
      }
      return { headers: headers, row: null };
    });
  };

})();
