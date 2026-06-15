// ═══════════════════════════════════════════════════════════════════════════
// INVESTOR DASHBOARD — premium corporate investor presentation (in-app page)
// route #investor · 10 sub-sections · TH/EN · Light/Dark · Present mode · Export
// Narrative mirrors the KTB pitch deck "Project Turtle — Company Overview".
// Live KPIs derive from data.projects (PCU.deriveProjects); company financials,
// market sizing, shareholding, team & ESG are STATIC from the deck (manual update).
// ทุก identifier ขึ้นต้น INV*/inv* กัน global collision (in-browser Babel)
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  const R = window.React;
  const el = R.createElement;
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

  // ── investment highlights (deck p2) ──────────────────────────────────────────
  const INV_HIGHLIGHTS = [
    { icon: '💧', th: ['ระบบผลิตน้ำครบวงจร All-in-One', 'ระบบผลิต+กรองน้ำในชุดเดียว ใช้เทคโนโลยีกรองขั้นสูงที่สุด'],
      en: ['All-in-One Water Supply System', 'A fully-integrated supply system with the most advanced filtration technology'] },
    { icon: '🪶', th: ['โมเดล Asset-Light', 'ลงทุนต่ำ เพราะจ้างผลิตภายนอก (outsource) ไม่ต้องมีโรงงานเอง'],
      en: ['Asset-Light Operation Model', 'Low capex — manufacturing is outsourced'] },
    { icon: '🗺️', th: ['ขยายได้ทั่วประเทศ', 'S-Tank แบบ Plug & Play ทำให้ขยายงานเร็วและครอบคลุมลูกค้าทั่วไทย'],
      en: ['Scalability Across Nation', 'Plug-and-play S-Tank lets the company scale fast across Thailand'] },
    { icon: '📦', th: ['Backlog ที่ทำสัญญาแล้ว', 'งานในมือจากท้องถิ่นสะท้อนความต้องการพัฒนาระบบน้ำอย่างต่อเนื่อง'],
      en: ['Secured Backlog', 'Past acquisitions reflect ongoing local-authority demand'] },
    { icon: '🏆', th: ['ผู้นำตลาดน้ำประปาชุมชน', 'เจ้าของสิทธิบัตรนวัตกรรมไทย และผู้จัดจำหน่ายอันดับ 1 ระดับหมู่บ้าน'],
      en: ['Market Leading Position', 'Thai Innovation patent owner & #1 village-scale distributor'] },
    { icon: '✅', th: ['ได้รับการรับรองอย่างเป็นทางการ', 'ขึ้นทะเบียนบัญชีนวัตกรรมไทย อนุมัติโดยสำนักงบประมาณ'],
      en: ['Officially Approved', 'Registered in the Thailand Innovation Product Registry, approved by the Budget Bureau'] },
  ];

  // ── product mix by # projects (deck p2, 2024–Jan2025 cumulative) ─────────────
  const INV_MIX = [
    { th: 'POG L', en: 'POG L', pct: 52, color: '#1f56b8' },
    { th: 'POG Drink', en: 'POG Drink', pct: 38, color: '#0e9f9a' },
    { th: 'POG M', en: 'POG M', pct: 6, color: '#2a6fdb' },
    { th: 'อื่นๆ', en: 'Other', pct: 4, color: '#b8862b' },
    { th: 'POG S', en: 'POG S', pct: 0, color: '#9aa83a' },
  ];

  // ── company financials (deck p12, Unit: THB mn) — STATIC ─────────────────────
  const INV_FIN_YEARS = ['2023A', '2024A', '2025A'];
  const INV_FIN = [
    { th: 'รายได้', en: 'Revenue', v: [1366.1, 562.6, 958.3], bold: true },
    { th: 'ต้นทุนขาย (COGS)', en: 'COGS', v: [-1054.0, -419.7, -696.4] },
    { th: 'กำไรขั้นต้น', en: 'Gross Profit', v: [312.1, 142.4, 261.9], bold: true },
    { th: 'อัตรากำไรขั้นต้น', en: 'Gross Profit Margin', v: [22.8, 25.3, 27.3], pct: true },
    { th: 'ค่าใช้จ่ายในการดำเนินงาน', en: 'Operating Expense', v: [-181.0, -174.5, -191.3] },
    { th: 'ต้นทุนทางการเงิน', en: 'Finance Costs', v: [-28.9, -44.5, -52.9] },
    { th: 'EBITDA', en: 'EBITDA', v: [135.4, -24.3, 88.5], bold: true },
    { th: 'อัตรา EBITDA', en: 'EBITDA Margin', v: [9.9, -4.3, 9.2], pct: true },
    { th: 'กำไรสุทธิ', en: 'Net Profit', v: [73.8, -64.1, 17.3], bold: true },
    { th: 'อัตรากำไรสุทธิ', en: 'Net Profit Margin', v: [5.4, -11.4, 1.8], pct: true },
  ];

  // ── POG Drink momentum (deck p6) ─────────────────────────────────────────────
  const INV_DRINK = [
    { label: 'ต.ค.67', value: 60 }, { label: 'พ.ย.67', value: 28 }, { label: 'ธ.ค.67', value: 31 },
    { label: 'ม.ค.68', value: 21 }, { label: '2025F', value: 276 }, { label: '2026F', value: 117 },
  ];

  // ── market sizing (deck p8) ──────────────────────────────────────────────────
  const INV_MARKET = { villages: 81701, withTap: 69771, withoutTap: 11930, served: 1000 };

  // ── shareholding structure (deck p15, as of 1 Dec 2025) — CONFIDENTIAL ───────
  const INV_SHARE = [
    { name: 'นายศิวพงษ์ ลือนาม / Mr. Siwapong Luenram', pct: 31.0, grp: 'founder' },
    { name: 'นายกฤตวัฒน์ ลือนาม / Mr. Krittawat Luenram', pct: 23.4, grp: 'founder' },
    { name: 'นายคเณศ ตันติเจริญวิวัฒน์ / Mr. Kanet Tantichareonwiwat', pct: 6.7, grp: 'founder' },
    { name: 'ARON HILL LIMITED', pct: 17.9, grp: 'op' },
    { name: 'VL HOLDING VENTURE LIMITED', pct: 8.0, grp: 'op' },
    { name: 'นางนันทนา มณีนิล / Mrs. Nantana Maneenin', pct: 1.9, grp: 'op' },
    { name: 'นางสุนีรัตน์ สีจันทร์เหมือง / Mrs. Suneerat Sichanmuang', pct: 0.8, grp: 'op' },
    { name: 'น.ส.อรวรรณ พวงคุ้ม / Miss Orawan Puangkum', pct: 0.5, grp: 'op' },
    { name: 'น.ส.ประภาศิริ ทองอินทร์ / Miss Praphasiri Thongin', pct: 0.5, grp: 'op' },
    { name: 'HEP HOLDINGS 6 LIMITED', pct: 0.4, grp: 'op' },
    { name: 'นายภัทระ ไวศยรัตน์ / Mr. Pachara Waisayarat', pct: 0.2, grp: 'op' },
    { name: 'นายพงษ์พัฒน์ ชัยศรีพงษ์ไพศาล / Mr. Pongpat Chaisripongpaisarn', pct: 0.2, grp: 'op' },
    { name: 'น.ส.ปราณิสา ปุ้มชัยยะ / Miss Pranisa Pumchaiya', pct: 0.1, grp: 'op' },
    { name: 'นายมานิตย์ ตาเจ๊ะ / Mr. Manit Tajew', pct: 0.1, grp: 'op' },
    { name: 'น.ส.นิสา แย้มสอาด / Miss Nisa Yaemsaart', pct: 0.1, grp: 'op' },
    { name: 'น.ส.บริพรรณ สุนร่วมใจ / Miss Boriphon Sunruamjai', pct: 0.1, grp: 'op' },
    { name: 'PRIVATE EQUITY TRUST FOR SME GROWING TOGETHER 1', pct: 8.2, grp: 'pe' },
  ];
  const INV_SHARE_GRP = { founder: { th: 'กลุ่มผู้ก่อตั้ง', en: 'Founders', pct: 61.1 }, op: { th: 'ทีมวิศวกร/ปฏิบัติการ', en: 'Engineering & Operations', pct: 30.7 }, pe: { th: 'นักลงทุน (PE)', en: 'Investor (PE)', pct: 8.2 } };

  // ── founders (deck p15) ──────────────────────────────────────────────────────
  const INV_FOUNDERS = [
    { th: ['นายศิวพงษ์ ลือนาม', 'ผู้ก่อตั้ง (Founding Member)'], en: ['Siwapong Luenram', 'Founding Member'],
      bullets_th: ['ผู้สนับสนุน ที่ปรึกษา และผู้ร่วมทุนวิจัยให้ ม.สงขลานครินทร์ และ มทร.ธัญบุรี', 'ประสบการณ์: นวรัตน์พัฒนาการ · วิศวกรอุตสาหการที่สมุย', 'การศึกษา: วิศวกรรมอุตสาหการ ม.สงขลานครินทร์'],
      bullets_en: ['Sponsor, advisor & research funding partner for PSU and RMUTT', 'Experience: Nawarat Patanakarn, Engineer Industrialist in Samui', 'Education: Industrial Engineering, Prince of Songkla University'] },
    { th: ['นายภัทระ ไวศยรัตน์', 'วิศวกรวิจัยและพัฒนา (R&D)'], en: ['Pachara Waisayarat', 'R&D Engineer'],
      bullets_th: ['ร่วมพัฒนาและออกแบบระบบกรองน้ำหมู่บ้าน POG', 'ประสบการณ์: JME Home (Project Engineer) · เจริญมิตร (Site Engineer)', 'การศึกษา: วิศวกรรมอุตสาหการ ม.สงขลานครินทร์'],
      bullets_en: ['Co-developed & designed the POG village water filtration system', 'Experience: JME Home Project Engineer; Jrernmitr Site Engineer', 'Education: Industrial Engineering, Prince of Songkla University'] },
    { th: ['นายพงษ์พัฒน์ ชัยศรีพงษ์ไพศาล', 'วิศวกรโครงการ (Project Engineer)'], en: ['Pongpat Chaisripongpaisal', 'Project Engineer'],
      bullets_th: ['ร่วมพัฒนาระบบเติมอากาศแบบ Venturi ที่ใช้ใน ACFS', 'ประสบการณ์: Soecon (Project Engineer) · Meccon (Site Engineer)', 'การศึกษา: วิศวกรรมเครื่องกล ม.สงขลานครินทร์'],
      bullets_en: ['Co-developed the Venturi air-injection system used in ACFS', 'Experience: Soecon Project Engineer; Meccon Site Engineer', 'Education: Mechanical Engineering, Prince of Songkla University'] },
  ];

  // ── ESG pillars (deck p16–18) ────────────────────────────────────────────────
  const INV_ESG = [
    { icon: '🩺', th: ['สุขภาพ สุขอนามัย และความเป็นอยู่ของชุมชน', 'ถัง ACFS กำจัดโลหะปนเปื้อนในน้ำดิบ ช่วยยกระดับสุขภาพชาวบ้านและเพิ่มผลผลิตเกษตร'],
      en: ['Health, Sanitation & Well-Being', 'The ACFS tank removes contaminated metals from raw water — improving health and raising crop yields'],
      idx_th: 'ดัชนีน้ำสะอาดและสุขาภิบาลโลก: ไทยอันดับ 71', idx_en: 'World Water & Sanitation Index: Thailand ranked 71st',
      bars: [{ label: '1st', value: 100 }, { label: '19th', value: 96.6 }, { label: '22nd', value: 94.9 }, { label: 'ไทย 71st', value: 59.4 }] },
    { icon: '🚰', th: ['น้ำสะอาดเข้าถึงทุกคนทั่วไทย', 'กว่า 70% ของหมู่บ้านยังไม่มีระบบประปาที่เหมาะสม POG ใช้พื้นที่น้อยลง 6–8 เท่า'],
      en: ['Clean Water Accessibility for All', 'Over 70% of villages lack proper water supply — POG optimises land use 6–8× vs traditional systems'],
      idx_th: 'ไทยมีการเข้าถึงสุขาภิบาลน้ำต่ำสุดเมื่อเทียบประเทศเพื่อนบ้าน', idx_en: 'Thailand has the lowest water-sanitation access among neighbours',
      bullets_th: ['ระบบประปาคุณภาพเทียบการประปาส่วนภูมิภาค', 'โครงสร้างพื้นฐานเข้าถึงทุกชุมชน', 'ท้องถิ่นประหยัดงบระยะยาว'],
      bullets_en: ['Water quality comparable to the Provincial Waterworks Authority', 'Infrastructure available to every community', 'Long-term cost savings for local administrations'] },
    { icon: '🔬', th: ['นวัตกรรมโครงสร้างพื้นฐานจาก SME ไทย', 'ไทยอันดับ 45 ด้านนวัตกรรม POG ยกระดับด้วยเทคโนโลยีและสนับสนุนงานวิจัยท้องถิ่น'],
      en: ['Nationwide Infrastructure from a Local SME', 'Thailand ranks 45th in innovation — POG upgrades technology and supports local research'],
      idx_th: 'อันดับสมรรถนะนวัตกรรม', idx_en: 'Innovation Performance Ranking',
      bars: [{ label: '1st', value: 2.56 }, { label: '11th', value: 1.34 }, { label: '24th', value: 0.95 }, { label: 'ไทย 45th', value: 0.36 }] },
  ];

  // ── i18n (short labels) ──────────────────────────────────────────────────────
  const T = {
    th: {
      brand: 'Water POG · POG TANKS', tagline: 'เจ้าของสิทธิบัตรนวัตกรรมไทย · ผู้จัดจำหน่ายระบบกรองน้ำระดับหมู่บ้านอันดับ 1 ของไทย',
      secs: ['ภาพรวมการลงทุน', 'ข้อมูลบริษัท', 'ผลิตภัณฑ์และเทคโนโลยี', 'โอกาสทางตลาด', 'ผลการดำเนินงาน', 'เศรษฐศาสตร์โครงการ', 'ลูกค้าและโครงการ', 'ทีมและผู้ถือหุ้น', 'ความยั่งยืน (ESG)', 'ห้องนักลงทุน'],
      present: 'โหมดนำเสนอ', exit: 'ออก', exportPdf: 'ส่งออก PDF',
      contractValue: 'มูลค่าสัญญารวม (ในระบบ)', projects: 'โครงการทั้งหมด', received: 'รับเงินแล้ว', backlog: 'งานคงค้าง (AR)',
      pipeline: 'งานรอลงนาม', revenue: 'รายได้', wip: 'งานระหว่างก่อสร้าง', products: 'รุ่นผลิตภัณฑ์',
      byRegion: 'โครงการแยกตามภูมิภาค', byType: 'มูลค่าตามกลุ่มผลิตภัณฑ์', byFy: 'มูลค่าสัญญาตามปีงบ', cashflow: 'คาดการณ์กระแสเงินสด',
      statusFunnel: 'สถานะโครงการ', topProv: 'จังหวัดที่มีโครงการมากสุด', priceList: 'ราคาผลิตภัณฑ์ (บาท)', unit: 'บาท',
      docCenter: 'ศูนย์เอกสาร', uploadPdf: 'อัปโหลด PDF', uploadVideo: 'อัปโหลดวิดีโอ', videoUrl: 'ลิงก์วิดีโอ (YouTube/Drive)',
      gallery: 'แกลเลอรีโครงการ', uploadImg: 'อัปโหลดรูป', search: 'ค้นหา…', noData: 'ยังไม่มีข้อมูล',
      mixTitle: 'สัดส่วนโครงการตามกลุ่มผลิตภัณฑ์', mixNote: 'อ้างอิงสะสม ต.ค.2024 – ม.ค.2025',
      hiTitle: 'จุดเด่นการลงทุน', approvedBy: 'รับรอง/ขึ้นทะเบียนโดย',
      finUnit: 'หน่วย: ล้านบาท', growth: 'เติบโต', drinkTitle: 'จำนวนโครงการ POG Drink',
      mktPen: 'การเจาะตลาด', mktUntapped: 'ของตลาดยังไม่ถูกเจาะ', villages: 'หมู่บ้านทั้งประเทศ', withTap: 'มีประปาสะอาด', withoutTap: 'ยังไม่มีประปาสะอาด', servedNote: 'Water POG ให้บริการแล้วกว่า 1,000+ โครงการ',
      econTitle: 'โครงสร้างต้นทุนโครงการ (POG TANK L)', pipelineTitle: 'งานในมือ (ล้านบาท)', cfTimeline: 'ไทม์ไลน์กระแสเงินสดโครงการ',
      shareTitle: 'โครงสร้างผู้ถือหุ้น', shareNote: 'ณ วันที่ 1 ธ.ค. 2025', founderTitle: 'ผู้ก่อตั้งและทีมผู้บริหาร', confidential: 'ข้อมูลลับเฉพาะ — สำหรับนักลงทุนเท่านั้น',
      esgTitle: 'การพัฒนาที่ยั่งยืน',
    },
    en: {
      brand: 'Water POG · POG TANKS', tagline: 'Thai Innovation Patent Owner · #1 Distributor of Village-Scale Water Filtration in Thailand',
      secs: ['Investment Highlights', 'Company Profile', 'Products & Technology', 'Market Opportunity', 'Financial Performance', 'Project Economics', 'Customers & Projects', 'Team & Shareholding', 'Sustainability (ESG)', 'Investor Room'],
      present: 'Present', exit: 'Exit', exportPdf: 'Export PDF',
      contractValue: 'Total Contract Value (system)', projects: 'Total Projects', received: 'Cash Received', backlog: 'Backlog (AR)',
      pipeline: 'Awaiting Sign', revenue: 'Revenue', wip: 'Work in Progress', products: 'Product Models',
      byRegion: 'Projects by Region', byType: 'Value by Product Group', byFy: 'Contract Value by Fiscal Year', cashflow: 'Cash Flow Forecast',
      statusFunnel: 'Project Status', topProv: 'Top Provinces', priceList: 'Price List (THB)', unit: 'THB',
      docCenter: 'Document Center', uploadPdf: 'Upload PDF', uploadVideo: 'Upload Video', videoUrl: 'Video link (YouTube/Drive)',
      gallery: 'Project Gallery', uploadImg: 'Upload Image', search: 'Search…', noData: 'No data yet',
      mixTitle: 'Number of Projects by Product Type', mixNote: 'Based on Oct 2024 – Jan 2025 cumulative',
      hiTitle: 'Investment Highlights', approvedBy: 'Officially Approved / Registered By',
      finUnit: 'Unit: THB mn', growth: 'Growth', drinkTitle: 'Number of POG Drink Projects',
      mktPen: 'Market Penetration', mktUntapped: 'of the market still untapped', villages: 'villages nationwide', withTap: 'with clean tap water', withoutTap: 'without clean tap water', servedNote: 'Water POG is serving 1,000+ projects',
      econTitle: 'Project Cost Structure (POG TANK L)', pipelineTitle: 'Project Pipeline (THB mn)', cfTimeline: 'Project Cash Flow Timeline',
      shareTitle: 'Shareholding Structure', shareNote: 'As of 1 Dec 2025', founderTitle: 'Founders & Management Team', confidential: 'Strictly Confidential — For Investors Only',
      esgTitle: 'Sustainable Development',
    },
  };

  // ── theme palettes ──────────────────────────────────────────────────────────
  const PAL = {
    light: { bg: '#eef2f8', card: '#ffffff', card2: '#f7faff', ink: '#0d1f3a', sub: '#5a6b86', line: '#e3e9f2',
      brand: '#1f56b8', brand2: '#2a6fdb', accent: '#0e9f9a', gold: '#b8862b', good: '#1f8a5b', bad: '#c0392b', shadow: '0 10px 30px rgba(20,45,100,.10)' },
    dark: { bg: '#0a1120', card: '#131d33', card2: '#0f1830', ink: '#eaf1fb', sub: '#93a6c4', line: '#243450', brand: '#5b93f3',
      brand2: '#7eacf7', accent: '#33c2bd', gold: '#e0ab4d', good: '#4cc38a', bad: '#ef6a5a', shadow: '0 12px 34px rgba(0,0,0,.45)' },
  };

  const invFmt = (n) => (n == null || isNaN(n)) ? '—' : Math.round(n).toLocaleString('en-US');
  const invCompact = (n) => {
    if (n == null || isNaN(n)) return '—'; const a = Math.abs(n);
    if (a >= 1e9) return (n / 1e9).toFixed(2) + 'B'; if (a >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return (n / 1e3).toFixed(0) + 'K'; return String(Math.round(n));
  };
  // THB-mn (financials): "(64.1)" for negatives, 1 decimal
  const invMn = (n) => { if (n == null || isNaN(n)) return '—'; const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }); return n < 0 ? '(' + s + ')' : s; };

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
    let cashflow = [];
    try {
      const ys = PCU.forecastYears(active); const y = ys[ys.length - 1] || new Date().getFullYear();
      cashflow = PCU.cashflowByMonth(active, y).map(m => ({ label: m.month, value: m.gross }));
    } catch (_) {}
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
  function InvBars({ p, items, color, money, suffix }) {
    const max = Math.max(1, ...items.map(i => Math.abs(i.value)));
    return R.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 9 } },
      items.map((it, i) => R.createElement('div', { key: i },
        R.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 12, color: p.sub, marginBottom: 3 } },
          R.createElement('span', null, it.label),
          R.createElement('span', { style: { fontWeight: 700, color: p.ink, fontVariantNumeric: 'tabular-nums' } }, money ? '฿' + invCompact(it.value) : (invFmt(it.value) + (suffix || '')))),
        R.createElement('div', { style: { height: 9, background: p.card2, borderRadius: 99, overflow: 'hidden' } },
          R.createElement('div', { style: { height: '100%', width: Math.max(2, Math.abs(it.value) / max * 100) + '%', background: 'linear-gradient(90deg,' + (color || p.brand) + ',' + p.brand2 + ')', borderRadius: 99 } }))
      ))
    );
  }
  function InvCard({ p, title, note, children, style }) {
    return R.createElement('div', { style: Object.assign({ background: p.card, border: '1px solid ' + p.line, borderRadius: 16, padding: 20, boxShadow: p.shadow }, style || {}) },
      title ? R.createElement('div', { style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 14, flexWrap: 'wrap' } },
        R.createElement('div', { style: { fontSize: 13.5, fontWeight: 800, color: p.ink, display: 'flex', alignItems: 'center', gap: 8 } },
          R.createElement('span', { style: { width: 4, height: 15, background: p.brand, borderRadius: 3, display: 'inline-block' } }), title),
        note ? R.createElement('div', { style: { fontSize: 11, color: p.sub } }, note) : null) : null,
      children
    );
  }
  // segmented 100% bar + legend (product mix)
  function InvSeg({ p, items, lang }) {
    const seg = items.filter(i => i.pct > 0);
    return R.createElement('div', null,
      R.createElement('div', { style: { display: 'flex', height: 26, borderRadius: 8, overflow: 'hidden', border: '1px solid ' + p.line } },
        seg.map((s, i) => R.createElement('div', { key: i, title: (lang === 'th' ? s.th : s.en) + ' ' + s.pct + '%', style: { width: s.pct + '%', background: s.color, display: 'grid', placeItems: 'center', color: '#fff', fontSize: 10.5, fontWeight: 700 } }, s.pct >= 8 ? s.pct + '%' : ''))),
      R.createElement('div', { style: { display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 12 } },
        items.map((s, i) => R.createElement('span', { key: i, style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: p.sub } },
          R.createElement('span', { style: { width: 11, height: 11, borderRadius: 3, background: s.color, display: 'inline-block' } }),
          (lang === 'th' ? s.th : s.en), R.createElement('b', { style: { color: p.ink } }, s.pct + '%'))))
    );
  }
  // generic key/value or matrix table
  function InvTable({ p, head, rows }) {
    return R.createElement('div', { style: { overflow: 'auto' } },
      R.createElement('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 12.5 } },
        head ? R.createElement('thead', null, R.createElement('tr', null,
          head.map((h, i) => R.createElement('th', { key: i, style: { textAlign: i === 0 ? 'left' : 'right', padding: '8px 10px', color: p.sub, fontWeight: 700, borderBottom: '2px solid ' + p.line, whiteSpace: 'nowrap' } }, h)))) : null,
        R.createElement('tbody', null, rows.map((r, i) => R.createElement('tr', { key: i, style: { background: r.bold ? p.card2 : 'transparent' } },
          r.cells.map((c, j) => R.createElement('td', { key: j, style: { textAlign: j === 0 ? 'left' : 'right', padding: '7px 10px', borderBottom: '1px solid ' + p.line, fontWeight: r.bold ? 800 : (j === 0 ? 600 : 500), color: c && c.neg ? p.bad : p.ink, fontVariantNumeric: 'tabular-nums', whiteSpace: j === 0 ? 'normal' : 'nowrap' } }, c && c.t != null ? c.t : c)))))
      )
    );
  }

  // ── persisted embeds (video URL etc.) via WTPOverride (team-shared) ───────────
  const invGet = (k, d) => { try { return (window.WTPOverride && WTPOverride.resolveRaw) ? WTPOverride.resolveRaw('inv.' + k, d) : ((window.WTPOverride && WTPOverride._load && WTPOverride._load()['inv.' + k]) || d); } catch (_) { return d; } };
  const invSet = (k, v) => { try { window.WTPOverride && WTPOverride.setRaw && WTPOverride.setRaw('inv.' + k, v); } catch (_) {} };

  const grid = (cols, gap) => ({ display: 'grid', gridTemplateColumns: 'repeat(' + cols + ',1fr)', gap: gap || 14 });
  const gridR = (cols, gap) => ({ display: 'grid', gridTemplateColumns: 'repeat(' + (window.innerWidth < 760 ? 1 : cols) + ',1fr)', gap: gap || 14 });

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

    const SECS = [InvExec, InvCompany, InvProducts, InvMarket, InvPerformance, InvEconomics, InvCustomers, InvTeam, InvESG, InvRoom];
    const Section = SECS[sec] || InvExec;

    return R.createElement('div', { style: rootStyle, id: 'investor-root' },
      R.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 16 } },
        R.createElement('div', { style: { width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg,' + p.brand + ',' + p.brand2 + ')', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800, fontSize: 18, flex: '0 0 auto' } }, 'W'),
        R.createElement('div', { style: { lineHeight: 1.25, flex: '1 1 240px', minWidth: 0 } },
          R.createElement('div', { style: { fontSize: 19, fontWeight: 800, letterSpacing: '-.3px' } }, 'Investor Dashboard'),
          R.createElement('div', { style: { fontSize: 11.5, color: p.sub } }, tt.tagline)),
        R.createElement('div', { className: 'no-print', style: { marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' } },
          invToggle(p, lang === 'th' ? 'TH' : 'EN', () => setLang(lang === 'th' ? 'en' : 'th')),
          invToggle(p, theme === 'light' ? '🌙' : '☀️', () => setTheme(theme === 'light' ? 'dark' : 'light')),
          invToggle(p, '🖨 ' + tt.exportPdf, () => window.print()),
          R.createElement('button', { onClick: () => setPresent(!present), style: { height: 36, padding: '0 14px', borderRadius: 9, border: 'none', background: present ? p.gold : 'linear-gradient(135deg,' + p.brand + ',' + p.brand2 + ')', color: '#fff', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' } }, present ? '✕ ' + tt.exit : '⛶ ' + tt.present))
      ),
      R.createElement('div', { className: 'no-print', style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18, borderBottom: '1px solid ' + p.line, paddingBottom: 10 } },
        tt.secs.map((s, i) => R.createElement('button', { key: i, onClick: () => setSec(i),
          style: { padding: '7px 12px', borderRadius: 9, border: '1px solid ' + (sec === i ? 'transparent' : p.line), background: sec === i ? 'linear-gradient(135deg,' + p.brand + ',' + p.brand2 + ')' : p.card, color: sec === i ? '#fff' : p.sub, fontSize: 12, fontWeight: sec === i ? 700 : 500, cursor: 'pointer' } },
          (i + 1) + '. ' + s))
      ),
      R.createElement(Section, { p: p, tt: tt, m: m, data: data, lang: lang, toast: toast })
    );
  }
  function invToggle(p, label, onClick) {
    return R.createElement('button', { onClick, style: { height: 36, padding: '0 12px', borderRadius: 9, border: '1px solid ' + p.line, background: p.card, color: p.ink, fontWeight: 600, fontSize: 12.5, cursor: 'pointer' } }, label);
  }

  // ── 1. Investment Highlights (deck p2) ────────────────────────────────────────
  function InvExec({ p, tt, m, lang }) {
    const fyItems = Object.keys(m.byFy).sort().map(k => ({ label: k, value: m.byFy[k] }));
    const approved = lang === 'th'
      ? ['บัญชีนวัตกรรมไทย', 'สำนักงบประมาณ', 'สวทช. (NSTDA)', 'มาตรฐาน WHO']
      : ['Thailand Innovation Registry', 'Budget Bureau', 'NSTDA', 'WHO Standards'];
    return R.createElement('div', null,
      R.createElement('div', { style: { background: 'linear-gradient(135deg,' + p.brand + ',' + p.brand2 + ')', borderRadius: 18, padding: '26px 28px', color: '#fff', marginBottom: 16, boxShadow: p.shadow } },
        R.createElement('div', { style: { fontSize: 13, opacity: .9, fontWeight: 600 } }, lang === 'th' ? 'ระบบผลิตน้ำประปาชุมชนครบวงจร All-in-One' : 'All-in-One Village-Scale Water Supply System'),
        R.createElement('div', { style: { fontSize: 30, fontWeight: 800, letterSpacing: '-.5px', marginTop: 6, lineHeight: 1.2 } }, tt.tagline),
        R.createElement('div', { style: { fontSize: 13, opacity: .92, marginTop: 10 } }, tt.contractValue + ' ฿' + invFmt(m.contractTotal) + ' · ' + tt.projects + ' ' + invFmt(m.count))),
      R.createElement('div', { style: Object.assign(gridR(4), { marginBottom: 16 }) },
        R.createElement(InvKpi, { p, label: tt.revenue + ' 2025A', value: '฿958M', sub: tt.growth + ' 70.3% YoY', accent: p.brand }),
        R.createElement(InvKpi, { p, label: tt.projects + ' (ในระบบ)', value: invFmt(m.count), accent: p.accent }),
        R.createElement(InvKpi, { p, label: tt.backlog, value: '฿' + invCompact(m.backlog), accent: p.gold }),
        R.createElement(InvKpi, { p, label: tt.products, value: INV_PRODUCTS.length + (lang === 'th' ? ' รุ่น' : ''), sub: 'POG TANK · SOLVE · Drink', accent: p.brand2 })),
      R.createElement(InvCard, { p, title: tt.hiTitle, style: { marginBottom: 14 } },
        R.createElement('div', { style: gridR(3) },
          INV_HIGHLIGHTS.map((h, i) => R.createElement('div', { key: i, style: { display: 'flex', gap: 12, padding: 12, background: p.card2, borderRadius: 12, border: '1px solid ' + p.line } },
            R.createElement('div', { style: { fontSize: 24, flex: '0 0 auto' } }, h.icon),
            R.createElement('div', null,
              R.createElement('div', { style: { fontSize: 13, fontWeight: 800, color: p.ink, marginBottom: 3 } }, (lang === 'th' ? h.th : h.en)[0]),
              R.createElement('div', { style: { fontSize: 11.5, color: p.sub, lineHeight: 1.5 } }, (lang === 'th' ? h.th : h.en)[1])))))),
      R.createElement('div', { style: gridR(2) },
        R.createElement(InvCard, { p, title: tt.mixTitle, note: tt.mixNote }, R.createElement(InvSeg, { p, items: INV_MIX, lang })),
        R.createElement(InvCard, { p, title: tt.byFy }, R.createElement(InvBars, { p, items: fyItems.length ? fyItems : [{ label: '—', value: 0 }], money: true }))),
      R.createElement(InvCard, { p, title: '✅ ' + tt.approvedBy, style: { marginTop: 14 } },
        R.createElement('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap' } },
          approved.map((a, i) => R.createElement('span', { key: i, style: { padding: '8px 14px', background: p.card2, border: '1px solid ' + p.line, borderRadius: 99, fontSize: 12.5, fontWeight: 700, color: p.brand } }, a))))
    );
  }

  // ── 2. Company Profile ────────────────────────────────────────────────────────
  function InvCompany({ p, tt, lang }) {
    const facts = lang === 'th' ? [
      ['ชื่อบริษัท', 'บริษัท วอเทอร์ป๊อก จำกัด (Water POG / POG TANKS)'],
      ['ที่ตั้ง', '6/5 หมู่ 3 ต.บ่อผุด อ.เกาะสมุย จ.สุราษฎร์ธานี 84320'],
      ['ธุรกิจ', 'นวัตกรรมระบบผลิตน้ำประปาชุมชน · ขึ้นทะเบียนบัญชีนวัตกรรมไทย'],
      ['สถานะตลาด', 'ผู้จัดจำหน่ายระบบกรองน้ำระดับหมู่บ้านอันดับ 1 ของไทย'],
      ['กลุ่มผลิตภัณฑ์', 'POG TANK · POG SOLVE · POG Drink · S-Tank'],
      ['โมเดลธุรกิจ', 'Asset-Light · จ้างผลิตภายนอก · ทีมวิศวกรติดตั้ง/บริการเอง'],
    ] : [
      ['Company', 'Water POG Co., Ltd. (POG TANKS)'],
      ['Location', '6/5 Moo 3, Bo Phut, Koh Samui, Surat Thani 84320'],
      ['Business', 'Community water-supply innovation · Registered Thai Innovation'],
      ['Market position', '#1 distributor of village-scale water filtration in Thailand'],
      ['Product lines', 'POG TANK · POG SOLVE · POG Drink · S-Tank'],
      ['Business model', 'Asset-light · outsourced manufacturing · in-house install/service'],
    ];
    const props = lang === 'th'
      ? ['ระบบครบวงจร: ผลิต+กรองในชุดเดียว กรองน้ำดิบได้ทุกแหล่ง (ประปา/บาดาล/ผิวดิน/น้ำเสียเกษตร)', 'ติดตั้งเร็ว 3–5 เดือน ใช้พื้นที่เพียง ~80 ตร.ม. (ระบบเดิม >625 ตร.ม.)', 'ระบบกรอง up-flow + backwash อัตโนมัติ อายุการใช้งานไส้กรองนานถึง 2 ปี', 'ควบคุม/ติดตามทางไกลด้วย IoT · ผู้ดูแลคนเดียวคุมทั้งระบบ', 'รับประกัน 2 ปี · บำรุงรักษาทุก 6 เดือน · ทีมช่างเข้าซ่อมภายใน 48 ชม.', 'คุณภาพน้ำผ่านมาตรฐาน WHO และรับรองโดย สวทช.']
      : ['All-in-one: production + filtration in one unit; treats every raw-water source (tap/ground/surface/agricultural effluent)', 'Fast install in 3–5 months, needs only ~80 sqm (legacy systems >625 sqm)', 'Up-flow filtration + automatic backwash; filter media lasts up to 2 years', 'IoT remote monitoring & control; a single operator runs the whole system', '2-year warranty · maintenance every 6 months · on-site repair within 48 hrs', 'Water quality meets WHO standards, assured by NSTDA'];
    return R.createElement('div', { style: gridR(2) },
      R.createElement(InvCard, { p, title: lang === 'th' ? 'ข้อมูลบริษัท' : 'Company Profile' },
        facts.map((f, i) => R.createElement('div', { key: i, style: { display: 'flex', gap: 12, padding: '9px 0', borderBottom: i < facts.length - 1 ? '1px solid ' + p.line : 'none' } },
          R.createElement('div', { style: { width: 120, color: p.sub, fontSize: 12.5, flex: '0 0 auto' } }, f[0]),
          R.createElement('div', { style: { fontSize: 13, fontWeight: 600 } }, f[1])))),
      R.createElement(InvCard, { p, title: lang === 'th' ? 'จุดเด่นที่สร้างมูลค่า' : 'Value Propositions' },
        R.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 11 } },
          props.map((v, i) => R.createElement('div', { key: i, style: { display: 'flex', gap: 10, alignItems: 'flex-start' } },
            R.createElement('span', { style: { color: p.accent, fontWeight: 800 } }, '✓'),
            R.createElement('span', { style: { fontSize: 13, lineHeight: 1.5 } }, v)))))
    );
  }

  // ── 3. Products & Technology (deck p3–6) ──────────────────────────────────────
  function InvProducts({ p, tt, m, lang }) {
    const comps = lang === 'th'
      ? [['1 · ACFS — ถังเก็บอเนกประสงค์', 'กรอง 7 ชั้นแบบ bottom-up + ระบบเติมอากาศและฉีดสารเคมี 3 จุด ฆ่าเชื้อและกำจัดกลิ่น'],
         ['2 · Intelligence PnP — สถานีปั๊มอัจฉริยะ', 'Plug & Pump คุมการไหลด้วยเซนเซอร์ แจ้งเตือนไฟดับ/อากาศในท่อ/สารเคมีหมด/แรงดันเกิน/ระดับน้ำ'],
         ['3 · SFX Tower Tank — หอถังสูง', 'เก็บน้ำบนหอสูงพร้อมกรองซ้ำ 7 ชั้นแบบ top-down ให้น้ำสะอาดก่อนจ่ายเข้าครัวเรือน']]
      : [['1 · ACFS — Multi-purpose Storage Tank', 'Bottom-up 7-layer filtration + aeration & 3-point chemical injection to sterilise and deodorise'],
         ['2 · Intelligence PnP — Plug & Pump Station', 'Sensor-controlled flow; alerts on power failure, air in pipes, dry chemicals, overpressure & water level'],
         ['3 · SFX Tower Tank', 'High-tower storage with a top-down 7-layer refiltration before distribution to households']];
    const sizes = lang === 'th'
      ? [['L', '121–300 ครัวเรือน'], ['M', '51–120 ครัวเรือน'], ['S', '30–50 ครัวเรือน']]
      : [['L', '121–300 households'], ['M', '51–120 households'], ['S', '30–50 households']];
    const lines = lang === 'th'
      ? [['POG Tank', 'ระบบบำบัดน้ำสำหรับหมู่บ้านที่ไม่มีประปา ติดตั้ง 3–5 เดือน รับประกัน 2 ปี · ระบบแรกที่ขึ้นบัญชีนวัตกรรมไทย'],
         ['Smart Pure Compact (S-Tank)', 'ถัง ACFS อเนกประสงค์ ใช้ได้กับทุกระบบประปา ใช้พื้นที่น้อย ติดตั้ง 2–5 เดือน รับประกัน 1 ปี'],
         ['POG Drink', 'ระบบกรองน้ำดื่ม Reverse Osmosis กำลังผลิตสูงในดีไซน์กะทัดรัด ดูแลง่าย ต้นทุนต่ำกว่าน้ำขวดมาก']]
      : [['POG Tank', 'Treatment system for villages without mains water; 3–5 month install, 2-yr warranty · 1st in Thai Innovation Registry'],
         ['Smart Pure Compact (S-Tank)', 'Versatile ACFS tank compatible with all supply systems; small footprint, 2–5 month install, 1-yr warranty'],
         ['POG Drink', 'Reverse-osmosis drinking-water system; high capacity, compact, easy to run, far cheaper than bottled water']];
    return R.createElement('div', null,
      R.createElement(InvCard, { p, title: lang === 'th' ? 'องค์ประกอบหลักของ POG Tank' : 'POG Tank Core Components', style: { marginBottom: 14 } },
        R.createElement('div', { style: gridR(3) },
          comps.map((c, i) => R.createElement('div', { key: i, style: { padding: 13, background: p.card2, borderRadius: 12, border: '1px solid ' + p.line } },
            R.createElement('div', { style: { fontSize: 13, fontWeight: 800, color: p.brand, marginBottom: 5 } }, c[0]),
            R.createElement('div', { style: { fontSize: 12, color: p.sub, lineHeight: 1.55 } }, c[1]))))),
      R.createElement('div', { style: Object.assign(gridR(3), { marginBottom: 14 }) },
        sizes.map((s, i) => R.createElement('div', { key: i, style: { background: p.card, border: '1px solid ' + p.line, borderRadius: 14, padding: 16, textAlign: 'center', boxShadow: p.shadow } },
          R.createElement('div', { style: { width: 46, height: 46, margin: '0 auto 8px', borderRadius: 12, background: 'linear-gradient(135deg,' + p.brand + ',' + p.brand2 + ')', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 22, fontWeight: 800 } }, s[0]),
          R.createElement('div', { style: { fontSize: 12.5, color: p.sub } }, s[1])))),
      R.createElement('div', { style: Object.assign(gridR(3), { marginBottom: 14 }) },
        lines.map((l, i) => R.createElement(InvCard, { p, key: i, title: l[0] }, R.createElement('div', { style: { fontSize: 12.5, color: p.sub, lineHeight: 1.6 } }, l[1])))),
      R.createElement('div', { style: gridR(2) },
        R.createElement(InvCard, { p, title: tt.drinkTitle, note: lang === 'th' ? 'ทำสัญญาแล้ว 140 โครงการตั้งแต่ ต.ค.2024' : '140 contracts signed since Oct 2024' },
          R.createElement(InvBars, { p, items: INV_DRINK, color: p.accent })),
        R.createElement(InvCard, { p, title: tt.priceList },
          R.createElement('div', { style: { maxHeight: 300, overflow: 'auto' } },
            INV_PRODUCTS.map((pr, i) => R.createElement('div', { key: i, style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid ' + p.line } },
              R.createElement('div', null, R.createElement('span', { style: { fontWeight: 700, fontSize: 12.5 } }, pr.code), R.createElement('span', { style: { color: p.sub, fontSize: 11.5, marginLeft: 8 } }, pr.name + (m.prodCount[pr.code] ? ' · ' + m.prodCount[pr.code] + (lang === 'th' ? ' โครง' : '') : ''))),
              R.createElement('span', { style: { fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: p.brand } }, '฿' + invFmt(pr.price)))))))
    );
  }

  // ── 4. Market Opportunity (deck p7–10) ────────────────────────────────────────
  function InvMarket({ p, tt, lang }) {
    const mk = INV_MARKET; const penPct = Math.round(mk.served / mk.villages * 1000) / 10;
    const pains = lang === 'th'
      ? ['ระบบกรองแบบ down-flow: ตะกอนรั่วผ่านชั้นกรอง คุณภาพน้ำขึ้นกับสภาพไส้กรอง', 'ซ่อมยาก: ท่อใต้ดินต้องใช้ช่างเฉพาะทาง น้ำสะอาดขาดช่วงระหว่างซ่อม', 'ต้องบำรุงรักษาบ่อย: ไม่มี backwash ต้องเปลี่ยนไส้กรองทุก 6 เดือน', 'ใช้พื้นที่ >625 ตร.ม. และต้องมีช่างหน้างานอย่างน้อย 3 คน', 'ต้องสำรวจน้ำดิบและสร้างเฉพาะที่ ใช้เวล่ากว่า 1 ปี', 'หลายหมู่บ้านไม่มีระบบกรองเลย ใช้สารส้มกรองเอง เสี่ยงสุขภาพ']
      : ['Down-flow filtration: sediment leaks through layers; quality depends on filter condition', 'Hard to fix: underground pipes need specialists; clean water interrupted during repair', 'Frequent maintenance: no backwash, filters replaced every 6 months', 'Uses >625 sqm and needs at least 3 on-site foremen', 'Must survey raw water and customise on-site — over a year to build', 'Many villages have no filtration at all; villagers use alum — a health risk'];
    const sols = lang === 'th'
      ? ['ติดตั้งเร็ว: ใช้พื้นที่เพียง ~80 ตร.ม. ช่างหน้างานคนเดียวคุมทั้งงาน', 'ระบบกรองทนทาน: backwash อัตโนมัติ อยู่ได้ 2 ปีไม่ต้องเปลี่ยน', 'ดูแลง่าย: ท่อบนดิน + ทีมช่างเข้าซ่อมภายใน 48 ชม.', 'ระบบเดียวจบ: รองรับน้ำดิบทุกแบบและทุกขนาดหมู่บ้าน ติดตั้ง 5 เดือน', 'คุณภาพเหนือมาตรฐาน: ผ่าน WHO + รับรอง สวทช. ด้วย ACFS และกรอง 7 ชั้นสองรอบ', 'ระบบ up-flow ต้านแรงโน้มถ่วง ลดการปนเปื้อนและตะกอนรั่ว']
      : ['Fast install: only ~80 sqm; one foreman oversees the whole job', 'Durable filtration: auto-backwash lasts 2 years with no replacement', 'Easy maintenance: on-ground pipes + repair within 48 hrs', 'A system that fits all: any raw water & village size, installs in 5 months', 'Quality beyond standard: WHO-passed + NSTDA-assured, ACFS & twice 7-layer filtration', 'Up-flow filtration works against gravity, minimising contamination & leakage'];
    return R.createElement('div', null,
      R.createElement('div', { style: Object.assign(gridR(4), { marginBottom: 16 }) },
        R.createElement(InvKpi, { p, label: tt.villages, value: invFmt(mk.villages), accent: p.brand }),
        R.createElement(InvKpi, { p, label: tt.withoutTap, value: invFmt(mk.withoutTap), sub: lang === 'th' ? 'หมู่บ้านยังขาดน้ำสะอาด' : 'villages lacking clean water', accent: p.bad }),
        R.createElement(InvKpi, { p, label: 'Water POG', value: invFmt(mk.served) + '+', sub: lang === 'th' ? 'โครงการที่ให้บริการแล้ว' : 'projects served', accent: p.accent }),
        R.createElement(InvKpi, { p, label: tt.mktUntapped, value: '90%+', sub: tt.mktPen, accent: p.gold })),
      R.createElement(InvCard, { p, title: tt.mktPen, note: tt.servedNote, style: { marginBottom: 16 } },
        R.createElement(InvSeg, { p, lang, items: [
          { th: 'มีประปาสะอาด', en: 'With clean tap water', pct: Math.round(mk.withTap / mk.villages * 100), color: p.brand },
          { th: 'ยังไม่มีประปาสะอาด', en: 'Without clean tap water', pct: Math.round(mk.withoutTap / mk.villages * 100), color: p.gold },
        ] }),
        R.createElement('div', { style: { fontSize: 12, color: p.sub, marginTop: 10 } }, lang === 'th' ? 'ตลาดกว่า 90% ยังไม่ถูกเจาะ — โอกาสเติบโตมหาศาลทั่วประเทศ' : 'Over 90% of the market is still untapped — a vast nationwide growth runway')),
      R.createElement('div', { style: gridR(2) },
        R.createElement(InvCard, { p, title: lang === 'th' ? '⚠️ ปัญหาระบบประปาแบบเดิม' : '⚠️ Pain Points of Existing Systems' },
          R.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 9 } },
            pains.map((v, i) => R.createElement('div', { key: i, style: { display: 'flex', gap: 9, alignItems: 'flex-start' } },
              R.createElement('span', { style: { color: p.bad, fontWeight: 800 } }, '✕'), R.createElement('span', { style: { fontSize: 12.5, lineHeight: 1.5 } }, v))))),
        R.createElement(InvCard, { p, title: lang === 'th' ? '✓ POG Tank แก้ครบทุกจุด' : '✓ POG Tank Solves Every Pain Point' },
          R.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 9 } },
            sols.map((v, i) => R.createElement('div', { key: i, style: { display: 'flex', gap: 9, alignItems: 'flex-start' } },
              R.createElement('span', { style: { color: p.good, fontWeight: 800 } }, '✓'), R.createElement('span', { style: { fontSize: 12.5, lineHeight: 1.5 } }, v))))))
    );
  }

  // ── 5. Financial Performance (deck p12) ───────────────────────────────────────
  function InvPerformance({ p, tt, m, lang }) {
    const revBars = INV_FIN_YEARS.map((y, i) => ({ label: y, value: INV_FIN[0].v[i] * 1e6 }));
    const finRows = INV_FIN.map(r => ({ bold: r.bold, cells: [(lang === 'th' ? r.th : r.en)].concat(r.v.map(x => ({ t: r.pct ? (x.toFixed(1) + '%') : invMn(x), neg: x < 0 }))) }));
    return R.createElement('div', null,
      R.createElement('div', { style: Object.assign(gridR(4), { marginBottom: 16 }) },
        R.createElement(InvKpi, { p, label: tt.revenue + ' 2025A', value: '฿958.3M', sub: tt.growth + ' 70.3% YoY', accent: p.brand }),
        R.createElement(InvKpi, { p, label: 'EBITDA 2025A', value: '฿88.5M', sub: '9.2% margin', accent: p.accent }),
        R.createElement(InvKpi, { p, label: (lang === 'th' ? 'กำไรสุทธิ' : 'Net Profit') + ' 2025A', value: '฿17.3M', sub: '1.8% NPM', accent: p.good }),
        R.createElement(InvKpi, { p, label: (lang === 'th' ? 'อัตรากำไรขั้นต้น' : 'Gross Margin') + ' 2025A', value: '27.3%', sub: lang === 'th' ? 'สูงขึ้นต่อเนื่อง' : 'improving trend', accent: p.gold })),
      R.createElement('div', { style: Object.assign(gridR(2), { marginBottom: 14 }) },
        R.createElement(InvCard, { p, title: tt.revenue + ' (2023A–2025A)', note: tt.finUnit }, R.createElement(InvBars, { p, items: revBars, money: true })),
        R.createElement(InvCard, { p, title: lang === 'th' ? 'จุดเด่นทางการเงิน' : 'Financial Highlights' },
          R.createElement('div', { style: { fontSize: 12.5, color: p.sub, lineHeight: 1.7 } },
            lang === 'th'
              ? 'รายได้ฟื้นตัวแรงจาก 562.6 ลบ. (2024A) เป็น 958.3 ลบ. (2025A) คิดเป็นการเติบโต 70.3% · อัตรากำไรขั้นต้นปรับขึ้นต่อเนื่อง 22.8% → 25.3% → 27.3% · พลิกกลับมามี EBITDA และกำไรสุทธิเป็นบวกในปี 2025A'
              : 'Revenue rebounded strongly from THB 562.6 mn (2024A) to THB 958.3 mn (2025A) — 70.3% growth · Gross margin improved steadily 22.8% → 25.3% → 27.3% · Returned to positive EBITDA and net profit in 2025A'))),
      R.createElement(InvCard, { p, title: lang === 'th' ? 'งบกำไรขาดทุนโดยสรุป' : 'Summary P&L', note: tt.finUnit },
        R.createElement(InvTable, { p, head: [lang === 'th' ? 'รายการ' : 'Item'].concat(INV_FIN_YEARS), rows: finRows })),
      R.createElement('div', { style: { fontSize: 11, color: p.sub, marginTop: 8 } }, lang === 'th' ? 'หมายเหตุ: ตัวเลขจากเอกสารนำเสนอนักลงทุน (Project Turtle) · ปรับปรุงด้วยมือเมื่อมีงบปีใหม่' : 'Note: figures from the investor deck (Project Turtle) · updated manually each new fiscal year')
    );
  }

  // ── editable cash-flow config per product (persisted via WTPOverride) ─────────
  const INV_CF_DEF = (c) => ({ contract: c, invAdv1: Math.round(c * 0.17), inv2: Math.round(c * 0.17), inv3: Math.round(c * 0.17), instAdv1: Math.round(c * 0.12), inst3: Math.round(c * 0.12), commPct: 6, lgPct: 5, m1Pct: 40, m2Pct: 60 });
  function InvNumIn({ p, value, onChange, onBlur, w, mono }) {
    return el('input', { type: 'number', value: (value === 0 || value == null) ? '' : value, placeholder: '0',
      onChange: e => onChange(e.target.value === '' ? 0 : Number(e.target.value)), onBlur: onBlur,
      style: { width: w || 88, height: 26, border: '1px solid ' + p.line, borderRadius: 6, padding: '0 6px', background: p.card2, color: p.ink, fontSize: 11.5, fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums' } });
  }

  // build the ordered cash-flow event list from the current config
  function invCfEvents(cfg) {
    const C = cfg.contract || 0;
    return [
      { k: 'mark', th: ['ได้รับใบจัดสรร'], en: ['Allocation letter received'], t: ['วันเริ่มต้น', 'Day 0'] },
      { k: 'out', edit: 'thb', f: 'invAdv1', amt: cfg.invAdv1, th: ['จ่ายค่าของล่วงหน้า (งวด 1)'], en: ['Advance inventory (lot 1)'], t: ['+30 วัน', '+30 days'] },
      { k: 'out', edit: 'pct', f: 'lgPct', amt: C * cfg.lgPct / 100, pv: cfg.lgPct, ret: true, th: ['ออก LG ค้ำประกัน'], en: ['Issue LG (bank guarantee)'], t: ['7 วันก่อนลงนาม', '7 days before signing'] },
      { k: 'mark', th: ['ลงนามสัญญา'], en: ['Contract signing'], t: ['วันที่ 1', 'Day 1'] },
      { k: 'out', edit: 'pct', f: 'commPct', amt: C * cfg.commPct / 100, pv: cfg.commPct, th: ['จ่ายค่าคอมมิชชั่น'], en: ['Pay commission'], t: ['วันลงนาม', 'At signing'] },
      { k: 'out', edit: 'thb', f: 'instAdv1', amt: cfg.instAdv1, th: ['จ่ายค่าติดตั้งล่วงหน้า (งวด 1)'], en: ['Advance installation (lot 1)'], t: ['วันลงนาม', 'At signing'] },
      { k: 'out', edit: 'thb', f: 'inv2', amt: cfg.inv2, th: ['จ่ายค่าของ (งวด 2)'], en: ['Inventory (lot 2)'], t: ['~2 เดือน · เริ่มงานถัง', '~2 months · tank work'] },
      { k: 'out', edit: 'thb', f: 'inv3', amt: cfg.inv3, th: ['จ่ายค่าของ (งวดสุดท้าย)'], en: ['Inventory (final lot)'], t: ['+7 วัน · ติดตั้งถังเสร็จ', '+7 days · tank installed'] },
      { k: 'mark', th: ['ส่งมอบงานงวด 1', 'เคลม 40% ของมูลค่าโครงการ'], en: ['Deliver milestone 1', 'Claim 40% of project value'], t: ['วันติดตั้งเสร็จ', 'Install completion'] },
      { k: 'in', edit: 'pct', f: 'm1Pct', amt: C * cfg.m1Pct / 100, pv: cfg.m1Pct, th: ['รับเงินงวด 1'], en: ['Cash received #1'], t: ['+30 วัน', '+30 days'] },
      { k: 'mark', th: ['ส่งมอบงานงวด 2'], en: ['Deliver milestone 2'], t: ['ก่อสร้างต่อเนื่อง', 'Construction continues'] },
      { k: 'out', edit: 'thb', f: 'inst3', amt: cfg.inst3, th: ['จ่ายค่าติดตั้ง (งวดสุดท้าย)'], en: ['Installation (final)'], t: ['วันส่งมอบงวด 2', 'At milestone 2'] },
      { k: 'in', edit: 'pct', f: 'm2Pct', amt: C * cfg.m2Pct / 100, pv: cfg.m2Pct, th: ['รับเงินงวดสุดท้าย'], en: ['Final cash received'], t: ['+30 วัน', '+30 days'] },
      { k: 'in', amt: C * cfg.lgPct / 100, ret: true, th: ['ได้รับ LG คืน'], en: ['LG returned'], t: ['+2 ปี', '+2 years'] },
    ];
  }

  // ── 6. Project Economics — interactive cash-flow timeline (deck p13–14) ───────
  function InvEconomics({ p, tt, lang }) {
    const [code, setCode] = invSt('PL');
    const prod = INV_PRODUCTS.find(x => x.code === code) || INV_PRODUCTS[0];
    const cfgKey = (c) => 'cfp.' + c;
    const loadCfg = (c, price) => { try { const raw = invGet(cfgKey(c), ''); if (raw) return Object.assign(INV_CF_DEF(price), JSON.parse(raw)); } catch (_) {} return INV_CF_DEF(price); };
    const [cfg, setCfg] = invSt(() => loadCfg('PL', INV_PRODUCTS.find(x => x.code === 'PL').price));
    const cfgRef = invRef(cfg);
    invEff(() => { const c = loadCfg(code, prod.price); cfgRef.current = c; setCfg(c); }, [code]);
    const setField = (k, v) => { const next = Object.assign({}, cfgRef.current, { [k]: v }); cfgRef.current = next; setCfg(next); };
    const persist = () => { try { invSet(cfgKey(code), JSON.stringify(cfgRef.current)); } catch (_) {} };
    const resetCfg = () => { const c = INV_CF_DEF(prod.price); cfgRef.current = c; setCfg(c); invSet(cfgKey(code), JSON.stringify(c)); };

    const C = cfg.contract || 0;
    const events = invCfEvents(cfg);
    const pctOf = (a) => C ? (a / C * 100).toFixed(1) : '0.0';
    // cumulative + key figures
    let run = 0, minRun = 0, beforeRecv1 = 0, seenIn = false;
    events.forEach(e => { const flow = e.k === 'out' ? -e.amt : e.k === 'in' ? e.amt : 0; if (e.k === 'in' && !seenIn) { beforeRecv1 = -run; seenIn = true; } run += flow; if (run < minRun) minRun = run; });
    const peak = -minRun;
    const totalCost = cfg.invAdv1 + cfg.inv2 + cfg.inv3 + cfg.instAdv1 + cfg.inst3 + C * cfg.commPct / 100;
    const margin = C - totalCost;
    const costSeg = [
      { th: 'ค่าของ (Inventory)', en: 'Inventory', pct: Math.round((cfg.invAdv1 + cfg.inv2 + cfg.inv3) / (C || 1) * 100), color: p.brand },
      { th: 'ค่าติดตั้ง', en: 'Installation', pct: Math.round((cfg.instAdv1 + cfg.inst3) / (C || 1) * 100), color: p.brand2 },
      { th: 'คอมมิชชั่น', en: 'Commission', pct: Math.round(cfg.commPct), color: p.gold },
      { th: 'กำไรขั้นต้น', en: 'Margin', pct: Math.max(0, Math.round(margin / (C || 1) * 100)), color: p.accent },
    ];

    // one timeline station
    const station = (e, i) => {
      const isOut = e.k === 'out', isMark = e.k === 'mark';
      const col = isOut ? p.bad : (e.k === 'in' ? p.good : p.brand);
      const valueCard = el('div', { style: { background: p.card, border: '1px solid ' + p.line, borderLeft: '3px solid ' + col, borderRadius: 9, padding: '7px 8px', boxShadow: p.shadow } },
        el('div', { style: { fontSize: 10.5, fontWeight: 800, color: col, lineHeight: 1.25, marginBottom: 5, minHeight: 26 } }, (lang === 'th' ? e.th : e.en)[0]),
        el('div', { style: { display: 'flex', alignItems: 'center', gap: 4 } },
          e.edit ? InvNumIn({ p, value: e.edit === 'pct' ? e.pv : cfg[e.f], w: e.edit === 'pct' ? 50 : 84, onChange: v => setField(e.f, v), onBlur: persist })
            : el('span', { style: { fontSize: 13, fontWeight: 800, color: p.ink, fontVariantNumeric: 'tabular-nums' } }, '฿' + invCompact(e.amt)),
          e.edit === 'pct' ? el('span', { style: { fontSize: 11, color: p.sub, fontWeight: 700 } }, '%') : null),
        el('div', { style: { fontSize: 10, color: p.sub, marginTop: 4 } },
          e.edit === 'thb' ? (pctOf(e.amt) + (lang === 'th' ? '% ของสัญญา' : '% of contract'))
            : e.edit === 'pct' ? ('฿' + invCompact(e.amt))
              : (e.ret ? (lang === 'th' ? 'คืนภายหลัง' : 'returned') : '')));
      const markCard = el('div', { style: { background: p.card2, border: '1px dashed ' + p.brand, borderRadius: 9, padding: '7px 8px' } },
        el('div', { style: { fontSize: 10.5, fontWeight: 800, color: p.brand, lineHeight: 1.25 } }, (lang === 'th' ? e.th : e.en)[0]),
        (lang === 'th' ? e.th : e.en)[1] ? el('div', { style: { fontSize: 9.5, color: p.sub, marginTop: 2, lineHeight: 1.3 } }, (lang === 'th' ? e.th : e.en)[1]) : null);
      return el('div', { key: i, style: { position: 'relative', flex: '0 0 172px', width: 172, height: 250 } },
        (!isOut) ? el('div', { style: { position: 'absolute', top: 4, left: 8, right: 8 } }, isMark ? markCard : valueCard) : null,
        el('div', { style: { position: 'absolute', top: 110, left: 0, right: 0, textAlign: 'center' } },
          el('span', { style: { fontSize: 10, color: p.sub, background: p.bg, padding: '2px 7px', borderRadius: 6, whiteSpace: 'nowrap' } }, (lang === 'th' ? e.t[0] : e.t[1]))),
        el('div', { style: { position: 'absolute', top: 130, left: '50%', transform: 'translateX(-50%)', width: 15, height: 15, borderRadius: '50%', background: col, border: '3px solid ' + p.card, zIndex: 2 } }),
        isOut ? el('div', { style: { position: 'absolute', top: 152, left: 8, right: 8 } }, valueCard) : null);
    };

    const products = INV_PRODUCTS.map(pr => el('option', { key: pr.code, value: pr.code }, pr.code + ' · ' + pr.name + ' (฿' + invCompact(pr.price) + ')'));
    const pipe = lang === 'th'
      ? [['งบประมาณรัฐที่ยืนยันแล้ว', 300], ['งานใน Backlog', 900], ['รวมทั้งหมด', 1200, true], ['เงินทุนที่ต้องใช้ทุกโครงการ', 900], ['สินเชื่อที่คาดว่าต้องใช้', '200–300']]
      : [['Confirmed government budget', 300], ['Backlog projects', 900], ['Total', 1200, true], ['Funding required for all projects', 900], ['Expected loans required', '200–300']];

    return el('div', null,
      // controls
      el('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14, background: p.card, border: '1px solid ' + p.line, borderRadius: 14, padding: '12px 16px', boxShadow: p.shadow } },
        el('div', null,
          el('div', { style: { fontSize: 11, color: p.sub, fontWeight: 600, marginBottom: 4 } }, lang === 'th' ? 'เลือกผลิตภัณฑ์' : 'Select product'),
          el('select', { value: code, onChange: e => setCode(e.target.value), style: { height: 34, minWidth: 240, border: '1px solid ' + p.line, borderRadius: 8, padding: '0 10px', background: p.card2, color: p.ink, fontSize: 12.5, fontWeight: 600 } }, products)),
        el('div', null,
          el('div', { style: { fontSize: 11, color: p.sub, fontWeight: 600, marginBottom: 4 } }, lang === 'th' ? 'มูลค่าสัญญา (บาท)' : 'Contract value (THB)'),
          InvNumIn({ p, value: cfg.contract, w: 150, onChange: v => setField('contract', v), onBlur: persist })),
        el('button', { onClick: resetCfg, style: { height: 34, padding: '0 12px', borderRadius: 8, border: '1px solid ' + p.line, background: p.card2, color: p.sub, fontSize: 12, fontWeight: 600, cursor: 'pointer' } }, lang === 'th' ? '↺ ค่าเริ่มต้น' : '↺ Reset'),
        el('div', { style: { marginLeft: 'auto', fontSize: 11, color: p.sub, maxWidth: 260, lineHeight: 1.45 } }, lang === 'th' ? 'กรอกจำนวนเงิน/% แต่ละงวด — บันทึกอัตโนมัติ (ทีมเห็นร่วมกัน)' : 'Enter amounts/% per stage — saved automatically (shared with the team)')),
      // key figures
      el('div', { style: Object.assign(gridR(4), { marginBottom: 14 }) },
        el(InvKpi, { p, label: lang === 'th' ? 'จ่ายก่อนรับเงินงวดแรก' : 'Paid before first receipt', value: '฿' + invCompact(beforeRecv1), sub: pctOf(beforeRecv1) + (lang === 'th' ? '% ของสัญญา' : '% of contract'), accent: p.bad }),
        el(InvKpi, { p, label: lang === 'th' ? 'เงินทุนหมุนเวียนสูงสุด' : 'Peak funding need', value: '฿' + invCompact(peak), sub: pctOf(peak) + (lang === 'th' ? '% ของสัญญา' : '% of contract'), accent: p.gold }),
        el(InvKpi, { p, label: lang === 'th' ? 'มูลค่าสัญญา' : 'Contract value', value: '฿' + invCompact(C), accent: p.brand }),
        el(InvKpi, { p, label: lang === 'th' ? 'กำไรขั้นต้นโดยประมาณ' : 'Est. gross margin', value: '฿' + invCompact(margin), sub: pctOf(margin) + '%', accent: p.accent })),
      // timeline
      el(InvCard, { p, title: tt.cfTimeline, note: lang === 'th' ? '🔴 จ่ายออก · 🟢 รับเข้า · 🔵 เหตุการณ์' : '🔴 cash out · 🟢 cash in · 🔵 milestone', style: { marginBottom: 14 } },
        el('div', { style: { overflowX: 'auto', paddingBottom: 6 } },
          el('div', { style: { display: 'inline-flex', position: 'relative', minWidth: '100%' } },
            el('div', { style: { position: 'absolute', top: 137, left: 80, right: 40, height: 2, background: p.line, zIndex: 1 } }),
            events.map(station)))),
      // cost structure + pipeline + loans
      el('div', { style: gridR(2) },
        el(InvCard, { p, title: lang === 'th' ? 'โครงสร้างต้นทุนโครงการ (คำนวณจากที่กรอก)' : 'Project Cost Structure (computed)', note: '฿' + invCompact(C) },
          el(InvSeg, { p, lang, items: costSeg }),
          el('div', { style: { fontSize: 12, color: p.sub, marginTop: 12, lineHeight: 1.6 } }, lang === 'th' ? 'ค่าของ+ค่าติดตั้ง = ส่วนที่ต้องใช้เงินทุนหมุนเวียน · LG คืนภายใน 2 ปี' : 'Inventory + installation = the working-capital portion · LG returned within 2 years')),
        el('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
          el(InvCard, { p, title: tt.pipelineTitle },
            el(InvTable, { p, rows: pipe.map(r => ({ bold: r[2], cells: [r[0], (typeof r[1] === 'number' ? invFmt(r[1]) : r[1])] })) })),
          el(InvCard, { p, title: lang === 'th' ? 'วงเงินสินเชื่อปัจจุบัน' : 'Current Loan Facilities' },
            el('div', { style: { fontSize: 12.5, color: p.sub, lineHeight: 1.7 } },
              lang === 'th'
                ? 'KTB Pre-PN วงเงิน 110 ลบ. — เบิกได้ 50% ของมูลค่าโครงการเมื่อได้หนังสือเข้าพื้นที่ · KTB รับสิทธิเก็บเงินจากลูกค้าเพื่อหักเงินต้น+ดอกเบี้ยก่อนคืนส่วนที่เหลือ · LG 5% ของมูลค่าโครงการ'
                : 'KTB Pre-PN credit line of THB 110 mn — draw 50% of project value upon the site-access letter · KTB collects payment to deduct principal + interest before returning the balance · LG 5% of project value')))
      )
    );
  }

  // ── Thailand region map (stylized choropleth + bubbles) ─────────────────────
  function InvThaiMap({ p, byRegion, lang }) {
    const REG = [
      { en: 'North', th: 'ภาคเหนือ', x: 96, y: 80 },
      { en: 'Northeast', th: 'ภาคอีสาน', x: 165, y: 122 },
      { en: 'Central', th: 'ภาคกลาง', x: 116, y: 190 },
      { en: 'West', th: 'ภาคตะวันตก', x: 73, y: 204 },
      { en: 'East', th: 'ภาคตะวันออก', x: 178, y: 230 },
      { en: 'South', th: 'ภาคใต้', x: 118, y: 352 },
    ];
    const cnt = (r) => (byRegion[r.en] || byRegion[r.th] || byRegion[r.th.replace('ภาค', '')] || byRegion[r.en === 'Northeast' ? 'ตะวันออกเฉียงเหนือ' : '_'] || 0);
    const vals = REG.map(cnt); const max = Math.max(1, ...vals); const total = vals.reduce((a, b) => a + b, 0);
    const lerp = (a, b, t) => Math.round(a + (b - a) * t);
    const fillFor = (v) => 'rgb(' + lerp(190, 31, v / max) + ',' + lerp(222, 86, v / max) + ',' + lerp(246, 184, v / max) + ')';
    const SIL = 'M116,22 C146,20 166,36 170,60 C180,54 200,58 204,80 C210,100 202,124 194,140 C188,152 196,166 190,180 C184,192 168,190 158,200 C170,206 184,206 188,220 C194,236 180,252 164,250 C152,248 150,238 142,242 C150,258 150,280 144,300 C138,322 134,352 128,388 C124,414 122,438 117,452 C112,438 108,414 105,388 C100,352 102,322 96,300 C90,280 84,262 86,242 C88,222 76,206 72,188 C66,168 70,144 66,122 C62,100 70,62 90,40 C99,30 108,25 116,22 Z';
    return R.createElement('svg', { viewBox: '0 0 250 470', style: { width: '100%', maxWidth: 340, height: 'auto', display: 'block', margin: '0 auto' } },
      R.createElement('path', { d: SIL, fill: p.card2, stroke: p.line, strokeWidth: 1.5 }),
      REG.map((r, i) => {
        const v = cnt(r); const rad = 11 + Math.sqrt(v / max) * 22;
        return R.createElement('g', { key: i },
          R.createElement('circle', { cx: r.x, cy: r.y, r: rad, fill: fillFor(v), opacity: 0.92, stroke: '#fff', strokeWidth: 1.2 }),
          R.createElement('text', { x: r.x, y: r.y + 1, textAnchor: 'middle', fontSize: 14, fontWeight: 800, fill: v / max > 0.5 ? '#fff' : p.ink, style: { fontVariantNumeric: 'tabular-nums' } }, v),
          R.createElement('text', { x: r.x, y: r.y + rad + 12, textAnchor: 'middle', fontSize: 9.5, fill: p.sub }, lang === 'th' ? r.th : r.en)
        );
      }),
      R.createElement('text', { x: 125, y: 466, textAnchor: 'middle', fontSize: 10, fill: p.sub }, (lang === 'th' ? 'รวม ' : 'Total ') + total + (lang === 'th' ? ' โครงการ' : ' projects'))
    );
  }

  // ── 7. Customers & Projects (live data) ───────────────────────────────────────
  function InvCustomers({ p, tt, m, toast, lang }) {
    const [gallery, setGallery] = invSt([]);
    const prov = Object.keys(m.byProv).map(k => ({ label: k, value: m.byProv[k] })).sort((a, b) => b.value - a.value).slice(0, 12);
    const onImg = (files) => {
      const arr = [];
      [].slice.call(files || []).forEach(f => { if (/^image\//.test(f.type)) arr.push(URL.createObjectURL(f)); });
      if (arr.length) setGallery(g => [...arr, ...g]);
    };
    return R.createElement('div', null,
      R.createElement('div', { style: Object.assign(gridR(2), { marginBottom: 16 }) },
        R.createElement(InvCard, { p, title: tt.byRegion }, R.createElement(InvThaiMap, { p, byRegion: m.byRegion, lang })),
        R.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
          R.createElement(InvCard, { p, title: tt.topProv }, R.createElement(InvBars, { p, items: prov.length ? prov : [{ label: '—', value: 0 }], color: p.brand2 })),
          R.createElement(InvCard, { p, title: tt.statusFunnel },
            R.createElement(InvBars, { p, items: Object.keys(m.byStatus).length ? Object.keys(m.byStatus).map(k => ({ label: k, value: m.byStatus[k] })) : [{ label: '—', value: 0 }] })))),
      R.createElement(InvCard, { p, title: tt.gallery },
        R.createElement('label', { style: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 9, background: p.brand, color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', marginBottom: 12 } },
          '📷 ' + tt.uploadImg, R.createElement('input', { type: 'file', accept: 'image/*', multiple: true, style: { display: 'none' }, onChange: e => onImg(e.target.files) })),
        gallery.length ? R.createElement('div', { style: gridR(4) }, gallery.map((src, i) => R.createElement('img', { key: i, src, style: { width: '100%', height: 130, objectFit: 'cover', borderRadius: 10, border: '1px solid ' + p.line } })))
          : R.createElement('div', { style: { color: p.sub, fontSize: 12.5, padding: 20, textAlign: 'center' } }, tt.noData + ' — ' + tt.uploadImg))
    );
  }

  // ── 8. Team & Shareholding (deck p15) ─────────────────────────────────────────
  function InvTeam({ p, tt, lang }) {
    const grpRows = Object.keys(INV_SHARE_GRP).map(k => ({ bold: true, cells: [(lang === 'th' ? INV_SHARE_GRP[k].th : INV_SHARE_GRP[k].en), { t: INV_SHARE_GRP[k].pct.toFixed(1) + '%' }] }));
    const shareRows = INV_SHARE.map(s => ({ cells: [s.name, { t: s.pct.toFixed(1) + '%' }] }));
    const grpSeg = Object.keys(INV_SHARE_GRP).map((k, i) => ({ th: INV_SHARE_GRP[k].th, en: INV_SHARE_GRP[k].en, pct: INV_SHARE_GRP[k].pct, color: [p.brand, p.accent, p.gold][i] }));
    return R.createElement('div', null,
      R.createElement('div', { style: { display: 'inline-block', padding: '4px 12px', borderRadius: 99, background: p.bad, color: '#fff', fontSize: 11, fontWeight: 700, marginBottom: 12 } }, '🔒 ' + tt.confidential),
      R.createElement(InvCard, { p, title: '👤 ' + tt.founderTitle, style: { marginBottom: 14 } },
        R.createElement('div', { style: gridR(3) },
          INV_FOUNDERS.map((f, i) => R.createElement('div', { key: i, style: { padding: 14, background: p.card2, borderRadius: 12, border: '1px solid ' + p.line } },
            R.createElement('div', { style: { width: 42, height: 42, borderRadius: '50%', background: 'linear-gradient(135deg,' + p.brand + ',' + p.brand2 + ')', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 18, fontWeight: 800, marginBottom: 9 } }, (lang === 'th' ? f.th : f.en)[0].replace(/^(นาย|น\.ส\.|นาง)/, '').trim().charAt(0)),
            R.createElement('div', { style: { fontSize: 13.5, fontWeight: 800, color: p.ink } }, (lang === 'th' ? f.th : f.en)[0]),
            R.createElement('div', { style: { fontSize: 12, color: p.brand, fontWeight: 600, marginBottom: 8 } }, (lang === 'th' ? f.th : f.en)[1]),
            R.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
              (lang === 'th' ? f.bullets_th : f.bullets_en).map((b, j) => R.createElement('div', { key: j, style: { fontSize: 11.5, color: p.sub, lineHeight: 1.5, display: 'flex', gap: 6 } },
                R.createElement('span', { style: { color: p.accent } }, '•'), b)))))) ),
      R.createElement('div', { style: gridR(2) },
        R.createElement(InvCard, { p, title: '📊 ' + tt.shareTitle, note: tt.shareNote },
          R.createElement(InvSeg, { p, lang, items: grpSeg }),
          R.createElement('div', { style: { marginTop: 14 } }, R.createElement(InvTable, { p, rows: grpRows }))),
        R.createElement(InvCard, { p, title: lang === 'th' ? 'รายชื่อผู้ถือหุ้น' : 'Shareholder List' },
          R.createElement('div', { style: { maxHeight: 360, overflow: 'auto' } }, R.createElement(InvTable, { p, head: [lang === 'th' ? 'ผู้ถือหุ้น' : 'Shareholder', '%'], rows: shareRows }))))
    );
  }

  // ── 9. Sustainability / ESG (deck p16–18) ─────────────────────────────────────
  function InvESG({ p, tt, lang }) {
    return R.createElement('div', null,
      R.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
        INV_ESG.map((e, i) => R.createElement(InvCard, { p, key: i, title: e.icon + ' ' + (lang === 'th' ? e.th : e.en)[0] },
          R.createElement('div', { style: gridR(2) },
            R.createElement('div', null,
              R.createElement('div', { style: { fontSize: 13, color: p.sub, lineHeight: 1.65, marginBottom: 10 } }, (lang === 'th' ? e.th : e.en)[1]),
              e.bullets_th ? R.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
                (lang === 'th' ? e.bullets_th : e.bullets_en).map((b, j) => R.createElement('div', { key: j, style: { fontSize: 12, color: p.ink, display: 'flex', gap: 7 } },
                  R.createElement('span', { style: { color: p.accent, fontWeight: 800 } }, '✓'), b))) : null),
            R.createElement('div', null,
              R.createElement('div', { style: { fontSize: 11.5, color: p.sub, fontWeight: 700, marginBottom: 8 } }, lang === 'th' ? e.idx_th : e.idx_en),
              e.bars ? R.createElement(InvBars, { p, items: e.bars, color: p.accent, suffix: '' }) : R.createElement('div', { style: { fontSize: 12, color: p.sub, fontStyle: 'italic' } }, lang === 'th' ? 'POG ช่วยยกระดับโครงสร้างพื้นฐานน้ำของชุมชนทั่วประเทศ' : 'POG uplifts community water infrastructure nationwide'))))))
    );
  }

  // ── 10. Investor Room (document center: PDF + video) ──────────────────────────
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
    return R.createElement('div', { style: gridR(2) },
      R.createElement(InvCard, { p, title: '📄 ' + tt.docCenter },
        R.createElement('label', { style: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 9, background: p.brand, color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', marginBottom: 12 } },
          tt.uploadPdf, R.createElement('input', { type: 'file', accept: 'application/pdf', style: { display: 'none' }, onChange: e => onPdf(e.target.files[0]) })),
        pdf ? R.createElement('iframe', { src: pdf, style: { width: '100%', height: 460, border: '1px solid ' + p.line, borderRadius: 10 } })
          : R.createElement('div', { style: { color: p.sub, fontSize: 12.5, padding: 30, textAlign: 'center', border: '1px dashed ' + p.line, borderRadius: 10 } }, tt.noData + ' — ' + tt.uploadPdf + ' (Project Turtle, งบการเงิน, Company Profile)')),
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
