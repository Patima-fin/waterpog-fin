// ═══════════════════════════════════════════════════════════════════════════
// INVESTOR DASHBOARD — premium corporate investor presentation (in-app page)
// route #investor · 8 sub-sections · TH/EN · Light/Dark · Present mode · Export
// ข้อมูลจริงดึงจาก data.projects (ผ่าน PCU.deriveProjects) + ราคาผลิตภัณฑ์จริง
// ทุก identifier ขึ้นต้น INV*/inv* กัน global collision (in-browser Babel)
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  const R = window.React;
  const invSt = R.useState, invMemo = R.useMemo, invEff = R.useEffect, invRef = R.useRef;

  // ── product catalog (ราคาจริงจาก "ราคาผลิตภัณฑ์ WATER POG.xlsx") ──────────────
  const INV_PRODUCTS = [
    { code: 'PL',     group: 'POG TANK',    name: 'POG TANK (ใหญ่)',          price: 5400000 },
    { code: 'PLS',    group: 'POG TANK',    name: 'POG TANK (ใหญ่+โซลาร์)',   price: 5550000 },
    { code: 'PM',     group: 'POG TANK',    name: 'POG TANK (กลาง)',          price: 3400000 },
    { code: 'PMS',    group: 'POG TANK',    name: 'POG TANK (กลาง+โซลาร์)',   price: 3549000 },
    { code: 'PS',     group: 'POG TANK',    name: 'POG TANK (เล็ก)',          price: 2370000 },
    { code: 'PSM',    group: 'POG SOLVE',   name: 'POG SOLVE (กลาง)',         price: 3000000 },
    { code: 'PSL',    group: 'POG SOLVE',   name: 'POG SOLVE (ใหญ่)',         price: 4500000 },
    { code: 'PTII+S', group: 'POG TANK II', name: 'POG TANK II Solar Plus',   price: 7320000 },
    { code: 'PTIIS',  group: 'POG TANK II', name: 'POG TANK II Standard',     price: 7170000 },
    { code: 'STII+S', group: 'STANK II',    name: 'STANK II Solar Plus',      price: 5150000 },
    { code: 'STII',   group: 'STANK II',    name: 'STANK II Standard',        price: 5000000 },
    { code: 'PDP',    group: 'POG Drink',   name: 'POG Drink PLUS',           price: 1600000 },
    { code: 'PD',     group: 'POG Drink',   name: 'POG Drink Standard',       price: 1100000 },
    { code: 'PDH',    group: 'POG Drink',   name: 'POG Drink House',          price: 1300000 },
  ];

  // ── i18n ────────────────────────────────────────────────────────────────────
  const T = {
    th: {
      brand: 'Water POG · POG TANKS', tagline: 'นวัตกรรมการผลิตน้ำประปาชุมชนแห่งอนาคต',
      secs: ['ภาพรวมผู้บริหาร', 'ข้อมูลบริษัท', 'ผลิตภัณฑ์และบริการ', 'ผลการดำเนินงาน', 'ลูกค้าและโครงการ', 'โรงงานและการผลิต', 'กลยุทธ์การเติบโต', 'ห้องนักลงทุน'],
      present: 'โหมดนำเสนอ', exit: 'ออก', exportPdf: 'ส่งออก PDF',
      contractValue: 'มูลค่าสัญญารวม', projects: 'โครงการทั้งหมด', received: 'รับเงินแล้ว', backlog: 'งานคงค้าง (Backlog)',
      pipeline: 'งานในมือ (รอลงนาม)', revenue: 'รายได้สะสม', wip: 'งานระหว่างก่อสร้าง', products: 'รุ่นผลิตภัณฑ์',
      byRegion: 'โครงการแยกตามภูมิภาค', byType: 'มูลค่าตามกลุ่มผลิตภัณฑ์', byFy: 'มูลค่าสัญญาตามปีงบ', cashflow: 'คาดการณ์กระแสเงินสด',
      statusFunnel: 'สถานะโครงการ', topProv: 'จังหวัดที่มีโครงการมากสุด', priceList: 'ราคาผลิตภัณฑ์ (บาท)', unit: 'บาท',
      docCenter: 'ศูนย์เอกสาร', uploadPdf: 'อัปโหลด PDF', uploadVideo: 'อัปโหลดวิดีโอ', videoUrl: 'ลิงก์วิดีโอ (YouTube/Drive)',
      gallery: 'แกลเลอรีโครงการ', uploadImg: 'อัปโหลดรูป', search: 'ค้นหา…', noData: 'ยังไม่มีข้อมูล',
    },
    en: {
      brand: 'Water POG · POG TANKS', tagline: 'Future water-supply production innovation for communities',
      secs: ['Executive Summary', 'Company Profile', 'Products & Services', 'Business Performance', 'Customer & Projects', 'Factory & Operations', 'Growth Strategy', 'Investor Room'],
      present: 'Present', exit: 'Exit', exportPdf: 'Export PDF',
      contractValue: 'Total Contract Value', projects: 'Total Projects', received: 'Cash Received', backlog: 'Backlog (AR)',
      pipeline: 'Pipeline (Awaiting Sign)', revenue: 'Cumulative Revenue', wip: 'Work in Progress', products: 'Product Models',
      byRegion: 'Projects by Region', byType: 'Value by Product Group', byFy: 'Contract Value by Fiscal Year', cashflow: 'Cash Flow Forecast',
      statusFunnel: 'Project Status', topProv: 'Top Provinces', priceList: 'Price List (THB)', unit: 'THB',
      docCenter: 'Document Center', uploadPdf: 'Upload PDF', uploadVideo: 'Upload Video', videoUrl: 'Video link (YouTube/Drive)',
      gallery: 'Project Gallery', uploadImg: 'Upload Image', search: 'Search…', noData: 'No data yet',
    },
  };

  // ── theme palettes ──────────────────────────────────────────────────────────
  const PAL = {
    light: { bg: '#eef2f8', card: '#ffffff', card2: '#f7faff', ink: '#0d1f3a', sub: '#5a6b86', line: '#e3e9f2',
      brand: '#1f56b8', brand2: '#2a6fdb', accent: '#0e9f9a', gold: '#b8862b', shadow: '0 10px 30px rgba(20,45,100,.10)' },
    dark: { bg: '#0a1120', card: '#131d33', card2: '#0f1830', ink: '#eaf1fb', sub: '#93a6c4', line: '#243450', brand: '#5b93f3',
      brand2: '#7eacf7', accent: '#33c2bd', gold: '#e0ab4d', shadow: '0 12px 34px rgba(0,0,0,.45)' },
  };

  const invFmt = (n) => (n == null || isNaN(n)) ? '—' : Math.round(n).toLocaleString('en-US');
  const invCompact = (n) => {
    if (n == null || isNaN(n)) return '—'; const a = Math.abs(n);
    if (a >= 1e9) return (n / 1e9).toFixed(2) + 'B'; if (a >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return (n / 1e3).toFixed(0) + 'K'; return String(Math.round(n));
  };

  // ── derive real metrics from system data ─────────────────────────────────────
  function invMetrics(data) {
    const PCU = window.PCU;
    let rows = [];
    try { rows = PCU ? PCU.deriveProjects(data.projects || [], data.invoices || [], data.receipts || []) : []; } catch (_) { rows = []; }
    const active = rows.filter(r => r.status !== 'ยกเลิก');
    const contractTotal = active.reduce((s, r) => s + (r.contractAmt || 0), 0);
    const received = active.reduce((s, r) => s + (r.received || 0), 0);
    const backlog = active.reduce((s, r) => s + (r.outstandingAR || 0), 0);
    const byRegion = {}, byType = {}, byFy = {}, byProv = {}, byStatus = {};
    active.forEach(r => {
      const rg = r.regionEn || r.region || 'อื่นๆ'; byRegion[rg] = (byRegion[rg] || 0) + 1;
      const tp = r.type || '—'; byType[tp] = (byType[tp] || 0) + (r.contractAmt || 0);
      const fy = r.fy ? 'FY' + r.fy : '—'; byFy[fy] = (byFy[fy] || 0) + (r.contractAmt || 0);
      if (r.province) byProv[r.province] = (byProv[r.province] || 0) + 1;
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    });
    // cashflow forecast by month (current year) via PCU
    let cashflow = [];
    try {
      const ys = PCU.forecastYears(active); const y = ys[ys.length - 1] || new Date().getFullYear();
      cashflow = PCU.cashflowByMonth(active, y).map(m => ({ label: m.month, value: m.gross }));
    } catch (_) {}
    // product mix: count active projects per product Type code
    const prodCount = {}; active.forEach(r => { const c = (r.type || '').trim(); if (c) prodCount[c] = (prodCount[c] || 0) + 1; });
    return { rows, active, contractTotal, received, backlog, byRegion, byType, byFy, byProv, byStatus, cashflow, prodCount, count: active.length };
  }

  // ── small UI atoms ────────────────────────────────────────────────────────────
  function InvKpi({ p, label, value, sub, accent }) {
    return R.createElement('div', { style: { background: p.card, border: '1px solid ' + p.line, borderRadius: 16, padding: '18px 20px', boxShadow: p.shadow, position: 'relative', overflow: 'hidden' } },
      R.createElement('div', { style: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: accent || p.brand } }),
      R.createElement('div', { style: { fontSize: 12, color: p.sub, fontWeight: 600 } }, label),
      R.createElement('div', { style: { fontSize: 30, fontWeight: 800, color: p.ink, letterSpacing: '-.5px', marginTop: 6, fontVariantNumeric: 'tabular-nums' } }, value),
      sub ? R.createElement('div', { style: { fontSize: 11.5, color: p.sub, marginTop: 3 } }, sub) : null
    );
  }
  function InvBars({ p, items, color, money }) {
    const max = Math.max(1, ...items.map(i => i.value));
    return R.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 9 } },
      items.map((it, i) => R.createElement('div', { key: i },
        R.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 12, color: p.sub, marginBottom: 3 } },
          R.createElement('span', null, it.label),
          R.createElement('span', { style: { fontWeight: 700, color: p.ink, fontVariantNumeric: 'tabular-nums' } }, money ? '฿' + invCompact(it.value) : invFmt(it.value))),
        R.createElement('div', { style: { height: 9, background: p.card2, borderRadius: 99, overflow: 'hidden' } },
          R.createElement('div', { style: { height: '100%', width: Math.max(2, it.value / max * 100) + '%', background: 'linear-gradient(90deg,' + (color || p.brand) + ',' + p.brand2 + ')', borderRadius: 99 } }))
      ))
    );
  }
  function InvCard({ p, title, children, style }) {
    return R.createElement('div', { style: Object.assign({ background: p.card, border: '1px solid ' + p.line, borderRadius: 16, padding: 20, boxShadow: p.shadow }, style || {}) },
      title ? R.createElement('div', { style: { fontSize: 13.5, fontWeight: 800, color: p.ink, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 } },
        R.createElement('span', { style: { width: 4, height: 15, background: p.brand, borderRadius: 3, display: 'inline-block' } }), title) : null,
      children
    );
  }

  // ── persisted embeds (video URL etc.) via WTPOverride (team-shared) ───────────
  const invGet = (k, d) => { try { return (window.WTPOverride && WTPOverride.resolveRaw) ? WTPOverride.resolveRaw('inv.' + k, d) : ((window.WTPOverride && WTPOverride._load && WTPOverride._load()['inv.' + k]) || d); } catch (_) { return d; } };
  const invSet = (k, v) => { try { window.WTPOverride && WTPOverride.setRaw && WTPOverride.setRaw('inv.' + k, v); } catch (_) {} };

  // ═══════════════════ MAIN PAGE ═══════════════════
  function InvestorDashboard({ data, setData, toast }) {
    const [lang, setLang] = invSt(() => localStorage.getItem('wtp-inv-lang') || 'th');
    const [theme, setTheme] = invSt(() => localStorage.getItem('wtp-inv-theme') || 'light');
    const [sec, setSec] = invSt(0);
    const [present, setPresent] = invSt(false);
    const p = PAL[theme] || PAL.light;
    const tt = T[lang] || T.th;
    const m = invMemo(() => invMetrics(data), [data]);
    invEff(() => { localStorage.setItem('wtp-inv-lang', lang); }, [lang]);
    invEff(() => { localStorage.setItem('wtp-inv-theme', theme); }, [theme]);

    const rootStyle = { background: p.bg, color: p.ink, minHeight: '100vh', margin: present ? 0 : '-16px', padding: present ? '24px 30px' : '16px',
      fontFamily: "'IBM Plex Sans Thai','Sarabun',system-ui,sans-serif", position: present ? 'fixed' : 'relative', inset: present ? 0 : 'auto', zIndex: present ? 900 : 'auto', overflow: present ? 'auto' : 'visible' };

    const SECS = [InvExec, InvCompany, InvProducts, InvPerformance, InvCustomers, InvFactory, InvGrowth, InvRoom];
    const Section = SECS[sec] || InvExec;

    return R.createElement('div', { style: rootStyle, id: 'investor-root' },
      // header
      R.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 16 } },
        R.createElement('div', { style: { width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg,' + p.brand + ',' + p.brand2 + ')', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800, fontSize: 18, flex: '0 0 auto' } }, 'W'),
        R.createElement('div', { style: { lineHeight: 1.2 } },
          R.createElement('div', { style: { fontSize: 19, fontWeight: 800, letterSpacing: '-.3px' } }, 'Investor Dashboard'),
          R.createElement('div', { style: { fontSize: 12, color: p.sub } }, tt.brand + ' · ' + tt.tagline)),
        R.createElement('div', { style: { marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' } },
          invToggle(p, lang === 'th' ? 'TH' : 'EN', () => setLang(lang === 'th' ? 'en' : 'th')),
          invToggle(p, theme === 'light' ? '🌙' : '☀️', () => setTheme(theme === 'light' ? 'dark' : 'light')),
          invToggle(p, '🖨 ' + tt.exportPdf, () => window.print()),
          R.createElement('button', { onClick: () => setPresent(!present), style: { height: 36, padding: '0 14px', borderRadius: 9, border: 'none', background: present ? p.gold : 'linear-gradient(135deg,' + p.brand + ',' + p.brand2 + ')', color: '#fff', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' } }, present ? '✕ ' + tt.exit : '⛶ ' + tt.present))
      ),
      // sub-nav
      R.createElement('div', { className: 'no-print', style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18, borderBottom: '1px solid ' + p.line, paddingBottom: 10 } },
        tt.secs.map((s, i) => R.createElement('button', { key: i, onClick: () => setSec(i),
          style: { padding: '7px 13px', borderRadius: 9, border: '1px solid ' + (sec === i ? 'transparent' : p.line), background: sec === i ? 'linear-gradient(135deg,' + p.brand + ',' + p.brand2 + ')' : p.card, color: sec === i ? '#fff' : p.sub, fontSize: 12.5, fontWeight: sec === i ? 700 : 500, cursor: 'pointer' } },
          (i + 1) + '. ' + s))
      ),
      R.createElement(Section, { p: p, tt: tt, m: m, data: data, lang: lang, toast: toast })
    );
  }
  function invToggle(p, label, onClick) {
    return R.createElement('button', { onClick, style: { height: 36, padding: '0 12px', borderRadius: 9, border: '1px solid ' + p.line, background: p.card, color: p.ink, fontWeight: 600, fontSize: 12.5, cursor: 'pointer' } }, label);
  }
  const grid = (cols, gap) => ({ display: 'grid', gridTemplateColumns: 'repeat(' + cols + ',1fr)', gap: gap || 14 });

  // ── 1. Executive Summary ──────────────────────────────────────────────────────
  function InvExec({ p, tt, m }) {
    const fyItems = Object.keys(m.byFy).sort().map(k => ({ label: k, value: m.byFy[k] }));
    const regItems = Object.keys(m.byRegion).map(k => ({ label: k, value: m.byRegion[k] })).sort((a, b) => b.value - a.value);
    return R.createElement('div', null,
      // hero
      R.createElement('div', { style: { background: 'linear-gradient(135deg,' + p.brand + ',' + p.brand2 + ')', borderRadius: 18, padding: '26px 28px', color: '#fff', marginBottom: 16, boxShadow: p.shadow } },
        R.createElement('div', { style: { fontSize: 13, opacity: .85, fontWeight: 600 } }, tt.contractValue),
        R.createElement('div', { style: { fontSize: 42, fontWeight: 800, letterSpacing: '-1px', marginTop: 4 } }, '฿' + invFmt(m.contractTotal)),
        R.createElement('div', { style: { fontSize: 13, opacity: .9, marginTop: 8 } }, tt.projects + ' ' + invFmt(m.count) + ' · ' + tt.received + ' ฿' + invCompact(m.received) + ' · ' + tt.backlog + ' ฿' + invCompact(m.backlog))),
      R.createElement('div', { style: Object.assign(grid(4), { marginBottom: 16 }) },
        R.createElement(InvKpi, { p, label: tt.projects, value: invFmt(m.count), accent: p.brand }),
        R.createElement(InvKpi, { p, label: tt.received, value: '฿' + invCompact(m.received), accent: p.accent }),
        R.createElement(InvKpi, { p, label: tt.backlog, value: '฿' + invCompact(m.backlog), accent: p.gold }),
        R.createElement(InvKpi, { p, label: tt.products, value: INV_PRODUCTS.length + ' รุ่น', sub: '3 กลุ่มผลิตภัณฑ์', accent: p.brand2 })),
      R.createElement('div', { style: grid(2) },
        R.createElement(InvCard, { p, title: tt.byFy }, R.createElement(InvBars, { p, items: fyItems, money: true })),
        R.createElement(InvCard, { p, title: tt.byRegion }, R.createElement(InvBars, { p, items: regItems, color: p.accent })))
    );
  }

  // ── 2. Company Profile ────────────────────────────────────────────────────────
  function InvCompany({ p, tt, lang }) {
    const facts = lang === 'th' ? [
      ['ชื่อบริษัท', 'บริษัท วอเทอร์ป๊อก จำกัด (Water POG / POG TANKS)'],
      ['ที่ตั้ง', '6/5 หมู่ 3 ต.บ่อผุด อ.เกาะสมุย จ.สุราษฎร์ธานี 84320'],
      ['ธุรกิจ', 'นวัตกรรมระบบผลิตน้ำประปาชุมชน · ขึ้นทะเบียนนวัตกรรมไทย'],
      ['วิสัยทัศน์', 'นวัตกรรมการผลิตน้ำประปาชุมชนแห่งอนาคต'],
      ['กลุ่มผลิตภัณฑ์', 'POG TANK · POG SOLVE · POG Drink'],
    ] : [
      ['Company', 'Water POG Co., Ltd. (POG TANKS)'],
      ['Location', '6/5 Moo 3, Bo Phut, Koh Samui, Surat Thani 84320'],
      ['Business', 'Community water-supply innovation · Registered Thai Innovation'],
      ['Vision', 'Future water-supply production innovation for communities'],
      ['Product lines', 'POG TANK · POG SOLVE · POG Drink'],
    ];
    const props = lang === 'th'
      ? ['ประหยัดพื้นที่ติดตั้ง ~50% เทียบระบบใต้ดินแบบเดิม', 'ผู้ดูแลคนเดียวคุมทั้งระบบ', 'ควบคุม/ติดตามทางไกลด้วย IoT', 'ปรับระบบกรองตามคุณภาพน้ำดิบ', 'ติดตั้งเร็ว · บำรุงรักษาง่าย', 'ประหยัดต้นทุน ~100,000 บาท/โครงการ']
      : ['~50% less installation area vs traditional underground systems', 'Single operator runs the whole system', 'IoT remote monitoring & control', 'Filtration customised to raw-water quality', 'Fast install · easy maintenance', '~100,000 THB savings per project'];
    return R.createElement('div', { style: grid(2) },
      R.createElement(InvCard, { p, title: lang === 'th' ? 'ข้อมูลบริษัท' : 'Company Profile' },
        facts.map((f, i) => R.createElement('div', { key: i, style: { display: 'flex', gap: 12, padding: '9px 0', borderBottom: i < facts.length - 1 ? '1px solid ' + p.line : 'none' } },
          R.createElement('div', { style: { width: 110, color: p.sub, fontSize: 12.5, flex: '0 0 auto' } }, f[0]),
          R.createElement('div', { style: { fontSize: 13, fontWeight: 600 } }, f[1])))),
      R.createElement(InvCard, { p, title: lang === 'th' ? 'จุดเด่นที่สร้างมูลค่า' : 'Value Propositions' },
        R.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
          props.map((v, i) => R.createElement('div', { key: i, style: { display: 'flex', gap: 10, alignItems: 'flex-start' } },
            R.createElement('span', { style: { color: p.accent, fontWeight: 800 } }, '✓'),
            R.createElement('span', { style: { fontSize: 13 } }, v)))))
    );
  }

  // ── 3. Products & Services ────────────────────────────────────────────────────
  function InvProducts({ p, tt, m }) {
    const groups = {}; INV_PRODUCTS.forEach(pr => { (groups[pr.group] = groups[pr.group] || []).push(pr); });
    const typeVal = Object.keys(m.byType).map(k => ({ label: k, value: m.byType[k] })).sort((a, b) => b.value - a.value).slice(0, 10);
    return R.createElement('div', null,
      R.createElement('div', { style: Object.assign(grid(2), { marginBottom: 16 }) },
        R.createElement(InvCard, { p, title: tt.byType }, R.createElement(InvBars, { p, items: typeVal, money: true, color: p.accent })),
        R.createElement(InvCard, { p, title: tt.priceList },
          R.createElement('div', { style: { maxHeight: 280, overflow: 'auto' } },
            INV_PRODUCTS.map((pr, i) => R.createElement('div', { key: i, style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid ' + p.line } },
              R.createElement('div', null, R.createElement('span', { style: { fontWeight: 700, fontSize: 12.5 } }, pr.code), R.createElement('span', { style: { color: p.sub, fontSize: 11.5, marginLeft: 8 } }, pr.name)),
              R.createElement('span', { style: { fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: p.brand } }, '฿' + invFmt(pr.price)))))) ),
      R.createElement('div', { style: grid(3) },
        Object.keys(groups).map(g => R.createElement(InvCard, { p, title: g, key: g },
          groups[g].map((pr, i) => R.createElement('div', { key: i, style: { display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 12.5 } },
            R.createElement('span', null, pr.name + (m.prodCount[pr.code] ? '  ·  ' + m.prodCount[pr.code] + ' โครง' : '')),
            R.createElement('span', { style: { color: p.sub } }, '฿' + invCompact(pr.price)))))))
    );
  }

  // ── 4. Business Performance ───────────────────────────────────────────────────
  function InvPerformance({ p, tt, m }) {
    const cf = m.cashflow.filter(c => c.value > 0);
    const split = [
      { label: tt.received, value: m.received },
      { label: tt.backlog, value: m.backlog },
    ];
    return R.createElement('div', null,
      R.createElement('div', { style: Object.assign(grid(3), { marginBottom: 16 }) },
        R.createElement(InvKpi, { p, label: tt.contractValue, value: '฿' + invCompact(m.contractTotal), accent: p.brand }),
        R.createElement(InvKpi, { p, label: tt.received, value: '฿' + invCompact(m.received), sub: m.contractTotal ? (m.received / m.contractTotal * 100).toFixed(0) + '% ของสัญญา' : '', accent: p.accent }),
        R.createElement(InvKpi, { p, label: tt.backlog, value: '฿' + invCompact(m.backlog), accent: p.gold })),
      R.createElement('div', { style: grid(2) },
        R.createElement(InvCard, { p, title: tt.cashflow + (cf.length ? '' : ' — ' + tt.noData) }, R.createElement(InvBars, { p, items: cf.length ? cf : [{ label: '—', value: 0 }], money: true })),
        R.createElement(InvCard, { p, title: tt.received + ' vs ' + tt.backlog }, R.createElement(InvBars, { p, items: split, money: true, color: p.accent })))
    );
  }

  // ── 5. Customer & Projects ────────────────────────────────────────────────────
  function InvCustomers({ p, tt, m, toast }) {
    const [gallery, setGallery] = invSt([]);
    const prov = Object.keys(m.byProv).map(k => ({ label: k, value: m.byProv[k] })).sort((a, b) => b.value - a.value).slice(0, 12);
    const onImg = (files) => {
      const arr = [];
      [].slice.call(files || []).forEach(f => { if (/^image\//.test(f.type)) arr.push(URL.createObjectURL(f)); });
      if (arr.length) setGallery(g => [...arr, ...g]);
    };
    return R.createElement('div', null,
      R.createElement('div', { style: Object.assign(grid(2), { marginBottom: 16 }) },
        R.createElement(InvCard, { p, title: tt.topProv }, R.createElement(InvBars, { p, items: prov, color: p.brand2 })),
        R.createElement(InvCard, { p, title: tt.statusFunnel },
          R.createElement(InvBars, { p, items: Object.keys(m.byStatus).map(k => ({ label: k, value: m.byStatus[k] })) }))),
      R.createElement(InvCard, { p, title: tt.gallery, style: { marginTop: 16 } },
        R.createElement('label', { style: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 9, background: p.brand, color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', marginBottom: 12 } },
          '📷 ' + tt.uploadImg, R.createElement('input', { type: 'file', accept: 'image/*', multiple: true, style: { display: 'none' }, onChange: e => onImg(e.target.files) })),
        gallery.length ? R.createElement('div', { style: grid(4) }, gallery.map((src, i) => R.createElement('img', { key: i, src, style: { width: '100%', height: 130, objectFit: 'cover', borderRadius: 10, border: '1px solid ' + p.line } })))
          : R.createElement('div', { style: { color: p.sub, fontSize: 12.5, padding: 20, textAlign: 'center' } }, tt.noData + ' — ' + tt.uploadImg))
    );
  }

  // ── 6. Factory & Operations ───────────────────────────────────────────────────
  function InvFactory({ p, tt, lang }) {
    const ops = lang === 'th'
      ? [['ระบบ IoT', 'ควบคุมและติดตามการทำงานทางไกลผ่านอินเทอร์เน็ต'], ['ออกแบบโมดูลาร์', 'ผลิตสำเร็จรูป ติดตั้งเร็ว ใช้พื้นที่น้อย'], ['ระบบกรองปรับได้', 'เลือกชุดกรองตามคุณภาพน้ำดิบของแต่ละพื้นที่'], ['ดูแลง่าย', 'ผู้ปฏิบัติงานคนเดียวดูแลได้ทั้งระบบ']]
      : [['IoT system', 'Remote control & monitoring over the internet'], ['Modular design', 'Prefabricated, fast install, small footprint'], ['Adaptive filtration', 'Filter sets matched to local raw-water quality'], ['Low maintenance', 'A single operator can run the whole system']];
    return R.createElement('div', { style: grid(2) },
      ops.map((o, i) => R.createElement(InvCard, { p, key: i, title: o[0] }, R.createElement('div', { style: { fontSize: 13, color: p.sub, lineHeight: 1.6 } }, o[1]))));
  }

  // ── 7. Growth Strategy ────────────────────────────────────────────────────────
  function InvGrowth({ p, tt, m, lang }) {
    const items = lang === 'th'
      ? ['ขยายฐานลูกค้าองค์กรปกครองส่วนท้องถิ่น (อบต./เทศบาล) ทั่วประเทศ', 'ต่อยอดกลุ่ม POG Drink (น้ำดื่มชุมชน) เป็นรายได้ประจำ', 'ขยายกำลังผลิตและเครือข่ายติดตั้ง/บริการหลังการขาย', 'พัฒนาแพลตฟอร์ม IoT เป็นบริการสมาชิก (Recurring)', 'พันธมิตรสถาบันการเงินเพื่อโมเดลผ่อนชำระ/ลีสซิ่ง']
      : ['Expand local-government (municipality) customer base nationwide', 'Grow POG Drink line into recurring community-water revenue', 'Scale production capacity & install/after-sales network', 'Develop IoT platform into a recurring subscription service', 'Partner with financial institutions for leasing/installment models'];
    return R.createElement('div', null,
      R.createElement('div', { style: Object.assign(grid(3), { marginBottom: 16 }) },
        R.createElement(InvKpi, { p, label: tt.pipeline, value: invFmt(m.byStatus['ยังไม่ลงนาม'] || 0) + ' โครง', accent: p.gold }),
        R.createElement(InvKpi, { p, label: tt.wip, value: invFmt(m.byStatus['Work in progress'] || 0) + ' โครง', accent: p.brand }),
        R.createElement(InvKpi, { p, label: lang === 'th' ? 'เสร็จสิ้น' : 'Finished', value: invFmt(m.byStatus['Finish'] || 0) + ' โครง', accent: p.accent })),
      R.createElement(InvCard, { p, title: lang === 'th' ? 'แผนการเติบโต' : 'Growth Strategy' },
        R.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
          items.map((v, i) => R.createElement('div', { key: i, style: { display: 'flex', gap: 12, alignItems: 'flex-start' } },
            R.createElement('span', { style: { width: 24, height: 24, borderRadius: 7, background: p.brand, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800, flex: '0 0 auto' } }, i + 1),
            R.createElement('span', { style: { fontSize: 13.5, lineHeight: 1.5 } }, v)))))
    );
  }

  // ── 8. Investor Room (document center: PDF + video) ───────────────────────────
  function InvRoom({ p, tt }) {
    const [pdf, setPdf] = invSt(null);
    const [vid, setVid] = invSt(null);
    const [vidUrl, setVidUrl] = invSt(() => invGet('videoUrl', ''));
    const onPdf = (f) => { if (f) setPdf(URL.createObjectURL(f)); };
    const onVid = (f) => { if (f) { setVid(URL.createObjectURL(f)); setVidUrl(''); } };
    const ytEmbed = (u) => {
      const mm = String(u).match(/(?:youtu\.be\/|v=)([\w-]{11})/); if (mm) return 'https://www.youtube.com/embed/' + mm[1];
      const dm = String(u).match(/drive\.google\.com\/file\/d\/([\w-]+)/); if (dm) return 'https://drive.google.com/file/d/' + dm[1] + '/preview';
      return u;
    };
    return R.createElement('div', { style: grid(2) },
      R.createElement(InvCard, { p, title: '📄 ' + tt.docCenter },
        R.createElement('label', { style: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 9, background: p.brand, color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', marginBottom: 12 } },
          tt.uploadPdf, R.createElement('input', { type: 'file', accept: 'application/pdf', style: { display: 'none' }, onChange: e => onPdf(e.target.files[0]) })),
        pdf ? R.createElement('iframe', { src: pdf, style: { width: '100%', height: 460, border: '1px solid ' + p.line, borderRadius: 10 } })
          : R.createElement('div', { style: { color: p.sub, fontSize: 12.5, padding: 30, textAlign: 'center', border: '1px dashed ' + p.line, borderRadius: 10 } }, tt.noData + ' — ' + tt.uploadPdf + ' (เช่น Company Profile, งบการเงิน)')),
      R.createElement(InvCard, { p, title: '🎬 ' + (tt.uploadVideo) },
        R.createElement('div', { style: { display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' } },
          R.createElement('input', { value: vidUrl, onChange: e => setVidUrl(e.target.value), onBlur: () => invSet('videoUrl', vidUrl), placeholder: tt.videoUrl, style: { flex: 1, minWidth: 160, height: 34, border: '1px solid ' + p.line, borderRadius: 8, padding: '0 10px', background: p.card2, color: p.ink, fontSize: 12.5 } }),
          R.createElement('label', { style: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 8, background: p.brand, color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' } },
            tt.uploadVideo, R.createElement('input', { type: 'file', accept: 'video/*', style: { display: 'none' }, onChange: e => onVid(e.target.files[0]) }))),
        vid ? R.createElement('video', { src: vid, controls: true, style: { width: '100%', borderRadius: 10, background: '#000' } })
          : vidUrl ? R.createElement('iframe', { src: ytEmbed(vidUrl), allow: 'autoplay; encrypted-media; fullscreen', style: { width: '100%', height: 300, border: 'none', borderRadius: 10 } })
            : R.createElement('div', { style: { color: p.sub, fontSize: 12.5, padding: 30, textAlign: 'center', border: '1px dashed ' + p.line, borderRadius: 10 } }, tt.noData + ' — ' + tt.videoUrl))
    );
  }

  window.InvestorDashboard = InvestorDashboard;
})();
