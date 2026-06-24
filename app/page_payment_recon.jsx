// ═══════════════════════════════════════════════════════════════════════════
// page_payment_recon.jsx — "ระบบกระทบยอดการจ่ายเงิน" (route #payment_recon)
//
// จาก Claude Design handoff "Back to Black · รายการจ่าย" — รีธีมโทนแบรนด์น้ำเงิน.
//
// แนวคิด: ต่อ "โครงการที่เซ็นสัญญา" (กรองรายปี) จับคู่ AR ↔ AP "รายงวด"
//   • AR (เงินรับจากลูกหนี้) = ใบแจ้งหนี้/ใบเสร็จของโครงการ (ผ่าน installments ของ PCU)
//   • AP (จ่ายผู้รับเหมา) มาจาก 2 แหล่ง + กรอง "APS เท่านั้น":
//        - จ่ายแล้ว  = pvVouchers (รหัสโครงการฝังใน Project_Dpt / col A) → โชว์ PV + วันที่จ่าย
//        - ค้างจ่าย  = payables   (รหัสโครงการฝังใน pre_des / col AF)   → โชว์ AP no + ครบกำหนด
//     แยกงวดด้วย ADV / งวด N จาก remark · ตัด "อื่นๆ/คืนประกัน" ทิ้ง (ไม่เกี่ยวกับงวด)
// gate รายงวด: ADV ← เซ็นสัญญา · งวด N ← รับ AR งวด N **หรือ รับเงินครบโครงการแล้ว**
//   (AR รับครั้งเดียว/รับครบ → ทุกงวดพร้อมจ่าย)
// ปุ่ม "วางแผนจ่าย" เขียน forecastEntries (REF_DOC=vchno) → Bank Daily · default บัญชี 4863
//
// identifiers prefix PR/pr กัน global-scope collision.
// ═══════════════════════════════════════════════════════════════════════════

function prToNum(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  const n = Number(String(v).replace(/[, ]/g, ''));
  return isNaN(n) ? 0 : n;
}
function prNormCode(c) {
  const s = String(c == null ? '' : c).trim();
  const m = s.match(/^(.+?)-[A-Z]{2,6}$/);
  return (m ? m[1] : s).toUpperCase();
}
// แกะ "รหัสโครงการ" จากข้อความที่ฝังรหัสไว้ (PV Project_Dpt / AP pre_des / remark)
function prCodeFromText(text) {
  const s = String(text == null ? '' : text);
  let m = s.match(/Project\s*:\s*\(\d+\)\s*([A-Za-z]{2,5}\d{2,4})/);
  if (m) return m[1].toUpperCase();
  m = s.match(/\(\s*(?:Project\s*:\s*)?([A-Za-z]{2,5}\d{2,4})\b/);
  if (m) return m[1].toUpperCase();
  m = s.match(/^\s*([A-Za-z]{2,5}\d{2,4})\s*-/);
  if (m) return m[1].toUpperCase();
  m = s.match(/\b([A-Za-z]{2,5}\d{2,4})\b/);
  if (m) return m[1].toUpperCase();
  return '';
}
// งวดจาก remark → 'ADV' | 'งวด N' | 'คืนประกัน' | 'อื่นๆ'
function prInst(remark) {
  const t = String(remark == null ? '' : remark);
  if (/\badv|advance|มัดจำ|ล่วงหน้า|เริ่มงาน/i.test(t)) return 'ADV';
  const m = t.match(/งวด(?:ที่)?\s*(\d+)/);
  if (m) return 'งวด ' + m[1];
  if (/คืน.*ประกัน|ประกันผลงาน|retention/i.test(t)) return 'คืนประกัน';
  return 'อื่นๆ';
}
function prInstOrder(key) {
  if (key === 'ADV') return 0;
  const m = key.match(/งวด\s*(\d+)/);
  if (m) return +m[1];
  return 99;
}
// ── data: จำนวน "งวด" ที่คาดหวังต่อประเภทผลิตภัณฑ์ (ไม่รวม ADV) ──────────────
// แก้ได้ตามสัญญากับผู้รับเหมา (อนาคตเปลี่ยนได้). PD/PDP/PDH = 1 งวด (ADV + งวด 1
// เท่านั้น) · ประเภทอื่นๆ default = 2 งวด (ADV + งวด 1 + งวด 2).
const PR_PRODUCT_NGUAD = { PD: 1, PDP: 1, PDH: 1 };
const PR_DEFAULT_NGUAD = 2;
// ประเภทผลิตภัณฑ์ = suffix ท้ายรหัสโครงการ (ENC165-PL → PL · TTI043-PDH → PDH)
function prProductType(text) {
  const m = String(text == null ? '' : text).match(/[A-Za-z]{2,5}\d{2,4}-([A-Za-z]{2,6})\b/);
  return m ? m[1].toUpperCase() : '';
}
function prExpectedNguad(prod) {
  const p = String(prod || '').toUpperCase();
  return PR_PRODUCT_NGUAD[p] != null ? PR_PRODUCT_NGUAD[p] : PR_DEFAULT_NGUAD;
}
function prIsApsPV(v) {
  return String(v.Type || '').trim().toUpperCase() === 'APS'
    || String(v.AP_No || '').trim().toUpperCase().startsWith('APS');
}
function prIsApsPayable(p) {
  return String(p.vchno || p.docno || '').trim().toUpperCase().startsWith('APS');
}
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
function prMoney(n) {
  if (n == null || isNaN(n)) return '—';
  return Number(Math.round(n)).toLocaleString('en-US');
}
// บัญชี default = 4863 (ตามที่ผู้ใช้ขอ)
function prDefaultBankAc(bankOptions) {
  const hit = (bankOptions || []).find(o => String(o.value).replace(/\D/g, '').slice(-4) === '4863');
  return hit ? hit.value : '';
}

const PR_META = {
  ready:   { label: 'พร้อมจ่าย', color: '#15803d', bg: '#dcfce7', dot: '#22c55e' },
  overdue: { label: 'เกินกำหนด', color: '#b91c1c', bg: '#fee2e2', dot: '#ef4444' },
  waiting: { label: 'รอเงื่อนไข', color: '#b45309', bg: '#fef3c7', dot: '#f59e0b' },
  planned: { label: 'วางแผนแล้ว', color: 'var(--brand-700)', bg: 'var(--brand-100)', dot: 'var(--brand-500)' },
  paid:    { label: 'จ่ายแล้ว', color: '#475569', bg: '#eef2f6', dot: '#94a3b8' },
  done:    { label: 'จ่ายครบ', color: '#0f766e', bg: '#ccfbf1', dot: '#14b8a6' },
  pending: { label: 'รอตั้งเบิก', color: '#64748b', bg: '#f1f5f9', dot: '#94a3b8' },
  none:    { label: '—', color: '#94a3b8', bg: '#f1f5f9', dot: '#cbd5e1' },
};
function prPill(m) {
  return { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: m.bg, color: m.color, whiteSpace: 'nowrap' };
}
function prDot(m) {
  return { width: 7, height: 7, borderRadius: 999, background: m.dot, flex: '0 0 auto', display: 'inline-block' };
}

// ── สร้างข้อมูลทั้งหน้า ────────────────────────────────────────────────────────
function prBuildAll(data) {
  const PCU = window.PCU;
  const todayISO = prTodayISO();
  const invoices = data.invoices || [];
  const receipts = data.receipts || [];
  const payables = data.payables || [];
  const pvs = data.pvVouchers || [];
  const forecasts = data.forecastEntries || [];

  let baseProjects = data.projects || [];
  try {
    const local = (PCU && PCU.loadLocalProjects) ? (PCU.loadLocalProjects() || []) : [];
    if (local.length > baseProjects.length) baseProjects = local;
  } catch (_) {}
  const derived = (PCU && PCU.deriveProjects) ? PCU.deriveProjects(baseProjects, invoices, receipts) : [];

  const custByCode = {};
  invoices.forEach(iv => {
    const c = prNormCode(iv.jobNo || iv.contractRef || iv.projectCode || '');
    const nm = iv.customerName || iv.customer || iv.cust_name || '';
    if (c && nm && !custByCode[c]) custByCode[c] = nm;
  });

  // ประเภทผลิตภัณฑ์ต่อโครงการ (suffix) → ใช้กำหนดจำนวนงวดที่คาดหวัง
  const prodByCode = {};
  const prSetProd = (code, prod) => { if (code && prod && !prodByCode[code]) prodByCode[code] = prod; };
  invoices.forEach(iv => prSetProd(prNormCode(iv.jobNo || iv.contractRef || iv.projectCode || ''), prProductType(iv.jobNo || iv.projectCode || '')));
  pvs.forEach(v => prSetProd(prCodeFromText(v.Project_Dpt), prProductType(v.Project_Dpt)));
  payables.forEach(p => prSetProd(prCodeFromText(p.pre_des), prProductType(p.pre_des)));

  // AP PAID: pvVouchers (APS) → group by project code (Project_Dpt)
  const paidByCode = {};
  const paidVchno = new Set();
  pvs.forEach(v => {
    if (!prIsApsPV(v)) return;
    const code = prCodeFromText(v.Project_Dpt || v.jobname || v.Remark);
    if (!code) return;
    const apno = String(v.AP_No || '').trim();
    if (apno) paidVchno.add(apno);
    (paidByCode[code] = paidByCode[code] || []).push({
      vendor: v.Payee || v.cust_name || '—', pvNo: v.PL_PV_No || '', apNo: apno,
      amount: prToNum(v.Net_Amount), date: prISO(v.Pmt_Date), inst: prInst(v.Remark || v.cc_remark),
    });
  });

  // AP OUTSTANDING: payables (APS) → group by project code (pre_des)
  const outByCode = {};
  payables.forEach(p => {
    if (!prIsApsPayable(p)) return;
    const code = prCodeFromText(p.pre_des || p.jobname || p.remark);
    if (!code) return;
    const vchno = String(p.vchno || p.docno || '').trim();
    if (vchno && paidVchno.has(vchno)) return;
    (outByCode[code] = outByCode[code] || []).push({
      id: p.id, vendor: p.cust_name || p.jobname || '—', vchno,
      amount: prToNum(p.netpayment != null ? p.netpayment : (p.Amount != null ? p.Amount : p.net_new)),
      due: prISO(p.due2 || p.due || p.dueDate),
      cfCategory: p.cf_category != null ? String(p.cf_category) : '',
      inst: prInst(p.remark),
    });
  });

  const fcByRef = {};
  forecasts.forEach(f => {
    const ref = String(f.REF_DOC == null ? '' : f.REF_DOC).trim();
    if (!ref || fcByRef[ref]) return;
    fcByRef[ref] = f;
  });
  const prIsActual = (f) => (f.ACTUAL_AMOUNT != null && f.ACTUAL_AMOUNT !== '') || f.STATUS === 'ACTUAL';

  const fySet = {};

  const projects = derived
    .filter(d => d.status !== 'ยกเลิก' && d.status !== 'ยังไม่ลงนาม')
    .map(d => {
      const code = d.contractNo;
      const ncode = prNormCode(code);
      if (d.fy) fySet[d.fy] = (fySet[d.fy] || 0) + 1;

      // AR
      const arRaw = (d.installments || []).filter(it => it.invoice || it.amount > 0);
      const singleAr = arRaw.length === 1;
      const recvByNo = {};
      const arItems = arRaw.map(it => {
        const inv = it.invoice || {};
        const recDate = inv.receivedDate || null;
        if (recDate) recvByNo[it.no] = recDate;
        return { no: it.no, label: singleAr ? 'ครั้งเดียว' : ('งวด ' + it.no), invoiceNo: inv.ivNo || '—', amount: it.amount || prToNum(inv.balance), receivedDate: recDate, received: !!recDate };
      });
      const receivedARTotal = arItems.filter(a => a.received).reduce((s, a) => s + a.amount, 0);
      const signedDate = d.start || null;
      // ★ รับเงินครบโครงการ (รับครั้งเดียว หรือ ยอดรับ ≥ มูลค่าสัญญา) → ปลดล็อกทุกงวด
      const arRecvDates = arItems.filter(a => a.received).map(a => a.receivedDate).filter(Boolean).sort();
      const arRecvMax = arRecvDates.length ? arRecvDates[arRecvDates.length - 1] : null;
      const arFull = (arItems.length >= 1 && arItems.every(a => a.received))
        || (d.contractAmt > 0 && receivedARTotal >= d.contractAmt * 0.99);

      // AP groups (ADV/งวด N เท่านั้น — ตัด อื่นๆ/คืนประกัน)
      const gmap = {};
      const G = (key) => (gmap[key] = gmap[key] || { key, paidAmt: 0, paidRows: [], outAmt: 0, outRows: [] });
      (paidByCode[ncode] || []).forEach(r => { const g = G(r.inst); g.paidAmt += r.amount; g.paidRows.push(r); });
      (outByCode[ncode] || []).forEach(r => {
        const g = G(r.inst);
        const fc = r.vchno ? fcByRef[r.vchno] : null;
        r.planned = !!(fc && !prIsActual(fc));
        r.plannedDate = fc ? prISO(fc.PAYMENT_DATE || fc.DATE) : null;
        g.outAmt += r.amount; g.outRows.push(r);
      });

      // raw groups (ตัด อื่นๆ/คืนประกัน) + เติม "งวดที่คาดหวัง" ตามประเภทผลิตภัณฑ์
      const productType = prodByCode[ncode] || '';
      const expectedNguad = prExpectedNguad(productType);
      const rawGroups = Object.values(gmap).filter(g => g.key !== 'อื่นๆ' && g.key !== 'คืนประกัน');
      // เติม scaffold เฉพาะเมื่อมี AP จริงอยู่บ้างแล้ว (โครงการที่ยังไม่มี AP เลย = ไม่รก)
      if (rawGroups.length > 0) {
        const have = new Set(rawGroups.map(g => g.key));
        const expected = ['ADV']; for (let k = 1; k <= expectedNguad; k++) expected.push('งวด ' + k);
        expected.forEach(key => { if (!have.has(key)) rawGroups.push({ key, paidAmt: 0, paidRows: [], outAmt: 0, outRows: [], _scaffold: true }); });
      }
      const groups = rawGroups.map(g => {
        let condLabel = '—', unlocked = true, unlockDate = signedDate;
        if (g.key === 'ADV') { condLabel = 'เซ็นสัญญา'; unlocked = true; unlockDate = signedDate; }
        else {
          const mm = g.key.match(/งวด\s*(\d+)/);
          if (mm) {
            const n = +mm[1], byNo = !!recvByNo[n];
            unlocked = byNo || arFull;
            unlockDate = recvByNo[n] || arRecvMax || signedDate;
            condLabel = byNo ? ('รับ AR งวด ' + n) : (arFull ? 'รับเงินครบแล้ว' : ('รับ AR งวด ' + n));
          }
        }
        let status, planned = g.outRows.length > 0 && g.outRows.every(r => r.planned);
        if (g._scaffold) status = 'pending';                       // คาดว่าจะมีงวดนี้ แต่ยังไม่มีเอกสาร AP/PV
        else if (g.outAmt > 0) {
          if (planned) status = 'planned';
          else if (!unlocked) status = 'waiting';
          else { const aged = unlockDate ? prDaysFrom(unlockDate, todayISO) : 0; status = aged > 60 ? 'overdue' : 'ready'; }
        } else if (g.paidAmt > 0) status = 'paid';
        else status = 'none';
        return { ...g, condLabel, unlocked, unlockDate, status, planned, order: prInstOrder(g.key) };
      }).sort((a, b) => a.order - b.order);

      let paidSum = 0, outSum = 0, readySum = 0, readyCount = 0;
      groups.forEach(g => {
        paidSum += g.paidAmt; outSum += g.outAmt;
        if (g.status === 'ready' || g.status === 'overdue') { readySum += g.outAmt; readyCount++; }
      });
      const apKeys = groups.map(g => g.status);

      let okey = 'none';
      if (groups.length) {
        if (apKeys.includes('overdue')) okey = 'overdue';
        else if (apKeys.includes('ready')) okey = 'ready';
        else if (apKeys.includes('waiting')) okey = 'waiting';
        else if (apKeys.includes('planned')) okey = 'planned';
        else if (apKeys.includes('pending')) okey = 'pending';   // ยังมีงวดที่คาดหวังแต่ไม่ได้ตั้งเบิก → ไม่ใช่ "จ่ายครบ"
        else if (apKeys.every(k => k === 'paid')) okey = 'done';
        else okey = 'paid';
      }
      const apTotal = paidSum + outSum;
      const pct = apTotal ? Math.round(paidSum / apTotal * 100) : 0;

      const byVendor = {};
      groups.forEach(g => { g.paidRows.forEach(r => byVendor[r.vendor] = (byVendor[r.vendor] || 0) + r.amount); g.outRows.forEach(r => byVendor[r.vendor] = (byVendor[r.vendor] || 0) + r.amount); });
      const vendorNames = Object.keys(byVendor);
      const mainVendor = vendorNames.sort((a, b) => byVendor[b] - byVendor[a])[0] || '—';
      const contractorLabel = vendorNames.length > 1 ? (mainVendor + ' +' + (vendorNames.length - 1) + ' ราย') : (mainVendor || '—');

      return {
        code, ncode, name: d.site || d.name || code, customer: custByCode[ncode] || d.customer || '—',
        contractor: contractorLabel, vendorCount: vendorNames.length,
        contractValue: d.contractAmt || 0, fy: d.fy, arFull,
        productType, expectedNguad,
        arItems, apGroups: groups,
        receivedARTotal, paidSum, outSum, apTotal, readySum, readyCount, progressPct: pct,
        overall: okey, _keys: apKeys,
      };
    });

  const fys = Object.keys(fySet).map(Number).sort((a, b) => b - a);
  return { projects, fys, todayISO };
}

// ════════════════════════════════════════════════════════════════════════════
function PaymentReconPage({ data, setData, toast }) {
  const canEdit = window.WTPAuth ? (window.WTPAuth.can('canEdit') || window.WTPAuth.can('canApprove')) : true;
  const [state, setState] = React.useState({ filters: [], expanded: {}, sort: 'code', searchDate: '', fy: null });
  const [planTarget, setPlanTarget] = React.useState(null);
  const [planForm, setPlanForm] = React.useState({ payDate: '', bankAc: '' });

  const all = React.useMemo(() => prBuildAll(data), [data.projects, data.invoices, data.receipts, data.payables, data.pvVouchers, data.forecastEntries, data.manualOverrides]);
  const fy = state.fy != null ? state.fy : (all.fys.length ? all.fys[0] : 'all');

  const fyProjects = React.useMemo(() => all.projects.filter(p => fy === 'all' || p.fy === fy), [all, fy]);
  const fyHasAp = fyProjects.some(p => p.apGroups.length > 0);
  const diag = React.useMemo(() => ({
    signed: all.projects.length,
    withAp: all.projects.filter(p => p.apGroups.length > 0).length,
  }), [all]);
  const agg = React.useMemo(() => {
    const totals = { ready: 0, overdue: 0, waiting: 0, planned: 0, paid: 0 };
    fyProjects.forEach(p => p.apGroups.forEach(g => {
      totals.paid += g.paidAmt;
      if (g.outAmt > 0 && totals[g.status] != null) totals[g.status] += g.outAmt;
    }));
    return { totals, outstanding: totals.ready + totals.overdue + totals.waiting + totals.planned };
  }, [fyProjects]);

  const bankOptions = React.useMemo(() => (data.bankAccounts || []).map(a => {
    const name = a.BANK_NAME || a.bankName || a.bank || a.name || '';
    const ac = String(a.Bank_AC || a.accountNo || a.acNo || '').trim();
    const l4 = ac.replace(/\D/g, '').slice(-4);
    return { value: ac, label: (name || 'บัญชี') + (l4 ? ' · ' + l4 : '') };
  }).filter(o => o.value), [data.bankAccounts]);

  const projCount = (st) => fyProjects.filter(p => st === 'done' ? p.overall === 'done' : p._keys.includes(st)).length;

  // ── เขียน: วางแผนจ่าย ──
  const doPlan = () => {
    if (!planTarget || !setData) return;
    const { proj, group } = planTarget;
    const rows = (group.outRows || []).filter(r => r.vchno && !r.planned);
    if (!rows.length) { if (toast) toast('ไม่มีรายการค้างจ่ายที่วางแผนได้'); setPlanTarget(null); return; }
    const payDate = planForm.payDate || all.todayISO;
    const newRows = rows.map(r => ({
      id: (window.WTPData && window.WTPData.newId) ? window.WTPData.newId() : ('pr-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)),
      DATE: all.todayISO, PAYMENT_DATE: payDate, EXPENSE_TYPE: 'AP',
      DESCRIPTION: 'จ่าย ' + r.vendor + (r.vchno ? ' (' + r.vchno + ')' : '') + ' · ' + proj.code + ' ' + group.key,
      JOB_NO: proj.code, PROJECT_NAME: proj.name,
      AMOUNT: String(-Math.abs(r.amount)), Bank_AC: planForm.bankAc || null, STATUS: 'PLANNED',
      CATEGORY: r.cfCategory || '2', IS_ACCRUED: null, NOTE: null,
      ACTUAL_AMOUNT: null, ACTUAL_DATE: null, REF_DOC: r.vchno, BOOKED_AT: null, CFS_ACTIVITY: null,
    }));
    setData(prev => ({ ...prev, forecastEntries: [...(prev.forecastEntries || []), ...newRows] }));
    if (toast) toast('วางแผนจ่าย ' + proj.code + ' ' + group.key + ' (' + newRows.length + ' รายการ) → ดูที่ Bank Daily');
    setPlanTarget(null);
  };
  const doUnplan = (group) => {
    if (!setData) return;
    const refs = new Set((group.outRows || []).map(r => r.vchno).filter(Boolean));
    if (!refs.size) return;
    if (!window.confirm('ยกเลิกแผนจ่าย ' + group.key + ' ?')) return;
    setData(prev => ({
      ...prev,
      forecastEntries: (prev.forecastEntries || []).filter(f => {
        const ref = String(f.REF_DOC == null ? '' : f.REF_DOC).trim();
        if (!refs.has(ref)) return true;
        return (f.ACTUAL_AMOUNT != null && f.ACTUAL_AMOUNT !== '') || f.STATUS === 'ACTUAL';
      }),
    }));
    if (toast) toast('ยกเลิกแผนจ่ายแล้ว');
  };
  const openPlan = (proj, group) => { setPlanForm({ payDate: all.todayISO, bankAc: prDefaultBankAc(bankOptions) }); setPlanTarget({ proj, group }); };

  // ── filter (multi-select) / sort / date-search ──
  const fset = state.filters || [];
  const sd = state.searchDate;
  let projects = fyProjects.slice();
  if (fset.length) projects = projects.filter(p => fset.some(f => f === 'done' ? p.overall === 'done' : p._keys.includes(f)));
  if (sd) projects = projects.filter(p => p.apGroups.some(g => (g.status === 'ready' || g.status === 'overdue') && (g.unlockDate || '') <= sd));
  projects = projects.slice().sort((a, b) => {
    if (state.sort === 'contractor') return a.contractor.localeCompare(b.contractor, 'th');
    if (state.sort === 'ready') return b.readySum - a.readySum;
    if (state.sort === 'value') return b.contractValue - a.contractValue;
    return a.code.localeCompare(b.code, 'th');
  });
  let planSum = 0, planCnt = 0;
  if (sd) projects.forEach(p => p.apGroups.forEach(g => { if ((g.status === 'ready' || g.status === 'overdue') && (g.unlockDate || '') <= sd) { planSum += g.outAmt; planCnt++; } }));

  const toggle = (code) => setState(s => ({ ...s, expanded: { ...s.expanded, [code]: !s.expanded[code] } }));
  const toggleFilter = (key) => setState(s => {
    if (key === 'all') return { ...s, filters: [] };
    const cur = s.filters || [];
    return { ...s, filters: cur.includes(key) ? cur.filter(x => x !== key) : [...cur, key] };
  });

  const tabDefs = [
    { key: 'all', label: 'ทุกโครงการ', count: fyProjects.length },
    { key: 'ready', label: 'พร้อมจ่าย', count: projCount('ready') },
    { key: 'overdue', label: 'เกินกำหนด', count: projCount('overdue') },
    { key: 'waiting', label: 'รอเงื่อนไข', count: projCount('waiting') },
    { key: 'planned', label: 'วางแผนแล้ว', count: projCount('planned') },
    { key: 'paid', label: 'จ่ายบางส่วน', count: projCount('paid') },
    { key: 'done', label: 'จ่ายครบ', count: projCount('done') },
  ];
  const kpiCards = [
    { key: 'ready', desc: 'เงื่อนไขครบ พร้อมเบิก', accent: '#22c55e', val: agg.totals.ready, color: '#15803d' },
    { key: 'overdue', desc: 'พร้อมจ่ายแต่ค้างนาน', accent: '#ef4444', val: agg.totals.overdue, color: '#b91c1c' },
    { key: 'waiting', desc: 'ยังไม่รับ AR งวดนั้น', accent: '#f59e0b', val: agg.totals.waiting, color: '#b45309' },
    { key: 'planned', desc: 'วางแผนจ่ายแล้ว', accent: 'var(--brand-500)', val: agg.totals.planned, color: 'var(--brand-700)' },
    { key: 'paid', desc: 'จ่ายผู้รับเหมาแล้ว (PV)', accent: '#94a3b8', val: agg.totals.paid, color: '#475569' },
  ];

  const doExport = () => {
    const rows = [];
    projects.forEach(p => p.apGroups.forEach(g => {
      g.paidRows.forEach(r => rows.push({ code: p.code, name: p.name, customer: p.customer, งวด: g.key, สถานะ: 'จ่ายแล้ว', vendor: r.vendor, ref: r.pvNo, amount: r.amount, date: r.date ? fmtDate(r.date) : '' }));
      g.outRows.forEach(r => rows.push({ code: p.code, name: p.name, customer: p.customer, งวด: g.key, สถานะ: (PR_META[g.status] || {}).label || g.status, vendor: r.vendor, ref: r.vchno, amount: r.amount, date: r.due ? fmtDate(r.due) : '' }));
    }));
    exportRowsToExcel(rows, [
      { key: 'code', label: 'รหัสโครงการ' }, { key: 'name', label: 'โครงการ' }, { key: 'customer', label: 'ลูกหนี้' },
      { key: 'งวด', label: 'งวด' }, { key: 'สถานะ', label: 'สถานะ' }, { key: 'vendor', label: 'ผู้รับเหมา' },
      { key: 'ref', label: 'เลขที่ PV/AP' }, { key: 'amount', label: 'ยอด', type: 'number' }, { key: 'date', label: 'วันที่' },
    ], { filename: 'รายการจ่าย_AP_' + (fy === 'all' ? 'ทุกปี' : 'FY' + fy), sheetName: 'AP', title: 'กระทบยอดการจ่าย · ปีสัญญา ' + (fy === 'all' ? 'ทุกปี' : '25' + fy) });
  };

  return (
    <div className="pr-page" style={{ maxWidth: 1240, margin: '0 auto', padding: '4px 2px 60px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 24, flexWrap: 'wrap', marginBottom: 22 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--brand-900)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 11, height: 11, borderRadius: 3, background: '#22c55e' }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--ink-500)' }}>ระบบกระทบยอดการจ่ายเงิน</span>
          </div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, letterSpacing: -0.5, color: 'var(--ink-900)' }}>กระทบยอดการจ่าย · AR ↔ AP</h1>
          <p style={{ margin: '6px 0 0', fontSize: 13.5, color: 'var(--ink-500)', maxWidth: 620, lineHeight: 1.5 }}>
            จับคู่เงินรับจากลูกหนี้ <b style={{ color: 'var(--ink-700)' }}>(AR)</b> กับการจ่ายผู้รับเหมา <b style={{ color: 'var(--ink-700)' }}>(AP)</b> รายงวด — จ่ายผู้รับเหมาเมื่อรับเงิน AR งวดนั้น (หรือรับครบโครงการ) แล้ว
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12, color: 'var(--ink-400)', marginBottom: 6 }}>ยอด AP ค้างจ่ายทั้งหมด (ปีสัญญา {fy === 'all' ? 'ทุกปี' : '25' + fy})</div>
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 26, fontWeight: 700, letterSpacing: -0.5, color: 'var(--ink-900)' }}>{prMoney(agg.outstanding)}</div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, padding: '4px 10px', borderRadius: 999, background: '#fff', border: '1px solid var(--line)', fontSize: 12, color: 'var(--ink-500)' }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: '#22c55e' }} />ข้อมูล ณ {fmtDate(all.todayISO)}
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(186px,1fr))', gap: 12, marginBottom: 14 }}>
        {kpiCards.map(c => (
          <div key={c.key} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '16px 16px 14px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: c.accent }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: c.accent }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-700)' }}>{PR_META[c.key].label}</span>
            </div>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 23, fontWeight: 700, color: c.color, letterSpacing: -0.5 }}>{prMoney(c.val)}</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-400)', marginTop: 5 }}>{c.desc}</div>
          </div>
        ))}
      </div>

      {/* Logic explainer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', background: 'var(--brand-900)', color: '#dbe6f7', borderRadius: 12, padding: '12px 18px', marginBottom: 20 }}>
        <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.5, color: '#9fb4d8', textTransform: 'uppercase' }}>เงื่อนไขปลดล็อกการจ่าย</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}><span style={{ fontFamily: "'IBM Plex Mono',monospace", fontWeight: 600, color: '#fff' }}>ADV</span><span style={{ color: '#5b7099' }}>←</span><span>เซ็นสัญญา</span></div>
        <span style={{ color: '#3a527a' }}>·</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}><span style={{ fontFamily: "'IBM Plex Mono',monospace", fontWeight: 600, color: '#fff' }}>งวด N</span><span style={{ color: '#5b7099' }}>←</span><span>รับเงิน AR งวด N (หรือรับครบโครงการ)</span></div>
      </div>

      {/* Filter tabs (multi-select) + year */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {tabDefs.map(t => {
            const active = t.key === 'all' ? fset.length === 0 : fset.includes(t.key);
            return (
              <button key={t.key} onClick={() => toggleFilter(t.key)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid ' + (active ? 'var(--brand-700)' : 'var(--line)'), background: active ? 'var(--brand-700)' : '#fff', color: active ? '#fff' : 'var(--ink-600)' }}>
                {t.key !== 'all' && active && <span style={{ fontSize: 11 }}>✓</span>}
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
          <span style={{ fontSize: 13, color: 'var(--ink-500)' }}>แสดง <b style={{ color: 'var(--ink-900)' }}>{projects.length}</b> · เซ็นแล้ว <b style={{ color: 'var(--ink-700)' }}>{diag.signed}</b> · มี AP <b style={{ color: 'var(--ink-700)' }}>{diag.withAp}</b></span>
        </div>
      </div>

      {/* Sort + date search + export */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: '6px 12px' }}>
          <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>เรียงตาม</span>
          <select value={state.sort} onChange={e => setState(s => ({ ...s, sort: e.target.value }))}
            style={{ border: 'none', background: 'transparent', font: 'inherit', fontSize: 13, fontWeight: 600, color: 'var(--ink-900)', outline: 'none', cursor: 'pointer' }}>
            <option value="code">รหัสโครงการ</option><option value="contractor">ชื่อผู้รับเหมา</option>
            <option value="ready">พร้อมจ่ายมากสุด</option><option value="value">มูลค่าสัญญา</option>
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
            วางแผนจ่ายได้ <b style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{planCnt}</b> งวด · รวม <b style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{prMoney(planSum)}</b>
          </div>
        )}
        <button onClick={doExport} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: '7px 14px', fontSize: 13, fontWeight: 600, color: 'var(--ink-700)', cursor: 'pointer' }}>📥 Export Excel</button>
      </div>

      {fyProjects.length > 0 && !fyHasAp && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--warn-bg)', border: '1px solid #fde68a', borderRadius: 12, padding: '12px 16px', marginBottom: 14, fontSize: 13, color: '#92660b', lineHeight: 1.5 }}>
          <span style={{ fontSize: 16 }}>⚠️</span>
          <span>มีโครงการเซ็นแล้ว แต่ยังไม่มี AP ผูกกับโครงการ — ฝั่ง <b>จ่ายแล้ว</b> มาจาก PV · ฝั่ง <b>ค้างจ่าย</b> ต้อง <b>อัปโหลดไฟล์เจ้าหนี้ที่มีคอลัมน์ pre_des (โครงการ)</b> ที่หน้า "DATA เจ้าหนี้คงค้าง" 1 ครั้ง</span>
        </div>
      )}

      {/* Project cards */}
      <div>
        {projects.length === 0 && (
          <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '40px 18px', textAlign: 'center', color: 'var(--ink-500)', fontSize: 14, lineHeight: 1.7 }}>
            {diag.signed === 0 ? (
              <span>ยังไม่มีข้อมูลโครงการที่เซ็นสัญญา<br /><span style={{ fontSize: 12.5, color: 'var(--ink-400)' }}>ตรวจว่าล็อกอินแล้ว และตาราง <b>projects / invoices</b> โหลดครบ</span></span>
            ) : fyProjects.length === 0 ? (
              <span>{fy === 'all' ? 'ไม่พบโครงการ' : <>ปี <b>25{fy}</b> ไม่มีโครงการที่เซ็นสัญญา</>} · ลองเลือก <b>"ทุกปี"</b></span>
            ) : (
              <span>ไม่มีโครงการตรงตัวกรอง · ลองกดแท็บ <b>"ทุกโครงการ"</b> {sd ? 'หรือล้างวันที่' : ''}</span>
            )}
          </div>
        )}

        {projects.map(p => {
          const expanded = !!state.expanded[p.code];
          const minis = p.apGroups.slice(0, 6);
          const om = PR_META[p.overall] || PR_META.none;
          const overallLabel = p.overall === 'done' ? 'จ่ายครบ' : (om.label + (p.readyCount > 0 ? ' ' + p.readyCount + ' งวด' : ''));
          return (
            <div key={p.code} style={{ background: '#fff', border: '1px solid var(--line)', borderLeft: '4px solid ' + om.dot, borderRadius: 14, marginBottom: 12, boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
              <div onClick={() => toggle(p.code)} style={{ cursor: 'pointer', display: 'grid', gridTemplateColumns: '92px minmax(0,1fr) 132px 120px 158px 28px', gap: 14, alignItems: 'center', padding: '13px 18px', background: expanded ? 'var(--ink-50)' : '#fff' }}>
                <span style={{ justifySelf: 'start', fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, fontWeight: 700, color: 'var(--ink-700)', background: 'var(--ink-100)', padding: '3px 9px', borderRadius: 7, whiteSpace: 'nowrap' }}>{p.code}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600, lineHeight: 1.3, color: 'var(--ink-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.contractor}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 14, fontWeight: 700, color: 'var(--ink-900)' }}>{prMoney(p.contractValue)}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--ink-400)' }}>มูลค่าสัญญา</div>
                </div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
                  {minis.map((g, i) => { const m = PR_META[g.status] || PR_META.none; return <span key={i} title={g.key + ' · ' + m.label} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 30, height: 21, padding: '0 6px', borderRadius: 6, fontSize: 10.5, fontWeight: 600, fontFamily: "'IBM Plex Mono',monospace", background: m.bg, color: m.color }}>{g.key === 'ADV' ? 'Adv' : g.key.replace('งวด ', 'ง')}</span>; })}
                  {p.apGroups.length > 6 && <span style={{ fontSize: 11, color: 'var(--ink-400)', alignSelf: 'center' }}>+{p.apGroups.length - 6}</span>}
                  {p.apGroups.length === 0 && <span style={{ fontSize: 11, color: 'var(--ink-300)' }}>— ไม่มี AP</span>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 14, fontWeight: 700, color: p.readySum > 0 ? (p._keys.includes('overdue') ? '#b91c1c' : '#15803d') : 'var(--ink-300)' }}>{p.readySum > 0 ? prMoney(p.readySum) : '—'}</div>
                  <div style={{ marginTop: 3 }}><span style={prPill(om)}><span style={prDot(om)} />{overallLabel}</span></div>
                </div>
                <span style={{ textAlign: 'center', color: 'var(--ink-400)', fontSize: 12 }}>{expanded ? '▲' : '▼'}</span>
              </div>

              {expanded && (
                <div style={{ padding: '6px 18px 22px', background: 'var(--ink-50)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0 16px', fontSize: 12, color: 'var(--ink-500)', flexWrap: 'wrap' }}>
                    <span>ลูกหนี้: <b style={{ color: 'var(--ink-700)' }}>{p.customer}</b></span><span style={{ color: 'var(--ink-300)' }}>·</span>
                    {p.productType && <><span style={{ fontSize: 11, fontWeight: 600, color: 'var(--brand-700)', background: 'var(--brand-50)', border: '1px solid var(--brand-100)', padding: '1px 8px', borderRadius: 999 }}>{p.productType} · {p.expectedNguad + 1} งวด</span><span style={{ color: 'var(--ink-300)' }}>·</span></>}
                    <span>รับเงินแล้ว <b style={{ fontFamily: "'IBM Plex Mono',monospace", color: '#15803d' }}>{prMoney(p.receivedARTotal)}</b>{p.arFull && <span style={{ marginLeft: 5, fontSize: 10.5, fontWeight: 700, color: '#15803d', background: '#dcfce7', padding: '1px 7px', borderRadius: 999 }}>รับครบแล้ว</span>}</span><span style={{ color: 'var(--ink-300)' }}>·</span>
                    <span>จ่ายผู้รับเหมาแล้ว <b style={{ fontFamily: "'IBM Plex Mono',monospace", color: 'var(--ink-900)' }}>{prMoney(p.paidSum)}</b>{p.outSum > 0 && <> · ค้าง <b style={{ fontFamily: "'IBM Plex Mono',monospace", color: '#b45309' }}>{prMoney(p.outSum)}</b></>} ({p.progressPct}%)</span>
                    <div style={{ flex: 1, maxWidth: 180, height: 6, borderRadius: 999, background: 'var(--ink-200)', overflow: 'hidden' }}><div style={{ width: p.progressPct + '%', height: '100%', background: p.overall === 'overdue' ? '#ef4444' : 'var(--brand-700)', borderRadius: 999, transition: 'width .3s' }} /></div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.55fr', gap: 18, alignItems: 'start' }}>
                    {/* AR */}
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: '#15803d', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 6, height: 6, borderRadius: 999, background: '#22c55e' }} />เงินรับจากลูกหนี้ · AR ({p.arItems.length === 1 ? 'รับครั้งเดียว' : p.arItems.length + ' งวด'})</div>
                      <div style={{ border: '1px solid var(--line-soft)', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '0.8fr 1.1fr 0.9fr 0.9fr', background: 'var(--ink-50)', fontSize: 10.5, fontWeight: 600, color: 'var(--ink-400)', padding: '8px 12px', gap: 8 }}>
                          <span>งวด</span><span>เลขใบแจ้งหนี้</span><span style={{ textAlign: 'right' }}>มูลค่า</span><span style={{ textAlign: 'right' }}>รับจริง</span>
                        </div>
                        {p.arItems.length === 0 && <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--ink-400)' }}>ยังไม่มีใบแจ้งหนี้</div>}
                        {p.arItems.map((ar, i) => { const m = ar.received ? PR_META.ready : PR_META.waiting; return (
                          <div key={i} style={{ display: 'grid', gridTemplateColumns: '0.8fr 1.1fr 0.9fr 0.9fr', padding: '9px 12px', gap: 8, fontSize: 12, borderTop: '1px solid var(--line-soft)', alignItems: 'center', background: ar.received ? '#f7fdf9' : '#fff' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={prDot(m)} /><b>{ar.label}</b></span>
                            <span style={{ fontFamily: "'IBM Plex Mono',monospace", color: 'var(--ink-600)' }}>{ar.invoiceNo}</span>
                            <span style={{ fontFamily: "'IBM Plex Mono',monospace", textAlign: 'right' }}>{prMoney(ar.amount)}</span>
                            <span style={{ textAlign: 'right', color: ar.received ? '#15803d' : 'var(--ink-400)', fontWeight: ar.received ? 600 : 400 }}>{ar.received ? fmtDate(ar.receivedDate) : 'รอรับ'}</span>
                          </div>
                        ); })}
                      </div>
                    </div>
                    {/* AP — ราย งวด (card per งวด พร้อมรายละเอียดราย PV/AP) */}
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--brand-700)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--brand-500)' }} />จ่ายผู้รับเหมา · AP รายงวด ({p.apGroups.length})</div>
                      {p.apGroups.length === 0 && <div style={{ border: '1px solid var(--line-soft)', borderRadius: 12, background: '#fff', padding: '12px', fontSize: 12, color: 'var(--ink-400)' }}>ยังไม่มีรายการ AP (APS) ของโครงการนี้</div>}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {p.apGroups.map((g, i) => {
                          const m = PR_META[g.status] || PR_META.none;
                          const detail = [...g.paidRows.map(r => ({ ...r, _paid: true })), ...g.outRows.map(r => ({ ...r, _paid: false }))];
                          return (
                            <div key={i} style={{ border: '1px solid var(--line-soft)', borderLeft: '3px solid ' + m.dot, borderRadius: 10, background: '#fff', overflow: 'hidden' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', flexWrap: 'wrap' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 54, padding: '3px 10px', borderRadius: 7, fontSize: 12.5, fontWeight: 700, background: m.bg, color: m.color }}>{g.key}</span>
                                <span style={{ fontSize: 11.5, color: g.unlocked ? '#15803d' : 'var(--ink-400)' }}>{g.condLabel === '—' ? '' : ((g.unlocked ? '✓ ' : '✗ ') + g.condLabel)}</span>
                                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
                                  {g.paidAmt > 0 && <span style={{ fontSize: 11.5, color: 'var(--ink-500)' }}>จ่ายแล้ว <b style={{ fontFamily: "'IBM Plex Mono',monospace", color: 'var(--ink-800)' }}>{prMoney(g.paidAmt)}</b></span>}
                                  {g.outAmt > 0 && <span style={{ fontSize: 11.5, color: 'var(--ink-500)' }}>ค้าง <b style={{ fontFamily: "'IBM Plex Mono',monospace", color: '#b45309' }}>{prMoney(g.outAmt)}</b></span>}
                                  <span style={prPill(m)}><span style={prDot(m)} />{m.label}</span>
                                  {canEdit && (g.status === 'ready' || g.status === 'overdue') && g.outRows.some(r => r.vchno) && (
                                    <button onClick={() => openPlan(p, g)} style={{ padding: '5px 11px', borderRadius: 7, border: 'none', background: 'var(--brand-700)', color: '#fff', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>วางแผนจ่าย</button>
                                  )}
                                  {canEdit && g.status === 'planned' && <button onClick={() => doUnplan(g)} style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid var(--line)', background: '#fff', color: 'var(--ink-500)', fontSize: 11, cursor: 'pointer' }}>ยกเลิกแผน</button>}
                                </div>
                              </div>
                              {/* รายละเอียดราย PV/AP */}
                              <div style={{ borderTop: '1px solid var(--line-soft)', background: 'var(--ink-50)', padding: '6px 12px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                                {detail.map((r, j) => (
                                  <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: 10, color: r._paid ? '#15803d' : '#b45309' }}>{r._paid ? '✓ จ่ายแล้ว' : '○ ค้างจ่าย'}</span>
                                    <span style={{ color: 'var(--ink-700)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.vendor}>{r.vendor}</span>
                                    <span style={{ fontFamily: "'IBM Plex Mono',monospace", color: 'var(--ink-500)' }}>{r._paid ? ('PV ' + (r.pvNo || '—')) : ('AP ' + (r.vchno || '—'))}</span>
                                    <span style={{ color: 'var(--ink-400)' }}>{r._paid ? (r.date ? '· จ่าย ' + fmtDate(r.date) : '') : (r.due ? '· ครบ ' + fmtDate(r.due) : '')}{!r._paid && r.planned && r.plannedDate ? ' · 📅 ' + fmtDate(r.plannedDate) : ''}</span>
                                    <span style={{ marginLeft: 'auto', fontFamily: "'IBM Plex Mono',monospace", fontWeight: 600, color: r._paid ? 'var(--ink-700)' : '#b45309' }}>{prMoney(r.amount)}</span>
                                  </div>
                                ))}
                                {detail.length === 0 && <span style={{ fontSize: 11, color: 'var(--ink-400)' }}>{g._scaffold ? ('ยังไม่มีเอกสาร AP/PV — ' + (g.unlocked ? 'รับเงินลูกหนี้แล้ว · รอผู้รับเหมาวางบิล' : 'รอรับเงินลูกหนี้ก่อน')) : '—'}</span>}
                              </div>
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

      {/* Plan modal */}
      <Modal open={!!planTarget} title="วางแผนจ่ายผู้รับเหมา" onClose={() => setPlanTarget(null)}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setPlanTarget(null)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--line)', background: '#fff', color: 'var(--ink-600)', fontWeight: 600, cursor: 'pointer' }}>ยกเลิก</button>
            <button onClick={doPlan} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--brand-700)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>ยืนยันวางแผนจ่าย</button>
          </div>
        }>
        {planTarget && (() => {
          const rows = (planTarget.group.outRows || []).filter(r => r.vchno && !r.planned);
          const tot = rows.reduce((s, r) => s + r.amount, 0);
          return (
            <div style={{ fontSize: 13.5, color: 'var(--ink-700)' }}>
              <div style={{ background: 'var(--ink-50)', border: '1px solid var(--line-soft)', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>{planTarget.proj.code} · {planTarget.proj.name}</div>
                <div style={{ fontWeight: 700, marginTop: 4, color: 'var(--ink-900)' }}>{planTarget.group.key} — {rows.length} รายการ · รวม {prMoney(tot)}</div>
                <div style={{ marginTop: 6, fontSize: 12 }}>{rows.slice(0, 4).map((r, i) => <div key={i} style={{ color: 'var(--ink-600)' }}>· {r.vendor} <span style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{r.vchno}</span> — {prMoney(r.amount)}</div>)}{rows.length > 4 && <div style={{ color: 'var(--ink-400)' }}>…อีก {rows.length - 4} รายการ</div>}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <label style={{ fontSize: 12.5 }}>วันที่จ่าย (วางแผน)
                  <input type="date" value={planForm.payDate} onChange={e => setPlanForm(f => ({ ...f, payDate: e.target.value }))}
                    style={{ display: 'block', marginTop: 5, width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', font: 'inherit' }} />
                </label>
                <label style={{ fontSize: 12.5 }}>บัญชีธนาคาร
                  <select value={planForm.bankAc} onChange={e => setPlanForm(f => ({ ...f, bankAc: e.target.value }))}
                    style={{ display: 'block', marginTop: 5, width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', font: 'inherit', background: '#fff' }}>
                    <option value="">— ไม่ระบุ —</option>
                    {bankOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
              </div>
              <div style={{ marginTop: 14, fontSize: 12, color: 'var(--ink-400)', lineHeight: 1.5 }}>
                เมื่อยืนยัน รายการจะถูกบันทึกเป็น "ประมาณการจ่าย" (PLANNED) ไปแสดงที่หน้า <b style={{ color: 'var(--ink-600)' }}>Bank Daily</b> และงวดนี้จะขึ้นสถานะ "วางแผนแล้ว"
              </div>
            </div>
          );
        })()}
      </Modal>

    </div>
  );
}
