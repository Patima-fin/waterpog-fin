// Projects page — RAW schema v2
// Field mapping: 'Contract No.' = code, 'พื้นที่' = name/location,
//   'Start'/'Finish' = dates, 'งบประมาณ' = allocBudget,
//   'มูลค่าสัญญาที่เซ็น' = signedValue, flat Payment 1/2/3 columns
const { useState: pjState, useMemo: pjMemo } = React;

function ProjectsPage({ data, setData, toast }) {
  const [filter, setFilter] = pjState('all');
  const [query,  setQuery]  = pjState('');
  const [detail, setDetail] = pjState(null);
  const [edit,   setEdit]   = pjState(null);

  const rows = pjMemo(() => data.projects.map(p => {
    const code = p['Contract No.'] || p.code || '';
    return {
      ...p,
      _code:        code,
      _name:        p['พื้นที่'] || p.name || '—',
      _start:       p['Start']  || p.startDate || '',
      _finish:      p['Finish'] || p.finishDate || '',
      _budget:      Number(p['งบประมาณ']             || p.allocBudget  || 0),
      _signed:      Number(p['มูลค่าสัญญาที่เซ็น']   || p.signedValue  || 0),
      _debt:        Number(p['ภาระหนี้']              || p.debt         || 0),
      _assignee:    p['ผู้รับโอนสิทธิ์'] || p.assignee || '—',
      _pogPct:      p['% (POG+STANK)']  != null ? Number(p['% (POG+STANK)'])  : null,
      _status:      p['สถานะโครงการ']   || p.status   || '',
      _timelineDays: WTPData.daysBetween(p['Start'] || p.startDate, p['Finish'] || p.finishDate),
    };
  }), [data.projects]);

  const filtered = pjMemo(() => {
    let xs = rows;
    if (filter !== 'all') xs = xs.filter(p => p.status === filter || p['สถานะโครงการ'] === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      xs = xs.filter(p =>
        p._code.toLowerCase().includes(q) ||
        p._name.toLowerCase().includes(q) ||
        (p._assignee || '').toLowerCase().includes(q)
      );
    }
    return xs;
  }, [rows, filter, query]);

  const { sorted, sort, toggle } = useSortable(filtered, '_code', 'asc');

  const counts = {
    all:          rows.length,
    waiting_sign: rows.filter(p => p.status === 'waiting_sign').length,
    signed_wip:   rows.filter(p => p.status === 'signed_wip').length,
    invoiced:     rows.filter(p => p.status === 'invoiced').length,
    paid:         rows.filter(p => p.status === 'paid').length,
  };
  const tot = rows.reduce((acc, p) => {
    acc.alloc  += p._budget  || 0;
    acc.signed += p._signed  || 0;
    acc.debt   += p._debt    || 0;
    return acc;
  }, { alloc: 0, signed: 0, debt: 0 });

  const save = (p) => {
    setData(d => ({
      ...d,
      projects: p.id ? d.projects.map(x => x.id === p.id ? p : x) : [{ ...p, id: WTPData.newId() }, ...d.projects],
    }));
    setEdit(null);
    if (detail && detail.id === p.id) setDetail(p);
    toast('บันทึกโครงการแล้ว');
  };

  const saveInline = (id, patch) => {
    setData(d => ({ ...d, projects: d.projects.map(p => p.id === id ? { ...p, ...patch } : p) }));
  };

  const newProject = () => setEdit({
    id: null,
    'Contract No.': '', 'พื้นที่': '', 'Type': '', 'Province': '',
    'Start': '', 'Finish': '', 'งบประมาณ': 0, 'มูลค่าสัญญาที่เซ็น': 0,
    'สถานะโครงการ': '', 'ผู้รับโอนสิทธิ์': '', 'ภาระหนี้': 0,
    'Ref.code': '', 'Remark': '',
    'เซ็นสัญญา': '', 'แจ้งเข้าดำเนินการ': '', 'หยุดเวลา': 0,
    '% (POG+STANK)': null, '% (POG DRINK)': null,
    'Payment 1': 0, 'Payment 1 Status': '', 'Receive Date': '',
    'Payment 2': 0, 'Payment 2 Status': '', 'Receive Date2': '',
    'Payment 3': 0, 'Payment 3 Status': '', 'Receive Date3': '',
    'TOTAL': 0, 'Receive': 0, '% Progress': null,
    status: 'waiting_sign', expectedPay1: '', expectedPay2: '',
  });

  return (
    <div className="page">
      <div className="page-head anim-in">
        <div>
          <h1 className="page-title">โครงการทั้งหมด</h1>
          <div className="page-sub">{rows.length} โครงการ · มูลค่าสัญญารวม {fmtNum(tot.signed, 0)} บาท</div>
        </div>
        <div className="page-head-r">
          <button className="btn btn-primary" onClick={newProject}><Icon name="plus" size={14} /> เพิ่มโครงการ</button>
        </div>
      </div>

      <div className="grid grid-4 anim-stagger" style={{ marginBottom: 16 }}>
        <KpiTile label="เงินตามใบจัดสรรรวม"  value={tot.alloc}   accent="var(--brand-500)"       icon="money" />
        <KpiTile label="มูลค่าสัญญาที่เซ็นรวม" value={tot.signed}  accent="oklch(60% 0.18 295)"   icon="projects" />
        <KpiTile label="ภาระหนี้รวม"           value={tot.debt}    accent="var(--bad)"            icon="arrow_up" />
        <KpiTile label="จำนวนโครงการ"          value={rows.length} unit=" รายการ" digits={0} accent="var(--good)" icon="projects" />
      </div>

      <div className="card" style={{ padding: 14, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div className="tabnav">
          <button className={filter === 'all'          ? 'active' : ''} onClick={() => setFilter('all')}>ทั้งหมด ({counts.all})</button>
          <button className={filter === 'waiting_sign' ? 'active' : ''} onClick={() => setFilter('waiting_sign')}>รอลงนาม ({counts.waiting_sign})</button>
          <button className={filter === 'signed_wip'   ? 'active' : ''} onClick={() => setFilter('signed_wip')}>กำลังก่อสร้าง ({counts.signed_wip})</button>
          <button className={filter === 'invoiced'     ? 'active' : ''} onClick={() => setFilter('invoiced')}>ออก IV ({counts.invoiced})</button>
          <button className={filter === 'paid'         ? 'active' : ''} onClick={() => setFilter('paid')}>รับชำระ ({counts.paid})</button>
        </div>
        <div className="tb-search" style={{ width: 300 }}>
          <Icon name="search" size={14} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="ค้นหารหัส / ชื่อ / ผู้รับโอนสิทธิ…" />
        </div>
      </div>

      <div className="card anim-in" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ overflow: 'auto', maxHeight: '62vh' }}>
          <table className="tbl" style={{ minWidth: 1700 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--panel)' }}>
              <tr>
                <SortHeader label="Contract No."    sortKey="_code"        sort={sort} toggle={toggle} width={130} />
                <SortHeader label="พื้นที่/ชื่อโครงการ" sortKey="_name"     sort={sort} toggle={toggle} />
                <SortHeader label="Type"            sortKey="Type"         sort={sort} toggle={toggle} width={70} />
                <SortHeader label="Start"           sortKey="_start"       sort={sort} toggle={toggle} width={100} />
                <SortHeader label="Finish"          sortKey="_finish"      sort={sort} toggle={toggle} width={100} />
                <SortHeader label="Timeline (วัน)"  sortKey="_timelineDays" sort={sort} toggle={toggle} align="right" width={95} />
                <SortHeader label="งบประมาณ"        sortKey="_budget"      sort={sort} toggle={toggle} align="right" width={130} />
                <SortHeader label="สัญญา (ไม่VAT)"  sortKey="_signed"      sort={sort} toggle={toggle} align="right" width={145} />
                <SortHeader label="ผู้รับโอนสิทธิ"  sortKey="_assignee"    sort={sort} toggle={toggle} width={130} />
                <SortHeader label="ภาระหนี้"        sortKey="_debt"        sort={sort} toggle={toggle} align="right" width={120} />
                <SortHeader label="% POG+STANK"     sortKey="_pogPct"      sort={sort} toggle={toggle} align="right" width={110} />
                <th style={{ width: 115 }}>คาดรับ งวด 1</th>
                <th style={{ width: 115 }}>คาดรับ งวด 2</th>
                <th style={{ width: 80 }}>การจัดการ</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr><td colSpan={14} style={{ padding: 36, textAlign: 'center' }} className="muted">ไม่พบโครงการตามเงื่อนไข</td></tr>
              )}
              {sorted.map(p => {
                const s = WTPData.STATUS_META[p.status] || { badge: 'b-gray', short: p['สถานะโครงการ'] || '—' };
                return (
                  <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => setDetail(p)}>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--brand-700)', fontFamily: 'ui-monospace', fontSize: 12.5 }}>{p._code}</div>
                      <div style={{ marginTop: 2 }}><Badge kind={s.badge}>{s.short}</Badge></div>
                    </td>
                    <td><div style={{ fontWeight: 500, lineHeight: 1.35, fontSize: 12.5 }}>{p._name}</div></td>
                    <td><span className="muted" style={{ fontSize: 11.5 }}>{p['Type'] || '—'}</span></td>
                    <td>{fmtDate(p._start)}</td>
                    <td>{fmtDate(p._finish)}</td>
                    <td className="num">{p._timelineDays != null ? fmtNum(p._timelineDays, 0) : <span className="muted">—</span>}</td>
                    <td className="num">{p._budget ? fmtNum(p._budget, 0) : <span className="muted">—</span>}</td>
                    <td className="num strong">{p._signed ? fmtNum(p._signed, 0) : <span className="muted">—</span>}</td>
                    <td>
                      {p._assignee && p._assignee !== '—'
                        ? <Badge kind="b-violet" dot={false}>{p._assignee}</Badge>
                        : <span className="muted">ไม่โอน</span>}
                    </td>
                    <td className="num" style={{ color: p._debt ? 'var(--bad)' : 'inherit' }}>
                      {p._debt ? '-' + fmtNum(p._debt, 0) : <span className="muted">—</span>}
                    </td>
                    <td className="num">
                      {p._pogPct != null ? `${p._pogPct}%` : <span className="muted">—</span>}
                    </td>
                    <td onClick={e => e.stopPropagation()} style={{ padding: '4px 8px' }}>
                      <input type="date" className="input input-cell"
                        value={p.expectedPay1 || ''}
                        onChange={e => saveInline(p.id, { expectedPay1: e.target.value || null })}
                        style={{ width: '100%', fontSize: 12 }}
                      />
                    </td>
                    <td onClick={e => e.stopPropagation()} style={{ padding: '4px 8px' }}>
                      <input type="date" className="input input-cell"
                        value={p.expectedPay2 || ''}
                        onChange={e => saveInline(p.id, { expectedPay2: e.target.value || null })}
                        style={{ width: '100%', fontSize: 12 }}
                      />
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <div className="row-act">
                        <button className="btn-icon" onClick={() => setDetail(p)} title="ดูรายละเอียด"><Icon name="search" size={14} /></button>
                        <button className="btn-icon" onClick={() => setEdit(p)}   title="แก้ไข"><Icon name="edit" size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot style={{ position: 'sticky', bottom: 0, background: 'var(--panel)' }}>
              <tr>
                <td colSpan={6}>รวม ({sorted.length} โครงการ)</td>
                <td className="num">{fmtNum(sorted.reduce((s,p)=>s+(p._budget||0),0), 0)}</td>
                <td className="num strong">{fmtNum(sorted.reduce((s,p)=>s+(p._signed||0),0), 0)}</td>
                <td></td>
                <td className="num" style={{ color: 'var(--bad)' }}>-{fmtNum(sorted.reduce((s,p)=>s+(p._debt||0),0), 0)}</td>
                <td colSpan={4}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <ProjectDetailModal
        proj={detail}
        onClose={() => setDetail(null)}
        onSave={save}
        onEdit={() => { setEdit(detail); }}
      />
      <ProjectEditModal proj={edit} onClose={() => setEdit(null)} onSave={save} />
    </div>
  );
}

// ─── Detail modal ────────────────────────────────────────────────────────────
function ProjectDetailModal({ proj, onClose, onSave, onEdit }) {
  const [draft, setDraft] = pjState(proj);
  React.useEffect(() => { setDraft(proj); }, [proj]);
  if (!proj || !draft) return null;

  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));
  const code  = draft['Contract No.'] || draft.code || '';
  const name  = draft['พื้นที่'] || draft.name || '—';
  const s = WTPData.STATUS_META[draft.status] || { badge: 'b-gray', label: draft['สถานะโครงการ'] || '—' };

  // Payment rows from flat columns
  const payments = [
    { label: 'งวด 1', key: 'Payment 1', statusKey: 'Payment 1 Status', dateKey: 'Receive Date' },
    { label: 'งวด 2', key: 'Payment 2', statusKey: 'Payment 2 Status', dateKey: 'Receive Date2' },
    { label: 'งวด 3', key: 'Payment 3', statusKey: 'Payment 3 Status', dateKey: 'Receive Date3' },
  ];

  return (
    <Modal
      open={!!proj}
      maxWidth={1140}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'ui-monospace', fontSize: 14, color: 'var(--brand-700)' }}>{code}</span>
          <Badge kind={s.badge}>{s.label}</Badge>
          <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--ink-500)' }}>·</span>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{name}</span>
        </div>
      }
      onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>ปิด</button>
        <button className="btn" onClick={onEdit}><Icon name="edit" size={14} /> แก้ไขแบบฟอร์ม</button>
        <button className="btn btn-primary" onClick={() => onSave(draft)}><Icon name="check" size={14} /> บันทึก</button>
      </>}
    >
      {/* Key facts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        <InfoCard label="Start"              value={fmtDate(draft['Start'] || draft.startDate)} />
        <InfoCard label="Finish"             value={fmtDate(draft['Finish'] || draft.finishDate)} />
        <InfoCard label="Timeline"           value={WTPData.daysBetween(draft['Start'] || draft.startDate, draft['Finish'] || draft.finishDate) ?? '—'} unit="วัน" />
        <InfoCard label="หยุดเวลา"           value={draft['หยุดเวลา'] || draft.timeStop || 0} unit="วัน" />
        <InfoCard label="งบประมาณ"           value={fmtNum(Number(draft['งบประมาณ'] || draft.allocBudget || 0), 0)} unit="บาท" />
        <InfoCard label="มูลค่าสัญญา (ไม่VAT)" value={fmtNum(Number(draft['มูลค่าสัญญาที่เซ็น'] || draft.signedValue || 0), 0)} unit="บาท" highlight />
        <InfoCard label="ผู้รับโอนสิทธิ"      value={draft['ผู้รับโอนสิทธิ์'] || draft.assignee || '—'} />
        <InfoCard label="ภาระหนี้"            value={draft['ภาระหนี้'] || draft.debt ? '-' + fmtNum(Number(draft['ภาระหนี้'] || draft.debt || 0), 0) : '—'} unit={draft['ภาระหนี้'] || draft.debt ? 'บาท' : ''} negative={!!(draft['ภาระหนี้'] || draft.debt)} />
      </div>

      {/* Dates row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div className="field">
          <label>แจ้งเข้าดำเนินการ (NTP)</label>
          <input className="input" type="date" value={draft['แจ้งเข้าดำเนินการ'] || draft.startNotice || ''} onChange={e => set('แจ้งเข้าดำเนินการ', e.target.value || null)} />
        </div>
        <div className="field">
          <label>วันที่ลงนามสัญญา</label>
          <input className="input" type="date" value={draft['เซ็นสัญญา'] || draft.signedAt || ''} onChange={e => set('เซ็นสัญญา', e.target.value || null)} />
        </div>
        <div className="field">
          <label>% Progress</label>
          <input className="input" type="number" min={0} max={100}
            value={draft['% Progress'] ?? ''}
            onChange={e => set('% Progress', e.target.value !== '' ? Number(e.target.value) : null)} />
        </div>
      </div>

      {/* Payments */}
      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink-800)', marginBottom: 10 }}>
        การจ่ายเงิน (Payment 1 / 2 / 3)
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        {payments.map(pm => (
          <div key={pm.key} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 160px 130px', gap: 10, alignItems: 'end', padding: '12px 16px', borderRadius: 10, background: 'var(--surface, #fafbff)', border: '1px solid var(--line)' }}>
            <div style={{ fontWeight: 700, color: 'var(--brand-600)', fontSize: 13 }}>{pm.label}</div>
            <div className="field" style={{ margin: 0 }}>
              <label style={{ fontSize: 11, marginBottom: 3 }}>มูลค่า (บาท)</label>
              <input className="input" type="number"
                value={draft[pm.key] || 0}
                onChange={e => set(pm.key, Number(e.target.value))} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label style={{ fontSize: 11, marginBottom: 3 }}>Payment Status</label>
              <input className="input" value={draft[pm.statusKey] || ''}
                onChange={e => set(pm.statusKey, e.target.value)} placeholder="เช่น paid, pending…" />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label style={{ fontSize: 11, marginBottom: 3 }}>Receive Date</label>
              <input className="input" type="date"
                value={draft[pm.dateKey] || ''}
                onChange={e => set(pm.dateKey, e.target.value || null)} />
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 20, justifyContent: 'flex-end', padding: '4px', fontSize: 13, color: 'var(--ink-600)' }}>
          <span>รวม Payment 1+2+3:&nbsp;
            <strong>{fmtNum((Number(draft['Payment 1'])||0)+(Number(draft['Payment 2'])||0)+(Number(draft['Payment 3'])||0), 0)}</strong> บาท
          </span>
          {draft['TOTAL'] ? <span>TOTAL (RAW):&nbsp;<strong>{fmtNum(Number(draft['TOTAL']),0)}</strong> บาท</span> : null}
          {draft['Receive'] ? <span>Received:&nbsp;<strong>{fmtNum(Number(draft['Receive']),0)}</strong> บาท</span> : null}
        </div>
      </div>

      {/* Custom pay dates */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="field">
          <label>คาดรับเงิน งวด 1 (กำหนดเอง)</label>
          <input className="input" type="date" value={draft.expectedPay1||''} onChange={e => set('expectedPay1', e.target.value)} />
        </div>
        <div className="field">
          <label>คาดรับเงิน งวด 2 (กำหนดเอง)</label>
          <input className="input" type="date" value={draft.expectedPay2||''} onChange={e => set('expectedPay2', e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

function InfoCard({ label, value, unit, highlight, negative }) {
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 10, background: 'white',
      border: `1.5px solid ${highlight ? 'var(--brand-300)' : 'var(--line)'}`,
      boxShadow: highlight ? '0 0 0 3px var(--brand-100) inset' : 'none',
    }}>
      <div style={{ fontSize: 11, color: 'var(--ink-500)', marginBottom: 4 }}>{label}</div>
      <div style={{
        fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
        color: highlight ? 'var(--brand-700)' : negative ? 'var(--bad)' : 'var(--ink-900)',
      }}>
        {value} {unit && <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--ink-500)' }}>{unit}</span>}
      </div>
    </div>
  );
}

// ─── Edit modal ──────────────────────────────────────────────────────────────
function ProjectEditModal({ proj, onClose, onSave }) {
  const [draft, setDraft] = pjState(proj);
  React.useEffect(() => { setDraft(proj); }, [proj]);
  if (!proj) return null;
  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));
  return (
    <Modal open={!!proj} title={proj.id ? 'แก้ไขโครงการ' : 'เพิ่มโครงการใหม่'} wide onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>ยกเลิก</button>
        <button className="btn btn-primary" onClick={() => onSave(draft)}><Icon name="check" size={14} /> บันทึก</button>
      </>}>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '160px 1fr 100px' }}>
        <div className="field"><label>Contract No.</label><input className="input" value={draft['Contract No.']||draft.code||''} onChange={e=>set('Contract No.',e.target.value)} placeholder="PP001 / INS001" /></div>
        <div className="field"><label>พื้นที่ / ชื่อโครงการ</label><input className="input" value={draft['พื้นที่']||draft.name||''} onChange={e=>set('พื้นที่',e.target.value)} /></div>
        <div className="field"><label>Type</label><input className="input" value={draft['Type']||''} onChange={e=>set('Type',e.target.value)} placeholder="PL / INS" /></div>
      </div>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr 1fr', marginTop: 12 }}>
        <div className="field"><label>Province</label><input className="input" value={draft['Province']||''} onChange={e=>set('Province',e.target.value)} /></div>
        <div className="field"><label>Ref.code</label><input className="input" value={draft['Ref.code']||''} onChange={e=>set('Ref.code',e.target.value)} /></div>
        <div className="field"><label>สถานะโครงการ (RAW)</label><input className="input" value={draft['สถานะโครงการ']||''} onChange={e=>set('สถานะโครงการ',e.target.value)} /></div>
        <div className="field"><label>Start</label><input className="input" type="date" value={draft['Start']||draft.startDate||''} onChange={e=>set('Start',e.target.value||null)} /></div>
        <div className="field"><label>Finish</label><input className="input" type="date" value={draft['Finish']||draft.finishDate||''} onChange={e=>set('Finish',e.target.value||null)} /></div>
        <div className="field"><label>วันที่ลงนาม</label><input className="input" type="date" value={draft['เซ็นสัญญา']||draft.signedAt||''} onChange={e=>set('เซ็นสัญญา',e.target.value||null)} /></div>
        <div className="field"><label>งบประมาณ (บาท)</label><input className="input" type="number" value={draft['งบประมาณ']||draft.allocBudget||0} onChange={e=>set('งบประมาณ',Number(e.target.value))} /></div>
        <div className="field"><label>มูลค่าสัญญาที่เซ็น (ไม่VAT)</label><input className="input" type="number" value={draft['มูลค่าสัญญาที่เซ็น']||draft.signedValue||0} onChange={e=>set('มูลค่าสัญญาที่เซ็น',Number(e.target.value))} /></div>
        <div className="field"><label>หยุดเวลา (วัน)</label><input className="input" type="number" value={draft['หยุดเวลา']||draft.timeStop||0} onChange={e=>set('หยุดเวลา',Number(e.target.value))} /></div>
        <div className="field"><label>ผู้รับโอนสิทธิ์</label><input className="input" value={draft['ผู้รับโอนสิทธิ์']||draft.assignee||''} onChange={e=>set('ผู้รับโอนสิทธิ์',e.target.value)} /></div>
        <div className="field"><label>ภาระหนี้ (บาท)</label><input className="input" type="number" value={draft['ภาระหนี้']||draft.debt||0} onChange={e=>set('ภาระหนี้',Number(e.target.value))} /></div>
        <div className="field"><label>Internal status</label>
          <select className="select input" value={draft.status||''} onChange={e=>set('status',e.target.value)}>
            <option value="">— เลือก —</option>
            <option value="waiting_sign">รอลงนามสัญญา</option>
            <option value="signed_wip">ลงนามแล้ว / ก่อสร้าง</option>
            <option value="invoiced">ออกใบแจ้งหนี้แล้ว</option>
            <option value="paid">รับชำระแล้ว</option>
          </select>
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}><label>Remark</label><input className="input" value={draft['Remark']||''} onChange={e=>set('Remark',e.target.value)} /></div>
      </div>
    </Modal>
  );
}

Object.assign(window, { ProjectsPage });
