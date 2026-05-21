/****************************************************************************************
 * Water POG — Financial Dashboard · Google Apps Script Backend (STANDALONE)
 * ----------------------------------------------------------------------------------------
 * เวอร์ชันนี้สำหรับสร้างเป็น Standalone Apps Script (ไม่ผูกกับ Sheet ใด Sheet หนึ่ง)
 * เหมาะกับการ deploy ใน account ที่ไม่ติด Workspace policy (เช่น personal Gmail)
 *
 * วิธีใช้:
 * 1) Login Gmail ส่วนตัว → ไป script.google.com
 * 2) New project → ลบโค้ดเริ่มต้น → วางโค้ดนี้
 * 3) Ctrl+S บันทึก
 * 4) แชร์ Google Sheet (1Q0en...) ให้ Gmail นี้เป็น Editor
 * 5) Deploy → New deployment → Web app
 *      Execute as: Me  |  Who has access: Anyone
 * 6) Copy URL → ส่งให้ผู้ดูแลระบบใส่ใน app/config.js
 ****************************************************************************************/

/* ── 0. CONFIG ─────────────────────────────────────────────────── */
// ID ของ Google Sheet — copy จาก URL: /spreadsheets/d/{THIS_PART}/edit
var SHEET_ID = '1Q0enboLihOYiYCn7otK9zXBlk6Yy8oHfoAXaFnGujwA';

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

/* ── 1. WEB APP ENDPOINTS ───────────────────────────────────────── */
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

/* ── 2. SPREADSHEET ACCESS (uses openById instead of getActive) ── */
function _ss() { return SpreadsheetApp.openById(SHEET_ID); }
function _sh(name) {
  var sh = _ss().getSheetByName(name);
  if (!sh) throw new Error('ไม่พบชีต: ' + name);
  return sh;
}

/* ── 3. READ ───────────────────────────────────────────────────── */
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
var JSON_FIELDS = {
  projects:        [],
  invoices:        ['followUps', 'actualReceive'],
  forecastEntries: [],
  bankAccounts:    [],
  pvVouchers:      [],
  payables:        [],
  projectFinance:  [],
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
  var headerRange = sh.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers]);
  headerRange.setFontWeight('bold').setBackground('#1a73e8').setFontColor('#ffffff');
  headerRange.setFontSize(10);
  if (rows.length) {
    var jsonCols = JSON_FIELDS[name] || [];
    var data = rows.map(function (r) {
      return headers.map(function (h) {
        var v = r[h];
        if (v === undefined || v === null) return '';
        if (jsonCols.indexOf(h) >= 0 && typeof v === 'object') return JSON.stringify(v);
        return v;
      });
    });
    sh.getRange(2, 1, data.length, headers.length).setValues(data);
  }
  sh.setFrozenRows(1);
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
  var headerRange = sh.getRange(1, 1, 1, 2);
  headerRange.setValues([['key', 'value']]);
  headerRange.setFontWeight('bold').setBackground('#1a73e8').setFontColor('#ffffff');
  var rows = Object.keys(obj).map(function (k) { return [k, obj[k]]; });
  if (rows.length) sh.getRange(2, 1, rows.length, 2).setValues(rows);
  sh.setFrozenRows(1);
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
      systemTotal:       tryParse(kv.outstandingSummary_systemTotal,       {}),
      thisMonthTracked:  tryParse(kv.outstandingSummary_thisMonthTracked,  {}),
      nextMonthRollover: tryParse(kv.outstandingSummary_nextMonthRollover, {}),
    },
    outstandingThisMonthByTransfer: tryParse(kv.outstandingThisMonthByTransfer, []),
    outstandingThisMonthTotal:      tryParse(kv.outstandingThisMonthTotal,      {}),
    outstandingByTransfer:          tryParse(kv.outstandingByTransfer,          []),
    outstandingTotal:               tryParse(kv.outstandingTotal,               {}),
    wipByTransfer:                  tryParse(kv.wipByTransfer,                  []),
    wipTotal:                       tryParse(kv.wipTotal,                       {}),
  };
}

function readWarroomP2_() {
  var kv = readKV(SHEETS.WARROOM_P2);
  return {
    totalProjectValue:   num(kv.totalProjectValue),
    invoiceForwardTotal: num(kv.invoiceForwardTotal),
    wipValue:            num(kv.wipValue),
    unsignedTotal:       tryParse(kv.unsignedTotal, {}),
    signedTotal:         tryParse(kv.signedTotal,   {}),
  };
}

function readDaily_() {
  var kv = readKV(SHEETS.DAILY);
  return {
    asOfDate:      kv.asOfDate   || '',
    ytdAccum:      tryParse(kv.ytdAccum,   {}),
    mtdAccum:      tryParse(kv.mtdAccum,   {}),
    todayAccum:    tryParse(kv.todayAccum, {}),
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
    closing:      tryParse(kv.closing, []),
    inflow:  readTable(SHEETS.CF_INFLOW).map(function (r)  { return { key:r.key, label:r.label, actual:tryParse(r.actual, []), plan:tryParse(r.plan, []) }; }),
    outflow: readTable(SHEETS.CF_OUTFLOW).map(function (r) { return { key:r.key, label:r.label, actual:tryParse(r.actual, []), plan:tryParse(r.plan, []) }; }),
  };
}

function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }
function tryParse(v, def) {
  if (v == null || v === '') return def;
  try { return JSON.parse(v); } catch (_) { return def; }
}

/* ── 7. CRUD per entity ─────────────────────────────────────────── */
var ENTITY_HEADERS = {
  projects: [
    'id',
    'Contract No.','พื้นที่','Type','Province','Ref.code',
    'Start','Finish','Duration','งบประมาณ',
    'มูลค่าสัญญาที่เซ็น','เซ็นสัญญา','แจ้งเข้าดำเนินการ','หยุดเวลา',
    '% (POG+STANK)','% (POG DRINK)',
    'Payment 1','Payment 1 Status','Receive Date',
    'Payment 2','Payment 2 Status','Receive Date2',
    'Payment 3','Payment 3 Status','Receive Date3',
    'TOTAL','Receive','% Progress',
    'สถานะโครงการ','ผู้รับโอนสิทธิ์','ภาระหนี้','Remark',
    'status','expectedPay1','expectedPay2',
  ],
  projectFinance: ['id','code','assignee','transferRights','debt','debtNote','transferDate','note'],
  invoices: [
    'id','ivNo','jobNo','period','invoiceDate','balance',
    'status','expectedReceive','contactName','contactPhone',
    'followUps','actualReceive'
  ],
  forecastEntries: [
    'id','DATE','PAYMENT_DATE','EXPENSE_TYPE','DESCRIPTION','JOB_NO',
    'PROJECT_NAME','AMOUNT','Bank_AC','STATUS','CATEGORY','IS_ACCRUED','NOTE'
  ],
  bankAccounts: [
    'id','DATE','BANK_NAME','Bank_AC','BALANCE','AVAILABLE_BALANCE','HOLD_AMOUNT','NOTE'
  ],
  pvVouchers: [
    'id','Project_Dpt','Ref_Code','PL_PV_No','jobcode','Pmt_Date','Type_of_Pmt','Option',
    'Payee','Type','AP_No','vchdate','Chq_No','Chq_Date','Bnf_Acct_No','Bnf_Bank',
    'Bank_AC','Bank_Id','Remark','cc_remark','Amount','Down_payment','Deduct',
    'Vat','Ret','Before_WHT','WHT','Less_Other','Total','Minus_Other','Net_Amount'
  ],
  payables: [
    'id','docno','vchno','vchdate','refno','due','due2','remark',
    'Amount','VAT','net_new','WHT_EMP','Less_Other','Balance_Amount2',
    'Less_Ret','Balance_Amount1','netpayment','refcode','jobcode',
    'jobname','dpt_code','dpt_name','acct_no','cust_name','vendor_group','vendor_group2'
  ],
};

function _entitySheet(entity) {
  var map = {
    projects:        SHEETS.PROJECTS,
    projectFinance:  SHEETS.PROJECT_FIN,
    invoices:        SHEETS.INVOICES,
    forecastEntries: SHEETS.FORECAST_E,
    bankAccounts:    SHEETS.BANK,
    pvVouchers:      SHEETS.PV_VOUCHERS,
    payables:        SHEETS.PAYABLES,
  };
  if (!map[entity]) throw new Error('CRUD ไม่รองรับ entity: ' + entity);
  return { name: map[entity], headers: ENTITY_HEADERS[entity] };
}

function newId_() { return 'id_' + Utilities.getUuid().slice(0, 8); }

function addRow(entity, payload) {
  var e = _entitySheet(entity);
  if (!payload.id) payload.id = newId_();
  // Use sheet's actual headers (in case Sheet has custom column order from RAW paste)
  var sh = _sh(e.name);
  var sheetHeaders = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  appendRow_(e.name, sheetHeaders, payload);
  return payload;
}

function updateRow(entity, id, patch) {
  var e = _entitySheet(entity);
  var sh = _sh(e.name);
  var values = sh.getDataRange().getValues();
  var sheetHeaders = values[0];
  var idCol = sheetHeaders.indexOf('id');
  if (idCol < 0) throw new Error('ชีต ' + e.name + ' ไม่มีคอลัมน์ id');
  var jsonCols = JSON_FIELDS[entity] || [];
  for (var i = 1; i < values.length; i++) {
    if (values[i][idCol] === id) {
      sheetHeaders.forEach(function (h, j) {
        if (patch[h] === undefined) return;
        var v = patch[h];
        if (jsonCols.indexOf(h) >= 0 && typeof v === 'object') v = JSON.stringify(v);
        values[i][j] = v;
      });
      sh.getRange(i + 1, 1, 1, sheetHeaders.length).setValues([values[i]]);
      var obj = {};
      sheetHeaders.forEach(function (h, j) { obj[h] = values[i][j]; });
      return obj;
    }
  }
  throw new Error('ไม่พบ id ' + id + ' ใน ' + entity);
}

function deleteRow(entity, id) {
  var e = _entitySheet(entity);
  var sh = _sh(e.name);
  var values = sh.getDataRange().getValues();
  var idCol = values[0].indexOf('id');
  if (idCol < 0) throw new Error('ชีต ' + e.name + ' ไม่มีคอลัมน์ id');
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
  // Use canonical ENTITY_HEADERS for replaceAll (writes full schema)
  writeTable(e.name, e.headers, rows);
  return rows;
}

/* ── 8. TEST HELPER ─────────────────────────────────────────────── */
function testGetAll() {
  Logger.log(JSON.stringify(getAll(), null, 2).slice(0, 2000));
}

function getDeployUrl() {
  Logger.log('URL: ' + (ScriptApp.getService().getUrl() || 'ยังไม่ได้ Deploy'));
}
