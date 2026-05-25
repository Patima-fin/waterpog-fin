/* page_audit_log.jsx — Audit Log viewer (manager-only)
   Reads the `auditLog` sheet via the same gviz CSV fetch as everything else.
   Auto-paginated, filterable by user/entity/action, sortable by timestamp.
*/
'use strict';

const { useState: alState, useEffect: alEffect, useMemo: alMemo } = React;

const AL_ACTION_META = {
  add:        { label: 'เพิ่ม',         color: 'b-green' },
  update:     { label: 'แก้ไข',         color: 'b-amber' },
  delete:     { label: 'ลบ',            color: 'b-red' },
  replaceAll: { label: 'อัพเดททั้งหมด', color: 'b-blue' },
};

function AuditLogPage({ data, toast }) {
  // Fetch directly from sheet (gviz CSV) on mount + manual refresh
  const [rows, setRows] = alState(null);
  const [err, setErr]   = alState(null);
  const [query, setQuery] = alState('');
  const [actionFilter, setActionFilter] = alState('all');
  const [entityFilter, setEntityFilter] = alState('all');
  const [limit, setLimit] = alState(200);   // tail length

  const load = () => {
    if (!window.WTPData || !window.WTPData.fetchSheetRows) {
      setErr('Sync ไม่พร้อมใช้งาน — ตรวจสอบ config.js');
      return;
    }
    setErr(null);
    setRows(null);
    window.WTPData.fetchSheetRows('auditLog')
      .then(rs => {
        // Sort newest first
        const sorted = (rs || []).slice().sort((a, b) => {
          const ta = new Date(a.timestamp || 0).getTime();
          const tb = new Date(b.timestamp || 0).getTime();
          return tb - ta;
        });
        setRows(sorted);
      })
      .catch(e => setErr(String(e && e.message || e)));
  };

  alEffect(() => { load(); }, []);

  const filtered = alMemo(() => {
    if (!rows) return [];
    let xs = rows;
    if (actionFilter !== 'all') xs = xs.filter(r => r.action === actionFilter);
    if (entityFilter !== 'all') xs = xs.filter(r => r.entity === entityFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      xs = xs.filter(r =>
        (r.user || '').toLowerCase().includes(q) ||
        (r.displayName || '').toLowerCase().includes(q) ||
        (r.entity || '').toLowerCase().includes(q) ||
        (r.summary || '').toLowerCase().includes(q));
    }
    return xs.slice(0, limit);
  }, [rows, query, actionFilter, entityFilter, limit]);

  const entityOptions = alMemo(() => {
    if (!rows) return [];
    return [...new Set(rows.map(r => r.entity).filter(Boolean))].sort();
  }, [rows]);

  const totals = alMemo(() => {
    if (!rows) return { all: 0, byAction: {}, byUser: {} };
    const byAction = {}, byUser = {};
    rows.forEach(r => {
      byAction[r.action] = (byAction[r.action] || 0) + 1;
      const u = r.displayName || r.user || 'unknown';
      byUser[u] = (byUser[u] || 0) + 1;
    });
    return { all: rows.length, byAction, byUser };
  }, [rows]);

  const fmtTimestamp = (t) => {
    if (!t) return '—';
    const d = new Date(t);
    if (isNaN(d)) return String(t);
    return d.toLocaleString('th-TH-u-ca-gregory', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    });
  };

  // Manager-only guard
  const canSee = window.WTPAuth ? window.WTPAuth.can('canManageUsers') : true;
  if (!canSee) {
    return (
      <div className="page">
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
          <div style={{ fontWeight: 600, color: 'var(--ink-600)' }}>ต้องเป็น Manager เท่านั้นถึงดูได้</div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head anim-in">
        <div>
          <h1 className="page-title">Audit Log · บันทึกการแก้ไขข้อมูล</h1>
          <div className="page-sub">
            ดูประวัติว่าใคร-แก้-อะไร-เมื่อไหร่ · ดึงจากชีต <code>auditLog</code>
            {rows && <> · ทั้งหมด {rows.length} รายการ</>}
          </div>
        </div>
        <div className="page-head-r">
          <button className="btn btn-ghost" onClick={load}>
            <Icon name="refresh" size={14} /> รีเฟรช
          </button>
          {rows && (
            <ExportButton
              rows={filtered}
              columns={[
                { key: 'timestamp',    label: 'เวลา' },
                { key: 'user',         label: 'username' },
                { key: 'displayName',  label: 'ผู้ใช้' },
                { key: 'role',         label: 'role' },
                { key: 'action',       label: 'การกระทำ' },
                { key: 'entity',       label: 'ตาราง' },
                { key: 'rowsAffected', label: 'จำนวนแถว', type: 'number' },
                { key: 'summary',      label: 'รายละเอียด' },
              ]}
              filename="audit_log"
              sheetName="Audit Log"
              title="Audit Log · บันทึกการแก้ไขข้อมูล"
            />
          )}
          <PrintButton />
        </div>
      </div>

      {/* KPIs */}
      {rows && (
        <div className="grid grid-4 anim-stagger" style={{ marginBottom: 16 }}>
          <KpiTile animate={false} label="บันทึกทั้งหมด" value={totals.all}              accent="var(--brand-500)"      icon="invoice" unit=" รายการ" digits={0} />
          <KpiTile animate={false} label="เพิ่ม"          value={totals.byAction.add || 0}      accent="var(--good)"           icon="plus"    unit=" ครั้ง" digits={0} />
          <KpiTile animate={false} label="แก้ไข + ลบ"      value={(totals.byAction.update || 0) + (totals.byAction.delete || 0)} accent="oklch(60% 0.18 55)" icon="edit" unit=" ครั้ง" digits={0} />
          <KpiTile animate={false} label="Sync rounds"   value={totals.byAction.replaceAll || 0}    accent="oklch(52% 0.16 220)"   icon="refresh" unit=" ครั้ง" digits={0} />
        </div>
      )}

      {/* Filter bar */}
      <div className="card" style={{ padding: 10, marginBottom: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="tabnav" style={{ flex: 'none' }}>
          <button className={actionFilter === 'all' ? 'active' : ''} onClick={() => setActionFilter('all')}>ทั้งหมด</button>
          <button className={actionFilter === 'add' ? 'active' : ''} onClick={() => setActionFilter('add')}>เพิ่ม</button>
          <button className={actionFilter === 'update' ? 'active' : ''} onClick={() => setActionFilter('update')}>แก้ไข</button>
          <button className={actionFilter === 'delete' ? 'active' : ''} onClick={() => setActionFilter('delete')}>ลบ</button>
          <button className={actionFilter === 'replaceAll' ? 'active' : ''} onClick={() => setActionFilter('replaceAll')}>Sync</button>
        </div>
        <select className="input" value={entityFilter} onChange={e => setEntityFilter(e.target.value)} style={{ width: 'auto', minWidth: 140 }}>
          <option value="all">ทุกตาราง</option>
          {entityOptions.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <input className="input"
          placeholder="ค้นหา user / entity / summary…"
          value={query} onChange={e => setQuery(e.target.value)}
          style={{ flex: 1, minWidth: 200, maxWidth: 360 }} />
        <select className="input" value={limit} onChange={e => setLimit(Number(e.target.value))} style={{ width: 'auto' }}>
          <option value={100}>100 รายการล่าสุด</option>
          <option value={200}>200 รายการล่าสุด</option>
          <option value={500}>500 รายการล่าสุด</option>
          <option value={2000}>2000 รายการล่าสุด</option>
        </select>
      </div>

      {/* Status & error */}
      {!rows && !err && (
        <div className="card" style={{ padding: 40, textAlign: 'center' }} className="muted">
          กำลังโหลด…
        </div>
      )}
      {err && (
        <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--bad)' }}>
          ดึงข้อมูลล้มเหลว: {err}
          <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 8 }}>
            ตรวจสอบว่ามี sheet ชื่อ <code>auditLog</code> ใน Google Sheet แล้วหรือยัง
            (สร้างอัตโนมัติเมื่อมีการ CRUD ครั้งแรกหลัง deploy Apps Script ใหม่)
          </div>
        </div>
      )}

      {rows && rows.length === 0 && (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
          <div style={{ fontWeight: 600, color: 'var(--ink-600)' }}>ยังไม่มีบันทึก audit log</div>
          <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 8 }}>
            ระบบจะเริ่มบันทึกเมื่อมีการแก้ไขข้อมูล (หลัง deploy Apps Script ใหม่)
          </div>
        </div>
      )}

      {/* Table */}
      {rows && rows.length > 0 && (
        <div className="card anim-in" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'min(560px, calc(100vh - 400px))' }}>
            <table className="tbl" style={{ minWidth: 1000 }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 3, background: 'var(--surface)' }}>
                <tr>
                  <th style={{ width: 165 }}>เวลา</th>
                  <th style={{ width: 140 }}>ผู้ใช้</th>
                  <th style={{ width: 80 }}>Role</th>
                  <th style={{ width: 100 }}>การกระทำ</th>
                  <th style={{ width: 130 }}>ตาราง</th>
                  <th style={{ width: 70, textAlign: 'right' }}>จำนวนแถว</th>
                  <th>รายละเอียด</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: 36, textAlign: 'center' }} className="muted">ไม่พบบันทึกที่ตรงเงื่อนไข</td></tr>
                )}
                {filtered.map((r, i) => {
                  const a = AL_ACTION_META[r.action] || { label: r.action || '—', color: 'b-gray' };
                  return (
                    <tr key={i}>
                      <td style={{ fontSize: 11, fontFamily: 'ui-monospace', color: 'var(--ink-600)', whiteSpace: 'nowrap' }}>
                        {fmtTimestamp(r.timestamp)}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        <div style={{ fontWeight: 600 }}>{r.displayName || r.user || '—'}</div>
                        {r.displayName && r.user && (
                          <div style={{ fontSize: 10, color: 'var(--ink-400)', fontFamily: 'ui-monospace' }}>@{r.user}</div>
                        )}
                      </td>
                      <td style={{ fontSize: 11 }}>
                        {r.role ? <Badge kind="b-gray" dot={false}>{r.role}</Badge> : <span className="muted">—</span>}
                      </td>
                      <td>
                        <Badge kind={a.color} dot={false}>{a.label}</Badge>
                      </td>
                      <td style={{ fontFamily: 'ui-monospace', fontSize: 11.5, color: 'var(--brand-700)' }}>
                        {r.entity || '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                        {r.rowsAffected != null ? r.rowsAffected : '—'}
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--ink-500)', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          title={r.summary || ''}>
                        {r.summary || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { AuditLogPage });
