// ═══════════════════════════════════════════════════════════════════════════
// Project Control Dashboard — ENGINE
// Utilities (PCU) + derivation from data.projects + column registry + grid engine
// อ้างอิงดีไซน์ Claude Design handoff (Project Control Dashboard.html) ปรับเป็น
// โทนสีสดใส brand-blue ของระบบ + อ่านจาก data.projects (117 คอลัมน์ที่ migrate แล้ว)
// ทุก identifier ขึ้นต้น PC* / pc* เพื่อกัน collision ใน global scope (in-browser Babel)
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  // ── number / date formatting ─────────────────────────────────────────────
  const TH_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const EN_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const TODAY = new Date().toISOString().slice(0, 10);

  const toNum = (v) => {
    if (v == null || v === '' || v === '-') return null;
    const n = parseFloat(String(v).replace(/[,%\s฿]/g, ''));
    return isFinite(n) ? n : null;
  };
  function fmtBaht(n, dec = 0) {
    if (n == null || isNaN(n)) return '—';
    return (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }
  function fmtCompact(n) {
    if (n == null || isNaN(n)) return '—';
    const a = Math.abs(n); let v, suf;
    if (a >= 1e9) { v = n / 1e9; suf = 'B'; }
    else if (a >= 1e6) { v = n / 1e6; suf = 'M'; }
    else if (a >= 1e3) { v = n / 1e3; suf = 'K'; }
    else return Math.round(n).toLocaleString('en-US');
    return v.toLocaleString('en-US', { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 1 }) + suf;
  }
  function isoOf(v) {
    if (!v) return null;
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    const s = String(v).trim();
    let m = s.match(/^(\d{1,2})[\/\-]([A-Za-z]{3})[\/\-](\d{2,4})$/); // 22/May/26
    if (m) {
      const mi = EN_MONTHS.findIndex(x => x.toLowerCase() === m[2].toLowerCase());
      if (mi >= 0) { let y = +m[3]; if (y < 100) y += 2000; return `${y}-${String(mi+1).padStart(2,'0')}-${m[1].padStart(2,'0')}`; }
    }
    m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/); // dd/mm/yyyy
    if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
    if (/^\d{4}-\d{2}(-\d{2})?/.test(s)) return s.length === 7 ? s + '-01' : s.slice(0, 10);
    return null;
  }
  function fmtDate(iso, mode = 'short') {
    if (!iso) return '—';
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d)) return '—';
    const dd = String(d.getDate()).padStart(2, '0');
    const yyBE = d.getFullYear() + 543;
    if (mode === 'long') return `${dd} ${TH_MONTHS[d.getMonth()]} ${yyBE}`;
    return `${dd}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(yyBE).slice(2)}`;
  }
  function daysFromToday(iso) {
    if (!iso) return null;
    return Math.round((new Date(iso) - new Date(TODAY)) / 86400000);
  }
  function addDays(iso, d) {
    if (!iso) return null;
    const dt = new Date(iso + 'T00:00:00Z'); dt.setUTCDate(dt.getUTCDate() + d);
    return dt.toISOString().slice(0, 10);
  }

  // ── status meta (4 main) ──────────────────────────────────────────────────
  const STATUS_META = {
    'Work in progress': { en: 'Work in Progress', th: 'กำลังดำเนินการ', color: '#1f56b8', bg: '#dceaff', dot: '#2a6fdb' },
    'Finish':           { en: 'Finished',         th: 'เสร็จสิ้น',      color: '#15803d', bg: '#dcfce7', dot: '#16a34a' },
    'ยังไม่ลงนาม':       { en: 'Awaiting Signature', th: 'รอลงนาม',     color: '#b45309', bg: '#ffedd5', dot: '#f97316' },
    'ยกเลิก':           { en: 'Cancelled',        th: 'ยกเลิก',        color: '#7f1d1d', bg: '#fee2e2', dot: '#ef4444' },
  };
  // pipeline (sub-status funnel — 15 ตาม spec)
  const SUB_PIPELINE = [
    { th: 'ได้รับจัดสรรงบ', en: 'Budget Allocated' },
    { th: 'ประกาศผู้ชนะ',   en: 'Winner Announced' },
    { th: 'รอลงนาม',        en: 'Awaiting Signature' },
    { th: 'ลงนามแล้ว',      en: 'Contract Signed' },
    { th: 'เริ่มงาน',        en: 'Work Started' },
    { th: 'ดำเนินงาน',       en: 'In Progress' },
    { th: 'ส่งมอบบางส่วน',   en: 'Partial Delivery' },
    { th: 'ส่งมอบครบ',       en: 'Fully Delivered' },
    { th: 'รอตรวจรับ',       en: 'Awaiting Acceptance' },
    { th: 'ตรวจรับบางส่วน',  en: 'Partial Acceptance' },
    { th: 'ตรวจรับครบ',      en: 'Fully Accepted' },
    { th: 'รอรับเงิน',       en: 'Awaiting Payment' },
    { th: 'รับเงินบางส่วน',  en: 'Partial Payment' },
    { th: 'รับเงินครบ',      en: 'Fully Paid' },
    { th: 'ปิดโครงการ',      en: 'Project Closed' },
  ];
  const SUB_ORDER = {}; SUB_PIPELINE.forEach((p, i) => SUB_ORDER[p.th] = i);

  const REGION_EN = { 'เหนือ': 'North', 'ตะวันออกเฉียงเหนือ': 'Northeast', 'ตะวันตก': 'West', 'กลาง': 'Central', 'ตะวันออก': 'East', 'ใต้': 'South' };
  const REGION = {
    'เหนือ': ['เชียงราย','เชียงใหม่','น่าน','พะเยา','แพร่','แม่ฮ่องสอน','ลำปาง','ลำพูน','อุตรดิตถ์'],
    'ตะวันออกเฉียงเหนือ': ['กาฬสินธุ์','ขอนแก่น','ชัยภูมิ','นครพนม','นครราชสีมา','บึงกาฬ','บุรีรัมย์','มหาสารคาม','มุกดาหาร','ยโสธร','ร้อยเอ็ด','เลย','ศรีสะเกษ','สกลนคร','สุรินทร์','หนองคาย','หนองบัวลำภู','อำนาจเจริญ','อุดรธานี','อุบลราชธานี'],
    'ตะวันตก': ['กาญจนบุรี','ตาก','ประจวบคีรีขันธ์','เพชรบุรี','ราชบุรี'],
    'กลาง': ['กรุงเทพมหานคร','กรุงเทพ','กำแพงเพชร','ชัยนาท','นครนายก','นครปฐม','นครสวรรค์','นนทบุรี','ปทุมธานี','พระนครศรีอยุธยา','อยุธยา','พิจิตร','พิษณุโลก','เพชรบูรณ์','ลพบุรี','สมุทรปราการ','สมุทรสงคราม','สมุทรสาคร','สระบุรี','สิงห์บุรี','สุโขทัย','สุพรรณบุรี','อ่างทอง','อุทัยธานี'],
    'ตะวันออก': ['จันทบุรี','ฉะเชิงเทรา','ชลบุรี','ตราด','ปราจีนบุรี','ระยอง','สระแก้ว'],
    'ใต้': ['กระบี่','ชุมพร','ตรัง','นครศรีธรรมราช','นราธิวาส','ปัตตานี','พังงา','พัทลุง','ภูเก็ต','ยะลา','ระนอง','สงขลา','สตูล','สุราษฎร์ธานี'],
  };
  const prov2region = {}; for (const [r, ps] of Object.entries(REGION)) for (const p of ps) prov2region[p] = r;
  const regionOf = (prov) => { if (!prov) return ''; return prov2region[String(prov).replace('จ.', '').trim()] || ''; };

  const BANK_COLORS = { KTB:'#00A4E4', KBANK:'#0F9D58', SCB:'#4E2A84', BBL:'#1B2D6B', BAY:'#FFC400', GSB:'#EC008C', TTB:'#1F4E9D' };
  const CREDITORS = { 'KTB':1, 'WCI+STS':1, 'WCI':1, 'LIT':1, 'Funding':1, 'P2P':1 };
  const CREDITOR_NAMES = { KTB:'ธนาคารกรุงไทย', 'WCI+STS':'WCI + STS', WCI:'WCI', LIT:'LIT', Funding:'Funding', P2P:'P2P' };

  // ── Finance Master persistence (PROJECT_FINANCE_MASTER) ──────────────────
  // เก็บ LG / debt / creditTerm / remark / ผู้รับโอนสิทธิ ที่ฝ่ายการเงินกรอกเอง
  // keyed by contractNo · เก็บใน data.manualOverrides (synced ทุกเครื่อง) เป็น
  // JSON string ต่อโครงการ key = "pcfin.<ContractNo>" + cache localStorage
  // → ไม่ถูกเขียนทับเมื่อ upload Excel (แยกจาก data.projects) · ทีมเห็นเหมือนกัน
  const PC_FIN_KEY = 'wtp-pc-finance-v1';
  const PC_FIN_PREFIX = 'pcfin.';
  function loadFinanceMaster() {
    const out = {};
    // 1) cloud/synced overrides (team-shared) — มาก่อน
    try {
      const ov = (window.WTPOverride && window.WTPOverride._load) ? window.WTPOverride._load() : {};
      for (const k in ov) {
        if (k.indexOf(PC_FIN_PREFIX) === 0) {
          const code = k.slice(PC_FIN_PREFIX.length);
          try { const o = JSON.parse(ov[k]); if (o && typeof o === 'object') out[code] = o; } catch (_) {}
        }
      }
    } catch (_) {}
    // 2) localStorage cache (เครื่องตัวเอง — fallback ช่วง sync ยังไม่มา)
    try {
      const ls = JSON.parse(localStorage.getItem(PC_FIN_KEY) || '{}') || {};
      for (const code in ls) { if (!out[code]) out[code] = ls[code]; }
    } catch (_) {}
    return out;
  }
  function setFinanceField(contractNo, patch) {
    const m = loadFinanceMaster();
    // strip empty string fields เพื่อให้ JSON สะอาด
    const merged = { ...(m[contractNo] || {}), ...patch, updatedAt: TODAY };
    Object.keys(merged).forEach(k => { if (merged[k] === '' || merged[k] == null) delete merged[k]; });
    m[contractNo] = merged;
    // write cloud (synced) — JSON string ต่อโครงการ
    if (window.WTPOverride && window.WTPOverride.setRaw) {
      window.WTPOverride.setRaw(PC_FIN_PREFIX + contractNo, JSON.stringify(merged));
    }
    // write localStorage cache ด้วย (instant + offline)
    try { const ls = JSON.parse(localStorage.getItem(PC_FIN_KEY) || '{}') || {}; ls[contractNo] = merged; localStorage.setItem(PC_FIN_KEY, JSON.stringify(ls)); } catch (_) {}
    return m;
  }

  // ── derive fiscal year ────────────────────────────────────────────────────
  function deriveFy(p) {
    const code = String(p['Contract No.'] || p.code || '');
    let m = code.match(/^(?:XL|WS)-(\d{2})/i); if (m) return +m[1];
    const ref = String(p['Ref.code'] || '');
    m = ref.match(/^(\d{2})\d{2}/); if (m) return +m[1];
    const bud = String(p['งบประมาณ'] || '');
    m = bud.match(/(67|68|69)/); if (m) return +m[1];
    const s = isoOf(p['Start']); if (s) { const y = +s.slice(0, 4) + 543 - 2500; if (y >= 60 && y <= 75) return y; }
    return 0;
  }

  // ── cancellation / sign / etc flags (อิง logic page_projects เดิม) ─────────
  const isCancelledFlag = (v) => {
    if (v == null || v === '') return false;
    if (toNum(v) === 1) return true;
    return /^(❌|❎|✗|✘|x|true|yes)$/i.test(String(v).trim());
  };
  function isCancelled(p) {
    const code = String(p['Contract No.'] || p.code || '').trim();
    if (/^XL-/i.test(code)) return true;
    if (/^[A-Z]{2,5}(-\d{2,4})?$/i.test(code)) return true; // placeholder (AW, AW-68)
    for (const k in p) { if (/ยกเลิก/.test(k) && isCancelledFlag(p[k])) return true; }
    return false;
  }
  const hasSum = (p, n) => toNum(p['Summary Payment ' + n]) > 0;
  const isDelivered = (p, n) =>
    hasSum(p, n) || !!p['วันที่ส่งมอบงาน งวด ' + n] || !!p['Receive Date' + (n === 1 ? '' : n)];
  const isAccepted = (p, n) =>
    !!p['วันที่เซ็น/รับ ใบตรวจรับ งวดที่ ' + n] || !!p['วันที่เซ็น/รับ ใบตรวจรับ งวด ' + n];

  // contract amount (VAT incl, fallback × 1.07)
  function contractAmtOf(p) {
    const vat = toNum(p['มูลค่าสัญญาที่เซ็น (รวมVAT)']) || toNum(p['มูลค่าสัญญาที่เซ็น (รวม VAT)']);
    if (vat > 0) return vat;
    const pre = toNum(p['มูลค่าสัญญาที่เซ็น']) || toNum(p.signedValue);
    return pre > 0 ? Math.round(pre * 1.07 * 100) / 100 : 0;
  }

  // ── installments (รองรับไม่จำกัดงวด) ────────────────────────────────────────
  function buildInstallments(p, contract, fin) {
    const insts = [];
    const creditTerm = (fin && fin.creditTerm != null) ? fin.creditTerm : 30;
    for (let n = 1; n <= 6; n++) {
      let pct = toNum(p['% งวด ' + n]);
      const sumPay = toNum(p['Summary Payment ' + n]);
      const mv = toNum(p['มูลค่า งวด ' + n]);
      if (pct == null && mv == null && sumPay == null && n > 2) break;
      if (pct == null && mv == null && sumPay == null) continue;
      const amount = mv != null ? mv : (pct != null ? Math.round(contract * pct) / 100 : (sumPay || 0));
      if (!amount && !pct) continue;
      const deliveryDate = isoOf(p['วันที่ส่งมอบงาน งวด ' + n]) || isoOf(p['Receive Date' + (n === 1 ? '' : n)]);
      const acceptDate = isoOf(p['วันที่เซ็น/รับ ใบตรวจรับ งวดที่ ' + n]) || isoOf(p['วันที่เซ็น/รับ ใบตรวจรับ งวด ' + n]);
      const delivered = isDelivered(p, n);
      const paid = isDelivered(p, n) && /done|paid|รับ/i.test(String(p['Payment ' + n + ' Status'] || ''));
      // forecast: acceptDate||deliveryDate + creditTerm
      let forecastDate = null;
      if (!paid && amount > 0) {
        const base = acceptDate || deliveryDate;
        if (base) forecastDate = addDays(base, creditTerm);
        else if (delivered) forecastDate = addDays(TODAY, creditTerm);
      }
      insts.push({
        no: n, percent: pct, amount,
        dueDate: isoOf(p['กำหนดส่งมอบงานงวด ' + n]) || null,
        deliveryDate, acceptDate, delivered, paid,
        paymentAmount: paid ? amount : 0,
        forecastDate,
      });
    }
    return insts;
  }

  // ── status engine (main + sub) ─────────────────────────────────────────────
  function deriveStatus(p, contract, received, insts) {
    if (isCancelled(p)) return { main: 'ยกเลิก', sub: 'ยกเลิก' };
    const start = p['Start'] || p.startDate || '';
    const code = String(p['Contract No.'] || p.code || '');
    const signed = !!start || toNum(p['เซ็นสัญญา']) === 1 || /^WS-/i.test(code) === false && insts.some(i => i.delivered);
    const announce = toNum(p['ประกาศผู้ชนะ']) === 1;
    if (/^WS-/i.test(code) || (!start && !insts.some(i => i.delivered) && received === 0)) {
      return { main: 'ยังไม่ลงนาม', sub: announce ? 'ประกาศผู้ชนะ' : 'ได้รับจัดสรรงบ' };
    }
    if (contract > 0 && received >= contract * 0.99) return { main: 'Finish', sub: 'ปิดโครงการ' };

    const reqd = insts.filter(i => i.amount > 0 || i.percent > 0);
    const lastReq = reqd[reqd.length - 1];
    const deliveredCount = reqd.filter(i => i.delivered).length;
    const acceptedCount = reqd.filter(i => i.acceptDate).length;
    const paidCount = reqd.filter(i => i.paid).length;

    // received-based
    if (received > 0 && received < contract) return { main: 'Work in progress', sub: 'รับเงินบางส่วน' };
    // accepted but not paid → รอรับเงิน
    if (reqd.length && acceptedCount >= reqd.length) return { main: 'Work in progress', sub: 'รอรับเงิน' };
    if (acceptedCount > 0 && acceptedCount < reqd.length) return { main: 'Work in progress', sub: 'ตรวจรับบางส่วน' };
    // delivered last installment → รอตรวจรับ / ตรวจรับ
    if (lastReq && lastReq.delivered) {
      if (acceptedCount > 0) return { main: 'Work in progress', sub: 'ตรวจรับบางส่วน' };
      return { main: 'Work in progress', sub: 'รอตรวจรับ' };
    }
    if (deliveredCount > 0) return { main: 'Work in progress', sub: 'ส่งมอบบางส่วน' };
    // signed, no delivery yet
    if (start) return { main: 'Work in progress', sub: 'ดำเนินงาน' };
    return { main: 'Work in progress', sub: 'ลงนามแล้ว' };
  }

  // ── progress % ─────────────────────────────────────────────────────────────
  function deriveProgress(p, status, insts, received, contract) {
    if (status.main === 'ยกเลิก') return 0;
    if (status.main === 'ยังไม่ลงนาม') return 0;
    if (status.main === 'Finish') return 100;
    const reqd = insts.filter(i => i.amount > 0 || i.percent > 0);
    if (reqd.length) {
      let done = 0, total = 0;
      reqd.forEach(i => {
        const w = i.percent != null ? i.percent : (i.amount / (contract || 1) * 100);
        total += w;
        if (i.paid) done += w;
        else if (i.acceptDate) done += w * 0.9;
        else if (i.delivered) done += w * 0.75;
      });
      if (total > 0) return Math.max(5, Math.min(99, Math.round(done / total * 100)));
    }
    if (contract > 0 && received > 0) return Math.max(5, Math.min(99, Math.round(received / contract * 100)));
    return 20;
  }

  // ── MAIN derive ─────────────────────────────────────────────────────────────
  // คืน array ของ project rows (dashboard shape) จาก data.projects + finance master
  function deriveProjects(rawProjects, invoices, receipts) {
    const fin = loadFinanceMaster();
    // index receipts by invoice & by project code
    const rcByIv = {};
    (receipts || []).forEach(rc => { const k = rc.invoiceNo || rc.ivNo; if (k) (rcByIv[k] = rcByIv[k] || []).push(rc); });
    const normCode = (c) => { const s = String(c || '').trim(); const m = s.match(/^(.+?)-[A-Z]{2,6}$/); return m ? m[1] : s; };
    const ivByCode = {};
    (invoices || []).forEach(iv => { const c = normCode(iv.jobNo || iv.contractRef || iv.projectCode || ''); if (c) (ivByCode[c] = ivByCode[c] || []).push(iv); });

    const out = [];
    let gid = 0;
    for (const p of (rawProjects || [])) {
      const contractNo = String(p['Contract No.'] || p.code || '').trim();
      const site = String(p['พื้นที่'] || p.name || '').trim();
      if (!contractNo && !site) continue;
      // ghost row guard (พิมพ์เล่น)
      const ghost = !contractNo.match(/\d/) && !contractAmtOf(p) && !toNum(p['งบประมาณ']) && !p['Start'] && !site;
      if (ghost) continue;

      const contract = contractAmtOf(p);
      const f = fin[contractNo] || {};
      const insts = buildInstallments(p, contract, f);

      // received: receipts via IV chain (gross), fallback to paid installments
      let received = 0;
      const ivs = ivByCode[normCode(contractNo)] || [];
      ivs.forEach(iv => { (rcByIv[iv.ivNo || iv.invoiceNo] || []).forEach(rc => { received += toNum(rc.grossAmount || rc.netReceived) || 0; }); });
      if (!received) received = insts.filter(i => i.paid).reduce((s, i) => s + i.amount, 0);
      received = Math.min(received, contract || received);

      const status = deriveStatus(p, contract, received, insts);
      const progress = deriveProgress(p, status, insts, received, contract);
      const outstandingAR = status.main === 'ยกเลิก' ? 0 : Math.max(0, contract - received);

      // forecast: sum unsettled installments with forecastDate; pick earliest date
      let forecastReceive = 0, forecastDate = null;
      insts.forEach(i => {
        if (i.paid) return;
        if (i.forecastDate) {
          forecastReceive += i.amount;
          if (!forecastDate || i.forecastDate < forecastDate) forecastDate = i.forecastDate;
        }
      });
      if (!forecastReceive && outstandingAR > 0 && status.main === 'Work in progress') {
        forecastReceive = outstandingAR;
        const fin2 = isoOf(p['Finish']);
        forecastDate = (fin2 && fin2 > TODAY) ? fin2 : addDays(TODAY, 30);
      }

      // finance master (manual): assignee, LG, debt, debtDeduction, remark
      const assignee = (f.assignee != null ? f.assignee : (p['ผู้รับโอนสิทธิ์'] || '')) || '';
      let lg = null;
      if (f.lgBank || f.lgAmount) lg = { bank: f.lgBank || '', amount: toNum(f.lgAmount) || 0, status: f.lgStatus || 'active', issue: f.lgIssue || null, expiry: f.lgExpiry || null };
      let debt = null;
      const debtDeduction = toNum(f.debtDeduction) || 0;
      if (CREDITORS[assignee] && contract > 0) {
        const total = toNum(f.outstandingDebt) || contract;
        debt = { creditor: assignee, total, deducted: Math.min(received, total), remaining: Math.max(0, total - received) };
      }
      const forecastDebt = (debt && forecastReceive > 0) ? Math.min(forecastReceive, debtDeduction || Math.round(forecastReceive * 0.85)) : 0;

      out.push({
        id: p.id || ('pc_' + (++gid)),
        _raw: p,
        contractNo, site,
        name: (contractNo && !/^(XL|WS)-/i.test(contractNo) ? contractNo + ' · ' : '') + (site || '—'),
        projectNo: p['Project No.'] || '', tenderNo: p['Tender No.'] || '',
        fy: deriveFy(p),
        type: p['Type'] || '', province: String(p['Province'] || '').replace('จ.', '').trim(),
        region: regionOf(p['Province']), regionEn: REGION_EN[regionOf(p['Province'])] || '',
        customer: p['Customer'] || '', budgetLabel: p['งบประมาณ'] || '', refCode: p['Ref.code'] || '',
        start: isoOf(p['Start']), finish: isoOf(p['Finish']),
        contractAmt: contract, allocation: toNum(p['เงินตามใบจัดสรร']),
        progress, status: status.main, projectStatus: status.sub,
        received, outstandingAR, forecastReceive, forecastDate, forecastDebt,
        forecastNet: forecastReceive - forecastDebt,
        assignee, lg, debt, creditTerm: (f.creditTerm != null ? f.creditTerm : 30), remark: f.remark || (p['Remark'] || ''),
        installments: insts,
        _manualStatus: p.manualStatus || p._manualStatus || '',
      });
    }
    return out;
  }

  // ── aggregations ────────────────────────────────────────────────────────────
  function summarize(rows) {
    const s = { count: rows.length, wip: 0, finish: 0, awaiting: 0, cancelled: 0,
      contractTotal: 0, outstandingAR: 0, received: 0, forecast30: 0, forecast60: 0, forecast90: 0,
      lgTotal: 0, debtTotal: 0, debtRemaining: 0, debtDeducted: 0 };
    for (const r of rows) {
      if (r.status === 'Work in progress') s.wip++;
      else if (r.status === 'Finish') s.finish++;
      else if (r.status === 'ยังไม่ลงนาม') s.awaiting++;
      else if (r.status === 'ยกเลิก') s.cancelled++;
      s.contractTotal += r.contractAmt || 0;
      s.outstandingAR += r.outstandingAR || 0;
      s.received += r.received || 0;
      const dd = daysFromToday(r.forecastDate);
      if (dd != null && dd >= 0) {
        if (dd <= 30) s.forecast30 += r.forecastReceive || 0;
        if (dd <= 60) s.forecast60 += r.forecastReceive || 0;
        if (dd <= 90) s.forecast90 += r.forecastReceive || 0;
      }
      if (r.lg) s.lgTotal += r.lg.amount || 0;
      if (r.debt) { s.debtTotal += r.debt.total; s.debtRemaining += r.debt.remaining; s.debtDeducted += r.debt.deducted; }
    }
    return s;
  }
  function pipelineCounts(rows) {
    const m = {}; SUB_PIPELINE.forEach(p => m[p.th] = 0);
    rows.forEach(r => { if (m[r.projectStatus] != null) m[r.projectStatus]++; });
    return SUB_PIPELINE.map(p => ({ ...p, count: m[p.th] }));
  }
  function cashflowByMonth(rows, year) {
    const months = EN_MONTHS.map((m, i) => ({ month: m, idx: i, gross: 0, debt: 0, net: 0, count: 0 }));
    for (const r of rows) {
      if (!r.forecastDate || !r.forecastReceive) continue;
      const d = new Date(r.forecastDate); if (d.getFullYear() !== year) continue;
      const mo = months[d.getMonth()];
      mo.gross += r.forecastReceive; mo.debt += r.forecastDebt || 0;
      mo.net += r.forecastNet != null ? r.forecastNet : (r.forecastReceive - (r.forecastDebt || 0)); mo.count++;
    }
    return months;
  }
  function forecastYears(rows) {
    const ys = new Set(); rows.forEach(r => { if (r.forecastDate) ys.add(new Date(r.forecastDate).getFullYear()); });
    return [...ys].sort();
  }
  function lgByBank(rows) {
    const m = {};
    rows.forEach(r => { if (!r.lg || !r.lg.bank) return; const b = r.lg.bank;
      if (!m[b]) m[b] = { bank: b, color: BANK_COLORS[b] || '#1f56b8', amount: 0, count: 0, active: 0, expired: 0, released: 0 };
      m[b].amount += r.lg.amount || 0; m[b].count++; m[b][r.lg.status] = (m[b][r.lg.status] || 0) + 1; });
    return Object.values(m).sort((a, b) => b.amount - a.amount);
  }
  function debtByCreditor(rows) {
    const m = {};
    rows.forEach(r => { if (!r.debt) return; const c = r.debt.creditor;
      if (!m[c]) m[c] = { creditor: c, name: CREDITOR_NAMES[c] || c, total: 0, remaining: 0, deducted: 0, count: 0 };
      m[c].total += r.debt.total; m[c].remaining += r.debt.remaining; m[c].deducted += r.debt.deducted; m[c].count++; });
    return Object.values(m).sort((a, b) => b.total - a.total);
  }

  // ── export ────────────────────────────────────────────────────────────────
  function exportCSV(rows, columns, filename) {
    const head = columns.map(c => '"' + c.label.replace(/"/g, '""') + '"').join(',');
    const body = rows.map(r => columns.map(c => {
      let v = c.value ? c.value(r) : '';
      if (v == null) v = ''; v = String(v).replace(/"/g, '""');
      return '"' + v + '"';
    }).join(',')).join('\n');
    const csv = '﻿' + head + '\n' + body;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename + '.csv';
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }

  // ── local project snapshot (รอด cloud sync — รักษาคอลัมน์เต็มจาก Excel upload)
  const PC_LOCAL_KEY = 'wtp-proj-control-v2';
  function loadLocalProjects() {
    try { const a = JSON.parse(localStorage.getItem(PC_LOCAL_KEY) || 'null'); return Array.isArray(a) && a.length ? a : null; } catch (_) { return null; }
  }
  function saveLocalProjects(arr) {
    try { localStorage.setItem(PC_LOCAL_KEY, JSON.stringify(arr || [])); } catch (_) {}
  }

  // ── Upload Logic: parse Project Control xlsx → merged projects + stats ──────
  // อ่านทุก sheet "Main all*", map column อัตโนมัติ, merge ตาม Contract No →
  // ชื่อ+ปีงบ → Project No, รักษา id เดิม, ไม่ลบโครงการที่ไม่อยู่ในไฟล์
  // Finance Master (localStorage แยก) ไม่ถูกแตะ
  function parseProjectControl(arrayBuffer, existingProjects) {
    if (!window.XLSX) throw new Error('ไม่พบ SheetJS — รีเฟรชหน้า');
    const wb = window.XLSX.read(arrayBuffer, { type: 'array', cellDates: true, cellStyles: true });
    const mainSheets = wb.SheetNames.filter(n => /^Main\s*all/i.test(n));
    if (!mainSheets.length) throw new Error('ไม่พบ sheet "Main all67/68/69" — ต้องเป็นไฟล์ Project Control ดิบ');

    // 1) เก็บคอลัมน์ทั้งหมด (เรียงตามลำดับที่เจอ)
    const colSet = new Set(); const colOrder = [];
    mainSheets.forEach(sn => {
      const headerRow = window.XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: null })[0] || [];
      headerRow.forEach(h => { const k = String(h || '').trim(); if (k && !colSet.has(k)) { colSet.add(k); colOrder.push(k); } });
    });
    ['ยกเลิกโครงการ', 'มูลค่าสัญญาที่เซ็น (รวมVAT)', '% Progress', 'Tender No.', 'Project No.', 'Customer',
     '% งวด 1', '% งวด 2', 'มูลค่า งวด 1', 'มูลค่า งวด 2', 'Summary Payment 1', 'Summary Payment 2',
    ].forEach(c => { if (!colSet.has(c)) { colSet.add(c); colOrder.push(c); } });

    // 2) อ่านทุก row + normalize keys (trim)
    const allRows = [];
    mainSheets.forEach(sn => {
      const rows = window.XLSX.utils.sheet_to_json(wb.Sheets[sn], { defval: null, raw: false });
      rows.forEach(r => { const norm = { _sheet: sn }; for (const k of Object.keys(r)) norm[String(k).trim()] = r[k]; allRows.push(norm); });
    });

    // 3) merge logic helpers
    const cancelFlag = (r) => { for (const k in r) { if (/ยกเลิก/.test(k) && isCancelledFlag(r[k])) return true; } return false; };
    const ghost = (r) => {
      if (cancelFlag(r)) return false;
      const hasS = (k) => !!String(r[k] != null ? r[k] : '').trim();
      const hasN = (k) => toNum(r[k]) > 0;
      return !(hasN('มูลค่าสัญญาที่เซ็น') || hasN('มูลค่าสัญญาที่เซ็น (รวมVAT)') || hasN('งบประมาณ') ||
        hasS('Start') || hasS('Tender No.') || hasS('Project No.') || hasS('Ref.code') ||
        hasS('เซ็นสัญญา') || hasS('Payment 1 Status') || hasS('Receive Date'));
    };
    const _yr = (s) => { const m = String(s || '').match(/Main\s*all(\d+)/i); return m ? m[1] : 'XX'; };
    const _clean = (name) => String(name || '').trim().replace(/\s+/g, '_').slice(0, 36);
    const CANON = /^[A-Z]{2,5}\d{2,5}(-[A-Z]{2,6})?$/;
    const finalizeCode = (raw, sheet) => { const c = String(raw || '').trim(); if (!c) return ''; if (/^(XL|WS)-/.test(c)) return c; if (CANON.test(c)) return c; return c + '-' + _yr(sheet); };
    const isoDate = (v) => { if (!v) return ''; if (v instanceof Date) return v.toISOString().slice(0, 10);
      const s = String(v).trim(); let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/); if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10); return s; };
    const DATE_COLS = new Set(['Start','Finish','เซ็นสัญญา','แจ้งเข้าดำเนินการ','ประกาศผู้ชนะ','Receive Date','Receive Date2','Receive Date3',
      'วันที่ส่งมอบงาน งวด 1','วันที่ส่งมอบงาน งวด 2','วันที่ส่งมอบงานงวด 3','วันที่เซ็น/รับ ใบตรวจรับ งวดที่ 1','วันที่เซ็น/รับ ใบตรวจรับ งวด 2','กำหนดส่งมอบงานงวด 1']);

    // preserve ids
    const idByCode = {}; let maxId = 0;
    (existingProjects || []).forEach(p => { const c = String(p['Contract No.'] || p.code || '').trim(); if (c && p.id) idByCode[c] = p.id;
      const m = String(p.id || '').match(/proj[_-]?0*(\d+)/i); if (m) maxId = Math.max(maxId, +m[1]); });
    const existingCodes = new Set(Object.keys(idByCode));

    // Phase 1: assign code + skip ghost
    let ghostCount = 0; const pairs = [];
    allRows.forEach(r => {
      let code = String(r['Contract No.'] || '').trim();
      const cancel = cancelFlag(r); const name = String(r['พื้นที่'] || '').trim();
      if (!code) { if (cancel && name) code = 'XL-' + _yr(r._sheet) + '-' + _clean(name); else if (name) code = 'WS-' + _yr(r._sheet) + '-' + _clean(name); else return; }
      else code = finalizeCode(code, r._sheet);
      if (ghost(r)) { ghostCount++; return; }
      pairs.push({ code, row: r, cancel });
    });
    // Phase 2: group by code (merge across sheets, OR cancellation)
    const byCode = {};
    pairs.forEach(({ code, row, cancel }) => {
      if (!byCode[code]) byCode[code] = { row: { ...row }, cancel };
      else { for (const k of Object.keys(row)) if (row[k] != null && row[k] !== '') byCode[code].row[k] = row[k]; if (cancel) byCode[code].cancel = true; }
    });
    // Phase 3: build output
    const outRows = []; let cancelledCount = 0, newCount = 0, preservedCount = 0;
    Object.keys(byCode).forEach(code => {
      const { row: r, cancel } = byCode[code];
      if (cancel) cancelledCount++;
      let id = idByCode[code]; if (id) preservedCount++; else { id = 'proj_' + String(++maxId).padStart(4, '0'); newCount++; }
      const out = { id };
      colOrder.forEach(col => { let v = r[col]; if (v == null) v = ''; else if (DATE_COLS.has(col)) v = isoDate(v); else if (v instanceof Date) v = v.toISOString().slice(0, 10); out[col] = v; });
      out['Contract No.'] = code; if (cancel) out['ยกเลิกโครงการ'] = 1;
      outRows.push(out);
    });
    outRows.sort((a, b) => String(a.id).localeCompare(String(b.id)));

    // merge: existing projects ที่ไม่อยู่ในไฟล์ → คงไว้ (ไม่ลบ)
    const inFile = new Set(outRows.map(r => r['Contract No.']));
    const kept = (existingProjects || []).filter(p => { const c = String(p['Contract No.'] || p.code || '').trim(); return c && !inFile.has(c); });
    const merged = [...outRows, ...kept];

    return { merged, stats: { totalCols: colOrder.length + 1, totalRows: outRows.length, cancelledCount, ghostCount, newCount, preservedCount, keptCount: kept.length } };
  }

  window.PCU = {
    TH_MONTHS, EN_MONTHS, TODAY, toNum, isoOf, addDays,
    fmtBaht, fmtCompact, fmtDate, daysFromToday,
    STATUS_META, SUB_PIPELINE, SUB_ORDER, REGION_EN, BANK_COLORS, CREDITOR_NAMES,
    deriveProjects, summarize, pipelineCounts, cashflowByMonth, forecastYears, lgByBank, debtByCreditor,
    exportCSV, loadFinanceMaster, setFinanceField, contractAmtOf,
    loadLocalProjects, saveLocalProjects, parseProjectControl,
  };
})();

// ═══════════════════════════════════════════════════════════════════════════
// COLUMN REGISTRY + GRID ENGINE (filter / sort) — namespaced PCGrid
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  const U = window.PCU;
  const STATUS_SORT = { 'ยังไม่ลงนาม': 0, 'Work in progress': 1, 'Finish': 2, 'ยกเลิก': 3 };

  function makeColumns() {
    return [
      { id: 'name', label: 'Project Name', th: 'ชื่อโครงการ', type: 'text', width: 290, freezable: true, value: r => r.site || r.name },
      { id: 'contractNo', label: 'Contract No.', th: 'เลขที่สัญญา', type: 'text', width: 110, freezable: true, value: r => r.contractNo },
      { id: 'fy', label: 'Fiscal Year', th: 'ปีงบ', type: 'enum', width: 72, align: 'center', value: r => r.fy ? 'FY' + r.fy : '' },
      { id: 'region', label: 'Region', th: 'ภูมิภาค', type: 'enum', width: 100, value: r => r.regionEn || r.region },
      { id: 'province', label: 'Province', th: 'จังหวัด', type: 'enum', width: 110, value: r => r.province },
      { id: 'type', label: 'Type', th: 'ประเภท', type: 'enum', width: 70, align: 'center', value: r => r.type },
      { id: 'contractAmt', label: 'Contract Amount', th: 'มูลค่าสัญญา', type: 'num', width: 132, align: 'right', value: r => r.contractAmt },
      { id: 'progress', label: 'Progress', th: 'ความคืบหน้า', type: 'num', width: 118, value: r => r.progress },
      { id: 'status', label: 'Status', th: 'สถานะ', type: 'enum', width: 130, value: r => r.status, sortVal: r => STATUS_SORT[r.status] },
      { id: 'projectStatus', label: 'Sub Status', th: 'สถานะย่อย', type: 'enum', width: 150, value: r => r.projectStatus, sortVal: r => U.SUB_ORDER[r.projectStatus] },
      { id: 'outstandingAR', label: 'Outstanding AR', th: 'ยอดค้างรับ', type: 'num', width: 128, align: 'right', value: r => r.outstandingAR },
      { id: 'received', label: 'Received', th: 'รับแล้ว', type: 'num', width: 120, align: 'right', value: r => r.received },
      { id: 'forecastReceive', label: 'Forecast Receive', th: 'คาดว่าจะรับ', type: 'num', width: 130, align: 'right', value: r => r.forecastReceive },
      { id: 'forecastDate', label: 'Forecast Date', th: 'กำหนดรับเงิน', type: 'date', width: 120, align: 'center', value: r => r.forecastDate },
      { id: 'forecastNet', label: 'Net Forecast', th: 'รับสุทธิ', type: 'num', width: 120, align: 'right', value: r => r.forecastNet },
      { id: 'assignee', label: 'Assignee', th: 'ผู้รับโอนสิทธิ', type: 'enum', width: 110, value: r => r.assignee },
      { id: 'lgBank', label: 'LG Bank', th: 'ธนาคาร LG', type: 'enum', width: 90, align: 'center', value: r => r.lg ? r.lg.bank : '' },
      { id: 'lgAmount', label: 'LG Amount', th: 'วงเงิน LG', type: 'num', width: 104, align: 'right', value: r => r.lg ? r.lg.amount : null },
      { id: 'start', label: 'Start', th: 'เริ่มงาน', type: 'date', width: 110, align: 'center', value: r => r.start },
      { id: 'finish', label: 'Finish', th: 'สิ้นสุด', type: 'date', width: 110, align: 'center', value: r => r.finish },
    ];
  }
  const DEFAULT_VISIBLE = ['name', 'contractNo', 'fy', 'type', 'contractAmt', 'progress', 'status', 'projectStatus', 'outstandingAR', 'forecastReceive', 'forecastDate', 'forecastNet'];
  const DEFAULT_FROZEN = ['name', 'contractNo'];

  function rowCondStyle(r, cf) {
    if (!cf) return {};
    if (r.status === 'ยกเลิก') return { background: 'rgba(148,163,184,.10)', color: '#94a3b8' };
    const dd = U.daysFromToday(r.forecastDate);
    if (dd != null && dd < 0 && r.outstandingAR > 0) return { background: 'rgba(239,68,68,.06)' };
    if (r.status === 'Finish' && r.outstandingAR === 0) return { background: 'rgba(22,163,74,.045)' };
    if (r.outstandingAR > 0) return { background: 'rgba(249,115,22,.045)' };
    return {};
  }
  function applyColFilters(rows, cols, colFilters) {
    const cm = Object.fromEntries(cols.map(c => [c.id, c]));
    return rows.filter(r => {
      for (const [cid, f] of Object.entries(colFilters)) {
        if (!f) continue; const c = cm[cid]; if (!c) continue;
        const v = c.value(r);
        if (f.kind === 'set') { if (f.values.length && !f.values.includes(String(v == null ? '' : v))) return false; }
        else if (f.kind === 'text') { if (f.q && !String(v == null ? '' : v).toLowerCase().includes(f.q.toLowerCase())) return false; }
        else if (f.kind === 'num') { const n = v == null ? null : +v;
          if (f.min != null && (n == null || n < f.min)) return false;
          if (f.max != null && (n == null || n > f.max)) return false; }
        else if (f.kind === 'date') { if (f.from && (!v || v < f.from)) return false; if (f.to && (!v || v > f.to)) return false; }
      }
      return true;
    });
  }
  function applySort(rows, cols, sort) {
    if (!sort || !sort.length) return rows;
    const cm = Object.fromEntries(cols.map(c => [c.id, c]));
    const arr = rows.slice();
    arr.sort((a, b) => {
      for (const s of sort) {
        const c = cm[s.id]; if (!c) continue;
        const va = c.sortVal ? c.sortVal(a) : c.value(a);
        const vb = c.sortVal ? c.sortVal(b) : c.value(b);
        let cmp;
        if (c.type === 'num') cmp = (va == null ? -Infinity : +va) - (vb == null ? -Infinity : +vb);
        else if (c.type === 'date') cmp = String(va || '').localeCompare(String(vb || ''));
        else cmp = String(va == null ? '' : va).localeCompare(String(vb == null ? '' : vb), 'th');
        if (cmp !== 0) return s.dir === 'desc' ? -cmp : cmp;
      }
      return 0;
    });
    return arr;
  }
  function distinctValues(rows, col) {
    const set = new Set();
    rows.forEach(r => { const v = col.value(r); set.add(v == null || v === '' ? '' : String(v)); });
    return [...set].sort((a, b) => String(a).localeCompare(String(b), 'th'));
  }

  window.PCGrid = { makeColumns, DEFAULT_VISIBLE, DEFAULT_FROZEN, rowCondStyle, applyColFilters, applySort, distinctValues };
})();
