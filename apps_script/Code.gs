/****************************************************************************************
 * Water POG — Financial Dashboard · Google Apps Script Backend  (v2)
 * ----------------------------------------------------------------------------------------
 * วิธีใช้งาน:
 * 1) เปิด Google Sheet ใหม่ → เมนู Extensions → Apps Script
 * 2) วางโค้ดนี้ในไฟล์ Code.gs (ลบโค้ดเดิมออก) → บันทึก (Ctrl+S)
 * 3) กลับมาที่ชีต → รีเฟรชหน้า → เมนูใหม่ "Water POG" จะปรากฏ
 * 4) เมนู "Water POG" → "① สร้าง/รีเซ็ตชีตทั้งหมด"
 * 5) Deploy → New deployment → Web app
 *      Execute as: Me
 *      Who has access: Anyone
 * 6) คัดลอก Web App URL → วางใน app/config.js ช่อง APPS_SCRIPT_URL
 ****************************************************************************************/

/* ── 0. SHEET NAMES ────────────────────────────────────────────── */
var SHEETS = {
  META:          'meta',
  PIPELINE:      'pipeline',
  WARROOM_P1:    'warroomP1',
  WARROOM_P2:    'warroomP2',
  YTD_REVENUE:   'ytdRevenue',
  WEEKLY_RECV:   'weeklyExpectedReceipt',
  MONTHLY_FCST:  'monthlyForecast',
  DAILY:         'daily',
  DAILY_INV:     'daily_invoicesToday',
  CASHFLOW:      'cashFlow',
  CF_INFLOW:     'cf_inflow',
  CF_OUTFLOW:    'cf_outflow',
  PROJECTS:      'projects',
  PROJECT_FIN:   'projectFinance',
  INVOICES:      'invoices',
  FORECAST_E:    'forecastEntries',
  BANK:          'bankAccounts',
  PV_VOUCHERS:   'pvVouchers',
  PAYABLES:      'payables',
};

/* ── 1. MENU ────────────────────────────────────────────────────── */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Water POG')
    .addItem('① สร้าง/รีเซ็ตชีตทั้งหมด (Seed)', 'initWorkbook')
    .addItem('② ล้างข้อมูลทั้งหมด (Wipe)',        'wipeAll')
    .addSeparator()
    .addItem('🧪 ทดสอบ getAll() ใน Log',          'testGetAll')
    .addItem('🔗 แสดง Web App URL',               'showWebAppUrl')
    .addToUi();
}
function showWebAppUrl() {
  var url = ScriptApp.getService().getUrl() || '(ยังไม่ได้ Deploy)';
  SpreadsheetApp.getUi().alert('Web App URL:\n\n' + url);
}
function testGetAll() { Logger.log(JSON.stringify(getAll(), null, 2)); }

/* ── 2. WEB APP ENDPOINTS ───────────────────────────────────────── */
function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || 'getAll';
    var result = (action === 'getAll') ? getAll()
               : (action === 'get')    ? getEntity(e.parameter.entity)
               : { error: 'unknown action: ' + action };
    return respond(result, e);
  } catch (err) {
    return respond({ error: String(err && err.message || err) }, e);
  }
}

function doPost(e) {
  try {
    var body    = e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
    var action  = body.action;
    var entity  = body.entity;
    var payload = body.payload || {};
    var id      = body.id;
    var result;
    switch (action) {
      case 'getAll':     result = getAll();                        break;
      case 'add':        result = addRow(entity, payload);         break;
      case 'update':     result = updateRow(entity, id, payload);  break;
      case 'delete':     result = deleteRow(entity, id);           break;
      case 'replaceAll': result = replaceAll(entity, payload);     break;
      case 'setKV':      result = setKV(entity, payload);          break;
      default: result = { error: 'unknown action: ' + action };
    }
    return respond(result, e);
  } catch (err) {
    return respond({ error: String(err && err.message || err) }, e);
  }
}

function respond(obj, e) {
  var cb = e && e.parameter && e.parameter.callback;
  var out = ContentService.createTextOutput(
    cb ? cb + '(' + JSON.stringify(obj) + ')' : JSON.stringify(obj)
  );
  out.setMimeType(cb ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
  return out;
}

/* ── 3. READ — getAll / getEntity ───────────────────────────────── */
function getAll() {
  return {
    meta:                  readKV(SHEETS.META),
    pipeline:              readKV(SHEETS.PIPELINE),
    warroomP1:             readWarroomP1_(),
    warroomP2:             readWarroomP2_(),
    ytdRevenue:            readTable(SHEETS.YTD_REVENUE),
    weeklyExpectedReceipt: readTable(SHEETS.WEEKLY_RECV),
    monthlyForecast:       readTable(SHEETS.MONTHLY_FCST),
    daily:                 readDaily_(),
    cashFlow:              readCashFlow_(),
    projects:              readTable(SHEETS.PROJECTS),
    projectFinance:        readTable(SHEETS.PROJECT_FIN),
    invoices:              readTable(SHEETS.INVOICES),
    forecastEntries:       readTable(SHEETS.FORECAST_E),
    bankAccounts:          readTable(SHEETS.BANK),
    pvVouchers:            readTable(SHEETS.PV_VOUCHERS),
    payables:              readTable(SHEETS.PAYABLES),
  };
}

function getEntity(name) {
  switch (name) {
    case 'meta':                  return readKV(SHEETS.META);
    case 'pipeline':              return readKV(SHEETS.PIPELINE);
    case 'warroomP1':             return readWarroomP1_();
    case 'warroomP2':             return readWarroomP2_();
    case 'daily':                 return readDaily_();
    case 'cashFlow':              return readCashFlow_();
    case 'ytdRevenue':            return readTable(SHEETS.YTD_REVENUE);
    case 'weeklyExpectedReceipt': return readTable(SHEETS.WEEKLY_RECV);
    case 'monthlyForecast':       return readTable(SHEETS.MONTHLY_FCST);
    case 'projects':              return readTable(SHEETS.PROJECTS);
    case 'projectFinance':        return readTable(SHEETS.PROJECT_FIN);
    case 'invoices':              return readTable(SHEETS.INVOICES);
    case 'forecastEntries':       return readTable(SHEETS.FORECAST_E);
    case 'bankAccounts':          return readTable(SHEETS.BANK);
    case 'pvVouchers':            return readTable(SHEETS.PV_VOUCHERS);
    case 'payables':              return readTable(SHEETS.PAYABLES);
  }
  return { error: 'unknown entity: ' + name };
}

/* ── 4. TABLE I/O ───────────────────────────────────────────────── */
function _ss() { return SpreadsheetApp.getActiveSpreadsheet(); }
function _sh(name) {
  var sh = _ss().getSheetByName(name);
  if (!sh) throw new Error('ไม่พบชีต: ' + name);
  return sh;
}

// Fields that are stored as JSON strings (arrays / objects inside a cell)
var JSON_FIELDS = {
  projects:       ['periods'],
  invoices:       ['followUps', 'actualReceive'],
  forecastEntries:[],
  bankAccounts:   [],
  pvVouchers:     [],
  payables:       [],
  projectFinance: [],
};

function readTable(name) {
  var sh = _ss().getSheetByName(name);
  if (!sh) return [];
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0];
  var jsonCols = JSON_FIELDS[name] || [];
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (row.every(function (c) { return c === '' || c === null; })) continue;
    var obj = {};
    headers.forEach(function (h, j) {
      if (!h) return;
      var v = row[j];
      if (v instanceof Date) {
        v = Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      }
      if (v === '') v = null;
      // Auto-parse JSON string columns
      if (jsonCols.indexOf(h) >= 0 && typeof v === 'string' && v.length > 1) {
        try { v = JSON.parse(v); } catch (_) {}
      }
      obj[h] = v;
    });
    out.push(obj);
  }
  return out;
}

function writeTable(name, headers, rows) {
  var sh = _ss().getSheetByName(name) || _ss().insertSheet(name);
  sh.clear();
  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#eef2f7');
  if (rows.length) {
    var jsonCols = JSON_FIELDS[name] || [];
    var data = rows.map(function (r) {
      return headers.map(function (h) {
        var v = r[h];
        if (v === undefined || v === null) return '';
        // Serialize arrays/objects to JSON string
        if (jsonCols.indexOf(h) >= 0 && typeof v === 'object') {
          return JSON.stringify(v);
        }
        return v;
      });
    });
    sh.getRange(2, 1, data.length, headers.length).setValues(data);
  }
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, headers.length);
}

function appendRow_(name, headers, obj) {
  var sh = _sh(name);
  var jsonCols = JSON_FIELDS[name] || [];
  var row = headers.map(function (h) {
    var v = obj[h];
    if (v === undefined || v === null) return '';
    if (jsonCols.indexOf(h) >= 0 && typeof v === 'object') return JSON.stringify(v);
    return v;
  });
  sh.appendRow(row);
  return obj;
}

/* ── 5. KEY/VALUE I/O ───────────────────────────────────────────── */
function readKV(name) {
  var sh = _ss().getSheetByName(name);
  if (!sh) return {};
  var values = sh.getDataRange().getValues();
  var out = {};
  for (var i = 1; i < values.length; i++) {
    var k = values[i][0]; var v = values[i][1];
    if (!k) continue;
    if (v instanceof Date) v = Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    out[k] = v;
  }
  return out;
}

function writeKV(name, obj) {
  var sh = _ss().getSheetByName(name) || _ss().insertSheet(name);
  sh.clear();
  sh.getRange(1, 1, 1, 2).setValues([['key','value']])
    .setFontWeight('bold').setBackground('#eef2f7');
  var rows = Object.keys(obj).map(function (k) { return [k, obj[k]]; });
  if (rows.length) sh.getRange(2, 1, rows.length, 2).setValues(rows);
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, 2);
}

function setKV(name, patch) {
  var cur = readKV(name);
  Object.keys(patch).forEach(function (k) { cur[k] = patch[k]; });
  writeKV(name, cur);
  return cur;
}

/* ── 6. SPECIAL READERS ─────────────────────────────────────────── */
function readWarroomP1_() {
  var kv = readKV(SHEETS.WARROOM_P1);
  return {
    topKpis: {
      totalInvoices:       num(kv.topKpis_totalInvoices),
      estimatedCashInflow: num(kv.topKpis_estimatedCashInflow),
      estimatedDebt:       num(kv.topKpis_estimatedDebt),
      netProjection:       num(kv.topKpis_netProjection),
    },
    thisMonthNetProjection: num(kv.thisMonthNetProjection),
    nextMonthNetProjection: num(kv.nextMonthNetProjection),
    outstandingSummary: {
      systemTotal:       JSON.parse(kv.outstandingSummary_systemTotal       || '{}'),
      thisMonthTracked:  JSON.parse(kv.outstandingSummary_thisMonthTracked  || '{}'),
      nextMonthRollover: JSON.parse(kv.outstandingSummary_nextMonthRollover || '{}'),
    },
    outstandingThisMonthByTransfer: JSON.parse(kv.outstandingThisMonthByTransfer || '[]'),
    outstandingThisMonthTotal:      JSON.parse(kv.outstandingThisMonthTotal      || '{}'),
    outstandingByTransfer:          JSON.parse(kv.outstandingByTransfer          || '[]'),
    outstandingTotal:               JSON.parse(kv.outstandingTotal               || '{}'),
    wipByTransfer:                  JSON.parse(kv.wipByTransfer                  || '[]'),
    wipTotal:                       JSON.parse(kv.wipTotal                       || '{}'),
  };
}

function readWarroomP2_() {
  var kv = readKV(SHEETS.WARROOM_P2);
  return {
    totalProjectValue:   num(kv.totalProjectValue),
    invoiceForwardTotal: num(kv.invoiceForwardTotal),
    wipValue:            num(kv.wipValue),
    unsignedTotal:       JSON.parse(kv.unsignedTotal || '{}'),
    signedTotal:         JSON.parse(kv.signedTotal   || '{}'),
  };
}

function readDaily_() {
  var kv = readKV(SHEETS.DAILY);
  return {
    asOfDate:   kv.asOfDate   || '',
    ytdAccum:   JSON.parse(kv.ytdAccum   || '{}'),
    mtdAccum:   JSON.parse(kv.mtdAccum   || '{}'),
    todayAccum: JSON.parse(kv.todayAccum || '{}'),
    invoicesToday: readTable(SHEETS.DAILY_INV),
  };
}

function readCashFlow_() {
  var kv = readKV(SHEETS.CASHFLOW);
  return {
    month:        kv.month      || '',
    bf:           num(kv.bf),
    planTotal:    num(kv.planTotal),
    actualPaid:   num(kv.actualPaid),
    paidPct:      num(kv.paidPct),
    revInflow:    num(kv.revInflow),
    loanReceived: num(kv.loanReceived),
    loanLine:     num(kv.loanLine),
    loanRemain:   num(kv.loanRemain),
    finalNet:     num(kv.finalNet),
    nowWeek:      num(kv.nowWeek),
    closing:      JSON.parse(kv.closing || '[]'),
    inflow:       readTable(SHEETS.CF_INFLOW).map(function (r) {
      return { key:r.key, label:r.label,
               actual: tryParse(r.actual, []),
               plan:   tryParse(r.plan,   []) };
    }),
    outflow: readTable(SHEETS.CF_OUTFLOW).map(function (r) {
      return { key:r.key, label:r.label,
               actual: tryParse(r.actual, []),
               plan:   tryParse(r.plan,   []) };
    }),
  };
}

function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }
function tryParse(v, def) {
  if (!v) return def;
  try { return JSON.parse(v); } catch (_) { return def; }
}

/* ── 7. CRUD per entity ─────────────────────────────────────────── */
var ENTITY_HEADERS = {
  projects: [
    'id','code','name','startDate','finishDate','allocBudget','signedValue',
    'status','delivery','assignee','debt','note','periods',
    'stopTime','commenceDate'
  ],
  projectFinance: [
    'id','code','assignee','debtAmount','debtNote','transferDate','note'
  ],
  invoices: [
    'id','ivNo','jobNo','period','invoiceDate','balance',
    'status','expectedReceive','contactName','contactPhone',
    'followUps','actualReceive'
  ],
  forecastEntries: ['id','date','category','label','amount','note'],
  bankAccounts:    ['id','bankName','accountNo','accountName','type','balance','asOf','note'],
  pvVouchers:      ['id','voucherNo','paidDate','payee','amount','category','paymentMethod','bankAccount','reference','note'],
  payables:        ['id','creditorName','invoiceNo','amount','dueDate','category','status','note'],
};

function _entitySheet(entity) {
  var map = {
    projects:       SHEETS.PROJECTS,
    projectFinance: SHEETS.PROJECT_FIN,
    invoices:       SHEETS.INVOICES,
    forecastEntries:SHEETS.FORECAST_E,
    bankAccounts:   SHEETS.BANK,
    pvVouchers:     SHEETS.PV_VOUCHERS,
    payables:       SHEETS.PAYABLES,
  };
  if (!map[entity]) throw new Error('CRUD ไม่รองรับ entity: ' + entity);
  return { name: map[entity], headers: ENTITY_HEADERS[entity] };
}

function newId_() { return 'id_' + Utilities.getUuid().slice(0, 8); }

function addRow(entity, payload) {
  var e = _entitySheet(entity);
  if (!payload.id) payload.id = newId_();
  appendRow_(e.name, e.headers, payload);
  return payload;
}

function updateRow(entity, id, patch) {
  var e = _entitySheet(entity);
  var sh = _sh(e.name);
  var values = sh.getDataRange().getValues();
  var idCol  = e.headers.indexOf('id');
  var jsonCols = JSON_FIELDS[entity] || [];
  for (var i = 1; i < values.length; i++) {
    if (values[i][idCol] === id) {
      e.headers.forEach(function (h, j) {
        if (patch[h] === undefined) return;
        var v = patch[h];
        if (jsonCols.indexOf(h) >= 0 && typeof v === 'object') v = JSON.stringify(v);
        values[i][j] = v;
      });
      sh.getRange(i + 1, 1, 1, e.headers.length).setValues([values[i]]);
      var obj = {};
      e.headers.forEach(function (h, j) { obj[h] = values[i][j]; });
      return obj;
    }
  }
  throw new Error('ไม่พบ id ' + id + ' ใน ' + entity);
}

function deleteRow(entity, id) {
  var e = _entitySheet(entity);
  var sh = _sh(e.name);
  var values = sh.getDataRange().getValues();
  var idCol  = e.headers.indexOf('id');
  for (var i = 1; i < values.length; i++) {
    if (values[i][idCol] === id) {
      sh.deleteRow(i + 1);
      return { ok: true, id: id };
    }
  }
  throw new Error('ไม่พบ id ' + id + ' ใน ' + entity);
}

function replaceAll(entity, rows) {
  var e = _entitySheet(entity);
  if (!Array.isArray(rows)) rows = [];
  rows.forEach(function (r) { if (!r.id) r.id = newId_(); });
  writeTable(e.name, e.headers, rows);
  return rows;
}

/* ── 8. WIPE ────────────────────────────────────────────────────── */
function wipeAll() {
  var ui  = SpreadsheetApp.getUi();
  var ans = ui.alert('ยืนยันการล้างข้อมูลทั้งหมด?', ui.ButtonSet.YES_NO);
  if (ans !== ui.Button.YES) return;
  Object.values(SHEETS).forEach(function (name) {
    var sh = _ss().getSheetByName(name);
    if (sh) _ss().deleteSheet(sh);
  });
  ui.alert('ล้างเรียบร้อย');
}

/* ── 9. SEED / initWorkbook ─────────────────────────────────────── */
function initWorkbook() {
  var seed = _seedData_();

  writeKV(SHEETS.META, seed.meta);
  writeKV(SHEETS.PIPELINE, {
    waitingSign:           JSON.stringify(seed.pipeline.waitingSign),
    signedWip:             JSON.stringify(seed.pipeline.signedWip),
    invoicedOutstanding:   JSON.stringify(seed.pipeline.invoicedOutstanding),
    totalProjectValue:     seed.pipeline.totalProjectValue,
    invoiceBroughtForward: seed.pipeline.invoiceBroughtForward,
    signedNotDelivered:    seed.pipeline.signedNotDelivered,
    notSigned:             seed.pipeline.notSigned,
    totalDebt:             seed.pipeline.totalDebt,
    usableNet:             seed.pipeline.usableNet,
  });
  writeKV(SHEETS.WARROOM_P1, {
    topKpis_totalInvoices:               seed.warroomP1.topKpis.totalInvoices,
    topKpis_estimatedCashInflow:         seed.warroomP1.topKpis.estimatedCashInflow,
    topKpis_estimatedDebt:               seed.warroomP1.topKpis.estimatedDebt,
    topKpis_netProjection:               seed.warroomP1.topKpis.netProjection,
    thisMonthNetProjection:              seed.warroomP1.thisMonthNetProjection,
    nextMonthNetProjection:              seed.warroomP1.nextMonthNetProjection,
    outstandingSummary_systemTotal:      JSON.stringify(seed.warroomP1.outstandingSummary.systemTotal),
    outstandingSummary_thisMonthTracked: JSON.stringify(seed.warroomP1.outstandingSummary.thisMonthTracked),
    outstandingSummary_nextMonthRollover:JSON.stringify(seed.warroomP1.outstandingSummary.nextMonthRollover),
    outstandingThisMonthByTransfer:      JSON.stringify(seed.warroomP1.outstandingThisMonthByTransfer),
    outstandingThisMonthTotal:           JSON.stringify(seed.warroomP1.outstandingThisMonthTotal),
    outstandingByTransfer:               JSON.stringify(seed.warroomP1.outstandingByTransfer),
    outstandingTotal:                    JSON.stringify(seed.warroomP1.outstandingTotal),
    wipByTransfer:                       JSON.stringify(seed.warroomP1.wipByTransfer),
    wipTotal:                            JSON.stringify(seed.warroomP1.wipTotal),
  });
  writeKV(SHEETS.WARROOM_P2, {
    totalProjectValue:   seed.warroomP2.totalProjectValue,
    invoiceForwardTotal: seed.warroomP2.invoiceForwardTotal,
    wipValue:            seed.warroomP2.wipValue,
    unsignedTotal:       JSON.stringify(seed.warroomP2.unsignedTotal),
    signedTotal:         JSON.stringify(seed.warroomP2.signedTotal),
  });
  writeTable(SHEETS.YTD_REVENUE,   ['month','en','count','gross','debt','net'],  seed.ytdRevenue);
  writeTable(SHEETS.WEEKLY_RECV,   ['week','count','gross','debt','net'],         seed.weeklyExpectedReceipt);
  writeTable(SHEETS.MONTHLY_FCST,  ['month','en','pctOfRemaining','invIssued','signed','unsigned','debt','netUsable'], seed.monthlyForecast);
  writeKV(SHEETS.DAILY, {
    asOfDate:   seed.daily.asOfDate,
    ytdAccum:   JSON.stringify(seed.daily.ytdAccum),
    mtdAccum:   JSON.stringify(seed.daily.mtdAccum),
    todayAccum: JSON.stringify(seed.daily.todayAccum),
  });
  writeTable(SHEETS.DAILY_INV, ['id','no','code','name','period','amount','receivedAt'], seed.daily.invoicesToday);
  writeKV(SHEETS.CASHFLOW, {
    month:        seed.cashFlow.month,
    bf:           seed.cashFlow.bf,
    planTotal:    seed.cashFlow.planTotal,
    actualPaid:   seed.cashFlow.actualPaid,
    paidPct:      seed.cashFlow.paidPct,
    revInflow:    seed.cashFlow.revInflow,
    loanReceived: seed.cashFlow.loanReceived,
    loanLine:     seed.cashFlow.loanLine,
    loanRemain:   seed.cashFlow.loanRemain,
    finalNet:     seed.cashFlow.finalNet,
    closing:      JSON.stringify(seed.cashFlow.closing),
    nowWeek:      seed.cashFlow.nowWeek,
  });
  writeTable(SHEETS.CF_INFLOW,  ['key','label','actual','plan'],
    seed.cashFlow.inflow.map(function (r) { return { key:r.key, label:r.label, actual:JSON.stringify(r.actual), plan:JSON.stringify(r.plan) }; }));
  writeTable(SHEETS.CF_OUTFLOW, ['key','label','actual','plan'],
    seed.cashFlow.outflow.map(function (r) { return { key:r.key, label:r.label, actual:JSON.stringify(r.actual), plan:JSON.stringify(r.plan) }; }));

  writeTable(SHEETS.PROJECTS,    ENTITY_HEADERS.projects,        seed.projects);
  writeTable(SHEETS.PROJECT_FIN, ENTITY_HEADERS.projectFinance,  seed.projectFinance);
  writeTable(SHEETS.INVOICES,    ENTITY_HEADERS.invoices,         seed.invoices);
  writeTable(SHEETS.FORECAST_E,  ENTITY_HEADERS.forecastEntries,  seed.forecastEntries);
  writeTable(SHEETS.BANK,        ENTITY_HEADERS.bankAccounts,     seed.bankAccounts);
  writeTable(SHEETS.PV_VOUCHERS, ENTITY_HEADERS.pvVouchers,       seed.pvVouchers);
  writeTable(SHEETS.PAYABLES,    ENTITY_HEADERS.payables,          seed.payables);

  SpreadsheetApp.getUi().alert('สร้างชีตและใส่ข้อมูลตัวอย่างเรียบร้อย ✅\n\nขั้นตอนถัดไป:\nDeploy → New deployment → Web app\nแล้วนำ URL ไปใส่ใน app/config.js');
}

/* ── 10. SEED DATA ──────────────────────────────────────────────── */
function _seedData_() {
  var n = 1000;
  var id = function () { return 'id_' + (++n).toString(36); };

  return {
    meta: { companyName:'บริษัท วอเทอร์ป๊อก จำกัด', shortName:'Water POG', asOf:'2026-05-18', year:2026, currency:'THB' },
    pipeline: {
      waitingSign:         { count:10, gross:35118000, debt:16649500, net:18468500 },
      signedWip:           { count:23, gross:42952000, debt:8818806.05, net:34133193.95 },
      invoicedOutstanding: { count:4,  gross:10154200, debt:2809200, net:7345000 },
      totalProjectValue:247453578.76, invoiceBroughtForward:10154200,
      signedNotDelivered:35118000, notSigned:47900000, totalDebt:84498100, usableNet:162955478.76,
    },
    warroomP1: {
      topKpis: { totalInvoices:10, estimatedCashInflow:35118000, estimatedDebt:16649500, netProjection:18468500 },
      thisMonthNetProjection:20968200, nextMonthNetProjection:18468500,
      outstandingSummary: {
        systemTotal:       { count:14, gross:45272200, debt:-19458700, net:25813500 },
        thisMonthTracked:  { count:4,  gross:10154200, debt:-2809200,  net:7345000 },
        nextMonthRollover: { count:10, gross:35118000, debt:-16649500, net:18468500 },
      },
      outstandingThisMonthByTransfer: [
        { type:'ไม่โอนสิทธิรับเงิน', count:1, gross:2154200,  debt:0,        net:2154200 },
        { type:'โอนสิทธิรับเงิน',    count:3, gross:8000000,  debt:-2809200, net:5190800 },
      ],
      outstandingThisMonthTotal: { count:4, gross:10154200, debt:-2809200, net:7345000 },
      outstandingByTransfer: [
        { type:'ไม่โอนสิทธิรับเงิน', count:3, gross:5000000,  debt:-2000000,  net:3000000 },
        { type:'โอนสิทธิรับเงิน',    count:7, gross:30118000, debt:-14649500, net:15468500 },
      ],
      outstandingTotal: { count:10, gross:35118000, debt:-16649500, net:18468500 },
      wipByTransfer: [
        { type:'ไม่โอนสิทธิรับเงิน', count:12, gross:21839603.76, debt:0,          net:21839603.76 },
        { type:'โอนสิทธิรับเงิน',    count:71, gross:182265900,   debt:-65039400, net:117226500 },
      ],
      wipTotal: { count:83, gross:204105503.76, debt:-65039400, net:139066103.76 },
    },
    warroomP2: {
      totalProjectValue:247453578.76, invoiceForwardTotal:45272200, wipValue:154281378.76,
      unsignedTotal:{ count:10, value:47900000 }, signedTotal:{ count:0, value:199553578.76 },
    },
    ytdRevenue: [
      { month:'มกราคม',    en:'Jan', count:13, gross:35644984.34, debt:0,           net:35644984.34 },
      { month:'กุมภาพันธ์', en:'Feb', count:16, gross:26170400,   debt:-8898400,    net:17272000 },
      { month:'มีนาคม',    en:'Mar', count:15, gross:32846184.32, debt:-13363100,   net:19483084.32 },
      { month:'เมษายน',    en:'Apr', count:23, gross:42952000,    debt:-8818806.05, net:34133193.95 },
      { month:'พฤษภาคม',  en:'May', count:4,  gross:10814000,    debt:-5963196.05, net:4850803.95 },
    ],
    weeklyExpectedReceipt: [
      { week:1, count:2,  gross:7554200,    debt:-2159200, net:5395000 },
      { week:2, count:2,  gross:2600000,    debt:-650000,  net:1950000 },
      { week:3, count:12, gross:21839603.76,debt:0,        net:21839603.76 },
      { week:4, count:0,  gross:0, debt:0, net:0 },
      { week:5, count:0,  gross:0, debt:0, net:0 },
    ],
    monthlyForecast: [
      { month:'พฤษภาคม',   en:'May', pctOfRemaining:14, invIssued:10154200, signed:0,          unsigned:0,         debt:-2809200,  netUsable:7345000 },
      { month:'มิถุนายน',   en:'Jun', pctOfRemaining:11, invIssued:35118000, signed:0,          unsigned:0,         debt:-16649500, netUsable:18468500 },
      { month:'กรกฎาคม',   en:'Jul', pctOfRemaining:13, invIssued:0,        signed:23450300,   unsigned:0,         debt:-11366800, netUsable:20524900 },
      { month:'สิงหาคม',   en:'Aug', pctOfRemaining:16, invIssued:0,        signed:41105000,   unsigned:0,         debt:-17654700, netUsable:23450300 },
      { month:'กันยายน',   en:'Sep', pctOfRemaining:24, invIssued:0,        signed:48739478.76,unsigned:0,         debt:-23057900, netUsable:25681578.76 },
      { month:'ตุลาคม',    en:'Oct', pctOfRemaining:5,  invIssued:0,        signed:13105200,   unsigned:28740000,  debt:-3240000,  netUsable:38605200 },
      { month:'พฤศจิกายน', en:'Nov', pctOfRemaining:18, invIssued:0,        signed:19440000,   unsigned:19160000,  debt:-9720000,  netUsable:28880000 },
      { month:'ธันวาคม',   en:'Dec', pctOfRemaining:0,  invIssued:0,        signed:0,          unsigned:0,         debt:0,         netUsable:0 },
    ],
    daily: {
      asOfDate:'2026-05-15',
      ytdAccum:   { count:77, value:149332093.66 },
      mtdAccum:   { count:5,  value:11045525 },
      todayAccum: { count:1,  value:231525 },
      invoicesToday: [
        { id:id(), no:1, code:'PP064-STIIS', name:'บ้านพรุกง ม.2 ต.วังใหญ่ อ.เทพา จ.สงขลา', period:1, amount:231525, receivedAt:'2026-05-15' },
      ],
    },
    cashFlow: {
      month:'May 2026', bf:2924226.17, planTotal:28300000, actualPaid:7597582.34, paidPct:26.85,
      revInflow:4805469, loanReceived:1473275, loanLine:3757661, loanRemain:4600000, finalNet:-8504440,
      inflow: [
        { key:'bf',      label:'เงินสดคงเหลือยกมา',       actual:[2924226.17,0,0,0,0], plan:[0,0,0,0,0] },
        { key:'project', label:'รับเงินโครงการ',           actual:[2924226.17,0,0,0,0], plan:[0,8500523.5,0,0,0] },
        { key:'loan',    label:'เงินกู้/สินเชื่อหมุนเวียน',actual:[0,0,0,0,0],          plan:[0,3200000,0,0,0] },
      ],
      outflow: [
        { key:'op',   label:'1. ค่าใช้จ่ายดำเนินงานรายสัปดาห์',  plan:[1500000,1500000,1500000,1800000,1500000], actual:[1808097.83,251317.48,0,0,0] },
        { key:'proj', label:'2. ค่าใช้จ่ายโครงการ/ติดตั้ง',      plan:[3000000,3000000,3000000,3000000,3000000], actual:[2478115.64,0,0,0,0] },
        { key:'fin',  label:'3. ต้นทุนทางการเงินและดอกเบี้ย',   plan:[1320000,1160000,160000,1000000,3060000],  actual:[38393.86,0,3021657.53,0,0] },
        { key:'misc', label:'4. ค่าใช้จ่ายเบ็ดเตล็ดและเงินเดือน',plan:[0,0,3300000,0,0],                         actual:[0,0,0,0,0] },
      ],
      closing:[-1331906.41,-6279476.5,-3584977.04,-6599615.67,-3300000], nowWeek:2,
    },
    projects: [
      { id:id(), code:'PP064-STIIS', name:'บ้านพรุกง ม.2 ต.วังใหญ่ อ.เทพา จ.สงขลา',           startDate:'2025-08-01', finishDate:'2026-05-15', allocBudget:4200000, signedValue:4630500,   status:'invoiced',     delivery:'received',    assignee:'',          debt:0,         note:'', periods:'[]', stopTime:'', commenceDate:'' },
      { id:id(), code:'PP073-AYT',   name:'อาคารสำนักงาน เทศบาลตำบลอ่าวยาง จ.พังงา',          startDate:'2025-10-05', finishDate:'2026-07-30', allocBudget:17000000,signedValue:18900000,  status:'invoiced',     delivery:'pending',     assignee:'ธนาคารออมสิน',debt:4200000,  note:'', periods:'[]', stopTime:'', commenceDate:'' },
      { id:id(), code:'PP081-NKM',   name:'ระบบประปา ต.นาคำ อ.เมือง จ.หนองคาย',               startDate:'2025-09-12', finishDate:'2026-06-30', allocBudget:11000000,signedValue:12500000,  status:'invoiced',     delivery:'delivered',   assignee:'กรุงเทพ',    debt:3500000,  note:'', periods:'[]', stopTime:'', commenceDate:'' },
      { id:id(), code:'PP084-SKN',   name:'ปรับปรุงท่อจ่ายน้ำ ม.7 ต.สำโรง จ.อุบลฯ',           startDate:'2026-01-22', finishDate:'2026-09-30', allocBudget:7500000, signedValue:8550000,   status:'signed_wip',   delivery:'in_progress', assignee:'',          debt:1800000,  note:'', periods:'[]', stopTime:'', commenceDate:'' },
      { id:id(), code:'PP088-MTK',   name:'ระบบส่งน้ำ ต.มะตูม อ.พรหมพิราม จ.พิษณุโลก',         startDate:'2026-02-04', finishDate:'2026-10-15', allocBudget:21000000,signedValue:23450300,  status:'signed_wip',   delivery:'in_progress', assignee:'กสิกรไทย',  debt:11366800, note:'', periods:'[]', stopTime:'', commenceDate:'' },
      { id:id(), code:'PP091-CRI',   name:'ก่อสร้างประปา ม.4 ต.ป่าก่อดำ อ.แม่ลาว จ.เชียงราย',startDate:'2026-02-28', finishDate:'2026-11-30', allocBudget:17000000,signedValue:18900000,  status:'signed_wip',   delivery:'in_progress', assignee:'',          debt:6500000,  note:'', periods:'[]', stopTime:'', commenceDate:'' },
      { id:id(), code:'PP094-PYO',   name:'ระบบประปาหมู่บ้าน ต.ดอกคำใต้ จ.พะเยา',             startDate:'2026-03-08', finishDate:'2026-12-31', allocBudget:12000000,signedValue:13105200,  status:'signed_wip',   delivery:'pending',     assignee:'',          debt:3240000,  note:'', periods:'[]', stopTime:'', commenceDate:'' },
      { id:id(), code:'PP097-SKW',   name:'ระบบส่งน้ำดิบ ต.บางพระ อ.ศรีราชา จ.ชลบุรี',         startDate:'2026-03-25', finishDate:'2026-12-31', allocBudget:18000000,signedValue:19440000,  status:'signed_wip',   delivery:'in_progress', assignee:'ไทยพาณิชย์',debt:9720000,  note:'', periods:'[]', stopTime:'', commenceDate:'' },
      { id:id(), code:'PP101-PTL',   name:'ปรับปรุงระบบประปา ต.เพชรเมืองทอง อ.เมือง จ.ปัตตานี',startDate:'',         finishDate:'',          allocBudget:26000000,signedValue:28740000,  status:'waiting_sign', delivery:'awaiting',    assignee:'',          debt:13420000, note:'', periods:'[]', stopTime:'', commenceDate:'' },
      { id:id(), code:'PP103-NSN',   name:'ระบบประปาหมู่บ้าน ต.หนองสองห้อง จ.ขอนแก่น',        startDate:'',         finishDate:'',          allocBudget:17500000,signedValue:19160000,  status:'waiting_sign', delivery:'awaiting',    assignee:'',          debt:3229500,  note:'', periods:'[]', stopTime:'', commenceDate:'' },
    ],
    projectFinance: [],
    invoices: [
      { id:id(), ivNo:'IV2026-077', jobNo:'PP064-STIIS', period:1, invoiceDate:'2026-05-10', balance:231525,  status:'paid',              expectedReceive:'2026-05-15', contactName:'คุณสมชาย',    contactPhone:'074-555-1100', followUps:'[]', actualReceive:'null' },
      { id:id(), ivNo:'IV2026-076', jobNo:'PP073-AYT',   period:2, invoiceDate:'2026-05-05', balance:4200000, status:'pending_inspection', expectedReceive:'2026-05-22', contactName:'คุณวิไล',     contactPhone:'076-555-2200', followUps:'[]', actualReceive:'null' },
      { id:id(), ivNo:'IV2026-075', jobNo:'PP081-NKM',   period:3, invoiceDate:'2026-05-03', balance:3500000, status:'tracking',           expectedReceive:'2026-05-28', contactName:'คุณธนา',     contactPhone:'042-555-2200', followUps:'[]', actualReceive:'null' },
      { id:id(), ivNo:'IV2026-074', jobNo:'PP084-SKN',   period:1, invoiceDate:'2026-04-29', balance:1850000, status:'tracking',           expectedReceive:'2026-06-04', contactName:'คุณอมรา',    contactPhone:'045-555-3300', followUps:'[]', actualReceive:'null' },
      { id:id(), ivNo:'IV2026-073', jobNo:'PP088-MTK',   period:2, invoiceDate:'2026-04-22', balance:5400000, status:'issue',              expectedReceive:'2026-06-10', contactName:'คุณสิงห์',   contactPhone:'055-555-4400', followUps:'[]', actualReceive:'null' },
      { id:id(), ivNo:'IV2026-072', jobNo:'PP091-CRI',   period:1, invoiceDate:'2026-04-15', balance:2380000, status:'tracking',           expectedReceive:'2026-06-18', contactName:'คุณพิม',     contactPhone:'053-555-5500', followUps:'[]', actualReceive:'null' },
      { id:id(), ivNo:'IV2026-071', jobNo:'PP097-SKW',   period:4, invoiceDate:'2026-04-08', balance:1900000, status:'pending_inspection', expectedReceive:'2026-06-25', contactName:'คุณสุดารัตน์',contactPhone:'038-555-6600', followUps:'[]', actualReceive:'null' },
    ],
    forecastEntries: [
      { id:id(), date:'2026-05-22', category:'inflow_project', label:'รับเงินงวด 2 — PP073-AYT', amount:4200000,  note:'รอตรวจรับงาน' },
      { id:id(), date:'2026-05-26', category:'outflow_proj',   label:'จ่ายค่าวัสดุ Project PP088',  amount:-1800000, note:'รอบโอน' },
      { id:id(), date:'2026-05-28', category:'inflow_project', label:'รับเงินงวด 3 — PP081-NKM',   amount:3500000,  note:'ติดตามจาก อบต.' },
      { id:id(), date:'2026-05-30', category:'inflow_loan',    label:'เบิกสินเชื่อหมุนเวียน',         amount:3200000,  note:'ทำเรื่องแล้ว' },
      { id:id(), date:'2026-05-31', category:'outflow_fin',    label:'ชำระดอกเบี้ยเงินกู้ประจำเดือน', amount:-3060000, note:'' },
      { id:id(), date:'2026-06-02', category:'outflow_misc',   label:'เงินเดือนพนักงาน + โบนัส',     amount:-3300000, note:'' },
    ],
    bankAccounts: [
      { id:id(), bankName:'กรุงเทพ',    accountNo:'123-4-56789-0', accountName:'WaterPOG Co., Ltd. (Main)',    type:'ออมทรัพย์',     balance:2454226.17, asOf:'2026-05-18', note:'บัญชีหลักเก็บเงินรับ' },
      { id:id(), bankName:'กสิกรไทย',   accountNo:'987-6-54321-0', accountName:'WaterPOG Co., Ltd. (OD)',      type:'เดินสะพัด/OD',  balance:-1200000,   asOf:'2026-05-18', note:'OD Limit 3,000,000' },
      { id:id(), bankName:'ไทยพาณิชย์', accountNo:'456-7-89012-3', accountName:'WaterPOG Co., Ltd. (Payroll)', type:'ออมทรัพย์',     balance:470000,     asOf:'2026-05-18', note:'เงินเดือน + ค่าใช้จ่ายเบ็ดเตล็ด' },
      { id:id(), bankName:'กรุงไทย',    accountNo:'321-0-98765-4', accountName:'WaterPOG Co., Ltd. (LC)',      type:'L/C',           balance:1200000,    asOf:'2026-05-18', note:'ค้ำประกันโครงการ' },
    ],
    pvVouchers: [
      { id:id(), voucherNo:'PV2026-101', paidDate:'2026-05-02', payee:'บริษัท ท่อพีวีซีไทย จำกัด',     amount:850000,  category:'วัสดุ',        paymentMethod:'เช็ค',       bankAccount:'กรุงเทพ 123-4-56789-0',   reference:'PO-2026-088', note:'' },
      { id:id(), voucherNo:'PV2026-102', paidDate:'2026-05-04', payee:'หจก. รับเหมา ก.วิศวกรรม',      amount:1200000, category:'รับเหมา',      paymentMethod:'โอน',        bankAccount:'กสิกรไทย 987-6-54321-0', reference:'PP091 งวด 2', note:'งานก่อสร้าง' },
      { id:id(), voucherNo:'PV2026-103', paidDate:'2026-05-06', payee:'การไฟฟ้าส่วนภูมิภาค',           amount:48000,   category:'สาธารณูปโภค', paymentMethod:'โอน',        bankAccount:'ไทยพาณิชย์ 456-7-89012-3',reference:'PEA 05/2026', note:'' },
      { id:id(), voucherNo:'PV2026-104', paidDate:'2026-05-08', payee:'ธ.กรุงเทพ (ดอกเบี้ย)',           amount:22500,   category:'การเงิน',      paymentMethod:'หักบัญชี',   bankAccount:'กรุงเทพ 123-4-56789-0',   reference:'PS2026-014',  note:'ดอกเบี้ยเดือน พ.ค.' },
      { id:id(), voucherNo:'PV2026-105', paidDate:'2026-05-10', payee:'สำนักงานบัญชี เอกชน จำกัด',     amount:35000,   category:'บริการ',       paymentMethod:'โอน',        bankAccount:'กรุงเทพ 123-4-56789-0',   reference:'',            note:'ค่าบัญชี' },
      { id:id(), voucherNo:'PV2026-106', paidDate:'2026-05-13', payee:'บริษัท ขนส่งยูไนเต็ด จำกัด',    amount:95000,   category:'ขนส่ง',        paymentMethod:'เช็ค',       bankAccount:'กรุงเทพ 123-4-56789-0',   reference:'',            note:'' },
      { id:id(), voucherNo:'PV2026-107', paidDate:'2026-05-15', payee:'เงินเดือนพนักงาน',               amount:2850000, category:'เงินเดือน',    paymentMethod:'โอน',        bankAccount:'ไทยพาณิชย์ 456-7-89012-3',reference:'Payroll 05/2026',note:'' },
    ],
    payables: [
      { id:id(), creditorName:'บริษัท ท่อพีวีซีไทย จำกัด',  invoiceNo:'PV2026-1024', amount:850000,  dueDate:'2026-05-25', category:'วัสดุ',        status:'pending', note:'ค่าท่อ PP088' },
      { id:id(), creditorName:'หจก. รับเหมา ก.วิศวกรรม',   invoiceNo:'KW2026-088',  amount:1200000, dueDate:'2026-05-30', category:'รับเหมา',      status:'pending', note:'งานก่อสร้าง PP091' },
      { id:id(), creditorName:'บริษัท ขนส่งยูไนเต็ด จำกัด', invoiceNo:'UC2026-512',  amount:95000,   dueDate:'2026-05-22', category:'ขนส่ง',       status:'overdue', note:'ค่าขนส่งสะสม' },
      { id:id(), creditorName:'การไฟฟ้าส่วนภูมิภาค',       invoiceNo:'PEA2026-05', amount:48000,   dueDate:'2026-05-31', category:'สาธารณูปโภค', status:'pending', note:'' },
      { id:id(), creditorName:'บริษัท นาคา ปั๊มน้ำ จำกัด',   invoiceNo:'NK2026-302', amount:540000,  dueDate:'2026-06-10', category:'วัสดุ',        status:'pending', note:'ปั๊มน้ำ + อะไหล่' },
      { id:id(), creditorName:'สำนักงานบัญชี เอกชน จำกัด', invoiceNo:'AC2026-05',  amount:35000,   dueDate:'2026-05-20', category:'บริการ',       status:'paid',    note:'ค่าบัญชีเดือน พ.ค.' },
    ],
  };
}
