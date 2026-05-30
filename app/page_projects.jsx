// ─────────────────────────────────────────────────────────────────────────────
// Water POG — Project Control Center
// หน้า "จัดการโครงการ" v2 — ติดตามโครงการจากลงนามถึงปิดโครงการในหน้าเดียว
// รวมข้อมูลจาก: projects, invoices, receipts, follow-ups → คำนวณ status อัตโนมัติ
// ─────────────────────────────────────────────────────────────────────────────
const { useState: pjState, useMemo: pjMemo, useEffect: pjEffect, useRef: pjRef } = React;

// ── Status engine ───────────────────────────────────────────────────────────
// 9 สถานะ — ไม่ให้ user เลือกเอง, คำนวณจาก contract/delivery/invoice/receipt
const PROJ_STATUS = {
  cancelled:        { label: 'ยกเลิกโครงการ',     color: '#7f1d1d', bg: '#fee2e2', dot: '#ef4444', order: 0 },
  waiting_sign:     { label: 'รอลงนาม',          color: '#9a3412', bg: '#ffedd5', dot: '#f97316', order: 1 },
  construction_m1:  { label: 'ก่อสร้าง งวด 1',    color: '#7c2d12', bg: '#fef3c7', dot: '#d97706', order: 2 },
  construction_m2:  { label: 'ก่อสร้าง งวด 2',    color: '#7c2d12', bg: '#fef3c7', dot: '#d97706', order: 3 },
  construction_m3:  { label: 'ก่อสร้าง งวด 3',    color: '#7c2d12', bg: '#fef3c7', dot: '#d97706', order: 4 },
  waiting_invoice:  { label: 'รอออก Invoice',     color: '#5b21b6', bg: '#ede9fe', dot: '#7c3aed', order: 5 },
  waiting_payment:  { label: 'รอรับชำระ',         color: '#1e40af', bg: '#dbeafe', dot: '#2563eb', order: 6 },
  partial_paid:     { label: 'เก็บเงินบางส่วน',   color: '#155e75', bg: '#cffafe', dot: '#0891b2', order: 7 },
  closed:           { label: 'ปิดโครงการ',        color: '#15803d', bg: '#dcfce7', dot: '#16a34a', order: 8 },
};

const isStatusDone = (s) => /done|paid|รับชำระ|ปิด/i.test(String(s || ''));
const isTruthy = (v) => v != null && v !== '' && v !== 0 && v !== '0';
const toNum = (v) => { const n = Number(String(v ?? '').toString().replace(/[, ]/g, '')); return isNaN(n) ? 0 : n; };

// strip product-type suffix: "PP064-STIIS" → "PP064"
const normalizeCode = (code) => {
  const s = String(code || '').trim();
  if (!s) return '';
  const m = s.match(/^(.+?)-[A-Z]{2,6}$/);
  return m ? m[1] : s;
};

function computeProjectStatus(p, projInvoices, projReceipts) {
  // ยกเลิกโครงการ — column Z "ยกเลิกโครงการ" = 1 (มาก่อนทุกสถานะ)
  if (toNum(p['ยกเลิกโครงการ']) === 1) return 'cancelled';

  // รอลงนาม — Sign Date IS NULL (ใช้ Start date เป็นเกณฑ์: ถ้ายังไม่มีวันเริ่มงาน
  // = ยังไม่ลงนามจริง). `เซ็นสัญญา` flag อย่างเดียวเชื่อไม่ได้ — ในข้อมูลจริง
  // หลายโครงการตั้งเป็น "1" ค้างไว้ทั้งที่ยังไม่ได้ลงนาม
  const startDate = p['Start'] || p.startDate || '';
  // ถือว่ายังไม่ลงนามถ้า: Start ว่าง AND (ไม่มี signed flag หรือไม่มี receive date เลย)
  const hasAnyActivity = !!p['Receive Date'] || isStatusDone(p['Payment 1 Status']) || !!p['แจ้งเข้าดำเนินการ'];
  if (!startDate && !hasAnyActivity) return 'waiting_sign';

  const contractValue = toNum(p['มูลค่าสัญญาที่เซ็น'] || p.signedValue);
  const totalReceived = projReceipts.reduce((s, r) => s + toNum(r.netReceived || r.grossAmount), 0)
                     || toNum(p['Receive']);

  // ปิดโครงการ — รับเงินครบ
  if (contractValue > 0 && totalReceived >= contractValue * 0.99) return 'closed';

  // milestones from "Payment N Status" + "Receive Date N"
  const m1Delivered = isStatusDone(p['Payment 1 Status']) || !!p['Receive Date'];
  const m2Delivered = isStatusDone(p['Payment 2 Status']) || !!p['Receive Date2'];
  const m3Delivered = isStatusDone(p['Payment 3 Status']) || !!p['Receive Date3'];
  const milestoneCount = (m1Delivered ? 1 : 0) + (m2Delivered ? 1 : 0) + (m3Delivered ? 1 : 0);

  const invoiceCount = projInvoices.length;
  const hasUnpaidInvoice = projInvoices.some(iv => iv.status !== 'paid');

  // เก็บเงินบางส่วน
  if (totalReceived > 0 && contractValue > 0 && totalReceived < contractValue) return 'partial_paid';

  // มี invoice + ยังไม่ได้รับครบ → รอรับชำระ
  if (invoiceCount > 0 && hasUnpaidInvoice) return 'waiting_payment';

  // ส่งมอบงานแล้ว แต่ invoice ยังไม่ครบ → รอออก IV
  if (milestoneCount > invoiceCount) return 'waiting_invoice';

  // ระหว่างก่อสร้าง — งวดต่อไป
  if (m2Delivered) return 'construction_m3';
  if (m1Delivered) return 'construction_m2';
  return 'construction_m1';
}

// ── Project enrichment — join projects with invoices/receipts ──────────────
function enrichProjects(projects, allInvoices, allReceipts) {
  // Build index by project code for fast lookup
  const ivByCode = {};
  const rcByCode = {};
  for (const iv of (allInvoices || [])) {
    const c = normalizeCode(iv.jobNo || iv.contractRef || '');
    if (!c) continue;
    (ivByCode[c] = ivByCode[c] || []).push(iv);
  }
  for (const r of (allReceipts || [])) {
    const c = normalizeCode(r.projectCode || '');
    if (!c) continue;
    (rcByCode[c] = rcByCode[c] || []).push(r);
  }

  return projects.map(p => {
    const code = p['Contract No.'] || p.code || '';
    const cleanCode = normalizeCode(code);
    const get = (...keys) => {
      for (const k of keys) if (p[k] != null && p[k] !== '') return p[k];
      return '';
    };
    // โครงการอาจ match ทั้ง cleanCode (PP064) และ raw code (PP064-STIIS)
    const projInvoices = [].concat(ivByCode[cleanCode] || [], ivByCode[code] || [])
      .filter((iv, i, arr) => arr.findIndex(x => x.id === iv.id) === i);
    const projReceipts = [].concat(rcByCode[cleanCode] || [], rcByCode[code] || [])
      .filter((r, i, arr) => arr.findIndex(x => x.id === r.id) === i);

    const contractValue = toNum(get('มูลค่าสัญญาที่เซ็น', 'signedValue'));
    const totalInvoiced  = projInvoices.reduce((s, iv) => s + toNum(iv.balance), 0);
    const totalReceived  = projReceipts.reduce((s, r) => s + toNum(r.netReceived || r.grossAmount), 0)
                        || toNum(get('Receive'));
    const outstanding    = projInvoices
      .filter(iv => iv.status !== 'paid')
      .reduce((s, iv) => s + toNum(iv.balance), 0);
    const backlog        = Math.max(0, contractValue - totalInvoiced);
    const collectionPct  = contractValue > 0 ? (totalReceived / contractValue * 100) : 0;

    const status = computeProjectStatus(p, projInvoices, projReceipts);
    const meta = PROJ_STATUS[status];

    // Latest follow-up across all invoices
    let latestFollowUp = null;
    for (const iv of projInvoices) {
      const fus = iv.followUps || [];
      for (const fu of fus) {
        if (!latestFollowUp || (fu.date && fu.date > latestFollowUp.date)) {
          latestFollowUp = { ...fu, ivNo: iv.ivNo };
        }
      }
    }
    // Latest invoice
    const sortedIvs = [...projInvoices].sort((a, b) => (b.invoiceDate || '').localeCompare(a.invoiceDate || ''));
    const latestIv = sortedIvs[0] || null;

    // AR aging on outstanding invoices
    const today = new Date().toISOString().slice(0, 10);
    const dueDateOf = (iv) => iv.expectedReceive || iv.invoiceDate || '';
    const daysSince = (d) => d ? Math.max(0, Math.floor((new Date(today) - new Date(d)) / 86400000)) : 0;
    let agingBucket = null;
    for (const iv of projInvoices.filter(iv => iv.status !== 'paid')) {
      const d = daysSince(dueDateOf(iv));
      if (d > 90) agingBucket = '90+';
      else if (d > 60 && agingBucket !== '90+') agingBucket = '61-90';
      else if (d > 30 && !agingBucket) agingBucket = '31-60';
      else if (!agingBucket) agingBucket = '0-30';
    }

    return {
      ...p,
      _id: p.id,
      _code: code,
      _cleanCode: cleanCode,
      _name: p['พื้นที่'] || p.name || '—',
      _type: p['Type'] || '',
      _province: p['Province'] || '',
      _start: get('Start', 'startDate'),
      _finish: get('Finish', 'finishDate'),
      _signedDate: get('เซ็นสัญญา', 'signedAt'),
      _contractValue: contractValue,
      _budget: toNum(get('งบประมาณ', 'allocBudget')),
      _assignee: get('ผู้รับโอนสิทธิ์', 'assignee') || '',
      _debt: toNum(get('ภาระหนี้', 'debt')),
      _totalInvoiced: totalInvoiced,
      _totalReceived: totalReceived,
      _outstanding: outstanding,
      _backlog: backlog,
      _collectionPct: collectionPct,
      _invoiceCount: projInvoices.length,
      _latestInvoice: latestIv,
      _latestFollowUp: latestFollowUp,
      _agingBucket: agingBucket,
      _invoices: projInvoices,
      _receipts: projReceipts,
      _status: status,
      _statusMeta: meta,
      _refCode: get('Ref.code', 'contractRef'),
    };
  });
}

// ── Column group system ────────────────────────────────────────────────────
const COL_GROUPS = [
  { key: 'basic',     label: 'ข้อมูลพื้นฐาน',    icon: '📋', default: true,
    cols: ['code', 'name', 'province', 'type', 'assignee'] },
  { key: 'contract',  label: 'ข้อมูลสัญญา',     icon: '📝', default: true,
    cols: ['signedDate', 'start', 'finish', 'contractValue'] },
  { key: 'progress',  label: 'ความคืบหน้า',      icon: '🚧', default: false,
    cols: ['statusDetail', 'milestoneCount', 'latestDelivery'] },
  { key: 'finance',   label: 'การเงินรวม',       icon: '💰', default: true,
    cols: ['totalInvoiced', 'totalReceived', 'outstanding', 'backlog', 'collectionPct'] },
  { key: 'invoice',   label: 'Invoice',          icon: '📄', default: false,
    cols: ['invoiceCount', 'latestIv', 'latestIvAmount'] },
  { key: 'ar',        label: 'ลูกหนี้',          icon: '📥', default: false,
    cols: ['aging', 'dueDate', 'latestFollowUp'] },
];

const ALL_COLS = {
  code:           { label: 'เลขที่สัญญา',  width: 110, sticky: true },
  name:           { label: 'ชื่อโครงการ / พื้นที่', width: 280 },
  province:       { label: 'จังหวัด',         width: 90 },
  type:           { label: 'ประเภท',          width: 70 },
  assignee:       { label: 'ผู้รับโอนสิทธิ์', width: 110 },
  signedDate:     { label: 'วันที่ลงนาม',    width: 90 },
  start:          { label: 'เริ่มงาน',        width: 90 },
  finish:         { label: 'สิ้นสุด',         width: 90 },
  contractValue:  { label: 'มูลค่าสัญญา (฿)', width: 130, align: 'right' },
  statusDetail:   { label: 'สถานะงาน',       width: 140 },
  milestoneCount: { label: 'งวดส่งมอบ',      width: 80, align: 'center' },
  latestDelivery: { label: 'ส่งมอบล่าสุด',   width: 100 },
  totalInvoiced:  { label: 'Invoice รวม (฿)', width: 130, align: 'right' },
  totalReceived:  { label: 'รับเงินรวม (฿)',  width: 130, align: 'right' },
  outstanding:    { label: 'AR คงค้าง (฿)',  width: 130, align: 'right' },
  backlog:        { label: 'Backlog (฿)',    width: 130, align: 'right' },
  collectionPct:  { label: 'Collection %',   width: 110, align: 'right' },
  invoiceCount:   { label: '# IV',           width: 60,  align: 'center' },
  latestIv:       { label: 'IV ล่าสุด',       width: 110 },
  latestIvAmount: { label: 'มูลค่า IV ล่าสุด',width: 120, align: 'right' },
  aging:          { label: 'Aging',           width: 80 },
  dueDate:        { label: 'Due Date',        width: 95 },
  latestFollowUp: { label: 'Follow Up ล่าสุด', width: 220 },
};

// ── Helpers for table cells ─────────────────────────────────────────────────
const fmtMoney = (v) => v ? Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—';
const fmtPct = (v) => v != null && !isNaN(v) ? Number(v).toFixed(1) + '%' : '—';
const fmtD = (d) => {
  if (!d) return '—';
  const s = String(d).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const [y, m, dd] = s.split('-');
  return `${dd}/${m}/${y.slice(2)}`;
};

// ── Status pill component ──────────────────────────────────────────────────
function StatusPill({ status }) {
  const meta = PROJ_STATUS[status] || { label: status, color: '#475569', bg: '#f1f5f9', dot: '#64748b' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: meta.bg, color: meta.color,
      fontSize: 10.5, fontWeight: 600, padding: '3px 8px', borderRadius: 10,
      border: '1px solid ' + meta.dot + '40',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 99, background: meta.dot }} />
      {meta.label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page component
// ─────────────────────────────────────────────────────────────────────────────
function ProjectsPage({ data, setData, toast }) {
  const [query, setQuery] = pjState('');
  const [drawerProj, setDrawerProj] = pjState(null);
  const [fullscreen, setFullscreen] = pjState(false);
  const [filterOpen, setFilterOpen] = pjState(true);
  const [uploadOpen, setUploadOpen] = pjState(false);
  const [uploadDiff, setUploadDiff] = pjState(null); // { new:[], updated:[], unchanged:[] }
  const userCanEdit = window.WTPAuth ? window.WTPAuth.can('canEdit') : true;
  // multi-select filters
  const [filters, setFilters] = pjState({
    status: new Set(),
    province: new Set(),
    type: new Set(),
    assignee: new Set(),
    aging: new Set(),
  });
  // column groups toggle
  const [activeGroups, setActiveGroups] = pjState(() => {
    const s = new Set();
    COL_GROUPS.forEach(g => g.default && s.add(g.key));
    return s;
  });

  const enriched = pjMemo(
    () => enrichProjects(data.projects || [], data.invoices || [], data.receipts || []),
    [data.projects, data.invoices, data.receipts]
  );

  // ── Apply filters + search ─────────────────────────────────────────────
  const filtered = pjMemo(() => {
    let xs = enriched;
    if (filters.status.size > 0)   xs = xs.filter(p => filters.status.has(p._status));
    if (filters.province.size > 0) xs = xs.filter(p => filters.province.has(p._province));
    if (filters.type.size > 0)     xs = xs.filter(p => filters.type.has(p._type));
    if (filters.assignee.size > 0) xs = xs.filter(p => filters.assignee.has(p._assignee || '(ไม่โอน)'));
    if (filters.aging.size > 0)    xs = xs.filter(p => p._agingBucket && filters.aging.has(p._agingBucket));
    if (query.trim()) {
      const q = query.toLowerCase();
      xs = xs.filter(p =>
        (p._code || '').toLowerCase().includes(q) ||
        (p._name || '').toLowerCase().includes(q) ||
        (p._province || '').toLowerCase().includes(q) ||
        (p._refCode || '').toLowerCase().includes(q) ||
        (p._invoices || []).some(iv => (iv.ivNo || '').toLowerCase().includes(q))
      );
    }
    return xs;
  }, [enriched, filters, query]);

  // ── Executive KPIs ─────────────────────────────────────────────────────
  const kpi = pjMemo(() => {
    const k = { byStatus: {}, count: filtered.length };
    Object.keys(PROJ_STATUS).forEach(s => k.byStatus[s] = 0);
    let signedValue = 0, wipValue = 0, invoiceValue = 0, arValue = 0, paidValue = 0, backlogValue = 0;
    filtered.forEach(p => {
      k.byStatus[p._status] = (k.byStatus[p._status] || 0) + 1;
      signedValue += p._contractValue;
      if (p._status.startsWith('construction_')) wipValue += p._contractValue - p._totalInvoiced;
      invoiceValue += p._totalInvoiced;
      arValue += p._outstanding;
      paidValue += p._totalReceived;
      backlogValue += p._backlog;
    });
    // Cashflow forecast — invoices outstanding by expectedReceive window
    const todayD = new Date();
    const dayIn = (d) => (d - todayD) / 86400000;
    let cf30 = 0, cf60 = 0, cf90 = 0, cfMonth = 0;
    const todayMonth = todayD.toISOString().slice(0, 7);
    filtered.forEach(p => {
      (p._invoices || []).filter(iv => iv.status !== 'paid').forEach(iv => {
        if (!iv.expectedReceive) return;
        const days = dayIn(new Date(iv.expectedReceive));
        const b = toNum(iv.balance);
        if (iv.expectedReceive.startsWith(todayMonth)) cfMonth += b;
        if (days >= 0 && days <= 30) cf30 += b;
        if (days >= 0 && days <= 60) cf60 += b;
        if (days >= 0 && days <= 90) cf90 += b;
      });
    });
    return { ...k, signedValue, wipValue, invoiceValue, arValue, paidValue, backlogValue,
             cfMonth, cf30, cf60, cf90 };
  }, [filtered]);

  // ── Filter facets (unique values + counts) ─────────────────────────────
  const facets = pjMemo(() => {
    const provinces = {}, types = {}, assignees = {};
    enriched.forEach(p => {
      if (p._province) provinces[p._province] = (provinces[p._province] || 0) + 1;
      if (p._type) types[p._type] = (types[p._type] || 0) + 1;
      const a = p._assignee || '(ไม่โอน)';
      assignees[a] = (assignees[a] || 0) + 1;
    });
    return { provinces, types, assignees };
  }, [enriched]);

  // ── Auto insights ──────────────────────────────────────────────────────
  const insights = pjMemo(() => {
    const list = [];
    const wInv = filtered.filter(p => p._status === 'waiting_invoice');
    if (wInv.length > 0) {
      const v = wInv.reduce((s, p) => s + p._backlog, 0);
      list.push({ kind: 'risk', icon: '📄',
        title: `มี ${wInv.length} โครงการที่ส่งมอบแล้วแต่ยังไม่ออก Invoice`,
        body: `มูลค่ารวม ${fmtMoney(v)} บาท · ควรเร่งออก IV เพื่อเริ่มกระบวนการเก็บเงิน`,
      });
    }
    const overdue90 = filtered.filter(p => p._agingBucket === '90+');
    if (overdue90.length > 0) {
      const v = overdue90.reduce((s, p) => s + p._outstanding, 0);
      list.push({ kind: 'critical', icon: '🚨',
        title: `มี ${overdue90.length} โครงการที่เกินกำหนดรับชำระมากกว่า 90 วัน`,
        body: `มูลค่ารวม ${fmtMoney(v)} บาท · ต้องติดตามด่วน`,
      });
    }
    const overdue6090 = filtered.filter(p => p._agingBucket === '61-90');
    if (overdue6090.length > 0) {
      const v = overdue6090.reduce((s, p) => s + p._outstanding, 0);
      list.push({ kind: 'risk', icon: '⚠️',
        title: `มี ${overdue6090.length} โครงการ AR 61-90 วัน`,
        body: `มูลค่า ${fmtMoney(v)} บาท · เสี่ยงเข้าโซน 90+`,
      });
    }
    const m2 = filtered.filter(p => p._status === 'construction_m2');
    if (m2.length > 0) {
      const v = m2.reduce((s, p) => s + p._backlog, 0);
      list.push({ kind: 'info', icon: '🏗️',
        title: `มี ${m2.length} โครงการที่อยู่ระหว่างก่อสร้างงวด 2`,
        body: `มูลค่าคงเหลือ ${fmtMoney(v)} บาท`,
      });
    }
    const closed = filtered.filter(p => p._status === 'closed');
    if (closed.length > 0) {
      list.push({ kind: 'good', icon: '✅',
        title: `${closed.length} โครงการปิดแล้ว`,
        body: `รับเงินครบ — ขอบคุณทีมที่บริหารจบดี`,
      });
    }
    return list;
  }, [filtered]);

  const toggleSetItem = (key, val) => {
    setFilters(f => {
      const newSet = new Set(f[key]);
      if (newSet.has(val)) newSet.delete(val); else newSet.add(val);
      return { ...f, [key]: newSet };
    });
  };
  const clearFilters = () => setFilters({
    status: new Set(), province: new Set(), type: new Set(), assignee: new Set(), aging: new Set(),
  });
  const activeFilterCount = Object.values(filters).reduce((s, set) => s + set.size, 0);

  // ── Active columns (flat list) based on enabled groups ────────────────
  const activeCols = pjMemo(() => {
    const cols = [];
    COL_GROUPS.forEach(g => {
      if (activeGroups.has(g.key)) {
        g.cols.forEach(c => cols.push({ ...ALL_COLS[c], key: c, group: g.key }));
      }
    });
    return cols;
  }, [activeGroups]);

  const cellValue = (p, key) => {
    switch (key) {
      case 'code': return (
        <div>
          <div style={{ fontWeight: 700, fontFamily: 'ui-monospace', fontSize: 12, color: '#1e40af' }}>{p._code}</div>
          <div style={{ marginTop: 3 }}><StatusPill status={p._status} /></div>
        </div>
      );
      case 'name': return <div style={{ fontSize: 12, lineHeight: 1.35 }}>{p._name}</div>;
      case 'province': return p._province || <span style={{ color: '#94a3b8' }}>—</span>;
      case 'type': return p._type ? <span style={{ fontSize: 10.5, fontWeight: 700, background: '#e0f2fe', color: '#075985', padding: '1px 6px', borderRadius: 4 }}>{p._type}</span> : '—';
      case 'assignee': return p._assignee ? <span style={{ fontSize: 11, background: '#ede9fe', color: '#5b21b6', padding: '1px 6px', borderRadius: 4 }}>{p._assignee}</span> : <span style={{ color: '#94a3b8' }}>ไม่โอน</span>;
      case 'signedDate': return fmtD(p._signedDate);
      case 'start': return fmtD(p._start);
      case 'finish': return fmtD(p._finish);
      case 'contractValue': return <span style={{ fontWeight: 600 }}>{fmtMoney(p._contractValue)}</span>;
      case 'statusDetail': return <StatusPill status={p._status} />;
      case 'milestoneCount': {
        const m = [p['Payment 1 Status'], p['Payment 2 Status'], p['Payment 3 Status']]
          .map(s => isStatusDone(s) ? '●' : '○').join(' ');
        return <span style={{ fontFamily: 'ui-monospace', fontSize: 12 }}>{m}</span>;
      }
      case 'latestDelivery': return fmtD(p['Receive Date3'] || p['Receive Date2'] || p['Receive Date']);
      case 'totalInvoiced': return fmtMoney(p._totalInvoiced);
      case 'totalReceived': return <span style={{ color: '#16a34a', fontWeight: 600 }}>{fmtMoney(p._totalReceived)}</span>;
      case 'outstanding': return p._outstanding ? <span style={{ color: '#dc2626' }}>{fmtMoney(p._outstanding)}</span> : '—';
      case 'backlog': return p._backlog ? fmtMoney(p._backlog) : '—';
      case 'collectionPct': {
        const c = p._collectionPct;
        const col = c >= 90 ? '#16a34a' : c >= 50 ? '#d97706' : c > 0 ? '#dc2626' : '#94a3b8';
        return <span style={{ color: col, fontWeight: 600 }}>{fmtPct(c)}</span>;
      }
      case 'invoiceCount': return p._invoiceCount || '—';
      case 'latestIv': return p._latestInvoice ? <span style={{ fontFamily: 'ui-monospace', fontSize: 11 }}>{p._latestInvoice.ivNo}</span> : '—';
      case 'latestIvAmount': return p._latestInvoice ? fmtMoney(p._latestInvoice.balance) : '—';
      case 'aging': return p._agingBucket
        ? <span style={{ fontSize: 10.5, fontWeight: 700,
              background: p._agingBucket === '90+' ? '#fee2e2' : p._agingBucket === '61-90' ? '#fef3c7' : '#dbeafe',
              color:      p._agingBucket === '90+' ? '#b91c1c' : p._agingBucket === '61-90' ? '#92400e' : '#1e40af',
              padding: '2px 7px', borderRadius: 8 }}>{p._agingBucket}d</span>
        : '—';
      case 'dueDate': return fmtD(p._latestInvoice?.expectedReceive);
      case 'latestFollowUp': return p._latestFollowUp
        ? <div style={{ fontSize: 11, color: '#475569' }} title={p._latestFollowUp.note}>
            <span style={{ color: '#1e40af', fontFamily: 'ui-monospace' }}>{fmtD(p._latestFollowUp.date)}</span>
            {' · '}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', maxWidth: 150, verticalAlign: 'middle' }}>{p._latestFollowUp.note}</span>
          </div>
        : '—';
      default: return '—';
    }
  };

  return (
    <div className={'page' + (fullscreen ? ' pcc-fullscreen' : '')} style={fullscreen ? { padding: 12, maxWidth: 'none' } : {}}>
      {!fullscreen && (
        <ProjectsHero kpi={kpi} totalCount={enriched.length} filteredCount={filtered.length}
          onFullscreen={() => setFullscreen(true)}
          onUpload={userCanEdit ? () => setUploadOpen(true) : null} />
      )}

      {/* Toolbar: search + filter toggle + column groups + fullscreen */}
      <ProjectsToolbar
        query={query} setQuery={setQuery}
        filterOpen={filterOpen} setFilterOpen={setFilterOpen}
        activeFilterCount={activeFilterCount}
        activeGroups={activeGroups} setActiveGroups={setActiveGroups}
        fullscreen={fullscreen} setFullscreen={setFullscreen}
        filteredCount={filtered.length} totalCount={enriched.length}
      />

      <div style={{ display: 'grid', gridTemplateColumns: filterOpen ? '240px 1fr' : '1fr', gap: 14, alignItems: 'start' }}>
        {filterOpen && (
          <FilterPanel
            filters={filters} setFilters={setFilters}
            facets={facets} kpi={kpi} clear={clearFilters}
            toggleSetItem={toggleSetItem}
          />
        )}
        <div style={{ minWidth: 0 }}>
          <ProjectsTable
            rows={filtered}
            cols={activeCols}
            cellValue={cellValue}
            onRowClick={setDrawerProj}
            maxHeight={fullscreen ? 'calc(100vh - 200px)' : '560px'}
          />
        </div>
      </div>

      {!fullscreen && insights.length > 0 && <InsightsSection insights={insights} />}

      {drawerProj && (
        <ProjectDrawer
          project={drawerProj}
          allEnriched={enriched}
          onClose={() => setDrawerProj(null)}
          onSave={(patch) => {
            setData(d => ({ ...d, projects: d.projects.map(p => p.id === drawerProj._id ? { ...p, ...patch } : p) }));
            toast('บันทึกแล้ว');
          }}
        />
      )}

      {uploadOpen && (
        <UploadModal
          existingProjects={data.projects || []}
          onClose={() => { setUploadOpen(false); setUploadDiff(null); }}
          onParsed={setUploadDiff}
          diff={uploadDiff}
          onConfirm={(merged) => {
            setData(d => ({ ...d, projects: merged }));
            toast('อัปเดตข้อมูลโครงการแล้ว · ' + merged.length + ' รายการ');
            setUploadOpen(false); setUploadDiff(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Upload Modal — รับไฟล์ Project Control xlsx ──────────────────────────
function UploadModal({ existingProjects, onClose, onParsed, diff, onConfirm }) {
  const [file, setFile] = pjState(null);
  const [drag, setDrag] = pjState(false);
  const [busy, setBusy] = pjState(false);
  const [error, setError] = pjState('');
  const fileInputRef = pjRef(null);

  const parseFile = async (f) => {
    if (!window.XLSX) { setError('ไม่พบ SheetJS — รีเฟรชหน้า'); return; }
    setBusy(true); setError('');
    try {
      const buf = await f.arrayBuffer();
      const wb = window.XLSX.read(buf, { type: 'array', cellDates: true });
      // หา sheet ที่ชื่อขึ้นต้นด้วย "Main all" (รองรับทุกปี: 67/68/69/...)
      const mainSheets = wb.SheetNames.filter(n => /^Main\s*all/i.test(n));
      if (mainSheets.length === 0) {
        setError('ไม่พบ sheet ที่ชื่อขึ้นต้นด้วย "Main all" ในไฟล์'); setBusy(false); return;
      }
      // รวมข้อมูลจากทุก Main all sheets
      const allRows = [];
      mainSheets.forEach(sn => {
        const ws = wb.Sheets[sn];
        const rows = window.XLSX.utils.sheet_to_json(ws, { defval: null, raw: false });
        rows.forEach(r => allRows.push({ _sheet: sn, ...r }));
      });
      // คำนวณ diff vs existing data
      const existingByCode = {};
      existingProjects.forEach(p => {
        const code = String(p['Contract No.'] || p.code || '').trim();
        if (code) existingByCode[code] = p;
      });
      const isoDate = (v) => {
        if (!v) return '';
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        const s = String(v).trim();
        // dd/mm/yyyy → yyyy-mm-dd
        const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
        if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
        return s;
      };
      // mapping จาก Excel row → project shape ของระบบ
      // เก็บเฉพาะคอลัมน์สำคัญ — คอลัมน์ที่เหลือเก็บไว้ใน p เผื่อใช้ภายหลัง
      const normalize = (r) => {
        const out = { ...r };
        // normalize date fields
        ['Start','Finish','เซ็นสัญญา','แจ้งเข้าดำเนินการ',
         'Receive Date','Receive Date2','Receive Date3',
         'วันที่ส่งมอบงาน งวด 1','วันที่ส่งมอบงาน งวด 2','วันที่ส่งมอบงานงวด 3',
         'วันที่ส่ง นส.มอบงาน งวด 1','วันที่ส่ง นส.มอบงาน งวด 2','วันที่ส่ง นส.มอบงานงวด 3',
         'วันที่เซ็น/รับ ใบตรวจรับ งวดที่ 1','วันที่เซ็น/รับ ใบตรวจรับ งวด 2'
        ].forEach(k => { if (out[k]) out[k] = isoDate(out[k]); });
        // เซ็นสัญญา ใน excel อาจเป็น 1 (flag) หรือ date — เก็บเป็น 1/null ถ้าเป็น flag
        if (typeof out['เซ็นสัญญา'] === 'number') out['เซ็นสัญญา'] = String(out['เซ็นสัญญา']);
        return out;
      };
      const newRows = [], updated = [], unchanged = [];
      const seenCodes = new Set();
      allRows.forEach(r => {
        const code = String(r['Contract No.'] || '').trim();
        if (!code) return;
        if (seenCodes.has(code)) return; // กัน duplicate ข้าม sheet
        seenCodes.add(code);
        const norm = normalize(r);
        const ex = existingByCode[code];
        if (!ex) {
          newRows.push(norm);
        } else {
          // เปรียบเทียบ key fields — ถ้าต่างถือว่า updated
          const watchFields = [
            'Start','Finish','พื้นที่','มูลค่าสัญญาที่เซ็น','เซ็นสัญญา','ยกเลิกโครงการ',
            'Receive Date','Receive Date2','Receive Date3',
            'วันที่ส่งมอบงาน งวด 1','วันที่ส่งมอบงาน งวด 2','วันที่ส่งมอบงานงวด 3',
            'Payment 1 Status','Payment 2 Status','Payment 3 Status',
          ];
          const changes = [];
          watchFields.forEach(f => {
            const oldV = ex[f] != null ? String(ex[f]).trim() : '';
            const newV = norm[f] != null ? String(norm[f]).trim() : '';
            if (oldV !== newV) changes.push({ field: f, oldV, newV });
          });
          if (changes.length > 0) updated.push({ code, name: norm['พื้นที่'] || '', changes, row: norm });
          else unchanged.push({ code });
        }
      });
      onParsed({ newRows, updated, unchanged, totalRead: seenCodes.size });
    } catch (err) {
      console.error(err); setError('อ่านไฟล์ไม่สำเร็จ: ' + (err.message || err));
    } finally { setBusy(false); }
  };

  const onPick = (f) => { setFile(f); parseFile(f); };
  const onDrop = (e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files[0]) onPick(e.dataTransfer.files[0]); };

  const confirm = () => {
    if (!diff) return;
    // build merged projects array: existing + new (เก็บข้อมูลโครงการเดิมไว้ + ปรับ updated)
    const updatedById = {};
    diff.updated.forEach(u => { updatedById[u.code] = u.row; });
    const merged = existingProjects.map(p => {
      const code = String(p['Contract No.'] || p.code || '').trim();
      if (code && updatedById[code]) return { ...p, ...updatedById[code] };
      return p;
    });
    diff.newRows.forEach(r => {
      merged.push({ id: WTPData.newId(), ...r });
    });
    onConfirm(merged);
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 50,
      background: 'rgba(15,23,42,0.45)', display: 'grid', placeItems: 'center',
      padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'white', borderRadius: 12, padding: 22,
        maxWidth: 860, width: '100%', maxHeight: '90vh', overflow: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16 }}>อัปโหลดข้อมูลโครงการ (Project Control)</h3>
            <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 3 }}>
              ระบบจะรวมข้อมูลจาก sheet ที่ขึ้นต้นด้วย <code>Main all</code> ทุกปี · เปรียบเทียบกับ ฐาน DATA · แสดงโครงการใหม่ + ที่อัปเดต
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 0, fontSize: 18, cursor: 'pointer', color: '#64748b' }}>✕</button>
        </div>

        {!diff ? (
          <div className={'pnl-dropzone' + (drag ? ' drag' : '') + (file ? ' has-file' : '')}
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            onDragEnter={(e) => { e.preventDefault(); setDrag(true); }}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={(e) => { e.preventDefault(); setDrag(false); }}
            onDrop={onDrop}
            style={{
              border: '2px dashed ' + (drag ? '#2563eb' : '#cbd5e1'),
              borderRadius: 12, padding: 30, textAlign: 'center', cursor: 'pointer',
              background: drag ? '#eff6ff' : '#f8fafc',
            }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📁</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
              {busy ? 'กำลังประมวลผล…' : file ? `เลือกไฟล์: ${file.name}` : <>ลากไฟล์มาวางที่นี่ หรือ <u>เลือกไฟล์</u></>}
            </div>
            <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 4 }}>
              รองรับ .xlsx (Project Control 67-68-69)
            </div>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" hidden
              onChange={(e) => e.target.files[0] && onPick(e.target.files[0])} />
            {error && <div style={{ marginTop: 10, color: '#dc2626', fontSize: 12 }}>{error}</div>}
          </div>
        ) : (
          <DiffPreview diff={diff} onConfirm={confirm} onReset={() => { onParsed(null); setFile(null); }} />
        )}
      </div>
    </div>
  );
}

function DiffPreview({ diff, onConfirm, onReset }) {
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'อ่านได้รวม',    value: diff.totalRead, color: '#1e40af', bg: '#dbeafe' },
          { label: 'เพิ่มใหม่',      value: diff.newRows.length, color: '#15803d', bg: '#dcfce7' },
          { label: 'อัปเดต',         value: diff.updated.length, color: '#9a3412', bg: '#fef3c7' },
          { label: 'ไม่เปลี่ยน',     value: diff.unchanged.length, color: '#475569', bg: '#f1f5f9' },
        ].map((c, i) => (
          <div key={i} style={{ padding: '10px 14px', background: c.bg, borderRadius: 8 }}>
            <div style={{ fontSize: 10.5, color: c.color, fontWeight: 600 }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {diff.newRows.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 13, color: '#15803d' }}>
            🆕 โครงการใหม่ ({diff.newRows.length})
          </h4>
          <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid #bbf7d0', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead style={{ background: '#f0fdf4', position: 'sticky', top: 0 }}>
                <tr>
                  <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #bbf7d0' }}>Contract No.</th>
                  <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #bbf7d0' }}>พื้นที่</th>
                  <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #bbf7d0' }}>จังหวัด</th>
                  <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #bbf7d0' }}>Start</th>
                </tr>
              </thead>
              <tbody>
                {diff.newRows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f0fdf4' }}>
                    <td style={{ padding: '6px 10px', fontFamily: 'ui-monospace', fontWeight: 600 }}>{r['Contract No.']}</td>
                    <td style={{ padding: '6px 10px' }}>{r['พื้นที่']}</td>
                    <td style={{ padding: '6px 10px' }}>{r['Province']}</td>
                    <td style={{ padding: '6px 10px' }}>{r['Start'] || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {diff.updated.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 13, color: '#9a3412' }}>
            🔄 โครงการที่อัปเดต ({diff.updated.length})
          </h4>
          <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid #fde68a', borderRadius: 8 }}>
            {diff.updated.map((u, i) => (
              <div key={i} style={{ padding: 10, borderBottom: '1px solid #fef3c7' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <strong style={{ fontSize: 12, fontFamily: 'ui-monospace' }}>{u.code}</strong>
                  <span style={{ fontSize: 11, color: '#475569' }}>{u.changes.length} field</span>
                </div>
                <div style={{ fontSize: 11, color: '#475569', marginBottom: 6 }}>{u.name}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {u.changes.slice(0, 5).map((c, j) => (
                    <div key={j} style={{ fontSize: 11 }}>
                      <span style={{ color: '#475569', fontWeight: 600 }}>{c.field}:</span>
                      <span style={{ color: '#94a3b8', textDecoration: 'line-through', marginLeft: 6 }}>{c.oldV || '—'}</span>
                      <span style={{ color: '#16a34a', marginLeft: 6 }}>→ {c.newV || '—'}</span>
                    </div>
                  ))}
                  {u.changes.length > 5 && <div style={{ fontSize: 10.5, color: '#94a3b8' }}>... และอีก {u.changes.length - 5} field</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
        <button onClick={onReset} style={{
          background: 'white', border: '1px solid #cbd5e1', color: '#475569',
          borderRadius: 8, padding: '8px 14px', fontSize: 12, cursor: 'pointer', fontWeight: 600,
        }}>ยกเลิก / เลือกไฟล์ใหม่</button>
        <button onClick={onConfirm} disabled={diff.newRows.length === 0 && diff.updated.length === 0} style={{
          background: '#2563eb', border: 0, color: 'white',
          borderRadius: 8, padding: '8px 16px', fontSize: 12, cursor: 'pointer', fontWeight: 600,
          opacity: diff.newRows.length === 0 && diff.updated.length === 0 ? 0.5 : 1,
        }}>
          ✓ ยืนยันการอัปเดต ({diff.newRows.length + diff.updated.length} รายการ)
        </button>
      </div>
    </div>
  );
}

// ─── Hero / Executive Summary ───────────────────────────────────────────────
function ProjectsHero({ kpi, totalCount, filteredCount, onFullscreen, onUpload }) {
  return (
    <>
      {/* HERO BANNER */}
      <div className="anim-in" style={{
        background: 'linear-gradient(135deg, #1e40af 0%, #1e3a8a 100%)',
        borderRadius: 16, padding: '20px 24px', color: 'white',
        marginBottom: 14, boxShadow: '0 10px 28px rgba(30, 58, 138, 0.18)',
        display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
      }}>
        <div style={{
          width: 52, height: 52, borderRadius: 12, background: 'white',
          display: 'grid', placeItems: 'center', flexShrink: 0,
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" stroke="#1e40af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 10.5, letterSpacing: 1.4, opacity: 0.85, textTransform: 'uppercase', fontWeight: 600 }}>
            Project Control Center
          </div>
          <h1 style={{ fontSize: 24, margin: '3px 0 4px', fontWeight: 700, color: 'white', lineHeight: 1.15 }}>
            จัดการโครงการ
          </h1>
          <div style={{ fontSize: 12.5, opacity: 0.9 }}>
            ติดตามโครงการตั้งแต่ลงนาม → ก่อสร้าง → Invoice → รับชำระ → ปิดโครงการ · รวม {totalCount} โครงการ
            {filteredCount !== totalCount && <span> · กรองอยู่ {filteredCount}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {onUpload && (
            <button onClick={onUpload} style={{
              background: 'white', color: '#1e3a8a',
              border: '1px solid rgba(255,255,255,0.5)', borderRadius: 8,
              padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }} title="นำเข้าไฟล์ Project Control (XLSX)">
              <Icon name="upload" size={13} /> อัปโหลดข้อมูล
            </button>
          )}
          <button onClick={onFullscreen} style={{
            background: 'rgba(255,255,255,0.15)', color: 'white',
            border: '1px solid rgba(255,255,255,0.25)', borderRadius: 8,
            padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            <Icon name="expand" size={13} /> Full Screen
          </button>
        </div>
      </div>

      {/* Row 1: Status counts */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 10, marginBottom: 12,
      }}>
        {[
          { label: 'ทั้งหมด', value: kpi.count, color: '#1e40af', bg: '#dbeafe' },
          { label: 'รอลงนาม', value: kpi.byStatus.waiting_sign || 0, color: '#9a3412', bg: '#ffedd5' },
          { label: 'กำลังก่อสร้าง', value: (kpi.byStatus.construction_m1||0) + (kpi.byStatus.construction_m2||0) + (kpi.byStatus.construction_m3||0), color: '#7c2d12', bg: '#fef3c7' },
          { label: 'รอออก IV',  value: kpi.byStatus.waiting_invoice || 0, color: '#5b21b6', bg: '#ede9fe' },
          { label: 'รอรับชำระ', value: kpi.byStatus.waiting_payment || 0, color: '#1e40af', bg: '#dbeafe' },
          { label: 'บางส่วน',   value: kpi.byStatus.partial_paid || 0,    color: '#155e75', bg: '#cffafe' },
          { label: 'ปิดแล้ว',   value: kpi.byStatus.closed || 0,          color: '#15803d', bg: '#dcfce7' },
          { label: 'ยกเลิก',    value: kpi.byStatus.cancelled || 0,       color: '#7f1d1d', bg: '#fee2e2' },
        ].map((c, i) => (
          <div key={i} style={{
            background: c.bg, borderRadius: 10, padding: '10px 14px',
            border: '1px solid ' + c.color + '20',
          }}>
            <div style={{ fontSize: 10.5, color: c.color, fontWeight: 600, opacity: 0.85, marginBottom: 2 }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Row 2: Value totals + cashflow forecast */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 10, marginBottom: 16,
      }}>
        {[
          { label: 'มูลค่าสัญญารวม',    value: kpi.signedValue,  icon: '📑', accent: '#2563eb' },
          { label: 'งานระหว่างก่อสร้าง', value: kpi.wipValue,     icon: '🏗️', accent: '#d97706' },
          { label: 'มูลค่า Invoice รวม', value: kpi.invoiceValue, icon: '📄', accent: '#7c3aed' },
          { label: 'AR คงค้าง',           value: kpi.arValue,      icon: '⏳', accent: '#dc2626' },
          { label: 'รับเงินแล้ว',         value: kpi.paidValue,    icon: '✅', accent: '#16a34a' },
          { label: 'Backlog คงเหลือ',     value: kpi.backlogValue, icon: '📊', accent: '#0891b2' },
        ].map((c, i) => (
          <div key={i} style={{
            background: 'white', borderRadius: 10, padding: 12,
            borderLeft: '3px solid ' + c.accent,
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 14 }}>{c.icon}</span>
              <span style={{ fontSize: 10.5, color: '#64748b', fontWeight: 500 }}>{c.label}</span>
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{fmtMoney(c.value)}</div>
          </div>
        ))}
      </div>

      {/* Row 3: Cashflow Forecast */}
      <div style={{
        background: 'white', borderRadius: 10, padding: '12px 16px',
        border: '1px solid #e2e8f0', marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14 }}>💵</span>
          <strong style={{ fontSize: 12, color: '#475569' }}>Cashflow Forecast (จาก AR คงค้าง):</strong>
        </div>
        {[
          { label: 'เดือนนี้',     value: kpi.cfMonth },
          { label: '30 วัน',       value: kpi.cf30 },
          { label: '60 วัน',       value: kpi.cf60 },
          { label: '90 วัน',       value: kpi.cf90 },
        ].map((c, i) => (
          <div key={i} style={{ flex: 1, minWidth: 110 }}>
            <div style={{ fontSize: 10.5, color: '#64748b', fontWeight: 500 }}>{c.label}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: c.value > 0 ? '#16a34a' : '#94a3b8' }}>{fmtMoney(c.value)}</div>
          </div>
        ))}
      </div>
    </>
  );
}

// ─── Toolbar (search + filter toggle + column groups) ──────────────────────
function ProjectsToolbar({ query, setQuery, filterOpen, setFilterOpen, activeFilterCount,
                          activeGroups, setActiveGroups, fullscreen, setFullscreen,
                          filteredCount, totalCount }) {
  const [colMenu, setColMenu] = pjState(false);
  return (
    <div style={{
      background: 'white', borderRadius: 10, padding: '10px 14px',
      border: '1px solid #e2e8f0', marginBottom: 14,
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
    }}>
      <button onClick={() => setFilterOpen(o => !o)} style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: activeFilterCount > 0 ? '#dbeafe' : 'white',
        color: activeFilterCount > 0 ? '#1e40af' : '#475569',
        border: '1px solid ' + (activeFilterCount > 0 ? '#93c5fd' : '#cbd5e1'),
        borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
      }}>
        <Icon name="filter" size={12} /> ตัวกรอง
        {activeFilterCount > 0 && <span style={{ background: '#2563eb', color: 'white', padding: '0 6px', borderRadius: 8, fontSize: 10 }}>{activeFilterCount}</span>}
      </button>

      <div style={{ flex: 1, minWidth: 220, maxWidth: 480, position: 'relative' }}>
        <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>🔍</span>
        <input value={query} onChange={e => setQuery(e.target.value)}
          placeholder="ค้นหา: เลขสัญญา / ชื่อโครงการ / IV / จังหวัด"
          style={{
            width: '100%', padding: '7px 12px 7px 32px', fontSize: 12.5,
            border: '1px solid #cbd5e1', borderRadius: 8, outline: 'none',
          }} />
      </div>

      <div style={{ position: 'relative' }}>
        <button onClick={() => setColMenu(m => !m)} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'white', color: '#475569',
          border: '1px solid #cbd5e1', borderRadius: 8, padding: '6px 12px',
          fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}>
          📊 คอลัมน์ <span style={{ background: '#f1f5f9', padding: '0 6px', borderRadius: 8 }}>{activeGroups.size}/{COL_GROUPS.length}</span>
        </button>
        {colMenu && (
          <div style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 10,
            background: 'white', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            border: '1px solid #e2e8f0', padding: 8, minWidth: 220,
          }}>
            {COL_GROUPS.map(g => (
              <label key={g.key} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 10px', cursor: 'pointer', fontSize: 12,
                borderRadius: 6,
              }} onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                 onMouseLeave={e => e.currentTarget.style.background = ''}>
                <input type="checkbox" checked={activeGroups.has(g.key)}
                  onChange={() => setActiveGroups(s => {
                    const ns = new Set(s);
                    if (ns.has(g.key)) ns.delete(g.key); else ns.add(g.key);
                    return ns;
                  })} />
                <span>{g.icon}</span>
                <span style={{ flex: 1 }}>{g.label}</span>
                <span style={{ color: '#94a3b8', fontSize: 10 }}>{g.cols.length}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <button onClick={() => setFullscreen(f => !f)} style={{
        background: fullscreen ? '#dbeafe' : 'white', color: '#475569',
        border: '1px solid #cbd5e1', borderRadius: 8, padding: '6px 12px',
        fontSize: 12, fontWeight: 600, cursor: 'pointer',
      }}>
        {fullscreen ? '🗗 ออกจาก Full Screen' : '🗖 Full Screen'}
      </button>

      <div style={{ fontSize: 11, color: '#64748b' }}>
        แสดง {filteredCount} / {totalCount}
      </div>
    </div>
  );
}

// ─── Filter Panel (left side) ──────────────────────────────────────────────
function FilterPanel({ filters, setFilters, facets, kpi, clear, toggleSetItem }) {
  const Section = ({ title, items, filterKey, fmt }) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 200, overflowY: 'auto' }}>
        {items.map(([val, count]) => {
          const active = filters[filterKey].has(val);
          return (
            <label key={val} style={{
              display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
              fontSize: 11.5, padding: '3px 6px', borderRadius: 5,
              background: active ? '#dbeafe' : 'transparent',
              color: active ? '#1e40af' : '#334155',
              fontWeight: active ? 600 : 400,
            }} onMouseEnter={e => !active && (e.currentTarget.style.background = '#f1f5f9')}
               onMouseLeave={e => !active && (e.currentTarget.style.background = 'transparent')}>
              <input type="checkbox" checked={active} onChange={() => toggleSetItem(filterKey, val)}
                style={{ margin: 0 }} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fmt ? fmt(val) : val}</span>
              <span style={{ color: '#94a3b8', fontSize: 10 }}>{count}</span>
            </label>
          );
        })}
      </div>
    </div>
  );

  return (
    <div style={{
      background: 'white', borderRadius: 10, padding: 14,
      border: '1px solid #e2e8f0', maxHeight: 'calc(100vh - 240px)', overflowY: 'auto',
      position: 'sticky', top: 14,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <strong style={{ fontSize: 13, color: '#0f172a' }}>ตัวกรอง</strong>
        <button onClick={clear} style={{
          background: 'none', border: 0, color: '#64748b', cursor: 'pointer', fontSize: 11, padding: 0,
        }}>ล้าง</button>
      </div>

      <Section title="สถานะโครงการ" filterKey="status"
        items={Object.keys(PROJ_STATUS).map(s => [s, kpi.byStatus[s] || 0])}
        fmt={(s) => PROJ_STATUS[s].label} />
      <Section title="จังหวัด" filterKey="province"
        items={Object.entries(facets.provinces).sort((a, b) => b[1] - a[1])} />
      <Section title="ประเภทงาน" filterKey="type"
        items={Object.entries(facets.types).sort((a, b) => b[1] - a[1])} />
      <Section title="ผู้รับโอนสิทธิ์" filterKey="assignee"
        items={Object.entries(facets.assignees).sort((a, b) => b[1] - a[1])} />
      <Section title="Aging ลูกหนี้" filterKey="aging"
        items={[['0-30', 0], ['31-60', 0], ['61-90', 0], ['90+', 0]]} />
    </div>
  );
}

// ─── Main Table ────────────────────────────────────────────────────────────
function ProjectsTable({ rows, cols, cellValue, onRowClick, maxHeight }) {
  return (
    <div style={{
      background: 'white', borderRadius: 10, border: '1px solid #e2e8f0',
      overflow: 'hidden', boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
    }}>
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: cols.reduce((s, c) => s + (c.width || 100), 0) }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: '#f8fafc' }}>
            <tr>
              {cols.map(c => (
                <th key={c.key} style={{
                  padding: '10px 12px', fontSize: 11, fontWeight: 700, color: '#475569',
                  textAlign: c.align || 'left', borderBottom: '1px solid #cbd5e1',
                  whiteSpace: 'nowrap', minWidth: c.width,
                  position: c.sticky ? 'sticky' : undefined,
                  left: c.sticky ? 0 : undefined,
                  background: c.sticky ? '#f8fafc' : undefined,
                  zIndex: c.sticky ? 3 : undefined,
                }}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={cols.length} style={{ padding: 36, textAlign: 'center', color: '#94a3b8' }}>ไม่พบโครงการตามเงื่อนไข</td></tr>
            )}
            {rows.map((p, i) => (
              <tr key={p._id || i} onClick={() => onRowClick(p)} style={{
                cursor: 'pointer', borderBottom: '1px solid #f1f5f9',
              }} onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                 onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                {cols.map(c => (
                  <td key={c.key} style={{
                    padding: '8px 12px', fontSize: 12, color: '#0f172a',
                    textAlign: c.align || 'left', verticalAlign: 'middle',
                    position: c.sticky ? 'sticky' : undefined,
                    left: c.sticky ? 0 : undefined,
                    background: c.sticky ? 'white' : undefined,
                  }}>{cellValue(p, c.key)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Dashboard Intelligence (auto insights) ────────────────────────────────
function InsightsSection({ insights }) {
  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>🤖 Dashboard Intelligence</h3>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>วิเคราะห์อัตโนมัติจากข้อมูลปัจจุบัน</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
        {insights.map((ins, i) => {
          const palette = {
            critical: { bg: '#fef2f2', border: '#fca5a5', accent: '#dc2626' },
            risk:     { bg: '#fffbeb', border: '#fcd34d', accent: '#d97706' },
            good:     { bg: '#f0fdf4', border: '#86efac', accent: '#16a34a' },
            info:     { bg: '#eff6ff', border: '#93c5fd', accent: '#2563eb' },
          }[ins.kind] || { bg: '#f8fafc', border: '#cbd5e1', accent: '#475569' };
          return (
            <div key={i} style={{
              background: palette.bg, border: '1px solid ' + palette.border,
              borderLeft: '4px solid ' + palette.accent,
              borderRadius: 8, padding: '10px 14px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 16 }}>{ins.icon}</span>
                <strong style={{ fontSize: 12.5, color: palette.accent }}>{ins.title}</strong>
              </div>
              <div style={{ fontSize: 11.5, color: '#475569', lineHeight: 1.6 }}>{ins.body}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Project Drawer (right slide-out) ──────────────────────────────────────
function ProjectDrawer({ project, allEnriched, onClose, onSave }) {
  const [tab, setTab] = pjState('overview');
  const p = project;
  if (!p) return null;
  // build timeline events
  const events = [];
  if (p._signedDate) events.push({ date: p._signedDate, type: 'sign', label: 'ลงนามสัญญา', icon: '✍️' });
  if (p['แจ้งเข้าดำเนินการ']) events.push({ date: p['แจ้งเข้าดำเนินการ'], type: 'start', label: 'แจ้งเข้าดำเนินการ', icon: '🚧' });
  if (p['Receive Date'])  events.push({ date: p['Receive Date'],  type: 'm1', label: 'ส่งมอบงวด 1', icon: '📦' });
  if (p['Receive Date2']) events.push({ date: p['Receive Date2'], type: 'm2', label: 'ส่งมอบงวด 2', icon: '📦' });
  if (p['Receive Date3']) events.push({ date: p['Receive Date3'], type: 'm3', label: 'ส่งมอบงวด 3', icon: '📦' });
  (p._invoices || []).forEach(iv => {
    if (iv.invoiceDate) events.push({ date: iv.invoiceDate, type: 'iv', label: 'ออก Invoice ' + iv.ivNo, icon: '📄', amount: iv.balance });
    if (iv.actualReceive?.date) events.push({ date: iv.actualReceive.date, type: 'rc', label: 'รับเงิน ' + iv.ivNo, icon: '💰', amount: iv.actualReceive.amount });
  });
  (p._receipts || []).forEach(r => {
    if (r.receiptDate) events.push({ date: r.receiptDate, type: 'rc', label: 'รับเงิน ' + r.receiptNo, icon: '💰', amount: r.netReceived });
  });
  events.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      background: 'rgba(15,23,42,0.4)',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        position: 'absolute', right: 0, top: 0, bottom: 0,
        width: 'min(560px, 90vw)', background: 'white',
        boxShadow: '-10px 0 30px rgba(15,23,42,0.2)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* HEADER */}
        <div style={{
          padding: 18, borderBottom: '1px solid #e2e8f0',
          background: 'linear-gradient(135deg, #1e40af 0%, #1e3a8a 100%)',
          color: 'white',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 10.5, opacity: 0.8, letterSpacing: 0.6 }}>โครงการ</div>
              <h2 style={{ margin: '4px 0 2px', fontSize: 18, fontWeight: 700, color: 'white' }}>{p._code}</h2>
              <div style={{ fontSize: 12.5, opacity: 0.92 }}>{p._name}</div>
            </div>
            <button onClick={onClose} style={{
              background: 'rgba(255,255,255,0.15)', color: 'white', border: 0,
              borderRadius: 6, padding: '6px 10px', fontSize: 14, cursor: 'pointer', lineHeight: 1,
            }}>✕</button>
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <StatusPill status={p._status} />
            {p._province && <span style={{ fontSize: 10.5, background: 'rgba(255,255,255,0.18)', padding: '3px 8px', borderRadius: 10 }}>📍 {p._province}</span>}
            {p._type && <span style={{ fontSize: 10.5, background: 'rgba(255,255,255,0.18)', padding: '3px 8px', borderRadius: 10 }}>{p._type}</span>}
            {p._assignee && <span style={{ fontSize: 10.5, background: 'rgba(255,255,255,0.18)', padding: '3px 8px', borderRadius: 10 }}>🏦 {p._assignee}</span>}
          </div>
        </div>

        {/* TABS */}
        <div style={{
          display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#f8fafc',
        }}>
          {[['overview', 'ภาพรวม'], ['timeline', 'Timeline'], ['finance', 'การเงิน'], ['invoices', 'Invoice & Receipts']].map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              flex: 1, padding: '10px 14px', fontSize: 12, fontWeight: 600,
              background: tab === k ? 'white' : 'transparent',
              color: tab === k ? '#1e40af' : '#64748b',
              border: 0, borderBottom: '2px solid ' + (tab === k ? '#2563eb' : 'transparent'),
              cursor: 'pointer',
            }}>{label}</button>
          ))}
        </div>

        {/* CONTENT */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
          {tab === 'overview' && <OverviewTab p={p} />}
          {tab === 'timeline' && <TimelineTab events={events} />}
          {tab === 'finance'  && <FinanceTab p={p} />}
          {tab === 'invoices' && <InvoicesTab p={p} />}
        </div>
      </div>
    </div>
  );
}

function OverviewTab({ p }) {
  const Field = ({ label, value }) => (
    <div style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, color: '#0f172a', fontWeight: 500 }}>{value || <span style={{ color: '#cbd5e1' }}>—</span>}</div>
    </div>
  );
  return (
    <div>
      <Field label="ชื่อโครงการ / พื้นที่" value={p._name} />
      <Field label="จังหวัด" value={p._province} />
      <Field label="ประเภทงาน" value={p._type} />
      <Field label="วันที่ลงนามสัญญา" value={fmtD(p._signedDate)} />
      <Field label="แจ้งเข้าดำเนินการ" value={fmtD(p['แจ้งเข้าดำเนินการ'])} />
      <Field label="เริ่มงาน → สิ้นสุด" value={`${fmtD(p._start)} → ${fmtD(p._finish)}`} />
      <Field label="งบประมาณ" value={p._budget ? fmtMoney(p._budget) + ' บาท' : null} />
      <Field label="มูลค่าสัญญา (ไม่รวม VAT)" value={fmtMoney(p._contractValue) + ' บาท'} />
      <Field label="ผู้รับโอนสิทธิ์" value={p._assignee} />
      <Field label="ภาระหนี้" value={p._debt ? fmtMoney(p._debt) + ' บาท' : null} />
      <Field label="Ref.code" value={p._refCode} />
      <Field label="Remark" value={p['Remark']} />
    </div>
  );
}

function TimelineTab({ events }) {
  if (events.length === 0) return <div style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center', padding: 40 }}>ยังไม่มีเหตุการณ์ในไทม์ไลน์</div>;
  return (
    <div style={{ position: 'relative', paddingLeft: 24 }}>
      <div style={{ position: 'absolute', left: 8, top: 8, bottom: 8, width: 2, background: '#e2e8f0' }} />
      {events.map((e, i) => (
        <div key={i} style={{ position: 'relative', marginBottom: 16 }}>
          <div style={{
            position: 'absolute', left: -22, top: 4, width: 16, height: 16,
            borderRadius: 99, background: 'white', border: '2px solid #2563eb',
            display: 'grid', placeItems: 'center', fontSize: 9,
          }}>{e.icon}</div>
          <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'ui-monospace' }}>{fmtD(e.date)}</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{e.label}</div>
          {e.amount && <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>{fmtMoney(e.amount)} บาท</div>}
        </div>
      ))}
    </div>
  );
}

function FinanceTab({ p }) {
  const rows = [
    { label: 'มูลค่าสัญญา (Contract Value)', value: p._contractValue,  color: '#1e40af' },
    { label: 'Invoice ออกแล้วรวม',           value: p._totalInvoiced, color: '#7c3aed' },
    { label: 'รับเงินแล้วรวม',               value: p._totalReceived, color: '#16a34a' },
    { label: 'AR คงค้าง (Outstanding)',     value: p._outstanding,   color: '#dc2626' },
    { label: 'Backlog (รอออก IV)',          value: p._backlog,       color: '#d97706' },
  ];
  return (
    <div>
      {rows.map((r, i) => (
        <div key={i} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 0', borderBottom: '1px solid #f1f5f9',
        }}>
          <span style={{ fontSize: 12.5, color: '#475569' }}>{r.label}</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: r.color, fontFamily: 'ui-monospace' }}>{fmtMoney(r.value)}</span>
        </div>
      ))}
      <div style={{ marginTop: 20, padding: 14, background: '#f0fdf4', borderRadius: 8, border: '1px solid #86efac' }}>
        <div style={{ fontSize: 11, color: '#15803d', fontWeight: 600, marginBottom: 4 }}>Collection Progress</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, height: 8, background: '#dcfce7', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: Math.min(100, p._collectionPct) + '%', height: '100%', background: '#16a34a', transition: 'width 200ms' }} />
          </div>
          <strong style={{ fontSize: 14, color: '#15803d' }}>{fmtPct(p._collectionPct)}</strong>
        </div>
      </div>
    </div>
  );
}

function InvoicesTab({ p }) {
  const ivs = p._invoices || [];
  const rcs = p._receipts || [];
  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <strong style={{ fontSize: 12, color: '#475569' }}>Invoices ({ivs.length})</strong>
        {ivs.length === 0 && <div style={{ marginTop: 6, fontSize: 12, color: '#94a3b8' }}>ยังไม่มี invoice</div>}
        {ivs.map((iv, i) => (
          <div key={i} style={{ marginTop: 8, padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontFamily: 'ui-monospace', fontWeight: 700, fontSize: 12 }}>{iv.ivNo}</span>
              <span style={{ fontSize: 11, color: '#64748b' }}>{fmtD(iv.invoiceDate)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#475569' }}>งวด {iv.period} · {iv.status}</span>
              <strong style={{ fontSize: 13 }}>{fmtMoney(iv.balance)} ฿</strong>
            </div>
          </div>
        ))}
      </div>

      <div>
        <strong style={{ fontSize: 12, color: '#475569' }}>Receipts ({rcs.length})</strong>
        {rcs.length === 0 && <div style={{ marginTop: 6, fontSize: 12, color: '#94a3b8' }}>ยังไม่ได้รับเงิน</div>}
        {rcs.map((r, i) => (
          <div key={i} style={{ marginTop: 8, padding: 12, background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontFamily: 'ui-monospace', fontWeight: 700, fontSize: 12 }}>{r.receiptNo}</span>
              <span style={{ fontSize: 11, color: '#64748b' }}>{fmtD(r.receiptDate)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#475569' }}>{r.invoiceNo} · งวด {r.period}</span>
              <strong style={{ fontSize: 13, color: '#16a34a' }}>{fmtMoney(r.netReceived || r.grossAmount)} ฿</strong>
            </div>
            {r.transferDeduction > 0 && (
              <div style={{ marginTop: 4, fontSize: 10.5, color: '#94a3b8' }}>
                หักโอนสิทธิ์: {fmtMoney(r.transferDeduction)} (gross {fmtMoney(r.grossAmount)})
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
