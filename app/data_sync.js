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
  var CRUD_ENTITIES = ['projects', 'projectFinance', 'invoices', 'forecastEntries',
                       'bankAccounts', 'pvVouchers', 'payables',
                       'debtLedger', 'receipts', 'bankEntries', 'checks',
                       'debtMaster', 'bankTransfers',
                       'stsServiceFee', 'stsPendingCalc', 'stsCalcResult'];

  // jsonFields per entity — for proper rowsToObjects parsing during safety re-fetch
  var ENTITY_JSON_FIELDS = {
    invoices:      ['followUps', 'actualReceive'],
    stsCalcResult: ['debtIds'],
    debtMaster:    ['drawdowns','repayments'],
  };

  /* ── state ──────────────────────────────────────────────────────── */
  var subscribers      = [];
  var syncStatus       = 'syncing';
  var lastSyncTime     = null;
  var cachedServerData = null;
  var lastSnapshot     = {};            // last known server state per entity (JSON)
  var serverDataLoaded = false;         // gate auto-push until first server read
  var syncTimer        = null;          // debounce timer for syncDiff
  var inSyncDiff       = false;         // re-entry guard for syncDiff
  var AUTO_MS          = cfg.AUTO_REFRESH_MS || 0;

  function setSyncStatus(s) {
    syncStatus = s;
    lastSyncTime = (s === 'ok') ? new Date() : lastSyncTime;
    window.dispatchEvent(new CustomEvent('wtpSyncStatus', {
      detail: { status: s, time: lastSyncTime }
    }));
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
    var headers = rows[0];

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
        // Don't let an empty value overwrite a previously-set non-empty value.
        // Handles duplicate column headers (e.g. two columns named `docno` where
        // only one has data) — keeps the populated one as the canonical value.
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
  function fetchSheet(name) {
    // Add cache-busting timestamp so we always get the latest Sheet state.
    // Without this, Google's gviz endpoint may serve stale CSV for several minutes.
    var url = BASE + encodeURIComponent(name) + '&_t=' + Date.now();
    return fetch(url, { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error(name + ': HTTP ' + r.status);
        return r.text();
      })
      .then(parseCSV)
      .catch(function (err) {
        console.warn('[WTP Sync] ดึงชีต', name, 'ล้มเหลว:', err.message);
        return [];
      });
  }

  /* ── load all sheets in parallel + assemble data structure ───────── */
  function loadFromServer() {
    setSyncStatus('syncing');

    var sheetOrder = [
      'meta', 'pipeline', 'warroomP1', 'warroomP2', 'daily', 'cashFlow',
      'ytdRevenue', 'weeklyExpectedReceipt', 'monthlyForecast',
      'daily_invoicesToday', 'cf_inflow', 'cf_outflow',
      'projects', 'projectFinance', 'invoices', 'forecastEntries',
      'bankAccounts', 'pvVouchers', 'payables',
      // v2 additions
      'debtLedger', 'receipts', 'bankEntries', 'checks',
      'debtMaster', 'bankTransfers',
      'stsServiceFee', 'stsPendingCalc', 'stsCalcResult',
    ];

    return Promise.all(sheetOrder.map(fetchSheet)).then(function (results) {
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
      var projectFinance  = rowsToObjects(results[i++]);
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
      var debtMaster      = rowsToObjects(results[i++], ['drawdowns','repayments']);
      var bankTransfers   = rowsToObjects(results[i++]);
      var stsServiceFee   = rowsToObjects(results[i++]);
      var stsPendingCalc  = rowsToObjects(results[i++]);
      var stsCalcResult   = rowsToObjects(results[i++], ['debtIds']);

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
        projectFinance:  projectFinance,
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
      };

      // Cache snapshots so the next save doesn't re-push unchanged entities
      CRUD_ENTITIES.forEach(function (e) {
        lastSnapshot[e] = JSON.stringify(data[e] || []);
      });
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

  function pushEntity(entity, rows) {
    return postToServer({ action: 'replaceAll', entity: entity, payload: rows })
      .then(function (resp) {
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
  function mergeRowKeepSheetForEmpty(appRow, sheetRow) {
    if (!sheetRow) return appRow;
    var result = Object.assign({}, appRow);
    Object.keys(sheetRow).forEach(function (k) {
      var appVal = result[k];
      var sheetVal = sheetRow[k];
      var appEmpty = appVal == null || appVal === '';
      var sheetHasVal = sheetVal != null && sheetVal !== '';
      if (appEmpty && sheetHasVal) result[k] = sheetVal;
    });
    // Also include sheet-only keys (in case app doesn't have those fields at all)
    Object.keys(sheetRow).forEach(function (k) {
      if (!(k in result)) result[k] = sheetRow[k];
    });
    return result;
  }

  function syncDiff(data) {
    if (!POST_URL) return;
    if (inSyncDiff) return;

    var changes = [];
    CRUD_ENTITIES.forEach(function (entity) {
      var curr = JSON.stringify(data[entity] || []);
      if (curr !== lastSnapshot[entity]) {
        changes.push({ entity: entity, currentRows: data[entity] || [] });
      }
    });
    if (!changes.length) return;

    inSyncDiff = true;
    setSyncStatus('syncing');

    // STEP 1: Re-fetch the Sheet for each changed entity (safety check).
    // Prevents stale empty values in the app from overwriting fresh manual
    // edits the user made directly in the Sheet.
    Promise.all(changes.map(function (c) {
      return fetchSheet(c.entity).then(function (rows) {
        var jsonFields = ENTITY_JSON_FIELDS[c.entity] || null;
        return {
          entity: c.entity,
          sheetRows: rowsToObjects(rows, jsonFields),
          currentRows: c.currentRows,
        };
      });
    })).then(function (fetched) {
      // STEP 2: Merge — preserve Sheet's non-empty values for empty app fields
      var safeChanges = fetched.map(function (f) {
        var sheetById = {};
        f.sheetRows.forEach(function (r) { if (r.id) sheetById[r.id] = r; });
        var merged = f.currentRows.map(function (appRow) {
          return mergeRowKeepSheetForEmpty(appRow, sheetById[appRow.id]);
        });
        return { entity: f.entity, rows: merged };
      });

      // STEP 3: Update snapshot, localStorage, and notify React with merged data
      var mergedData = Object.assign({}, data);
      safeChanges.forEach(function (c) {
        lastSnapshot[c.entity] = JSON.stringify(c.rows);
        mergedData[c.entity] = c.rows;
      });
      origSave(mergedData);
      subscribers.forEach(function (cb) { cb(mergedData); });

      // STEP 4: Push merged data to Sheet
      return Promise.all(safeChanges.map(function (c) {
        return pushEntity(c.entity, c.rows);
      }));
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
    return { status: syncStatus, time: lastSyncTime };
  };

  // First load
  loadFromServer();

  // Auto-refresh
  if (AUTO_MS > 0) {
    setInterval(loadFromServer, AUTO_MS);
  }

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
