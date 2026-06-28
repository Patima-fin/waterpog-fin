/* leasit_engine.jsx — engine สำหรับแท็บ "ลีซอิท" ในหน้า #debt
   - parseLeasitWorkbook(workbook) → {loans, prepaid, actual, refund}
   - litComputeTotals(loanId, prepaid, actual, refund)
   - litBuildExportWorkbook(loans, prepaid, actual, refund) → XLSX workbook
     (ชีตสรุปรวม + ชีตต่อสัญญา; ทุก Int.amount เป็นสูตร =Principal*Rate*Days/365
      เพื่อให้บัญชีตรวจการคำนวณดอกได้)

   ทุก identifier prefix LIT_ / lit*  (กัน global-scope name collision)
*/
'use strict';

/* ── Date helpers ────────────────────────────────────────────────────── */
// Excel serial → ISO YYYY-MM-DD (epoch 1899-12-30; 1900 leap bug แก้แล้ว)
function litSerialToISO(n) {
  var num = Number(n);
  if (!isFinite(num) || num <= 0) return '';
  // กัน date serial บั๊ก: ค่า > 100000 ก็ไม่ใช่วันที่
  if (num > 100000) return '';
  var ms = Math.round((num - 25569) * 86400000);
  var d = new Date(ms);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

// "DD/MM/YYYY" (Thai or CE) → ISO; ปี > 2400 → ลบ 543
function litDateStrToISO(s) {
  if (!s) return '';
  var str = String(s).trim();
  if (!str) return '';
  // ISO อยู่แล้ว
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  var m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (!m) return '';
  var d = parseInt(m[1], 10);
  var mo = parseInt(m[2], 10);
  var y = parseInt(m[3], 10);
  if (y < 100) y += 2500; // ฉ้วย: เปลี่ยน 2-digit เป็น พ.ศ.
  if (y > 2400) y -= 543;
  if (!d || !mo || !y || mo < 1 || mo > 12 || d < 1 || d > 31) return '';
  var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
  return y + '-' + pad(mo) + '-' + pad(d);
}

// ค่าใดๆ → ISO (Date, number=serial, string)
function litToISO(v) {
  if (v == null || v === '' || v === 0) return '';
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return '';
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === 'number') return litSerialToISO(v);
  return litDateStrToISO(v);
}

// ISO → days between (inclusive +1, ตรงกับสูตร DATEDIF+1 ในต้นฉบับ)
function litDaysBetween(startISO, endISO) {
  if (!startISO || !endISO) return 0;
  var a = new Date(startISO).getTime();
  var b = new Date(endISO).getTime();
  if (!isFinite(a) || !isFinite(b)) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

function litNum(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  var s = String(v).replace(/,/g, '').trim();
  if (!s) return 0;
  // วงเล็บ = ติดลบ
  if (/^\(.*\)$/.test(s)) s = '-' + s.slice(1, -1);
  var n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

function litTrim(v) {
  if (v == null) return '';
  return String(v).trim();
}

/* ── Header parsing (rows 1-9) — label-driven ─────────────────────────── */
// หาค่าใน "ช่องถัดจาก label" — เดิน row + col ที่ label match แล้วเอาค่าจาก col+offset
function litFindBesideLabel(aoa, label, opts) {
  opts = opts || {};
  var maxRow = opts.maxRow || 12;
  var offset = opts.offset || 1; // ค่ามักอยู่ช่องถัดไป
  var rx = label instanceof RegExp ? label : new RegExp(label);
  for (var r = 0; r < Math.min(maxRow, aoa.length); r++) {
    var row = aoa[r] || [];
    for (var c = 0; c < row.length; c++) {
      var cell = row[c];
      if (cell != null && rx.test(String(cell))) {
        // ลองช่องถัดไป (อาจเป็น merged → next non-null in same row)
        for (var d = c + 1; d <= c + 4 && d < row.length; d++) {
          var v = row[d];
          if (v != null && v !== '') return v;
        }
        return row[c + offset];
      }
    }
  }
  return null;
}

/* ── Schedule block parsing ──────────────────────────────────────────── */
// หาแถว header ของ schedule block
//   layout ใหม่: Type | Month | Year | เริ่ม | สิ้นสุด | Principal | …
//   layout เก่า:        Month | Year | เริ่ม | สิ้นสุด | Principal | …  (ไม่มี Type → ทุกแถว = Prepaid)
// คืน { row: r, hasType: bool } หรือ null ถ้าหาไม่เจอ
function litFindScheduleHeader(aoa, startRow) {
  for (var r = startRow || 0; r < aoa.length; r++) {
    var row = aoa[r] || [];
    var c0 = litTrim(row[0]).toLowerCase();
    var c1 = litTrim(row[1]).toLowerCase();
    var c2 = litTrim(row[2]).toLowerCase();
    var c3 = litTrim(row[3]).toLowerCase();
    // layout ใหม่ (with Type) — col 0 = "Type" / "Prepaid" / "Actual" (variant ในบางชีต)
    //   หัวคอลัมน์ที่ค้ำคือ col 1=Month + col 2=Year
    if ((c0 === 'type' || c0 === 'prepaid' || c0 === 'actual')
        && (c1 === 'month' || c1 === 'เดือน')
        && (c2 === 'year' || c2 === 'ปี')) {
      return { row: r, hasType: true };
    }
    // layout เก่า (no Type) — col 0 = Month/เดือน, col 1 = Year/ปี
    if ((c0 === 'month' || c0 === 'เดือน') && (c1 === 'year' || c1 === 'ปี')
        && (c2 === 'เริ่ม' || c2 === 'start' || c2 === 'beginning')
        && (c3 === 'สิ้นสุด' || c3 === 'end')) {
      return { row: r, hasType: false };
    }
  }
  return null;
}

// อ่านแถว schedule ตั้งแต่ headerRow+1
//   hasType=true:  col 0 = Type (Prepaid/Actual) — กรองตาม expectType
//   hasType=false: ไม่มี Type — ทุกแถวที่มีเดือน/ปี/ยอด = ของ expectType (Prepaid implicit)
function litReadScheduleRows(aoa, headerRow, expectType, hasType) {
  var rows = [];
  var seq = 0;
  var endRow = headerRow + 1;
  // offset ของแต่ละ field — old layout shift ซ้าย 1 ช่อง
  var off = hasType ? 0 : -1;
  var cMonth = 1 + off, cYear = 2 + off, cStart = 3 + off, cEnd = 4 + off;
  var cPrincipal = 5 + off, cRate = 6 + off, cDays = 7 + off, cInt = 8 + off;
  var cInst = 9 + off, cPaid = 10 + off, cOut = 11 + off;
  for (var r = headerRow + 1; r < aoa.length; r++) {
    var row = aoa[r] || [];
    if (hasType) {
      var t = litTrim(row[0]);
      if (!t) {
        if (rows.length > 0) { endRow = r; break; }
        continue;
      }
      if (expectType && t !== expectType) {
        endRow = r;
        break;
      }
    } else {
      // no-Type layout: หยุดเมื่อ Month + Year ว่างทั้งคู่ (= แถวจบ)
      var mEmpty = !litTrim(row[cMonth]);
      var yEmpty = !litNum(row[cYear]);
      // และยอด Principal ว่าง = ไม่ใช่ data row
      var pEmpty = !litNum(row[cPrincipal]);
      if (mEmpty && yEmpty && pEmpty) {
        if (rows.length > 0) { endRow = r; break; }
        continue;
      }
    }
    seq++;
    var dateStart = litToISO(row[cStart]);
    var dateEnd = litToISO(row[cEnd]);
    var rawDays = litNum(row[cDays]);
    var days = (rawDays > 0 && rawDays <= 366) ? Math.round(rawDays) : litDaysBetween(dateStart, dateEnd);
    rows.push({
      seq: seq,
      month: litTrim(row[cMonth]),
      year: litNum(row[cYear]) || null,
      dateStart: dateStart,
      dateEnd: dateEnd,
      days: days,
      principal: litNum(row[cPrincipal]),
      intRate: litNum(row[cRate]),
      intAmount: litNum(row[cInt]),
      installment: litNum(row[cInst]),
      principalPaid: litNum(row[cPaid]),
      outstanding: litNum(row[cOut])
    });
    endRow = r + 1;
  }
  return { rows: rows, endRow: endRow };
}

/* ── Refund block parsing — free-text rows in col 3 + amount in col 5 ── */
// เริ่มจาก startRow (มัก = หลังแถว "ส่วนต่าง") กวาดทุกแถวจนจบ aoa
function litReadRefundRows(aoa, startRow) {
  var rows = [];
  for (var r = startRow; r < aoa.length; r++) {
    var row = aoa[r] || [];
    var text = litTrim(row[2]);
    var amt = litNum(row[4]);
    if (!text || amt === 0) continue;
    // ตัดแถว "รวม" / "ส่วนต่าง" / "ยอดดอกเบี้ย..." / sub-total
    if (/^(รวม|ส่วนต่าง|Total|ยอดดอกเบี้ย)/i.test(text)) continue;
    // กำหนดประเภท + วันที่ + ref จากข้อความ
    var refundType = 'Transfer';
    if (/RV/i.test(text)) refundType = 'RV';
    // ดึงวันที่จากข้อความ DD/MM/YYYY
    var refundDate = '';
    var dm = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (dm) refundDate = litDateStrToISO(dm[0]);
    // ดึง ref doc (RV20XXXX-XXX)
    var refDoc = '';
    var rm = text.match(/RV\s*\d{4}[-\s]*\d{2,4}/i);
    if (rm) refDoc = rm[0].replace(/\s+/g, '');
    rows.push({
      refundDate: refundDate,
      refundType: refundType,
      amount: amt,
      refDoc: refDoc,
      note: text
    });
  }
  return rows;
}

/* ── parseLeasitWorkbook — main entry ────────────────────────────────── */
// คืน {loans, prepaid, actual, refund, registry, errors[]}
function parseLeasitWorkbook(wb) {
  if (!wb || !wb.SheetNames) return { loans: [], prepaid: [], actual: [], refund: [], errors: ['ไม่ใช่ workbook'] };
  var XLSX = window.XLSX;
  if (!XLSX) return { loans: [], prepaid: [], actual: [], refund: [], errors: ['ไม่พบ XLSX'] };

  var errors = [];
  var loans = [];
  var prepaid = [];
  var actual = [];
  var refund = [];

  // 1) ทะเบียนโครงการ (เผื่อ enrich)
  var registry = {};
  if (wb.SheetNames.indexOf('รายชื่อโครงการ') >= 0) {
    var rws = wb.Sheets['รายชื่อโครงการ'];
    var raoa = XLSX.utils.sheet_to_json(rws, { header: 1, raw: true, defval: null });
    for (var ri = 2; ri < raoa.length; ri++) {
      var rrow = raoa[ri] || [];
      var lid = litNum(rrow[1]);
      if (lid > 0) {
        registry[lid] = {
          jobNo: litTrim(rrow[2]).split(/[-\s]/)[0] || litTrim(rrow[2]),
          siteName: litTrim(rrow[2]),
          productType: litTrim(rrow[3]),
          contractStart: litToISO(rrow[9]),
          contractEnd: litToISO(rrow[10])
        };
      }
    }
  }

  // 1b) ★ สรุปรวม sheet — authoritative ticket type + วันที่จ่ายเงิน (refDocs) per loanId
  //     col 4 (E) "ประเภท" = PRE/POS/NON
  //     col 17 (R) วันที่จ่ายงวด 1 · col 18 (S) เลขที่เอกสารงวด 1
  //     col 19 (T) วันที่จ่ายงวด 2 · col 20 (U) เลขที่เอกสารงวด 2
  var summaryTicket = {};      // {loanId: 'PRE'|'POS'|'NON'}
  var summaryRepayDocs = {};   // {loanId: [{date:ISO, doc:'RV…'}, …]}
  if (wb.SheetNames.indexOf('สรุปรวม') >= 0) {
    var sws = wb.Sheets['สรุปรวม'];
    var saoa = XLSX.utils.sheet_to_json(sws, { header: 1, raw: true, defval: null });
    for (var si = 6; si < saoa.length; si++) {
      var srow = saoa[si] || [];
      var slid = litNum(srow[0]);
      if (slid <= 0) continue;
      var stype = litTrim(srow[4]).toUpperCase();
      if (stype === 'PRE' || stype === 'POS' || stype === 'NON') {
        summaryTicket[slid] = stype;
      }
      // ดึงวันที่จ่ายงวด 1/2 + refDocs + ★ ยอดจริง (col 22/23)
      var docs = [];
      var d1 = litToISO(srow[17]);
      if (d1) docs.push({ date: d1, doc: litTrim(srow[18]), amount: litNum(srow[22]) });
      var d2 = litToISO(srow[19]);
      if (d2) docs.push({ date: d2, doc: litTrim(srow[20]), amount: litNum(srow[23]) });
      if (docs.length) summaryRepayDocs[slid] = docs;
    }
  }

  // 2) เดินทุกชีตที่ชื่อเป็นเลขล้วน (= per-loan sheet)
  for (var i = 0; i < wb.SheetNames.length; i++) {
    var name = wb.SheetNames[i];
    if (!/^\d+$/.test(name)) continue;
    try {
      var ws = wb.Sheets[name];
      var aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
      if (!aoa.length) continue;

      // 2a) Header block (rows 1-9)
      var contractNo = litTrim(litFindBesideLabel(aoa, /เลขสัญญาเงินกู้/));
      var projectName = litTrim(litFindBesideLabel(aoa, /ชื่อโครงการ/));
      var dateReceived = litToISO(litFindBesideLabel(aoa, /วันที่รับเงิน/));
      var dateDue = litToISO(litFindBesideLabel(aoa, /^วันที่ครบกำหนด$/));
      // ครบกำหนด(โรล) — label มีวงเล็บ ใช้ regex หลวมๆ
      var dateDueRoll = litToISO(litFindBesideLabel(aoa, /วันที่ครบกำหนด.*โรล/));
      var dateRepaid = litToISO(litFindBesideLabel(aoa, /วันที่คืนเงิน/));
      var principalChequeNo = litTrim(litFindBesideLabel(aoa, /เลขที่เช็คเงินต้น/));
      var principal = litNum(litFindBesideLabel(aoa, /จำนวนเงินกู้/));
      var interestRate = litNum(litFindBesideLabel(aoa, /อัตราดอกเบี้ย/));
      var termDays = litNum(litFindBesideLabel(aoa, /ระยะเวลากู้/));
      var ticketType = litTrim(litFindBesideLabel(aoa, /ประเภทตั๋ว/));

      // loanId — หา label "ลำดับที่" ก่อน; fallback = ชื่อชีต
      var loanId = litNum(litFindBesideLabel(aoa, /ลำดับที่/, { maxRow: 9 })) || litNum(name);
      if (!loanId) {
        errors.push('ชีต ' + name + ': หา loanId ไม่ได้');
        continue;
      }

      // 2b) Prepaid block
      var hdr1 = litFindScheduleHeader(aoa, 0);
      if (!hdr1) {
        errors.push('ชีต ' + name + ': ไม่พบ header row Type|Month|Year');
        continue;
      }
      var rpre = litReadScheduleRows(aoa, hdr1.row, 'Prepaid', hdr1.hasType);

      // 2c) Actual block — header ถัดไป (เฉพาะ layout ใหม่ที่มี Type → มี Actual block แยก)
      var racta = { rows: [], endRow: rpre.endRow };
      if (hdr1.hasType) {
        var hdr2 = litFindScheduleHeader(aoa, rpre.endRow);
        if (hdr2) racta = litReadScheduleRows(aoa, hdr2.row, 'Actual', hdr2.hasType);
      }

      // 2d) Summary block + refund — refund เริ่มหลังแถว "ส่วนต่าง"
      //   layout ใหม่: สรุป → ยอดล่วงหน้า → ยอดเกิดจริง → ส่วนต่าง → (refunds)
      //   layout เก่า: ไม่มี Actual/สรุป → refund (ถ้ามี) อยู่ท้ายชีต
      var refundStart = racta.endRow;
      for (var r2 = racta.endRow; r2 < aoa.length; r2++) {
        var row2 = aoa[r2] || [];
        var lbl = litTrim(row2[2]);
        if (/^ส่วนต่าง/.test(lbl)) { refundStart = r2 + 1; break; }
      }
      var refunds = litReadRefundRows(aoa, refundStart);

      // 2e) project_id link (จาก registry / jobNo)
      var reg = registry[loanId] || {};
      var jobNo = reg.jobNo || '';
      // jobNo อาจอยู่ใน projectName field (เช่น "PP054 ...") — ลองดึง
      if (!jobNo) {
        var jm = projectName.match(/^([A-Z]{2,5}\d{2,4})/);
        if (jm) jobNo = jm[1];
      }

      // 2f) คำนวณ totals
      var totPre = 0; for (var ip = 0; ip < rpre.rows.length; ip++) totPre += rpre.rows[ip].intAmount;
      var totAct = 0; for (var ia = 0; ia < racta.rows.length; ia++) totAct += racta.rows[ia].intAmount;
      var variance = totPre - totAct;
      var totRef = 0; for (var ire = 0; ire < refunds.length; ire++) totRef += refunds[ire].amount;
      var refundOutstanding = variance - totRef;

      // 2g) สถานะ — ปิดหนี้ถ้ามีวันคืนเงิน
      var status = dateRepaid ? 'Close' : 'Active';

      // 2h) ★ ticket type: ใช้ summary เป็นหลัก (authoritative)
      //     ชีตเดี่ยวเป็น fallback (กรณีไม่มี summary entry)
      var resolvedTicket = summaryTicket[loanId] || ticketType.toUpperCase();
      if (resolvedTicket !== 'PRE' && resolvedTicket !== 'POS' && resolvedTicket !== 'NON') {
        resolvedTicket = 'POS';   // default ถ้าระบุไม่ชัด
      }

      loans.push({
        loanId: loanId,
        contractNo: contractNo,
        jobNo: jobNo,
        projectName: projectName,
        ticketType: resolvedTicket,
        productType: reg.productType || '',
        loanType: resolvedTicket === 'NON' ? 'NON' : resolvedTicket === 'POS' ? 'POS' : 'PRE',
        interestRate: interestRate,
        principal: principal,
        dateReceived: dateReceived,
        dateDue: dateDue,
        dateDueRoll: dateDueRoll || '',
        termDays: termDays,
        principalChequeNo: principalChequeNo,
        dateRepaid: dateRepaid || '',
        status: status,
        totalPrepaidInterest: totPre,
        totalActualInterest: totAct,
        variance: variance,
        totalRefunded: totRef,
        refundOutstanding: refundOutstanding
      });

      // child rows — แนบ loanId
      for (var pj = 0; pj < rpre.rows.length; pj++) {
        rpre.rows[pj].loanId = loanId;
        prepaid.push(rpre.rows[pj]);
      }
      // ★ เก็บ principal repayment events จาก actual rows ที่ principalPaid > 0
      //   declining principal → จาก actual block ของ source Excel (loan 49 = 2,461,003.95 + 233,996.05)
      var principalEvents = [];
      for (var aj = 0; aj < racta.rows.length; aj++) {
        racta.rows[aj].loanId = loanId;
        actual.push(racta.rows[aj]);
        var pp = Number(racta.rows[aj].principalPaid) || 0;
        if (pp > 0.01) {
          principalEvents.push({
            refundDate: racta.rows[aj].dateEnd || racta.rows[aj].paymentDate || '',
            amount: pp,
            kind: 'principal',
            refundType: 'Transfer',
            note: 'จากตารางคำนวณ (Actual block)',
            refDoc: '',
            loanId: loanId
          });
        }
      }
      // แนบ refDoc จาก สรุปรวม เรียงตามวันที่ (chronological)
      if (summaryRepayDocs[loanId] && principalEvents.length) {
        var sdocs = summaryRepayDocs[loanId].slice().sort(function (a, b) {
          return String(a.date).localeCompare(String(b.date));
        });
        principalEvents.sort(function (a, b) {
          return String(a.refundDate).localeCompare(String(b.refundDate));
        });
        for (var ei = 0; ei < principalEvents.length && ei < sdocs.length; ei++) {
          if (sdocs[ei].doc) principalEvents[ei].refDoc = sdocs[ei].doc;
          if (sdocs[ei].date) principalEvents[ei].refundDate = sdocs[ei].date;
        }
      }
      // ★ LAST RESORT: ถ้าปิดสัญญาแล้ว แต่ summary ไม่มีวันจ่ายงวด 1/2 (loan งวดเดียว) →
      //    สร้าง refund ที่ dateRepaid + amount = principal เต็ม
      if (principalEvents.length === 0 && status === 'Close' && dateRepaid &&
          !(summaryRepayDocs[loanId] && summaryRepayDocs[loanId].length > 0)) {
        principalEvents.push({
          refundDate: dateRepaid,
          amount: principal,
          kind: 'principal', refundType: 'Transfer',
          note: 'จากวันคืนเงิน (ปิดงวดเดียว)',
          refDoc: '',
          loanId: loanId
        });
      }
      // ★ FALLBACK: ถ้า actual block ไม่มี principalPaid > 0 (เช่น loan 49 ที่ detail
      //    sheet ว่าง) แต่ summary มีวันที่จ่าย → สร้าง refund entries จาก summary
      //    ใช้ยอดจริงจาก col 22/23 (จ่ายงวด 1/2) ถ้ามี · ถ้าไม่มี = แบ่งเท่ากัน
      if (principalEvents.length === 0 && summaryRepayDocs[loanId] &&
          summaryRepayDocs[loanId].length > 0 && status === 'Close') {
        var sd = summaryRepayDocs[loanId];
        // ถ้ามียอดจริงครบทุกงวด → ใช้ตามจริง, ไม่งั้น fallback แบ่งเท่ากัน
        var hasAllAmounts = sd.every(function (x) { return Number(x.amount) > 0; });
        var fallbackPer = principal / sd.length;
        for (var sdi = 0; sdi < sd.length; sdi++) {
          var amt = hasAllAmounts ? Number(sd[sdi].amount) : fallbackPer;
          principalEvents.push({
            refundDate: sd[sdi].date,
            amount: amt,
            kind: 'principal', refundType: 'Transfer',
            note: hasAllAmounts ? 'จากสรุปรวม (ยอดจริงจากตาราง)' : 'จากสรุปรวม (แบ่งเงินต้นเท่ากัน · ตรวจยอดจริง)',
            refDoc: sd[sdi].doc || '',
            loanId: loanId
          });
        }
      }
      // ★ คำนวณยอดเงินต้นที่จ่ายคืนรวม + ปรับ status ถ้า partial repayment
      var totalPrincipalRepaid = 0;
      for (var pe = 0; pe < principalEvents.length; pe++) {
        totalPrincipalRepaid += Number(principalEvents[pe].amount) || 0;
        refund.push(principalEvents[pe]);
      }
      // ปรับ status: ถ้า partial (paid < principal) → Active ไม่ใช่ Close
      if (totalPrincipalRepaid > 0 && totalPrincipalRepaid < principal - 1) {
        status = 'Active';
        loans[loans.length - 1].status = 'Active';
        loans[loans.length - 1].dateRepaid = '';
      }
      // ส่ง principalRepaid ไปกับ loan object สำหรับ litLoanToDebtRow
      loans[loans.length - 1].principalRepaid = totalPrincipalRepaid;
      for (var rj = 0; rj < refunds.length; rj++) {
        refunds[rj].loanId = loanId;
        refund.push(refunds[rj]);
      }
    } catch (e) {
      errors.push('ชีต ' + name + ': ' + (e.message || e));
    }
  }

  return { loans: loans, prepaid: prepaid, actual: actual, refund: refund, registry: registry, errors: errors };
}

/* ── compute totals (recompute หลัง edit) ─────────────────────────────── */
function litComputeTotals(loanId, prepaid, actual, refund) {
  var totPre = 0, totAct = 0, totRef = 0;
  for (var i = 0; i < prepaid.length; i++) if (prepaid[i].loanId === loanId) totPre += litNum(prepaid[i].intAmount);
  for (var j = 0; j < actual.length; j++) if (actual[j].loanId === loanId) totAct += litNum(actual[j].intAmount);
  for (var k = 0; k < refund.length; k++) if (refund[k].loanId === loanId) totRef += litNum(refund[k].amount);
  return {
    totalPrepaidInterest: totPre,
    totalActualInterest: totAct,
    variance: totPre - totAct,
    totalRefunded: totRef,
    refundOutstanding: totPre - totAct - totRef
  };
}

/* ── debtMaster row ↔ Leasit ─────────────────────────────────────────── */
// แปลง loan object → debtMaster row (id namespaced 'lit_<loanId>')
function litLoanToDebtRow(loan, existingId) {
  return {
    id: existingId || ('lit_' + loan.loanId),
    debtCategory: 'LIT',
    contractNo: loan.contractNo,
    borrowerName: 'บจก. ลีซอิท',
    status: loan.status,            // 'Active' / 'Close'
    facilityType: 'Loan',
    loanType: loan.loanType,        // 'PRE' / 'NON'
    principalAmount: loan.principal,
    interestRate: loan.interestRate,
    balance: loan.status === 'Active' ? (loan.principal - (loan.principalRepaid || 0)) : 0,
    currency: 'THB',
    projectCode: loan.jobNo,
    projectName: loan.projectName,
    // Leasit-specific (เก็บไว้ใน debtMaster row, ไม่กระทบฟิลด์เดิม)
    leasitSource: true,
    leasitLoanId: loan.loanId,
    leasitTicketType: loan.ticketType,
    leasitProductType: loan.productType,
    leasitDateReceived: loan.dateReceived,
    leasitDateDue: loan.dateDue,
    leasitDateDueRoll: loan.dateDueRoll,
    leasitDateRepaid: loan.dateRepaid,
    leasitTermDays: loan.termDays,
    leasitPrincipalChequeNo: loan.principalChequeNo,
    leasitTotalPrepaid: loan.totalPrepaidInterest,
    leasitTotalActual: loan.totalActualInterest,
    leasitVariance: loan.variance,
    leasitRefunded: loan.totalRefunded,
    leasitRefundOutstanding: loan.refundOutstanding,
    leasitPrincipalRepaid: loan.principalRepaid || 0,
    // วันครบกำหนดสำหรับ maturity alert ในหน้า #debt_ledger
    maturityDate: loan.dateDueRoll || loan.dateDue || ''
  };
}

/* ── Cell styles (xlsx-js-style supports `s` property) ────────────────── */
var LIT_STYLE_HEADER = {
  font: { name: 'TH SarabunPSK', bold: true, sz: 11, color: { rgb: 'FFFFFFFF' } },
  fill: { patternType: 'solid', fgColor: { rgb: 'FF2A6FDB' } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  border: {
    top: { style: 'thin', color: { rgb: 'FF1A4490' } },
    bottom: { style: 'thin', color: { rgb: 'FF1A4490' } },
    left: { style: 'thin', color: { rgb: 'FF1A4490' } },
    right: { style: 'thin', color: { rgb: 'FF1A4490' } }
  }
};
var LIT_STYLE_TITLE = {
  font: { name: 'TH SarabunPSK', bold: true, sz: 14, color: { rgb: 'FF1A4490' } },
  alignment: { horizontal: 'left', vertical: 'center' }
};
var LIT_STYLE_LABEL = {
  font: { name: 'TH SarabunPSK', bold: true, sz: 10, color: { rgb: 'FF1A4490' } },
  alignment: { horizontal: 'left', vertical: 'center' }
};
var LIT_STYLE_TOTAL = {
  font: { name: 'TH SarabunPSK', bold: true, sz: 11, color: { rgb: 'FF1A4490' } },
  fill: { patternType: 'solid', fgColor: { rgb: 'FFE8F0FA' } },
  alignment: { horizontal: 'right', vertical: 'center' },
  border: {
    top: { style: 'medium', color: { rgb: 'FF2A6FDB' } },
    bottom: { style: 'double', color: { rgb: 'FF2A6FDB' } }
  }
};
var LIT_STYLE_GRAND = {
  font: { name: 'TH SarabunPSK', bold: true, sz: 12, color: { rgb: 'FFFFFFFF' } },
  fill: { patternType: 'solid', fgColor: { rgb: 'FF1A4490' } },
  alignment: { horizontal: 'right', vertical: 'center' },
  border: { top: { style: 'double', color: { rgb: 'FF1A4490' } } }
};
var LIT_STYLE_CELL = {
  font: { name: 'TH SarabunPSK', sz: 10 },
  alignment: { vertical: 'center' },
  border: {
    top: { style: 'thin', color: { rgb: 'FFE0E7F0' } },
    bottom: { style: 'thin', color: { rgb: 'FFE0E7F0' } },
    left: { style: 'thin', color: { rgb: 'FFE0E7F0' } },
    right: { style: 'thin', color: { rgb: 'FFE0E7F0' } }
  }
};
var LIT_STYLE_MONEY = Object.assign({}, LIT_STYLE_CELL, {
  alignment: { vertical: 'center', horizontal: 'right' },
  numFmt: '#,##0.00'
});
var LIT_STYLE_DATE = Object.assign({}, LIT_STYLE_CELL, {
  alignment: { vertical: 'center', horizontal: 'center' },
  numFmt: 'dd/mm/yyyy'
});
var LIT_STYLE_SUMMARY_LABEL = {
  font: { name: 'TH SarabunPSK', bold: true, sz: 10, color: { rgb: 'FF1A4490' } },
  fill: { patternType: 'solid', fgColor: { rgb: 'FFF4F8FE' } },
  alignment: { horizontal: 'right', vertical: 'center' },
  border: { top: { style: 'thin', color: { rgb: 'FF2A6FDB' } } }
};

// helper: ใส่ style ลง cell (ใช้กับ ws[cellRef])
function litStyleCell(ws, cellRef, style, isNumber, isDate) {
  var c = ws[cellRef];
  if (!c) ws[cellRef] = c = { v: '', t: 's' };
  c.s = style;
  if (isNumber && c.v != null && c.v !== '') { c.t = 'n'; if (style.numFmt) c.z = style.numFmt; }
  if (isDate && c.v && (c.v instanceof Date)) { c.t = 'd'; if (style.numFmt) c.z = style.numFmt; }
}
function litColLetter(n) {
  var s = '';
  while (n >= 0) { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; }
  return s;
}

/* ── Export Excel workbook (มีสูตรคำนวณดอกเบี้ย + style สวย) ────────── */
// คืน workbook object (ใช้กับ XLSX.writeFile) — บัญชีตรวจสูตร =F*G*H/365 ได้
function litBuildExportWorkbook(loans, prepaid, actual, refund) {
  var XLSX = window.XLSX;
  if (!XLSX) return null;
  var wb = XLSX.utils.book_new();

  // ── ชีต "สรุปรวม" — master summary (มีสูตร SUM ข้ามชีต) ─────────────
  var sumHeader = [
    'ลำดับที่', 'เลขที่สัญญา', 'JOB NO', 'ชื่อโครงการ', 'ประเภท', 'สถานะ',
    'อัตราดอกเบี้ย', 'วันที่รับเงิน', 'วันที่ครบกำหนด', 'ระยะเวลา(วัน)',
    'จำนวนเงินกู้',
    'รวมดอกจ่ายล่วงหน้า', 'รวมดอกเกิดจริง', 'ส่วนต่าง',
    'รับคืนแล้ว', 'ค้างรับคืน',
    'วันที่คืนเงิน'
  ];
  var sumRows = [sumHeader];
  // เรียงตาม loanId
  var sortedLoans = loans.slice().sort(function (a, b) { return a.loanId - b.loanId; });
  for (var i = 0; i < sortedLoans.length; i++) {
    var L = sortedLoans[i];
    var sheetName = String(L.loanId);
    var safeRef = "'" + sheetName + "'!";
    sumRows.push([
      L.loanId,
      L.contractNo,
      L.jobNo,
      L.projectName,
      L.loanType,
      L.status,
      L.interestRate,
      L.dateReceived ? new Date(L.dateReceived) : '',
      L.dateDue ? new Date(L.dateDue) : '',
      L.termDays,
      L.principal,
      // สูตรลิงก์เข้าชีตต่อสัญญา (cells = สรุปบล็อก)
      { f: safeRef + 'E34' },  // รวมดอกจ่ายล่วงหน้า
      { f: safeRef + 'E35' },  // รวมดอกเกิดจริง
      { f: safeRef + 'E36' },  // ส่วนต่าง
      L.totalRefunded,         // value (refund รวม)
      { f: safeRef + 'E36-' + L.totalRefunded.toFixed(2) }, // ค้างรับคืน
      L.dateRepaid ? new Date(L.dateRepaid) : ''
    ]);
  }
  // grand total row
  var lastRow = sumRows.length;
  sumRows.push([
    'รวมทั้งสิ้น', '', '', '', '', '', '', '', '', '',
    { f: 'SUM(K2:K' + lastRow + ')' },
    { f: 'SUM(L2:L' + lastRow + ')' },
    { f: 'SUM(M2:M' + lastRow + ')' },
    { f: 'SUM(N2:N' + lastRow + ')' },
    { f: 'SUM(O2:O' + lastRow + ')' },
    { f: 'SUM(P2:P' + lastRow + ')' },
    ''
  ]);
  var wsSum = XLSX.utils.aoa_to_sheet(sumRows);
  wsSum['!cols'] = [
    { wch: 8 }, { wch: 22 }, { wch: 10 }, { wch: 30 }, { wch: 8 }, { wch: 8 },
    { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 14 },
    { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }
  ];
  // ★ apply styles to summary sheet
  // Header row (row 0) — บนสุด สีฟ้า bold
  var sumNCols = sumHeader.length;
  for (var ch = 0; ch < sumNCols; ch++) {
    litStyleCell(wsSum, litColLetter(ch) + '1', LIT_STYLE_HEADER);
  }
  // Data rows (rows 1..lastRow-1)
  var moneyColsSum = [10, 11, 12, 13, 14, 15];  // K=10 (จำนวนเงินกู้), L-P money
  var dateColsSum = [7, 8, 16];  // H, I, Q
  for (var dr = 1; dr < lastRow; dr++) {
    for (var dc = 0; dc < sumNCols; dc++) {
      var isMoney = moneyColsSum.indexOf(dc) >= 0;
      var isDate = dateColsSum.indexOf(dc) >= 0;
      var style = isMoney ? LIT_STYLE_MONEY : (isDate ? LIT_STYLE_DATE : LIT_STYLE_CELL);
      litStyleCell(wsSum, litColLetter(dc) + (dr + 1), style, isMoney, isDate);
    }
  }
  // Grand total row — สีฟ้าเข้ม
  for (var gc = 0; gc < sumNCols; gc++) {
    litStyleCell(wsSum, litColLetter(gc) + (lastRow + 1), LIT_STYLE_GRAND, moneyColsSum.indexOf(gc) >= 0);
  }
  // ★ freeze ส่วนหัว
  wsSum['!freeze'] = { xSplit: 0, ySplit: 1 };
  XLSX.utils.book_append_sheet(wb, wsSum, 'สรุปรวม');

  // ── ชีตต่อสัญญา — มีสูตร =F*G*H/365 ในคอลัมน์ Int.amount ───────────
  for (var li = 0; li < sortedLoans.length; li++) {
    var loan = sortedLoans[li];
    var rows = [];

    // R1-9: header block
    rows.push(['บริษัท วอเทอร์ป๊อก จำกัด']);
    rows.push(['ตารางสรุปดอกเบี้ยรายโครงการ']);
    rows.push(['เลขสัญญาเงินกู้', loan.contractNo, '', '', 'ประเภทตั๋ว', loan.ticketType || '']);
    rows.push(['ชื่อโครงการ', loan.projectName]);
    rows.push([
      'วันที่รับเงิน', loan.dateReceived ? new Date(loan.dateReceived) : '',
      '', 'วันที่ครบกำหนด', loan.dateDue ? new Date(loan.dateDue) : '',
      '', 'วันที่ครบกำหนด(โรล)', loan.dateDueRoll ? new Date(loan.dateDueRoll) : '',
      '', '', 'ลำดับที่', loan.loanId
    ]);
    rows.push([
      'วันที่คืนเงิน', loan.dateRepaid ? new Date(loan.dateRepaid) : '',
      '', 'เลขที่เช็คเงินต้น', loan.principalChequeNo || ''
    ]);
    rows.push(['จำนวนเงินกู้', loan.principal]);
    rows.push(['อัตราดอกเบี้ย/ปี', loan.interestRate, '', '', '', '', '', '', '', '', 'เลขที่ตั๋ว', loan.contractNo]);
    rows.push(['ระยะเวลากู้', loan.termDays, '', '', '', '', '', { f: 'SUM(I11:I100)' }, { f: 'SUM(J11:J100)' }]);

    // R10: schedule header
    rows.push(['Type', 'Month', 'Year', 'เริ่ม', 'สิ้นสุด', 'Principal', 'Int. rate', 'Days', 'Int. amount', 'Installment', 'Principal paid', 'Outstanding']);

    // R11..: Prepaid rows — Int.amount เป็นสูตร =F*G*H/365
    var preRows = prepaid.filter(function (p) { return p.loanId === loan.loanId; });
    preRows.sort(function (a, b) { return (a.seq || 0) - (b.seq || 0); });
    var preStartRow = 11; // 1-indexed
    for (var pi = 0; pi < preRows.length; pi++) {
      var p = preRows[pi];
      var r = preStartRow + pi;
      rows.push([
        'Prepaid', p.month, p.year,
        p.dateStart ? new Date(p.dateStart) : '',
        p.dateEnd ? new Date(p.dateEnd) : '',
        p.principal, p.intRate,
        { f: 'DATEDIF(D' + r + ',E' + r + ',"d")+1' },
        { f: 'F' + r + '*G' + r + '*H' + r + '/365' },
        { f: 'I' + r },
        0,
        ''  // Outstanding ปล่อยว่าง (สูตร running ไม่ critical ต่อ recon)
      ]);
    }
    // เติมแถวว่างให้ครบช่วง Prepaid block (กัน sub-total chunk shift)
    var preEndRow = preStartRow + preRows.length - 1;
    // 2 blank rows ก่อน subtotal
    rows.push([]); rows.push([]); rows.push([]);
    var preSubtotalRow = rows.length + 1; // 1-indexed
    rows.push(['', '', '', '', '', '', '', '', { f: 'SUM(I' + preStartRow + ':I' + preEndRow + ')' }]);

    // marker "ดอกเบี้ยที่เกิดขึ้นจริง"
    rows.push(['', 'ดอกเบี้ยที่เกิดขึ้นจริง']);

    // Actual header
    rows.push(['Type', 'Month', 'Year', 'เริ่ม', 'สิ้นสุด', 'Principal', 'Int. rate', 'Days', 'Int. amount', 'Installment', 'Principal paid', 'Outstanding']);
    var actRows = actual.filter(function (a) { return a.loanId === loan.loanId; });
    actRows.sort(function (a, b) { return (a.seq || 0) - (b.seq || 0); });
    var actStartRow = rows.length + 1;
    for (var ai = 0; ai < actRows.length; ai++) {
      var a = actRows[ai];
      var ar = actStartRow + ai;
      rows.push([
        'Actual', a.month, a.year,
        a.dateStart ? new Date(a.dateStart) : '',
        a.dateEnd ? new Date(a.dateEnd) : '',
        a.principal, a.intRate,
        { f: 'DATEDIF(D' + ar + ',E' + ar + ',"d")+1' },
        { f: 'F' + ar + '*G' + ar + '*H' + ar + '/365' },
        { f: 'I' + ar },
        0,
        ''
      ]);
    }
    var actEndRow = actStartRow + actRows.length - 1;
    var actSubtotalRow = rows.length + 1;
    rows.push(['', '', '', '', '', '', '', '', { f: 'SUM(I' + actStartRow + ':I' + actEndRow + ')' }]);

    // สรุป block
    rows.push([]);
    var sumStartRow = rows.length + 1;
    rows.push(['', 'สรุป', 'ยอดดอกเบี้ยจ่ายล่วงหน้า', '', { f: 'I' + preSubtotalRow }]);
    rows.push(['', '', 'ยอดดอกเบี้ยที่เกิดขึ้นจริง', '', { f: 'I' + actSubtotalRow }]);
    rows.push(['', '', 'ส่วนต่าง', '', { f: 'E' + sumStartRow + '-E' + (sumStartRow + 1) }]);
    rows.push([]);

    // refund block — list refund rows
    var refRows = refund.filter(function (rf) { return rf.loanId === loan.loanId; });
    refRows.sort(function (a, b) { return (a.refundDate || '').localeCompare(b.refundDate || ''); });
    var refStart = rows.length + 1;
    for (var rfi = 0; rfi < refRows.length; rfi++) {
      var rf = refRows[rfi];
      var lbl = rf.refundType === 'RV' ? 'คืนมาแล้วตอน RV' : ('โอนคืน วันที่ ' + (rf.refundDate || ''));
      if (rf.refDoc) lbl += ' (' + rf.refDoc + ')';
      rows.push(['', '', lbl, '', rf.amount]);
    }
    var refEnd = rows.length;
    rows.push(['', '', 'รวมรับคืนแล้ว', '', refRows.length ? { f: 'SUM(E' + refStart + ':E' + refEnd + ')' } : 0]);
    rows.push(['', '', 'ค้างรับคืน', '', { f: 'E' + (sumStartRow + 2) + '-E' + (rows.length) }]);

    var ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 18 }, { wch: 12 }, { wch: 8 }, { wch: 11 }, { wch: 11 },
      { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 14 }, { wch: 14 },
      { wch: 14 }, { wch: 14 }
    ];
    // ★ apply styles ต่อสัญญา
    // Title rows 1-2 (header text)
    litStyleCell(ws, 'A1', LIT_STYLE_TITLE);
    litStyleCell(ws, 'A2', LIT_STYLE_TITLE);
    // Header block rows 3-9 (labels left col + values)
    for (var hr = 3; hr <= 9; hr++) {
      litStyleCell(ws, 'A' + hr, LIT_STYLE_LABEL);
      litStyleCell(ws, 'D' + hr, LIT_STYLE_LABEL);
      litStyleCell(ws, 'G' + hr, LIT_STYLE_LABEL);
      litStyleCell(ws, 'K' + hr, LIT_STYLE_LABEL);
    }
    // Schedule header row 10 — สีฟ้าเข้ม
    for (var sh = 0; sh < 12; sh++) {
      litStyleCell(ws, litColLetter(sh) + '10', LIT_STYLE_HEADER);
    }
    // Body rows: Prepaid + Actual sections
    // Money cols: F(5)Principal, G(6)rate, I(8)Int.amount, J(9)Installment, K(10)Paid, L(11)Outstanding
    // Date cols: D(3)เริ่ม, E(4)สิ้นสุด
    var totalRows = rows.length;
    var moneyCols = [5, 6, 8, 9, 10, 11];
    var dateCols = [3, 4];
    for (var br = 11; br <= totalRows; br++) {
      for (var bc = 0; bc < 12; bc++) {
        var isM = moneyCols.indexOf(bc) >= 0;
        var isD = dateCols.indexOf(bc) >= 0;
        var st = isM ? LIT_STYLE_MONEY : (isD ? LIT_STYLE_DATE : LIT_STYLE_CELL);
        litStyleCell(ws, litColLetter(bc) + br, st, isM, isD);
      }
    }
    // สรุป section (sumStartRow+0..+2) + refund + final
    if (sumStartRow) {
      for (var sr = sumStartRow; sr <= sumStartRow + 2; sr++) {
        for (var sc = 1; sc <= 5; sc++) {
          litStyleCell(ws, litColLetter(sc) + sr, sc === 5 ? LIT_STYLE_TOTAL : LIT_STYLE_SUMMARY_LABEL, sc === 5);
        }
      }
    }
    // freeze หัวตาราง
    ws['!freeze'] = { xSplit: 0, ySplit: 10 };
    XLSX.utils.book_append_sheet(wb, ws, String(loan.loanId));
  }

  return wb;
}

/* ── Manual data entry helpers — สำหรับ form CRUD ─────────────────────── */
// Generate ตารางดอกเบี้ยรายเดือนแบบ split (เริ่ม → สิ้นเดือน → ต้นเดือนถัดไป → สิ้นสุด)
// ใช้สูตร principal × rate × days / 365 ตรงกับต้นทาง.
// คืน array {seq, month, year, dateStart, dateEnd, days, principal, intRate, intAmount, ...}
function litGenerateMonthlySchedule(principal, rate, startISO, endISO) {
  if (!startISO || !endISO || !principal || !rate) return [];
  var monthName = ['', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  // คำนวณวันที่จาก {y,m,d} เป็น ISO "YYYY-MM-DD" — เลี่ยง Date.toISOString() ที่จะ shift TZ
  function ymdToISO(y, m, d) {
    // normalize: ถ้า m หรือ d เกินขอบเขต ใช้ Date คำนวณแล้วดึง local components
    if (d < 1 || d > 28) {
      var t = new Date(y, m - 1, d);
      return t.getFullYear() + '-' + pad2(t.getMonth() + 1) + '-' + pad2(t.getDate());
    }
    return y + '-' + pad2(m) + '-' + pad2(d);
  }
  function isoToYMD(iso) {
    var p = String(iso).slice(0, 10).split('-');
    return { y: +p[0], m: +p[1], d: +p[2] };
  }
  function lastDayOf(y, m) {
    // last day of month m (1-12) of year y
    return new Date(y, m, 0).getDate();
  }
  function cmpISO(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
  function addDays(iso, n) {
    var p = isoToYMD(iso);
    var dt = new Date(p.y, p.m - 1, p.d + n);
    return dt.getFullYear() + '-' + pad2(dt.getMonth() + 1) + '-' + pad2(dt.getDate());
  }

  if (cmpISO(startISO, endISO) >= 0) return [];

  var rows = [];
  var seq = 0;
  var cursorISO = startISO.slice(0, 10);
  while (cmpISO(cursorISO, endISO) < 0) {
    var cur = isoToYMD(cursorISO);
    var checkpointISO;
    if (cur.d <= 20) {
      checkpointISO = ymdToISO(cur.y, cur.m, 20);
    } else {
      checkpointISO = ymdToISO(cur.y, cur.m, lastDayOf(cur.y, cur.m));
    }
    var segEndISO = cmpISO(checkpointISO, endISO) < 0 ? checkpointISO : endISO;
    // mid-segment: inclusive ทั้ง 2 ขอบ → +1 (e.g. Dec 4-20 = 17 days)
    // last segment (ติด endISO = วันครบกำหนด): exclusive end → ไม่ +1 (วันครบกำหนดไม่นับ)
    var isLast = segEndISO === endISO;
    var rawDiff = Math.round((new Date(segEndISO).getTime() - new Date(cursorISO).getTime()) / 86400000);
    var days = isLast ? rawDiff : rawDiff + 1;
    if (days <= 0) break;
    var intAmount = principal * rate * days / 365;
    seq++;
    rows.push({
      seq: seq,
      month: monthName[cur.m],
      year: cur.y,
      dateStart: cursorISO,
      dateEnd: segEndISO,
      days: days,
      principal: principal,
      intRate: rate,
      intAmount: intAmount,
      installment: intAmount,
      principalPaid: 0,
      outstanding: principal,
      chequeNo: '',
      paymentDate: ''
    });
    cursorISO = addDays(segEndISO, 1);
  }
  return rows;
}

// คำนวณ termDays จากวันที่ (= end - start, ไม่ +1; วันครบกำหนดเป็นวันคืนเงิน ไม่นับ)
function litCalcTermDays(startISO, endISO) {
  if (!startISO || !endISO) return 0;
  var a = new Date(startISO).getTime();
  var b = new Date(endISO).getTime();
  if (!isFinite(a) || !isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
}

// สร้าง loanId ถัดไป (สูงสุด + 1) จาก debtMaster rows ที่เป็น leasit
function litNextLoanId(debtMasterRows) {
  var maxId = 0;
  (debtMasterRows || []).forEach(function (r) {
    if (r.leasitSource && r.leasitLoanId > maxId) maxId = r.leasitLoanId;
  });
  return maxId + 1;
}

// สร้าง row ว่างสำหรับฟอร์มเพิ่มใหม่
function litBlankLoanDraft(debtMasterRows) {
  return {
    leasitLoanId: litNextLoanId(debtMasterRows),
    contractNo: '',
    projectCode: '',
    projectName: '',
    leasitTicketType: 'PRE',
    principalAmount: 0,
    interestRate: 0.15,
    leasitDateReceived: '',
    leasitDateDue: '',
    leasitDateDueRoll: '',
    leasitDateRepaid: '',
    leasitTermDays: 0,
    leasitPrincipalChequeNo: '',
    leasitInterestChequeNo: '',
    status: 'Active',
    note: ''
  };
}

// ค้นหาโครงการจาก data.projects — return top N matches
// match: substring on Contract No. / Site Name / ชื่อโครงการ / code / siteName / jobNo
function litSearchProjects(projects, query, limit) {
  limit = limit || 8;
  if (!Array.isArray(projects)) return [];
  var q = String(query || '').trim().toLowerCase();
  if (!q) return projects.slice(0, limit).map(litProjectToOption);
  var matches = [];
  for (var i = 0; i < projects.length && matches.length < limit * 3; i++) {
    var p = projects[i];
    var code = String(p['Contract No.'] || p.code || p.jobNo || '').toLowerCase();
    var name = String(p['Site Name'] || p['ชื่อโครงการ'] || p.siteName || p.name || p.projectName || '').toLowerCase();
    if (code.indexOf(q) >= 0 || name.indexOf(q) >= 0) {
      matches.push(litProjectToOption(p));
    }
  }
  return matches.slice(0, limit);
}
function litProjectToOption(p) {
  return {
    code: String(p['Contract No.'] || p.code || p.jobNo || '').trim(),
    name: String(p['Site Name'] || p['ชื่อโครงการ'] || p.siteName || p.name || p.projectName || '').trim(),
    _raw: p
  };
}

// คำนวณ Actual schedule จากวันรับ → วันคืนเงิน (ใช้ตอนปิดสัญญา)
// = monthly split เดียวกับ prepaid แต่ตัดที่ dateRepaid
function litGenerateActualFromClose(principal, rate, startISO, repaidISO) {
  if (!startISO || !repaidISO) return [];
  return litGenerateMonthlySchedule(principal, rate, startISO, repaidISO);
}

// expose
window.LeasitEngine = {
  parseLeasitWorkbook: parseLeasitWorkbook,
  litComputeTotals: litComputeTotals,
  litLoanToDebtRow: litLoanToDebtRow,
  litBuildExportWorkbook: litBuildExportWorkbook,
  litToISO: litToISO,
  litNum: litNum,
  litDaysBetween: litDaysBetween,
  litGenerateMonthlySchedule: litGenerateMonthlySchedule,
  litGenerateActualFromClose: litGenerateActualFromClose,
  litCalcTermDays: litCalcTermDays,
  litNextLoanId: litNextLoanId,
  litBlankLoanDraft: litBlankLoanDraft,
  litSearchProjects: litSearchProjects
};
