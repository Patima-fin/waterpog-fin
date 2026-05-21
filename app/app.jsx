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

function App() {
  const [route, setRoute] = aState(() => {
    const h = window.location.hash.replace(/^#/, '');
    return h || 'daily';
  });
  const [data, setData] = aState(() => WTPData.load());
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const { push: pushToast, node: toastNode } = useToasts();
  const [syncInfo, setSyncInfo] = aState(() => WTPData.getSyncStatus ? WTPData.getSyncStatus() : { status: 'offline', time: null });

  // Persist data on change
  aEffect(() => { WTPData.save(data); }, [data]);

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

  const go = (r) => { window.location.hash = '#' + r; setRoute(r); };

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
  const routes = {
    daily: { label: 'รายงานรับเงินประจำวัน', title: 'Daily Revenue', icon: 'daily' },
    warroom1: { label: 'War Room — รายรับ (หน้า 1)', title: 'Revenue Collection', icon: 'receivables' },
    warroom2: { label: 'War Room — รายปี (หน้า 2)', title: 'Annual Cash Flow', icon: 'forecast' },
    cashflow: { label: 'แผนประมาณการจ่ายรายสัปดาห์', title: 'Weekly Cash Flow', icon: 'chart' },
    projects: { label: 'จัดการโครงการ', title: 'Projects', icon: 'projects' },
    invoices: { label: 'ใบแจ้งหนี้', title: 'Invoices', icon: 'invoice' },
    data_forecast: { label: 'ประมาณการนอกระบบ', title: 'Forecast Entries', icon: 'forecast' },
    data_bank:     { label: 'DATA BANK', title: 'Bank Accounts', icon: 'bank' },
    data_pv:       { label: 'DATA PV', title: 'Payment Vouchers', icon: 'money' },
    data_payable:  { label: 'DATA เจ้าหนี้คงค้าง', title: 'Accounts Payable', icon: 'invoice' },
  };

  let page;
  switch (route) {
    case 'warroom1':       page = <WarRoomPage1 data={data} setData={setData} toast={pushToast} />; break;
    case 'warroom2':       page = <WarRoomPage2 data={data} setData={setData} toast={pushToast} />; break;
    case 'cashflow':       page = <CashFlowDashboard data={data} setData={setData} toast={pushToast} />; break;
    case 'projects':       page = <ProjectsPage data={data} setData={setData} toast={pushToast} />; break;
    case 'invoices':       page = <InvoicesPage data={data} setData={setData} toast={pushToast} />; break;
    case 'data_forecast':  page = <ForecastEntriesPage data={data} setData={setData} toast={pushToast} />; break;
    case 'data_bank':      page = <DataBankPage data={data} setData={setData} toast={pushToast} />; break;
    case 'data_pv':        page = <DataPVPage data={data} setData={setData} toast={pushToast} />; break;
    case 'data_payable':   page = <DataPayablePage data={data} setData={setData} toast={pushToast} />; break;
    case 'daily':
    default:               page = <DailyRevenueDashboard data={data} setData={setData} toast={pushToast} />;
  }

  return (
    <div className="app">
      <Sidebar route={route} go={go} routes={routes} data={data} sidebarStyle={tweaks.sidebarStyle} syncInfo={syncInfo} />
      <div className="main">
        <Topbar route={route} routes={routes} data={data} onReset={resetDemo} />
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

function Sidebar({ route, go, routes, data, sidebarStyle, syncInfo = {} }) {
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
  };
  return (
    <aside className="sb" style={sidebarStyle === 'minimal' ? { background: 'transparent', borderRight: '1px solid var(--line)' } : {}}>
      <div className="sb-brand">
        <div className="sb-logo">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M3 5 L6 19 L9 9 L12 16 L15 9 L18 19 L21 5" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div>
          <div className="sb-brand-name">Water POG</div>
          <div className="sb-brand-sub">Financial Console</div>
        </div>
      </div>

      <div>
        <div className="sb-section">แดชบอร์ดสำหรับนำเสนอ</div>
        {[
          ['daily', 'รับเงินประจำวัน', 'daily'],
          ['warroom1', 'War Room · หน้า 1', 'receivables'],
          ['warroom2', 'War Room · หน้า 2', 'forecast'],
          ['cashflow', 'ประมาณการรับ-จ่ายรายสัปดาห์', 'chart'],
        ].map(([key, label, icon]) => (
          <button key={key} className={`sb-link ${route === key ? 'active' : ''}`} onClick={() => go(key)}>
            <Icon name={icon} className="sb-icon" />
            <span>{label}</span>
            {counts[key] != null && <span className="sb-pill">{counts[key]}</span>}
          </button>
        ))}
      </div>

      <div>
        <div className="sb-section">จัดการข้อมูล</div>
        {[
          ['projects',      'โครงการทั้งหมด', 'projects'],
          ['invoices',      'ใบแจ้งหนี้', 'invoice'],
          ['data_forecast', 'ประมาณการนอกระบบ', 'forecast'],
          ['data_bank',     'DATA BANK', 'bank'],
          ['data_pv',       'DATA PV', 'money'],
          ['data_payable',  'DATA เจ้าหนี้คงค้าง', 'arrow_up'],
        ].map(([key, label, icon]) => (
          <button key={key} className={`sb-link ${route === key ? 'active' : ''}`} onClick={() => go(key)}>
            <Icon name={icon} className="sb-icon" />
            <span>{label}</span>
            {counts[key] != null && <span className="sb-pill">{counts[key]}</span>}
          </button>
        ))}
      </div>

      <div className="sb-user">
        <div className="sb-avatar">FA</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-900)' }}>ฝ่ายการเงิน</div>
          <div style={{ fontSize: 11, color: 'var(--ink-500)', display:'flex', alignItems:'center', gap:4 }}>
            <span style={{ width:6, height:6, borderRadius:'50%', background: syncDot, flexShrink:0 }} />
            {syncLabel}
          </div>
        </div>
        <Icon name="settings" size={14} />
      </div>
    </aside>
  );
}

function Topbar({ route, routes, data, onReset }) {
  const r = routes[route] || routes.daily;
  const today = new Date().toLocaleDateString('th-TH', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const isPresentation = ['daily', 'warroom1', 'warroom2', 'cashflow'].includes(route);
  return (
    <div className="topbar">
      <div className="crumbs">
        <span>Water POG</span><span className="sep">/</span>
        <span>{isPresentation ? 'นำเสนอ' : 'จัดการข้อมูล'}</span>
        <span className="sep">/</span>
        <span className="now">{r.label}</span>
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

Object.assign(window, { App });

// Mount
const rootEl = document.getElementById('root');
ReactDOM.createRoot(rootEl).render(<App />);
