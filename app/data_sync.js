/* =====================================================================
 * data_sync.js  —  Google Apps Script sync layer for Water POG Dashboard
 * โหลดหลังจาก config.js และ data.js
 *
 * หน้าที่:
 *  1) เมื่อเปิดแอป → ดึงข้อมูลล่าสุดจาก Apps Script
 *  2) เมื่อแก้ไขข้อมูล → sync ขึ้น Apps Script อัตโนมัติ (debounce 3 วิ)
 *  3) ให้ WTPData.subscribe() เพื่อให้ React รับข้อมูลใหม่จากเซิร์ฟเวอร์
 * ===================================================================== */
(function () {
  'use strict';

  var cfg = window.WTP_CONFIG || {};
  var URL = cfg.APPS_SCRIPT_URL || '';

  if (!URL || !URL.startsWith('https://')) {
    console.info('[WTP Sync] Offline mode — ตั้งค่า APPS_SCRIPT_URL ใน app/config.js เพื่อเปิด sync');
    WTPData.getSyncStatus = function () { return { status: 'offline', time: null }; };
    WTPData.subscribe = function () { return function () {}; };
    return;
  }

  /* ── state ──────────────────────────────────────────────────────── */
  var subscribers       = [];
  var lastSnapshot      = {};
  var syncTimer         = null;
  var syncStatus        = 'syncing';
  var lastSyncTime      = null;
  var AUTO_MS           = cfg.AUTO_REFRESH_MS || 0;
  var cachedServerData  = null;    // last serverData seen — replays to late subscribers
  var serverDataLoaded  = false;   // gate auto-push until server has responded once

  // เอนทิตีที่ sync แบบ replaceAll
  var CRUD_ENTITIES = ['projects', 'invoices', 'forecastEntries',
                       'bankAccounts', 'pvVouchers', 'payables'];

  /* ── helpers ────────────────────────────────────────────────────── */
  function post(body) {
    return fetch(URL, {
      method : 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body   : JSON.stringify(body),
    }).then(function (r) { return r.json(); });
  }

  function setSyncStatus(s) {
    syncStatus = s;
    lastSyncTime = (s === 'ok') ? new Date() : lastSyncTime;
    window.dispatchEvent(new CustomEvent('wtpSyncStatus', {
      detail: { status: s, time: lastSyncTime }
    }));
  }

  /* ── push one entity ────────────────────────────────────────────── */
  function pushEntity(entity, rows) {
    return post({ action: 'replaceAll', entity: entity, payload: rows })
      .catch(function (err) {
        console.warn('[WTP Sync] ส่ง', entity, 'ไม่สำเร็จ:', err);
      });
  }

  /* ── diff & push changed entities ──────────────────────────────── */
  function syncDiff(data) {
    var promises = [];
    CRUD_ENTITIES.forEach(function (entity) {
      var curr = JSON.stringify(data[entity] || []);
      if (curr !== lastSnapshot[entity]) {
        lastSnapshot[entity] = curr;
        promises.push(pushEntity(entity, data[entity] || []));
      }
    });
    if (!promises.length) return;
    setSyncStatus('syncing');
    Promise.all(promises)
      .then(function ()  { setSyncStatus('ok'); })
      .catch(function () { setSyncStatus('error'); });
  }

  /* ── wrap WTPData.save ──────────────────────────────────────────── */
  var origSave = WTPData.save;
  WTPData.save = function (data) {
    origSave(data);
    // Don't push the initial localStorage state — wait until server data has
    // arrived. Otherwise on slow networks the first useEffect can push stale
    // cached data back to the server before loadFromServer() completes.
    if (!serverDataLoaded) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function () { syncDiff(data); }, 3000);
  };

  /* ── subscribe (for React) ──────────────────────────────────────── */
  WTPData.subscribe = function (cb) {
    subscribers.push(cb);
    // If serverData already arrived BEFORE this subscriber registered (e.g.
    // fast cached fetch on a warm browser), replay it now so React state can
    // catch up — otherwise it would stay stuck on initial localStorage data.
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

  /* ── fetch fresh data from server ───────────────────────────────── */
  function loadFromServer() {
    setSyncStatus('syncing');
    return fetch(URL + '?action=getAll')
      .then(function (r) { return r.json(); })
      .then(function (serverData) {
        if (!serverData || serverData.error) {
          setSyncStatus('error');
          return;
        }
        // cache snapshot so first save doesn't re-push unchanged data
        CRUD_ENTITIES.forEach(function (e) {
          lastSnapshot[e] = JSON.stringify(serverData[e] || []);
        });
        cachedServerData = serverData;   // cache for late subscribers
        serverDataLoaded = true;         // unblock auto-push
        origSave(serverData);            // update localStorage cache
        subscribers.forEach(function (cb) { cb(serverData); }); // re-render React
        setSyncStatus('ok');
      })
      .catch(function (err) {
        setSyncStatus('error');
        console.warn('[WTP Sync] เชื่อมต่อ Apps Script ไม่ได้ ใช้ข้อมูลจาก cache:', err);
      });
  }

  // เรียกครั้งแรกเมื่อโหลดหน้า
  loadFromServer();

  // auto-refresh ตาม interval ที่ตั้ง
  if (AUTO_MS > 0) {
    setInterval(loadFromServer, AUTO_MS);
  }

  // expose สำหรับปุ่ม manual refresh ในหน้าเว็บ
  WTPData.refreshFromServer = loadFromServer;

})();
