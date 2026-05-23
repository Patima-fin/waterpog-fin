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

const ChecksPage = () => {
  const data = WTPData.load();
  const checks = data.checks || [];
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
        <button className="btn btn-primary" onClick={openNew}>+ เพิ่มเช็ค</button>
      </div>

      {/* KPIs */}
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <ChkStatTile label="รอจ่าย"            value={fmtMoney(pendingTotal)}
                 sub={`${checks.filter(c=>c.status==='pending').length} ฉบับ`} color="yellow" />
        <ChkStatTile label="กำลังเรียกเก็บ"    value={fmtMoney(clearingTotal)}
                 sub={`${checks.filter(c=>c.status==='clearing').length} ฉบับ`} color="blue" />
        <ChkStatTile label="ครบกำหนด 7 วัน"   value={fmtMoney(upcoming7)}
                 sub="รอจ่ายที่ใกล้ถึง" color="orange" />
        <ChkStatTile label="เกินกำหนด (pending)" value={overdueCount}
                 sub="ฉบับ" color={overdueCount > 0 ? 'red' : 'green'} />
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
        <div className="tbl-wrap" style={{ overflowX:'auto' }}>
          <table className="tbl" style={{ minWidth: 850 }}>
            <thead>
              <tr>
                <SortTh col="checkNo">เลขเช็ค</SortTh>
                <SortTh col="checkDate">วันที่เช็ค</SortTh>
                <SortTh col="payee">ผู้รับเงิน</SortTh>
                <SortTh col="amount">จำนวนเงิน</SortTh>
                <SortTh col="bankName">ธนาคาร</SortTh>
                <th>เลขบัญชี</th>
                <th>อ้างอิง</th>
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
                  <tr key={c.id} style={{ background: isOverdue ? '#fff5f5' : isUrgent ? '#fffbeb' : undefined }}>
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
                    <td>
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
    </div>
  );
};
