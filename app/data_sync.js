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

  if (!SHEET_ID) {
    console.info('[WTP Sync] Offline mode — ตั้งค่า SHEET_ID ใน app/config.js เพื่อเปิด sync');
    WTPData.getSyncStatus = function () { return { status: 'offline', time: null }; };
    WTPData.subscribe = function () { return function () {}; };
    return;
  }

  var BASE = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/gviz/tq?tqx=out:csv&sheet=';

  /* ── state ──────────────────────────────────────────────────────── */
  var subscribers      = [];
  var syncStatus       = 'syncing';
  var lastSyncTime     = null;
  var cachedServerData = null;
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
    return fetch(BASE + encodeURIComponent(name))
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
      };

      cachedServerData = data;
      WTPData.save(data);                                // persist to localStorage
      subscribers.forEach(function (cb) { cb(data); });  // notify React
      setSyncStatus('ok');
    }).catch(function (err) {
      console.warn('[WTP Sync] โหลดข้อมูลล้มเหลว:', err);
      setSyncStatus('error');
    });
  }

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

})();
