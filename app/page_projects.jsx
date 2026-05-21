// Projects page — ใหม่ตาม spec
// Columns: รหัสโครงการ | ชื่อ | Start | Finish | Timeline | เงินตามใบจัดสรร | มูลค่าสัญญารวมVAT | ผู้รับโอนสิทธิ | ภาระหนี้
// Detail modal: รายงวด (POG+STANK%, POG DRINK%, มูลค่า, ส่งมอบ, ตรวจรับ, Payment, Summary, Status, Receive Date) + หยุดเวลา + แจ้งเข้าดำเนินการ
// Sort + Filter ในตาราง

const { useState: pjState, useMemo: pjMemo } = React;

function ProjectsPage({ data, setData, toast }) {
  const [filter, setFilter] = pjState('all');
  const [query, setQuery] = pjState('');
  const [detail, setDetail] = pjState(null);   // open detail modal
  const [edit, setEdit] = pjState(null);       // open edit modal

  const { financeByCode } = pjMemo(() => WTPData.buildLookups(data), [data.projects, data.projectFinance]);

  // Joined rows: project + finance
  const rows = pjMemo(() => data.projects.map(p => {
    const f = financeByCode[p.code] || {};
    const timeline = WTPData.daysBetween(p.startDate, p.finishDate);
    return { ...p, assignee: f.assignee || '—', financeDebt: f.debt ?? p.debt ?? 0, debtNote: f.debtNote || '', timelineDays: timeline };
  }), [data.projects, financeByCode]);

  // Filter
  const filtered = pjMemo(() => {
    let xs = rows;
    if (filter !== 'all') xs = xs.filter(p => p.status === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      xs = xs.filter(p =>
        p.code.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        (p.assignee || '').toLowerCase().includes(q)
      );
    }
    return xs;
  }, [rows, filter, query]);

  // Sort
  const { sorted, sort, toggle } = useSortable(filtered, 'code', 'asc');

  const counts = {
    all: rows.length,
    waiting_sign: rows.filter(p => p.status === 'waiting_sign').length,
    signed_wip:   rows.filter(p => p.status === 'signed_wip').length,
    invoiced:     rows.filter(p => p.status === 'invoiced').length,
    paid:         rows.filter(p => p.status === 'paid').length,
  };
  const tot = rows.reduce((acc, p) => {
    acc.alloc += p.allocBudget || 0;
    acc.signed += p.signedValue || 0;
    acc.debt += p.financeDebt || 0;
    return acc;
  }, { alloc: 0, signed: 0, debt: 0 });

  const save = (p) => {
    setData(d => ({
      ...d,
      projects: p.id ? d.projects.map(x => x.id === p.id ? p : x) : [{ ...p, id: WTPData.newId() }, ...d.projects],
    }));
    setEdit(null);
    if (detail && detail.id === p.id) setDetail(p);   // sync open detail
    toast('บันทึกโครงการแล้ว');
  };
  const remove = (id) => {
    if (!confirm('ยืนยันการลบโครงการนี้?')) return;
    setData(d => ({ ...d, projects: d.projects.filter(p => p.id !== id) }));
    toast('ลบโครงการแล้ว');
  };

  const newProject = () => setEdit({
    id: null, code: '', name: '', startDate: '', finishDate: '',
    allocBudget: 0, signedValue: 0,
    status: 'waiting_sign', delivery: 'awaiting',
    value: 0, debt: 0, net: 0, expectedReceive: '', signedAt: null,
    startNotice: null, timeStop: 0, periods: [],
  });

  return (
    <div className="page">
      <div className="page-head anim-in">
        <div>
          <h1 className="page-title">โครงการทั้งหมด</h1>
          <div className="page-sub">RAW_PROJECT + RAW_PROJECT_FINANCE · {rows.length} โครงการ · มูลค่าสัญญารวม {fmtNum(tot.signed, 0)} บาท</div>
        </div>
        <div className="page-head-r">
          <button className="btn btn-ghost"><Icon name="upload" size={14} /> นำเข้า RAW_PROJECT</button>
          <button className="btn btn-primary" onClick={newProject}><Icon name="plus" size={14} /> เพิ่มโครงการ</button>
        </div>
      </div>

      <div className="grid grid-4 anim-stagger" style={{ marginBottom: 16 }}>
        <KpiTile label="เงินตามใบจัดสรรรวม" value={tot.alloc} accent="var(--brand-500)" icon="money" />
        <KpiTile label="มูลค่าสัญญาที่เซ็นรวม" value={tot.signed} accent="oklch(60% 0.18 295)" icon="projects" />
        <KpiTile label="ภาระหนี้รวม"           value={tot.debt} accent="var(--bad)" icon="arrow_up" />
        <KpiTile label="จำนวนโครงการ"         value={rows.length} unit=" รายการ" digits={0} accent="var(--good)" icon="projects" />
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: 14, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div className="tabnav">
          <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>ทั้งหมด ({counts.all})</button>
          <button className={filter === 'waiting_sign' ? 'active' : ''} onClick={() => setFilter('waiting_sign')}>รอลงนาม ({counts.waiting_sign})</button>
          <button className={filter === 'signed_wip' ? 'active' : ''} onClick={() => setFilter('signed_wip')}>กำลังก่อสร้าง ({counts.signed_wip})</button>
          <button className={filter === 'invoiced' ? 'active' : ''} onClick={() => setFilter('invoiced')}>ออก IV ({counts.invoiced})</button>
          <button className={filter === 'paid' ? 'active' : ''} onClick={() => setFilter('paid')}>รับชำระ ({counts.paid})</button>
        </div>
        <div className="tb-search" style={{ width: 320 }}>
          <Icon name="search" size={14} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหารหัส / ชื่อ / ผู้รับโอนสิทธิ…" />
        </div>
      </div>

      <div className="card anim-in" style={{ padding: 0, overflow: 'auto' }}>
        <table className="tbl">
          <thead>
            <tr>
              <SortHeader label="รหัส"             sortKey="code"        sort={sort} toggle={toggle} width={130} />
              <SortHeader label="ชื่อโครงการ"      sortKey="name"        sort={sort} toggle={toggle} />
              <SortHeader label="Start"           sortKey="startDate"   sort={sort} toggle={toggle} width={110} />
              <SortHeader label="Finish"          sortKey="finishDate"  sort={sort} toggle={toggle} width={110} />
              <SortHeader label="Timeline (วัน)"   sortKey="timelineDays" sort={sort} toggle={toggle} align="right" width={110} />
              <SortHeader label="เงินใบจัดสรร"     sortKey="allocBudget" sort={sort} toggle={toggle} align="right" width={140} />
              <SortHeader label="สัญญารวม VAT"   sortKey="signedValue" sort={sort} toggle={toggle} align="right" width={150} />
              <SortHeader label="ผู้รับโอนสิทธิ"    sortKey="assignee"    sort={sort} toggle={toggle} width={150} />
              <SortHeader label="ภาระหนี้"         sortKey="financeDebt" sort={sort} toggle={toggle} align="right" width={140} />
              <th style={{ width: 110 }}>การจัดการ</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && <tr><td colSpan={10} style={{ padding: 36, textAlign: 'center' }} className="muted">ไม่พบโครงการตามเงื่อนไข</td></tr>}
            {sorted.map(p => {
              const s = WTPData.STATUS_META[p.status];
              return (
                <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => setDetail(p)}>
                  <td>
                    <div style={{ fontWeight: 700, color: 'var(--brand-700)', fontFamily: 'ui-monospace', fontSize: 12.5 }}>{p.code}</div>
                    <div style={{ marginTop: 2 }}><Badge kind={s.badge}>{s.short}</Badge></div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 500, lineHeight: 1.35 }}>{p.name}</div>
                  </td>
                  <td>{fmtDate(p.startDate)}</td>
                  <td>{fmtDate(p.finishDate)}</td>
                  <td className="num">{p.timelineDays != null ? fmtNum(p.timelineDays, 0) : <span className="muted">—</span>}</td>
                  <td className="num">{p.allocBudget ? fmtNum(p.allocBudget, 0) : <span className="muted">—</span>}</td>
                  <td className="num strong">{p.signedValue ? fmtNum(p.signedValue, 0) : <span className="muted">—</span>}</td>
                  <td>
                    {p.assignee && p.assignee !== '—' ? (
                      <Badge kind="b-violet" dot={false}>{p.assignee}</Badge>
                    ) : <span className="muted">ไม่โอน</span>}
                  </td>
                  <td className="num" style={{ color: p.financeDebt ? 'var(--bad)' : 'inherit' }}>
                    {p.financeDebt ? '-' + fmtNum(p.financeDebt, 0) : <span className="muted">—</span>}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="row-act">
                      <button className="btn-icon" onClick={() => setDetail(p)} title="ดูรายละเอียด"><Icon name="search" size={14} /></button>
                      <button className="btn-icon" onClick={() => setEdit(p)} title="แก้ไข"><Icon name="edit" size={14} /></button>
                      <button className="btn-icon danger" onClick={() => remove(p.id)} title="ลบ"><Icon name="trash" size={14} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5}>รวม ({sorted.length} โครงการ)</td>
              <td className="num">{fmtNum(sorted.reduce((s,p)=>s+(p.allocBudget||0),0), 0)}</td>
              <td className="num strong">{fmtNum(sorted.reduce((s,p)=>s+(p.signedValue||0),0), 0)}</td>
              <td></td>
              <td className="num" style={{ color: 'var(--bad)' }}>-{fmtNum(sorted.reduce((s,p)=>s+(p.financeDebt||0),0), 0)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <ProjectDetailModal
        proj={detail}
        financeByCode={financeByCode}
        onClose={() => setDetail(null)}
        onSave={save}
        onEdit={() => { setEdit(detail); }}
      />
      <ProjectEditModal proj={edit} onClose={() => setEdit(null)} onSave={save} />
    </div>
  );
}

// ─── Detail modal: full project info + periods ──────────────────────────────
function ProjectDetailModal({ proj, financeByCode, onClose, onSave, onEdit }) {
  const [draft, setDraft] = pjState(proj);
  React.useEffect(() => { setDraft(proj); }, [proj]);
  if (!proj || !draft) return null;

  const f = financeByCode[draft.code] || {};
  const setField = (k, v) => setDraft(d => ({ ...d, [k]: v }));
  const setPeriod = (idx, patch) => setDraft(d => ({
    ...d,
    periods: d.periods.map((pd, i) => i === idx ? { ...pd, ...patch } : pd),
  }));
  const addPeriod = () => setDraft(d => ({
    ...d,
    periods: [...(d.periods || []), {
      period: (d.periods?.length || 0) + 1,
      pctPogStank: 0, pctPogDrink: 0, value: 0,
      deliveryDate: null, inspectionDoc: null,
      payment: 0, summaryPayment: 0, paymentStatus: 'in_progress', receiveDate: null,
    }],
  }));
  const delPeriod = (idx) => setDraft(d => ({ ...d, periods: d.periods.filter((_, i) => i !== idx) }));

  const s = WTPData.STATUS_META[draft.status];

  return (
    <Modal
      open={!!proj}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'ui-monospace', fontSize: 14, color: 'var(--brand-700)' }}>{draft.code}</span>
          <Badge kind={s.badge}>{s.label}</Badge>
          <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--ink-500)' }}>·</span>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{draft.name}</span>
        </div>
      }
      onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>ปิด</button>
        <button className="btn" onClick={onEdit}><Icon name="edit" size={14} /> แก้ไขแบบฟอร์ม</button>
        <button className="btn btn-primary" onClick={() => onSave(draft)}><Icon name="check" size={14} /> บันทึก</button>
      </>}
    >
      {/* Project info summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
        <InfoCard label="Start" value={fmtDate(draft.startDate)} />
        <InfoCard label="Finish" value={fmtDate(draft.finishDate)} />
        <InfoCard label="Timeline" value={WTPData.daysBetween(draft.startDate, draft.finishDate) ?? '—'} unit="วัน" />
        <InfoCard label="เงินตามใบจัดสรร" value={fmtNum(draft.allocBudget, 0)} unit="บาท" />
        <InfoCard label="มูลค่าสัญญารวม VAT" value={fmtNum(draft.signedValue, 0)} unit="บาท" highlight />
        <InfoCard label="ผู้รับโอนสิทธิ" value={f.assignee || '—'} />
        <InfoCard label="ภาระหนี้" value={f.debt ? '-' + fmtNum(f.debt, 0) : '—'} unit={f.debt ? 'บาท' : ''} negative={!!f.debt} />
        <InfoCard label="วันที่ลงนาม" value={fmtDate(draft.signedAt)} />
      </div>

      {/* Time controls — แจ้งเข้าดำเนินการ + หยุดเวลา */}
      <div className="card" style={{ padding: 14, marginBottom: 14, background: 'var(--brand-50, #f0f6ff)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, fontWeight: 600, color: 'var(--brand-700)' }}>
          <Icon name="daily" size={14} /> ข้อมูลเวลา
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field">
            <label>แจ้งเข้าดำเนินการ (Notice to Proceed)</label>
            <input className="input" type="date" value={draft.startNotice || ''} onChange={(e) => setField('startNotice', e.target.value || null)} />
          </div>
          <div className="field">
            <label>หยุดเวลา (จำนวนวัน)</label>
            <input className="input" type="number" value={draft.timeStop || 0} onChange={(e) => setField('timeStop', Number(e.target.value))} />
          </div>
        </div>
      </div>

      {/* Periods */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 6 }}>
        <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--line)' }}>
          <div style={{ fontWeight: 600 }}>รายงวด · {draft.periods?.length || 0} งวด</div>
          <button className="btn btn-sm" onClick={addPeriod}><Icon name="plus" size={12} /> เพิ่มงวด</button>
        </div>
        {(!draft.periods || draft.periods.length === 0) ? (
          <div className="muted" style={{ padding: 24, textAlign: 'center', fontSize: 13 }}>
            ยังไม่มีรายงวด — กดปุ่ม "เพิ่มงวด" เพื่อเริ่มกรอก
          </div>
        ) : (
          <table className="tbl" style={{ fontSize: 12.5 }}>
            <thead>
              <tr>
                <th style={{ width: 50, textAlign: 'center' }}>งวด</th>
                <th style={{ width: 95, textAlign: 'right' }} title="POG + STANK %">% POG+STANK</th>
                <th style={{ width: 95, textAlign: 'right' }} title="POG DRINK %">% POG DRINK</th>
                <th style={{ width: 130, textAlign: 'right' }}>มูลค่างวด</th>
                <th style={{ width: 115 }}>ส่งมอบงาน</th>
                <th style={{ width: 130 }}>ใบตรวจรับ</th>
                <th style={{ width: 120, textAlign: 'right' }}>Payment</th>
                <th style={{ width: 120, textAlign: 'right' }}>Summary</th>
                <th style={{ width: 145 }}>Status</th>
                <th style={{ width: 115 }}>Receive Date</th>
                <th style={{ width: 30 }}></th>
              </tr>
            </thead>
            <tbody>
              {draft.periods.map((pd, i) => (
                <tr key={i}>
                  <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--brand-700)' }}>{pd.period}</td>
                  <td>
                    <input className="input input-cell" type="number" value={pd.pctPogStank || 0}
                      onChange={(e) => setPeriod(i, { pctPogStank: Number(e.target.value) })} />
                  </td>
                  <td>
                    <input className="input input-cell" type="number" value={pd.pctPogDrink || 0}
                      onChange={(e) => setPeriod(i, { pctPogDrink: Number(e.target.value) })} />
                  </td>
                  <td>
                    <input className="input input-cell" type="number" value={pd.value || 0}
                      onChange={(e) => setPeriod(i, { value: Number(e.target.value) })} style={{ textAlign: 'right' }} />
                  </td>
                  <td>
                    <input className="input input-cell" type="date" value={pd.deliveryDate || ''}
                      onChange={(e) => setPeriod(i, { deliveryDate: e.target.value || null })} />
                  </td>
                  <td>
                    <input className="input input-cell" type="text" value={pd.inspectionDoc || ''} placeholder="เลขที่"
                      onChange={(e) => setPeriod(i, { inspectionDoc: e.target.value || null })} />
                  </td>
                  <td>
                    <input className="input input-cell" type="number" value={pd.payment || 0}
                      onChange={(e) => setPeriod(i, { payment: Number(e.target.value) })} style={{ textAlign: 'right' }} />
                  </td>
                  <td>
                    <input className="input input-cell" type="number" value={pd.summaryPayment || 0}
                      onChange={(e) => setPeriod(i, { summaryPayment: Number(e.target.value) })} style={{ textAlign: 'right' }} />
                  </td>
                  <td>
                    <StatusPill
                      value={pd.paymentStatus}
                      onChange={(v) => setPeriod(i, { paymentStatus: v })}
                      options={Object.entries(WTPData.PAY_STATUS_META).map(([k, v]) => ({ value: k, label: v.label, kind: v.badge }))}
                      size="sm"
                    />
                  </td>
                  <td>
                    <input className="input input-cell" type="date" value={pd.receiveDate || ''}
                      onChange={(e) => setPeriod(i, { receiveDate: e.target.value || null })} />
                  </td>
                  <td>
                    <button className="btn-icon danger" onClick={() => delPeriod(i)} title="ลบงวด"><Icon name="trash" size={12} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} style={{ textAlign: 'right', fontWeight: 600 }}>รวมทุกงวด</td>
                <td className="num strong">{fmtNum(draft.periods.reduce((s,p)=>s+(p.value||0), 0), 0)}</td>
                <td colSpan={2}></td>
                <td className="num">{fmtNum(draft.periods.reduce((s,p)=>s+(p.payment||0), 0), 0)}</td>
                <td className="num strong">{fmtNum(draft.periods.reduce((s,p)=>s+(p.summaryPayment||0), 0), 0)}</td>
                <td colSpan={3}></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
        💡 % POG+STANK และ % POG DRINK ใช้แบ่งสัดส่วนการรับรู้รายได้ของบริษัทในเครือ · มูลค่างวด = มูลค่าสัญญา × สัดส่วนงวด
      </div>
    </Modal>
  );
}

// Mini info-card used in detail header
function InfoCard({ label, value, unit, highlight, negative }) {
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 10, background: 'white',
      border: '1px solid var(--line)',
      boxShadow: highlight ? '0 0 0 2px var(--brand-200) inset' : 'none',
    }}>
      <div style={{ fontSize: 11, color: 'var(--ink-500)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: highlight ? 'var(--brand-700)' : negative ? 'var(--bad)' : 'var(--ink-900)', fontVariantNumeric: 'tabular-nums' }}>
        {value} {unit && <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink-500)' }}>{unit}</span>}
      </div>
    </div>
  );
}

// ─── Edit modal (form-based, classic) ───────────────────────────────────────
function ProjectEditModal({ proj, onClose, onSave }) {
  const [draft, setDraft] = pjState(proj);
  React.useEffect(() => { setDraft(proj); }, [proj]);
  if (!proj) return null;
  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));
  return (
    <Modal open={!!proj} title={proj.id ? 'แก้ไขโครงการ' : 'เพิ่มโครงการใหม่'} onClose={onClose} footer={<>
      <button className="btn btn-ghost" onClick={onClose}>ยกเลิก</button>
      <button className="btn btn-primary" onClick={() => onSave(draft)}><Icon name="check" size={14} /> บันทึก</button>
    </>}>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '160px 1fr' }}>
        <div className="field"><label>รหัส (Job no)</label><input className="input" value={draft.code || ''} onChange={(e)=>set('code', e.target.value)} placeholder="PPXXX-XXX" /></div>
        <div className="field"><label>ชื่อโครงการ</label><input className="input" value={draft.name || ''} onChange={(e)=>set('name', e.target.value)} /></div>
      </div>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr', marginTop: 12 }}>
        <div className="field"><label>Start</label><input className="input" type="date" value={draft.startDate || ''} onChange={(e)=>set('startDate', e.target.value || null)} /></div>
        <div className="field"><label>Finish</label><input className="input" type="date" value={draft.finishDate || ''} onChange={(e)=>set('finishDate', e.target.value || null)} /></div>
        <div className="field"><label>เงินตามใบจัดสรร (บาท)</label><input className="input" type="number" value={draft.allocBudget || 0} onChange={(e)=>set('allocBudget', Number(e.target.value))} /></div>
        <div className="field"><label>มูลค่าสัญญารวม VAT (บาท)</label><input className="input" type="number" value={draft.signedValue || 0} onChange={(e)=>set('signedValue', Number(e.target.value))} /></div>
        <div className="field"><label>สถานะโครงการ</label>
          <select className="select input" value={draft.status} onChange={(e)=>set('status', e.target.value)}>
            <option value="waiting_sign">รอลงนามสัญญา</option>
            <option value="signed_wip">ลงนามแล้ว / ก่อสร้าง</option>
            <option value="invoiced">ออกใบแจ้งหนี้แล้ว</option>
            <option value="paid">รับชำระแล้ว</option>
          </select>
        </div>
        <div className="field"><label>การส่งมอบ</label>
          <select className="select input" value={draft.delivery} onChange={(e)=>set('delivery', e.target.value)}>
            <option value="awaiting">รอเริ่มงาน</option>
            <option value="in_progress">อยู่ระหว่างก่อสร้าง</option>
            <option value="pending">รอส่งมอบงาน</option>
            <option value="delivered">ส่งมอบงานแล้ว</option>
            <option value="received">รับชำระแล้ว</option>
          </select>
        </div>
        <div className="field"><label>วันที่ลงนาม</label><input className="input" type="date" value={draft.signedAt || ''} onChange={(e)=>set('signedAt', e.target.value || null)} /></div>
        <div className="field"><label>แจ้งเข้าดำเนินการ</label><input className="input" type="date" value={draft.startNotice || ''} onChange={(e)=>set('startNotice', e.target.value || null)} /></div>
        <div className="field"><label>หยุดเวลา (วัน)</label><input className="input" type="number" value={draft.timeStop || 0} onChange={(e)=>set('timeStop', Number(e.target.value))} /></div>
        <div className="field"><label>คาดรับเงิน</label><input className="input" type="date" value={draft.expectedReceive || ''} onChange={(e)=>set('expectedReceive', e.target.value)} /></div>
      </div>
      <div className="muted" style={{ marginTop: 12, fontSize: 12 }}>
        💡 รายงวด (Payment 1/2, ใบตรวจรับ ฯลฯ) แก้ไขที่หน้า <strong>ดูรายละเอียด</strong> ของโครงการ
      </div>
    </Modal>
  );
}

Object.assign(window, { ProjectsPage });
