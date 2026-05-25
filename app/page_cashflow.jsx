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
function findWeekIdx(dateISO, weeks) {
  if (!dateISO) return -1;
  const d = new Date(dateISO);
  if (isNaN(d)) return -1;
  const day = d.getDate();
  const idx = weeks.findIndex(w => day >= w.from && day <= w.to);
  return idx;
}
function inMonth(dateISO, year, month) {
  if (!dateISO) return false;
  const d = new Date(dateISO);
  if (isNaN(d)) return false;
  return d.getFullYear() === year && (d.getMonth() + 1) === month;
}

// ─── Category mapping for outflow (4 categories) ──────────────────────────
function categorizePayable(ap) {
  const dpt = String(ap.dpt_code || '').toUpperCase().trim();
  if (dpt === 'FIN') return 3;
  if (ap.jobcode || ap.jobname) return 2;
  return 1;
}
function categorizeForecastEntry(fe) {
  // Explicit CATEGORY field wins (1-4)
  const cat = parseInt(fe.CATEGORY || fe.category || '0', 10);
  if (cat >= 1 && cat <= 4) return cat;
  // Fallback: detect salary by description
  const desc = String(fe.DESCRIPTION || fe.description || '').toLowerCase();
  if (desc.includes('เงินเดือน') || desc.includes('salary')) return 4;
  return 1;
}
const CATEGORY_LABELS = {
  1: 'ค่าใช้จ่ายดำเนินงาน',
  2: 'ค่าใช้จ่ายโครงการ',
  3: 'ค่าใช้จ่ายฝ่ายการเงิน',
  4: 'เงินเดือน',
};

// ─── Inflow helpers ────────────────────────────────────────────────────────
function ivNetExpected(iv) {
  // Net = balance × 0.99 (WHT 1%) - debt (ภาระหนี้)
  const bal = Number(iv.balance) || 0;
  const debt = Number(iv.debt) || 0;
  return Math.max(0, bal * 0.99 - debt);
}
function ivIsPaid(iv) {
  const s = String(iv.status || '').toLowerCase();
  return s === 'paid' || s === 'รับชำระแล้ว';
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

// ─── Main page ─────────────────────────────────────────────────────────────
function CashFlowDashboard({ data, setData, toast }) {
  const today = new Date();
  const [year, setYear]   = cfState(today.getFullYear());
  const [month, setMonth] = cfState(today.getMonth() + 1);

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
  const mainAccounts   = bankAccounts.filter(a => (a.accountType || 'main').toLowerCase() !== 'closed' && (a.accountType || 'main').toLowerCase() !== 'dormant');

  // ── B/F: balance at last day of previous month (auto from snapshots) ──
  const monthBF = cfMemo(() => {
    const prevYear  = month === 1 ? year - 1 : year;
    const prevMonth = month === 1 ? 12 : month - 1;
    const lastDayPrev = new Date(prevYear, prevMonth, 0).getDate();
    const cutoff = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(lastDayPrev).padStart(2, '0')}`;
    return getBalanceAtDate(snapshots, cutoff);
  }, [snapshots, year, month]);

  // ── Live balance (sum of main bank accounts now) ──────────────────────
  const liveBalance = mainAccounts.reduce((s, a) => s + (Number(a.BALANCE) || 0), 0);

  // ── AP-PV match: exclude AP that has a matching PV ────────────────────
  const paidVchnoSet = cfMemo(() => buildPaidVchnoSet(pvVouchers), [pvVouchers]);

  // ── Bucket AP forecast outflow by week × category ─────────────────────
  // [week][category] = sum
  const apForecastByWeekCat = cfMemo(() => {
    const grid = weeks.map(() => ({ 1: 0, 2: 0, 3: 0, 4: 0 }));
    payables.forEach(ap => {
      if (paidVchnoSet.has(ap.vchno)) return;   // already paid → exclude
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
  }, [payables, forecastEntries, paidVchnoSet, weeks, year, month]);

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
      const net = ivNetExpected(iv);
      // Forecast: expectedReceive in current month, not yet paid
      if (!ivIsPaid(iv) && iv.expectedReceive && inMonth(iv.expectedReceive, year, month)) {
        const w = findWeekIdx(iv.expectedReceive, weeks);
        if (w >= 0) forecast[w] += net;
      }
      // Actual: actualReceive.date in current month
      const ad = ivActualReceiveDate(iv);
      if (ad && inMonth(ad, year, month)) {
        const w = findWeekIdx(ad, weeks);
        if (w >= 0) actual[w] += net;
      }
    });
    return { forecast, actual };
  }, [invoices, weeks, year, month]);

  // ── Loan inflow (forecast + actual) — from forecastEntries CATEGORY=LOAN
  const loanByWeek = cfMemo(() => {
    const forecast = weeks.map(() => 0);
    const actual   = weeks.map(() => 0);
    forecastEntries.forEach(fe => {
      const isLoan = String(fe.EXPENSE_TYPE || fe.CATEGORY || '').toUpperCase() === 'LOAN';
      if (!isLoan) return;
      const amt = Number(fe.AMOUNT || fe.amount || 0);
      if (amt <= 0) return;
      const date = fe.PAYMENT_DATE || fe.DATE;
      if (!inMonth(date, year, month)) return;
      const w = findWeekIdx(date, weeks);
      if (w < 0) return;
      const status = String(fe.STATUS || '').toUpperCase();
      if (status === 'CANCELED') return;
      if (status === 'ACTUAL' || status === 'BOOKED') {
        actual[w] += Number(fe.ACTUAL_AMOUNT || fe.AMOUNT || 0);
      } else {
        forecast[w] += amt;
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
  const strategicNet = monthBF + loanForecast + ivForecast - outflowForecast;

  // ── Plan section: current week vs rest-of-month ───────────────────────
  const isCurrentWeek = i => i === nowWeek;
  const isRestWeek    = i => i > nowWeek;
  const currentRestSplit = (weekArr) => ({
    current: weekArr[nowWeek] || 0,
    rest:    weekArr.reduce((s, v, i) => i > nowWeek ? s + (v || 0) : s, 0),
    total:   weekArr.reduce((s, v, i) => i >= nowWeek ? s + (v || 0) : s, 0),
  });

  // Combine forecast (PLANNED) + actual (ACTUAL+BOOKED) for "what's happening this period"
  const ivCombinedByWeek  = weeks.map((_, i) => (ivInflowByWeek.forecast[i] || 0) + (ivInflowByWeek.actual[i] || 0));
  const loanCombinedByWeek= weeks.map((_, i) => (loanByWeek.forecast[i] || 0) + (loanByWeek.actual[i] || 0));

  const planIv   = currentRestSplit(ivCombinedByWeek);
  const planLoan = currentRestSplit(loanCombinedByWeek);
  const planOut  = {
    1: currentRestSplit(apForecastByWeekCat.map(g => g[1])),
    2: currentRestSplit(apForecastByWeekCat.map(g => g[2])),
    3: currentRestSplit(apForecastByWeekCat.map(g => g[3])),
    4: currentRestSplit(apForecastByWeekCat.map(g => g[4])),
  };
  const totalOutCurrent = planOut[1].current + planOut[2].current + planOut[3].current + planOut[4].current;
  const totalOutRest    = planOut[1].rest    + planOut[2].rest    + planOut[3].rest    + planOut[4].rest;
  const totalOutAll     = planOut[1].total   + planOut[2].total   + planOut[3].total   + planOut[4].total;

  // ── Week-start balance: snapshot at start of current week ─────────────
  const weekBF = cfMemo(() => {
    if (nowWeek == null || !weeks[nowWeek]) return monthBF;
    const wStart = weeks[nowWeek].fromISO;
    // Day before week start
    const d = new Date(wStart);
    d.setDate(d.getDate() - 1);
    const prevISO = d.toISOString().slice(0, 10);
    return getBalanceAtDate(snapshots, prevISO) || liveBalance;
  }, [snapshots, weeks, nowWeek, monthBF, liveBalance]);

  // Net at end of current week + end of month
  const netEndOfCurrentWeek = weekBF + (planIv.current + planLoan.current) - totalOutCurrent;
  const netEndOfMonth       = netEndOfCurrentWeek + (planIv.rest + planLoan.rest) - totalOutRest;

  // ── Week selector ─────────────────────────────────────────────────────
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
    <div className="page bg-pattern">
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
          <PrintButton label="พิมพ์ / PDF" />
        </div>
      </div>

      {/* ═════ SECTION A — Strategic Management + 4 KPIs ═════════════════ */}
      <div className="card anim-in" style={{
        marginBottom: 16,
        padding: '20px 24px',
        background: strategicNet < 0
          ? 'linear-gradient(135deg, var(--bad-bg), color-mix(in oklch, var(--bad) 4%, white))'
          : 'linear-gradient(135deg, var(--good-bg), color-mix(in oklch, var(--good) 4%, white))',
        border: `2px solid ${strategicNet < 0 ? 'var(--bad)' : 'var(--good)'}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--ink-500)' }}>
              Strategic Management — คาดการณ์สิ้นเดือน
            </div>
            <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-0.02em',
              color: strategicNet < 0 ? 'var(--bad)' : 'var(--good)',
              fontVariantNumeric: 'tabular-nums', marginTop: 4 }}>
              {strategicNet < 0 ? '(' : ''}{fmtNum(Math.abs(strategicNet), 0)}{strategicNet < 0 ? ')' : ''}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-600)', marginTop: 4 }}>
              = ยอดยกมา {fmtNum(monthBF, 0)} + เงินกู้ {fmtNum(loanForecast, 0)} + รายรับ {fmtNum(ivForecast, 0)} − ค่าใช้จ่าย {fmtNum(outflowForecast, 0)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>คงเหลือสุทธิ ณ ปัจจุบัน</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: liveBalance < 0 ? 'var(--bad)' : 'var(--good)', fontVariantNumeric: 'tabular-nums' }}>
              {fmtNum(liveBalance, 2)} ฿
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-500)', marginTop: 2 }}>
              จาก {mainAccounts.length} บัญชีหลัก ·
              <a href="#daily_balance" style={{ marginLeft: 4, color: 'var(--brand-600)' }}>บันทึกยอด →</a>
            </div>
          </div>
        </div>
      </div>

      {/* 4 KPI tiles with Forecast/Actual/% */}
      <div className="grid grid-4 anim-stagger" style={{ marginBottom: 22 }}>
        <KpiCompare label="ยอดยกมา (B/F)" forecast={monthBF} actual={monthBF} accent="var(--brand-500)" icon="coin" />
        <KpiCompare label="เงินกู้ (LOAN)" forecast={loanForecast} actual={loanActual} accent="oklch(60% 0.18 295)" icon="money" />
        <KpiCompare label="รายรับโครงการ (IV)" forecast={ivForecast} actual={ivActual} accent="var(--good)" icon="bank" />
        <KpiCompare label="ค่าใช้จ่ายรวม" forecast={outflowForecast} actual={outflowActual} accent="var(--bad)" icon="arrow_up" />
      </div>

      {/* ═════ SECTION B — Plan: current week vs rest of month ═════════ */}
      <SectionTitle num="01"
        title="ประมาณการรายสัปดาห์"
        subtitle={`เน้นสัปดาห์ปัจจุบัน (${weeks[nowWeek]?.label || 'W?'} · ${weeks[nowWeek]?.from || '-'}-${weeks[nowWeek]?.to || '-'} ${monthNames[month - 1]}) · ที่เหลือยุบรวม`}
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
                💰 กระแสเงินสดเข้า (Inflow)
              </td>
            </tr>
            <PlanRow label="ยอดเงินยกมา (ต้นสัปดาห์)" current={nowWeek === 0 ? monthBF : weekBF} rest={0} total={nowWeek === 0 ? monthBF : weekBF} subtle />
            <PlanRow label="รับจากโครงการ (IV)" current={planIv.current} rest={planIv.rest} total={planIv.total} />
            <PlanRow label="เงินกู้ (ประมาณการ)" current={planLoan.current} rest={planLoan.rest} total={planLoan.total} />

            {/* ── OUTFLOW section ─────────────────────────────────────── */}
            <tr style={{ background: 'color-mix(in oklch, var(--bad) 8%, transparent)' }}>
              <td colSpan={4} style={{ fontWeight: 700, color: 'var(--bad)', fontSize: 13, padding: '8px 14px' }}>
                💸 กระแสเงินสดออก (Outflow) · 4 หมวด
              </td>
            </tr>
            {[1, 2, 3, 4].map(cat => (
              <PlanRow key={cat}
                label={`${cat}. ${CATEGORY_LABELS[cat]}`}
                current={planOut[cat].current}
                rest={planOut[cat].rest}
                total={planOut[cat].total}
                negative
              />
            ))}
            <tr style={{ background: 'var(--bad-bg)', fontWeight: 700 }}>
              <td style={{ textAlign: 'right', paddingRight: 14, fontSize: 12 }}>รวมรายจ่าย</td>
              <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--bad)' }}>({fmtNum(totalOutCurrent, 0)})</td>
              <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--bad)' }}>({fmtNum(totalOutRest, 0)})</td>
              <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--bad)' }}>({fmtNum(totalOutAll, 0)})</td>
            </tr>

            {/* ── Final Net Position ──────────────────────────────────── */}
            <tr style={{ background: 'var(--brand-50)', fontWeight: 800 }}>
              <td style={{ padding: '12px 14px', color: 'var(--brand-700)' }}>
                💼 สุทธิ (Final Net Position)
              </td>
              <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                color: netEndOfCurrentWeek < 0 ? 'var(--bad)' : 'var(--good)' }}>
                {fmtNum(netEndOfCurrentWeek, 0)}
              </td>
              <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--ink-500)', fontSize: 11 }}>
                สิ้น{weeks[nowWeek]?.label || 'W?'} → สิ้นเดือน
              </td>
              <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                color: netEndOfMonth < 0 ? 'var(--bad)' : 'var(--good)', fontSize: 16 }}>
                {fmtNum(netEndOfMonth, 0)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ═════ SECTION C — Weekly Actual Tracking (5 weeks side-by-side) */}
      <SectionTitle num="02"
        title="ติดตามจ่ายจริงรายสัปดาห์"
        subtitle="Weekly Actual Tracking · เปรียบเทียบ Plan vs Actual ทั้ง 5 สัปดาห์ของเดือน"
      />

      <div className="grid anim-in" style={{
        gridTemplateColumns: `repeat(${weeks.length}, minmax(160px, 1fr))`,
        gap: 10, marginBottom: 18, overflowX: 'auto',
      }}>
        {weeks.map((w, i) => {
          const planTotal = [1,2,3,4].reduce((s, c) => s + (apForecastByWeekCat[i][c] || 0), 0);
          const actualTotal = [1,2,3,4].reduce((s, c) => s + (pvActualByWeekCat[i][c] || 0), 0);
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
                  {[1,2,3,4].map(cat => {
                    const p = apForecastByWeekCat[i][cat] || 0;
                    const a = pvActualByWeekCat[i][cat] || 0;
                    return (
                      <tr key={cat}>
                        <td style={{ padding: '3px 6px', fontSize: 10, color: 'var(--ink-600)' }}>{cat}.</td>
                        <td style={{ padding: '3px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--ink-500)' }}>
                          {p > 0 ? fmtNum(p, 0) : '—'}
                        </td>
                        <td style={{ padding: '3px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                          color: a > 0 ? 'var(--bad)' : 'var(--ink-300)', fontWeight: 600 }}>
                          {a > 0 ? fmtNum(a, 0) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--ink-50)', fontWeight: 700 }}>
                    <td style={{ padding: '4px 6px' }}>รวม</td>
                    <td style={{ padding: '4px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 11 }}>{fmtNum(planTotal, 0)}</td>
                    <td style={{ padding: '4px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--bad)', fontSize: 11 }}>{fmtNum(actualTotal, 0)}</td>
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
      <div className="card anim-in" style={{
        padding: '14px 18px', marginBottom: 22,
        background: 'linear-gradient(135deg, var(--brand-50), white)',
        borderColor: 'var(--brand-200)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-600)' }}>Grand Total Actual</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--bad)', fontVariantNumeric: 'tabular-nums' }}>
              {fmtNum(outflowActual, 0)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-600)' }}>% of Plan</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--brand-700)', fontVariantNumeric: 'tabular-nums' }}>
              {outflowForecast > 0 ? ((outflowActual / outflowForecast) * 100).toFixed(2) : '0.00'}%
            </div>
            <div style={{ fontSize: 10, color: 'var(--ink-500)' }}>
              of {fmtNum(outflowForecast, 0)} แผน
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ height: 12, background: 'var(--ink-100)', borderRadius: 6, overflow: 'hidden' }}>
              <div style={{
                width: `${Math.min(100, outflowForecast > 0 ? (outflowActual / outflowForecast) * 100 : 0)}%`,
                height: '100%',
                background: 'linear-gradient(90deg, var(--brand-500), var(--brand-700))',
                transition: 'width 600ms',
              }} />
            </div>
          </div>
        </div>
      </div>

      {/* Footer hints */}
      <div className="card" style={{ marginTop: 12, padding: 14, background: '#fffbeb', borderLeft: '4px solid #f6ad55', fontSize: 12, color: 'var(--ink-700)' }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>💡 หมายเหตุ</div>
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
          <li>ยอดยกมา (B/F) — ดึงจาก <a href="#daily_balance" style={{ color: 'var(--brand-600)' }}>บันทึกยอดธนาคารรายวัน</a> วันสุดท้ายของเดือนที่แล้ว</li>
          <li>รายรับโครงการ — ดึงจากหน้า <a href="#iv_report" style={{ color: 'var(--brand-600)' }}>รายงานติดตาม IV</a> (Net = balance × 99% − ภาระหนี้)</li>
          <li>ค่าใช้จ่าย — ดึงจาก <a href="#data_payable" style={{ color: 'var(--brand-600)' }}>DATA เจ้าหนี้คงค้าง</a> + <a href="#data_pv" style={{ color: 'var(--brand-600)' }}>DATA PV</a> + <a href="#data_forecast" style={{ color: 'var(--brand-600)' }}>ประมาณการนอกระบบ</a></li>
          <li>เงินกู้ — กรอกใน <a href="#data_forecast" style={{ color: 'var(--brand-600)' }}>ประมาณการนอกระบบ</a> โดยตั้ง EXPENSE_TYPE='LOAN' (PLANNED → ACTUAL เมื่อกู้จริง)</li>
          <li>หมวดค่าใช้จ่าย: 1=ดำเนินงาน · 2=โครงการ (มี jobcode) · 3=ฝ่ายการเงิน (dpt_code=FIN) · 4=เงินเดือน (จาก forecastEntries CATEGORY=4)</li>
          <li>AP ที่จ่ายแล้วจะถูกตัดออก (vchno ที่ตรงกับ PV.AP_No) — กัน double count</li>
        </ul>
      </div>
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

function PlanRow({ label, current, rest, total, subtle, negative }) {
  const fmtVal = v => negative && v > 0 ? `(${fmtNum(v, 0)})` : fmtNum(v, 0);
  const color  = negative && (current || rest || total) ? 'var(--bad)' : (subtle ? 'var(--ink-500)' : 'inherit');
  return (
    <tr>
      <td style={{ paddingLeft: 24, fontSize: 12.5, color: subtle ? 'var(--ink-500)' : 'inherit' }}>{label}</td>
      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color, background: 'color-mix(in oklch, var(--brand-50) 50%, transparent)' }}>
        {current ? fmtVal(current) : '—'}
      </td>
      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color }}>
        {rest ? fmtVal(rest) : '—'}
      </td>
      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color, fontWeight: 600, background: 'var(--ink-50)' }}>
        {total ? fmtVal(total) : '—'}
      </td>
    </tr>
  );
}

Object.assign(window, { CashFlowDashboard });
