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
  INVOICES:      'invoices',
  FORECAST_E:    'forecastEntries',
  BANK:          'bankAccounts',
  PV_VOUCHERS:   'pvVouchers',
  PAYABLES:      'payables',
  DEBT_LEDGER:   'debtLedger',
  RECEIPTS:      'receipts',
  BANK_ENTRIES:  'bankEntries',
  CHECKS:        'checks',
  // ── v2 schema (added 2026-05-23) ────────────────────────────────
  DEBT_MASTER:      'debtMaster',
  BANK_TRANSFERS:   'bankTransfers',
  STS_SERVICE_FEE:  'stsServiceFee',
  STS_PENDING_CALC: 'stsPendingCalc',
  STS_CALC_RESULT:  'stsCalcResult',
  DEBT_EVENTS:      'debtEvents',
  AUDIT_LOG:        'auditLog',     // ผู้ใช้-การกระทำ-เวลา (auto-logged on every CRUD)
  USERS:            'users',        // user accounts (id, username, password, displayName, role)
  CASHFLOW_SNAPS:   'cashflowSnapshots', // daily snapshot of each bank balance
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
    // Audit metadata sent by client — best-effort, doesn't block on error
    var meta    = body.meta || {};   // { user, displayName, role, diffSummary }
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
    // Append audit log entry for mutating actions (skip on error result)
    if (!result || !result.error) {
      try {
        if (action === 'add' || action === 'update' || action === 'delete' || action === 'replaceAll') {
          appendAuditLog_({
            timestamp: new Date(),
            user: meta.user || 'unknown',
            displayName: meta.displayName || '',
            role: meta.role || '',
            entity: entity || '',
            action: action,
            rowsAffected: Array.isArray(payload) ? payload.length : (id ? 1 : 0),
            summary: meta.diffSummary || '',
          });
        }
      } catch (logErr) { /* never block CRUD on audit log failure */ }
    }
    return respond(result, e);
  } catch (err) {
    return respond({ error: String(err && err.message || err) }, e);
  }
}

// Append one row to the auditLog sheet (creates sheet+header if missing)
function appendAuditLog_(entry) {
  var ss = _ss();
  var sh = ss.getSheetByName(SHEETS.AUDIT_LOG);
  var headers = ['timestamp', 'user', 'displayName', 'role', 'entity', 'action', 'rowsAffected', 'summary'];
  if (!sh) {
    sh = ss.insertSheet(SHEETS.AUDIT_LOG);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#f0f4f8');
    sh.setFrozenRows(1);
  }
  sh.appendRow(headers.map(function (h) {
    if (h === 'timestamp') return entry.timestamp || new Date();
    return entry[h] != null ? entry[h] : '';
  }));
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
    invoices:              readTable(SHEETS.INVOICES),
    forecastEntries:       readTable(SHEETS.FORECAST_E),
    bankAccounts:          readTable(SHEETS.BANK),
    pvVouchers:            readTable(SHEETS.PV_VOUCHERS),
    payables:              readTable(SHEETS.PAYABLES),
    debtLedger:            readTable(SHEETS.DEBT_LEDGER),
    receipts:              readTable(SHEETS.RECEIPTS),
    bankEntries:           readTable(SHEETS.BANK_ENTRIES),
    checks:                readTable(SHEETS.CHECKS),
    debtMaster:            readTable(SHEETS.DEBT_MASTER),
    bankTransfers:         readTable(SHEETS.BANK_TRANSFERS),
    stsServiceFee:         readTable(SHEETS.STS_SERVICE_FEE),
    stsPendingCalc:        readTable(SHEETS.STS_PENDING_CALC),
    stsCalcResult:         readTable(SHEETS.STS_CALC_RESULT),
    debtEvents:            readTable(SHEETS.DEBT_EVENTS),
    users:                 readTable(SHEETS.USERS),
    cashflowSnapshots:     readTable(SHEETS.CASHFLOW_SNAPS),
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
    case 'invoices':              return readTable(SHEETS.INVOICES);
    case 'forecastEntries':       return readTable(SHEETS.FORECAST_E);
    case 'bankAccounts':          return readTable(SHEETS.BANK);
    case 'pvVouchers':            return readTable(SHEETS.PV_VOUCHERS);
    case 'payables':              return readTable(SHEETS.PAYABLES);
    case 'debtLedger':            return readTable(SHEETS.DEBT_LEDGER);
    case 'receipts':              return readTable(SHEETS.RECEIPTS);
    case 'bankEntries':           return readTable(SHEETS.BANK_ENTRIES);
    case 'checks':                return readTable(SHEETS.CHECKS);
    case 'debtMaster':            return readTable(SHEETS.DEBT_MASTER);
    case 'bankTransfers':         return readTable(SHEETS.BANK_TRANSFERS);
    case 'stsServiceFee':         return readTable(SHEETS.STS_SERVICE_FEE);
    case 'stsPendingCalc':        return readTable(SHEETS.STS_PENDING_CALC);
    case 'stsCalcResult':         return readTable(SHEETS.STS_CALC_RESULT);
    case 'debtEvents':            return readTable(SHEETS.DEBT_EVENTS);
    case 'users':                 return readTable(SHEETS.USERS);
    case 'cashflowSnapshots':     return readTable(SHEETS.CASHFLOW_SNAPS);
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
  debtLedger:      [],
  receipts:        [],
  bankEntries:     [],
  checks:          [],
  debtMaster:      [],
  debtEvents:      [],
  users:           [],
  cashflowSnapshots: [],
  bankTransfers:   [],
  stsServiceFee:   [],
  stsPendingCalc:  [],
  stsCalcResult:   ['debtIds'],
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
  invoices: [
    'id','ivNo','jobNo','period','invoiceDate','balance',
    'status','expectedReceive','contactName','contactPhone',
    'followUps','actualReceive',
    // v2 fields parsed from "Olddata IV" (added 2026-05-23)
    'projectCode','projectName','customerCode','customerName',
    'dueDate','assignee','contractor','category',
    'actualReceiveDate','currentStatus','arNo','docType','refCode'
  ],
  // forecastEntries — extended for full cashflow lifecycle.
  //   STATUS:        PLANNED → ACTUAL → BOOKED  (or CANCELED).
  //                  PLANNED  = ประมาณการ ยังไม่เกิด
  //                  ACTUAL   = เห็นใน statement แล้ว แต่บัญชียังไม่ลง
  //                  BOOKED   = บัญชีลงระบบแล้ว มี ref doc
  //   CATEGORY:      1=ดำเนินงาน · 2=โครงการ · 3=ฝ่ายการเงิน · 4=เงินเดือน  (for cashflow page)
  //   CFS_ACTIVITY:  operating | investing | financing  (for future Cash Flow Statement)
  //   ACTUAL_*:      what actually appeared in bank statement
  //   REF_DOC:       JV / PV / AP voucher number when booked
  forecastEntries: [
    'id','DATE','PAYMENT_DATE','EXPENSE_TYPE','DESCRIPTION','JOB_NO',
    'PROJECT_NAME','AMOUNT','Bank_AC','STATUS','CATEGORY','IS_ACCRUED','NOTE',
    'ACTUAL_AMOUNT','ACTUAL_DATE','REF_DOC','BOOKED_AT','CFS_ACTIVITY'
  ],
  // bankAccounts — added accountType: main = หมุนเวียนรายวัน (ต้องบันทึกยอดทุกวัน),
  //                                  dormant = เงินนิ่ง (ฝากประจำ/ค้ำประกัน),
  //                                  closed = ปิดแล้ว (hide)
  bankAccounts: [
    'id','DATE','BANK_NAME','Bank_AC','BALANCE','AVAILABLE_BALANCE','HOLD_AMOUNT','NOTE',
    'accountType'
  ],
  // cashflowSnapshots — daily snapshot of each bank balance, manually keyed
  //   (or automatically captured via Apps Script trigger).
  //   1 row per (date × bankAc).
  cashflowSnapshots: [
    'id','date','bankAc','bankName','balance','takenAt','enteredBy','source','note'
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
  // debtLedger v2: ONE ROW PER MONTH PER CONTRACT (interest schedule rows)
  // Contract-level info now lives in debtMaster.
  debtLedger: [
    'id','contractNo','year','month',
    'principal','interestRate','days','interestAmount',
    'installment','principalPaid','outstanding',
    'paymentDate','note'
  ],
  receipts: [
    'id','receiptNo','receiptDate','invoiceNo','projectCode','projectName','period',
    'grossAmount','transferDeduction','netReceived','bankAccount','note'
  ],
  bankEntries: [
    'id','entryDate','bankName','accountNo','entryType','description',
    'amount','referenceNo','transferRef','linkedProjectCode','status','note'
  ],
  checks: [
    'id','checkNo','checkDate','payee','amount','bankName','accountNo',
    'referenceNo','linkedProjectCode','status','note'
  ],
  // ── v2 schemas (added 2026-05-23) ──────────────────────────────────
  debtMaster: [
    'id','debtCategory','contractNo','borrowerName','status',
    'bankName','accountNo',
    'startDate','endDate','termMonths','maturityDate',
    'principalAmount','interestRate','currency',
    'receiveDate','payDate',
    'principalIn','principalOut','balance',
    'projectCode','projectName','note',
    // Note: multi-drawdown + multi-repayment ย้ายไปอยู่ตาราง debtEvents
    // 1 contract = 1 row here; ทุก event (drawdown/repayment) = row ในตาราง debtEvents
    // (primary drawdown ครั้งที่ 1 ยังอยู่ใน receiveDate + principalAmount เพื่อ backward-compat)
  ],
  debtEvents: [
    'id','contractId','contractNo','eventType','eventDate','amount','note'
  ],
  // users — added notifyDailyBalance (boolean). When true, this user sees the
  //   "ยังไม่บันทึกยอดธนาคารวันนี้" reminder banner + auto-modal in the cashflow
  //   and daily-revenue pages. Default false (don't bother most users).
  users: [
    'id','username','password','displayName','role','active','note',
    'notifyDailyBalance'
  ],
  bankTransfers: [
    'id','maincode','acct_no','PL_PV_No','paytype','Type_of_Pmt',
    'Payee','paydate','Document_No','Chq_No','Chq_Date',
    'Bank_AC','Net_Amount','exchange','data_ty','remark'
  ],
  stsServiceFee: [
    'id','feeRate','effectiveFrom','note'
  ],
  stsPendingCalc: [
    'id','receiptId','invoiceId','projectCode',
    'amountReceived','receiveDate',
    'status','calculatedBy','calculatedAt','note'
  ],
  stsCalcResult: [
    'id','pendingCalcId','debtIds',
    'interestTotal','serviceFeeFull','serviceFeeNet',
    'encompassPayableId','note'
  ],
};

function _entitySheet(entity) {
  var map = {
    projects:        SHEETS.PROJECTS,
    invoices:        SHEETS.INVOICES,
    forecastEntries: SHEETS.FORECAST_E,
    bankAccounts:    SHEETS.BANK,
    pvVouchers:      SHEETS.PV_VOUCHERS,
    payables:        SHEETS.PAYABLES,
    debtLedger:      SHEETS.DEBT_LEDGER,
    receipts:        SHEETS.RECEIPTS,
    bankEntries:     SHEETS.BANK_ENTRIES,
    checks:          SHEETS.CHECKS,
    debtMaster:      SHEETS.DEBT_MASTER,
    bankTransfers:   SHEETS.BANK_TRANSFERS,
    stsServiceFee:   SHEETS.STS_SERVICE_FEE,
    stsPendingCalc:  SHEETS.STS_PENDING_CALC,
    stsCalcResult:   SHEETS.STS_CALC_RESULT,
    debtEvents:      SHEETS.DEBT_EVENTS,
    users:           SHEETS.USERS,
    cashflowSnapshots: SHEETS.CASHFLOW_SNAPS,
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

/* ── 9. V2 SETUP — create the 5 new sheets with headers ────────────
 * Run this ONCE after deploying v2 code. Safe to re-run (skips existing).
 * Also seeds stsServiceFee with default 6.5% row.
 * ────────────────────────────────────────────────────────────────── */
function setupV2Sheets() {
  var newSheets = [
    SHEETS.DEBT_MASTER,
    SHEETS.BANK_TRANSFERS,
    SHEETS.STS_SERVICE_FEE,
    SHEETS.STS_PENDING_CALC,
    SHEETS.STS_CALC_RESULT,
  ];
  var entityKeys = ['debtMaster', 'bankTransfers', 'stsServiceFee', 'stsPendingCalc', 'stsCalcResult'];
  var ss = _ss();
  var created = [];
  var skipped = [];

  newSheets.forEach(function (sheetName, idx) {
    var existing = ss.getSheetByName(sheetName);
    if (existing) {
      skipped.push(sheetName);
      return;
    }
    var sh = ss.insertSheet(sheetName);
    var headers = ENTITY_HEADERS[entityKeys[idx]];
    var headerRange = sh.getRange(1, 1, 1, headers.length);
    headerRange.setValues([headers]);
    headerRange.setFontWeight('bold').setBackground('#1a73e8').setFontColor('#ffffff');
    headerRange.setFontSize(10);
    sh.setFrozenRows(1);
    created.push(sheetName);
  });

  // Seed default STS service fee row (6.5%) if empty
  var feeSh = _ss().getSheetByName(SHEETS.STS_SERVICE_FEE);
  if (feeSh && feeSh.getLastRow() < 2) {
    feeSh.appendRow([newId_(), 0.065, '2020-01-01', 'อัตราเริ่มต้น 6.5% — เอนคอมพาส']);
  }

  // Migration: existing debtLedger had a different (contract-level) schema.
  // The v2 schema is row-per-month. If the existing sheet has the OLD headers,
  // rename it to debtLedger_v1_backup so the next replaceAll/import uses fresh.
  var dl = _ss().getSheetByName(SHEETS.DEBT_LEDGER);
  if (dl) {
    var oldHeaders = dl.getRange(1, 1, 1, dl.getLastColumn()).getValues()[0];
    if (oldHeaders.indexOf('debtNo') >= 0 || oldHeaders.indexOf('outstandingBalance') >= 0) {
      var backupName = SHEETS.DEBT_LEDGER + '_v1_backup';
      if (!_ss().getSheetByName(backupName)) {
        dl.setName(backupName);
      } else {
        dl.setName(backupName + '_' + Date.now());
      }
      // Create fresh debtLedger with v2 headers
      var fresh = _ss().insertSheet(SHEETS.DEBT_LEDGER);
      var dlHeaders = ENTITY_HEADERS.debtLedger;
      var range = fresh.getRange(1, 1, 1, dlHeaders.length);
      range.setValues([dlHeaders]);
      range.setFontWeight('bold').setBackground('#1a73e8').setFontColor('#ffffff');
      fresh.setFrozenRows(1);
      created.push(SHEETS.DEBT_LEDGER + ' (recreated; old data → ' + backupName + ')');
    }
  }

  Logger.log('Created: ' + JSON.stringify(created));
  Logger.log('Skipped (already existed): ' + JSON.stringify(skipped));
  return { created: created, skipped: skipped };
}

/* ── 10. V2 HEADER MIGRATION — extend existing sheets' header row ───
 * For sheets that EXISTED before v2 (invoices, checks) the header row
 * is shorter than the v2 canonical schema. This function appends the
 * new columns to the right of the existing headers so data rows pasted
 * with the v2 column order will land in named columns.
 *
 * Safe to re-run. Existing data rows are NOT touched.
 * ──────────────────────────────────────────────────────────────── */
function ensureV2Headers() {
  // Entity → sheet name map. Covers every entity that needs a flat-table sheet.
  var entityMap = {
    invoices:        SHEETS.INVOICES,
    checks:          SHEETS.CHECKS,
    debtLedger:      SHEETS.DEBT_LEDGER,
    receipts:        SHEETS.RECEIPTS,
    bankEntries:     SHEETS.BANK_ENTRIES,
    payables:        SHEETS.PAYABLES,
    projects:        SHEETS.PROJECTS,
    bankAccounts:    SHEETS.BANK,
    pvVouchers:      SHEETS.PV_VOUCHERS,
    forecastEntries: SHEETS.FORECAST_E,
    debtMaster:      SHEETS.DEBT_MASTER,
    bankTransfers:   SHEETS.BANK_TRANSFERS,
    stsServiceFee:   SHEETS.STS_SERVICE_FEE,
    stsPendingCalc:  SHEETS.STS_PENDING_CALC,
    stsCalcResult:   SHEETS.STS_CALC_RESULT,
    debtEvents:      SHEETS.DEBT_EVENTS,
    users:           SHEETS.USERS,
    cashflowSnapshots: SHEETS.CASHFLOW_SNAPS,
  };
  var results = [];
  Object.keys(entityMap).forEach(function (entity) {
    var sheetName = entityMap[entity];
    if (!sheetName) return;
    var sh = _ss().getSheetByName(sheetName);
    var canonical = ENTITY_HEADERS[entity];
    // CREATE sheet if missing (covers user not having run v1 init for this entity)
    if (!sh) {
      sh = _ss().insertSheet(sheetName);
      var headerRange = sh.getRange(1, 1, 1, canonical.length);
      headerRange.setValues([canonical]);
      headerRange.setFontWeight('bold').setBackground('#1a73e8').setFontColor('#ffffff');
      headerRange.setFontSize(10);
      sh.setFrozenRows(1);
      results.push(entity + ': CREATED sheet with ' + canonical.length + ' headers');
      return;
    }
    var lastCol = Math.max(sh.getLastColumn(), 1);
    var current = sh.getRange(1, 1, 1, lastCol).getValues()[0];
    // If header row is empty, write the full canonical set
    if (!current[0]) {
      sh.getRange(1, 1, 1, canonical.length).setValues([canonical]);
      sh.getRange(1, 1, 1, canonical.length).setFontWeight('bold')
        .setBackground('#1a73e8').setFontColor('#ffffff');
      sh.setFrozenRows(1);
      results.push(entity + ': wrote ' + canonical.length + ' headers (was empty)');
      return;
    }
    var missing = canonical.filter(function (h) { return current.indexOf(h) < 0; });
    if (missing.length === 0) { results.push(entity + ': already up to date'); return; }
    var startCol = current.length + 1;
    sh.getRange(1, startCol, 1, missing.length).setValues([missing]);
    sh.getRange(1, startCol, 1, missing.length).setFontWeight('bold')
      .setBackground('#1a73e8').setFontColor('#ffffff');
    results.push(entity + ': appended ' + missing.length + ' col(s): ' + missing.join(', '));
  });
  Logger.log(results.join('\n'));
  return results;
}
