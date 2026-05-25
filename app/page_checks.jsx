/* page_checks.jsx — เช็คจ่ายล่วงหน้า */
'use strict';

const _CHK_ACCENT = { blue:'var(--brand-500)', orange:'oklch(60% 0.18 55)', yellow:'oklch(65% 0.18 75)', teal:'oklch(52% 0.16 185)', red:'var(--bad,#e53e3e)', green:'oklch(50% 0.18 145)' };
const ChkStatTile = ({ label, value, sub, color = 'blue' }) => (
  <div className="kpi">
    <div className="kpi-accent" style={{ background: _CHK_ACCENT[color] || _CHK_ACCENT.blue }} />
    <div className="kpi-label">{label}</div>
    <div className="kpi-value" style={{ fontSize: 18 }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color:'var(--ink-400,#8a94a6)', marginTop: 2 }}>{sub}</div>}
  </div>
);

const CHECKS_STATUS_META = {
  pending:   { label:'รอจ่าย',    color:'b-amber' },
  clearing:  { label:'กำลังเรียกเก็บ', color:'b-blue' },
  cleared:   { label:'ผ่านแล้ว',  color:'b-green' },
  cancelled: { label:'ยกเลิก',    color:'b-gray' },
};

// Normalize Thai status values (imported from RAW) → internal status codes
function normStatus(s) {
  if (!s) return 'pending';
  if (s === 'จ่ายแล้ว' || s === 'ขึ้นเงินแล้ว' || s.indexOf('ได้รับคืน') >= 0 || s.indexOf('ได้รับเช็คคืน') >= 0) return 'cleared';
  if (s.indexOf('รอ') >= 0) return 'clearing';
  if (s.indexOf('ยกเลิก') >= 0 || s.indexOf('เด้ง') >= 0) return 'cancelled';
  return 'pending';
}

const ChecksPage = ({ data: propData }) => {
  const data = propData || WTPData.load();
  const rawChecks = data.checks || [];
  // Normalize status so existing tabs/filters work with imported Thai-status data
  const checks = React.useMemo(() => rawChecks.map(c => ({ ...c, status: normStatus(c.status) })), [rawChecks]);
  const today  = new Date().toISOString().slice(0, 10);
  const in7    = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const TABS = [
    { key:'all',       label:'ทั้งหมด' },
    { key:'pending',   label:'รอจ่าย' },
    { key:'clearing',  label:'กำลังเรียกเก็บ' },
    { key:'cleared',   label:'ผ่านแล้ว' },
    { key:'cancelled', label:'ยกเลิก' },
  ];

  const emptyForm = { checkNo:'', checkDate:'', payee:'', amount:'', bankName:'', accountNo:'',
                      referenceNo:'', linkedProjectCode:'', status:'pending', note:'' };

  const [tab, setTab]       = React.useState('all');
  const [query, setQuery]   = React.useState('');
  const [edit, setEdit]     = React.useState(null);   // null = closed, {} = new, {...} = editing
  const [view, setView]     = React.useState(null);   // popup for viewing check (read-only)
  const [form, setForm]     = React.useState(emptyForm);

  const { sorted, sort, toggle: requestSort } = useSortable(checks, 'checkDate', 'asc');
  const sortKey = sort.key; const sortDir = sort.dir;

  const filtered = React.useMemo(() => {
    let rows = sorted;
    if (tab !== 'all') rows = rows.filter(c => c.status === tab);
    if (query) {
      const q = query.toLowerCase();
      rows = rows.filter(c =>
        (c.checkNo   || '').toLowerCase().includes(q) ||
        (c.payee     || '').toLowerCase().includes(q) ||
        (c.bankName  || '').toLowerCase().includes(q) ||
        (c.referenceNo||'').toLowerCase().includes(q)
      );
    }
    return rows;
  }, [sorted, tab, query]);

  /* KPIs */
  const pendingTotal  = checks.filter(c => c.status === 'pending').reduce((s,c) => s+(parseFloat(c.amount)||0), 0);
  const clearingTotal = checks.filter(c => c.status === 'clearing').reduce((s,c) => s+(parseFloat(c.amount)||0), 0);
  const upcoming7     = checks.filter(c => c.status === 'pending' && c.checkDate >= today && c.checkDate <= in7)
                              .reduce((s,c) => s+(parseFloat(c.amount)||0), 0);
  const overdueCount  = checks.filter(c => c.status === 'pending' && c.checkDate < today).length;

  /* Save to localStorage */
  const saveChecks = (rows) => {
    const d = WTPData.load();
    d.checks = rows;
    WTPData.save(d);
  };

  const openNew  = () => { setForm(emptyForm); setEdit({}); };
  const openEdit = (c)  => { setForm({ ...c }); setEdit(c); };
  const closeEdit= ()   => setEdit(null);

  const handleSave = () => {
    if (!form.checkDate || !form.payee || !form.amount) return;
    const d = WTPData.load();
    const rows = [...(d.checks || [])];
    if (edit && edit.id) {
      const idx = rows.findIndex(r => r.id === edit.id);
      if (idx >= 0) rows[idx] = { ...form, id: edit.id };
    } else {
      rows.push({ ...form, id: WTPData.newId() });
    }
    saveChecks(rows);
    closeEdit();
    window.location.reload();
  };

  const handleDelete = (id) => {
    if (!window.confirm('ลบรายการนี้?')) return;
    const d = WTPData.load();
    d.checks = (d.checks || []).filter(c => c.id !== id);
    WTPData.save(d);
    window.location.reload();
  };

  const SortTh = ({ col, children }) => (
    <th className="sortable" onClick={() => requestSort(col)}
        style={{ cursor:'pointer', userSelect:'none', whiteSpace:'nowrap' }}>
      {children}{sortKey===col ? (sortDir==='asc' ? ' ▲' : ' ▼') : ' ⇅'}
    </th>
  );

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-title">เช็คจ่ายล่วงหน้า</div>
          <div className="page-sub">รายการเช็คทั้งหมด • {checks.length} ฉบับ</div>
        </div>
        <div className="page-head-r">
          <ExportButton
            rows={filtered}
            columns={[
              { key: 'checkNo',           label: 'เลขที่เช็ค' },
              { key: 'checkDate',         label: 'วันที่เช็ค', type: 'date' },
              { key: 'payee',             label: 'ผู้รับเงิน' },
              { key: 'amount',            label: 'จำนวนเงิน (฿)', type: 'number' },
              { key: 'bankName',          label: 'ธนาคาร' },
              { key: 'accountNo',         label: 'เลขที่บัญชี' },
              { key: 'referenceNo',       label: 'เลขอ้างอิง' },
              { key: 'linkedProjectCode', label: 'โครงการ' },
              { key: 'status',            label: 'สถานะ' },
              { key: 'note',              label: 'หมายเหตุ' },
            ]}
            filename="checks"
            sheetName="เช็คจ่าย"
            title="เช็คจ่ายล่วงหน้า"
          />
          <PrintButton />
          <button className="btn btn-primary" onClick={openNew}>+ เพิ่มเช็ค</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-4 anim-stagger" style={{ marginBottom: 16 }}>
        <KpiTile label="รอจ่าย"             value={pendingTotal}  accent="oklch(65% 0.18 75)"  icon="money"     animate={false} />
        <KpiTile label="กำลังเรียกเก็บ"     value={clearingTotal} accent="var(--brand-500)"    icon="coin"      animate={false} />
        <KpiTile label="ครบกำหนด 7 วัน"    value={upcoming7}     accent="oklch(60% 0.18 55)"  icon="invoice"   animate={false} />
        <KpiTile label="เกินกำหนด"          value={overdueCount}  accent={overdueCount > 0 ? 'var(--bad)' : 'var(--good)'} unit=" ฉบับ" digits={0} icon="arrow_up" animate={false} />
      </div>

      {/* Filter bar */}
      <div style={{ display:'flex', alignItems:'center', gap: 12, marginBottom: 12, flexWrap:'wrap' }}>
        <div className="tabnav" style={{ flex:'none' }}>
          {TABS.map(t => (
            <button key={t.key} className={tab===t.key ? 'active' : ''}
                    onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </div>
        <input className="input" placeholder="ค้นหาเลขเช็ค / ผู้รับ / ธนาคาร…"
               value={query} onChange={e => setQuery(e.target.value)}
               style={{ width: '100%', maxWidth: 300 }} />
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow:'hidden' }}>
        <div className="tbl-wrap" style={{ overflowX:'auto', overflowY:'auto', maxHeight:'min(480px, calc(100vh - 400px))' }}>
          <table className="tbl" style={{ minWidth: 850 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 3, background: 'var(--surface)' }}>
              <tr>
                <SortTh col="checkNo">เลขที่เช็ค</SortTh>
                <SortTh col="checkDate">วันที่เช็ค</SortTh>
                <SortTh col="payee">ผู้รับเงิน</SortTh>
                <SortTh col="amount">จำนวนเงิน (฿)</SortTh>
                <SortTh col="bankName">ธนาคาร</SortTh>
                <th>เลขที่บัญชี</th>
                <th>เลขอ้างอิง</th>
                <SortTh col="status">สถานะ</SortTh>
                <th>หมายเหตุ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={10} style={{ textAlign:'center', color:'#8a94a6', padding:32 }}>ไม่พบข้อมูล</td></tr>
              )}
              {filtered.map(c => {
                const isOverdue = c.status === 'pending' && c.checkDate < today;
                const isUrgent  = c.status === 'pending' && c.checkDate >= today && c.checkDate <= in7;
                const meta = CHECKS_STATUS_META[c.status] || { label: c.status, color:'badge-gray' };
                return (
                  <tr key={c.id} onClick={() => setView(c)}
                      style={{ background: isOverdue ? '#fff5f5' : isUrgent ? '#fffbeb' : undefined, cursor:'pointer' }}>
                    <td style={{ fontWeight: 600, fontSize: 12 }}>{c.checkNo}</td>
                    <td style={{ fontSize: 12, color: isOverdue ? '#e53e3e' : isUrgent ? '#dd6b20' : undefined }}>
                      {fmtDate(c.checkDate)}
                      {isOverdue && <span style={{ fontSize: 10, marginLeft: 4, color:'#e53e3e' }}>⚠</span>}
                    </td>
                    <td>{c.payee}</td>
                    <td style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', fontWeight: 600 }}>
                      {fmtMoney(c.amount)}
                    </td>
                    <td style={{ fontSize: 12 }}>{c.bankName}</td>
                    <td style={{ fontSize: 11, color:'#718096' }}>{c.accountNo}</td>
                    <td style={{ fontSize: 11, color:'#718096' }}>{c.referenceNo || '—'}</td>
                    <td><span className={`badge ${meta.color}`}>{meta.label}</span></td>
                    <td style={{ fontSize: 11, color:'#718096' }}>{c.note || '—'}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display:'flex', gap: 4 }}>
                        <button className="btn btn-ghost" style={{ padding:'2px 8px', fontSize: 11 }}
                                onClick={() => openEdit(c)}>แก้ไข</button>
                        <button className="btn btn-ghost" style={{ padding:'2px 8px', fontSize: 11, color:'#e53e3e' }}
                                onClick={() => handleDelete(c.id)}>ลบ</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr style={{ background:'#edf2ff', fontWeight: 700 }}>
                  <td colSpan={3} style={{ textAlign:'right', paddingRight: 8 }}>
                    รวม ({filtered.length} ฉบับ)
                  </td>
                  <td style={{ textAlign:'right', fontVariantNumeric:'tabular-nums' }}>
                    {fmtMoney(filtered.reduce((s,c)=>s+(parseFloat(c.amount)||0), 0))}
                  </td>
                  <td colSpan={6}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {edit !== null && (
        <div className="modal-back" onClick={closeEdit}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="modal-hd">
              <span className="modal-title" style={{ fontSize: 16 }}>{edit.id ? 'แก้ไขเช็ค' : 'เพิ่มเช็คใหม่'}</span>
              <button className="btn btn-ghost btn-sm" onClick={closeEdit}><Icon name="x" size={16} /></button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 12 }}>
              <label style={{ display:'flex', flexDirection:'column', gap: 4, fontSize: 13 }}>
                เลขที่เช็ค
                <input className="input" value={form.checkNo}
                       onChange={e => setForm(f=>({...f, checkNo:e.target.value}))} />
              </label>
              <label style={{ display:'flex', flexDirection:'column', gap: 4, fontSize: 13 }}>
                วันที่เช็ค *
                <input type="date" className="input" value={form.checkDate}
                       onChange={e => setForm(f=>({...f, checkDate:e.target.value}))} />
              </label>
              <label style={{ display:'flex', flexDirection:'column', gap: 4, fontSize: 13, gridColumn:'1/-1' }}>
                ผู้รับเงิน *
                <input className="input" value={form.payee}
                       onChange={e => setForm(f=>({...f, payee:e.target.value}))} />
              </label>
              <label style={{ display:'flex', flexDirection:'column', gap: 4, fontSize: 13 }}>
                จำนวนเงิน *
                <input type="number" className="input" value={form.amount}
                       onChange={e => setForm(f=>({...f, amount:e.target.value}))} />
              </label>
              <label style={{ display:'flex', flexDirection:'column', gap: 4, fontSize: 13 }}>
                สถานะ
                <select className="input" value={form.status}
                        onChange={e => setForm(f=>({...f, status:e.target.value}))}>
                  {Object.entries(CHECKS_STATUS_META).map(([k,v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </label>
              <label style={{ display:'flex', flexDirection:'column', gap: 4, fontSize: 13 }}>
                ธนาคาร
                <input className="input" value={form.bankName}
                       onChange={e => setForm(f=>({...f, bankName:e.target.value}))} />
              </label>
              <label style={{ display:'flex', flexDirection:'column', gap: 4, fontSize: 13 }}>
                เลขบัญชี
                <input className="input" value={form.accountNo}
                       onChange={e => setForm(f=>({...f, accountNo:e.target.value}))} />
              </label>
              <label style={{ display:'flex', flexDirection:'column', gap: 4, fontSize: 13 }}>
                อ้างอิง / PO
                <input className="input" value={form.referenceNo}
                       onChange={e => setForm(f=>({...f, referenceNo:e.target.value}))} />
              </label>
              <label style={{ display:'flex', flexDirection:'column', gap: 4, fontSize: 13 }}>
                โครงการ
                <input className="input" value={form.linkedProjectCode}
                       onChange={e => setForm(f=>({...f, linkedProjectCode:e.target.value}))} />
              </label>
              <label style={{ display:'flex', flexDirection:'column', gap: 4, fontSize: 13, gridColumn:'1/-1' }}>
                หมายเหตุ
                <input className="input" value={form.note}
                       onChange={e => setForm(f=>({...f, note:e.target.value}))} />
              </label>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={closeEdit}>ยกเลิก</button>
              <button className="btn btn-primary" onClick={handleSave}>บันทึก</button>
            </div>
          </div>
        </div>
      )}

      {/* View Modal — read-only popup for inspecting a check */}
      {view && (() => {
        const meta = CHECKS_STATUS_META[view.status] || { label: view.status || '—', color:'b-gray' };
        const isOverdue = view.status === 'pending' && view.checkDate < today;
        const isUrgent  = view.status === 'pending' && view.checkDate >= today && view.checkDate <= in7;
        const fld = (label, value, highlight) => (
          <div className="field">
            <label style={{ fontSize: 12, color: 'var(--ink-500)' }}>{label}</label>
            <div style={{
              minHeight: 34, borderRadius: 7, border: '1px solid var(--ink-100)',
              padding: '6px 10px', fontSize: 13, lineHeight: 1.5,
              background: highlight ? 'color-mix(in oklch, var(--bad) 9%, transparent)' : 'var(--ink-25, #f9fafb)',
              color: highlight ? 'var(--bad)' : 'var(--ink-700)',
              fontWeight: highlight ? 700 : 400,
              wordBreak: 'break-word', userSelect: 'text',
            }}>{value || '—'}</div>
          </div>
        );
        return (
          <div className="modal-back" onClick={() => setView(null)}>
            <div className="modal" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
              <div className="modal-hd">
                <span className="modal-title" style={{ fontSize: 16 }}>
                  ข้อมูลเช็ค · {view.checkNo || '—'}
                </span>
                <button className="btn btn-ghost btn-sm" onClick={() => setView(null)}>
                  <Icon name="x" size={16} />
                </button>
              </div>

              {/* Status header banner */}
              <div style={{
                padding: '12px 14px', borderRadius: 10, marginBottom: 14,
                background: isOverdue ? '#fff5f5' : isUrgent ? '#fffbeb' : 'var(--ink-50)',
                border: '1px solid ' + (isOverdue ? '#fed7d7' : isUrgent ? '#fde68a' : 'var(--line)'),
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: 0.5 }}>สถานะ</div>
                  <div style={{ marginTop: 4 }}>
                    <span className={`badge ${meta.color}`}>{meta.label}</span>
                    {isOverdue && <span style={{ marginLeft: 6, fontSize: 11, color:'#e53e3e', fontWeight:600 }}>⚠ เกินกำหนด</span>}
                    {isUrgent  && <span style={{ marginLeft: 6, fontSize: 11, color:'#dd6b20', fontWeight:600 }}>ใกล้ครบกำหนด</span>}
                  </div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize: 11, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: 0.5 }}>จำนวนเงิน</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--bad)', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtMoney(view.amount)} <span style={{ fontSize: 12, color:'var(--ink-500)' }}>฿</span>
                  </div>
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 12 }}>
                {fld('เลขที่เช็ค', view.checkNo)}
                {fld('วันที่เช็ค', fmtDate(view.checkDate) || view.checkDate, isOverdue || isUrgent)}
                <div style={{ gridColumn: '1/-1' }}>{fld('ผู้รับเงิน', view.payee)}</div>
                {fld('ธนาคาร', view.bankName)}
                {fld('เลขที่บัญชี', view.accountNo)}
                {fld('เลขอ้างอิง / PO', view.referenceNo)}
                {fld('โครงการ', view.linkedProjectCode)}
                <div style={{ gridColumn: '1/-1' }}>{fld('หมายเหตุ', view.note)}</div>
              </div>

              <div className="modal-foot">
                <button className="btn btn-ghost" onClick={() => setView(null)}>ปิด</button>
                <button className="btn btn-primary" onClick={() => { setView(null); openEdit(view); }}>
                  <Icon name="edit" size={14} /> แก้ไข
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
