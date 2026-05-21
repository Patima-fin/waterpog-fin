// Projects page
const { useState: pjState, useMemo: pjMemo } = React;

function ProjectsPage({ data, setData, toast }) {
  const [filter, setFilter] = pjState('all');
  const [query,  setQuery]  = pjState('');
  const [detail, setDetail] = pjState(null);
  const [edit,   setEdit]   = pjState(null);

  const { financeByCode } = pjMemo(() => WTPData.buildLookups(data), [data.projects, data.projectFinance]);

  const rows = pjMemo(() => data.projects.map(p => {
    const f   = financeByCode[p.code] || {};
    const pd0 = p.periods?.[0];
    const pd1 = p.periods?.[1];
    return {
      ...p,
      assignee:    f.assignee  || '—',
      financeDebt: f.debt ?? p.debt ?? 0,
      timelineDays: WTPData.daysBetween(p.startDate, p.finishDate),
      pogPct1:     pd0?.pctPogStank ?? null,
      expectedPay1: p.expectedPay1 || pd0?.receiveDate || '',
      expectedPay2: p.expectedPay2 || pd1?.receiveDate || '',
    };
  }), [data.projects, financeByCode]);

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

  const { sorted, sort, toggle } = useSortable(filtered, 'code', 'asc');

  const counts = {
    all:          rows.length,
    waiting_sign: rows.filter(p => p.status === 'waiting_sign').length,
    signed_wip:   rows.filter(p => p.status === 'signed_wip').length,
    invoiced:     rows.filter(p => p.status === 'invoiced').length,
    paid:         rows.filter(p => p.status === 'paid').length,
  };
  const tot = rows.reduce((acc, p) => {
    acc.alloc  += p.allocBudget  || 0;
    acc.signed += p.signedValue  || 0;
    acc.debt   += p.financeDebt  || 0;
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

  // Inline edit for expected pay dates without opening detail modal
  const saveInline = (id, patch) => {
    setData(d => ({ ...d, projects: d.projects.map(p => p.id === id ? { ...p, ...patch } : p) }));
  };

  const newProject = () => setEdit({
    id: null, code: '', name: '', startDate: '', finishDate: '',
    allocBudget: 0, signedValue: 0,
    status: 'waiting_sign', delivery: 'awaiting',
    debt: 0, expectedReceive: '', signedAt: null,
    startNotice: null, timeStop: 0, periods: [],
    expectedPay1: '', expectedPay2: '',
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

      {/* Filter + search bar */}
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

      {/* Scrollable table */}
      <div className="card anim-in" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ overflow: 'auto', maxHeight: '62vh' }}>
          <table className="tbl" style={{ minWidth: 1600 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--panel)' }}>
              <tr>
                <SortHeader label="รหัส"           sortKey="code"         sort={sort} toggle={toggle} width={130} />
                <SortHeader label="ชื่อโครงการ"    sortKey="name"         sort={sort} toggle={toggle} />
                <SortHeader label="Start"         sortKey="startDate"    sort={sort} toggle={toggle} width={105} />
                <SortHeader label="Finish"        sortKey="finishDate"   sort={sort} toggle={toggle} width={105} />
                <SortHeader label="Timeline (วัน)" sortKey="timelineDays" sort={sort} toggle={toggle} align="right" width={100} />
                <SortHeader label="เงินใบจัดสรร"   sortKey="allocBudget"  sort={sort} toggle={toggle} align="right" width={135} />
                <SortHeader label="สัญญารวม VAT"  sortKey="signedValue"  sort={sort} toggle={toggle} align="right" width={145} />
                <SortHeader label="ผู้รับโอนสิทธิ"  sortKey="assignee"     sort={sort} toggle={toggle} width={140} />
                <SortHeader label="ภาระหนี้"       sortKey="financeDebt"  sort={sort} toggle={toggle} align="right" width={125} />
                <SortHeader label="% POG+STANK"   sortKey="pogPct1"      sort={sort} toggle={toggle} align="right" width={115} />
                <th style={{ width: 115 }}>คาดรับ งวด 1</th>
                <th style={{ width: 115 }}>คาดรับ งวด 2</th>
                <th style={{ width: 80 }}>การจัดการ</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr><td colSpan={13} style={{ padding: 36, textAlign: 'center' }} className="muted">ไม่พบโครงการตามเงื่อนไข</td></tr>
              )}
              {sorted.map(p => {
                const s = WTPData.STATUS_META[p.status];
                return (
                  <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => setDetail(p)}>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--brand-700)', fontFamily: 'ui-monospace', fontSize: 12.5 }}>{p.code}</div>
                      <div style={{ marginTop: 2 }}><Badge kind={s.badge}>{s.short}</Badge></div>
                    </td>
                    <td><div style={{ fontWeight: 500, lineHeight: 1.35 }}>{p.name}</div></td>
                    <td>{fmtDate(p.startDate)}</td>
                    <td>{fmtDate(p.finishDate)}</td>
                    <td className="num">{p.timelineDays != null ? fmtNum(p.timelineDays, 0) : <span className="muted">—</span>}</td>
                    <td className="num">{p.allocBudget ? fmtNum(p.allocBudget, 0) : <span className="muted">—</span>}</td>
                    <td className="num strong">{p.signedValue ? fmtNum(p.signedValue, 0) : <span className="muted">—</span>}</td>
                    <td>
                      {p.assignee && p.assignee !== '—'
                        ? <Badge kind="b-violet" dot={false}>{p.assignee}</Badge>
                        : <span className="muted">ไม่โอน</span>}
                    </td>
                    <td className="num" style={{ color: p.financeDebt ? 'var(--bad)' : 'inherit' }}>
                      {p.financeDebt ? '-' + fmtNum(p.financeDebt, 0) : <span className="muted">—</span>}
                    </td>
                    <td className="num">
                      {p.pogPct1 != null ? `${p.pogPct1}%` : <span className="muted">—</span>}
                    </td>
                    {/* Editable expected-pay dates — stopPropagation so row click doesn't open modal */}
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
                <td colSpan={5}>รวม ({sorted.length} โครงการ)</td>
                <td className="num">{fmtNum(sorted.reduce((s,p)=>s+(p.allocBudget||0),0), 0)}</td>
                <td className="num strong">{fmtNum(sorted.reduce((s,p)=>s+(p.signedValue||0),0), 0)}</td>
                <td></td>
                <td className="num" style={{ color: 'var(--bad)' }}>-{fmtNum(sorted.reduce((s,p)=>s+(p.financeDebt||0),0), 0)}</td>
                <td colSpan={4}></td>
              </tr>
            </tfoot>
          </table>
        </div>
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

// ─── Detail modal ────────────────────────────────────────────────────────────
function ProjectDetailModal({ proj, financeByCode, onClose, onSave, onEdit }) {
  const [draft, setDraft] = pjState(proj);
  React.useEffect(() => { setDraft(proj); }, [proj]);
  if (!proj || !draft) return null;

  const f = financeByCode[draft.code] || {};
  const setField  = (k, v) => setDraft(d => ({ ...d, [k]: v }));
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
      maxWidth={1140}
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
      {/* ── Key facts row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        <InfoCard label="Start"              value={fmtDate(draft.startDate)} />
        <InfoCard label="Finish"             value={fmtDate(draft.finishDate)} />
        <InfoCard label="Timeline"           value={WTPData.daysBetween(draft.startDate, draft.finishDate) ?? '—'} unit="วัน" />
        <InfoCard label="หยุดเวลา"           value={draft.timeStop || 0} unit="วัน" />
        <InfoCard label="เงินตามใบจัดสรร"   value={fmtNum(draft.allocBudget, 0)} unit="บาท" />
        <InfoCard label="มูลค่าสัญญารวม VAT" value={fmtNum(draft.signedValue, 0)} unit="บาท" highlight />
        <InfoCard label="ผู้รับโอนสิทธิ"      value={f.assignee || '—'} />
        <InfoCard label="ภาระหนี้"            value={f.debt ? '-' + fmtNum(f.debt, 0) : '—'} unit={f.debt ? 'บาท' : ''} negative={!!f.debt} />
      </div>

      {/* ── Time controls ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div className="field">
          <label>แจ้งเข้าดำเนินการ (NTP)</label>
          <input className="input" type="date" value={draft.startNotice || ''} onChange={e => setField('startNotice', e.target.value || null)} />
        </div>
        <div className="field">
          <label>วันที่ลงนาม</label>
          <input className="input" type="date" value={draft.signedAt || ''} onChange={e => setField('signedAt', e.target.value || null)} />
        </div>
      </div>

      {/* ── Periods ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink-800)' }}>
          รายงวด · {draft.periods?.length || 0} งวด
        </div>
        <button className="btn btn-sm btn-primary" onClick={addPeriod}><Icon name="plus" size={12} /> เพิ่มงวด</button>
      </div>

      {(!draft.periods || draft.periods.length === 0) ? (
        <div className="muted" style={{ padding: '32px 0', textAlign: 'center', fontSize: 13 }}>
          ยังไม่มีรายงวด — กดปุ่ม "เพิ่มงวด" เพื่อเริ่มกรอก
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {draft.periods.map((pd, i) => (
            <div key={i} style={{
              border: '1.5px solid var(--line)', borderRadius: 14,
              padding: '16px 20px', background: 'var(--surface, #fafbff)',
            }}>
              {/* Period header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ fontWeight: 700, color: 'var(--brand-600)', fontSize: 15 }}>
                  งวดที่ {pd.period}
                  {pd.value ? <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--ink-500)', marginLeft: 10 }}>
                    มูลค่า {fmtNum(pd.value, 0)} บาท
                  </span> : null}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <StatusPill
                    value={pd.paymentStatus}
                    onChange={v => setPeriod(i, { paymentStatus: v })}
                    options={Object.entries(WTPData.PAY_STATUS_META).map(([k, v]) => ({ value: k, label: v.label, kind: v.badge }))}
                    size="sm"
                  />
                  <button className="btn-icon danger" onClick={() => delPeriod(i)} title="ลบงวด"><Icon name="trash" size={13} /></button>
                </div>
              </div>

              {/* Period fields — 4-column grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                <div className="field">
                  <label>% POG+STANK</label>
                  <input className="input" type="number" value={pd.pctPogStank || 0}
                    onChange={e => setPeriod(i, { pctPogStank: Number(e.target.value) })} />
                </div>
                <div className="field">
                  <label>% POG DRINK</label>
                  <input className="input" type="number" value={pd.pctPogDrink || 0}
                    onChange={e => setPeriod(i, { pctPogDrink: Number(e.target.value) })} />
                </div>
                <div className="field">
                  <label>มูลค่างวด (บาท)</label>
                  <input className="input" type="number" value={pd.value || 0}
                    onChange={e => setPeriod(i, { value: Number(e.target.value) })} />
                </div>
                <div className="field">
                  <label>ส่งมอบงาน</label>
                  <input className="input" type="date" value={pd.deliveryDate || ''}
                    onChange={e => setPeriod(i, { deliveryDate: e.target.value || null })} />
                </div>
                <div className="field">
                  <label>ใบตรวจรับ (เลขที่)</label>
                  <input className="input" type="text" value={pd.inspectionDoc || ''} placeholder="เลขที่"
                    onChange={e => setPeriod(i, { inspectionDoc: e.target.value || null })} />
                </div>
                <div className="field">
                  <label>Payment (บาท)</label>
                  <input className="input" type="number" value={pd.payment || 0}
                    onChange={e => setPeriod(i, { payment: Number(e.target.value) })} />
                </div>
                <div className="field">
                  <label>Summary Payment (บาท)</label>
                  <input className="input" type="number" value={pd.summaryPayment || 0}
                    onChange={e => setPeriod(i, { summaryPayment: Number(e.target.value) })} />
                </div>
                <div className="field">
                  <label>Receive Date</label>
                  <input className="input" type="date" value={pd.receiveDate || ''}
                    onChange={e => setPeriod(i, { receiveDate: e.target.value || null })} />
                </div>
              </div>
            </div>
          ))}

          {/* Period totals */}
          <div style={{ display: 'flex', gap: 20, justifyContent: 'flex-end', padding: '8px 4px', fontSize: 13 }}>
            <span>รวมมูลค่าทุกงวด: <strong>{fmtNum(draft.periods.reduce((s,p)=>s+(p.value||0),0), 0)}</strong> บาท</span>
            <span>รวม Payment: <strong>{fmtNum(draft.periods.reduce((s,p)=>s+(p.payment||0),0), 0)}</strong> บาท</span>
            <span>รวม Summary: <strong>{fmtNum(draft.periods.reduce((s,p)=>s+(p.summaryPayment||0),0), 0)}</strong> บาท</span>
          </div>
        </div>
      )}
    </Modal>
  );
}

// Mini info-card used in detail header
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
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '160px 1fr' }}>
        <div className="field"><label>รหัส (Job no)</label><input className="input" value={draft.code||''} onChange={e=>set('code',e.target.value)} placeholder="PPXXX-XXX" /></div>
        <div className="field"><label>ชื่อโครงการ</label><input className="input" value={draft.name||''} onChange={e=>set('name',e.target.value)} /></div>
      </div>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr 1fr', marginTop: 12 }}>
        <div className="field"><label>Start</label><input className="input" type="date" value={draft.startDate||''} onChange={e=>set('startDate',e.target.value||null)} /></div>
        <div className="field"><label>Finish</label><input className="input" type="date" value={draft.finishDate||''} onChange={e=>set('finishDate',e.target.value||null)} /></div>
        <div className="field"><label>วันที่ลงนาม</label><input className="input" type="date" value={draft.signedAt||''} onChange={e=>set('signedAt',e.target.value||null)} /></div>
        <div className="field"><label>เงินตามใบจัดสรร (บาท)</label><input className="input" type="number" value={draft.allocBudget||0} onChange={e=>set('allocBudget',Number(e.target.value))} /></div>
        <div className="field"><label>มูลค่าสัญญารวม VAT (บาท)</label><input className="input" type="number" value={draft.signedValue||0} onChange={e=>set('signedValue',Number(e.target.value))} /></div>
        <div className="field"><label>หยุดเวลา (วัน)</label><input className="input" type="number" value={draft.timeStop||0} onChange={e=>set('timeStop',Number(e.target.value))} /></div>
        <div className="field"><label>สถานะโครงการ</label>
          <select className="select input" value={draft.status} onChange={e=>set('status',e.target.value)}>
            <option value="waiting_sign">รอลงนามสัญญา</option>
            <option value="signed_wip">ลงนามแล้ว / ก่อสร้าง</option>
            <option value="invoiced">ออกใบแจ้งหนี้แล้ว</option>
            <option value="paid">รับชำระแล้ว</option>
          </select>
        </div>
        <div className="field"><label>การส่งมอบ</label>
          <select className="select input" value={draft.delivery} onChange={e=>set('delivery',e.target.value)}>
            <option value="awaiting">รอเริ่มงาน</option>
            <option value="in_progress">อยู่ระหว่างก่อสร้าง</option>
            <option value="pending">รอส่งมอบงาน</option>
            <option value="delivered">ส่งมอบงานแล้ว</option>
            <option value="received">รับชำระแล้ว</option>
          </select>
        </div>
        <div className="field"><label>แจ้งเข้าดำเนินการ (NTP)</label><input className="input" type="date" value={draft.startNotice||''} onChange={e=>set('startNotice',e.target.value||null)} /></div>
        <div className="field"><label>คาดรับเงิน งวด 1</label><input className="input" type="date" value={draft.expectedPay1||''} onChange={e=>set('expectedPay1',e.target.value)} /></div>
        <div className="field"><label>คาดรับเงิน งวด 2</label><input className="input" type="date" value={draft.expectedPay2||''} onChange={e=>set('expectedPay2',e.target.value)} /></div>
      </div>
    </Modal>
  );
}

Object.assign(window, { ProjectsPage });
