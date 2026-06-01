/* page_cashflow.jsx — แผนประมาณการจ่ายรายสัปดาห์ (redesigned 2026-05-26)
 *
 * Layout (3 sections):
 *  A. Strategic Management headline + 4 KPI tiles (B/F, LOAN, INFLOW, OUTFLOW)
 *     with Forecast/Actual/% for each
 *  B. Plan section — 3 columns: CURRENT WEEK | REST OF MONTH | TOTAL
 *     Inflow rows: B/F, project receipts, loan forecast
 *     Outflow rows: 4 categories (Operating / Project / Finance / Salary)
 *  C. Weekly Actual Tracking — 5 small tables side-by-side, plus Grand Total
 *
 * Data sources:
 *  - cashflowSnapshots — daily bank balance snapshots
 *  - bankAccounts — live balance (sum of main accounts)
 *  - invoices — INFLOW forecast (expectedReceive in month) + actual (actualReceive)
 *  - payables — OUTFLOW forecast (group by due2 week × category)
 *  - pvVouchers — OUTFLOW actual (group by Pmt_Date week × category)
 *  - forecastEntries — manual entries with new STATUS lifecycle
 *    (PLANNED / ACTUAL / BOOKED / CANCELED) + CFS_ACTIVITY field
 *
 * Category mapping (4 categories for outflow):
 *  1 = ดำเนินงาน (operating, default)
 *  2 = โครงการ (project — has jobcode in payables)
 *  3 = ฝ่ายการเงิน (FIN — dpt_code='FIN' OR forecastEntry.CATEGORY=3)
 *  4 = เงินเดือน (salary — forecastEntry.CATEGORY=4)
 *
 * AP-PV match:
 *  - Exclude payables where vchno equals any pvVouchers.AP_No (already paid)
 *
 * Week convention:
 *  - Monday-based bucketing within the month
 *  - W1 may be partial (days before first Monday)
 *  - Max 5 weeks per month, fewer if month is short
 */
'use strict';

const { useState: cfState, useMemo: cfMemo, useEffect: cfEffect } = React;

// ─── Week helpers ──────────────────────────────────────────────────────────
function getMonthWeeksMonday(year, month) {
  // month is 1-indexed (Jan = 1)
  const lastDay = new Date(year, month, 0).getDate();
  const buckets = [];
  // Find first Monday day-of-month (1..7)
  let firstMonday = -1;
  for (let d = 1; d <= 7; d++) {
    if (new Date(year, month - 1, d).getDay() === 1) { firstMonday = d; break; }
  }
  // Pre-week (days 1..firstMonday-1), if any — labeled W1
  if (firstMonday > 1) {
    buckets.push({ from: 1, to: firstMonday - 1, partial: true });
  }
  // Each Monday → 7-day bucket (capped at lastDay)
  let day = firstMonday;
  while (day <= lastDay) {
    const end = Math.min(day + 6, lastDay);
    buckets.push({ from: day, to: end, partial: end - day < 6 });
    day += 7;
  }
  buckets.forEach((b, i) => {
    b.idx = i;
    b.label = 'W' + (i + 1);
    b.fromISO = `${year}-${String(month).padStart(2, '0')}-${String(b.from).padStart(2, '0')}`;
    b.toISO   = `${year}-${String(month).padStart(2, '0')}-${String(b.to).padStart(2, '0')}`;
  });
  return buckets;
}
// แปลงค่าวันที่ให้เป็น ISO 'YYYY-MM-DD' — รองรับทั้ง ISO และ DD/MM/YYYY (แบบไทย)
//   ⚠️ สำคัญ: บาง field (เช่น payables.due2) เก็บเป็น "DD/MM/YYYY" ซึ่ง new Date()
//   จะอ่านเป็น MM/DD/YYYY (US) ทำให้เดือนเพี้ยน — ต้อง normalize ก่อนทุกครั้ง
function toISODate(v) {
  if (!v) return '';
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);   // already ISO
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);  // DD/MM/YYYY (Thai)
  if (m) {
    let [, dd, mm, yyyy] = m;
    if (Number(yyyy) > 2400) yyyy = String(Number(yyyy) - 543);  // พ.ศ. → ค.ศ.
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  return s;
}
function findWeekIdx(dateISO, weeks) {
  const iso = toISODate(dateISO);
  if (!iso) return -1;
  const day = Number(iso.split('-')[2]);
  if (!day) return -1;
  return weeks.findIndex(w => day >= w.from && day <= w.to);
}
function inMonth(dateISO, year, month) {
  const iso = toISODate(dateISO);
  if (!iso) return false;
  const [y, m] = iso.split('-').map(Number);
  return y === year && m === month;
}

// ─── Category mapping for outflow (4 categories) ──────────────────────────
// Labels match the M_Forecast Excel exactly:
//   1 = ค่าใช้จ่ายดำเนินงานรายสัปดาห์    (everyday operations — default)
//   2 = ค่าใช้จ่ายเกี่ยวกับโครงการและงานติดตั้ง  (project-tied costs)
//   3 = ต้นทุนทางการเงินและดอกเบี้ย      (interest / bank fees / WHT)
//   4 = ค่าใช้จ่ายเบ็ดเตล็ดและเงินเดือน    (misc + salary)
//
// Auto-classify logic (smart heuristic):
//   1. Manual override wins — cf_category field
//   2. Keyword match for finance cost (cat 3): ดอกเบี้ย, ค่าธรรมเนียม, interest, bank fee
//   3. jobcode/jobname present → cat 2 (project)
//   4. dpt_code = FIN by itself is NOT enough for cat 3 (FIN dept also has operating costs)
//   5. Default → cat 1 (operating)
function categorizePayable(ap) {
  // Layer 1: manual override
  const override = parseInt(ap.cf_category || '0', 10);
  if (override >= 1 && override <= 4) return override;
  // Layer 2: finance-cost keyword match (cat 3)
  const text = (
    String(ap.cust_name || '') + ' ' +
    String(ap.remark || '') + ' ' +
    String(ap.docno || '') + ' ' +
    String(ap.refno || '') + ' ' +
    String(ap.vendor_group || '')
  ).toLowerCase();
  if (/ดอกเบี้ย|interest|ค่าธรรมเนียม|bank fee|wht|withhold|หัก ?ณ ?ที่จ่าย|ค่าบริการ ?ธนาคาร/i.test(text)) {
    return 3;
  }
  // Layer 3: project (cat 2)
  if (ap.jobcode || ap.jobname) return 2;
  // Layer 4: default — operating
  return 1;
}
function categorizeForecastEntry(fe) {
  // Explicit CATEGORY field wins (1-4)
  const cat = parseInt(fe.CATEGORY || fe.category || '0', 10);
  if (cat >= 1 && cat <= 4) return cat;
  // Fallback heuristics on description
  const desc = String(fe.DESCRIPTION || fe.description || '').toLowerCase();
  if (/เงินเดือน|salary|payroll|เบ็ดเตล็ด|misc|petty|รับรอง/i.test(desc)) return 4;
  if (/ดอกเบี้ย|interest|ค่าธรรมเนียม|bank fee/i.test(desc))                return 3;
  return 1;
}
const CATEGORY_LABELS = {
  1: 'ค่าใช้จ่ายดำเนินงานรายสัปดาห์',
  2: 'ค่าใช้จ่ายเกี่ยวกับโครงการและงานติดตั้ง',
  3: 'ต้นทุนทางการเงินและดอกเบี้ย',
  4: 'ค่าใช้จ่ายเบ็ดเตล็ดและเงินเดือน',
};
// Short labels for the weekly tracking section (compact tables)
const CATEGORY_LABELS_SHORT = {
  1: 'ดำเนินงาน',
  2: 'โครงการ',
  3: 'การเงิน',
  4: 'เบ็ดเตล็ด',
};

// ─── Flexible vendors ("จ่ายตามสภาพคล่อง") ────────────────────────────────
//   เจ้าหนี้กลุ่มที่ "ไม่จ่ายตามดิว" — เลือกจ่ายตามเงินที่มี
//   AP ของกลุ่มนี้จะถูกตัดออกจากการจัดตามวันครบกำหนด (หมวด 1-4)
//   แล้วไปรวมเป็น "pool" ก้อนเดียว ให้ผู้ใช้คีย์เองว่างวดนี้จะจ่ายเท่าไหร่
//   เก็บรายชื่อ (เศษชื่อ — match แบบ contains) ใน localStorage แก้ได้
const CF_FLEX_LS_KEY = 'wtp-cf-flexible-vendors';
const CF_FLEX_DEFAULTS = [
  'เอเซีย วอเตอร์', 'เวลโกร', 'อินโนวาเทค', 'พินพอยท์', 'เอสทีอาร์', 'ธารา วอเตอร์',
  'เอ็นคอนเนค', 'เคพีเอส', 'โทเทิล',   // เผื่อสะกดต่าง/ยังไม่มี AP — แก้ทีหลังได้
];
function cfLoadFlexVendors() {
  try { const v = JSON.parse(localStorage.getItem(CF_FLEX_LS_KEY) || 'null'); return Array.isArray(v) ? v : CF_FLEX_DEFAULTS.slice(); }
  catch (_) { return CF_FLEX_DEFAULTS.slice(); }
}
function cfSaveFlexVendors(list) { try { localStorage.setItem(CF_FLEX_LS_KEY, JSON.stringify(list)); } catch (_) {} }
function cfIsFlexibleVendor(name, fragments) {
  const n = String(name || '').toLowerCase();
  if (!n) return false;
  return (fragments || []).some(f => f && n.includes(String(f).toLowerCase()));
}

// ─── Inflow helpers ────────────────────────────────────────────────────────
// "คาดรับสุทธิ" = ยอดที่คาดว่าจะรับเข้ามาจริง หลังหัก WHT และภาระหนี้
//
// สูตรเดียวกับหน้าใบแจ้งหนี้ (page_invoices.jsx):
//   netExpected = balance × 106/107 (หัก WHT 1% จากยอดก่อน VAT) − debt
//   debt = resolveDebt(iv, financeByCode[jobNo])   ← ภาระหนี้จาก projectFinance
//
// Note: ต้องส่ง financeByCode เข้ามาเพื่อให้ debt ตรงกับที่ IV report ใช้
//   (resolveDebt() exposed globally จาก page_invoices.jsx)
function ivNetExpected(iv, financeByCode) {
  const bal = Number(iv.balance) || 0;
  // ถ้ามี financeByCode ให้ lookup debt แบบเดียวกับ IV report
  let debt;
  if (financeByCode && typeof window.resolveDebt === 'function') {
    const jobNo = String(iv.jobNo || '').replace(/-(?:GW|TC|HH|PG|GP|GG)$/i, '');
    const f = financeByCode[jobNo] || financeByCode[iv.contractRef] || {};
    debt = window.resolveDebt(iv, f);
  } else {
    debt = Number(iv.debt) || 0;
  }
  return bal * 106 / 107 - debt;
}
function ivIsPaid(iv) {
  const s = String(iv.status || '').toLowerCase();
  return s === 'paid' || s === 'รับชำระแล้ว';
}
// ประมาณการรับเงินจะนับเฉพาะ IV ที่กำลัง "ติดตามรับเงิน" — ไม่นับ pending_inspection (ยังไม่ตรวจรับ)
// หรือ issue (ติดปัญหา ยังไม่แน่ว่าจะรับได้)
function ivIsTracking(iv) {
  const s = String(iv.status || '').toLowerCase();
  return s === 'tracking' || s === 'อยู่ระหว่างติดตามเงิน';
}
function ivActualReceiveDate(iv) {
  if (!iv.actualReceive) return null;
  // followUps is parsed JSON in data_sync, actualReceive may be object or string
  if (typeof iv.actualReceive === 'object' && iv.actualReceive.date) return iv.actualReceive.date;
  if (typeof iv.actualReceive === 'string') {
    try { const o = JSON.parse(iv.actualReceive); return o.date || null; } catch (_) { return null; }
  }
  return null;
}

// ─── AP-PV match (filter out paid AP) ─────────────────────────────────────
function buildPaidVchnoSet(pvVouchers) {
  const set = new Set();
  (pvVouchers || []).forEach(pv => { if (pv.AP_No) set.add(pv.AP_No); });
  return set;
}

// ─── Snapshot helpers ──────────────────────────────────────────────────────
function getBalanceAtDate(snapshots, dateISO) {
  // Return sum of latest snapshot per bankAc on or before dateISO
  if (!dateISO) return 0;
  const latestPerAc = {};
  (snapshots || []).forEach(s => {
    if (!s.date || s.date > dateISO) return;
    const prev = latestPerAc[s.bankAc];
    if (!prev || s.date > prev.date) latestPerAc[s.bankAc] = s;
  });
  return Object.values(latestPerAc).reduce((sum, s) => sum + (Number(s.balance) || 0), 0);
}
// ยอดเงินสด "ต้นงวด" ที่ cutoff — ปกติใช้ snapshot ล่าสุด ≤ cutoff
//   แต่ถ้าไม่มี snapshot ในเดือนเดียวกับ cutoff เลย (ข้อมูลขาด → ยอดค้างเก่า)
//   ให้ fallback มาใช้ "ยอดสดปัจจุบัน" แทน เพื่อไม่ให้หยิบยอดเดือนเก่ามาแสดงผิด
function openingBalanceAt(snapshots, cutoffISO, liveBalance) {
  if (!cutoffISO) return liveBalance;
  const ym = String(cutoffISO).slice(0, 7);  // 'YYYY-MM' ของ cutoff
  const hasInMonth = (snapshots || []).some(s =>
    s.date && String(s.date).slice(0, 7) === ym && s.date <= cutoffISO);
  return hasInMonth ? getBalanceAtDate(snapshots, cutoffISO) : liveBalance;
}

// ─── Main page ─────────────────────────────────────────────────────────────
function CashFlowDashboard({ data, setData, toast }) {
  const today = new Date();
  const [year, setYear]   = cfState(today.getFullYear());
  const [month, setMonth] = cfState(today.getMonth() + 1);
  const [editMode, setEditMode] = cfState(false);  // Manual override mode
  useOverrideSubAny();  // re-render หน้าทุกครั้งที่ override เปลี่ยน (sum/total/% ใช้ค่าใหม่)

  // Drill-down popup: { title, rows, kind } where kind ∈ {iv, loan, ap, fe, mixed}
  const [drillDown, setDrillDown] = cfState(null);
  // Per-item detail popup (ซ้อนบน drill-down) — เก็บ item ที่กด "ดู"
  const [detailItem, setDetailItem] = cfState(null);
  // Flexible-vendor group ("จ่ายตามสภาพคล่อง")
  const [flexVendors, setFlexVendors] = cfState(cfLoadFlexVendors());
  const [flexEditOpen, setFlexEditOpen] = cfState(false);  // modal แก้รายชื่อ

  // Footer notes — พับเก็บไว้ (ผู้บริหารเห็นแค่เนื้อหาหลัก) กดเปิดเองถ้าอยากดู
  const [showNotes, setShowNotes] = cfState(false);

  // Override key prefix per month — ค่าที่กรอกจะแยกตามเดือนที่ดู
  const ovPrefix = `cf.${year}.${String(month).padStart(2, '0')}`;

  // ── Month weeks (Monday-based) ────────────────────────────────────────
  const weeks = cfMemo(() => getMonthWeeksMonday(year, month), [year, month]);

  // ── Current week index (auto, but user can override) ──────────────────
  const [currentWeekOverride, setCurrentWeekOverride] = cfState(null);
  const autoNowWeek = cfMemo(() => {
    if (today.getFullYear() !== year || (today.getMonth() + 1) !== month) return 0;
    return Math.max(0, findWeekIdx(today.toISOString().slice(0, 10), weeks));
  }, [year, month, weeks]);
  const nowWeek = currentWeekOverride != null ? currentWeekOverride : autoNowWeek;

  // ── Data sources ──────────────────────────────────────────────────────
  const invoices       = data.invoices || [];
  const payables       = data.payables || [];
  const pvVouchers     = data.pvVouchers || [];
  const forecastEntries= data.forecastEntries || [];
  const snapshots      = data.cashflowSnapshots || [];
  const bankAccounts   = data.bankAccounts || [];

  // ── financeByCode lookup (เหมือนหน้า IV) — ใช้คำนวณ debt + netExpected ──
  const financeByCode = cfMemo(() => {
    if (window.WTPData && typeof window.WTPData.buildLookups === 'function') {
      try { return window.WTPData.buildLookups(data).financeByCode || {}; }
      catch (_) { return {}; }
    }
    return {};
  }, [data.projects, data.debtLedger]);
  const mainAccounts   = bankAccounts.filter(a => (a.accountType || 'main').toLowerCase() !== 'closed' && (a.accountType || 'main').toLowerCase() !== 'dormant');

  // ── Live balance + HOLD (sum across main bank accounts) ──────────────
  //   liveBalance     = ยอดรวมที่อยู่ในบัญชี (gross)
  //   liveHold        = ยอดที่กันไว้ HOLD (เช่น ค้ำประกัน LG, เช็คออกแล้วยังไม่ขึ้น)
  //   liveAvailable   = ใช้ได้จริง = balance - HOLD
  const liveBalance   = mainAccounts.reduce((s, a) => s + (Number(a.BALANCE) || 0), 0);
  const liveHold      = mainAccounts.reduce((s, a) => s + (Number(a.HOLD_AMOUNT) || 0), 0);
  const liveAvailable = liveBalance - liveHold;

  // ── B/F: balance at last day of previous month (auto from snapshots) ──
  //   ถ้าไม่มี snapshot ในเดือนก่อนเลย (ข้อมูลขาด) → fallback ใช้ยอดสดปัจจุบัน
  //   วันที่ 1 (ยังไม่มีรายการ) ยอดยกมาจะ = ใช้ได้ปัจจุบันโดยอัตโนมัติ
  const monthBF = cfMemo(() => {
    const prevYear  = month === 1 ? year - 1 : year;
    const prevMonth = month === 1 ? 12 : month - 1;
    const lastDayPrev = new Date(prevYear, prevMonth, 0).getDate();
    const cutoff = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(lastDayPrev).padStart(2, '0')}`;
    return openingBalanceAt(snapshots, cutoff, liveBalance);
  }, [snapshots, year, month, liveBalance]);
  // B/F แสดงเป็น Available (ยอดหลังหัก HOLD) — เพื่อสะท้อนเงินที่ใช้วางแผนจริงได้
  const monthBFAvailable = Math.max(0, monthBF - liveHold);

  // ── AP-PV match: exclude AP that has a matching PV ────────────────────
  const paidVchnoSet = cfMemo(() => buildPaidVchnoSet(pvVouchers), [pvVouchers]);

  // ── Flexible vendors — AP กลุ่มที่จ่ายตามสภาพคล่อง (ไม่ตามดิว) ──────────
  const isFlexAp = (ap) => cfIsFlexibleVendor(ap.cust_name || ap.vendor, flexVendors);
  //   pool = ยอดค้างรวมของกลุ่มนี้ (เฉพาะที่ยังไม่จ่าย) + แยกรายเจ้าหนี้
  const flexPool = cfMemo(() => {
    const byVendor = {};
    let total = 0, count = 0;
    payables.forEach(ap => {
      if (!isFlexAp(ap)) return;
      if (paidVchnoSet.has(ap.vchno)) return;      // จ่ายแล้วไม่นับ
      const amt = Number(ap.netpayment || ap.Amount || 0);
      if (!amt) return;
      total += amt; count++;
      const v = ap.cust_name || ap.vendor || '—';
      byVendor[v] = (byVendor[v] || 0) + amt;
    });
    const rows = Object.entries(byVendor).map(([name, sum]) => ({ name, sum })).sort((a, b) => b.sum - a.sum);
    return { total, count, rows };
  }, [payables, paidVchnoSet, flexVendors]);

  // ยอดที่ "เลือกจ่าย" งวดนี้ (คีย์เอง, sync ผ่าน override, แยกตามเดือน)
  const flexPayCurrent = Math.abs(WTPOverride.resolve(`${ovPrefix}.s01.flex.current`, 0));
  const flexPayRest    = Math.abs(WTPOverride.resolve(`${ovPrefix}.s01.flex.rest`, 0));

  // ── Bucket AP forecast outflow by week × category ─────────────────────
  //   Plan baseline — รวม AP ทุกใบ (จ่ายแล้ว/ยังไม่จ่าย) ที่ due ในเดือนนี้
  //   เพราะ AP ที่จ่ายแล้วก็เคยเป็นส่วนหนึ่งของแผน — ต้องนับเพื่อให้ Plan vs Actual = 100%
  //   ตอนจ่ายครบ (ไม่ใช่ 0 ทั้งที่จ่ายไปแล้ว)
  // [week][category] = sum
  const apForecastByWeekCat = cfMemo(() => {
    const grid = weeks.map(() => ({ 1: 0, 2: 0, 3: 0, 4: 0 }));
    payables.forEach(ap => {
      if (isFlexAp(ap)) return;   // กลุ่มจ่ายตามสภาพคล่อง — ไม่จัดตามดิว (แยก pool)
      const due = ap.due2 || ap.due || ap.vchdate;
      if (!inMonth(due, year, month)) return;
      const wIdx = findWeekIdx(due, weeks);
      if (wIdx < 0) return;
      const cat = categorizePayable(ap);
      const amt = Number(ap.netpayment || ap.Amount || 0);
      grid[wIdx][cat] += amt;
    });
    // Also include forecastEntries (non-LOAN, status=PLANNED, outflow side)
    forecastEntries.forEach(fe => {
      const status = String(fe.STATUS || fe.status || '').toUpperCase();
      if (status === 'CANCELED') return;
      const isLoan = String(fe.EXPENSE_TYPE || fe.CATEGORY || '').toUpperCase() === 'LOAN';
      if (isLoan) return;
      const amt = Number(fe.AMOUNT || fe.amount || 0);
      if (amt >= 0) return;   // outflow only
      const date = fe.PAYMENT_DATE || fe.DATE || fe.paymentDate;
      if (!inMonth(date, year, month)) return;
      const wIdx = findWeekIdx(date, weeks);
      if (wIdx < 0) return;
      const cat = categorizeForecastEntry(fe);
      grid[wIdx][cat] += Math.abs(amt);
    });
    return grid;
  }, [payables, forecastEntries, paidVchnoSet, weeks, year, month, flexVendors]);

  // ── PV actual outflow by week × category ──────────────────────────────
  const pvActualByWeekCat = cfMemo(() => {
    const grid = weeks.map(() => ({ 1: 0, 2: 0, 3: 0, 4: 0 }));
    pvVouchers.forEach(pv => {
      const date = pv.Pmt_Date;
      if (!inMonth(date, year, month)) return;
      const wIdx = findWeekIdx(date, weeks);
      if (wIdx < 0) return;
      // Categorize by linked AP if possible (lookup vchno)
      let cat = 1;
      if (pv.AP_No) {
        const ap = payables.find(p => p.vchno === pv.AP_No);
        if (ap) cat = categorizePayable(ap);
      }
      const amt = Number(pv.Net_Amount || pv.Amount || 0);
      grid[wIdx][cat] += amt;
    });
    // Also include forecastEntries with STATUS in {ACTUAL, BOOKED} as actuals
    forecastEntries.forEach(fe => {
      const status = String(fe.STATUS || fe.status || '').toUpperCase();
      if (status !== 'ACTUAL' && status !== 'BOOKED') return;
      const isLoan = String(fe.EXPENSE_TYPE || fe.CATEGORY || '').toUpperCase() === 'LOAN';
      if (isLoan) return;
      const amt = Number(fe.ACTUAL_AMOUNT || fe.AMOUNT || fe.amount || 0);
      if (amt >= 0) return;
      const date = fe.ACTUAL_DATE || fe.PAYMENT_DATE || fe.DATE;
      if (!inMonth(date, year, month)) return;
      const wIdx = findWeekIdx(date, weeks);
      if (wIdx < 0) return;
      const cat = categorizeForecastEntry(fe);
      grid[wIdx][cat] += Math.abs(amt);
    });
    return grid;
  }, [pvVouchers, payables, forecastEntries, weeks, year, month]);

  // ── Inflow: IV project receipts (forecast + actual) ───────────────────
  const ivInflowByWeek = cfMemo(() => {
    const forecast = weeks.map(() => 0);
    const actual   = weeks.map(() => 0);
    invoices.forEach(iv => {
      const net = ivNetExpected(iv, financeByCode);
      // Plan bucket — IV ทุกใบที่มี expectedReceive ตกในเดือนนี้
      //   รวมถึง IV ที่จ่ายแล้ว เพราะตอนที่วางแผนมันก็เป็นส่วนหนึ่งของ "plan"
      //   (จะได้เห็น Plan vs Actual = 100% ตอนรับเงินครบ)
      if (iv.expectedReceive && inMonth(iv.expectedReceive, year, month)) {
        const w = findWeekIdx(iv.expectedReceive, weeks);
        if (w >= 0) forecast[w] += net;
      }
      // Actual bucket — เฉพาะ IV ที่มี actualReceive.date ตกในเดือนนี้
      const ad = ivActualReceiveDate(iv);
      if (ad && inMonth(ad, year, month)) {
        const w = findWeekIdx(ad, weeks);
        if (w >= 0) actual[w] += net;
      }
    });
    return { forecast, actual };
  }, [invoices, weeks, year, month]);

  // ── Loan inflow (forecast + actual) — from forecastEntries CATEGORY=LOAN
  //   Plan   = baseline ที่คาดไว้ — นับทุกแถวที่ไม่ใช่ CANCELED (รวม ACTUAL/BOOKED ด้วย)
  //            ใช้ AMOUNT (ยอดเดิมที่วางแผน) ที่ PAYMENT_DATE
  //   Actual = ที่เกิดจริงแล้ว — เฉพาะ ACTUAL/BOOKED
  //            ใช้ ACTUAL_AMOUNT ที่ ACTUAL_DATE (fallback PAYMENT_DATE)
  const loanByWeek = cfMemo(() => {
    const forecast = weeks.map(() => 0);
    const actual   = weeks.map(() => 0);
    forecastEntries.forEach(fe => {
      const isLoan = String(fe.EXPENSE_TYPE || fe.CATEGORY || '').toUpperCase() === 'LOAN';
      if (!isLoan) return;
      const amt = Number(fe.AMOUNT || fe.amount || 0);
      if (amt <= 0) return;
      const status = String(fe.STATUS || '').toUpperCase();
      if (status === 'CANCELED') return;

      // Plan bucket — ใส่ baseline ทุกแถวที่ไม่ถูกยกเลิก
      const planDate = fe.PAYMENT_DATE || fe.DATE;
      if (planDate && inMonth(planDate, year, month)) {
        const wF = findWeekIdx(planDate, weeks);
        if (wF >= 0) forecast[wF] += amt;
      }

      // Actual bucket — เฉพาะ ACTUAL/BOOKED ใช้ ACTUAL_DATE + ACTUAL_AMOUNT
      if (status === 'ACTUAL' || status === 'BOOKED') {
        const actualDate = fe.ACTUAL_DATE || fe.PAYMENT_DATE || fe.DATE;
        if (actualDate && inMonth(actualDate, year, month)) {
          const wA = findWeekIdx(actualDate, weeks);
          if (wA >= 0) actual[wA] += Number(fe.ACTUAL_AMOUNT || amt);
        }
      }
    });
    return { forecast, actual };
  }, [forecastEntries, weeks, year, month]);

  // ── Month totals ──────────────────────────────────────────────────────
  const sumArr = arr => arr.reduce((s, v) => s + (v || 0), 0);
  const sumCatArr = (grid, cat) => grid.reduce((s, g) => s + (g[cat] || 0), 0);

  const inflowForecast = sumArr(ivInflowByWeek.forecast) + sumArr(loanByWeek.forecast);
  const inflowActual   = sumArr(ivInflowByWeek.actual)   + sumArr(loanByWeek.actual);
  const loanForecast   = sumArr(loanByWeek.forecast);
  const loanActual     = sumArr(loanByWeek.actual);
  const ivForecast     = sumArr(ivInflowByWeek.forecast);
  const ivActual       = sumArr(ivInflowByWeek.actual);

  const outflowForecast = [1,2,3,4].reduce((s, c) => s + sumCatArr(apForecastByWeekCat, c), 0);
  const outflowActual   = [1,2,3,4].reduce((s, c) => s + sumCatArr(pvActualByWeekCat, c), 0);

  // Strategic Management = end-of-month projected net
  //   ใช้ Available (B/F หลังหัก HOLD) เพื่อสะท้อนเงินที่ "วางแผนใช้ได้จริง"
  //   หัก: รายจ่ายตามดิว (4 หมวด) + ยอดที่เลือกจ่ายกลุ่มสภาพคล่อง
  const strategicNet = monthBFAvailable + loanForecast + ivForecast - outflowForecast - (flexPayCurrent + flexPayRest);

  // ── Plan section: current week vs rest-of-month ───────────────────────
  // Rule from M_Forecast Excel:
  //   "rest" column = sum of remaining weeks IN THIS MONTH
  //   IF current week IS the LAST week of month → "rest" = forecast for next month
  const isLastWeekOfMonth = nowWeek === weeks.length - 1;
  const currentRestSplit = (weekArr, nextMonthFallback) => ({
    current: weekArr[nowWeek] || 0,
    rest:    isLastWeekOfMonth
      ? (nextMonthFallback || 0)
      : weekArr.reduce((s, v, i) => i > nowWeek ? s + (v || 0) : s, 0),
    total:   (weekArr[nowWeek] || 0) +
             (isLastWeekOfMonth
                ? (nextMonthFallback || 0)
                : weekArr.reduce((s, v, i) => i > nowWeek ? s + (v || 0) : s, 0)),
  });

  // ── Pull next-month forecast (used only when current = last week) ─────
  const nextMonthInflow = cfMemo(() => {
    if (!isLastWeekOfMonth) return { iv: 0, loan: 0, out: { 1: 0, 2: 0, 3: 0, 4: 0 } };
    const nextYear  = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    let iv = 0, loan = 0;
    const out = { 1: 0, 2: 0, 3: 0, 4: 0 };
    invoices.forEach(ivRow => {
      // ลูกหนี้คงค้างทุกใบที่ยังไม่ได้รับเงิน — เดียวกับ logic main
      if (ivIsPaid(ivRow)) return;
      if (ivRow.expectedReceive && inMonth(ivRow.expectedReceive, nextYear, nextMonth)) {
        iv += ivNetExpected(ivRow, financeByCode);
      }
    });
    forecastEntries.forEach(fe => {
      const isLoan = String(fe.EXPENSE_TYPE || fe.CATEGORY || '').toUpperCase() === 'LOAN';
      const status = String(fe.STATUS || '').toUpperCase();
      if (status === 'CANCELED') return;
      const amt  = Number(fe.AMOUNT || fe.amount || 0);
      const date = fe.PAYMENT_DATE || fe.DATE;
      if (!inMonth(date, nextYear, nextMonth)) return;
      if (isLoan && amt > 0) loan += amt;
      if (!isLoan && amt < 0) out[categorizeForecastEntry(fe)] += Math.abs(amt);
    });
    payables.forEach(ap => {
      if (paidVchnoSet.has(ap.vchno)) return;
      const due = ap.due2 || ap.due || ap.vchdate;
      if (!inMonth(due, nextYear, nextMonth)) return;
      out[categorizePayable(ap)] += Number(ap.netpayment || ap.Amount || 0);
    });
    return { iv, loan, out };
  }, [isLastWeekOfMonth, invoices, payables, forecastEntries, paidVchnoSet, year, month]);

  // Plan table — use forecast bucket only (it already includes all entries,
  //   ACTUAL items at their planned date). Drill-down popup shows breakdown.
  //   Note: an entry that landed on a different week than planned will only
  //   appear at its planned week in the Plan table — that's intentional.
  const ivCombinedByWeek   = ivInflowByWeek.forecast;
  const loanCombinedByWeek = loanByWeek.forecast;

  const planIv   = currentRestSplit(ivCombinedByWeek,   nextMonthInflow.iv);
  const planLoan = currentRestSplit(loanCombinedByWeek, nextMonthInflow.loan);
  const planOut  = {
    1: currentRestSplit(apForecastByWeekCat.map(g => g[1]), nextMonthInflow.out[1]),
    2: currentRestSplit(apForecastByWeekCat.map(g => g[2]), nextMonthInflow.out[2]),
    3: currentRestSplit(apForecastByWeekCat.map(g => g[3]), nextMonthInflow.out[3]),
    4: currentRestSplit(apForecastByWeekCat.map(g => g[4]), nextMonthInflow.out[4]),
  };
  // ใช้ค่าที่ resolve override แล้ว เพื่อให้ "รวมรายจ่าย" สะท้อนยอดที่ user คีย์มือ
  // และ net end-of-week/month ก็ใช้ยอดนี้คำนวณต่อด้วย
  // หมายเหตุ: outflow ใช้ Math.abs() เพราะ user อาจคีย์เป็นบวก หรือลบก็ได้
  //   (display โชว์ในวงเล็บ → คน entry-level บางคนคีย์ติดลบ, บางคนคีย์บวก)
  //   normalize ให้เป็นบวกเพื่อความเสถียรในการคำนวณ netEndOfWeek
  const _resolvedOut = (cat) => ({
    current: Math.abs(WTPOverride.resolve(`${ovPrefix}.s01.out${cat}.current`, planOut[cat].current)),
    rest:    Math.abs(WTPOverride.resolve(`${ovPrefix}.s01.out${cat}.rest`,    planOut[cat].rest)),
    total:   Math.abs(WTPOverride.resolve(`${ovPrefix}.s01.out${cat}.total`,   planOut[cat].total)),
  });
  //   รวมรายจ่าย = หมวด 1-4 (ตามดิว) + ยอดที่เลือกจ่ายกลุ่มสภาพคล่อง
  const totalOutCurrent = [1,2,3,4].reduce((s, c) => s + _resolvedOut(c).current, 0) + flexPayCurrent;
  const totalOutRest    = [1,2,3,4].reduce((s, c) => s + _resolvedOut(c).rest,    0) + flexPayRest;
  const totalOutAll     = [1,2,3,4].reduce((s, c) => s + _resolvedOut(c).total,   0) + flexPayCurrent + flexPayRest;

  // ── Week-start balance (net of HOLD): snapshot at start of current week
  //   ใช้ในตาราง Plan แถว "เงินสดคงเหลือยกมา" ของ current-week column
  const weekBF = cfMemo(() => {
    let raw;
    if (nowWeek == null || !weeks[nowWeek]) {
      raw = monthBF;
    } else {
      const wStart = weeks[nowWeek].fromISO;
      const d = new Date(wStart);
      d.setDate(d.getDate() - 1);
      const prevISO = d.toISOString().slice(0, 10);
      raw = openingBalanceAt(snapshots, prevISO, liveBalance);
    }
    return Math.max(0, raw - liveHold);
  }, [snapshots, weeks, nowWeek, monthBF, liveBalance, liveHold]);

  // Net at end of current week + end of month — used in PlanRow + Net row
  // ใช้ค่าหลัง override สำหรับ inflow ด้วย เพื่อให้ คงเหลือ/Final Net Position ตามที่ user คีย์
  const _ivCur   = WTPOverride.resolve(`${ovPrefix}.s01.iv.current`,   planIv.current);
  const _ivRest  = WTPOverride.resolve(`${ovPrefix}.s01.iv.rest`,      planIv.rest);
  const _loanCur = WTPOverride.resolve(`${ovPrefix}.s01.loan.current`, planLoan.current);
  const _loanRest= WTPOverride.resolve(`${ovPrefix}.s01.loan.rest`,    planLoan.rest);
  const inflowCurrent      = _ivCur  + _loanCur;
  const inflowRest         = _ivRest + _loanRest;
  const netEndOfCurrentWeek= weekBF + inflowCurrent - totalOutCurrent;
  // For "rest" column, the "carry-forward" balance IS the closing of current week
  // (so the user can see how rest period plays out starting from that base)
  const netEndOfMonth      = netEndOfCurrentWeek + inflowRest - totalOutRest;

  // ── Week selector ─────────────────────────────────────────────────────
  // ─── Drill-down builder ──────────────────────────────────────────────────
  // For a given row+period, collect the underlying source rows so user can verify.
  // row    : 'iv' | 'loan' | 'out1' | 'out2' | 'out3' | 'out4'
  // period : 'current' | 'rest' | 'total'
  const openDrillDown = (row, period, label) => {
    const isLastWeek = nowWeek === weeks.length - 1;
    const inCurrent  = (date) => {
      if (!inMonth(date, year, month)) return false;
      const w = findWeekIdx(date, weeks);
      return w === nowWeek;
    };
    const inRest = (date) => {
      if (isLastWeek) {
        const nyY = month === 12 ? year + 1 : year;
        const nyM = month === 12 ? 1 : month + 1;
        return inMonth(date, nyY, nyM);
      }
      if (!inMonth(date, year, month)) return false;
      const w = findWeekIdx(date, weeks);
      return w > nowWeek;
    };
    const inPeriod = (date) => {
      if (period === 'current') return inCurrent(date);
      if (period === 'rest')    return inRest(date);
      return inCurrent(date) || inRest(date);
    };

    const items = [];

    if (row === 'iv') {
      invoices.forEach(iv => {
        // ลูกหนี้คงค้างทุกใบที่ยังไม่ได้รับเงิน — เดียวกับ logic main
        if (ivIsPaid(iv)) return;
        const d = iv.expectedReceive;
        if (!d || !inPeriod(d)) return;
        const ivStatusShort = window.WTPData?.IV_STATUS_META?.[iv.status]?.short || iv.status || '—';
        items.push({
          source: 'IV',
          date: d,
          name: iv.projectName || iv.PROJECT_NAME || iv.customer || '—',
          ref: iv.ivNo || iv.IV_NO || iv.invoiceNo || '',
          amount: ivNetExpected(iv, financeByCode),
          note: ivStatusShort + (iv.note ? ' · ' + iv.note : ''),
          detail: [
            ['โครงการ', iv.projectName || iv.PROJECT_NAME || '—'],
            ['ลูกค้า', iv.customer || '—'],
            ['เลขที่ IV', iv.ivNo || iv.IV_NO || iv.invoiceNo || '—'],
            ['วันคาดรับ', fmtDate(d) || d],
            ['ยอดคงค้าง', fmtNum(Number(iv.balance) || 0, 0) + ' ฿'],
            ['คาดรับสุทธิ (หัก WHT/หนี้)', fmtNum(ivNetExpected(iv, financeByCode), 0) + ' ฿'],
            ['สถานะ', ivStatusShort],
            ['หมายเหตุ', iv.note || '—'],
          ],
        });
      });
      forecastEntries.forEach(fe => {
        // Non-LOAN inflow (rare but possible)
      });
    }

    if (row === 'loan') {
      forecastEntries.forEach(fe => {
        const isLoan = String(fe.EXPENSE_TYPE || fe.CATEGORY || '').toUpperCase() === 'LOAN';
        if (!isLoan) return;
        const amt = Number(fe.AMOUNT || fe.amount || 0);
        if (amt <= 0) return;
        const status = String(fe.STATUS || '').toUpperCase();
        if (status === 'CANCELED') return;
        const d = fe.PAYMENT_DATE || fe.DATE;
        if (!d || !inPeriod(d)) return;
        const isRealized = status === 'ACTUAL' || status === 'BOOKED';
        items.push({
          source: 'Forecast',
          feId: fe.id,
          editable: !isRealized,   // แก้ได้เฉพาะ PLANNED (ยังไม่เกิดจริง)
          date: d,
          name: fe.DESCRIPTION || '—',
          ref: fe.JOB_NO || '',
          amount: isRealized ? Number(fe.ACTUAL_AMOUNT || amt) : amt,
          note: `STATUS=${status || 'PLANNED'}${fe.NOTE ? ' · ' + fe.NOTE : ''}`,
          detail: [
            ['รายการ', fe.DESCRIPTION || '—'],
            ['ประเภท', 'เงินกู้ / สินเชื่อ (LOAN)'],
            ['Job No.', fe.JOB_NO || '—'],
            ['โครงการ', fe.PROJECT_NAME || '—'],
            ['วันที่คาดรับ', fmtDate(fe.PAYMENT_DATE || fe.DATE) || '—'],
            ['ยอดประมาณการ', fmtNum(Math.abs(amt), 0) + ' ฿'],
            ['สถานะ', status || 'PLANNED'],
            ['บัญชี', fe.Bank_AC || '—'],
            ['หมายเหตุ', fe.NOTE || '—'],
          ],
        });
      });
    }

    if (row && row.startsWith('out')) {
      const targetCat = Number(row.slice(3));
      payables.forEach(ap => {
        if (isFlexAp(ap)) return;   // กลุ่มสภาพคล่อง — ไม่อยู่ในหมวดตามดิว (แยก pool)
        // Plan baseline includes paid AP — show all (mark paid ones in note)
        const d = ap.due2 || ap.due || ap.vchdate;
        if (!d || !inPeriod(d)) return;
        const cat = categorizePayable(ap);
        if (cat !== targetCat) return;
        const isPaid = paidVchnoSet.has(ap.vchno);
        const noteParts = [];
        if (isPaid) noteParts.push('✅ จ่ายแล้ว');
        if (ap.jobcode) noteParts.push(`Job: ${ap.jobcode}`);
        if (ap.dpt_code) noteParts.push(ap.dpt_code);
        items.push({
          source: 'AP',
          date: d,
          name: ap.cust_name || ap.vendor || '—',
          ref: ap.vchno || ap.docno || '',
          amount: -Number(ap.netpayment || ap.Amount || 0),  // negative = outflow
          note: noteParts.join(' · ') || '—',
          detail: [
            ['ผู้ขาย', ap.cust_name || ap.vendor || '—'],
            ['เลขที่เอกสาร', ap.vchno || ap.docno || '—'],
            ['Job', ap.jobcode || ap.jobname || '—'],
            ['แผนก', ap.dpt_code || '—'],
            ['วันที่เอกสาร', fmtDate(ap.vchdate) || '—'],
            ['วันครบกำหนด', fmtDate(ap.due2 || ap.due) || '—'],
            ['ยอดจ่ายสุทธิ', fmtNum(Number(ap.netpayment || ap.Amount) || 0, 0) + ' ฿'],
            ['สถานะ', isPaid ? '✅ จ่ายแล้ว (ตัดออกจากแผน)' : 'ค้างจ่าย'],
            ['หมายเหตุ', ap.remark || '—'],
          ],
        });
      });
      forecastEntries.forEach(fe => {
        const status = String(fe.STATUS || fe.status || '').toUpperCase();
        if (status === 'CANCELED') return;
        const isLoan = String(fe.EXPENSE_TYPE || fe.CATEGORY || '').toUpperCase() === 'LOAN';
        if (isLoan) return;
        const amt = Number(fe.AMOUNT || fe.amount || 0);
        if (amt >= 0) return;
        const d = fe.PAYMENT_DATE || fe.DATE;
        if (!d || !inPeriod(d)) return;
        const cat = categorizeForecastEntry(fe);
        if (cat !== targetCat) return;
        const isRealized = status === 'ACTUAL' || status === 'BOOKED';
        items.push({
          source: 'Forecast',
          feId: fe.id,
          editable: !isRealized,   // แก้ได้เฉพาะ PLANNED (ยังไม่เกิดจริง)
          date: d,
          name: fe.DESCRIPTION || '—',
          ref: fe.JOB_NO || '',
          amount: isRealized ? -Math.abs(Number(fe.ACTUAL_AMOUNT || amt)) : amt,
          note: `STATUS=${status || 'PLANNED'}${fe.NOTE ? ' · ' + fe.NOTE : ''}`,
          detail: [
            ['รายการ', fe.DESCRIPTION || '—'],
            ['Job No.', fe.JOB_NO || '—'],
            ['โครงการ', fe.PROJECT_NAME || '—'],
            ['วันที่จ่าย', fmtDate(fe.PAYMENT_DATE || fe.DATE) || '—'],
            ['ยอดประมาณการ', fmtNum(Math.abs(amt), 0) + ' ฿'],
            ['หมวด', `${cat} · ${CATEGORY_LABELS_SHORT[cat] || '—'}`],
            ['สถานะ', status || 'PLANNED'],
            ['บัญชี', fe.Bank_AC || '—'],
            ['หมายเหตุ', fe.NOTE || '—'],
          ],
        });
      });
    }

    // Sort by date ascending
    items.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    setDrillDown({ title: label, period, row, items });
  };

  // ─── Inline-edit a FORECAST line from the drill-down ──────────────────────
  // เขียนกลับเข้า data.forecastEntries จริง (sync ขึ้น cloud) แล้วอัปเดต popup ทันที
  //   signedAmount = ยอดที่มีเครื่องหมายแล้ว (− = จ่ายออก, + = รับเข้า)
  //   แก้เฉพาะ AMOUNT (ยอดประมาณการ) — รายการที่เกิดจริงแล้ว (ACTUAL/BOOKED) ล็อกไว้
  const commitForecastEdit = (feId, signedAmount) => {
    if (!feId) return;
    setData(d => ({
      ...d,
      forecastEntries: (d.forecastEntries || []).map(fe =>
        fe.id === feId ? { ...fe, AMOUNT: signedAmount } : fe),
    }));
    setDrillDown(prev => prev && {
      ...prev,
      items: prev.items.map(x => x.feId === feId ? { ...x, amount: signedAmount } : x),
    });
    if (typeof toast === 'function') toast('แก้ไขประมาณการแล้ว — กำลังซิงค์');
  };

  const monthNames = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const goPrevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
    setCurrentWeekOverride(null);
  };
  const goNextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
    setCurrentWeekOverride(null);
  };

  return (
    <div className="page bg-pattern cf-page">
      {/* Header */}
      <div className="page-head anim-in">
        <div>
          <h1 className="page-title">แผนประมาณการจ่ายรายสัปดาห์</h1>
          <div className="page-sub">
            Weekly Cash Flow Forecast · {monthNames[month - 1]} {year + 543} · ข้อมูล ณ {fmtDate(today.toISOString().slice(0, 10))}
          </div>
        </div>
        <div className="page-head-r">
          <button className="btn btn-ghost" onClick={goPrevMonth} title="เดือนก่อน">‹</button>
          <div style={{ padding: '6px 12px', background: 'var(--ink-50)', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
            {monthNames[month - 1]} {year + 543}
          </div>
          <button className="btn btn-ghost" onClick={goNextMonth} title="เดือนถัดไป">›</button>
          <CloudSyncStatusButton />
          <EditModeToggle value={editMode} onChange={setEditMode} />
          <button className="btn btn-ghost" onClick={() => {
            // A4 landscape print — 5-week tracking fits beautifully across the wider page
            const styleId = 'cf-print-landscape-style';
            let style = document.getElementById(styleId);
            if (!style) {
              style = document.createElement('style');
              style.id = styleId;
              document.head.appendChild(style);
            }
            style.textContent = `
              @media print {
                @page { size: A4 landscape; margin: 8mm 10mm; }
                html, body { background: #f4f7fb !important; }
              }
            `;
            document.body.classList.add('cf-print-mode');
            const cleanup = () => {
              document.body.classList.remove('cf-print-mode');
              if (style.parentNode) style.parentNode.removeChild(style);
              window.removeEventListener('afterprint', cleanup);
            };
            window.addEventListener('afterprint', cleanup);
            setTimeout(cleanup, 60000);
            setTimeout(() => window.print(), 50);
          }} title="พิมพ์ A4 แนวนอน (เฉพาะส่วน Present)">
            <Icon name="print" size={14} /> พิมพ์ / PDF
          </button>
        </div>
      </div>

      {editMode && (
        <div className="no-print" style={{ marginBottom: 12, padding: '8px 14px', borderRadius: 10, background: 'color-mix(in oklch, var(--brand-500) 8%, transparent)', border: '1.5px solid color-mix(in oklch, var(--brand-500) 30%, transparent)', fontSize: 12, color: 'var(--brand-700)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700 }}>📝 โหมดแก้ไข — คลิกในช่องตัวเลขเพื่อกรอกค่า (Tab/Enter บันทึก · ✕ ล้าง)</span>
          <span style={{ fontSize: 11, color: 'var(--ink-500)' }}>ค่าที่กรอกแยกตามเดือน — เปลี่ยนเดือนแล้วเริ่มใหม่</span>
          <button type="button" onClick={() => { if (confirm('ล้างค่าที่กรอกมือทั้งหมดใน app (ทุกหน้า)?')) WTPOverride.clearAll(); }}
            style={{ marginLeft: 'auto', padding: '3px 10px', fontSize: 11, borderRadius: 5, border: '1px solid var(--bad)', background: 'transparent', color: 'var(--bad)', cursor: 'pointer' }}>
            ล้างทั้งหมด
          </button>
        </div>
      )}

      {/* ═════ SECTION A — Hero balance cards + PlanVsActual KPIs ═════════ */}
      {/* Hero strip — 3 big gradient cards: อดีต (B/F) → ปัจจุบัน (ใช้ได้) → อนาคต (สิ้นเดือน) */}
      <div className="grid grid-3 anim-in" style={{ marginBottom: 18 }}>
        <BalanceCard
          tone="bf"
          label="เงินสดยกมาใช้ได้ (B/F)"
          value={monthBFAvailable}
          editMode={editMode}
          ovKey={`${ovPrefix}.bf`}
          hint={`ต้นเดือน · ${monthNames[month - 1]} ${year + 543}`}
          icon="coin"
        />
        <BalanceCard
          tone="now"
          label="เงินสดใช้ได้ปัจจุบัน"
          value={liveAvailable}
          hint={`ยอดพร้อมใช้จริง ณ วันนี้`}
          icon="bank"
        />
        <BalanceCard
          tone={strategicNet < 0 ? 'bad' : 'good'}
          label="คาดการณ์สิ้นเดือน (Strategic)"
          value={strategicNet}
          editMode={editMode}
          ovKey={`${ovPrefix}.strategic`}
          hint={
            (strategicNet < 0 ? '⚠️ ติดลบ · ' : '') +
            'B/F + IV คาดรับ + เงินกู้ − รายจ่ายตามดิว − จ่ายสภาพคล่อง'
          }
          icon={strategicNet < 0 ? 'arrow_down' : 'arrow_up'}
        />
      </div>

      {/* 3 PlanVsActual cards — รับโครงการ / เงินกู้ / ค่าใช้จ่ายรวม */}
      <div className="grid grid-3 anim-stagger" style={{ marginBottom: 22 }}>
        <PlanVsActualCard
          tone="good"
          icon="bank"
          label="รับเงินโครงการ (IV)"
          plan={ivForecast}
          actual={ivActual}
          editMode={editMode}
          ovKey={`${ovPrefix}.iv`}
          hint={`คาดรับ ${fmtNum(ivForecast, 0)} · รับจริง ${fmtNum(ivActual, 0)}`}
        />
        <PlanVsActualCard
          tone="info"
          icon="money"
          label="เงินกู้/สินเชื่อหมุนเวียน"
          plan={loanForecast}
          actual={loanActual}
          editMode={editMode}
          ovKey={`${ovPrefix}.loan`}
          hint={loanForecast === 0 ? 'ยังไม่มีประมาณการเงินกู้เดือนนี้' : `เบิกแล้ว ${loanForecast > 0 ? ((loanActual / loanForecast) * 100).toFixed(1) : 0}%`}
        />
        <PlanVsActualCard
          tone="bad"
          icon="arrow_up"
          label="ค่าใช้จ่ายรวม (4 หมวด)"
          plan={outflowForecast}
          actual={outflowActual}
          editMode={editMode}
          ovKey={`${ovPrefix}.outflow`}
          hint="รวม ดำเนินงาน / โครงการ / การเงิน / เบ็ดเตล็ด+เงินเดือน"
        />
      </div>

      {/* ═════ SECTION B — Plan: current week vs rest of month ═════════ */}
      <div className="cf-section-01">
      <SectionTitle num="01"
        title="ประมาณการรายสัปดาห์"
        subtitle={`สัปดาห์นี้ ${weeks[nowWeek]?.label || 'W?'} (${weeks[nowWeek]?.from || '-'}–${weeks[nowWeek]?.to || '-'} ${monthNames[month - 1]}) และยอดรวมช่วงที่เหลือของเดือน`}
      />

      <div className="card anim-in" style={{ padding: 0, overflow: 'hidden', marginBottom: 22 }}>
        <table className="tbl" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th style={{ width: 280 }}>รายการ</th>
              <th style={{ width: 180, textAlign: 'right', background: 'var(--brand-50)' }}>
                {weeks[nowWeek]?.label || 'W?'} (ปัจจุบัน)
                <div style={{ fontSize: 10, color: 'var(--ink-500)', fontWeight: 400 }}>
                  {weeks[nowWeek]?.from}-{weeks[nowWeek]?.to} {monthNames[month - 1]}
                </div>
              </th>
              <th style={{ width: 180, textAlign: 'right' }}>
                สัปดาห์ที่เหลือ
                <div style={{ fontSize: 10, color: 'var(--ink-500)', fontWeight: 400 }}>
                  รวม {weeks.length - nowWeek - 1} สัปดาห์
                </div>
              </th>
              <th style={{ width: 180, textAlign: 'right', background: 'var(--ink-50)' }}>
                TOTAL ที่เหลือของเดือน
              </th>
            </tr>
          </thead>
          <tbody>
            {/* ── INFLOW section ───────────────────────────────────────── */}
            <tr style={{ background: 'color-mix(in oklch, var(--good) 8%, transparent)' }}>
              <td colSpan={4} style={{ fontWeight: 700, color: 'var(--good)', fontSize: 13, padding: '8px 14px' }}>
                1: กระแสเงินสดเข้า (Inflow Details)
              </td>
            </tr>
            {/* ยอดยกมา: rest = closing of current week (signed carry-forward, matches M_Forecast) */}
            <PlanRow
              label="เงินสดคงเหลือยกมา"
              current={weekBF}
              rest={netEndOfCurrentWeek}
              total={weekBF}
              subtle
              carrySigned
              editMode={editMode}
              ovKey={`${ovPrefix}.s01.bf`}
            />
            <PlanRow label="รับเงินโครงการ"            current={planIv.current}   rest={planIv.rest}   total={planIv.current + planIv.rest}
              editMode={editMode} ovKey={`${ovPrefix}.s01.iv`}
              onCellClick={(p) => openDrillDown('iv', p, `รับเงินโครงการ · ${p === 'current' ? weeks[nowWeek]?.label : p === 'rest' ? 'สัปดาห์ที่เหลือ' : 'TOTAL'}`)} />
            <PlanRow label="เงินกู้/สินเชื่อหมุนเวียน"  current={planLoan.current} rest={planLoan.rest} total={planLoan.current + planLoan.rest}
              editMode={editMode} ovKey={`${ovPrefix}.s01.loan`}
              onCellClick={(p) => openDrillDown('loan', p, `เงินกู้/สินเชื่อ · ${p === 'current' ? weeks[nowWeek]?.label : p === 'rest' ? 'สัปดาห์ที่เหลือ' : 'TOTAL'}`)} />

            {/* ── OUTFLOW section ─────────────────────────────────────── */}
            <tr style={{ background: 'color-mix(in oklch, var(--bad) 8%, transparent)' }}>
              <td colSpan={4} style={{ fontWeight: 700, color: 'var(--bad)', fontSize: 13, padding: '8px 14px' }}>
                2: กระแสเงินสดออก (Outflow Details) · 4 หมวด · 💧 โครงการรวมกลุ่มจ่ายตามสภาพคล่อง (คลิกดู)
              </td>
            </tr>
            {[1, 2, 3, 4].map(cat => {
              const drill = (p) => openDrillDown(`out${cat}`, p, `${CATEGORY_LABELS[cat]} · ${p === 'current' ? weeks[nowWeek]?.label : p === 'rest' ? 'สัปดาห์ที่เหลือ' : 'TOTAL'}`);
              // หมวด 2 (โครงการ) = รายจ่ายตามดิว(ที่ไม่ใช่กลุ่มยืดหยุ่น) + ยอดที่เลือกจ่ายกลุ่มสภาพคล่อง
              //   จัดการกลุ่มสภาพคล่องทั้งหมดอยู่ใน popup ของหมวดนี้
              if (cat === 2) {
                const cur = _resolvedOut(2).current + flexPayCurrent;
                const rst = _resolvedOut(2).rest + flexPayRest;
                return (
                  <PlanRow key={cat}
                    label={`2. ${CATEGORY_LABELS[2]} 💧`}
                    current={cur} rest={rst} total={cur + rst}
                    negative
                    onCellClick={drill}
                  />
                );
              }
              return (
                <PlanRow key={cat}
                  label={`${cat}. ${CATEGORY_LABELS[cat]}`}
                  current={planOut[cat].current}
                  rest={planOut[cat].rest}
                  total={planOut[cat].total}
                  negative
                  editMode={editMode}
                  ovKey={`${ovPrefix}.s01.out${cat}`}
                  onCellClick={drill}
                />
              );
            })}
            <tr style={{ background: 'var(--bad-bg)', fontWeight: 700 }}>
              <td style={{ textAlign: 'right', paddingRight: 14, fontSize: 12 }}>รวมรายจ่าย</td>
              <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--bad)' }}>({fmtNum(totalOutCurrent, 0)})</td>
              <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--bad)' }}>({fmtNum(totalOutRest, 0)})</td>
              <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--bad)' }}>({fmtNum(totalOutAll, 0)})</td>
            </tr>

            {/* ── คงเหลือรายสัปดาห์ — closing per period (matches M_Forecast R30) */}
            {/*  เปิด edit mode = override ได้ตรงๆ (ไม่ผ่านสูตร) */}
            {(() => {
              const netCurDisp = WTPOverride.resolve(`${ovPrefix}.s01.netCur`,   netEndOfCurrentWeek);
              const netMonDisp = WTPOverride.resolve(`${ovPrefix}.s01.netMonth`, netEndOfMonth);
              return (
                <tr style={{ background: 'var(--warn-bg)', fontWeight: 700 }}>
                  <td style={{ padding: '10px 14px', color: 'var(--warn)' }}>
                    💰 คงเหลือรายสัปดาห์ (สิ้นช่วง)
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                    color: netCurDisp < 0 ? 'var(--bad)' : 'var(--good)' }}>
                    {editMode
                      ? <EditableNumber ovKey={`${ovPrefix}.s01.netCur`}   computed={netEndOfCurrentWeek} editMode={true} digits={0} />
                      : <>{fmtNum(netCurDisp, 0)}{WTPOverride.has(`${ovPrefix}.s01.netCur`) && <span title="แก้มือ" style={{ fontSize: 9, marginLeft: 3 }}>✏️</span>}</>}
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                    color: netMonDisp < 0 ? 'var(--bad)' : 'var(--good)' }}>
                    {editMode
                      ? <EditableNumber ovKey={`${ovPrefix}.s01.netMonth`} computed={netEndOfMonth} editMode={true} digits={0} />
                      : <>{fmtNum(netMonDisp, 0)}{WTPOverride.has(`${ovPrefix}.s01.netMonth`) && <span title="แก้มือ" style={{ fontSize: 9, marginLeft: 3 }}>✏️</span>}</>}
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--ink-500)', fontSize: 11 }}>
                    {isLastWeekOfMonth ? '(rest = เดือนถัดไป)' : ''}
                  </td>
                </tr>
              );
            })()}

            {/* ── Final Net Position — same as right column above */}
            {(() => {
              const netMonDisp = WTPOverride.resolve(`${ovPrefix}.s01.netMonth`, netEndOfMonth);
              return (
                <tr style={{ background: 'var(--brand-50)', fontWeight: 800 }}>
                  <td style={{ padding: '12px 14px', color: 'var(--brand-700)' }}>
                    💼 ยอดคงเหลือสุทธิปลายงวด (Final Net Position)
                  </td>
                  <td colSpan={2} style={{ textAlign: 'center', fontSize: 11, color: 'var(--ink-500)' }}>
                    สิ้น{weeks[nowWeek]?.label || 'W?'} → {isLastWeekOfMonth ? 'สิ้นเดือนถัดไป' : 'สิ้นเดือน'}
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                    color: netMonDisp < 0 ? 'var(--bad)' : 'var(--good)', fontSize: 18 }}>
                    {fmtNum(netMonDisp, 0)}
                  </td>
                </tr>
              );
            })()}
          </tbody>
        </table>
      </div>

      </div>{/* end .cf-section-01 wrapper */}

      {/* ═════ SECTION C — Weekly Actual Tracking (5 weeks side-by-side) */}
      <div data-print-page>
      <SectionTitle num="02"
        title="ติดตามจ่ายจริงรายสัปดาห์"
        subtitle="Weekly Actual Tracking · เปรียบเทียบ Plan vs Actual ทั้ง 5 สัปดาห์ของเดือน"
      />

      <div className="grid anim-in" style={{
        gridTemplateColumns: `repeat(${weeks.length}, minmax(160px, 1fr))`,
        gap: 10, marginBottom: 18, overflowX: 'auto',
      }}>
        {weeks.map((w, i) => {
          // ดึงค่าหลัง override สำหรับ Plan/Actual ของแต่ละหมวดในสัปดาห์นี้
          // เพื่อให้ทั้ง cell, total row, และ % bar reflect ค่าที่ user กรอกมือ
          const cellOvWeek = `${ovPrefix}.s02.w${i + 1}`;
          const planByCat   = [1, 2, 3, 4].map(c => WTPOverride.resolve(`${cellOvWeek}.cat${c}.plan`,   apForecastByWeekCat[i][c] || 0));
          const actualByCat = [1, 2, 3, 4].map(c => WTPOverride.resolve(`${cellOvWeek}.cat${c}.actual`, pvActualByWeekCat[i][c]   || 0));
          // รวม row — รองรับ override level "total" (ถ้า user override จะใช้ค่านี้แทนการรวม cell)
          const planTotalRaw   = planByCat.reduce((s, v) => s + v, 0);
          const actualTotalRaw = actualByCat.reduce((s, v) => s + v, 0);
          const planTotal      = WTPOverride.resolve(`${cellOvWeek}.total.plan`,   planTotalRaw);
          const actualTotal    = WTPOverride.resolve(`${cellOvWeek}.total.actual`, actualTotalRaw);
          const planTotalOver  = WTPOverride.has(`${cellOvWeek}.total.plan`);
          const actualTotalOver= WTPOverride.has(`${cellOvWeek}.total.actual`);
          const pct = planTotal > 0 ? (actualTotal / planTotal) * 100 : 0;
          const status = i < nowWeek ? 'past' : i === nowWeek ? 'now' : 'future';
          return (
            <div key={i} className="card" style={{
              padding: 0, overflow: 'hidden',
              borderColor: status === 'now' ? 'var(--brand-500)' : 'var(--line)',
              borderWidth: status === 'now' ? 2 : 1,
              opacity: status === 'past' ? 0.85 : 1,
            }}>
              <div style={{
                padding: '8px 12px',
                background: status === 'now' ? 'var(--brand-500)' : status === 'past' ? 'var(--ink-100)' : 'var(--ink-50)',
                color: status === 'now' ? '#fff' : 'var(--ink-700)',
                fontWeight: 700, fontSize: 12,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span>{w.label}{status === 'now' && ' · ปัจจุบัน'}</span>
                <span style={{ fontSize: 10, fontWeight: 500 }}>{w.from}-{w.to}</span>
              </div>
              <table className="tbl" style={{ width: '100%', fontSize: 11 }}>
                <thead>
                  <tr>
                    <th style={{ padding: '4px 6px' }}>หมวด</th>
                    <th style={{ padding: '4px 6px', textAlign: 'right' }}>Plan</th>
                    <th style={{ padding: '4px 6px', textAlign: 'right' }}>Actual</th>
                  </tr>
                </thead>
                <tbody>
                  {[1,2,3,4].map((cat, idx) => {
                    // ใช้ค่าหลัง resolve (override > computed) ทั้งใน edit + view mode
                    const pRaw  = apForecastByWeekCat[i][cat] || 0;
                    const aRaw  = pvActualByWeekCat[i][cat]   || 0;
                    const p     = planByCat[idx];
                    const a     = actualByCat[idx];
                    const cellOv = `${cellOvWeek}.cat${cat}`;
                    const pOver = WTPOverride.has(`${cellOv}.plan`);
                    const aOver = WTPOverride.has(`${cellOv}.actual`);
                    return (
                      <tr key={cat} title={CATEGORY_LABELS[cat]}>
                        <td style={{ padding: '3px 6px', fontSize: 10, color: 'var(--ink-600)' }}>{cat}. {CATEGORY_LABELS_SHORT[cat]}</td>
                        <td style={{ padding: '3px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--ink-500)' }}>
                          {editMode
                            ? <EditableNumber ovKey={`${cellOv}.plan`} computed={pRaw} editMode={true} digits={0} />
                            : (<>
                                {p > 0 ? fmtNum(p, 0) : '—'}
                                {pOver && <span title="แก้มือ" style={{ fontSize: 8, marginLeft: 2, color: 'var(--brand-500)' }}>✏️</span>}
                              </>)}
                        </td>
                        <td style={{ padding: '3px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                          color: a > 0 ? 'var(--bad)' : 'var(--ink-300)', fontWeight: 600 }}>
                          {editMode
                            ? <EditableNumber ovKey={`${cellOv}.actual`} computed={aRaw} editMode={true} digits={0} />
                            : (<>
                                {a > 0 ? fmtNum(a, 0) : '—'}
                                {aOver && <span title="แก้มือ" style={{ fontSize: 8, marginLeft: 2, color: 'var(--brand-500)' }}>✏️</span>}
                              </>)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--ink-50)', fontWeight: 700 }}>
                    <td style={{ padding: '4px 6px' }}>รวม</td>
                    <td style={{ padding: '4px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 11 }}>
                      {editMode
                        ? <EditableNumber ovKey={`${cellOvWeek}.total.plan`}   computed={planTotalRaw}   editMode={true} digits={0} />
                        : (<>{fmtNum(planTotal, 0)}{planTotalOver && <span title="แก้มือ" style={{ fontSize: 8, marginLeft: 2, color: 'var(--brand-500)' }}>✏️</span>}</>)}
                    </td>
                    <td style={{ padding: '4px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--bad)', fontSize: 11 }}>
                      {editMode
                        ? <EditableNumber ovKey={`${cellOvWeek}.total.actual`} computed={actualTotalRaw} editMode={true} digits={0} />
                        : (<>{fmtNum(actualTotal, 0)}{actualTotalOver && <span title="แก้มือ" style={{ fontSize: 8, marginLeft: 2, color: 'var(--brand-500)' }}>✏️</span>}</>)}
                    </td>
                  </tr>
                </tfoot>
              </table>
              <div style={{ padding: '6px 12px', fontSize: 11, textAlign: 'center', fontWeight: 600,
                background: pct >= 100 ? 'var(--bad-bg)' : pct >= 50 ? 'var(--warn-bg)' : 'var(--good-bg)',
                color: pct >= 100 ? 'var(--bad)' : pct >= 50 ? 'var(--warn)' : 'var(--good)' }}>
                Paid {pct.toFixed(1)}%
              </div>
            </div>
          );
        })}
      </div>

      {/* Grand Total */}
      {(() => {
        // คำนวณ Grand Total โดยรวมยอด "รวม" ของแต่ละ week (เคารพ override total ของ week ด้วย)
        let grandPlanRaw = 0, grandActualRaw = 0;
        weeks.forEach((_, i) => {
          const weekKey = `${ovPrefix}.s02.w${i + 1}`;
          // sum cells in this week (ใช้ override level cell ก่อน)
          let pSum = 0, aSum = 0;
          [1, 2, 3, 4].forEach(cat => {
            pSum += WTPOverride.resolve(`${weekKey}.cat${cat}.plan`,   apForecastByWeekCat[i][cat] || 0);
            aSum += WTPOverride.resolve(`${weekKey}.cat${cat}.actual`, pvActualByWeekCat[i][cat]   || 0);
          });
          // แล้วใช้ override level week-total ทับอีกที (ถ้ามี)
          grandPlanRaw   += WTPOverride.resolve(`${weekKey}.total.plan`,   pSum);
          grandActualRaw += WTPOverride.resolve(`${weekKey}.total.actual`, aSum);
        });
        // override level Grand Total — top of stack (final override)
        const gpKey = `${ovPrefix}.s02.grand.plan`;
        const gaKey = `${ovPrefix}.s02.grand.actual`;
        const grandPlan   = WTPOverride.resolve(gpKey, grandPlanRaw);
        const grandActual = WTPOverride.resolve(gaKey, grandActualRaw);
        const grandPlanOver   = WTPOverride.has(gpKey);
        const grandActualOver = WTPOverride.has(gaKey);
        const grandPct = grandPlan > 0 ? (grandActual / grandPlan) * 100 : 0;
        const pctColor = grandPct >= 100 ? 'var(--bad)' : grandPct >= 70 ? 'var(--warn)' : 'var(--good)';
        return (
        <div className="card anim-in" style={{
          padding: '14px 18px', marginBottom: 22,
          background: 'linear-gradient(135deg, var(--brand-50), white)',
          borderColor: 'var(--brand-200)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 18 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-600)' }}>Grand Total Plan</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink-700)', fontVariantNumeric: 'tabular-nums' }}>
                {editMode
                  ? <EditableNumber ovKey={gpKey} computed={grandPlanRaw} editMode={true} digits={0} />
                  : (<>{fmtNum(grandPlan, 0)}{grandPlanOver && <span title="แก้มือ" style={{ fontSize: 10, marginLeft: 4, color: 'var(--brand-500)' }}>✏️</span>}</>)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-600)' }}>Grand Total Actual</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--bad)', fontVariantNumeric: 'tabular-nums' }}>
                {editMode
                  ? <EditableNumber ovKey={gaKey} computed={grandActualRaw} editMode={true} digits={0} />
                  : (<>{fmtNum(grandActual, 0)}{grandActualOver && <span title="แก้มือ" style={{ fontSize: 10, marginLeft: 4, color: 'var(--brand-500)' }}>✏️</span>}</>)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-600)' }}>% of Plan</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: pctColor, fontVariantNumeric: 'tabular-nums' }}>
                {grandPct.toFixed(1)}%
              </div>
              <div style={{ fontSize: 10, color: 'var(--ink-500)' }}>
                จ่ายแล้ว {fmtNum(grandActual, 0)} / แผน {fmtNum(grandPlan, 0)}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ height: 12, background: 'var(--ink-100)', borderRadius: 6, overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.min(100, grandPct)}%`,
                  height: '100%',
                  background: grandPct >= 100 ? 'var(--bad)' : 'linear-gradient(90deg, var(--brand-500), var(--brand-700))',
                  transition: 'width 600ms',
                }} />
              </div>
              <div style={{ fontSize: 10, color: 'var(--ink-500)', marginTop: 4, textAlign: 'right' }}>
                คงเหลือต้องจ่าย {fmtNum(Math.max(0, grandPlan - grandActual), 0)} ฿
              </div>
            </div>
          </div>
        </div>
        );
      })()}
      </div>{/* end data-print-page wrapper for Section 02 */}

      {/* Footer hints — พับเก็บไว้ (default ซ่อน) กดหัวข้อเพื่อกาง */}
      <div className="card no-print" style={{ marginTop: 12, padding: showNotes ? 14 : '10px 14px', background: '#fffbeb', borderLeft: '4px solid #f6ad55', fontSize: 12, color: 'var(--ink-700)' }}>
        <div
          onClick={() => setShowNotes(v => !v)}
          style={{ fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, userSelect: 'none' }}
          title={showNotes ? 'ซ่อนหมายเหตุ' : 'ดูหมายเหตุ — ที่มาของตัวเลข'}
        >
          <span style={{ fontSize: 10, transform: showNotes ? 'rotate(90deg)' : 'none', transition: 'transform 150ms' }}>▶</span>
          💡 หมายเหตุ — ที่มาของตัวเลข
        </div>
        {showNotes && (
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, lineHeight: 1.7 }}>
          <li><strong>ยอดยกมา</strong> — ยอดธนาคารสิ้นเดือนก่อน (<a href="#daily_balance" style={{ color: 'var(--brand-600)' }}>บันทึกรายวัน</a>) · ไม่มีก็ใช้ยอดสดปัจจุบัน · <strong>รายรับ</strong> — ลูกหนี้ค้างที่ยังไม่รับเงิน (<a href="#iv_report" style={{ color: 'var(--brand-600)' }}>IV</a>)</li>
          <li><strong>ค่าใช้จ่าย</strong> — <a href="#data_payable" style={{ color: 'var(--brand-600)' }}>AP คงค้าง</a> + <a href="#data_pv" style={{ color: 'var(--brand-600)' }}>PV</a> + <a href="#data_forecast" style={{ color: 'var(--brand-600)' }}>ประมาณการ</a> (AP จ่ายแล้วตัดออก กัน double-count) · <strong>เงินกู้</strong> — ตั้ง EXPENSE_TYPE=LOAN</li>
          <li>สัปดาห์สุดท้ายของเดือน → คอลัมน์ "สัปดาห์ที่เหลือ" = ประมาณการ<strong>เดือนถัดไป</strong></li>
        </ul>
        )}
      </div>

      {/* ═════ Drill-down modal — verify which rows make up each cell ═══════ */}
      {drillDown && (
        <Modal open={!!drillDown} title={'รายละเอียด · ' + drillDown.title} maxWidth={920}
          onClose={() => setDrillDown(null)}
          footer={<button className="btn btn-primary" onClick={() => setDrillDown(null)}>ปิด</button>}>
          {drillDown.row === 'out2' && (
            <FlexPoolPanel
              pool={flexPool}
              vendorCount={flexVendors.filter(Boolean).length}
              ovPrefix={ovPrefix}
              chosenCurrent={flexPayCurrent}
              chosenRest={flexPayRest}
              onEditVendors={() => setFlexEditOpen(true)}
            />
          )}
          {drillDown.items.length === 0 ? (
            <div style={{ padding: drillDown.row === 'out2' ? '12px 0 0' : 30, textAlign: 'center', color: 'var(--ink-500)', fontSize: 12.5 }}>
              {drillDown.row === 'out2' ? '— ไม่มีรายการตามดิว (นอกกลุ่มสภาพคล่อง) ในช่วงนี้ —' : 'ไม่มีรายการในช่วงนี้'}
            </div>
          ) : (
            <>
              <div style={{
                display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12,
                padding: 12, background: 'var(--brand-50)', borderRadius: 8,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-500)' }}>จำนวนรายการ</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--brand-700)' }}>{drillDown.items.length}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-500)' }}>ยอดรวม</div>
                  <div style={{ fontSize: 18, fontWeight: 700,
                    color: drillDown.items.reduce((s, x) => s + x.amount, 0) < 0 ? 'var(--bad)' : 'var(--good)' }}>
                    {fmtNum(drillDown.items.reduce((s, x) => s + x.amount, 0), 0)} ฿
                  </div>
                </div>
              </div>
              <div style={{ maxHeight: '60vh', overflow: 'auto' }}>
                <table className="tbl" style={{ width: '100%', fontSize: 12.5 }}>
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
                    <tr>
                      <th style={{ width: 70, textAlign: 'left' }}>ที่มา</th>
                      <th style={{ width: 100 }}>วันที่</th>
                      <th style={{ width: 130 }}>เลขที่</th>
                      <th>ชื่อ/รายการ</th>
                      <th style={{ width: 140, textAlign: 'right' }}>จำนวน (฿)</th>
                      <th style={{ width: 150, textAlign: 'center' }}>จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drillDown.items.map((it, i) => (
                      <DrillRow key={i} item={it} onCommit={commitForecastEdit} onView={setDetailItem} />
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 10, fontSize: 11, color: 'var(--ink-500)', lineHeight: 1.6 }}>
                💡 <strong>AP</strong> = เจ้าหนี้คงค้างจากระบบ ·
                <strong> IV</strong> = ใบแจ้งหนี้รับเงิน ·
                <strong> Forecast</strong> = ประมาณการบันทึกเอง<br />
                👆 <strong>คลิกที่บรรทัด</strong> เพื่อดูรายละเอียดของรายการนั้น ·
                ✏️ แถว <strong>Forecast (PLANNED)</strong> กด <strong>แก้</strong> เพื่อแก้ยอด แล้วกด ✓ บันทึก (ซิงค์อัตโนมัติ) ·
                AP/IV และรายการที่เกิดจริงแล้ว แก้ที่หน้า
                <a href="#data_payables" style={{ color: 'var(--brand-600)' }}> AP Outstanding</a>,
                <a href="#data_invoices" style={{ color: 'var(--brand-600)' }}> รายงานติดตามรับเงิน</a> หรือ
                <a href="#data_forecast" style={{ color: 'var(--brand-600)' }}> ประมาณการรายจ่าย</a>
              </div>
            </>
          )}
        </Modal>
      )}

      {/* ═════ Per-item detail popup (ซ้อนบน drill-down) ═══════════════════ */}
      {detailItem && (
        <Modal open={!!detailItem} title={'รายละเอียดรายการ · ' + (detailItem.name || '')} maxWidth={560}
          onClose={() => setDetailItem(null)}
          footer={<button className="btn btn-primary" onClick={() => setDetailItem(null)}>ปิด</button>}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
            padding: '10px 14px', marginBottom: 12, borderRadius: 8, background: 'var(--brand-50)',
          }}>
            <span style={{
              display: 'inline-block', padding: '3px 10px', borderRadius: 5, fontSize: 12, fontWeight: 700,
              background: detailItem.source === 'AP' ? 'color-mix(in oklch, var(--bad) 16%, transparent)' :
                          detailItem.source === 'IV' ? 'color-mix(in oklch, var(--good) 16%, transparent)' :
                          'color-mix(in oklch, var(--brand-500) 16%, transparent)',
              color: detailItem.source === 'AP' ? 'var(--bad)' : detailItem.source === 'IV' ? 'var(--good)' : 'var(--brand-700)',
            }}>{detailItem.source}</span>
            <span style={{ fontSize: 20, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
              color: detailItem.amount < 0 ? 'var(--bad)' : 'var(--good)' }}>
              {fmtNum(detailItem.amount, 0)} ฿
            </span>
          </div>
          <table className="tbl" style={{ width: '100%', fontSize: 13 }}>
            <tbody>
              {(detailItem.detail || []).map(([k, v], j) => (
                <tr key={j}>
                  <td style={{ width: 170, color: 'var(--ink-500)', verticalAlign: 'top', padding: '6px 12px' }}>{k}</td>
                  <td style={{ fontWeight: 600, color: 'var(--ink-800)', padding: '6px 12px' }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Modal>
      )}

      {/* ═════ แก้รายชื่อเจ้าหนี้กลุ่มสภาพคล่อง ═══════════════════════════ */}
      {flexEditOpen && (
        <FlexVendorEditor
          vendors={flexVendors}
          allVendorNames={[...new Set((payables || []).map(p => (p.cust_name || p.vendor || '').trim()).filter(Boolean))]}
          onClose={() => setFlexEditOpen(false)}
          onSave={(list) => { cfSaveFlexVendors(list); setFlexVendors(list); setFlexEditOpen(false); }}
        />
      )}
    </div>
  );
}

// ─── Helpers (presentational) ─────────────────────────────────────────────
function SectionTitle({ num, title, subtitle }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 0 14px' }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg, var(--brand-500), var(--brand-700))', color: 'white', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 14 }}>{num}</div>
      <div>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--ink-900)' }}>{title}</h2>
        <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>{subtitle}</div>
      </div>
    </div>
  );
}

function BalanceCard({ tone, label, value, hint, icon, editMode, ovKey }) {
  const tones = {
    bf:   { bg: 'linear-gradient(135deg, var(--brand-500), var(--brand-700))', text: 'white' },
    now:  { bg: 'linear-gradient(135deg, oklch(62% 0.13 245), oklch(46% 0.16 255))', text: 'white' },
    good: { bg: 'linear-gradient(135deg, oklch(65% 0.16 152), oklch(50% 0.16 152))', text: 'white' },
    bad:  { bg: 'linear-gradient(135deg, oklch(65% 0.18 22), oklch(50% 0.18 22))',   text: 'white' },
  };
  const t = tones[tone] || tones.bf;
  const displayValue = ovKey ? WTPOverride.resolve(ovKey, value) : value;
  useOverrideSub(ovKey || '_');
  return (
    <div className="card" style={{ background: t.bg, color: t.text, borderColor: 'transparent', padding: 22, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', right: -40, top: -40, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
      <div style={{ position: 'relative' }}>
        <div style={{ fontSize: 13, opacity: 0.9, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
          {icon && <Icon name={icon} size={14} />} {label}
        </div>
        <div style={{ fontSize: 36, fontWeight: 800, fontVariantNumeric: 'tabular-nums', marginTop: 6, letterSpacing: '-.02em' }}>
          {editMode && ovKey ? (
            <EditableNumber ovKey={ovKey} computed={value} editMode={true} digits={0} />
          ) : (
            <>
              {displayValue < 0 ? '(' : ''}{fmtNum(Math.abs(displayValue), 0)}{displayValue < 0 ? ')' : ''}
              {ovKey && WTPOverride.has(ovKey) && <span title="แก้มือ" style={{ fontSize: 13, marginLeft: 8, opacity: 0.9 }}>✏️</span>}
            </>
          )}
        </div>
        {hint && <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>{hint}</div>}
      </div>
    </div>
  );
}

function PlanVsActualCard({ tone, icon, label, plan, actual, hint, editMode, ovKey }) {
  const planK   = ovKey ? `${ovKey}.plan`   : null;
  const actualK = ovKey ? `${ovKey}.actual` : null;
  useOverrideSub(planK || '_');
  useOverrideSub(actualK || '_');
  const planV   = planK   ? WTPOverride.resolve(planK,   plan)   : plan;
  const actualV = actualK ? WTPOverride.resolve(actualK, actual) : actual;
  const pct = planV > 0 ? Math.max(0, Math.min(150, (actualV / planV) * 100)) : 0;
  const gap = actualV - planV;
  const tones = {
    good: { accent: 'var(--good)', bg: 'var(--good-bg)' },
    bad:  { accent: 'var(--bad)',  bg: 'var(--bad-bg)' },
    info: { accent: 'oklch(60% 0.18 295)', bg: 'var(--brand-50)' },
  };
  const t = tones[tone] || tones.info;
  return (
    <div className="card" style={{ padding: 18, position: 'relative' }}>
      <div className="kpi-accent" style={{ background: t.accent }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-700)', fontWeight: 600 }}>
          {icon && <Icon name={icon} size={15} />}{label}
        </div>
        <Badge kind={pct >= 100 ? 'b-green' : pct >= 50 ? 'b-blue' : 'b-amber'} dot={false}>{pct.toFixed(1)}%</Badge>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Plan</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink-700)', fontVariantNumeric: 'tabular-nums' }}>
            {planK ? <EditableNumber ovKey={planK} computed={plan} editMode={editMode} digits={0} /> : fmtNum(planV, 0)}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Actual</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: t.accent, fontVariantNumeric: 'tabular-nums' }}>
            {actualK ? <EditableNumber ovKey={actualK} computed={actual} editMode={editMode} digits={0} /> : fmtNum(actualV, 0)}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 14 }}>
        <div style={{ height: 8, background: 'var(--ink-100)', borderRadius: 6, overflow: 'hidden' }}>
          <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: t.accent, borderRadius: 6, transition: 'width 800ms cubic-bezier(.2,.7,.2,1)' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--ink-500)', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
          <span>{hint}</span>
          <span style={{ color: gap >= 0 ? (tone === 'bad' ? 'var(--bad)' : 'var(--good)') : (tone === 'bad' ? 'var(--good)' : 'var(--bad)'), fontWeight: 600 }}>
            {gap >= 0 ? '+' : ''}{fmtNum(gap, 0)}
          </span>
        </div>
      </div>
    </div>
  );
}

function KpiCompare({ label, forecast, actual, accent, icon }) {
  const pct = forecast > 0 ? (actual / forecast) * 100 : 0;
  return (
    <div className="card" style={{ padding: 14, position: 'relative' }}>
      <div className="kpi-accent" style={{ background: accent }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-600)', fontWeight: 600 }}>
        {icon && <Icon name={icon} size={14} style={{ color: accent }} />} {label}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Forecast</div>
          <div style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--ink-700)' }}>
            {fmtNum(forecast, 0)}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Actual</div>
          <div style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: accent }}>
            {fmtNum(actual, 0)}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 8 }}>
        <div style={{ height: 5, background: 'var(--ink-100)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: accent, transition: 'width 400ms' }} />
        </div>
        <div style={{ fontSize: 10, color: 'var(--ink-500)', marginTop: 3, textAlign: 'right' }}>
          {pct.toFixed(1)}%
        </div>
      </div>
    </div>
  );
}

function PlanRow({ label, current, rest, total, subtle, negative, carrySigned, onCellClick, editMode, ovKey }) {
  // negative   → outflow (always positive number wrapped in parens)
  // carrySigned→ row may show negative carry-forward without parens (e.g. -2,612,841)
  // onCellClick: (period) => void  — if provided, makes cells clickable for drill-down
  // ovKey      → if provided + editMode, cells become EditableNumber with keys ovKey.current/.rest/.total
  const fmtVal = v => {
    if (v == null || v === 0) return '—';
    if (carrySigned) return fmtNum(v, 0);
    if (negative && v > 0) return `(${fmtNum(v, 0)})`;
    return fmtNum(v, 0);
  };
  const colorFor = v => {
    if (v == null || v === 0) return 'inherit';
    if (carrySigned && v < 0) return 'var(--bad)';
    if (negative) return 'var(--bad)';
    return subtle ? 'var(--ink-500)' : 'inherit';
  };
  const clickable = !!onCellClick && !editMode;  // disable drill in edit mode
  const cellStyle = (val, extra) => ({
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
    color: colorFor(val),
    cursor: clickable && val ? 'pointer' : 'default',
    textDecorationLine: clickable && val ? 'underline' : 'none',
    textDecorationStyle: 'dotted',
    textDecorationColor: 'var(--ink-300)',
    textUnderlineOffset: 3,
    transition: 'background 120ms',
    ...extra,
  });
  const hover = (e, on) => {
    if (!clickable) return;
    e.currentTarget.style.background = on ? 'color-mix(in oklch, var(--brand-500) 12%, transparent)' : '';
  };
  // helper เพื่อแสดงเลขใน cell — edit mode = EditableNumber, ปกติ = ค่าหลัง resolve override
  const renderCell = (val, subKey) => {
    if (!ovKey) return fmtVal(val);
    const key = `${ovKey}.${subKey}`;
    if (editMode) {
      return <EditableNumber ovKey={key} computed={val} editMode={true} digits={0} />;
    }
    let resolved = WTPOverride.resolve(key, val);
    // สำหรับ outflow rows (negative=true): user อาจคีย์เป็นบวกหรือลบก็ได้
    //   normalize เป็น absolute ก่อนโชว์ เพื่อให้ display สอดคล้องกับการคำนวณ
    //   (math ก็ใช้ Math.abs ใน _resolvedOut)
    if (negative) resolved = Math.abs(resolved);
    return (
      <>
        {fmtVal(resolved)}
        {WTPOverride.has(key) && <span title="แก้มือ" style={{ fontSize: 9, marginLeft: 3, color: 'var(--brand-500)' }}>✏️</span>}
      </>
    );
  };
  return (
    <tr>
      <td style={{ paddingLeft: 24, fontSize: 12.5, color: subtle ? 'var(--ink-500)' : 'inherit' }}>{label}</td>
      <td
        onClick={() => clickable && current && onCellClick('current')}
        onMouseEnter={e => hover(e, true)}
        onMouseLeave={e => hover(e, false)}
        title={clickable && current ? 'คลิกเพื่อดูรายการรายตัว' : ''}
        style={cellStyle(current, { background: 'color-mix(in oklch, var(--brand-50) 50%, transparent)' })}>
        {renderCell(current, 'current')}
      </td>
      <td
        onClick={() => clickable && rest && onCellClick('rest')}
        onMouseEnter={e => hover(e, true)}
        onMouseLeave={e => hover(e, false)}
        title={clickable && rest ? 'คลิกเพื่อดูรายการรายตัว' : ''}
        style={cellStyle(rest)}>
        {renderCell(rest, 'rest')}
      </td>
      <td
        onClick={() => clickable && total && onCellClick('total')}
        onMouseEnter={e => hover(e, true)}
        onMouseLeave={e => hover(e, false)}
        title={clickable && total ? 'คลิกเพื่อดูรายการรายตัว' : ''}
        style={cellStyle(total, { fontWeight: 600, background: 'var(--ink-50)' })}>
        {renderCell(total, 'total')}
      </td>
    </tr>
  );
}

// ─── Drill-down row — คลิกทั้งบรรทัด = ดูรายละเอียด · ปุ่ม "แก้" = แก้ยอด ───
//   AP/IV/รายการที่เกิดจริง = ดูอย่างเดียว · Forecast (PLANNED) = กดแก้ยอดได้
//   แก้ = กรอก "ขนาด" (magnitude) คงเครื่องหมายเดิม (จ่าย = ลบ, รับ = บวก)
//   ช่องแก้เป็น text + comma (ไม่มีลูกศรเพิ่ม/ลด) พิมพ์เองได้เร็ว
function DrillRow({ item, onCommit, onView }) {
  const readOnly = typeof _wtpRoleIsReadOnly === 'function' && _wtpRoleIsReadOnly();
  const editable = item.editable && !readOnly && item.feId;
  const fmtMag = (a) => { const m = Math.abs(Number(a) || 0); return m ? Math.round(m).toLocaleString('en-US') : ''; };
  const [editing, setEditing] = cfState(false);
  const [hover, setHover]     = cfState(false);
  const [val, setVal]         = cfState(fmtMag(item.amount));
  cfEffect(() => { setVal(fmtMag(item.amount)); }, [item.amount]);

  const sign = Number(item.amount) < 0 ? -1 : 1;
  const save = () => {
    const mag = parseFloat(String(val).replace(/,/g, ''));
    if (isNaN(mag)) { setVal(fmtMag(item.amount)); setEditing(false); return; }
    const signed = sign * Math.abs(mag);
    if (signed !== Number(item.amount)) onCommit(item.feId, signed);
    setEditing(false);
  };
  const cancel = () => { setVal(fmtMag(item.amount)); setEditing(false); };
  const stop = (e) => e.stopPropagation();   // กันไม่ให้คลิกในปุ่ม/ช่องไปเปิด popup

  const srcStyle = {
    display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
    background: item.source === 'AP' ? 'color-mix(in oklch, var(--bad) 14%, transparent)' :
                item.source === 'IV' ? 'color-mix(in oklch, var(--good) 14%, transparent)' :
                'color-mix(in oklch, var(--brand-500) 14%, transparent)',
    color: item.source === 'AP' ? 'var(--bad)' : item.source === 'IV' ? 'var(--good)' : 'var(--brand-700)',
  };
  const miniBtn = (extra) => ({
    padding: '3px 9px', fontSize: 11, fontWeight: 600, borderRadius: 6,
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--ink-200)',
    background: 'white', cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 4, ...extra,
  });

  return (
    <tr
      onClick={() => { if (!editing && onView) onView(item); }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={editing ? '' : 'คลิกเพื่อดูรายละเอียด'}
      style={{ cursor: editing ? 'default' : 'pointer',
        background: (!editing && hover) ? 'color-mix(in oklch, var(--brand-500) 7%, transparent)' : '' }}
    >
      <td><span style={srcStyle}>{item.source}</span></td>
      <td style={{ whiteSpace: 'nowrap', color: 'var(--ink-600)' }}>{fmtDate(item.date) || item.date}</td>
      <td style={{ fontFamily: 'ui-monospace', fontSize: 11.5, color: 'var(--brand-700)' }}>{item.ref || '—'}</td>
      <td>{item.name}</td>
      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums',
          color: item.amount < 0 ? 'var(--bad)' : 'var(--good)', fontWeight: 600 }}>
        {editing ? (
          <input
            type="text" inputMode="numeric" autoFocus value={val}
            onClick={stop}
            onChange={e => {
              const digits = e.target.value.replace(/[^\d]/g, '');
              setVal(digits ? Number(digits).toLocaleString('en-US') : '');
            }}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
            style={{ width: 110, padding: '3px 8px',
              borderWidth: '1.5px', borderStyle: 'solid', borderColor: 'var(--brand-400)', borderRadius: 6,
              background: 'color-mix(in oklch, var(--brand-500) 6%, white)', textAlign: 'right',
              fontFamily: 'ui-monospace', fontVariantNumeric: 'tabular-nums', fontWeight: 600, fontSize: 'inherit', color: 'inherit' }}
          />
        ) : fmtNum(item.amount, 0)}
      </td>
      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }} onClick={editing ? stop : undefined}>
        {editing ? (
          <span style={{ display: 'inline-flex', gap: 4 }}>
            <button type="button" onClick={(e) => { stop(e); save(); }} title="บันทึก"
              style={miniBtn({ borderColor: 'var(--good)', color: 'var(--good)' })}>✓ บันทึก</button>
            <button type="button" onClick={(e) => { stop(e); cancel(); }} title="ยกเลิก"
              style={miniBtn({ borderColor: 'var(--ink-300)', color: 'var(--ink-500)' })}>✕</button>
          </span>
        ) : editable ? (
          <button type="button" onClick={(e) => { stop(e); setEditing(true); }} title="แก้ยอดประมาณการ"
            style={miniBtn({ borderColor: 'var(--brand-400)', color: 'var(--brand-700)' })}>✏️ แก้</button>
        ) : (
          <span style={{ color: 'var(--ink-300)', fontSize: 14 }}>›</span>
        )}
      </td>
    </tr>
  );
}

// ─── Flexible-pool payment cell — always-editable inline (comma, no spinner) ─
//   เขียนค่าเข้า WTPOverride (sync + per-month) — ยอดที่ "เลือกจ่าย" งวดนั้น
function FlexPayCell({ ovKey }) {
  useOverrideSub(ovKey);
  const readOnly = typeof _wtpRoleIsReadOnly === 'function' && _wtpRoleIsReadOnly();
  const cur = Math.abs(Number(WTPOverride.resolve(ovKey, 0)) || 0);
  const [val, setVal] = cfState(cur ? cur.toLocaleString('en-US') : '');
  cfEffect(() => { setVal(cur ? cur.toLocaleString('en-US') : ''); }, [cur]);
  if (readOnly) {
    return <span style={{ color: 'var(--bad)', fontVariantNumeric: 'tabular-nums' }}>{cur ? `(${fmtNum(cur, 0)})` : '—'}</span>;
  }
  const commit = (e) => {
    const raw = e && e.target ? e.target.value : val;
    const n = parseFloat(String(raw).replace(/,/g, ''));
    if (isNaN(n) || n === 0) WTPOverride.clear(ovKey); else WTPOverride.set(ovKey, Math.abs(n));
  };
  return (
    <input
      type="text" inputMode="numeric" value={val} placeholder="0"
      onChange={e => { const d = e.target.value.replace(/[^\d]/g, ''); setVal(d ? Number(d).toLocaleString('en-US') : ''); }}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { setVal(cur ? cur.toLocaleString('en-US') : ''); e.target.blur(); } }}
      title="ยอดที่เลือกจ่ายกลุ่มสภาพคล่องงวดนี้"
      style={{ width: 110, padding: '3px 8px', borderWidth: '1.5px', borderStyle: 'solid', borderColor: 'var(--brand-300)',
        borderRadius: 6, background: 'color-mix(in oklch, var(--brand-500) 5%, white)', textAlign: 'right',
        fontFamily: 'ui-monospace', fontVariantNumeric: 'tabular-nums', fontWeight: 600, fontSize: 'inherit', color: 'var(--bad)' }}
    />
  );
}

// ─── Vendor-list editor for the flexible group ─────────────────────────────
function FlexVendorEditor({ vendors, allVendorNames, onClose, onSave }) {
  const readOnly = typeof _wtpRoleIsReadOnly === 'function' && _wtpRoleIsReadOnly();
  const [list, setList] = cfState((vendors || []).slice());
  const [input, setInput] = cfState('');
  const add = (v) => {
    const s = String(v || '').trim();
    if (!s || list.some(x => x.toLowerCase() === s.toLowerCase())) { setInput(''); return; }
    setList([...list, s]); setInput('');
  };
  const remove = (i) => setList(list.filter((_, j) => j !== i));
  const matchCount = (frag) => (allVendorNames || []).filter(n => n.toLowerCase().includes(String(frag).toLowerCase())).length;
  const unmatched = (allVendorNames || []).filter(n => !cfIsFlexibleVendor(n, list)).sort((a, b) => a.localeCompare(b, 'th'));
  return (
    <Modal open title="แก้รายชื่อเจ้าหนี้กลุ่มจ่ายตามสภาพคล่อง" maxWidth={640}
      onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>ยกเลิก</button>
        <button className="btn btn-primary" disabled={readOnly} onClick={() => onSave(list.filter(Boolean))}>บันทึก</button>
      </>}>
      <div style={{ fontSize: 12.5, color: 'var(--ink-500)', marginBottom: 10, lineHeight: 1.6 }}>
        จับคู่ด้วย "เศษชื่อ" แบบ contains (เช่น "เวลโกร" จะจับ "บริษัท เวลโกร แมนูแฟคเจอริ่ง จำกัด") · เลขในวงเล็บ = จำนวนเจ้าหนี้ในระบบที่ตรง
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {list.length === 0 && <span style={{ color: 'var(--ink-400)', fontSize: 12 }}>ยังไม่มีรายชื่อ</span>}
        {list.map((f, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 14,
            background: matchCount(f) ? 'color-mix(in oklch, oklch(60% 0.13 245) 12%, transparent)' : 'color-mix(in oklch, var(--bad) 10%, transparent)',
            color: matchCount(f) ? 'oklch(40% 0.16 255)' : 'var(--bad)', fontSize: 12.5, fontWeight: 600 }}>
            {f} <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--ink-500)' }}>({matchCount(f)})</span>
            {!readOnly && <button onClick={() => remove(i)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--bad)', fontSize: 15, padding: 0, lineHeight: 1 }}>×</button>}
          </span>
        ))}
      </div>
      {!readOnly && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(input); }}
            placeholder="พิมพ์ชื่อ/เศษชื่อบริษัท…"
            style={{ flex: 1, padding: '6px 10px', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--ink-200)', borderRadius: 6, fontSize: 13 }} />
          <button className="btn btn-primary" onClick={() => add(input)}>เพิ่ม</button>
        </div>
      )}
      {!readOnly && unmatched.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-600)', marginBottom: 6 }}>เจ้าหนี้ในระบบที่ยังไม่อยู่ในกลุ่ม (คลิกเพื่อเพิ่ม)</div>
          <div style={{ maxHeight: 200, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
            {unmatched.map((n, i) => (
              <button key={i} onClick={() => add(n)}
                style={{ textAlign: 'left', padding: '4px 8px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12.5, color: 'var(--ink-700)', borderRadius: 4 }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--ink-50)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                + {n}
              </button>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── Flexible-pool panel — แสดงใน popup หมวดโครงการ (out2) ─────────────────
//   ยอดค้างกลุ่ม + เลือกจ่าย + คงค้าง + ช่องคีย์ยอดจ่าย + breakdown รายเจ้าหนี้
function FlexPoolPanel({ pool, vendorCount, ovPrefix, chosenCurrent, chosenRest, onEditVendors }) {
  const chosen = chosenCurrent + chosenRest;
  const remaining = Math.max(0, pool.total - chosen);
  return (
    <div style={{ borderWidth: '1.5px', borderStyle: 'solid', borderColor: 'color-mix(in oklch, oklch(55% 0.15 250) 35%, var(--line))', borderRadius: 10, overflow: 'hidden', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, padding: '8px 14px', background: 'color-mix(in oklch, oklch(60% 0.13 245) 10%, transparent)' }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'oklch(40% 0.16 255)' }}>
          💧 เจ้าหนี้จ่ายตามสภาพคล่อง <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink-500)' }}>({vendorCount} ราย · ไม่จัดตามดิว เลือกจ่ายเอง)</span>
        </div>
        <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '3px 10px' }} onClick={onEditVendors}><Icon name="edit" size={12} /> แก้รายชื่อ</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, background: 'var(--line)' }}>
        <div style={{ padding: '10px 14px', background: 'var(--surface)' }}>
          <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>ยอดค้างทั้งกลุ่ม</div>
          <div style={{ fontSize: 18, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: 'var(--ink-700)' }}>{fmtNum(pool.total, 0)}</div>
          <div style={{ fontSize: 10.5, color: 'var(--ink-400)' }}>{pool.count} ใบ · {pool.rows.length} เจ้าหนี้</div>
        </div>
        <div style={{ padding: '10px 14px', background: 'var(--surface)' }}>
          <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>เลือกจ่ายเดือนนี้</div>
          <div style={{ fontSize: 18, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: 'var(--bad)' }}>{fmtNum(chosen, 0)}</div>
        </div>
        <div style={{ padding: '10px 14px', background: 'var(--surface)' }}>
          <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>คงค้างหลังจ่าย</div>
          <div style={{ fontSize: 18, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: remaining > 0 ? 'var(--warn)' : 'var(--good)' }}>{fmtNum(remaining, 0)}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', padding: '10px 14px', background: 'var(--surface)', borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: 'var(--line)', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-600)' }}>วางแผนจ่าย:</span>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-600)' }}>สัปดาห์นี้ <FlexPayCell ovKey={`${ovPrefix}.s01.flex.current`} /></label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-600)' }}>ช่วงที่เหลือ <FlexPayCell ovKey={`${ovPrefix}.s01.flex.rest`} /></label>
      </div>
      {pool.rows.length > 0 && (
        <div style={{ maxHeight: 220, overflow: 'auto', borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: 'var(--line)' }}>
          <table className="tbl" style={{ width: '100%', fontSize: 12.5 }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
              <tr><th style={{ textAlign: 'left' }}>เจ้าหนี้ (ยอดค้างทั้งหมด)</th><th style={{ width: 150, textAlign: 'right' }}>ยอดค้าง (฿)</th></tr>
            </thead>
            <tbody>
              {pool.rows.map((r, i) => (
                <tr key={i}><td>{r.name}</td><td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: 'var(--bad)' }}>{fmtNum(r.sum, 0)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { CashFlowDashboard });
