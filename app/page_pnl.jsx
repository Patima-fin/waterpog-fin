// Water POG — งบกำไรขาดทุน (P&L) · separate add-on page.
// Reads the "ฐาน DATA" sheet tab (via WTPData.fetchSheetRows) and computes the
// income statement entirely in-browser. Upload flow posts a NEW additive Apps
// Script action ('plImportMonth') — it never touches existing endpoints.
//
// Globals reused from the app shell: React, Icon, Modal, KpiTile, fmtNum,
// useToasts, WTPData, WTP_CONFIG, XLSX.
//
// ── Canonical "ฐาน DATA" schema this page expects (1 row per GL account) ──
//   group : one of PL_GROUP_ORDER keys (saleGoods, service, otherIncome,
//           cogs, costService, commission, selling, admin, finance)
//   code  : รหัสบัญชี (GL / ac_code)
//   name  : ชื่อบัญชี
//   m1..m12 : ยอดรายเดือน (number) ของปีบัญชีนั้น
//   (optional) type : ป้าย TYPE เต็ม (ใช้แทน group ได้ — จะ map กลับเป็น group)
//   (optional) year : ปีบัญชี (พ.ศ.)
// ถ้ายังไม่มี column `group`/`type` → ระบบจะเดากลุ่มจาก prefix ของ code
// ถ้าอ่านชีตไม่ได้/ว่าง → แสดงข้อมูลตัวอย่าง (badge "ตัวอย่าง") เพื่อให้เห็น UI

const { useState: plState, useEffect: plEffect, useMemo: plMemo, useRef: plRef } = React;

const PL_SHEET = 'ฐาน DATA';

const PL_MONTHS_TH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

// 9 TYPE labels — ตรงกับบรรทัดในงบ (index = ลำดับใน PL_GROUP_ORDER)
const PL_TYPES = [
  'รายได้จากการขายสินค้า (Reveneue from sale of goods)',
  'รายได้จากการบริการ (Reveneue from service)',
  'รายได้อื่น (Other income)',
  'ต้นทุนขายสินค้า (Cost of goods sold)',
  'ต้นทุนบริการ (Cost of service)',
  'ค่าคอมมิชชั่น (Commission)',
  'ค่าใช้จ่ายในการขาย (Selling expenses)',
  'ค่าใช้จ่ายในการบริหาร (Administrative expenses)',
  'ต้นทุนทางการเงิน (Finance costs)',
];

const PL_GROUP_ORDER = ['saleGoods','service','otherIncome','cogs','costService','commission','selling','admin','finance'];

const PL_GROUP_META = {
  saleGoods:   { line: 'Reveneue from sale of goods',  th: 'รายได้จากการขายสินค้า',      type: 0 },
  service:     { line: 'Reveneue from service',        th: 'รายได้จากการบริการ',          type: 1 },
  otherIncome: { line: 'Other income',                 th: 'รายได้อื่น',                   type: 2 },
  cogs:        { line: 'Cost of goods sold',           th: 'ต้นทุนขายสินค้า',             type: 3 },
  costService: { line: 'Cost of service',              th: 'ต้นทุนบริการ',                 type: 4 },
  commission:  { line: 'Commission',                   th: 'ค่าคอมมิชชั่น',                type: 5 },
  selling:     { line: 'Selling expenses',             th: 'ค่าใช้จ่ายในการขาย',          type: 6 },
  admin:       { line: 'Administrative expenses',      th: 'ค่าใช้จ่ายในการบริหาร',        type: 7 },
  finance:     { line: 'Finance costs',                th: 'ต้นทุนทางการเงิน',             type: 8 },
};
const PL_TYPE_TO_GROUP = {};
PL_GROUP_ORDER.forEach(k => { PL_TYPE_TO_GROUP[PL_TYPES[PL_GROUP_META[k].type]] = k; });

const PL_REVENUE_KEYS = { saleGoods: 1, service: 1, otherIncome: 1 };
const PL_isRevenue = (key) => !!PL_REVENUE_KEYS[key];

// ── number helpers (ported from design — parentheses for negatives) ──
function PL_sum(arr, n) { let s = 0; const lim = (n == null ? arr.length : n); for (let i = 0; i < lim; i++) s += (arr[i] || 0); return s; }
function PL_addArr(a, b) { return a.map((v, i) => (v || 0) + (b[i] || 0)); }
function PL_fmt(v, opt) {
  opt = opt || {};
  if (v === null || v === undefined || isNaN(v)) return '—';
  if (opt.blankZero && Math.abs(v) < 0.005) return '—';
  const neg = v < 0;
  const dec = (opt.dec === undefined) ? 2 : opt.dec;
  const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return neg ? '(' + s + ')' : s;
}
function PL_fmtPct(v, opt) {
  opt = opt || {};
  if (v === null || v === undefined || isNaN(v) || !isFinite(v)) return '—';
  const neg = v < 0;
  const s = Math.abs(v).toFixed(opt.dec === undefined ? 1 : opt.dec) + '%';
  return neg ? '(' + s + ')' : s;
}
const PL_negCls = (v) => (typeof v === 'number' && v < 0) ? ' pnl-neg' : '';

// ── infer group from chart-of-accounts code prefix (fallback only) ──
function PL_inferGroup(code) {
  const s = String(code || '').replace(/[^0-9]/g, '');
  if (!s) return null;
  const p2 = s.slice(0, 2);
  const map = {
    '41': 'saleGoods', '42': 'service', '43': 'service', '49': 'otherIncome',
    '51': 'cogs', '52': 'costService', '53': 'commission',
    '54': 'selling', '55': 'admin', '56': 'finance',
  };
  if (map[p2]) return map[p2];
  if (s[0] === '4') return 'otherIncome';
  if (s[0] === '5') return 'admin';
  return null;
}

// Sample data (design mock) — used ONLY when ฐาน DATA can't be read yet.
const PL_SAMPLE = {
  lastMonth: 4,
  groups: {
    saleGoods:   [17428766.05, 38129318.29, 39416963.70, 33566347.43, 0,0,0,0,0,0,0,0],
    service:     [ 1914212.90,  1884933.35,  1546591.84,  1718591.79, 0,0,0,0,0,0,0,0],
    otherIncome: [  245257.76,   269864.52,  -388345.17,   109361.66, 0,0,0,0,0,0,0,0],
    cogs:        [13328720.46, 29080923.21, 36681133.79, 21037218.98, 0,0,0,0,0,0,0,0],
    costService: [ 1930712.73,  1790991.10,  1067633.80,  1635288.68, 0,0,0,0,0,0,0,0],
    commission:  [ 2280067.83,  1563171.83,  3007320.42,  1824827.56, 0,0,0,0,0,0,0,0],
    selling:     [  983985.43,   948741.28,   802137.10,   959612.65, 0,0,0,0,0,0,0,0],
    admin:       [ 8574563.13, 11571532.94, 11540779.64,  8429023.06, 0,0,0,0,0,0,0,0],
    finance:     [ 4174039.65,  4026281.01,  3786441.08,  4039440.82, 0,0,0,0,0,0,0,0],
  },
};

// ── parse ฐาน DATA rows → { groups:{key:[12]}, accounts:{key:[{code,name,arr}]}, lastMonth } ──
function PL_parseRows(rows) {
  const empty = () => PL_GROUP_ORDER.reduce((o, k) => (o[k] = [0,0,0,0,0,0,0,0,0,0,0,0], o), {});
  const groups = empty();
  const accounts = PL_GROUP_ORDER.reduce((o, k) => (o[k] = [], o), {});
  if (!Array.isArray(rows) || !rows.length) return null;

  // discover month columns from the header keys of the first row
  const keys = Object.keys(rows[0] || {});
  const monthCol = new Array(12).fill(null);
  for (let i = 0; i < 12; i++) {
    const cands = ['m' + (i + 1), 'M' + (i + 1), String(i + 1), PL_MONTHS_TH[i]];
    let found = keys.find(k => cands.indexOf(String(k).trim()) >= 0);
    if (!found) found = keys.find(k => String(k).trim().indexOf(PL_MONTHS_TH[i]) === 0); // "ม.ค. 2569"
    monthCol[i] = found || null;
  }
  const hasAnyMonth = monthCol.some(c => c != null);
  if (!hasAnyMonth) return null;

  // locate group/code/name columns (tolerant to header naming)
  const findKey = (names) => keys.find(k => names.indexOf(String(k).trim().toLowerCase()) >= 0);
  const gKey = findKey(['group', 'กลุ่ม']);
  const tKey = findKey(['type', 'ประเภท', 'ชนิด']);
  const cKey = findKey(['code', 'ac_code', 'รหัส', 'รหัสบัญชี', 'maincode']);
  const nKey = findKey(['name', 'ชื่อบัญชี', 'desc', 'description', 'รายการ']);

  let used = 0;
  rows.forEach(r => {
    const code = cKey ? r[cKey] : '';
    let g = gKey ? String(r[gKey] || '').trim() : '';
    if (!PL_GROUP_META[g]) g = '';
    if (!g && tKey) { const lbl = String(r[tKey] || '').trim(); g = PL_TYPE_TO_GROUP[lbl] || ''; }
    if (!g) g = PL_inferGroup(code);
    if (!g || !PL_GROUP_META[g]) return; // unclassifiable → skip

    const arr = monthCol.map(col => {
      if (!col) return 0;
      const raw = r[col];
      if (raw == null || raw === '') return 0;
      const num = Number(String(raw).replace(/[^0-9.\-]/g, ''));
      return isNaN(num) ? 0 : num;
    });
    if (arr.every(v => v === 0) && (code == null || code === '')) return; // blank row
    groups[g] = PL_addArr(groups[g], arr);
    accounts[g].push({ code: String(code || ''), name: String((nKey ? r[nKey] : '') || ''), arr });
    used++;
  });
  if (!used) return null;

  let lastMonth = 0;
  for (let m = 0; m < 12; m++) {
    if (PL_GROUP_ORDER.some(k => Math.abs(groups[k][m]) > 0.005)) lastMonth = m + 1;
  }
  return { groups, accounts, lastMonth: lastMonth || 1 };
}

// ── compute subtotals (ported verbatim from design PL_compute) ──
function PL_compute(d, lastMonth) {
  const salesRevenue  = PL_addArr(d.saleGoods, d.service);
  const totalRevenue  = PL_addArr(salesRevenue, d.otherIncome);
  const constructCost = PL_addArr(d.cogs, d.costService);
  const totalCost     = PL_addArr(constructCost, d.commission);
  const grossProfit   = totalRevenue.map((v, i) => v - totalCost[i]);
  const gpMargin      = grossProfit.map((v, i) => totalRevenue[i] ? (v / totalRevenue[i] * 100) : NaN);
  const totalSGA      = PL_addArr(PL_addArr(d.selling, d.admin), d.finance);
  const netProfit     = grossProfit.map((v, i) => v - totalSGA[i]);
  const trend = netProfit.map((v, i) => {
    if (i === 0 || netProfit[i - 1] === 0 || i >= lastMonth) return NaN;
    return (v - netProfit[i - 1]) / Math.abs(netProfit[i - 1]) * 100;
  });
  return { salesRevenue, totalRevenue, constructCost, totalCost, grossProfit, gpMargin, totalSGA, netProfit, trend };
}

// ───────────────────────────────────────────────────────────────────────────
function PnLPage({ data, setData, toast }) {
  const [loading, setLoading]   = plState(true);
  const [model, setModel]       = plState(null);  // { groups, accounts, lastMonth }
  const [isSample, setIsSample] = plState(false);
  const [detailKey, setDetailKey] = plState(null); // open group-detail modal
  const [mapOpen, setMapOpen]   = plState(false);   // group-map modal
  const [openGrp, setOpenGrp]   = plState(PL_GROUP_ORDER[0]); // accordion expanded key
  const reportRef = plRef(null);

  // upload state
  const [file, setFile]       = plState(null);
  const [drag, setDrag]       = plState(false);
  const [busy, setBusy]       = plState(false);
  const [newAccts, setNewAccts] = plState(null);   // [{code,name,amount,group}]
  const fileInputRef = plRef(null);

  const userCanEdit = window.WTPAuth ? window.WTPAuth.can('canEdit') : true;

  const loadData = () => {
    setLoading(true);
    if (!window.WTPData || !WTPData.fetchSheetRows) {
      setModel(PL_SAMPLE.groups ? { groups: PL_SAMPLE.groups, accounts: {}, lastMonth: PL_SAMPLE.lastMonth } : null);
      setIsSample(true); setLoading(false); return;
    }
    WTPData.fetchSheetRows(PL_SHEET)
      .then(rows => {
        const parsed = PL_parseRows(rows);
        if (parsed) { setModel(parsed); setIsSample(false); }
        else { setModel({ groups: PL_SAMPLE.groups, accounts: {}, lastMonth: PL_SAMPLE.lastMonth }); setIsSample(true); }
      })
      .catch(() => { setModel({ groups: PL_SAMPLE.groups, accounts: {}, lastMonth: PL_SAMPLE.lastMonth }); setIsSample(true); })
      .finally(() => setLoading(false));
  };
  plEffect(() => { loadData(); }, []);

  const lastMonth = model ? model.lastMonth : 0;
  const groups = model ? model.groups : null;
  const comp = plMemo(() => groups ? PL_compute(groups, lastMonth) : null, [groups, lastMonth]);

  // default month to import = next month after last data
  const [impMonth, setImpMonth] = plState(1);
  const [impAudit, setImpAudit] = plState('PRE-CLOSING');
  plEffect(() => { setImpMonth(Math.min((lastMonth || 0) + 1, 12) || 1); }, [lastMonth]);

  // known account codes (for new-account detection)
  const knownCodes = plMemo(() => {
    const set = new Set();
    if (model && model.accounts) Object.values(model.accounts).forEach(list => list.forEach(a => a.code && set.add(String(a.code).trim())));
    return set;
  }, [model]);

  // ── detail rows for a group (real accounts; sorted desc by YTD) ──
  const detailFor = (key) => {
    const accts = (model && model.accounts && model.accounts[key]) || [];
    const rows = accts.map(a => ({ code: a.code, name: a.name, arr: a.arr, total: PL_sum(a.arr, lastMonth) }))
      .sort((x, y) => Math.abs(y.total) - Math.abs(x.total));
    return { key, ...PL_GROUP_META[key], accounts: rows, total: PL_sum(groups[key], lastMonth) };
  };

  // ── upload handlers ──
  const pickFile = (f) => { if (f) setFile(f); };
  const onDrop = (e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files[0]) pickFile(e.dataTransfer.files[0]); };

  // parse the uploaded workbook → [{code,name,amount}] for the chosen month
  const parseWorkbook = (f) => new Promise((resolve, reject) => {
    if (!window.XLSX) { reject(new Error('ไม่พบไลบรารี SheetJS — รีเฟรชหน้า')); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = window.XLSX.read(e.target.result, { type: 'array', cellDates: false, cellNF: true });
        // prefer a sheet named like DATA INPUT, else first sheet
        const sn = wb.SheetNames.find(n => /data\s*input|input|ฐาน/i.test(n)) || wb.SheetNames[0];
        const ws = wb.Sheets[sn];
        const aoa = window.XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
        if (!aoa.length) { resolve([]); return; }
        // find header row (the one containing a code-ish + amount-ish column)
        let hdrIdx = 0;
        for (let i = 0; i < Math.min(aoa.length, 8); i++) {
          const joined = aoa[i].map(c => String(c || '').toLowerCase()).join('|');
          if (/code|รหัส|ชื่อบัญชี|name|amount|ยอด|จำนวน/.test(joined)) { hdrIdx = i; break; }
        }
        const hdr = aoa[hdrIdx].map(c => String(c || '').trim().toLowerCase());
        const findCol = (names) => hdr.findIndex(h => names.some(n => h === n || h.indexOf(n) >= 0));
        const cCol = findCol(['code', 'ac_code', 'รหัส', 'maincode']);
        const nCol = findCol(['name', 'ชื่อบัญชี', 'desc', 'รายการ']);
        const aCol = findCol(['amount', 'ยอด', 'จำนวน', 'net', 'total']);
        const out = [];
        for (let i = hdrIdx + 1; i < aoa.length; i++) {
          const row = aoa[i];
          const code = cCol >= 0 ? String(row[cCol] || '').trim() : '';
          if (!code) continue;
          const amount = aCol >= 0 ? Number(String(row[aCol] || '').replace(/[^0-9.\-]/g, '')) : 0;
          out.push({ code, name: nCol >= 0 ? String(row[nCol] || '').trim() : '', amount: isNaN(amount) ? 0 : amount });
        }
        resolve(out);
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
    reader.readAsArrayBuffer(f);
  });

  const handleVerify = async () => {
    if (!file) { toast('โปรดเลือกไฟล์ก่อนนำเข้า'); return; }
    setBusy(true);
    try {
      const accts = await parseWorkbook(file);
      if (!accts.length) { toast('ไม่พบรายการบัญชีในไฟล์ — ตรวจหัวคอลัมน์ (code/name/amount)'); setBusy(false); return; }
      const unknown = accts.filter(a => !knownCodes.has(String(a.code).trim()));
      if (unknown.length) {
        setNewAccts(unknown.map(a => ({ ...a, group: PL_inferGroup(a.code) || '' })));
        toast('พบผังบัญชีใหม่ ' + unknown.length + ' รายการ โปรดจัดประเภท');
        setBusy(false);
      } else {
        await postImport(accts, []);
      }
    } catch (err) { toast('ผิดพลาด: ' + err.message); setBusy(false); }
  };

  // POST the new additive action; Apps Script appends to DATA INPUT + aggregates ฐาน DATA
  const postImport = async (accounts, newClassified) => {
    const url = (window.WTP_CONFIG && window.WTP_CONFIG.APPS_SCRIPT_URL) || '';
    if (!url) { toast('ยังไม่ได้ตั้งค่า APPS_SCRIPT_URL'); setBusy(false); return; }
    let sess = null; try { sess = JSON.parse(localStorage.getItem('wtp-session') || 'null'); } catch (_) {}
    const body = {
      action: 'plImportMonth',
      month: Number(impMonth),
      audit: impAudit,
      accounts: accounts.map(a => ({
        code: String(a.code).trim(),
        name: a.name || '',
        amount: Number(a.amount) || 0,
        group: a.group || PL_inferGroup(a.code) || '',
      })),
      newAccounts: (newClassified || []).map(a => ({ code: String(a.code).trim(), name: a.name || '', group: a.group })),
      meta: { user: (sess && sess.username) || 'unknown', displayName: (sess && sess.displayName) || '', role: (sess && sess.role) || '' },
    };
    setBusy(true);
    try {
      const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) }).then(r => r.json());
      if (resp && resp.error) { toast('นำเข้าไม่สำเร็จ: ' + resp.error); }
      else {
        toast('นำเข้าเดือน ' + PL_MONTHS_TH[impMonth - 1] + ' สำเร็จ — กำลังรีเฟรช');
        setNewAccts(null); setFile(null);
        setTimeout(loadData, 1200);   // re-read ฐาน DATA after backend aggregates
      }
    } catch (err) { toast('นำเข้าไม่สำเร็จ: ' + err.message); }
    finally { setBusy(false); }
  };

  const confirmNewAccounts = () => {
    if (!newAccts) return;
    if (newAccts.some(a => !a.group)) { toast('โปรดจัดประเภทให้ครบทุกรายการ'); return; }
    postImport(newAccts, newAccts);
  };

  // ── derived KPI numbers ──
  const k = plMemo(() => {
    if (!comp) return null;
    const revenue = PL_sum(comp.totalRevenue, lastMonth);
    const cost    = PL_sum(comp.totalCost, lastMonth);
    const gp      = PL_sum(comp.grossProfit, lastMonth);
    const net     = PL_sum(comp.netProfit, lastMonth);
    return { revenue, cost, gp, net, gpM: revenue ? gp / revenue * 100 : 0, netM: revenue ? net / revenue * 100 : 0, costM: revenue ? cost / revenue * 100 : 0 };
  }, [comp, lastMonth]);

  const saveImage = () => {
    if (!window.html2canvas || !reportRef.current) { toast('ระบบบันทึกรูปยังไม่พร้อม'); return; }
    toast('กำลังเตรียมรูปภาพรายงาน…');
    window.html2canvas(reportRef.current, { scale: 2, backgroundColor: '#ffffff' }).then(canvas => {
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = 'PnL_' + new Date().toISOString().slice(0, 10) + '.png';
      a.click();
    }).catch(() => toast('บันทึกรูปไม่สำเร็จ'));
  };

  if (loading) {
    return (
      <div className="page">
        <div className="page-head"><div><h1 className="page-title">งบกำไรขาดทุน (P&amp;L)</h1><div className="page-sub">กำลังโหลดข้อมูลจาก ฐาน DATA…</div></div></div>
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--ink-400)' }}>กำลังโหลด…</div>
      </div>
    );
  }

  // ── report rows definition (order matches design) ──
  const d = groups;
  const c = comp;
  const reportRows = [
    { label: 'Reveneue from sale of goods', arr: d.saleGoods,   indent: true, key: 'saleGoods' },
    { label: 'Reveneue from service',       arr: d.service,     indent: true, key: 'service' },
    { label: 'รายได้จากการขาย',             arr: c.salesRevenue, cls: 'pnl-sub' },
    { label: 'Other income',                arr: d.otherIncome, indent: true, key: 'otherIncome' },
    { label: 'รวมรายได้',                   arr: c.totalRevenue, cls: 'pnl-strong' },
    { label: 'Cost of goods sold',          arr: d.cogs,        indent: true, key: 'cogs' },
    { label: 'Cost of service',             arr: d.costService, indent: true, key: 'costService' },
    { label: 'ต้นทุนงานก่อสร้าง',           arr: c.constructCost, cls: 'pnl-sub' },
    { label: 'Commission',                  arr: d.commission,  indent: true, key: 'commission' },
    { label: 'รวมต้นทุนงานก่อสร้าง',         arr: c.totalCost,   cls: 'pnl-strong' },
    { label: 'Gross Profit',                arr: c.grossProfit, cls: 'pnl-gp' },
    { label: '% margin',                    arr: c.gpMargin,    cls: 'pnl-pct', pct: true, totalVal: (PL_sum(c.totalRevenue, lastMonth) ? PL_sum(c.grossProfit, lastMonth) / PL_sum(c.totalRevenue, lastMonth) * 100 : NaN) },
    { label: 'Selling expenses',            arr: d.selling,     indent: true, key: 'selling' },
    { label: 'Administrative expenses',     arr: d.admin,       indent: true, key: 'admin' },
    { label: 'Finance costs',               arr: d.finance,     indent: true, key: 'finance' },
    { label: 'รวมค่าใช้จ่ายขายและบริหาร',    arr: c.totalSGA,    cls: 'pnl-strong' },
    { label: 'Net Profit',                  arr: c.netProfit,   cls: 'pnl-net' },
    { label: 'Trend %',                     arr: c.trend,       cls: 'pnl-pct', pct: true, totalVal: NaN },
  ];

  const renderCell = (v, pct) => {
    const has = true;
    const txt = pct ? PL_fmtPct(v) : PL_fmt(v, { blankZero: true });
    return <td key={Math.random()} className={'pnl-num' + PL_negCls(v)}>{has ? txt : '—'}</td>;
  };

  // budget — annualized actual as a transparent placeholder target (flagged)
  const budgetRows = [
    { name: 'รายได้รวม', actual: k.revenue },
    { name: 'ต้นทุนรวม', actual: k.cost },
    { name: 'กำไรขั้นต้น', actual: k.gp },
    { name: 'ค่าใช้จ่ายขายและบริหาร', actual: PL_sum(c.totalSGA, lastMonth) },
    { name: 'กำไร(ขาดทุน)สุทธิ', actual: k.net },
  ].map(r => {
    const target = lastMonth ? r.actual / lastMonth * 12 : r.actual; // annualize YTD
    const pct = target ? r.actual / target * 100 : 0;
    return { ...r, target, pct };
  });

  return (
    <div className="page pnl-page">
      <div className="page-head anim-in">
        <div>
          <h1 className="page-title">งบกำไรขาดทุน (P&amp;L)
            {isSample && <span className="pnl-badge-sample" title="อ่าน ฐาน DATA ไม่ได้ — แสดงข้อมูลตัวอย่าง">ข้อมูลตัวอย่าง</span>}
          </h1>
          <div className="page-sub">Profit &amp; Loss Statement · สะสมตั้งแต่ต้นปี · ข้อมูลถึงเดือน {PL_MONTHS_TH[Math.max(0, lastMonth - 1)]}</div>
        </div>
        <div className="page-head-r">
          <button className="btn btn-ghost" onClick={() => { setMapOpen(true); }}><Icon name="filter" size={14} /> ผังการจัดกลุ่ม</button>
          <button className="btn btn-ghost" onClick={saveImage}><Icon name="download" size={14} /> บันทึกรูป</button>
          <button className="btn btn-ghost" onClick={() => window.print()}><Icon name="print" size={14} /> พิมพ์ / PDF</button>
        </div>
      </div>

      {/* KPI */}
      <div className="kpi-row" style={{ marginBottom: 18 }}>
        <KpiTile label="รายได้รวม" value={k.revenue} icon="forecast" accent="var(--brand-500)"
          delta={'ยอดสะสม ' + lastMonth + ' เดือน'} deltaKind="neu" />
        <KpiTile label="ต้นทุนรวม" value={k.cost} icon="projects" accent="var(--brand-400)"
          delta={PL_fmtPct(k.costM) + ' ของรายได้'} deltaKind="neu" />
        <KpiTile label="กำไรขั้นต้น (Gross Profit)" value={k.gp} icon="money" accent="var(--good)"
          delta={'Margin ' + PL_fmtPct(k.gpM)} deltaKind={k.gpM >= 0 ? 'up' : 'dn'} />
        <KpiTile label="กำไร(ขาดทุน)สุทธิ" value={k.net} icon={k.net < 0 ? 'arrow_down' : 'arrow_up'}
          accent={k.net < 0 ? 'var(--bad)' : 'var(--warn)'}
          delta={(k.net < 0 ? 'ขาดทุน ' : 'กำไร ') + PL_fmtPct(k.netM)} deltaKind={k.net >= 0 ? 'up' : 'dn'} />
      </div>

      {/* UPLOAD */}
      {userCanEdit && (
        <div className="card pnl-card" style={{ marginBottom: 18 }}>
          <div className="pnl-card-hd"><h3>อัปโหลดข้อมูลรายเดือน</h3><span className="pnl-tag">นำเข้าไฟล์ DATA INPUT เพื่ออัปเดตงบประจำเดือน</span></div>
          <div className="pnl-upload-row">
            <div className={'pnl-dropzone' + (drag ? ' drag' : '') + (file ? ' has-file' : '')}
              onClick={() => fileInputRef.current && fileInputRef.current.click()}
              onDragEnter={(e) => { e.preventDefault(); setDrag(true); }}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDrag(false); }}
              onDrop={onDrop}>
              <div className="pnl-dz-ic"><Icon name="upload" size={22} /></div>
              <div className="pnl-dz-main">{file ? <>เลือกไฟล์แล้ว: <u>{file.name}</u></> : <>ลากไฟล์มาวางที่นี่ หรือ <u>เลือกไฟล์</u></>}</div>
              <div className="pnl-dz-sub">{file ? (file.size / 1024 / 1024).toFixed(2) + ' MB · พร้อมนำเข้า' : 'รองรับ .xlsx, .csv (ชีต DATA INPUT)'}</div>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" hidden
                onChange={(e) => pickFile(e.target.files[0])} />
            </div>
            <div className="pnl-upload-side">
              <label className="pnl-field"><span>เลือกเดือนที่นำเข้า</span>
                <select value={impMonth} onChange={(e) => setImpMonth(Number(e.target.value))}>
                  {PL_MONTHS_TH.map((m, i) => <option key={i} value={i + 1}>{(i + 1)} · {m}</option>)}
                </select>
              </label>
              <label className="pnl-field"><span>สถานะข้อมูล</span>
                <select value={impAudit} onChange={(e) => setImpAudit(e.target.value)}>
                  <option value="PRE-CLOSING">PRE-CLOSING · ยังไม่ตรวจสอบ</option>
                  <option value="AUDITED">AUDITED · ตรวจสอบแล้ว</option>
                </select>
              </label>
              <button className="btn btn-primary" disabled={busy || !file} onClick={handleVerify}>
                <Icon name="check" size={14} /> {busy ? 'กำลังประมวลผล…' : 'ตรวจสอบและนำเข้า'}
              </button>
              <div className="pnl-hint"><Icon name="search" size={13} /> ระบบจะเทียบผังบัญชีกับฐานข้อมูล หากพบบัญชีใหม่จะให้จัดประเภทก่อนบันทึก</div>
            </div>
          </div>
        </div>
      )}

      {/* NEW ACCOUNTS ALERT */}
      {newAccts && (
        <div className="card pnl-alert" style={{ marginBottom: 18 }}>
          <div className="pnl-alert-hd">
            <div className="pnl-alert-ic"><Icon name="filter" size={20} /></div>
            <div style={{ flex: 1 }}>
              <h3>พบผังบัญชีใหม่ที่ยังไม่อยู่ในฐานข้อมูล</h3>
              <p>โปรดจัดประเภท (กลุ่ม) ให้ครบทุกรายการก่อน เพื่อให้คำนวณในงบได้ถูกต้อง</p>
            </div>
            <span className="pnl-pill">{newAccts.length} รายการ</span>
          </div>
          <div className="pnl-tbl-wrap">
            <table className="pnl-tbl">
              <thead><tr><th style={{ width: 120 }}>รหัสบัญชี</th><th>ชื่อบัญชี</th><th className="r" style={{ width: 150 }}>ยอดเดือนนี้</th><th style={{ width: 260 }}>จัดกลุ่ม</th></tr></thead>
              <tbody>
                {newAccts.map((a, i) => (
                  <tr key={i}>
                    <td><span className="pnl-acc-code">{a.code}</span></td>
                    <td>{a.name || <span className="muted">—</span>}</td>
                    <td className={'r pnl-num' + PL_negCls(a.amount)}>{PL_fmt(a.amount)}</td>
                    <td>
                      <select className={'pnl-type-select' + (a.group ? '' : ' unset')} value={a.group}
                        onChange={(e) => setNewAccts(arr => arr.map((x, j) => j === i ? { ...x, group: e.target.value } : x))}>
                        <option value="">— เลือกกลุ่ม —</option>
                        {PL_GROUP_ORDER.map(g => <option key={g} value={g}>{PL_GROUP_META[g].th}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pnl-alert-foot">
            <span className="pnl-note">{newAccts.filter(a => !a.group).length === 0 ? 'จัดกลุ่มครบแล้ว · พร้อมบันทึก' : 'ยังไม่ได้เลือกกลุ่ม ' + newAccts.filter(a => !a.group).length + ' รายการ'}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => { setNewAccts(null); setBusy(false); }}>ยกเลิก</button>
              <button className="btn btn-primary" disabled={busy || newAccts.some(a => !a.group)} onClick={confirmNewAccounts}>
                <Icon name="check" size={14} /> ยืนยันเพิ่มเข้าฐานข้อมูล
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MONTHLY P&L TABLE */}
      <div className="pnl-section-head"><h2>งบกำไรขาดทุนรายเดือน</h2><span className="pnl-tag">หน่วย: บาท</span></div>
      <div className="card pnl-report-card" ref={reportRef}>
        <div className="pnl-report-wrap">
          <table className="pnl-report">
            <thead>
              <tr>
                <th className="label">เดือน</th>
                {PL_MONTHS_TH.map((m, i) => <th key={i} className={i >= lastMonth ? 'pnl-dim' : ''}>{m}</th>)}
                <th className="total">รวมทั้งปี</th>
              </tr>
            </thead>
            <tbody>
              {reportRows.map((row, ri) => {
                const clickable = !!row.key;
                const totVal = row.totalVal !== undefined ? row.totalVal : PL_sum(row.arr, lastMonth);
                const totTxt = row.pct ? PL_fmtPct(totVal) : PL_fmt(totVal);
                return (
                  <tr key={ri} className={(row.cls || '') + (clickable ? ' pnl-clickable' : '')}
                    onClick={clickable ? () => setDetailKey(row.key) : undefined}
                    title={clickable ? 'คลิกดูบัญชีย่อยในกลุ่มนี้' : undefined}>
                    <td className={'label' + (row.indent ? ' pnl-indent' : '')}>
                      {row.label}
                      {clickable && <svg className="pnl-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M9 6l6 6-6 6" /></svg>}
                    </td>
                    {PL_MONTHS_TH.map((_, m) => {
                      const v = row.arr[m];
                      const has = m < lastMonth;
                      const txt = !has ? '—' : (row.pct ? PL_fmtPct(v) : PL_fmt(v, { blankZero: true }));
                      return <td key={m} className={'pnl-num' + (has ? PL_negCls(v) : '') + (has ? '' : ' pnl-dim')}>{txt}</td>;
                    })}
                    <td className={'pnl-num total' + PL_negCls(totVal)}>{totTxt}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* BUDGET vs ACTUAL */}
      <div className="pnl-section-head" style={{ marginTop: 22 }}><h2>เทียบเป้าหมาย (Budget vs Actual)</h2><span className="pnl-tag">* เป้าประมาณการจากค่าเฉลี่ย YTD × 12 (ปรับได้ภายหลัง)</span></div>
      <div className="card pnl-card">
        <table className="pnl-budget">
          <thead><tr><th>รายการ</th><th className="r">เป้าหมาย (Target)</th><th className="r">ผลจริง (Actual)</th><th className="pnl-bar-cell">% สำเร็จ</th></tr></thead>
          <tbody>
            {budgetRows.map((r, i) => {
              const color = r.pct < 0 ? 'red' : (r.pct >= 60 ? 'green' : 'amber');
              const w = Math.max(0, Math.min(100, r.pct));
              return (
                <tr key={i}>
                  <td className="pnl-b-label">{r.name}</td>
                  <td className="r pnl-num">{PL_fmt(r.target)}</td>
                  <td className={'r pnl-num' + PL_negCls(r.actual)}>{PL_fmt(r.actual)}</td>
                  <td className="pnl-bar-cell"><div className="pnl-bar-row"><div className="pnl-bar-track"><div className={'pnl-bar-fill ' + color} style={{ width: w + '%' }} /></div><div className={'pnl-bar-pct' + (r.pct < 0 ? ' pnl-neg' : '')}>{PL_fmtPct(r.pct)}</div></div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="pnl-legend">
          <span><i className="pnl-dot" style={{ background: 'var(--good)' }} /> ≥ 60% เป็นไปตามเป้า</span>
          <span><i className="pnl-dot" style={{ background: 'var(--warn)' }} /> 0–60% ต่ำกว่าเป้า</span>
          <span><i className="pnl-dot" style={{ background: 'var(--bad)' }} /> ขาดทุน / ติดลบ</span>
        </div>
      </div>

      {/* DETAIL MODAL (single group) */}
      <Modal open={!!detailKey} onClose={() => setDetailKey(null)} wide
        title={detailKey ? PL_GROUP_META[detailKey].th + ' — ' + PL_GROUP_META[detailKey].line : ''}>
        {detailKey && (() => {
          const det = detailFor(detailKey);
          return (
            <div style={{ padding: '4px 20px 18px' }}>
              <div className="pnl-type-badge">TYPE: {PL_TYPES[det.type]}</div>
              {det.accounts.length === 0
                ? <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-400)' }}>ยังไม่มีรายการบัญชีย่อยใน ฐาน DATA สำหรับกลุ่มนี้</div>
                : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="pnl-det-tbl" style={{ minWidth: 280 + lastMonth * 92 }}>
                      <thead><tr><th style={{ width: 96 }}>รหัส</th><th>ชื่อบัญชี</th>{PL_MONTHS_TH.slice(0, lastMonth).map((m, i) => <th key={i} className="r">{m}</th>)}<th className="r">รวม</th></tr></thead>
                      <tbody>
                        {det.accounts.map((a, i) => (
                          <tr key={i}>
                            <td><span className="pnl-acc-code">{a.code}</span></td>
                            <td>{a.name || '—'}</td>
                            {a.arr.slice(0, lastMonth).map((v, m) => <td key={m} className={'r pnl-num' + PL_negCls(v)}>{PL_fmt(v, { blankZero: true })}</td>)}
                            <td className={'r pnl-num' + PL_negCls(a.total)}>{PL_fmt(a.total)}</td>
                          </tr>
                        ))}
                        <tr className="pnl-det-total">
                          <td></td><td>รวมกลุ่ม {det.th}</td>
                          {groups[detailKey].slice(0, lastMonth).map((v, m) => <td key={m} className={'r pnl-num' + PL_negCls(v)}>{PL_fmt(v, { blankZero: true })}</td>)}
                          <td className={'r pnl-num' + PL_negCls(det.total)}>{PL_fmt(det.total)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              <div className="pnl-modal-note">หน่วย: บาท · ยอดสะสม {lastMonth} เดือน · คลิกบรรทัดอื่นในงบเพื่อดูกลุ่มถัดไป</div>
            </div>
          );
        })()}
      </Modal>

      {/* GROUP-MAP MODAL (all 9 groups accordion) */}
      <Modal open={mapOpen} onClose={() => setMapOpen(false)} wide title="ผังการจัดกลุ่มบัญชี">
        <div style={{ padding: '4px 20px 18px' }}>
          <div className="pnl-modal-note" style={{ marginTop: 0, marginBottom: 12 }}>ระบบจัดบัญชีแยกประเภท (GL) เข้า 9 กลุ่มตามนี้ — คลิกแต่ละกลุ่มเพื่อดูบัญชีย่อย</div>
          {PL_GROUP_ORDER.map(key => {
            const det = detailFor(key);
            const open = openGrp === key;
            return (
              <div key={key} className={'pnl-grp-acc' + (open ? ' open' : '')}>
                <div className="pnl-grp-hd" onClick={() => setOpenGrp(open ? null : key)}>
                  <span className={'pnl-grp-dot ' + (PL_isRevenue(key) ? 'rev' : 'cost')} />
                  <div style={{ flex: 1, minWidth: 0 }}><div className="pnl-grp-th">{det.th}</div><div className="pnl-grp-line">{det.line}</div></div>
                  <span className="pnl-grp-cnt">{det.accounts.length} บัญชี</span>
                  <span className={'pnl-grp-tot' + PL_negCls(det.total)}>{PL_fmt(det.total)}</span>
                  <svg className="pnl-grp-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M9 6l6 6-6 6" /></svg>
                </div>
                {open && (
                  <div className="pnl-grp-body">
                    {det.accounts.length === 0
                      ? <div style={{ padding: '8px 0', color: 'var(--ink-400)' }}>ยังไม่มีบัญชีย่อยในกลุ่มนี้</div>
                      : (
                        <table className="pnl-det-tbl">
                          <thead><tr><th style={{ width: 92 }}>รหัส</th><th>ชื่อบัญชี</th><th className="r" style={{ width: 130 }}>ยอดสะสม</th></tr></thead>
                          <tbody>
                            {det.accounts.map((a, i) => (
                              <tr key={i}><td><span className="pnl-acc-code">{a.code}</span></td><td>{a.name || '—'}</td><td className={'r pnl-num' + PL_negCls(a.total)}>{PL_fmt(a.total)}</td></tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                  </div>
                )}
              </div>
            );
          })}
          <div className="pnl-modal-note">รวม 9 กลุ่ม · หน่วย: บาท · ยอดสะสม {lastMonth} เดือน</div>
        </div>
      </Modal>
    </div>
  );
}

window.PnLPage = PnLPage;
