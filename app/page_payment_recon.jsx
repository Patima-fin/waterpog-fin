// ═══════════════════════════════════════════════════════════════════════════
// page_payment_recon.jsx — "ระบบกระทบยอดการจ่ายเงิน" (route #payment_recon)
//
// จาก Claude Design handoff "Back to Black · รายการจ่าย" — รีธีมเป็นโทนแบรนด์
// น้ำเงิน (--brand-*) ของเว็บเรา + ดึงข้อมูลจริง.
//
// แนวคิด: ต่อ "โครงการที่เซ็นสัญญา" (กรองรายปี) จับคู่
//   • AR (เงินรับจากลูกหนี้) = ใบแจ้งหนี้/ใบเสร็จของโครงการ (ผ่าน installments ของ PCU)
//   • AP (จ่ายผู้รับเหมา)    = เจ้าหนี้คงค้าง (payables) ที่ jobcode = รหัสโครงการ
//                              + จับ PV (pvVouchers) ว่าจ่ายจริงหรือยัง (AP_No↔vchno)
// เงื่อนไขปลดล็อกจ่าย (ตามที่ผู้ใช้เลือก): "AR สะสม ≥ AP สะสม" — จ่ายผู้รับเหมา
//   ได้เท่าที่รับเงินจากลูกหนี้มาแล้ว (ไล่ตามลำดับวันที่ของ AP).
// ปุ่ม "วางแผนจ่าย" เขียน forecastEntries (EXPENSE_TYPE='AP', REF_DOC=vchno,
//   STATUS='PLANNED') — รูปแบบเดียวกับ Bank Diary (BDApPanel) เป๊ะ → ไปโผล่หน้า
//   Bank Daily + หน้านี้โชว์ว่า "วางแผนแล้ว" / ยกเลิกแผนได้.
//
// identifiers ทุกตัว prefix PR/pr กัน global-scope collision (ทุก .jsx = global เดียว).
// reuse globals ที่โหลดก่อนหน้า: window.PCU, fmtMoney, fmtDate, parseDateFlexible,
//   ivReceivedDate(ไม่ได้ใช้ตรง — installments มี receivedDate ให้แล้ว), Modal, Icon,
//   exportRowsToExcel, WTPAuth.
// ═══════════════════════════════════════════════════════════════════════════

// ── helpers (module-level, pure) ──────────────────────────────────────────
function prToNum(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  const n = Number(String(v).replace(/[, ]/g, ''));
  return isNaN(n) ? 0 : n;
}
// รหัสโครงการ: ตัด suffix รุ่นสินค้า (เช่น PP064-STIIS → PP064) — เหมือน normCode ใน pc_engine
function prNormCode(c) {
  const s = String(c == null ? '' : c).trim();
  const m = s.match(/^(.+?)-[A-Z]{2,6}$/);
  return (m ? m[1] : s).toUpperCase();
}
// ISO YYYY-MM-DD จากค่าวันที่หลายรูปแบบ (ISO / DD/MM/พ.ศ. / Date)
function prISO(v) {
  if (!v) return '';
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = parseDateFlexible(s);
  if (!d || isNaN(d)) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function prTodayISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}
function prDaysFrom(aISO, refISO) {
  const a = parseDateFlexible(aISO), b = parseDateFlexible(refISO);
  if (!a || !b) return 0;
  return Math.floor((b - a) / 86400000);
}
// เงิน: ไม่มีทศนิยม ไม่มีสัญลักษณ์ ฿ (ตามมาตรฐานเว็บ — ฿ ถูกถอดออกทั้งแอป)
function prMoney(n) {
  if (n == null || isNaN(n)) return '—';
  return Number(Math.round(n)).toLocaleString('en-US');
}

// สถานะ AP + สี (คงสี semantic เขียว/แดง/เหลือง/เทา · planned ใช้น้ำเงินแบรนด์)
const PR_META = {
  ready:   { label: 'พร้อมจ่าย', color: '#15803d', bg: '#dcfce7', dot: '#22c55e' },
  overdue: { label: 'เกินกำหนด', color: '#b91c1c', bg: '#fee2e2', dot: '#ef4444' },
  waiting: { label: 'รอเงื่อนไข', color: '#b45309', bg: '#fef3c7', dot: '#f59e0b' },
  planned: { label: 'วางแผนแล้ว', color: 'var(--brand-700)', bg: 'var(--brand-100)', dot: 'var(--brand-500)' },
  paid:    { label: 'จ่ายแล้ว', color: '#475569', bg: '#eef2f6', dot: '#94a3b8' },
  done:    { label: 'จ่ายครบ', color: '#0f766e', bg: '#ccfbf1', dot: '#14b8a6' },
};
function prPill(m) {
  return { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: m.bg, color: m.color, whiteSpace: 'nowrap' };
}
function prDot(m) {
  return { width: 7, height: 7, borderRadius: 999, background: m.dot, flex: '0 0 auto', display: 'inline-block' };
}

// ── ฝั่ง AP ของโครงการ: ประมวลสถานะรายใบ (running coverage AR≥AP) ────────────
// apList = [{vendor, vchno, amount, due, vdate, cfCategory, pv, paidDate, pvNo, planned, plannedDate, origin}]
// receivedAREvents = [{date, amount}] (เรียงวันแล้ว) · receivedARTotal = Σ
function prComputeAp(apList, receivedAREvents, receivedARTotal, todayISO) {
  // เรียงตามวัน (vchdate → due → ท้ายสุด) เพื่อ running coverage
  const sorted = apList.slice().sort((a, b) => {
    const ka = a.vdate || a.due || a.paidDate || '9999-12-31';
    const kb = b.vdate || b.due || b.paidDate || '9999-12-31';
    if (ka !== kb) return ka < kb ? -1 : 1;
    return b.amount - a.amount;
  });
  // cumulative ของเงินรับ (เรียงวันแล้ว) → หาวันที่ปลดล็อกของยอดสะสม threshold
  const ev = receivedAREvents.slice().sort((a, b) => (a.date || '') < (b.date || '') ? -1 : 1);
  let acc = 0; const cum = ev.map(e => { acc += e.amount; return { date: e.date, cum: acc }; });
  const unlockDateFor = (thr) => {
    for (const c of cum) if (c.cum + 0.01 >= thr) return c.date;
    return cum.length ? cum[cum.length - 1].date : null;
  };

  let running = 0;
  return sorted.map(ap => {
    running += ap.amount;
    const incl = running;
    const covered = incl <= receivedARTotal + 0.01;
    const shortfall = Math.max(0, incl - receivedARTotal);
    let key, unlockDate = null;
    if (ap.pv) { key = 'paid'; }
    else if (ap.planned) { key = 'planned'; }
    else if (covered) {
      unlockDate = unlockDateFor(incl);
      const aged = unlockDate ? prDaysFrom(unlockDate, todayISO) : 0;
      key = aged > 60 ? 'overdue' : 'ready';   // "ค้างนาน" = ปลดล็อก (รับเงินคุ้ม) เกิน 60 วันแล้วยังไม่จ่าย
    } else { key = 'waiting'; }
    return { ...ap, status: key, covered, shortfall, unlockDate, cumAp: incl };
  });
}

// ── สร้างข้อมูลทั้งหน้า: โครงการเซ็นแล้ว + AR/AP/PV/forecast ────────────────────
function prBuildAll(data) {
  const PCU = window.PCU;
  const todayISO = prTodayISO();
  const invoices = data.invoices || [];
  const receipts = data.receipts || [];
  const payables = data.payables || [];
  const pvs = data.pvVouchers || [];
  const forecasts = data.forecastEntries || [];

  // โครงการ (dedup + fy + status + AR ผ่าน installments) จาก PCU
  // baseProjects: เลือกชุดที่แถวมากกว่า (mirror page_project_control กัน snapshot เก่าค้าง)
  let baseProjects = data.projects || [];
  try {
    const local = (PCU && PCU.loadLocalProjects) ? (PCU.loadLocalProjects() || []) : [];
    if (local.length > baseProjects.length) baseProjects = local;
  } catch (_) {}
  const derived = (PCU && PCU.deriveProjects) ? PCU.deriveProjects(baseProjects, invoices, receipts) : [];

  // ลูกหนี้ (customer) จากใบแจ้งหนี้ — โครงการในชีตมัก field Customer ว่าง
  const custByCode = {};
  invoices.forEach(iv => {
    const c = prNormCode(iv.jobNo || iv.contractRef || iv.projectCode || '');
    const nm = iv.customerName || iv.customer || iv.cust_name || '';
    if (c && nm && !custByCode[c]) custByCode[c] = nm;
  });

  // payables by jobcode (normalized)
  const apByCode = {};
  payables.forEach(p => {
    const c = prNormCode(p.jobcode || p.jobname || '');
    if (!c) return;
    (apByCode[c] = apByCode[c] || []).push(p);
  });
  // PV: map AP_No→PV (paid) + group by jobcode (สำหรับ PV-only ที่ไม่มี AP)
  const pvByApNo = {};
  pvs.forEach(v => { const k = String(v.AP_No == null ? '' : v.AP_No).trim(); if (k && !pvByApNo[k]) pvByApNo[k] = v; });
  const pvByCode = {};
  pvs.forEach(v => { const c = prNormCode(v.jobcode || ''); if (c) (pvByCode[c] = pvByCode[c] || []).push(v); });
  // forecast ที่ผูก AP (REF_DOC) ที่ยังเป็นแผน (ไม่ใช่ ACTUAL)
  const fcByRef = {};
  forecasts.forEach(f => {
    const ref = String(f.REF_DOC == null ? '' : f.REF_DOC).trim();
    if (!ref || fcByRef[ref]) return;
    fcByRef[ref] = f;
  });
  const prIsActual = (f) => (f.ACTUAL_AMOUNT != null && f.ACTUAL_AMOUNT !== '') || f.STATUS === 'ACTUAL';

  const fySet = {};

  const projects = derived
    .filter(d => d.status !== 'ยกเลิก' && d.status !== 'ยังไม่ลงนาม')   // เซ็นแล้วเท่านั้น
    .map(d => {
      const code = d.contractNo;
      const ncode = prNormCode(code);
      if (d.fy) fySet[d.fy] = (fySet[d.fy] || 0) + 1;

      // ── AR: installments ที่มีใบแจ้งหนี้/มูลค่า ──
      const arRaw = (d.installments || []).filter(it => it.invoice || it.amount > 0);
      const arItems = arRaw.map(it => {
        const inv = it.invoice || {};
        const recDate = inv.receivedDate || null;
        const amount = it.amount || prToNum(inv.balance);
        return {
          label: arRaw.length === 1 ? 'ครั้งเดียว' : ('งวด ' + it.no),
          invoiceNo: inv.ivNo || '—',
          amount,
          recvAmount: prToNum(inv.receivedNet) || amount,
          receivedDate: recDate,
          received: !!recDate,
          dueDate: inv.dueDate || it.forecastDate || it.dueDate || null,
        };
      });
      const recvEvents = arItems.filter(a => a.received).map(a => ({ date: a.receivedDate, amount: a.recvAmount }));
      const receivedARTotal = recvEvents.reduce((s, e) => s + e.amount, 0);

      // ── AP: payables ที่ jobcode = รหัสโครงการ ──
      const rawAps = apByCode[ncode] || [];
      const vchnoSet = {};
      const apBase = rawAps.map(p => {
        const vchno = String(p.vchno || p.docno || '').trim();
        if (vchno) vchnoSet[vchno] = 1;
        const pv = vchno ? pvByApNo[vchno] : null;
        const fc = vchno ? fcByRef[vchno] : null;
        const planned = !!(fc && !prIsActual(fc) && !pv);
        return {
          id: p.id, vendor: p.cust_name || p.jobname || p.vendor || '—',
          vchno,
          amount: prToNum(p.netpayment != null ? p.netpayment : (p.Amount != null ? p.Amount : (p.net_new != null ? p.net_new : p.Balance_Amount1))),
          due: prISO(p.due2 || p.due || p.dueDate),
          vdate: prISO(p.vchdate),
          cfCategory: p.cf_category != null ? String(p.cf_category) : '',
          pv: !!pv, pvNo: pv ? (pv.PL_PV_No || '') : '',
          paidDate: pv ? prISO(pv.Pmt_Date) : null,
          planned, plannedDate: fc ? prISO(fc.PAYMENT_DATE || fc.DATE) : null,
          origin: 'ap',
        };
      });
      // PV-only: จ่ายผ่าน PV ที่มี jobcode ของโครงการ แต่ไม่ match AP ใบไหน
      const pvOnly = (pvByCode[ncode] || [])
        .filter(v => { const k = String(v.AP_No == null ? '' : v.AP_No).trim(); return !k || !vchnoSet[k]; })
        .map(v => ({
          id: 'pv-' + (v.id || v.PL_PV_No), vendor: v.Payee || v.cust_name || '—',
          vchno: '', amount: prToNum(v.Net_Amount), due: '', vdate: prISO(v.Pmt_Date),
          cfCategory: '', pv: true, pvNo: v.PL_PV_No || '', paidDate: prISO(v.Pmt_Date),
          planned: false, plannedDate: null, origin: 'pv',
        }));
      const apList = prComputeAp(apBase.concat(pvOnly), recvEvents, receivedARTotal, todayISO);

      // รวมยอด/นับ ต่อสถานะ (KPI)
      let apTotal = 0, paidSum = 0, readySum = 0, readyCount = 0;
      const payableList = [];
      apList.forEach(a => {
        apTotal += a.amount;
        if (a.status === 'paid') paidSum += a.amount;
        if (a.status === 'ready' || a.status === 'overdue') { readySum += a.amount; readyCount++; payableList.push({ date: a.unlockDate || a.due || todayISO, amount: a.amount }); }
      });
      const apKeys = apList.map(a => a.status);

      // overall สถานะโครงการ
      let okey = 'waiting';
      if (apList.length && apKeys.every(k => k === 'paid')) okey = 'done';
      else if (apKeys.includes('overdue')) okey = 'overdue';
      else if (apKeys.includes('ready')) okey = 'ready';
      else if (apKeys.includes('planned')) okey = 'planned';
      const om = PR_META[okey] || PR_META.waiting;
      const pct = apTotal ? Math.round(paidSum / apTotal * 100) : 0;

      // ผู้รับเหมาหลัก = เจ้าหนี้ยอดรวมมากสุด
      const byVendor = {};
      apList.forEach(a => { byVendor[a.vendor] = (byVendor[a.vendor] || 0) + a.amount; });
      const vendorNames = Object.keys(byVendor);
      const mainVendor = vendorNames.sort((a, b) => byVendor[b] - byVendor[a])[0] || '—';
      const contractorLabel = vendorNames.length > 1 ? (mainVendor + ' +' + (vendorNames.length - 1) + ' ราย') : mainVendor;

      const customer = custByCode[ncode] || d.customer || '—';

      return {
        code, ncode, name: d.site || d.name || code, customer,
        contractor: contractorLabel, mainVendor, vendorCount: vendorNames.length,
        contractValue: d.contractAmt || 0, fy: d.fy,
        arItems, apItems: apList, receivedARTotal,
        apTotal, paidSum, readySum, readyCount, payableList,
        progressPct: pct, overall: okey, overallMeta: om,
        _keys: apKeys,
      };
    });

  const fys = Object.keys(fySet).map(Number).sort((a, b) => b - a);
  return { projects, fys, todayISO };
}

// ════════════════════════════════════════════════════════════════════════════
function PaymentReconPage({ data, setData, toast }) {
  const canEdit = window.WTPAuth ? (window.WTPAuth.can('canEdit') || window.WTPAuth.can('canApprove')) : true;
  const [state, setState] = React.useState({ filter: 'all', expanded: {}, sort: 'code', searchDate: '', fy: null });
  const [planTarget, setPlanTarget] = React.useState(null);   // {proj, ap}
  const [planForm, setPlanForm] = React.useState({ payDate: '', bankAc: '' });

  const all = React.useMemo(() => prBuildAll(data), [data.projects, data.invoices, data.receipts, data.payables, data.pvVouchers, data.forecastEntries, data.manualOverrides]);
  const fy = state.fy != null ? state.fy : (all.fys.length ? all.fys[0] : 'all');

  // diagnostic — ให้หน้าบอกได้เองว่าขาดข้อมูลตรงไหน (ตอนข้อมูลจริงว่าง)
  const diag = React.useMemo(() => ({
    signed: all.projects.length,
    withAp: all.projects.filter(p => p.apItems.length > 0).length,
    withAr: all.projects.filter(p => p.arItems.length > 0).length,
  }), [all]);

  // KPI/แท็บ/outstanding ผูกกับ "ปีที่เลือก" (ตารางกรองตามปี → ตัวเลขบนต้องตรงกัน) · 'all' = ทุกปี
  const fyProjects = React.useMemo(() => all.projects.filter(p => fy === 'all' || p.fy === fy), [all, fy]);
  const fyHasAp = fyProjects.some(p => p.apItems.length > 0);
  const agg = React.useMemo(() => {
    const totals = { ready: 0, overdue: 0, waiting: 0, planned: 0, paid: 0 };
    const counts = { ready: 0, overdue: 0, waiting: 0, planned: 0, paid: 0 };
    fyProjects.forEach(p => p.apItems.forEach(a => { if (totals[a.status] != null) { totals[a.status] += a.amount; counts[a.status]++; } }));
    return { totals, counts, outstanding: totals.ready + totals.overdue + totals.waiting + totals.planned };
  }, [fyProjects]);

  // bank accounts สำหรับ modal วางแผนจ่าย
  const bankOptions = React.useMemo(() => (data.bankAccounts || []).map(a => {
    const name = a.BANK_NAME || a.bankName || a.bank || a.name || '';
    const ac = String(a.Bank_AC || a.accountNo || a.acNo || '').trim();
    const l4 = ac.replace(/\D/g, '').slice(-4);
    return { value: ac, label: (name || 'บัญชี') + (l4 ? ' · ' + l4 : '') };
  }).filter(o => o.value), [data.bankAccounts]);

  // ── เขียน: วางแผนจ่าย AP → forecastEntries (รูปแบบเดียวกับ Bank Diary BDApPanel) ──
  const doPlan = () => {
    if (!planTarget || !setData) return;
    const { proj, ap } = planTarget;
    if (!ap.vchno) { if (toast) toast('รายการนี้ไม่มีเลขที่ AP — วางแผนจ่ายไม่ได้'); return; }
    const payDate = planForm.payDate || all.todayISO;
    const row = {
      id: (window.WTPData && window.WTPData.newId) ? window.WTPData.newId() : ('pr-' + Date.now()),
      DATE: all.todayISO, PAYMENT_DATE: payDate, EXPENSE_TYPE: 'AP',
      DESCRIPTION: 'จ่าย ' + ap.vendor + (ap.vchno ? ' (' + ap.vchno + ')' : '') + ' · ' + proj.code,
      JOB_NO: proj.code, PROJECT_NAME: proj.name,
      AMOUNT: String(-Math.abs(ap.amount)), Bank_AC: planForm.bankAc || null, STATUS: 'PLANNED',
      CATEGORY: ap.cfCategory || '2', IS_ACCRUED: null, NOTE: null,
      ACTUAL_AMOUNT: null, ACTUAL_DATE: null, REF_DOC: ap.vchno, BOOKED_AT: null, CFS_ACTIVITY: null,
    };
    setData(prev => ({ ...prev, forecastEntries: [...(prev.forecastEntries || []), row] }));
    if (toast) toast('วางแผนจ่าย ' + ap.vendor + ' ' + prMoney(ap.amount) + ' แล้ว → ดูที่ Bank Daily');
    setPlanTarget(null);
  };

  // ── เขียน: ยกเลิกแผนจ่าย (ลบ forecast ที่ผูก REF_DOC ที่ยังเป็นแผน) ──
  const doUnplan = (ap) => {
    if (!setData || !ap.vchno) return;
    if (!window.confirm('ยกเลิกแผนจ่าย ' + ap.vendor + ' ' + prMoney(ap.amount) + ' ?')) return;
    setData(prev => ({
      ...prev,
      forecastEntries: (prev.forecastEntries || []).filter(f => {
        const ref = String(f.REF_DOC == null ? '' : f.REF_DOC).trim();
        if (ref !== ap.vchno) return true;
        return (f.ACTUAL_AMOUNT != null && f.ACTUAL_AMOUNT !== '') || f.STATUS === 'ACTUAL'; // เก็บที่จ่ายจริง
      }),
    }));
    if (toast) toast('ยกเลิกแผนจ่ายแล้ว');
  };

  // ── filter / sort / date-search ──
  const sd = state.searchDate;
  let projects = fyProjects.slice();
  projects = projects.filter(p => state.filter === 'all' || p._keys.includes(state.filter));
  if (sd) projects = projects.filter(p => p.payableList.some(x => (x.date || '') <= sd));
  projects = projects.slice().sort((a, b) => {
    if (state.sort === 'contractor') return a.contractor.localeCompare(b.contractor, 'th');
    if (state.sort === 'ready') return b.readySum - a.readySum;
    if (state.sort === 'value') return b.contractValue - a.contractValue;
    return a.code.localeCompare(b.code, 'th');
  });
  let planSum = 0, planCnt = 0;
  if (sd) projects.forEach(p => p.payableList.forEach(x => { if ((x.date || '') <= sd) { planSum += x.amount; planCnt++; } }));

  const toggle = (code) => setState(s => ({ ...s, expanded: { ...s.expanded, [code]: !s.expanded[code] } }));

  const tabDefs = [
    { key: 'all', label: 'ทุกโครงการ', count: fyProjects.length },
    { key: 'ready', label: 'พร้อมจ่าย', count: agg.counts.ready },
    { key: 'overdue', label: 'เกินกำหนด', count: agg.counts.overdue },
    { key: 'waiting', label: 'รอเงื่อนไข', count: agg.counts.waiting },
    { key: 'planned', label: 'วางแผนแล้ว', count: agg.counts.planned },
    { key: 'paid', label: 'จ่ายแล้ว', count: agg.counts.paid },
  ];

  const kpiCards = [
    { key: 'ready', desc: 'เงื่อนไขครบ พร้อมเบิก', accent: '#22c55e', val: agg.totals.ready, cnt: agg.counts.ready, color: '#15803d' },
    { key: 'overdue', desc: 'พร้อมจ่ายแต่ค้างนาน', accent: '#ef4444', val: agg.totals.overdue, cnt: agg.counts.overdue, color: '#b91c1c' },
    { key: 'waiting', desc: 'ยังรับเงินไม่คุ้มยอด', accent: '#f59e0b', val: agg.totals.waiting, cnt: agg.counts.waiting, color: '#b45309' },
    { key: 'planned', desc: 'วางแผนจ่ายแล้ว (ดู Bank Daily)', accent: 'var(--brand-500)', val: agg.totals.planned, cnt: agg.counts.planned, color: 'var(--brand-700)' },
    { key: 'paid', desc: 'เบิกจ่ายเรียบร้อย', accent: '#94a3b8', val: agg.totals.paid, cnt: agg.counts.paid, color: '#475569' },
  ];

  // export Excel (flatten AP rows ตามที่กรองอยู่)
  const doExport = () => {
    const rows = [];
    projects.forEach(p => p.apItems.forEach(a => rows.push({
      code: p.code, name: p.name, customer: p.customer, vendor: a.vendor,
      vchno: a.vchno, pvNo: a.pvNo, amount: a.amount,
      status: (PR_META[a.status] || {}).label || a.status,
      due: a.due ? fmtDate(a.due) : '', paidDate: a.paidDate ? fmtDate(a.paidDate) : '',
      plannedDate: a.plannedDate ? fmtDate(a.plannedDate) : '',
    })));
    exportRowsToExcel(rows, [
      { key: 'code', label: 'รหัสโครงการ' }, { key: 'name', label: 'โครงการ' }, { key: 'customer', label: 'ลูกหนี้' },
      { key: 'vendor', label: 'ผู้รับเหมา/เจ้าหนี้' }, { key: 'vchno', label: 'เลขที่ AP' }, { key: 'pvNo', label: 'เลขที่ PV' },
      { key: 'amount', label: 'ยอด', type: 'number' }, { key: 'status', label: 'สถานะ' },
      { key: 'due', label: 'ครบกำหนด' }, { key: 'paidDate', label: 'จ่ายจริง' }, { key: 'plannedDate', label: 'วางแผนจ่าย' },
    ], { filename: 'รายการจ่าย_AP_' + (fy === 'all' ? 'ทุกปี' : 'FY' + fy), sheetName: 'AP', title: 'กระทบยอดการจ่าย · ปีสัญญา ' + (fy === 'all' ? 'ทุกปี' : '25' + fy) });
  };

  return (
    <div className="pr-page" style={{ maxWidth: 1240, margin: '0 auto', padding: '4px 2px 60px' }}>

      {/* ===== Header ===== */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 24, flexWrap: 'wrap', marginBottom: 22 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--brand-900)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 11, height: 11, borderRadius: 3, background: '#22c55e' }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--ink-500)' }}>ระบบกระทบยอดการจ่ายเงิน</span>
          </div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, letterSpacing: -0.5, color: 'var(--ink-900)' }}>กระทบยอดการจ่าย · AR ↔ AP</h1>
          <p style={{ margin: '6px 0 0', fontSize: 13.5, color: 'var(--ink-500)', maxWidth: 600, lineHeight: 1.5 }}>
            จับคู่เงินรับจากลูกหนี้ <b style={{ color: 'var(--ink-700)' }}>(AR)</b> กับค่าใช้จ่ายผู้รับเหมาที่ค้างชำระ <b style={{ color: 'var(--ink-700)' }}>(AP)</b> — จ่ายผู้รับเหมาเมื่อรับเงินตามโครงการมาคุ้มยอดแล้วเท่านั้น
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12, color: 'var(--ink-400)', marginBottom: 6 }}>ยอด AP ค้างชำระทั้งหมด (ปีสัญญา {fy === 'all' ? 'ทุกปี' : '25' + fy})</div>
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 26, fontWeight: 700, letterSpacing: -0.5, color: 'var(--ink-900)' }}>{prMoney(agg.outstanding)}</div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, padding: '4px 10px', borderRadius: 999, background: '#fff', border: '1px solid var(--line)', fontSize: 12, color: 'var(--ink-500)' }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: '#22c55e' }} />
            ข้อมูล ณ {fmtDate(all.todayISO)} · ดึงจากระบบ
          </div>
        </div>
      </div>

      {/* ===== KPI cards ===== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(186px,1fr))', gap: 12, marginBottom: 14 }}>
        {kpiCards.map(c => (
          <div key={c.key} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '16px 16px 14px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: c.accent }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: c.accent }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-700)' }}>{PR_META[c.key].label}</span>
            </div>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 23, fontWeight: 700, color: c.color, letterSpacing: -0.5 }}>{prMoney(c.val)}</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-400)', marginTop: 5 }}>{c.cnt} รายการ · {c.desc}</div>
          </div>
        ))}
      </div>

      {/* ===== Logic explainer ===== */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', background: 'var(--brand-900)', color: '#dbe6f7', borderRadius: 12, padding: '12px 18px', marginBottom: 20 }}>
        <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.5, color: '#9fb4d8', textTransform: 'uppercase' }}>เงื่อนไขปลดล็อกการจ่าย</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontWeight: 600, color: '#fff' }}>จ่ายผู้รับเหมา</span>
          <span style={{ color: '#5b7099' }}>←</span>
          <span>รับเงินจากลูกหนี้ (AR สะสม) ≥ ยอดจ่ายสะสม (AP สะสม)</span>
        </div>
        <span style={{ fontSize: 12.5, color: '#9fb4d8' }}>· ไล่จ่ายตามลำดับวันที่ของ AP เท่าที่เงินลูกหนี้เข้ามาคุ้ม</span>
      </div>

      {/* ===== Filter tabs + year ===== */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {tabDefs.map(t => {
            const active = state.filter === t.key;
            return (
              <button key={t.key} onClick={() => setState(s => ({ ...s, filter: t.key }))}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid ' + (active ? 'var(--brand-700)' : 'var(--line)'), background: active ? 'var(--brand-700)' : '#fff', color: active ? '#fff' : 'var(--ink-600)' }}>
                {t.label}
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, padding: '1px 7px', borderRadius: 999, background: active ? 'rgba(255,255,255,.18)' : 'var(--ink-100)', color: active ? '#fff' : 'var(--ink-500)' }}>{t.count}</span>
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: '6px 12px' }}>
            <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>ปีสัญญา</span>
            <select value={String(fy)} onChange={e => { const v = e.target.value; setState(s => ({ ...s, fy: v === 'all' ? 'all' : Number(v), expanded: {} })); }}
              style={{ border: 'none', background: 'transparent', font: 'inherit', fontSize: 13, fontWeight: 700, color: 'var(--ink-900)', outline: 'none', cursor: 'pointer' }}>
              <option value="all">ทุกปี</option>
              {all.fys.map(y => <option key={y} value={y}>25{y} (FY{y})</option>)}
            </select>
          </div>
          <span style={{ fontSize: 13, color: 'var(--ink-500)' }}>แสดง <b style={{ color: 'var(--ink-900)' }}>{projects.length}</b> โครงการ · เซ็นแล้วรวม <b style={{ color: 'var(--ink-700)' }}>{diag.signed}</b> · มี AP <b style={{ color: 'var(--ink-700)' }}>{diag.withAp}</b></span>
        </div>
      </div>

      {/* ===== Sort + date search + export ===== */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: '6px 12px' }}>
          <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>เรียงตาม</span>
          <select value={state.sort} onChange={e => setState(s => ({ ...s, sort: e.target.value }))}
            style={{ border: 'none', background: 'transparent', font: 'inherit', fontSize: 13, fontWeight: 600, color: 'var(--ink-900)', outline: 'none', cursor: 'pointer' }}>
            <option value="code">รหัสโครงการ</option>
            <option value="contractor">ชื่อผู้รับเหมา</option>
            <option value="ready">พร้อมจ่ายมากสุด</option>
            <option value="value">มูลค่าสัญญา</option>
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: '6px 12px' }}>
          <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>วางแผนจ่าย — จ่ายได้ภายในวันที่</span>
          <input type="date" value={sd} onChange={e => setState(s => ({ ...s, searchDate: e.target.value }))}
            style={{ border: 'none', background: 'transparent', font: 'inherit', fontSize: 13, fontWeight: 600, color: 'var(--ink-900)', outline: 'none' }} />
          {sd && <button onClick={() => setState(s => ({ ...s, searchDate: '' }))} style={{ border: 'none', background: 'var(--ink-100)', color: 'var(--ink-500)', borderRadius: 6, padding: '4px 9px', fontSize: 12, cursor: 'pointer' }}>ล้าง</button>}
        </div>
        {sd && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#dcfce7', border: '1px solid #bbf7d0', borderRadius: 10, padding: '8px 14px', fontSize: 13, color: '#15803d' }}>
            วางแผนจ่ายได้ <b style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{planCnt}</b> รายการ · รวม <b style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{prMoney(planSum)}</b>
          </div>
        )}
        <button onClick={doExport} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: '7px 14px', fontSize: 13, fontWeight: 600, color: 'var(--ink-700)', cursor: 'pointer' }}>📥 Export Excel</button>
      </div>

      {/* info banner: มีโครงการแต่ AP ว่างหมด → jobcode ไม่ตรง */}
      {fyProjects.length > 0 && !fyHasAp && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--warn-bg)', border: '1px solid #fde68a', borderRadius: 12, padding: '12px 16px', marginBottom: 14, fontSize: 13, color: '#92660b', lineHeight: 1.5 }}>
          <span style={{ fontSize: 16 }}>⚠️</span>
          <span>มีโครงการเซ็นแล้ว แต่ยังไม่มีรายการ <b>AP</b> ผูกกับโครงการเลย — ตาราง <b>เจ้าหนี้คงค้าง (payables)</b> / <b>PV</b> ต้องมีช่อง <b>JOB NO. (jobcode)</b> = รหัสโครงการ ระบบถึงจะจับเข้าโครงการได้ (เติม jobcode/PV ให้โครงการแล้วจะเด้งขึ้นเอง)</span>
        </div>
      )}

      {/* ===== Project table ===== */}
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '104px minmax(0,1fr) 130px 140px 132px 38px', gap: 14, alignItems: 'center', padding: '11px 18px', background: 'var(--ink-50)', borderBottom: '1px solid var(--line-soft)', fontSize: 11, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--ink-400)' }}>
          <span>รหัสโครงการ</span>
          <span>โครงการ / ผู้รับเหมา</span>
          <span style={{ textAlign: 'right' }}>มูลค่าสัญญา</span>
          <span style={{ textAlign: 'center' }}>สถานะ AP</span>
          <span style={{ textAlign: 'right' }}>พร้อมจ่าย</span>
          <span />
        </div>

        {projects.length === 0 && (
          <div style={{ padding: '40px 18px', textAlign: 'center', color: 'var(--ink-500)', fontSize: 14, lineHeight: 1.7 }}>
            {diag.signed === 0 ? (
              <span>ยังไม่มีข้อมูลโครงการที่เซ็นสัญญา<br /><span style={{ fontSize: 12.5, color: 'var(--ink-400)' }}>ตรวจว่าล็อกอินแล้ว และตาราง <b>projects / invoices</b> โหลดครบ (ถ้าเพิ่งเปิดหน้า รอ sync สักครู่แล้วรีเฟรช)</span></span>
            ) : fyProjects.length === 0 ? (
              <span>{fy === 'all' ? 'ไม่พบโครงการ' : <>ปี <b>25{fy}</b> ไม่มีโครงการที่เซ็นสัญญา</>} · ลองเลือก <b>"ทุกปี"</b> ด้านบน<br /><span style={{ fontSize: 12.5, color: 'var(--ink-400)' }}>เซ็นสัญญาแล้วรวมทุกปี <b>{diag.signed}</b> โครงการ</span></span>
            ) : (
              <span>ไม่มีโครงการตรงตัวกรองที่เลือก · ลองกดแท็บ <b>"ทุกโครงการ"</b> {sd ? 'หรือล้างวันที่' : ''}</span>
            )}
          </div>
        )}

        {projects.map(p => {
          const expanded = !!state.expanded[p.code];
          const miniCap = 6;
          const minis = p.apItems.slice(0, miniCap);
          return (
            <div key={p.code} style={{ borderBottom: '1px solid var(--line-soft)' }}>
              {/* compact row */}
              <div onClick={() => toggle(p.code)} style={{ cursor: 'pointer', background: expanded ? 'var(--ink-50)' : '#fff' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '104px minmax(0,1fr) 130px 140px 132px 38px', gap: 14, alignItems: 'center', padding: '12px 18px' }}>
                  <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12.5, fontWeight: 600, color: 'var(--ink-900)' }}>{p.code}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--ink-900)' }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.contractor}</div>
                  </div>
                  <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, fontWeight: 600, textAlign: 'right', color: 'var(--ink-800)' }}>{prMoney(p.contractValue)}</span>
                  <div style={{ display: 'flex', gap: 5, justifyContent: 'center', flexWrap: 'wrap' }}>
                    {minis.map((a, i) => {
                      const m = PR_META[a.status] || PR_META.waiting;
                      return <span key={i} title={a.vendor + ' · ' + m.label} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 24, height: 21, padding: '0 6px', borderRadius: 6, fontSize: 11, fontWeight: 600, fontFamily: "'IBM Plex Mono',monospace", background: m.bg, color: m.color }}>{i + 1}</span>;
                    })}
                    {p.apItems.length > miniCap && <span style={{ fontSize: 11, color: 'var(--ink-400)', alignSelf: 'center' }}>+{p.apItems.length - miniCap}</span>}
                    {p.apItems.length === 0 && <span style={{ fontSize: 11, color: 'var(--ink-300)' }}>— ไม่มี AP</span>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, fontWeight: 600, color: p.readySum > 0 ? (p._keys.includes('overdue') ? '#b91c1c' : '#15803d') : 'var(--ink-300)' }}>{p.readySum > 0 ? prMoney(p.readySum) : '—'}</div>
                    {p.readyCount > 0 && <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{p.readyCount} รายการ</div>}
                  </div>
                  <span style={{ textAlign: 'center', color: 'var(--ink-400)', fontSize: 11 }}>{expanded ? '▲' : '▼'}</span>
                </div>
              </div>

              {/* expanded */}
              {expanded && (
                <div style={{ padding: '6px 18px 22px', background: 'var(--ink-50)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0 16px', fontSize: 12, color: 'var(--ink-500)', flexWrap: 'wrap' }}>
                    <span>ลูกหนี้: <b style={{ color: 'var(--ink-700)' }}>{p.customer}</b></span><span style={{ color: 'var(--ink-300)' }}>·</span>
                    <span>รับเงินแล้ว <b style={{ fontFamily: "'IBM Plex Mono',monospace", color: '#15803d' }}>{prMoney(p.receivedARTotal)}</b></span><span style={{ color: 'var(--ink-300)' }}>·</span>
                    <span>จ่ายแล้ว <b style={{ fontFamily: "'IBM Plex Mono',monospace", color: 'var(--ink-900)' }}>{prMoney(p.paidSum)}</b> / {prMoney(p.apTotal)} ({p.progressPct}%)</span>
                    <div style={{ flex: 1, maxWidth: 200, height: 6, borderRadius: 999, background: 'var(--ink-200)', overflow: 'hidden' }}>
                      <div style={{ width: p.progressPct + '%', height: '100%', background: p.overall === 'overdue' ? '#ef4444' : 'var(--brand-700)', borderRadius: 999, transition: 'width .3s' }} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 20, alignItems: 'start' }}>
                    {/* AR */}
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--ink-400)', marginBottom: 8 }}>เงินรับจากลูกหนี้ · AR ({p.arItems.length === 1 ? 'รับครั้งเดียว' : p.arItems.length + ' งวด'})</div>
                      <div style={{ border: '1px solid var(--line-soft)', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '0.8fr 1.1fr 0.9fr 0.9fr', background: 'var(--ink-50)', fontSize: 10.5, color: 'var(--ink-400)', padding: '8px 12px', gap: 8 }}>
                          <span>งวด</span><span>เลขใบแจ้งหนี้</span><span style={{ textAlign: 'right' }}>มูลค่า</span><span style={{ textAlign: 'right' }}>รับจริง</span>
                        </div>
                        {p.arItems.length === 0 && <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--ink-400)' }}>ยังไม่มีใบแจ้งหนี้</div>}
                        {p.arItems.map((ar, i) => {
                          const m = ar.received ? PR_META.ready : PR_META.waiting;
                          return (
                            <div key={i} style={{ display: 'grid', gridTemplateColumns: '0.8fr 1.1fr 0.9fr 0.9fr', padding: '9px 12px', gap: 8, fontSize: 12, borderTop: '1px solid var(--line-soft)', alignItems: 'center' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={prDot(m)} /><b>{ar.label}</b></span>
                              <span style={{ fontFamily: "'IBM Plex Mono',monospace", color: 'var(--ink-600)' }}>{ar.invoiceNo}</span>
                              <span style={{ fontFamily: "'IBM Plex Mono',monospace", textAlign: 'right' }}>{prMoney(ar.amount)}</span>
                              <span style={{ textAlign: 'right', color: ar.received ? '#15803d' : 'var(--ink-400)', fontWeight: ar.received ? 600 : 400 }}>{ar.received ? fmtDate(ar.receivedDate) : 'รอรับ'}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    {/* AP */}
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--ink-400)', marginBottom: 8 }}>จ่ายผู้รับเหมา · AP ({p.apItems.length} รายการ)</div>
                      <div style={{ border: '1px solid var(--line-soft)', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 0.85fr 1.05fr 0.95fr', background: 'var(--ink-50)', fontSize: 10.5, color: 'var(--ink-400)', padding: '8px 12px', gap: 8 }}>
                          <span>ผู้รับเหมา / เจ้าหนี้</span><span>เลขใบสำคัญจ่าย</span><span style={{ textAlign: 'right' }}>ยอดวางบิล</span><span>เงื่อนไข (AR)</span><span style={{ textAlign: 'right' }}>สถานะ</span>
                        </div>
                        {p.apItems.length === 0 && <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--ink-400)' }}>ยังไม่มีรายการ AP — เตยเติม PV/jobcode ของโครงการนี้ได้</div>}
                        {p.apItems.map((ap, i) => {
                          const m = PR_META[ap.status] || PR_META.waiting;
                          const condOk = ap.covered;
                          const condText = ap.status === 'paid' ? 'จ่ายแล้ว'
                            : ap.status === 'planned' ? 'วางแผนแล้ว'
                            : condOk ? '✓ รับเงินคุ้มยอดนี้แล้ว' : ('✗ ขาดอีก ' + prMoney(ap.shortfall));
                          return (
                            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 0.85fr 1.05fr 0.95fr', padding: '9px 12px', gap: 8, fontSize: 12, borderTop: '1px solid var(--line-soft)', alignItems: 'start' }}>
                              <span style={{ fontWeight: 600, color: 'var(--ink-800)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ap.vendor}>
                                <span style={{ fontFamily: "'IBM Plex Mono',monospace", color: 'var(--ink-300)', fontSize: 10.5, marginRight: 5 }}>{i + 1}</span>{ap.vendor}{ap.origin === 'pv' && <span style={{ fontSize: 10, color: 'var(--ink-400)' }}> (PV)</span>}
                              </span>
                              <span style={{ fontFamily: "'IBM Plex Mono',monospace", color: 'var(--ink-600)' }}>{ap.pvNo || ap.vchno || '—'}</span>
                              <span style={{ fontFamily: "'IBM Plex Mono',monospace", textAlign: 'right' }}>{prMoney(ap.amount)}</span>
                              <span style={{ fontSize: 11.5, color: condOk ? '#15803d' : (ap.status === 'planned' ? 'var(--brand-700)' : 'var(--ink-400)'), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={condText}>{condText}</span>
                              <span style={{ textAlign: 'right' }}>
                                <span style={prPill(m)}><span style={prDot(m)} />{m.label}</span>
                                {ap.status === 'paid' && ap.paidDate && <div style={{ fontSize: 10.5, color: 'var(--ink-400)', marginTop: 3 }}>{fmtDate(ap.paidDate)}</div>}
                                {ap.status === 'planned' && (
                                  <div style={{ marginTop: 4 }}>
                                    {ap.plannedDate && <div style={{ fontSize: 10.5, color: 'var(--brand-700)', fontWeight: 600 }}>📅 {fmtDate(ap.plannedDate)}</div>}
                                    {canEdit && <button onClick={() => doUnplan(ap)} style={{ marginTop: 3, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--line)', background: '#fff', color: 'var(--ink-500)', fontSize: 10.5, cursor: 'pointer' }}>ยกเลิกแผน</button>}
                                  </div>
                                )}
                                {canEdit && (ap.status === 'ready' || ap.status === 'overdue') && ap.vchno && (
                                  <button onClick={() => { setPlanForm({ payDate: all.todayISO, bankAc: '' }); setPlanTarget({ proj: p, ap }); }}
                                    style={{ marginTop: 6, padding: '5px 11px', borderRadius: 7, border: 'none', background: 'var(--brand-700)', color: '#fff', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>วางแผนจ่าย</button>
                                )}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ===== Plan modal ===== */}
      <Modal open={!!planTarget} title="วางแผนจ่ายผู้รับเหมา" onClose={() => setPlanTarget(null)}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setPlanTarget(null)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--line)', background: '#fff', color: 'var(--ink-600)', fontWeight: 600, cursor: 'pointer' }}>ยกเลิก</button>
            <button onClick={doPlan} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--brand-700)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>ยืนยันวางแผนจ่าย</button>
          </div>
        }>
        {planTarget && (
          <div style={{ fontSize: 13.5, color: 'var(--ink-700)' }}>
            <div style={{ background: 'var(--ink-50)', border: '1px solid var(--line-soft)', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>{planTarget.proj.code} · {planTarget.proj.name}</div>
              <div style={{ fontWeight: 700, marginTop: 4, color: 'var(--ink-900)' }}>{planTarget.ap.vendor}</div>
              <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 12.5 }}>
                <span>เลขที่ AP: <b style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{planTarget.ap.vchno}</b></span>
                <span>ยอด: <b style={{ fontFamily: "'IBM Plex Mono',monospace", color: 'var(--ink-900)' }}>{prMoney(planTarget.ap.amount)}</b></span>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <label style={{ fontSize: 12.5 }}>วันที่จ่าย (วางแผน)
                <input type="date" value={planForm.payDate} onChange={e => setPlanForm(f => ({ ...f, payDate: e.target.value }))}
                  style={{ display: 'block', marginTop: 5, width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', font: 'inherit' }} />
              </label>
              <label style={{ fontSize: 12.5 }}>บัญชีธนาคาร (ถ้ามี)
                <select value={planForm.bankAc} onChange={e => setPlanForm(f => ({ ...f, bankAc: e.target.value }))}
                  style={{ display: 'block', marginTop: 5, width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', font: 'inherit', background: '#fff' }}>
                  <option value="">— ไม่ระบุ —</option>
                  {bankOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
            </div>
            <div style={{ marginTop: 14, fontSize: 12, color: 'var(--ink-400)', lineHeight: 1.5 }}>
              เมื่อยืนยัน รายการจะถูกบันทึกเป็น "ประมาณการจ่าย" (PLANNED) ไปแสดงที่หน้า <b style={{ color: 'var(--ink-600)' }}>Bank Daily</b> และหน้านี้จะขึ้นสถานะ "วางแผนแล้ว"
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
}
