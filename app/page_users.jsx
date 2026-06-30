/* page_users.jsx — Users management (manager-only) · build 20260630a
 *
 * จัดการรายชื่อผู้ใช้ + รหัสผ่าน + ฝ่ายงาน + สิทธิ์เข้าถึงต่อหน้า — รวมในที่เดียว.
 *
 * แหล่งข้อมูล:
 *   - Supabase Auth (admin.listUsers)  = ต้นจริงของรหัสผ่าน + role + ฝ่าย + per-user pages
 *   - config.js USERS                  = bootstrap directory (เผื่อ Auth ยังไม่มี)
 *   (เลิกอ่าน data.users (Sheet entity) แล้ว — ของเก่า เกะกะ)
 *
 * ฝ่ายงาน (department) เก็บใน app_metadata.department ของ Supabase Auth + mirror ลง
 *   manualOverrides (`userdir.<username>`) ผ่าน wtpWriteUserDir เพื่อให้หน้าอื่นที่ไม่มี
 *   service_role key (เช่นกระทบยอดธนาคาร — dropdown "ผู้รับผิดชอบ") อ่านรายชื่อ "การเงิน" ได้.
 *
 * Admin ops (สร้าง/รีเซ็ตรหัส/ลบ/แก้ role/แก้ pages) = ผ่าน service_role key
 *   ที่ manager วาง 1 ครั้งต่อแท็บ (เก็บใน sessionStorage `wtp-srk` — หายเมื่อปิดแท็บ)
 *   service_role bypass RLS + scope admin → จำเป็นสำหรับ admin.* methods
 *
 * Per-user pages: เก็บใน app_metadata.pages ของ Supabase Auth
 *   null  = ใช้ role default (ตาม ROLE_PERMS ใน app.jsx)
 *   array = list หน้าที่อนุญาตเป๊ะๆ (override)
 *   ★ มีผลตอน login รอบถัดไป (JWT/session ใหม่) — แก้แล้วแจ้งให้ user logout/login
 */
'use strict';

const { useState: uState, useMemo: uMemo, useEffect: uEffect, useCallback: uCb } = React;

const ROLE_LABELS = {
  viewer:  { label: 'Viewer',  color: 'b-gray',   desc: 'ดูเฉพาะ Dashboard' },
  staff:   { label: 'Staff',   color: 'b-blue',   desc: 'แก้ไขข้อมูลได้ ลบไม่ได้' },
  manager: { label: 'Manager', color: 'b-green',  desc: 'ทุกอย่าง (รวม users + audit)' },
  owner:   { label: 'Owner',   color: 'b-violet', desc: 'ดูทุกหน้า แต่แก้/ลบไม่ได้' },
};

// ─── ฝ่ายงาน (department) — key เก็บใน Auth meta + userdir · "finance" ใช้กรอง
//   dropdown "ผู้รับผิดชอบ" หน้ากระทบยอดธนาคาร ──
const DEPARTMENTS = [
  { key: 'finance',    label: 'การเงิน',   color: 'b-green' },
  { key: 'accounting', label: 'บัญชี',     color: 'b-blue'  },
  { key: 'admin',      label: 'ธุรการ',    color: 'b-amber' },
  { key: 'management', label: 'ผู้บริหาร', color: 'b-violet' },
  { key: 'other',      label: 'อื่นๆ',     color: 'b-gray'  },
];
const DEPT_LABEL = (() => { const m = {}; DEPARTMENTS.forEach(d => { m[d.key] = d.label; }); return m; })();
const DEPT_META  = (() => { const m = {}; DEPARTMENTS.forEach(d => { m[d.key] = d; }); return m; })();

// ─── หน้า ทั้งหมดของระบบ จัดกลุ่มตามที่ Sidebar ใช้จริง (สำหรับ checkbox grid) ──
//   key ต้องตรงกับ key ใน routes ของ app.jsx เป๊ะ
const PAGE_GROUPS = [
  { id: 'dash',    title: 'แดชบอร์ด',          pages: [
    ['home',             'หน้าหลัก'],
    ['daily',            'รายงานรับเงินรายวัน'],
    ['warroom1',         'War Room · รายรับ'],
    ['warroom2',         'War Room · รายปี'],
    ['cashflow',         'Weekly Forecast'],
    ['cashflow_present', 'พรีเซนต์ Cash Flow'],
    ['pnl',              'งบกำไรขาดทุน (P&L)'],
    ['budget',           'Budget Control Center'],
    ['investor',         'Investor Dashboard'],
  ]},
  { id: 'reports', title: 'รายงาน / วิเคราะห์',  pages: [
    ['debt',          'ภาระหนี้ทั้งหมด'],
    ['debt_ledger',   'Debt Ledger · ดอกเบี้ย'],
    ['iv_report',     'รายงานติดตาม IV'],
    ['receipts',      'ประวัติรับเงิน'],
    ['bank_diary',    'Bank Daily'],
    ['bank_recon',    'กระทบยอดธนาคาร'],
    ['payment_recon', 'BACK TO BACK'],
    ['interest_calc', 'คำนวณดอกเบี้ย'],
    ['sts_calc',      'STS Calculator'],
    ['sts_workflow',  'STS Workflow'],
  ]},
  { id: 'manage',  title: 'จัดการข้อมูล', pages: [
    ['projects',      'โครงการ'],
    ['invoices',      'ลูกหนี้คงค้าง'],
    ['checks',        'เช็คจ่ายล่วงหน้า'],
    ['data_forecast', 'ประมาณการรายจ่าย'],
    ['data_bank',     'บัญชีธนาคาร'],
    ['data_pv',       'ใบสำคัญจ่าย'],
    ['data_payable',  'เจ้าหนี้คงค้าง'],
    ['daily_balance', 'บันทึกยอดธนาคาร'],
  ]},
  { id: 'system',  title: 'ระบบ', pages: [
    ['users',     'จัดการผู้ใช้'],
    ['audit_log', 'Audit Log'],
  ]},
];
const ALL_PAGES = PAGE_GROUPS.reduce((acc, g) => acc.concat(g.pages.map(p => p[0])), []);
const PAGE_LABEL = (() => {
  const m = {};
  PAGE_GROUPS.forEach(g => g.pages.forEach(p => { m[p[0]] = p[1]; }));
  return m;
})();

// คำนวณ default pages ของ role X (เผื่อ WTPAuth.defaultPagesFor ยังไม่โหลด)
function rolePages(role) {
  if (window.WTPAuth && window.WTPAuth.defaultPagesFor) {
    return window.WTPAuth.defaultPagesFor(role, ALL_PAGES);
  }
  return ALL_PAGES.slice();
}

function UsersPage({ data, setData, toast }) {
  // Manager-only guard (เกราะนอกจาก sidebar filter)
  const canSee = window.WTPAuth ? window.WTPAuth.can('canManageUsers') : true;
  if (!canSee) {
    return (
      <div className="page">
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
          <div style={{ fontWeight: 600, color: 'var(--ink-600)' }}>ต้องเป็น Manager เท่านั้น</div>
        </div>
      </div>
    );
  }

  // ─── State ────────────────────────────────────────────────────────────
  const [srk, setSrk] = uState(() => {
    try { return sessionStorage.getItem('wtp-srk') || ''; } catch { return ''; }
  });
  const [authUsers, setAuthUsers] = uState([]);          // จาก Supabase Auth (primary)
  const [loading, setLoading] = uState(false);
  const [authErr, setAuthErr] = uState('');
  const [query, setQuery] = uState('');
  const [roleFilter, setRoleFilter] = uState('all');
  const [edit, setEdit] = uState(null);                  // null | {} (new) | row (edit)
  const [pwReset, setPwReset] = uState(null);            // user object → modal เปลี่ยนรหัส
  const [sort, setSort] = uState({ key: 'username', dir: 'asc' });

  // init admin client เมื่อมี srk
  uEffect(() => {
    if (!srk) return;
    try {
      if (window.WTPData && WTPData.adminInit) {
        WTPData.adminInit(srk);
        loadAuthUsers();
      }
    } catch (e) {
      setAuthErr(String(e && e.message || e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srk]);

  const loadAuthUsers = uCb(() => {
    if (!window.WTPData || !WTPData.adminReady || !WTPData.adminReady()) return;
    setLoading(true); setAuthErr('');
    WTPData.admin.listUsers()
      .then(us => { setAuthUsers(us); setLoading(false); })
      .catch(e => { setAuthErr(String(e && e.message || e)); setLoading(false); });
  }, []);

  const applySrk = (newKey) => {
    const trimmed = String(newKey || '').trim();
    if (!trimmed) {
      try { sessionStorage.removeItem('wtp-srk'); } catch {}
      setSrk(''); setAuthUsers([]); setAuthErr('');
      try { WTPData.adminInit(''); } catch {}
      toast('ล้าง service_role key แล้ว');
      return;
    }
    try { sessionStorage.setItem('wtp-srk', trimmed); } catch {}
    setSrk(trimmed);
    toast('บันทึก service_role key (เฉพาะแท็บนี้)');
  };

  // ─── รวมแหล่ง: Auth users (primary) + config (bootstrap fallback) ───
  //   (เลิกอ่าน data.users (Sheet) แล้ว — ของเก่า เกะกะ)
  const configUsers  = (window.WTP_CONFIG && window.WTP_CONFIG.USERS) || [];

  const combinedRows = uMemo(() => {
    const byName = new Map();
    authUsers.forEach(u => {
      byName.set(u.username, { ...u, _sources: new Set(['auth']) });
    });
    configUsers.forEach(u => {
      const k = u.username || '';
      const ex = byName.get(k);
      if (ex) ex._sources.add('config');
      else byName.set(k, { id: 'cfg_' + k, username: k, displayName: u.displayName, role: u.role, pages: null, _sources: new Set(['config']) });
    });
    return Array.from(byName.values()).map(u => ({ ...u, _sourcesStr: Array.from(u._sources).join(',') }));
  }, [authUsers, configUsers]);

  const uSortVal = (u, key) => String(u[key] || '').toLowerCase();
  const toggleSort = (key) => setSort(s =>
    s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });

  const filtered = uMemo(() => {
    let xs = combinedRows;
    if (roleFilter !== 'all') xs = xs.filter(u => u.role === roleFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      xs = xs.filter(u =>
        (u.username || '').toLowerCase().includes(q) ||
        (u.displayName || '').toLowerCase().includes(q) ||
        (u.department || '').toLowerCase().includes(q));
    }
    return xs.slice().sort((a, b) => {
      const va = uSortVal(a, sort.key), vb = uSortVal(b, sort.key);
      if (va < vb) return sort.dir === 'asc' ? -1 : 1;
      if (va > vb) return sort.dir === 'asc' ?  1 : -1;
      return 0;
    });
  }, [combinedRows, query, roleFilter, sort]);

  const roleCounts = uMemo(() => {
    const c = { manager: 0, staff: 0, viewer: 0, owner: 0 };
    combinedRows.forEach(u => { if (c[u.role] != null) c[u.role]++; });
    return c;
  }, [combinedRows]);

  // ─── Presence (ใครออนไลน์อยู่) — เหมือนเดิม ─────────────────────────
  const agoLabel = (ms) => {
    if (ms == null || ms < 0) return '—';
    const m = Math.floor(ms / 60000);
    if (m < 1) return 'เมื่อสักครู่';
    if (m < 60) return m + ' นาทีที่แล้ว';
    const h = Math.floor(m / 60);
    if (h < 24) return h + ' ชม.ที่แล้ว';
    return Math.floor(h / 24) + ' วันที่แล้ว';
  };
  const presenceRows = uMemo(() => {
    const arr = (data && data.presence) || [];
    const HB = (window.WTP_CONFIG && window.WTP_CONFIG.PRESENCE_HEARTBEAT_MS) || 300000;
    const onlineWindow = Math.max(HB * 2, 6 * 60 * 1000);
    const now = Date.now();
    return arr.map(p => {
      const ls = Number(p.lastSeen) || Date.parse(p.lastSeen) || 0;
      return { ...p, lastSeenMs: ls, ageMs: ls ? now - ls : null, online: ls > 0 && (now - ls) <= onlineWindow };
    }).sort((a, b) => (b.lastSeenMs || 0) - (a.lastSeenMs || 0));
  }, [data && data.presence]);
  const onlineCount = presenceRows.filter(p => p.online).length;

  // ─── Admin actions ──────────────────────────────────────────────────
  const ensureAdmin = () => {
    if (!WTPData.adminReady || !WTPData.adminReady()) {
      toast('กรุณาวาง service_role key ก่อน');
      return false;
    }
    return true;
  };

  const saveUser = (draft, originalId) => {
    if (!ensureAdmin()) return;
    if (!draft.username || !draft.username.trim()) { toast('กรุณากรอก username'); return; }
    if (!draft.role) { toast('กรุณาเลือก role'); return; }
    const isNew = !originalId || String(originalId).startsWith('cfg_') || String(originalId).startsWith('sheet_');
    if (isNew && (!draft._password || draft._password.length < 6)) {
      toast('รหัสผ่านต้องอย่างน้อย 6 ตัวอักษร'); return;
    }
    const pages = draft._pagesOverride ? draft._pagesArray : null;
    const uname = draft.username.trim().toLowerCase();
    const dept  = draft.department || '';
    const opts = {
      username:    uname,
      displayName: draft.displayName || draft.username,
      role:        draft.role,
      department:  dept,
      pages:       pages,
    };
    let p;
    if (isNew) {
      opts.password = draft._password;
      p = WTPData.admin.createUser(opts);
    } else {
      p = WTPData.admin.updateUser(originalId, opts);
    }
    p.then(() => {
      // mirror รายชื่อ+ฝ่ายลง manualOverrides (synced) → หน้าอื่นอ่านได้โดยไม่ต้องมี service_role
      try { wtpWriteUserDir(uname, { displayName: opts.displayName, department: dept, role: draft.role }); } catch (_) {}
      toast(isNew ? 'สร้างผู้ใช้ใหม่แล้ว' : 'อัปเดตข้อมูลแล้ว · ผู้ใช้ต้อง logout/login เพื่อให้สิทธิ์ใหม่มีผล');
      setEdit(null);
      loadAuthUsers();
    }).catch(e => toast('ผิดพลาด: ' + String(e && e.message || e)));
  };

  const removeUser = (u) => {
    if (!ensureAdmin()) return;
    if (!u.id || String(u.id).startsWith('cfg_') || String(u.id).startsWith('sheet_')) {
      toast('ผู้ใช้นี้ยังไม่อยู่ใน Supabase Auth — ลบไม่ได้'); return;
    }
    if (!confirm(`ลบบัญชี "${u.username}" ออกจาก Supabase Auth?\n\nผู้ใช้คนนี้จะ login ไม่ได้อีก (กู้คืนไม่ได้)`)) return;
    WTPData.admin.deleteUser(u.id)
      .then(() => { try { wtpClearUserDir(u.username); } catch (_) {} toast('ลบบัญชีแล้ว'); loadAuthUsers(); })
      .catch(e => toast('ลบไม่สำเร็จ: ' + String(e && e.message || e)));
  };

  const submitPwReset = (newPw) => {
    if (!ensureAdmin()) return;
    if (!pwReset || !pwReset.id) return;
    if (!newPw || newPw.length < 6) { toast('รหัสผ่านต้องอย่างน้อย 6 ตัวอักษร'); return; }
    WTPData.admin.setPassword(pwReset.id, newPw)
      .then(() => { toast(`ตั้งรหัสใหม่ให้ "${pwReset.username}" แล้ว — แจ้งให้ผู้ใช้ logout/login`); setPwReset(null); })
      .catch(e => toast('ผิดพลาด: ' + String(e && e.message || e)));
  };

  // ─── บังคับทุกคนออกจากระบบ (เดิม) ─────────────────────────────────────
  const kickAll = () => {
    if (!confirm(
      'บังคับทุกคนออกจากระบบ?\n\n' +
      '• ทุกเครื่องที่กำลังใช้งาน (รวมเครื่องนี้) จะถูกเด้งไปหน้า LOGIN ภายใน ~2 นาที\n' +
      '• เครื่องที่เปิดเว็บเวอร์ชันเก่าค้างไว้ ต้อง "รีเฟรชหน้า" ก่อน ถึงจะถูกเด้ง')) return;
    try {
      WTPOverride.set('system.forceLogoutBefore', Date.now());
      toast('ส่งคำสั่งแล้ว — ทุกเครื่องจะเด้งไปหน้า LOGIN ภายใน ~2 นาที');
    } catch (e) {
      toast('สั่งไม่สำเร็จ: ' + ((e && e.message) || e));
    }
  };

  const emptyUser = { username: '', _password: '', displayName: '', role: 'staff', department: 'finance', pages: null };

  return (
    <div className="page">
      <div className="page-head anim-in">
        <div>
          <h1 className="page-title">จัดการผู้ใช้ระบบ · Users</h1>
          <div className="page-sub">
            ผู้ใช้ทั้งหมด {combinedRows.length} คน · Manager-only · จัดการรหัส+สิทธิ์ในที่เดียว
          </div>
        </div>
        <div className="page-head-r">
          <ExportButton
            rows={filtered.map(u => ({ ...u, source: u._sourcesStr, departmentLabel: DEPT_LABEL[u.department] || '' }))}
            columns={[
              { key: 'username',        label: 'Username' },
              { key: 'displayName',     label: 'ชื่อผู้ใช้' },
              { key: 'role',            label: 'Role' },
              { key: 'departmentLabel', label: 'ฝ่ายงาน' },
              { key: 'source',          label: 'แหล่ง' },
              { key: 'lastSignIn',      label: 'login ล่าสุด' },
            ]}
            filename="users"
            sheetName="ผู้ใช้"
            title="รายชื่อผู้ใช้ระบบ" />
          <PrintButton />
          <button className="btn" onClick={kickAll}
            title="บังคับทุกคนออกจากระบบ — เด้งไปหน้า LOGIN ภายใน ~2 นาที"
            style={{ borderColor: 'var(--bad)', color: 'var(--bad)', fontWeight: 600 }}>
            🚪 บังคับออกจากระบบทุกคน
          </button>
          <button className="btn btn-primary" onClick={() => setEdit({ ...emptyUser })}
            disabled={!srk} title={!srk ? 'ต้องวาง service_role key ก่อน' : 'เพิ่มผู้ใช้ใหม่'}>
            <Icon name="plus" size={14} /> เพิ่มผู้ใช้
          </button>
        </div>
      </div>

      {/* ── Service_role key card ──────────────────────────────────────── */}
      <ServiceRoleCard srk={srk} onApply={applySrk} loading={loading} authErr={authErr}
        authCount={authUsers.length} onReload={loadAuthUsers} />

      {/* KPI */}
      <div className="grid grid-4 anim-stagger" style={{ marginBottom: 16 }}>
        <KpiTile animate={false} label="Manager (หัวหน้า)"   value={roleCounts.manager} accent="var(--good)"          icon="settings"    unit=" คน" digits={0} />
        <KpiTile animate={false} label="Staff (พนักงาน)"      value={roleCounts.staff}   accent="var(--brand-500)"      icon="receivables" unit=" คน" digits={0} />
        <KpiTile animate={false} label="Owner (เจ้าของ)"      value={roleCounts.owner}   accent="oklch(60% 0.18 295)"   icon="bank"        unit=" คน" digits={0} />
        <KpiTile animate={false} label="Viewer (ผู้บริหารดู)" value={roleCounts.viewer}  accent="var(--ink-400)"        icon="daily"       unit=" คน" digits={0} />
      </div>

      {/* Presence */}
      <div className="card anim-in" style={{ padding: 14, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: presenceRows.length ? 10 : 0, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontWeight: 700 }}>
            🟢 กำลังออนไลน์ <span className="muted" style={{ fontWeight: 400 }}>({onlineCount} คน)</span>
          </div>
          <div className="muted" style={{ fontSize: 12 }}>heartbeat ทุก ~5 นาที · ไม่บันทึกใน audit log</div>
        </div>
        {presenceRows.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>ยังไม่มีข้อมูล — ผู้ใช้จะทยอยขึ้นมาเองหลังเริ่มใช้งาน</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {presenceRows.map(p => (
              <div key={p.id} title={`เห็นล่าสุด: ${agoLabel(p.ageMs)}`}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 999,
                         background: 'var(--ink-100)', border: '1px solid var(--ink-200)', opacity: p.online ? 1 : 0.45 }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, flex: 'none',
                               background: p.online ? 'var(--good)' : 'var(--ink-300)' }} />
                <span style={{ fontWeight: 600 }}>{p.displayName || p.username}</span>
                <span className="muted" style={{ fontSize: 11 }}>
                  {ROLE_LABELS[p.role] ? ROLE_LABELS[p.role].label : (p.role || '')}
                </span>
                <span className="muted" style={{ fontSize: 11 }}>· {agoLabel(p.ageMs)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Filter bar */}
      <div className="card" style={{ padding: 10, marginBottom: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="tabnav" style={{ flex: 'none' }}>
          <button className={roleFilter === 'all' ? 'active' : ''} onClick={() => setRoleFilter('all')}>ทั้งหมด ({combinedRows.length})</button>
          {Object.entries(ROLE_LABELS).map(([key, meta]) => (
            <button key={key} className={roleFilter === key ? 'active' : ''} onClick={() => setRoleFilter(key)}>
              {meta.label} ({roleCounts[key] || 0})
            </button>
          ))}
        </div>
        <input className="input"
          placeholder="ค้นหา username / ชื่อ / หน่วยงาน…"
          value={query} onChange={e => setQuery(e.target.value)}
          style={{ flex: 1, minWidth: 200, maxWidth: 320 }} />
      </div>

      {/* Table */}
      <div className="card anim-in" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'min(560px, calc(100vh - 400px))' }}>
          <table className="tbl" style={{ minWidth: 1020 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 3, background: 'var(--surface)' }}>
              <tr>
                {[
                  { k: 'username',    label: 'Username',     w: 150 },
                  { k: 'displayName', label: 'ชื่อแสดง' },
                  { k: 'role',        label: 'Role',         w: 120 },
                  { k: 'department',  label: 'ฝ่ายงาน',       w: 120 },
                  { k: null,          label: 'สิทธิ์เข้าหน้า', w: 150 },
                  { k: 'lastSignIn',  label: 'login ล่าสุด', w: 150 },
                  { k: null,          label: 'แหล่ง',         w: 110 },
                  { k: null,          label: '',              w: 200 },
                ].map((c, ci) => (
                  <th key={ci}
                      onClick={() => c.k && toggleSort(c.k)}
                      style={{ width: c.w, cursor: c.k ? 'pointer' : 'default', userSelect: 'none', whiteSpace: 'nowrap' }}>
                    {c.label}
                    {c.k && <span style={{ marginLeft: 4, color: sort.key === c.k ? 'var(--brand-600)' : 'var(--ink-300)', fontSize: 10 }}>{sort.key === c.k ? (sort.dir === 'asc' ? '▲' : '▼') : '⇅'}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 36, textAlign: 'center' }} className="muted">
                  {srk ? 'ไม่พบผู้ใช้ที่ตรงกับเงื่อนไข' : 'วาง service_role key เพื่อโหลดรายชื่อจาก Supabase Auth'}
                </td></tr>
              )}
              {filtered.map(u => {
                const meta = ROLE_LABELS[u.role] || { label: u.role || '—', color: 'b-gray' };
                const inAuth = u._sources.has('auth');
                const inConfig = u._sources.has('config');
                const pagesCount = Array.isArray(u.pages) ? u.pages.length : null;
                const roleDefault = rolePages(u.role).length;
                return (
                  <tr key={u.id} style={{ opacity: inAuth ? 1 : 0.6, verticalAlign: 'middle' }}>
                    <td style={{ fontFamily: 'ui-monospace', fontWeight: 600, color: 'var(--brand-700)' }}>{u.username}</td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{u.displayName || '—'}</div>
                      {u.email && <div className="muted" style={{ fontSize: 11 }}>{u.email}</div>}
                    </td>
                    <td><Badge kind={meta.color} dot={false}>{meta.label}</Badge></td>
                    <td>
                      {u.department && DEPT_META[u.department]
                        ? <Badge kind={DEPT_META[u.department].color} dot={false}>{DEPT_LABEL[u.department]}</Badge>
                        : <span className="muted" style={{ fontSize: 12 }}>—</span>}
                    </td>
                    <td>
                      {pagesCount != null
                        ? <span title={u.pages.map(p => PAGE_LABEL[p] || p).join(', ')}>
                            <Badge kind="b-amber" dot={false}>{pagesCount} หน้า (custom)</Badge>
                          </span>
                        : <span className="muted" style={{ fontSize: 12 }}>{roleDefault} หน้า (default ของ {meta.label})</span>}
                    </td>
                    <td style={{ fontSize: 12 }} className="muted">
                      {u.lastSignIn ? new Date(u.lastSignIn).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
                        {inAuth   && <Badge kind="b-green" dot={false}>Auth</Badge>}
                        {inConfig && <Badge kind="b-amber" dot={false}>config.js</Badge>}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {inAuth ? (
                          <>
                            <button className="btn btn-ghost btn-sm" style={{ padding: '2px 8px' }}
                              onClick={() => setEdit({ ...u, _password: '', _pagesOverride: Array.isArray(u.pages), _pagesArray: Array.isArray(u.pages) ? u.pages.slice() : rolePages(u.role) })}>แก้ไข</button>
                            <button className="btn btn-ghost btn-sm" style={{ padding: '2px 8px', color: 'var(--brand-600)' }}
                              onClick={() => setPwReset(u)}>รีเซ็ตรหัส</button>
                            <button className="btn btn-ghost btn-sm" style={{ padding: '2px 8px', color: 'var(--bad)' }}
                              onClick={() => removeUser(u)}>ลบ</button>
                          </>
                        ) : (
                          <span className="muted" style={{ fontSize: 11 }}>{srk ? 'ยังไม่มีใน Supabase Auth' : 'รอ service_role'}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info */}
      <div className="card" style={{ marginTop: 14, padding: 14, background: '#fffbeb', borderLeft: '4px solid #f6ad55', fontSize: 12, color: 'var(--ink-700)' }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>💡 หมายเหตุ</div>
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
          <li><b>Auth (เขียว)</b> = บัญชีจริงใน Supabase Auth — แก้รหัส/สิทธิ์/role/ฝ่ายงาน ได้ที่นี่</li>
          <li><b>config.js (ส้ม)</b> = bootstrap directory — ไม่ใช่บัญชีจริง ใช้เป็น fallback display</li>
          <li><b>ฝ่ายงาน</b> = เลือกในหน้าแก้ไขผู้ใช้ · ฝ่าย "การเงิน" จะโผล่ใน dropdown "ผู้รับผิดชอบ" หน้ากระทบยอดธนาคาร</li>
          <li><b>สิทธิ์เข้าหน้า</b> = ถ้าไม่ตั้ง override ใช้ default ตาม role · ถ้าตั้ง override = เปิดเฉพาะหน้าที่ติ๊ก</li>
          <li>เปลี่ยน role/สิทธิ์/รหัส → ผู้ใช้ต้อง <b>logout แล้ว login ใหม่</b> ถึงจะมีผล (อยู่ใน JWT)</li>
          <li>service_role key ถูกเก็บใน sessionStorage ของแท็บนี้เท่านั้น (ปิดแท็บ = ต้องวางใหม่)</li>
        </ul>
      </div>

      {/* Modals */}
      {edit !== null && (
        <UserEditModal row={edit} onSave={saveUser} onClose={() => setEdit(null)} />
      )}
      {pwReset !== null && (
        <PasswordResetModal user={pwReset} onSubmit={submitPwReset} onClose={() => setPwReset(null)} />
      )}
    </div>
  );
}

// ─── Service_role key card ─────────────────────────────────────────────────
function ServiceRoleCard({ srk, onApply, loading, authErr, authCount, onReload }) {
  const [draft, setDraft] = uState('');
  const [show, setShow] = uState(false);
  const hasKey = !!srk;

  return (
    <div className="card" style={{
      padding: 14, marginBottom: 14,
      borderLeft: '4px solid ' + (hasKey ? 'var(--good)' : 'var(--brand-500)'),
      background: hasKey ? 'rgba(34,197,94,.04)' : 'rgba(42,111,219,.04)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>
          🔐 service_role key {hasKey ? <span style={{ color: 'var(--good)' }}>· พร้อมใช้งาน</span> : <span style={{ color: 'var(--brand-600)' }}>· ต้องวางก่อนถึงจะจัดการบัญชีได้</span>}
        </div>
        {hasKey && (
          <button className="btn btn-ghost btn-sm" onClick={onReload} disabled={loading} style={{ padding: '2px 10px' }}>
            {loading ? '⏳ กำลังโหลด…' : '↻ โหลดรายชื่อใหม่'}
          </button>
        )}
        <span className="muted" style={{ fontSize: 12, marginLeft: 'auto' }}>
          {hasKey ? `โหลดได้ ${authCount} บัญชี · เก็บใน sessionStorage แท็บนี้` : 'service_role bypass RLS — ไม่ persist + ไม่ขึ้น repo'}
        </span>
      </div>
      {!hasKey ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input className="input" type={show ? 'text' : 'password'} placeholder="eyJhbGciOiJIUzI1NiIs… (service_role secret)"
            value={draft} onChange={e => setDraft(e.target.value)}
            autoComplete="off" spellCheck={false}
            style={{ flex: 1, minWidth: 280, fontFamily: 'ui-monospace', fontSize: 12 }} />
          <button className="btn btn-ghost btn-sm" onClick={() => setShow(s => !s)} style={{ padding: '4px 10px' }}>
            {show ? 'ซ่อน' : 'แสดง'}
          </button>
          <button className="btn btn-primary" onClick={() => { onApply(draft); setDraft(''); }} disabled={!draft.trim()}>
            ใช้คีย์
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <code style={{ fontSize: 11, color: 'var(--ink-500)', background: 'var(--ink-50)', padding: '4px 8px', borderRadius: 6 }}>
            {srk.slice(0, 12)}…{srk.slice(-6)}
          </code>
          <button className="btn btn-ghost btn-sm" onClick={() => onApply('')} style={{ padding: '4px 10px', color: 'var(--bad)' }}>
            ล้างคีย์
          </button>
        </div>
      )}
      <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
        เอาจาก Supabase → Project Settings → API → <b>service_role · secret</b> (กด Reveal) · ใช้เฉพาะหน้านี้เพื่อ admin ops
      </div>
      {authErr && (
        <div style={{ marginTop: 8, padding: 8, background: '#fee', border: '1px solid #fbb', borderRadius: 8, fontSize: 12, color: '#a01818' }}>
          ⚠ {authErr}
        </div>
      )}
    </div>
  );
}

// ─── Edit/Add modal ──────────────────────────────────────────────────────
function UserEditModal({ row, onSave, onClose }) {
  const [draft, setDraft] = uState(null);
  const [showPw, setShowPw] = uState(false);

  uEffect(() => {
    setDraft(row ? {
      ...row,
      _password: '',
      _pagesOverride: row._pagesOverride != null ? row._pagesOverride : Array.isArray(row.pages),
      _pagesArray:   Array.isArray(row._pagesArray) ? row._pagesArray.slice()
                    : Array.isArray(row.pages) ? row.pages.slice()
                    : rolePages(row.role || 'staff'),
    } : null);
  }, [row]);
  if (!row || !draft) return null;

  const isNew = !row.id || String(row.id).startsWith('cfg_') || String(row.id).startsWith('sheet_');
  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));

  // ถ้าเปลี่ยน role และยังไม่ตั้ง override → re-fill default pages ของ role ใหม่
  const onRoleChange = (newRole) => {
    setDraft(d => {
      const next = { ...d, role: newRole };
      if (!d._pagesOverride) next._pagesArray = rolePages(newRole);
      return next;
    });
  };

  const togglePage = (key) => {
    setDraft(d => {
      const arr = d._pagesArray.slice();
      const i = arr.indexOf(key);
      if (i >= 0) arr.splice(i, 1); else arr.push(key);
      return { ...d, _pagesArray: arr };
    });
  };
  const setOverride = (on) => {
    setDraft(d => ({
      ...d,
      _pagesOverride: on,
      _pagesArray: on ? (d._pagesArray.length ? d._pagesArray : rolePages(d.role)) : rolePages(d.role),
    }));
  };

  const allDefault = rolePages(draft.role);
  const selected = new Set(draft._pagesArray);

  return (
    <Modal open={!!row} title={isNew ? '➕ เพิ่มผู้ใช้ใหม่' : `✏️ แก้ไข ${row.username}`}
      maxWidth={760} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>ยกเลิก</button>
        <button className="btn btn-primary" onClick={() => onSave(draft, row.id)}>
          <Icon name="check" size={14} /> บันทึก
        </button>
      </>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="field">
          <label>Username *</label>
          <input className="input" autoFocus value={draft.username || ''}
            onChange={e => set('username', e.target.value.trim().toLowerCase())}
            placeholder="เช่น finance3" disabled={!isNew}
            style={!isNew ? { background: 'var(--ink-50)', color: 'var(--ink-500)' } : {}} />
          {!isNew && <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>username แก้ไม่ได้</div>}
        </div>
        <div className="field">
          <label>Role *</label>
          <select className="select input" value={draft.role || 'staff'} onChange={e => onRoleChange(e.target.value)}>
            {Object.entries(ROLE_LABELS).map(([k, m]) => (
              <option key={k} value={k}>{m.label} — {m.desc}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ gridColumn: '1/-1' }}>
          <label>ฝ่ายงาน (Department)</label>
          <select className="select input" value={draft.department || ''} onChange={e => set('department', e.target.value)}>
            <option value="">— ไม่ระบุ —</option>
            {DEPARTMENTS.map(d => (
              <option key={d.key} value={d.key}>{d.label}</option>
            ))}
          </select>
          <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>ฝ่าย "การเงิน" จะเลือกเป็นผู้รับผิดชอบในหน้ากระทบยอดธนาคารได้</div>
        </div>
        <div className="field" style={{ gridColumn: '1/-1' }}>
          <label>ชื่อ-นามสกุล (Display Name)</label>
          <input className="input" value={draft.displayName || ''}
            onChange={e => set('displayName', e.target.value)}
            placeholder="เช่น สมหญิง การเงิน" />
        </div>
        {isNew && (
          <div className="field" style={{ gridColumn: '1/-1' }}>
            <label>Password * (อย่างน้อย 6 ตัว)</label>
            <div style={{ position: 'relative' }}>
              <input className="input" type={showPw ? 'text' : 'password'}
                value={draft._password || ''}
                onChange={e => set('_password', e.target.value)}
                placeholder="ตั้งรหัสผ่านสำหรับ login ครั้งแรก"
                style={{ paddingRight: 70 }} />
              <button type="button" onClick={() => setShowPw(v => !v)}
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                         background: 'transparent', border: 0, color: 'var(--ink-500)', cursor: 'pointer', fontSize: 11 }}>
                {showPw ? 'ซ่อน' : 'แสดง'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── สิทธิ์เข้าหน้า (per-user override) ───────────────────────── */}
      <div style={{ marginTop: 16, padding: 14, background: 'var(--ink-50)', borderRadius: 10, border: '1px solid var(--ink-200)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>🔓 สิทธิ์เข้าหน้า</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
            <input type="radio" name="paccess" checked={!draft._pagesOverride} onChange={() => setOverride(false)} />
            ใช้ default ของ <b>{ROLE_LABELS[draft.role].label}</b> ({allDefault.length} หน้า)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
            <input type="radio" name="paccess" checked={!!draft._pagesOverride} onChange={() => setOverride(true)} />
            กำหนดเอง (custom)
          </label>
          {draft._pagesOverride && (
            <span className="muted" style={{ fontSize: 12, marginLeft: 'auto' }}>
              เลือกแล้ว <b>{draft._pagesArray.length}</b>/{ALL_PAGES.length} หน้า
            </span>
          )}
        </div>

        {draft._pagesOverride && (
          <>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <button className="btn btn-ghost btn-sm" style={{ padding: '2px 10px' }}
                onClick={() => setDraft(d => ({ ...d, _pagesArray: ALL_PAGES.slice() }))}>เลือกทั้งหมด</button>
              <button className="btn btn-ghost btn-sm" style={{ padding: '2px 10px' }}
                onClick={() => setDraft(d => ({ ...d, _pagesArray: [] }))}>ไม่เลือกเลย</button>
              <button className="btn btn-ghost btn-sm" style={{ padding: '2px 10px' }}
                onClick={() => setDraft(d => ({ ...d, _pagesArray: rolePages(d.role) }))}>← default ของ role</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              {PAGE_GROUPS.map(g => {
                const checkedInGroup = g.pages.filter(p => selected.has(p[0])).length;
                const allChecked = checkedInGroup === g.pages.length;
                return (
                  <div key={g.id} style={{ background: 'var(--surface)', padding: 10, borderRadius: 8, border: '1px solid var(--ink-200)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                        <input type="checkbox" checked={allChecked}
                          ref={el => { if (el) el.indeterminate = !allChecked && checkedInGroup > 0; }}
                          onChange={() => {
                            setDraft(d => {
                              const setArr = new Set(d._pagesArray);
                              if (allChecked) g.pages.forEach(p => setArr.delete(p[0]));
                              else g.pages.forEach(p => setArr.add(p[0]));
                              return { ...d, _pagesArray: Array.from(setArr) };
                            });
                          }} />
                        {g.title}
                      </label>
                      <span className="muted" style={{ fontSize: 11, marginLeft: 'auto' }}>{checkedInGroup}/{g.pages.length}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {g.pages.map(([key, label]) => (
                        <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, cursor: 'pointer', padding: '2px 4px', borderRadius: 4 }}>
                          <input type="checkbox" checked={selected.has(key)} onChange={() => togglePage(key)} />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {!draft._pagesOverride && (
          <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
            ผู้ใช้นี้จะเห็นหน้าตาม role <b>{ROLE_LABELS[draft.role].label}</b> ({allDefault.length} หน้า):<br />
            <span style={{ fontSize: 11.5, color: 'var(--ink-500)' }}>
              {allDefault.map(p => PAGE_LABEL[p] || p).join(' · ')}
            </span>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─── Password reset modal ────────────────────────────────────────────────
function PasswordResetModal({ user, onSubmit, onClose }) {
  const [pw, setPw] = uState('');
  const [show, setShow] = uState(true);

  const genRandom = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const arr = new Uint32Array(10);
    crypto.getRandomValues(arr);
    let s = '';
    for (let i = 0; i < 10; i++) s += chars[arr[i] % chars.length];
    setPw(s); setShow(true);
  };

  return (
    <Modal open={true} title={`🔑 รีเซ็ตรหัสผ่าน · ${user.username}`} maxWidth={460} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>ยกเลิก</button>
        <button className="btn btn-primary" onClick={() => onSubmit(pw)}>ตั้งรหัสใหม่</button>
      </>}>
      <div className="field">
        <label>รหัสผ่านใหม่ (อย่างน้อย 6 ตัว)</label>
        <div style={{ position: 'relative' }}>
          <input className="input" type={show ? 'text' : 'password'}
            value={pw} onChange={e => setPw(e.target.value)} autoFocus
            placeholder="พิมพ์เอง หรือกดสุ่ม"
            style={{ paddingRight: 80, fontFamily: 'ui-monospace' }} />
          <button type="button" onClick={() => setShow(s => !s)}
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                     background: 'transparent', border: 0, color: 'var(--ink-500)', cursor: 'pointer', fontSize: 11 }}>
            {show ? 'ซ่อน' : 'แสดง'}
          </button>
        </div>
      </div>
      <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
        <button className="btn btn-ghost btn-sm" onClick={genRandom} style={{ padding: '4px 12px' }}>🎲 สุ่มรหัส</button>
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 14, padding: 10, background: '#fffbeb', borderLeft: '3px solid #f6ad55', borderRadius: 6 }}>
        💡 รหัสนี้ดูย้อนหลังไม่ได้ — บันทึก/แจ้งให้ผู้ใช้ทันที. ผู้ใช้ต้อง logout แล้ว login ใหม่ด้วยรหัสนี้
      </div>
    </Modal>
  );
}

Object.assign(window, { UsersPage });
