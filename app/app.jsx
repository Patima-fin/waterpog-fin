// Water POG Financial Dashboard – App shell, sidebar nav, routing, tweaks integration.
// Globals: React, ReactDOM, all dashboards & pages, WTPData

const { useState: aState, useEffect: aEffect, useMemo: aMemo } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "themeMode": "blue",
  "accentHue": 245,
  "fontPair": "plex",
  "density": "regular",
  "showAnimations": true,
  "sidebarStyle": "filled"
}/*EDITMODE-END*/;

// ─── Role-based permission system ──────────────────────────────────────────
//
// Routes accessible per role + action flags. Read via window.WTPAuth.* helpers
// from any page. Role is set at login (in handleLogin) and persists in the
// session object in localStorage; it never changes mid-session so a simple
// global-object pattern is enough (no Context / re-render churn needed).
const ROLE_PERMS = {
  // ผู้บริหาร — เห็นเฉพาะ Dashboard (รายงานรับเงินรายวัน + War Room) — ไม่เห็นประมาณการ
  viewer: {
    pages: new Set(['daily', 'warroom1', 'warroom2']),
    canEdit: false, canDelete: false, canApprove: false, canManageUsers: false,
  },
  // ฝ่ายการเงิน — ทำงานปกติ เพิ่ม/แก้ได้ แต่ลบไม่ได้ + ไม่เห็น audit + users
  staff: {
    pages: '*', excludePages: new Set(['users', 'audit_log']),
    canEdit: true, canDelete: false, canApprove: true, canManageUsers: false,
  },
  // หัวหน้า — ทำได้ทุกอย่าง รวมจัดการ users + ดู audit log
  manager: {
    pages: '*',
    canEdit: true, canDelete: true, canApprove: true, canManageUsers: true,
  },
  // เจ้าของ — ดูได้ทุกหน้า แต่แก้/ลบไม่ได้ + ไม่เห็น audit + users
  owner: {
    pages: '*', excludePages: new Set(['users', 'audit_log']),
    canEdit: false, canDelete: false, canApprove: false, canManageUsers: false,
  },
};
function _getRole() {
  try {
    const s = JSON.parse(localStorage.getItem('wtp-session') || 'null');
    return (s && s.role) || 'viewer';
  } catch { return 'viewer'; }
}
function _getPerms(role) { return ROLE_PERMS[role] || ROLE_PERMS.viewer; }
window.WTPAuth = {
  role() { return _getRole(); },
  can(action) { return _getPerms(_getRole())[action] === true; },
  canViewPage(route) {
    const p = _getPerms(_getRole());
    if (p.pages === '*') return !p.excludePages || !p.excludePages.has(route);
    return p.pages.has(route);
  },
  // First page this role is allowed to see — used for redirecting after login
  firstAllowedPage(allRoutes) {
    return allRoutes.find(r => this.canViewPage(r)) || 'daily';
  },
};

function App() {
  const [isLoggedIn, setIsLoggedIn] = aState(() => {
    try {
      const s = JSON.parse(localStorage.getItem('wtp-session') || 'null');
      if (!s) return false;
      const ttl = (window.WTP_CONFIG && window.WTP_CONFIG.SESSION_TTL_MS) || 0;
      if (ttl > 0 && Date.now() - s.time > ttl) { localStorage.removeItem('wtp-session'); return false; }
      return true;
    } catch { return false; }
  });
  const [currentUser, setCurrentUser] = aState(() => {
    try {
      const s = JSON.parse(localStorage.getItem('wtp-session') || 'null');
      return s || null;
    } catch { return null; }
  });

  const handleLogin = (userObj) => {
    const session = { ...userObj, time: Date.now() };
    localStorage.setItem('wtp-session', JSON.stringify(session));
    setCurrentUser(session);
    setIsLoggedIn(true);
  };
  const handleLogout = () => {
    localStorage.removeItem('wtp-session');
    setIsLoggedIn(false);
    setCurrentUser(null);
  };

  const [route, setRoute] = aState(() => {
    const h = window.location.hash.replace(/^#/, '');
    return h || 'daily';
  });
  const [data, setData] = aState(() => WTPData.load());
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const { push: pushToast, node: toastNode } = useToasts();
  const [syncInfo, setSyncInfo] = aState(() => WTPData.getSyncStatus ? WTPData.getSyncStatus() : { status: 'offline', time: null });

  // Persist data on change + expose globally for debugging in DevTools console
  aEffect(() => {
    WTPData.save(data);
    window.__wtpData = data;
    if (WTPData.buildLookups) {
      try { window.__wtpLookups = WTPData.buildLookups(data); } catch (_) {}
    }
  }, [data]);

  // Subscribe to server data updates (from data_sync.js)
  aEffect(() => {
    if (!WTPData.subscribe) return;
    const unsub = WTPData.subscribe(serverData => setData(serverData));
    const onStatus = e => setSyncInfo(e.detail);
    window.addEventListener('wtpSyncStatus', onStatus);
    return () => { unsub(); window.removeEventListener('wtpSyncStatus', onStatus); };
  }, []);

  aEffect(() => {
    const onHash = () => setRoute(window.location.hash.replace(/^#/, '') || 'daily');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Mobile sidebar drawer state — true = open
  const [sbOpen, setSbOpen] = aState(false);
  const closeSb = () => setSbOpen(false);
  const openSb  = () => setSbOpen(true);

  // Auto-close drawer when route changes (after tapping a nav item)
  aEffect(() => { setSbOpen(false); }, [route]);

  // Lock body scroll while drawer is open on mobile
  aEffect(() => {
    document.body.style.overflow = sbOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [sbOpen]);

  const go = (r) => {
    if (window.WTPAuth && !window.WTPAuth.canViewPage(r)) return;   // block forbidden routes
    window.location.hash = '#' + r;
    setRoute(r);
  };

  // Route guard — if user can't view current route, redirect to first allowed page
  aEffect(() => {
    if (!isLoggedIn || !window.WTPAuth) return;
    if (!window.WTPAuth.canViewPage(route)) {
      // Pull routes object below — at this point it's not defined yet, fallback inline
      const order = ['daily','warroom1','warroom2','cashflow','debt','debt_ledger',
                     'iv_report','receipts','bank_diary','interest_calc','sts_calc','sts_workflow',
                     'projects','invoices','checks','data_forecast','data_bank','data_pv','data_payable'];
      const allowed = window.WTPAuth.firstAllowedPage(order);
      if (allowed !== route) {
        window.location.hash = '#' + allowed;
        setRoute(allowed);
      }
    }
  }, [route, isLoggedIn]);

  // Apply tweaks to CSS vars
  aEffect(() => {
    const root = document.documentElement;
    // Theme palette
    const themes = {
      blue:    { 500: '#2a6fdb', 600: '#1f56b8', 700: '#1a4490', 800: '#16356f', 400: '#5b94f7', 300: '#8db8ff', 200: '#b9d4ff', 100: '#dceaff', 50: '#f0f6ff' },
      teal:    { 500: '#0d9488', 600: '#0f766e', 700: '#115e59', 800: '#134e4a', 400: '#2dd4bf', 300: '#5eead4', 200: '#99f6e4', 100: '#ccfbf1', 50: '#f0fdfa' },
      indigo:  { 500: '#4f46e5', 600: '#4338ca', 700: '#3730a3', 800: '#312e81', 400: '#818cf8', 300: '#a5b4fc', 200: '#c7d2fe', 100: '#e0e7ff', 50: '#eef2ff' },
      slate:   { 500: '#475569', 600: '#334155', 700: '#1e293b', 800: '#0f172a', 400: '#94a3b8', 300: '#cbd5e1', 200: '#e2e8f0', 100: '#f1f5f9', 50: '#f8fafc' },
    };
    const t = themes[tweaks.themeMode] || themes.blue;
    Object.entries(t).forEach(([k, v]) => root.style.setProperty(`--brand-${k}`, v));
    // Density class
    document.body.classList.toggle('dense', tweaks.density === 'compact');
    // Fonts
    const fonts = {
      plex:    '"IBM Plex Sans Thai", "IBM Plex Sans", ui-sans-serif, system-ui, -apple-system, sans-serif',
      sarabun: '"Sarabun", "Inter", ui-sans-serif, system-ui, -apple-system, sans-serif',
      noto:    '"Noto Sans Thai Looped", "Inter", ui-sans-serif, system-ui, -apple-system, sans-serif',
      kanit:   '"Kanit", "Inter", ui-sans-serif, system-ui, -apple-system, sans-serif',
    };
    document.body.style.fontFamily = fonts[tweaks.fontPair] || fonts.plex;
    // Animations
    document.body.style.setProperty('--anim-toggle', tweaks.showAnimations ? '1' : '0');
    root.classList.toggle('no-anim', !tweaks.showAnimations);
  }, [tweaks]);

  const resetDemo = () => {
    if (!confirm('รีเซ็ตข้อมูลกลับเป็นค่าตั้งต้น?')) return;
    setData(WTPData.reset());
    pushToast('รีเซ็ตข้อมูลเรียบร้อย');
  };

  // ── Render
  if (!isLoggedIn) return <LoginPage onLogin={handleLogin} />;

  const routes = {
    daily: { label: 'รายงานรับเงินประจำวัน', title: 'Daily Revenue', icon: 'daily' },
    warroom1: { label: 'War Room — รายรับ (หน้า 1)', title: 'Revenue Collection', icon: 'receivables' },
    warroom2: { label: 'War Room — รายปี (หน้า 2)', title: 'Annual Cash Flow', icon: 'forecast' },
    cashflow: { label: 'แผนประมาณการจ่ายรายสัปดาห์', title: 'Weekly Cash Flow', icon: 'chart' },
    debt:        { label: 'ภาระหนี้ทั้งหมด',       title: 'Debt Register',   icon: 'money' },
    debt_ledger: { label: 'Debt Ledger · ดอกเบี้ย', title: 'Debt Ledger',     icon: 'money' },
    iv_report:   { label: 'รายงานติดตาม IV',         title: 'IV Tracking Report', icon: 'invoice' },
    receipts:    { label: 'ประวัติรับเงิน',           title: 'Receipts History', icon: 'receivables' },
    bank_diary:    { label: 'Bank Diary',               title: 'Bank Diary',      icon: 'bank' },
    interest_calc: { label: 'คำนวณดอกเบี้ย',          title: 'Interest Schedule Calculator', icon: 'money' },
    sts_calc:      { label: 'STS Calculator',          title: 'STS Encompass Fee Calculator', icon: 'money' },
    sts_workflow:  { label: 'STS Workflow',             title: 'STS Workflow · review queue',  icon: 'invoice' },
    projects: { label: 'จัดการโครงการ', title: 'Projects', icon: 'projects' },
    invoices: { label: 'ใบแจ้งหนี้', title: 'Invoices', icon: 'invoice' },
    checks:    { label: 'เช็คจ่ายล่วงหน้า', title: 'Checks', icon: 'money' },
    data_forecast: { label: 'ประมาณการนอกระบบ', title: 'Forecast Entries', icon: 'forecast' },
    data_bank:     { label: 'DATA BANK', title: 'Bank Accounts', icon: 'bank' },
    data_pv:       { label: 'DATA PV', title: 'Payment Vouchers', icon: 'money' },
    data_payable:  { label: 'DATA เจ้าหนี้คงค้าง', title: 'Accounts Payable', icon: 'invoice' },
    audit_log:     { label: 'Audit Log',           title: 'Audit Log — ประวัติแก้ไข', icon: 'settings' },
    users:         { label: 'จัดการผู้ใช้',         title: 'Users · จัดการผู้ใช้ระบบ', icon: 'settings' },
    daily_balance: { label: 'บันทึกยอดธนาคาร',     title: 'บันทึกยอดธนาคารรายวัน', icon: 'bank' },
  };

  let page;
  switch (route) {
    case 'warroom1':       page = <WarRoomPage1 data={data} setData={setData} toast={pushToast} />; break;
    case 'warroom2':       page = <WarRoomPage2 data={data} setData={setData} toast={pushToast} />; break;
    case 'cashflow':       page = <CashFlowDashboard data={data} setData={setData} toast={pushToast} />; break;
    case 'projects':       page = <ProjectsPage data={data} setData={setData} toast={pushToast} />; break;
    case 'invoices':       page = <InvoicesPage data={data} setData={setData} toast={pushToast} />; break;
    case 'debt':           page = <DebtPage data={data} />; break;
    case 'debt_ledger':    page = <DebtLedgerPage data={data} />; break;
    case 'iv_report':      page = <IvReportStandalonePage data={data} setData={setData} toast={pushToast} />; break;
    case 'receipts':       page = <ReceiptsPage data={data} />; break;
    case 'bank_diary':     page = <BankDiaryPage data={data} setData={setData} toast={pushToast} />; break;
    case 'interest_calc':  page = <InterestCalcPage data={data} />; break;
    case 'sts_calc':       page = <StsCalcPage data={data} />; break;
    case 'sts_workflow':   page = <StsWorkflowPage data={data} setData={setData} toast={pushToast} />; break;
    case 'checks':         page = <ChecksPage data={data} />; break;
    case 'data_forecast':  page = <ForecastEntriesPage data={data} setData={setData} toast={pushToast} />; break;
    case 'data_bank':      page = <DataBankPage data={data} setData={setData} toast={pushToast} />; break;
    case 'data_pv':        page = <DataPVPage data={data} setData={setData} toast={pushToast} />; break;
    case 'data_payable':   page = <DataPayablePage data={data} setData={setData} toast={pushToast} />; break;
    case 'audit_log':      page = <AuditLogPage data={data} toast={pushToast} />; break;
    case 'users':          page = <UsersPage data={data} setData={setData} toast={pushToast} />; break;
    case 'daily_balance':  page = <DailyBalancePage data={data} setData={setData} toast={pushToast} />; break;
    case 'daily':
    default:               page = <DailyRevenueDashboard data={data} setData={setData} toast={pushToast} />;
  }

  return (
    <div className="app">
      <Sidebar route={route} go={go} routes={routes} data={data} sidebarStyle={tweaks.sidebarStyle} syncInfo={syncInfo} currentUser={currentUser} onLogout={handleLogout} isOpen={sbOpen} onClose={closeSb} />
      <div className={`sb-scrim ${sbOpen ? 'is-open' : ''}`} onClick={closeSb} aria-hidden="true" />
      <div className="main">
        <Topbar route={route} routes={routes} data={data} onReset={resetDemo} onMenuClick={openSb} />
        <div data-screen-label={route}>
          {page}
        </div>
      </div>

      <TweaksPanel title="Tweaks">
        <TweakSection label="ธีมสี" />
        <TweakRadio label="ชุดสี" value={tweaks.themeMode} options={[
          { value: 'blue', label: 'น้ำเงิน' },
          { value: 'teal', label: 'เขียวน้ำ' },
          { value: 'indigo', label: 'คราม' },
          { value: 'slate', label: 'ทึบ' },
        ]} onChange={(v)=>setTweak('themeMode', v)} />

        <TweakSection label="ตัวอักษร / ความหนาแน่น" />
        <TweakRadio label="ฟอนต์ไทย" value={tweaks.fontPair} options={[
          { value: 'plex', label: 'Plex Thai' },
          { value: 'sarabun', label: 'Sarabun' },
          { value: 'noto', label: 'Noto Looped' },
          { value: 'kanit', label: 'Kanit' },
        ]} onChange={(v)=>setTweak('fontPair', v)} />
        <TweakRadio label="ระยะห่าง" value={tweaks.density} options={['compact', 'regular']} onChange={(v)=>setTweak('density', v)} />

        <TweakSection label="แสดงผล" />
        <TweakToggle label="แอนิเมชั่น" value={tweaks.showAnimations} onChange={(v)=>setTweak('showAnimations', v)} />
        <TweakRadio  label="สไตล์ Sidebar" value={tweaks.sidebarStyle} options={[
          { value: 'filled', label: 'เต็มสี' },
          { value: 'minimal', label: 'มินิมอล' },
        ]} onChange={(v)=>setTweak('sidebarStyle', v)} />

        <TweakSection label="ข้อมูลตัวอย่าง" />
        <TweakButton label="รีเซ็ต Mock Data" onClick={resetDemo} />
      </TweaksPanel>

      {toastNode}
    </div>
  );
}

function Sidebar({ route, go, routes, data, sidebarStyle, syncInfo = {}, currentUser, onLogout, isOpen, onClose }) {
  const [sec, setSec] = aState({ dash: true, reports: true, manage: true, system: true });
  const tog = k => setSec(p => ({ ...p, [k]: !p[k] }));

  const syncLabel = (() => {
    if (!syncInfo || syncInfo.status === 'offline') return 'Offline — ใช้ข้อมูล Local';
    if (syncInfo.status === 'syncing') return 'กำลัง sync…';
    if (syncInfo.status === 'error')   return 'เชื่อมต่อไม่ได้ ⚠';
    if (syncInfo.time) {
      const diff = Math.round((Date.now() - syncInfo.time) / 60000);
      return diff < 1 ? 'Sync เมื่อกี้' : `Sync ${diff} นาทีที่แล้ว`;
    }
    return 'เชื่อมต่อ Google Sheets';
  })();
  const syncDot = { offline:'#94a3b8', syncing:'#f59e0b', error:'#ef4444', ok:'#22c55e' }[syncInfo.status || 'offline'];
  /* eslint-disable no-unused-vars */
  const counts = {
    daily: data.invoices.filter(iv => iv.receivedAt === data.daily.asOfDate).length || null,
    cashflow: null,
    receivables: null,
    projects: data.projects.length,
    invoices: data.invoices.length,
    data_forecast: data.forecastEntries.length,
    data_bank:     data.bankAccounts?.length || 0,
    data_pv:       data.pvVouchers?.length || 0,
    data_payable:  data.payables?.length || 0,
    debt:          data.debtMaster?.filter(r => r.status === 'Active').length || null,
    debt_ledger:   data.debtMaster?.filter(r => r.status === 'Active').length || null,
    iv_report:     data.invoices?.filter(iv => iv.status !== 'paid').length || null,
    receipts:      data.receipts?.length || null,
    bank_diary:    null,
    interest_calc: null,
    checks:        data.checks?.filter(c => c.status === 'pending' || c.status === 'clearing').length || null,
    daily_balance: (() => {
      // Number of MAIN bank accounts that don't have today's snapshot yet.
      // Only shows for users who opted into daily-balance reminders.
      if (!currentUser || !currentUser.notifyDailyBalance) return null;
      const today = new Date().toISOString().slice(0, 10);
      const mains = (data.bankAccounts || []).filter(a => {
        const t = (a.accountType || 'main').toLowerCase();
        return t !== 'closed' && t !== 'dormant';
      });
      const snapped = new Set((data.cashflowSnapshots || [])
        .filter(s => s.date === today)
        .map(s => s.bankAc));
      const missing = mains.filter(a => !snapped.has(a.Bank_AC)).length;
      return missing > 0 ? missing : null;
    })(),
  };

  const secHdrStyle = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    cursor: 'pointer', userSelect: 'none', WebkitUserSelect: 'none',
  };
  const chevron = (open) => (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
      style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 180ms ease', flexShrink: 0, color: 'var(--ink-400)' }}>
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  );

  // Filter nav items by role — viewer/owner see fewer
  const navItems = (items) => items
    .filter(([key]) => window.WTPAuth ? window.WTPAuth.canViewPage(key) : true)
    .map(([key, label, icon]) => (
      <button key={key} className={`sb-link ${route === key ? 'active' : ''}`} onClick={() => go(key)}>
        <Icon name={icon} className="sb-icon" />
        <span>{label}</span>
        {counts[key] != null && <span className="sb-pill">{counts[key]}</span>}
      </button>
    ));

  return (
    <aside className={`sb ${isOpen ? 'is-open' : ''}`}>
      <div className="sb-brand" style={{ position: 'relative' }}>
        <img src="waterpog_Logo-02.png" alt="Water POG" className="sb-logo-img" />
        <div className="sb-brand-sub" style={{ marginTop: 2 }}>Financial Console</div>
        {/* Close button — only visible on mobile drawer */}
        {onClose && (
          <button
            onClick={onClose}
            aria-label="ปิดเมนู"
            className="sb-close-btn"
            style={{
              position: 'absolute', top: -4, right: -4,
              width: 32, height: 32, borderRadius: 8,
              border: 0, background: 'transparent',
              color: 'var(--ink-500)', cursor: 'pointer',
              display: 'none', alignItems: 'center', justifyContent: 'center',
            }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        )}
      </div>

      {/* ── Scrollable nav area ── */}
      <nav style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingBottom: 6 }}>
        <div>
          <div className="sb-section" style={secHdrStyle} onClick={() => tog('dash')}>
            <span>แดชบอร์ด</span>{chevron(sec.dash)}
          </div>
          {sec.dash && navItems([
            ['daily',    'รายงานรับเงินรายวัน',    'daily'],
            ['warroom1', 'War Room · รายรับ',       'receivables'],
            ['warroom2', 'War Room · รายปี',        'forecast'],
            ['cashflow', 'กระแสเงินสดรายสัปดาห์', 'chart'],
          ])}
        </div>

        <div>
          <div className="sb-section" style={secHdrStyle} onClick={() => tog('reports')}>
            <span>รายงาน / วิเคราะห์</span>{chevron(sec.reports)}
          </div>
          {sec.reports && navItems([
            ['debt',          'ภาระหนี้ทั้งหมด',       'money'],
            ['debt_ledger',   'Debt Ledger · ดอกเบี้ย','money'],
            ['iv_report',     'รายงานติดตาม IV',       'invoice'],
            ['receipts',      'ประวัติรับเงิน',         'receivables'],
            ['bank_diary',    'Bank Diary',             'bank'],
            ['interest_calc', 'คำนวณดอกเบี้ย',         'money'],
            ['sts_calc',      'STS Calculator',         'money'],
            ['sts_workflow',  'STS Workflow',           'invoice'],
          ])}
        </div>

        <div>
          <div className="sb-section" style={secHdrStyle} onClick={() => tog('manage')}>
            <span>จัดการข้อมูล</span>{chevron(sec.manage)}
          </div>
          {sec.manage && navItems([
            ['projects',      'โครงการ',          'projects'],
            ['invoices',      'ลูกหนี้คงค้าง',    'invoice'],
            ['checks',        'เช็คจ่ายล่วงหน้า', 'money'],
            ['data_forecast', 'ประมาณการรายจ่าย', 'forecast'],
            ['data_bank',     'บัญชีธนาคาร',      'bank'],
            ['data_pv',       'ใบสำคัญจ่าย',      'money'],
            ['data_payable',  'เจ้าหนี้คงค้าง',   'arrow_up'],
            ['daily_balance', 'บันทึกยอดธนาคาร',  'bank'],
          ])}
        </div>

        {/* ระบบ — only visible to manager (audit_log + users) */}
        {(window.WTPAuth && window.WTPAuth.can('canManageUsers')) && (
          <div>
            <div className="sb-section" style={secHdrStyle} onClick={() => tog('system')}>
              <span>ระบบ</span>{chevron(sec.system !== false)}
            </div>
            {(sec.system !== false) && navItems([
              ['audit_log',     'Audit Log',         'settings'],
              ['users',         'จัดการผู้ใช้',     'settings'],
            ])}
          </div>
        )}
      </nav>

      {/* ── Pinned user / logout ── */}
      <div className="sb-user">
        <div className="sb-avatar">{currentUser ? currentUser.displayName.slice(0,2) : 'FA'}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-800)' }}>{currentUser ? currentUser.displayName : 'ฝ่ายการเงิน'}</div>
          <div style={{ fontSize: 10.5, color: 'var(--ink-400)', display:'flex', alignItems:'center', gap:4 }}>
            <span style={{ width:5, height:5, borderRadius:'50%', background: syncDot, flexShrink:0 }} />
            {syncLabel}
          </div>
        </div>
        <button onClick={onLogout} title="ออกจากระบบ" style={{ background:'none', border:'none', cursor:'pointer', color:'var(--ink-300)', padding:4, borderRadius:5, display:'flex', alignItems:'center', transition:'color 160ms' }}
          onMouseEnter={e => e.currentTarget.style.color='var(--bad)'}
          onMouseLeave={e => e.currentTarget.style.color='var(--ink-300)'}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>
    </aside>
  );
}

function Topbar({ route, routes, data, onReset, onMenuClick }) {
  const r = routes[route] || routes.daily;
  const today = new Date().toLocaleDateString('th-TH-u-ca-gregory', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const isPresentation = ['daily', 'warroom1', 'warroom2', 'cashflow'].includes(route);
  return (
    <div className="topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
        {/* Hamburger — only visible on tablet/phone via CSS */}
        <button className="menu-btn" onClick={onMenuClick} aria-label="เปิดเมนู">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <div className="crumbs">
          <span>Water POG</span><span className="sep">/</span>
          <span>{isPresentation ? 'นำเสนอ' : 'จัดการข้อมูล'}</span>
          <span className="sep">/</span>
          <span className="now">{r.label}</span>
        </div>
      </div>
      <div className="tb-actions">
        <div className="tb-search">
          <Icon name="search" size={14} />
          <input placeholder="ค้นหาโครงการ / IV…" />
        </div>
        <div className="tb-date">
          <Icon name="daily" size={13} />
          <span>{today}</span>
        </div>
      </div>
    </div>
  );
}

function LoginPage({ onLogin }) {
  const [username, setUsername] = aState('');
  const [password, setPassword] = aState('');
  const [error, setError]       = aState('');
  const [loading, setLoading]   = aState(false);
  const [showPw, setShowPw]     = aState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    // Build user list: Sheet users (from synced data) take priority,
    // then config users as bootstrap fallback for first-ever login.
    let users = [];
    try {
      const cached = JSON.parse(localStorage.getItem('wtp-fin-data-v8') || 'null');
      const sheetUsers = (cached && Array.isArray(cached.users)) ? cached.users : [];
      // Treat active='false' / 'no' / '0' as disabled; everything else is active
      const isActive = (u) => {
        const a = String(u.active == null ? 'true' : u.active).toLowerCase().trim();
        return a !== 'false' && a !== 'no' && a !== '0' && a !== 'inactive' && a !== 'disabled';
      };
      users = sheetUsers.filter(isActive);
    } catch (_) {}
    const configUsers = (window.WTP_CONFIG && window.WTP_CONFIG.USERS) || [];
    // Append config users that aren't already in Sheet users
    const known = new Set(users.map(u => u.username));
    configUsers.forEach(u => { if (!known.has(u.username)) users.push(u); });

    const match = users.find(u => u.username === username && u.password === password);
    setTimeout(() => {
      setLoading(false);
      if (match) {
        onLogin(match);
      } else {
        setError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
      }
    }, 400);
  };

  const inputStyle = {
    width: '100%', padding: '11px 14px', boxSizing: 'border-box',
    border: '1.5px solid #e2e8f0', borderRadius: 10,
    fontSize: 14, color: '#1a2236', outline: 'none',
    fontFamily: 'inherit', transition: 'border-color 0.15s',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'linear-gradient(145deg, #dce8ff 0%, #f4f7fb 55%, #eaf2ff 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: '"IBM Plex Sans Thai", "IBM Plex Sans", system-ui, sans-serif',
    }}>
      <div style={{
        background: '#fff', borderRadius: 20, padding: '48px 40px',
        width: '100%', maxWidth: 400,
        boxShadow: '0 24px 64px rgba(42,111,219,0.13), 0 4px 16px rgba(0,0,0,0.06)',
        border: '1px solid rgba(42,111,219,0.09)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            width: 62, height: 62, borderRadius: 17, margin: '0 auto 14px',
            background: 'linear-gradient(135deg, #2a6fdb, #1a4490)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(42,111,219,0.32)',
          }}>
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
              <path d="M3 5 L6 19 L9 9 L12 16 L15 9 L18 19 L21 5" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div style={{ fontSize: 21, fontWeight: 700, color: '#1a2236' }}>Water POG</div>
          <div style={{ fontSize: 13, color: '#7b8ca6', marginTop: 3 }}>Financial Console</div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 7 }}>ชื่อผู้ใช้</label>
            <input
              type="text" value={username} required autoFocus
              onChange={e => setUsername(e.target.value)}
              placeholder="กรอกชื่อผู้ใช้"
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = '#2a6fdb'}
              onBlur={e  => e.target.style.borderColor = '#e2e8f0'}
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 7 }}>รหัสผ่าน</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPw ? 'text' : 'password'} value={password} required
                onChange={e => setPassword(e.target.value)}
                placeholder="กรอกรหัสผ่าน"
                style={{ ...inputStyle, paddingRight: 42 }}
                onFocus={e => e.target.style.borderColor = '#2a6fdb'}
                onBlur={e  => e.target.style.borderColor = '#e2e8f0'}
              />
              <button type="button" onClick={() => setShowPw(v => !v)}
                style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#94a3b8', padding: 4, display: 'flex', alignItems: 'center',
                }}>
                {showPw ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
          </div>

          {error && (
            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca',
              borderRadius: 9, padding: '10px 14px',
              fontSize: 13, color: '#dc2626', marginBottom: 18,
            }}>{error}</div>
          )}

          <button type="submit" disabled={loading} style={{
            width: '100%', padding: '13px',
            background: loading ? '#93c5fd' : 'linear-gradient(135deg, #2a6fdb, #1a4490)',
            color: '#fff', border: 'none', borderRadius: 11,
            fontSize: 15, fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            boxShadow: loading ? 'none' : '0 4px 16px rgba(42,111,219,0.35)',
            fontFamily: 'inherit', transition: 'opacity 0.15s',
          }}>
            {loading ? 'กำลังตรวจสอบ…' : 'เข้าสู่ระบบ'}
          </button>
        </form>
      </div>
    </div>
  );
}

Object.assign(window, { App });

// Mount
const rootEl = document.getElementById('root');
ReactDOM.createRoot(rootEl).render(<App />);
