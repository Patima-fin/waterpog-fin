/* page_users.jsx — Users management (manager-only)
   CRUD over the `users` entity, synced to Google Sheet 'users' tab.
   Roles: viewer / staff / manager / owner.
*/
'use strict';

const { useState: uState, useMemo: uMemo, useEffect: uEffect } = React;

const ROLE_LABELS = {
  viewer:  { label: 'Viewer',  color: 'b-gray',   desc: 'ดูเฉพาะ Dashboard (Daily + War Room)' },
  staff:   { label: 'Staff',   color: 'b-blue',   desc: 'แก้ไขข้อมูลได้ แต่ลบไม่ได้' },
  manager: { label: 'Manager', color: 'b-green',  desc: 'ทุกอย่าง รวมจัดการ users + audit log' },
  owner:   { label: 'Owner',   color: 'b-violet', desc: 'ดูได้ทุกหน้า แต่แก้/ลบไม่ได้' },
};

function UsersPage({ data, setData, toast }) {
  // Manager-only guard (extra safety on top of sidebar filtering)
  const canSee = window.WTPAuth ? window.WTPAuth.can('canManageUsers') : true;
  if (!canSee) {
    return (
      <div className="page">
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
          <div style={{ fontWeight: 600, color: 'var(--ink-600)' }}>ต้องเป็น Manager เท่านั้นถึงจะเข้าได้</div>
        </div>
      </div>
    );
  }

  const sheetUsers   = (data && data.users) || [];
  const configUsers  = (window.WTP_CONFIG && window.WTP_CONFIG.USERS) || [];

  // Show Sheet users + config users (read-only). Sheet users have actual id.
  // _source values: 'sheet' (Sheet only) | 'config' (config only) | 'both' (มีทั้งใน Sheet และ config.js — มี bootstrap fallback)
  const combinedRows = uMemo(() => {
    const sheetByName = new Set(sheetUsers.map(u => u.username));
    const configByName = new Set(configUsers.map(u => u.username));
    const rows = sheetUsers.map(u => ({
      ...u,
      _source: configByName.has(u.username) ? 'both' : 'sheet',
    }));
    configUsers.forEach(u => {
      if (!sheetByName.has(u.username)) {
        rows.push({ ...u, _source: 'config', id: 'cfg_' + u.username });
      }
    });
    return rows;
  }, [sheetUsers, configUsers]);

  const [query, setQuery] = uState('');
  const [roleFilter, setRoleFilter] = uState('all');
  const [edit, setEdit] = uState(null);   // null | {} (new) | row (edit)
  const [showPw, setShowPw] = uState({});  // { rowId: bool }
  const [sort, setSort] = uState({ key: 'username', dir: 'asc' });

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
    xs = xs.slice().sort((a, b) => {
      const va = uSortVal(a, sort.key), vb = uSortVal(b, sort.key);
      if (va < vb) return sort.dir === 'asc' ? -1 : 1;
      if (va > vb) return sort.dir === 'asc' ?  1 : -1;
      return 0;
    });
    return xs;
  }, [combinedRows, query, roleFilter, sort]);

  // KPI
  const roleCounts = uMemo(() => {
    const c = { manager: 0, staff: 0, viewer: 0, owner: 0 };
    combinedRows.forEach(u => { if (c[u.role] != null) c[u.role]++; });
    return c;
  }, [combinedRows]);

  // ── CRUD handlers ──────────────────────────────────────────────────────
  const save = (row) => {
    // Validate
    if (!row.username || !row.username.trim()) { toast('กรุณากรอก username'); return; }
    if (!row.password) { toast('กรุณากรอก password'); return; }
    if (!row.role) { toast('กรุณาเลือก role'); return; }

    // Prevent duplicate username (unless editing same row)
    const dup = sheetUsers.find(u => u.username === row.username && u.id !== row.id);
    if (dup) { toast(`username "${row.username}" มีอยู่แล้ว`); return; }

    setData(d => ({
      ...d,
      users: row.id
        ? (d.users || []).map(u => u.id === row.id ? { ...row } : u)
        : [{ ...row, id: WTPData.newId(), active: row.active || 'true' }, ...(d.users || [])],
    }));
    setEdit(null);
    toast(row.id ? 'แก้ไขข้อมูลผู้ใช้แล้ว' : 'เพิ่มผู้ใช้ใหม่แล้ว');
  };

  const remove = (id) => {
    if (!confirm('ลบผู้ใช้นี้?\nจะลบจาก Google Sheet ทันที')) return;
    setData(d => ({ ...d, users: (d.users || []).filter(u => u.id !== id) }));
    toast('ลบผู้ใช้แล้ว');
  };

  const togglePw = (id) => setShowPw(prev => ({ ...prev, [id]: !prev[id] }));

  const emptyUser = { username: '', password: '', displayName: '', role: 'staff', active: 'true', department: '', note: '' };

  return (
    <div className="page">
      <div className="page-head anim-in">
        <div>
          <h1 className="page-title">จัดการผู้ใช้ระบบ · Users</h1>
          <div className="page-sub">
            ผู้ใช้ทั้งหมด {combinedRows.length} คน · Manager-only · sync กับ Google Sheet ชีต <code>users</code>
          </div>
        </div>
        <div className="page-head-r">
          <ExportButton
            rows={filtered.map(u => ({ ...u, password: '••••••' }))}   // mask passwords on export
            columns={[
              { key: 'username',    label: 'Username' },
              { key: 'displayName', label: 'ชื่อผู้ใช้' },
              { key: 'department',  label: 'หน่วยงาน' },
              { key: 'role',        label: 'Role' },
              { key: 'active',      label: 'สถานะ' },
              { key: 'note',        label: 'หมายเหตุ' },
            ]}
            filename="users"
            sheetName="ผู้ใช้"
            title="รายชื่อผู้ใช้ระบบ"
          />
          <PrintButton />
          <button className="btn btn-primary" onClick={() => setEdit({ ...emptyUser })}>
            <Icon name="plus" size={14} /> เพิ่มผู้ใช้
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-4 anim-stagger" style={{ marginBottom: 16 }}>
        <KpiTile animate={false} label="Manager (หัวหน้า)"   value={roleCounts.manager} accent="var(--good)"             icon="settings" unit=" คน" digits={0} />
        <KpiTile animate={false} label="Staff (พนักงาน)"      value={roleCounts.staff}   accent="var(--brand-500)"        icon="receivables" unit=" คน" digits={0} />
        <KpiTile animate={false} label="Owner (เจ้าของ)"      value={roleCounts.owner}   accent="oklch(60% 0.18 295)"     icon="bank" unit=" คน" digits={0} />
        <KpiTile animate={false} label="Viewer (ผู้บริหารดู)" value={roleCounts.viewer}  accent="var(--ink-400)"          icon="daily" unit=" คน" digits={0} />
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
          placeholder="ค้นหา username / ชื่อ…"
          value={query} onChange={e => setQuery(e.target.value)}
          style={{ flex: 1, minWidth: 200, maxWidth: 320 }} />
      </div>

      {/* Table */}
      <div className="card anim-in" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'min(560px, calc(100vh - 400px))' }}>
          <table className="tbl" style={{ minWidth: 980 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 3, background: 'var(--surface)' }}>
              <tr>
                {[
                  { k: 'username',    label: 'Username',  w: 140 },
                  { k: 'displayName', label: 'ชื่อผู้ใช้' },
                  { k: 'department',  label: 'หน่วยงาน',  w: 150 },
                  { k: 'role',        label: 'Role',      w: 130 },
                  { k: null,          label: 'Password',  w: 180 },
                  { k: '_source',     label: 'แหล่ง',     w: 90 },
                  { k: null,          label: '',          w: 110 },
                ].map((c, ci) => (
                  <th key={ci}
                      onClick={() => c.k && toggleSort(c.k)}
                      style={{ width: c.w, cursor: c.k ? 'pointer' : 'default', userSelect: 'none', whiteSpace: 'nowrap', verticalAlign: 'middle' }}
                      title={c.k ? 'คลิกเพื่อเรียงลำดับ' : undefined}>
                    {c.label}
                    {c.k && <span style={{ marginLeft: 4, color: sort.key === c.k ? 'var(--brand-600)' : 'var(--ink-300)', fontSize: 10 }}>{sort.key === c.k ? (sort.dir === 'asc' ? '▲' : '▼') : '⇅'}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 36, textAlign: 'center' }} className="muted">ไม่พบผู้ใช้ที่ตรงกับเงื่อนไข</td></tr>
              )}
              {filtered.map(u => {
                const meta = ROLE_LABELS[u.role] || { label: u.role || '—', color: 'b-gray' };
                const isConfig = u._source === 'config';
                return (
                  <tr key={u.id} style={{ opacity: isConfig ? 0.7 : 1, verticalAlign: 'middle' }}>
                    <td style={{ fontFamily: 'ui-monospace', fontWeight: 600, color: 'var(--brand-700)' }}>
                      {u.username}
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{u.displayName || '—'}</div>
                      {u.note && <div className="muted" style={{ fontSize: 11 }}>{u.note}</div>}
                    </td>
                    <td style={{ fontSize: 12.5, color: 'var(--ink-700)' }}>
                      {u.department ? u.department : <span className="muted">—</span>}
                    </td>
                    <td>
                      <Badge kind={meta.color} dot={false}>{meta.label}</Badge>
                    </td>
                    <td style={{ fontFamily: 'ui-monospace', fontSize: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ flex: 1, color: 'var(--ink-600)', letterSpacing: showPw[u.id] ? 0 : 2 }}>
                          {showPw[u.id] ? (u.password || '—') : (u.password ? '••••••••' : '—')}
                        </span>
                        <button onClick={() => togglePw(u.id)} className="btn btn-ghost btn-sm" style={{ padding: '2px 6px', fontSize: 11 }}>
                          {showPw[u.id] ? 'ซ่อน' : 'แสดง'}
                        </button>
                      </div>
                    </td>
                    <td>
                      {u._source === 'config' && <Badge kind="b-amber" dot={false}>config.js</Badge>}
                      {u._source === 'sheet'  && <Badge kind="b-green" dot={false}>Sheet</Badge>}
                      {u._source === 'both' && (
                        <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
                          <Badge kind="b-green" dot={false}>Sheet</Badge>
                          <Badge kind="b-amber" dot={false} title="มี bootstrap fallback ใน config.js — login ได้ทันทีก่อน sync">config.js</Badge>
                        </span>
                      )}
                    </td>
                    <td>
                      {isConfig ? (
                        <span className="muted" style={{ fontSize: 11 }}>แก้ไม่ได้</span>
                      ) : (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-ghost btn-sm" style={{ padding: '2px 8px' }}
                                  onClick={() => setEdit({ ...u })}>แก้ไข</button>
                          <button className="btn btn-ghost btn-sm" style={{ padding: '2px 8px', color: 'var(--bad)' }}
                                  onClick={() => remove(u.id)}>ลบ</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info box about config.js users */}
      <div className="card" style={{ marginTop: 14, padding: 14, background: '#fffbeb', borderLeft: '4px solid #f6ad55', fontSize: 12, color: 'var(--ink-700)' }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>💡 หมายเหตุ</div>
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
          <li>ผู้ใช้ที่อยู่ใน <code>config.js</code> (สีส้ม) แก้ใน UI ไม่ได้ — ใช้เป็น bootstrap account สำหรับ first-time login</li>
          <li>ผู้ใช้ใน Sheet (สีเขียว) สามารถแก้/ลบได้ที่นี่</li>
          <li>ผู้ใช้ที่มี <b>Sheet + config.js</b> (เขียว+ส้ม) = login ได้แน่นอนทุกเครื่องแม้ Sheet ยังไม่ sync</li>
          <li>การเปลี่ยน password ต้องให้ user logout แล้ว login ใหม่จึง active</li>
          <li>เพื่อความปลอดภัย: Sheet `users` ตั้ง access เป็น Restricted (ไม่ public)</li>
        </ul>
      </div>

      {/* Edit modal */}
      {edit !== null && (
        <UserEditModal
          row={edit}
          onSave={save}
          onClose={() => setEdit(null)}
        />
      )}
    </div>
  );
}

// ─── Edit/Add modal ───────────────────────────────────────────────────────
function UserEditModal({ row, onSave, onClose }) {
  const [draft, setDraft] = uState(null);
  const [showPw, setShowPw] = uState(false);

  uEffect(() => { setDraft(row ? { ...row } : null); }, [row]);
  if (!row || !draft) return null;

  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));

  return (
    <Modal open={!!row} title={row.id ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้ใหม่'}
      maxWidth={560} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>ยกเลิก</button>
        <button className="btn btn-primary" onClick={() => onSave(draft)}>
          <Icon name="check" size={14} /> บันทึก
        </button>
      </>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="field">
          <label>Username *</label>
          <input className="input" autoFocus value={draft.username || ''}
            onChange={e => set('username', e.target.value.trim().toLowerCase())}
            placeholder="เช่น finance3" disabled={!!row.id}
            style={row.id ? { background: 'var(--ink-50)', color: 'var(--ink-500)' } : {}} />
          {row.id && <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>username แก้ไม่ได้</div>}
        </div>
        <div className="field">
          <label>Role *</label>
          <select className="select input" value={draft.role || 'staff'}
            onChange={e => set('role', e.target.value)}>
            {Object.entries(ROLE_LABELS).map(([k, m]) => (
              <option key={k} value={k}>{m.label} — {m.desc}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ gridColumn: '1/-1' }}>
          <label>ชื่อ-นามสกุล (Display Name)</label>
          <input className="input" value={draft.displayName || ''}
            onChange={e => set('displayName', e.target.value)}
            placeholder="เช่น สมหญิง การเงิน" />
        </div>
        <div className="field" style={{ gridColumn: '1/-1' }}>
          <label>Password *</label>
          <div style={{ position: 'relative' }}>
            <input className="input" type={showPw ? 'text' : 'password'}
              value={draft.password || ''}
              onChange={e => set('password', e.target.value)}
              placeholder="อย่างน้อย 6 ตัวอักษร"
              style={{ paddingRight: 70 }} />
            <button type="button" onClick={() => setShowPw(v => !v)}
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                       background: 'transparent', border: 0, color: 'var(--ink-500)', cursor: 'pointer', fontSize: 11 }}>
              {showPw ? 'ซ่อน' : 'แสดง'}
            </button>
          </div>
        </div>
        <div className="field">
          <label>สถานะการใช้งาน</label>
          <select className="select input" value={String(draft.active || 'true')}
            onChange={e => set('active', e.target.value)}>
            <option value="true">เปิดใช้งาน</option>
            <option value="false">ปิด (ห้าม login)</option>
          </select>
        </div>
        <div className="field">
          <label>หน่วยงาน</label>
          <input className="input" value={draft.department || ''}
            onChange={e => set('department', e.target.value)}
            placeholder="เช่น การเงิน / บัญชี / จัดซื้อ" />
        </div>
        <div className="field" style={{ gridColumn: '1/-1' }}>
          <label>หมายเหตุ</label>
          <input className="input" value={draft.note || ''}
            onChange={e => set('note', e.target.value)}
            placeholder="หมายเหตุเพิ่มเติม" />
        </div>
        <div className="field" style={{ gridColumn: '1/-1' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox"
              checked={String(draft.notifyDailyBalance || 'false') === 'true'}
              onChange={e => set('notifyDailyBalance', e.target.checked ? 'true' : 'false')}
              style={{ cursor: 'pointer' }} />
            🔔 เตือนบันทึกยอดธนาคารรายวัน — user นี้จะเห็น pill เตือนใน sidebar ถ้ายังไม่บันทึก
          </label>
        </div>
      </div>
    </Modal>
  );
}

Object.assign(window, { UsersPage });
