// Invoices page — ใหม่ตาม spec
// - Columns: Job no | invno | invdate | ชื่อโครงการ | Balance | ผู้รับโอนสิทธิ | ภาระหนี้ | สุทธิ | สถานะ
// - 4 statuses: pending_inspection / tracking / issue / paid
// - Follow-up log (รอบติดตาม) + ผู้ติดต่อ + เบอร์โทร + คาดรับเงิน + รับจริง (วันที่/จำนวน/บัญชี)
// - Paste RAW_IV_OUTSTANDING (TSV/JSON) → ระบบหาว่าใบไหนใหม่ → import เฉพาะใหม่
// - Sort + Filter + Search

const { useState: ivState, useMemo: ivMemo } = React;

function InvoicesPage({ data, setData, toast }) {
  const [filter, setFilter] = ivState('all');
  const [query, setQuery] = ivState('');
  const [detail, setDetail] = ivState(null);
  const [showImport, setShowImport] = ivState(false);

  const { projectByCode, financeByCode } = ivMemo(() => WTPData.buildLookups(data), [data.projects, data.projectFinance]);

  // Joined rows: invoice + project name + finance (assignee, debt)
  const rows = ivMemo(() => data.invoices.map(iv => {
    const p = projectByCode[iv.jobNo] || {};
    const f = financeByCode[iv.jobNo] || {};
    // Support both old schema (f.debt, f.assignee) and new RAW schema (p['ภาระหนี้'], p['ผู้รับโอนสิทธิ์'])
    const debt     = Number(f.debt ?? f['ภาระหนี้'] ?? 0);
    const assignee = f.assignee || f['ผู้รับโอนสิทธิ์'] || '—';
    return {
      ...iv,
      projectName: p['พื้นที่'] || p.name || '—',
      assignee,
      debt,
      netExpected: (iv.balance || 0) - debt,
    };
  }), [data.invoices, projectByCode, financeByCode]);

  const filtered = ivMemo(() => {
    let xs = rows;
    if (filter !== 'all') xs = xs.filter(iv => iv.status === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      xs = xs.filter(iv =>
        iv.ivNo.toLowerCase().includes(q) ||
        (iv.jobNo || '').toLowerCase().includes(q) ||
        (iv.projectName || '').toLowerCase().includes(q) ||
        (iv.contactName || '').toLowerCase().includes(q)
      );
    }
    return xs;
  }, [rows, filter, query]);

  const { sorted, sort, toggle } = useSortable(filtered, 'invoiceDate', 'desc');

  const counts = {
    all: rows.length,
    pending_inspection: rows.filter(r => r.status === 'pending_inspection').length,
    tracking:           rows.filter(r => r.status === 'tracking').length,
    issue:              rows.filter(r => r.status === 'issue').length,
    paid:               rows.filter(r => r.status === 'paid').length,
  };
  const sums = {
    balance: rows.reduce((s, r) => s + (r.balance || 0), 0),
    debt:    rows.reduce((s, r) => s + (r.debt || 0), 0),
    net:     rows.reduce((s, r) => s + (r.netExpected || 0), 0),
    pendingNet: rows.filter(r => r.status !== 'paid').reduce((s, r) => s + (r.netExpected || 0), 0),
  };

  const save = (iv) => {
    setData(d => ({
      ...d,
      invoices: iv.id ? d.invoices.map(x => x.id === iv.id ? iv : x) : [{ ...iv, id: WTPData.newId() }, ...d.invoices],
    }));
    setDetail(prev => prev && prev.id === iv.id ? iv : prev);
    toast('บันทึกใบแจ้งหนี้แล้ว');
  };
  const remove = (id) => {
    if (!confirm('ยืนยันการลบใบแจ้งหนี้นี้?')) return;
    setData(d => ({ ...d, invoices: d.invoices.filter(iv => iv.id !== id) }));
    setDetail(null);
    toast('ลบใบแจ้งหนี้แล้ว');
  };

  const newInvoice = () => setDetail({
    id: null,
    ivNo: '', jobNo: data.projects[0]?.code || '', period: 1,
    invoiceDate: data.meta.asOf, balance: 0,
    status: 'pending_inspection', expectedReceive: '',
    contactName: '', contactPhone: '',
    followUps: [], actualReceive: null,
  });

  // Status quick-set on each row (table-level)
  const updateStatus = (iv, newStatus) => {
    const patch = { ...iv, status: newStatus };
    if (newStatus === 'paid' && !patch.actualReceive) {
      patch.actualReceive = { date: new Date().toISOString().slice(0, 10), amount: iv.balance, bankAccount: '', feeNote: '' };
    }
    save(patch);
  };

  return (
    <div className="page">
      <div className="page-head anim-in">
        <div>
          <h1 className="page-title">ใบแจ้งหนี้คงค้าง</h1>
          <div className="page-sub">RAW_IV_OUTSTANDING · {rows.length} ใบ · ผู้ดูแล: ฝ่ายติดตามรับเงิน</div>
        </div>
        <div className="page-head-r">
          <button className="btn btn-ghost" onClick={() => setShowImport(true)}><Icon name="upload" size={14} /> วาง RAW_IV_OUTSTANDING</button>
          <button className="btn btn-primary" onClick={newInvoice}><Icon name="plus" size={14} /> เพิ่มใบ IV</button>
        </div>
      </div>

      <div className="grid grid-4 anim-stagger" style={{ marginBottom: 16 }}>
        <KpiTile label="ยอด Balance รวม" value={sums.balance} accent="var(--brand-500)" icon="invoice" />
        <KpiTile label="ภาระหนี้รวม"      value={sums.debt} accent="var(--bad)" icon="arrow_up" />
        <KpiTile label="คาดรับสุทธิ (ค้าง)" value={sums.pendingNet} accent="var(--good)" icon="coin" />
        <KpiTile label="ติดปัญหา"          value={counts.issue} unit=" ใบ" digits={0} accent="oklch(60% 0.22 25)" icon="invoice" />
      </div>

      <div className="card" style={{ padding: 14, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div className="tabnav">
          <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>ทั้งหมด ({counts.all})</button>
          <button className={filter === 'pending_inspection' ? 'active' : ''} onClick={() => setFilter('pending_inspection')}>รอใบตรวจรับ ({counts.pending_inspection})</button>
          <button className={filter === 'tracking' ? 'active' : ''} onClick={() => setFilter('tracking')}>กำลังติดตาม ({counts.tracking})</button>
          <button className={filter === 'issue' ? 'active' : ''} onClick={() => setFilter('issue')}>ติดปัญหา ({counts.issue})</button>
          <button className={filter === 'paid' ? 'active' : ''} onClick={() => setFilter('paid')}>รับชำระแล้ว ({counts.paid})</button>
        </div>
        <div className="tb-search" style={{ width: 320 }}>
          <Icon name="search" size={14} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหา IV / Job no / ชื่อโครงการ / ผู้ติดต่อ…" />
        </div>
      </div>

      <div className="card anim-in" style={{ padding: 0, overflow: 'auto' }}>
        <table className="tbl">
          <thead>
            <tr>
              <SortHeader label="Job no"          sortKey="jobNo"       sort={sort} toggle={toggle} width={130} />
              <SortHeader label="เลขที่ IV"       sortKey="ivNo"        sort={sort} toggle={toggle} width={130} />
              <SortHeader label="วันที่ IV"        sortKey="invoiceDate" sort={sort} toggle={toggle} width={105} />
              <SortHeader label="ชื่อโครงการ"     sortKey="projectName" sort={sort} toggle={toggle} />
              <SortHeader label="Balance"        sortKey="balance"     sort={sort} toggle={toggle} align="right" width={130} />
              <SortHeader label="ผู้รับโอนสิทธิ"   sortKey="assignee"    sort={sort} toggle={toggle} width={130} />
              <SortHeader label="ภาระหนี้"        sortKey="debt"        sort={sort} toggle={toggle} align="right" width={130} />
              <SortHeader label="คาดรับสุทธิ"     sortKey="netExpected" sort={sort} toggle={toggle} align="right" width={130} />
              <SortHeader label="คาดรับเงิน"      sortKey="expectedReceive" sort={sort} toggle={toggle} width={110} />
              <th style={{ width: 160 }}>สถานะ</th>
              <th style={{ width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && <tr><td colSpan={11} className="muted" style={{ padding: 36, textAlign: 'center' }}>ไม่พบใบแจ้งหนี้</td></tr>}
            {sorted.map(iv => (
              <tr key={iv.id} style={{ cursor: 'pointer' }} onClick={() => setDetail(iv)}>
                <td><span style={{ fontFamily: 'ui-monospace', fontWeight: 700, color: 'var(--brand-700)', fontSize: 12.5 }}>{iv.jobNo}</span></td>
                <td><span style={{ fontFamily: 'ui-monospace', fontWeight: 600, fontSize: 12.5 }}>{iv.ivNo}</span></td>
                <td>{fmtDate(iv.invoiceDate)}</td>
                <td>
                  <div style={{ fontSize: 12.5, lineHeight: 1.35 }}>{iv.projectName}</div>
                  {iv.followUps && iv.followUps.length > 0 && (
                    <div className="muted" style={{ fontSize: 10.5, marginTop: 2 }}>📞 ติดตาม {iv.followUps.length} ครั้ง · ล่าสุด {fmtDate(iv.followUps[iv.followUps.length - 1].date)}</div>
                  )}
                </td>
                <td className="num strong">{fmtNum(iv.balance, 0)}</td>
                <td>
                  {iv.assignee && iv.assignee !== '—' ? (
                    <Badge kind="b-violet" dot={false}>{iv.assignee}</Badge>
                  ) : <span className="muted">ไม่โอน</span>}
                </td>
                <td className="num" style={{ color: iv.debt ? 'var(--bad)' : 'inherit' }}>{iv.debt ? '-' + fmtNum(iv.debt, 0) : <span className="muted">—</span>}</td>
                <td className="num" style={{ color: 'var(--good)', fontWeight: 700 }}>{fmtNum(iv.netExpected, 0)}</td>
                <td>{fmtDate(iv.expectedReceive)}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <StatusPill
                    value={iv.status}
                    onChange={(v) => updateStatus(iv, v)}
                    options={Object.entries(WTPData.IV_STATUS_META).map(([k, v]) => ({ value: k, label: v.label, kind: v.badge }))}
                  />
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  <div className="row-act">
                    <button className="btn-icon" onClick={() => setDetail(iv)} title="ดูรายละเอียด/ติดตาม"><Icon name="search" size={14} /></button>
                    <button className="btn-icon danger" onClick={() => remove(iv.id)} title="ลบ"><Icon name="trash" size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}>รวม ({sorted.length} ใบ)</td>
              <td className="num strong">{fmtNum(sorted.reduce((s,r)=>s+(r.balance||0), 0), 0)}</td>
              <td></td>
              <td className="num" style={{ color: 'var(--bad)' }}>-{fmtNum(sorted.reduce((s,r)=>s+(r.debt||0), 0), 0)}</td>
              <td className="num" style={{ color: 'var(--good)' }}>{fmtNum(sorted.reduce((s,r)=>s+(r.netExpected||0), 0), 0)}</td>
              <td colSpan={3}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <InvoiceDetailModal
        iv={detail}
        onClose={() => setDetail(null)}
        onSave={save}
        bankAccounts={data.bankAccounts}
        projects={data.projects}
        financeByCode={financeByCode}
        projectByCode={projectByCode}
      />

      <ImportRawIvModal
        open={showImport}
        onClose={() => setShowImport(false)}
        existing={data.invoices}
        onImport={(newRows) => {
          setData(d => ({ ...d, invoices: [...newRows.map(r => ({ ...r, id: WTPData.newId() })), ...d.invoices] }));
          setShowImport(false);
          toast(`นำเข้าใบใหม่ ${newRows.length} ใบ`);
        }}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Detail modal: full IV editing + follow-up log + actual receive
// ────────────────────────────────────────────────────────────────────────────
function InvoiceDetailModal({ iv, onClose, onSave, bankAccounts, projects, financeByCode, projectByCode }) {
  const [draft, setDraft] = ivState(iv);
  const [newFollowUp, setNewFollowUp] = ivState({ date: new Date().toISOString().slice(0, 10), note: '', by: '' });
  React.useEffect(() => {
    setDraft(iv);
    setNewFollowUp({ date: new Date().toISOString().slice(0, 10), note: '', by: '' });
  }, [iv]);
  if (!iv || !draft) return null;

  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));
  const setReceive = (patch) => setDraft(d => ({ ...d, actualReceive: { ...(d.actualReceive || {}), ...patch } }));

  const project = projectByCode[draft.jobNo];
  const finance = financeByCode[draft.jobNo];
  const debt = finance?.debt || 0;
  const netExpected = (draft.balance || 0) - debt;

  const addFollowUp = () => {
    if (!newFollowUp.note.trim()) return;
    setDraft(d => ({ ...d, followUps: [...(d.followUps || []), { ...newFollowUp }] }));
    setNewFollowUp({ date: new Date().toISOString().slice(0, 10), note: '', by: newFollowUp.by });
  };
  const removeFollowUp = (idx) => setDraft(d => ({ ...d, followUps: d.followUps.filter((_, i) => i !== idx) }));

  const s = WTPData.IV_STATUS_META[draft.status];

  return (
    <Modal
      open={!!iv}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'ui-monospace', fontSize: 14, color: 'var(--brand-700)' }}>{draft.ivNo || 'IV ใหม่'}</span>
          <Badge kind={s.badge}>{s.label}</Badge>
          <span style={{ fontSize: 13, fontWeight: 500 }}>· {project?.name || '—'}</span>
        </div>
      }
      onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>ยกเลิก</button>
        <button className="btn btn-primary" onClick={() => onSave(draft)}><Icon name="check" size={14} /> บันทึก</button>
      </>}
    >
      {/* TOP — basic IV info */}
      <div className="card" style={{ padding: 14, marginBottom: 14, background: '#f8fafc' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <div className="field"><label>Job no</label>
            <select className="select input" value={draft.jobNo || ''} onChange={(e) => set('jobNo', e.target.value)}>
              <option value="">— เลือก —</option>
              {projects.map(p => <option key={p.id} value={p['Contract No.'] || p.code}>{p['Contract No.'] || p.code} · {(p['พื้นที่'] || p.name || '').slice(0,30)}</option>)}
            </select>
          </div>
          <div className="field"><label>เลขที่ IV</label><input className="input" value={draft.ivNo || ''} onChange={(e) => set('ivNo', e.target.value)} placeholder="IV2026-XXX" /></div>
          <div className="field"><label>วันที่ IV</label><input className="input" type="date" value={draft.invoiceDate || ''} onChange={(e) => set('invoiceDate', e.target.value)} /></div>
          <div className="field"><label>งวดที่</label><input className="input" type="number" value={draft.period || 1} onChange={(e) => set('period', Number(e.target.value))} /></div>
          <div className="field"><label>Balance (บาท)</label><input className="input" type="number" value={draft.balance || 0} onChange={(e) => set('balance', Number(e.target.value))} /></div>
          <div className="field"><label>สถานะ</label>
            <select className="select input" value={draft.status} onChange={(e) => set('status', e.target.value)}>
              {Object.entries(WTPData.IV_STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Computed: assignee, debt, net */}
      <div className="grid grid-3" style={{ marginBottom: 14 }}>
        <InfoCard label="ผู้รับโอนสิทธิ (จาก RAW_PROJECT_FINANCE)" value={finance?.assignee || 'ไม่โอน'} />
        <InfoCard label="ภาระหนี้" value={debt ? '-' + fmtNum(debt, 0) : '—'} unit={debt ? 'บาท' : ''} negative={!!debt} />
        <InfoCard label="คาดรับสุทธิ" value={fmtNum(netExpected, 0)} unit="บาท" highlight />
      </div>

      {/* CONTACT */}
      <div className="card" style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontWeight: 600, color: 'var(--brand-700)' }}>
          <Icon name="settings" size={14} /> ข้อมูลผู้ติดต่อ / กำหนดรับ
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div className="field"><label>ชื่อผู้ติดต่อ</label><input className="input" value={draft.contactName || ''} onChange={(e) => set('contactName', e.target.value)} placeholder="เช่น คุณสมหญิง" /></div>
          <div className="field"><label>เบอร์โทร</label><input className="input" value={draft.contactPhone || ''} onChange={(e) => set('contactPhone', e.target.value)} placeholder="0XX-XXX-XXXX" /></div>
          <div className="field"><label>วันที่คาดว่าจะได้รับเงิน</label><input className="input" type="date" value={draft.expectedReceive || ''} onChange={(e) => set('expectedReceive', e.target.value)} /></div>
        </div>
      </div>

      {/* FOLLOW-UPS */}
      <div className="card" style={{ padding: 0, marginBottom: 14, overflow: 'hidden' }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 600, color: 'var(--brand-700)', display: 'flex', alignItems: 'center', gap: 8 }}>
            📞 ประวัติติดตาม · {draft.followUps?.length || 0} ครั้ง
          </div>
        </div>
        <div style={{ maxHeight: 180, overflowY: 'auto' }}>
          {(!draft.followUps || draft.followUps.length === 0) ? (
            <div className="muted" style={{ padding: 16, fontSize: 12.5, textAlign: 'center' }}>ยังไม่มีการติดตาม</div>
          ) : (
            <table className="tbl" style={{ fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th style={{ width: 110 }}>วันที่</th>
                  <th>หมายเหตุการติดตาม</th>
                  <th style={{ width: 120 }}>ผู้ติดตาม</th>
                  <th style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {draft.followUps.map((f, i) => (
                  <tr key={i}>
                    <td>{fmtDate(f.date)}</td>
                    <td>{f.note}</td>
                    <td>{f.by || <span className="muted">—</span>}</td>
                    <td><button className="btn-icon danger" onClick={() => removeFollowUp(i)} title="ลบ"><Icon name="trash" size={12} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {/* Add follow-up form */}
        <div style={{ borderTop: '1px solid var(--line)', padding: 12, background: 'var(--brand-50, #f0f6ff)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 120px 80px', gap: 8, alignItems: 'end' }}>
            <input className="input input-cell" type="date" value={newFollowUp.date} onChange={(e) => setNewFollowUp(s => ({ ...s, date: e.target.value }))} />
            <input className="input input-cell" placeholder="เช่น โทรตามแล้ว เจ้าหน้าที่บอกรอเซ็น…" value={newFollowUp.note} onChange={(e) => setNewFollowUp(s => ({ ...s, note: e.target.value }))} />
            <input className="input input-cell" placeholder="ผู้ติดตาม" value={newFollowUp.by} onChange={(e) => setNewFollowUp(s => ({ ...s, by: e.target.value }))} />
            <button className="btn btn-primary btn-sm" onClick={addFollowUp} disabled={!newFollowUp.note.trim()}>
              <Icon name="plus" size={12} /> บันทึก
            </button>
          </div>
        </div>
      </div>

      {/* ACTUAL RECEIVE */}
      <div className="card" style={{ padding: 14, background: draft.status === 'paid' ? '#f0fdf4' : '#fffbeb' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontWeight: 600, color: draft.status === 'paid' ? 'var(--good)' : 'oklch(60% 0.16 75)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="coin" size={14} /> การรับเงินจริง
          </div>
          {!draft.actualReceive && draft.status !== 'paid' && (
            <button className="btn btn-sm" onClick={() => setReceive({ date: new Date().toISOString().slice(0, 10), amount: draft.balance, bankAccount: '', feeNote: '' })}>
              <Icon name="plus" size={12} /> บันทึกการรับเงิน
            </button>
          )}
        </div>
        {draft.actualReceive ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div className="field"><label>วันที่รับจริง</label>
              <input className="input" type="date" value={draft.actualReceive.date || ''} onChange={(e) => setReceive({ date: e.target.value })} />
            </div>
            <div className="field"><label>จำนวนเงินที่ได้รับจริง (บาท)</label>
              <input className="input" type="number" value={draft.actualReceive.amount || 0} onChange={(e) => setReceive({ amount: Number(e.target.value) })} />
            </div>
            <div className="field"><label>เข้าบัญชี</label>
              <select className="select input" value={draft.actualReceive.bankAccount || ''} onChange={(e) => setReceive({ bankAccount: e.target.value })}>
                <option value="">— เลือกบัญชี —</option>
                {(bankAccounts || []).map(b => <option key={b.id} value={`${b.BANK_NAME || b.bankName} ${b.Bank_AC || b.accountNo}`}>{b.BANK_NAME || b.bankName} · {b.Bank_AC || b.accountNo}</option>)}
              </select>
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>หมายเหตุ (เช่น หักค่าธรรมเนียม / หักเงินกู้)</label>
              <input className="input" value={draft.actualReceive.feeNote || ''} onChange={(e) => setReceive({ feeNote: e.target.value })} placeholder="เช่น หักค่าธรรมเนียมโอน 30 บาท · หักชำระ PS2026-014 1,500,000" />
            </div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px dashed var(--line)' }}>
              <div className="muted" style={{ fontSize: 12 }}>
                ส่วนต่างจาก Balance:&nbsp;
                <strong style={{ color: (draft.actualReceive.amount - draft.balance) < 0 ? 'var(--bad)' : 'var(--good)' }}>
                  {(draft.actualReceive.amount - draft.balance) > 0 ? '+' : ''}{fmtNum(draft.actualReceive.amount - draft.balance, 0)} บาท
                </strong>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setReceive(null) || set('actualReceive', null)}>
                <Icon name="trash" size={12} /> ลบบันทึกรับเงิน
              </button>
            </div>
          </div>
        ) : (
          <div className="muted" style={{ fontSize: 12.5 }}>ยังไม่มีบันทึกรับเงินจริง — เมื่อเงินเข้าจริงแล้วให้กดปุ่ม "บันทึกการรับเงิน"</div>
        )}
      </div>
    </Modal>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Import RAW_IV_OUTSTANDING — paste TSV/CSV → auto-detect new IVs vs existing
// ────────────────────────────────────────────────────────────────────────────
function ImportRawIvModal({ open, onClose, existing, onImport }) {
  const [raw, setRaw] = ivState('');
  const [parsed, setParsed] = ivState({ all: [], existing: [], updated: [], new_: [] });

  React.useEffect(() => {
    if (!raw.trim()) { setParsed({ all: [], existing: [], updated: [], new_: [] }); return; }
    const all = parseRawIv(raw);
    const existingByIv = Object.fromEntries(existing.map(iv => [iv.ivNo, iv]));
    const new_ = [];
    const existingList = [];
    const updated = [];
    all.forEach(r => {
      const ex = existingByIv[r.ivNo];
      if (!ex) new_.push(r);
      else if ((ex.balance || 0) !== (r.balance || 0)) updated.push({ ...ex, balance: r.balance, _oldBalance: ex.balance });
      else existingList.push(ex);
    });
    setParsed({ all, existing: existingList, updated, new_ });
  }, [raw]);

  if (!open) return null;

  const importNow = () => {
    const rows = parsed.new_.map(r => ({
      ivNo: r.ivNo, jobNo: r.jobNo, invoiceDate: r.invoiceDate,
      balance: r.balance, period: r.period || 1,
      status: 'pending_inspection', expectedReceive: '',
      contactName: '', contactPhone: '',
      followUps: [], actualReceive: null,
    }));
    onImport(rows);
    setRaw('');
  };

  return (
    <Modal
      open={open}
      title="📥 นำเข้า RAW_IV_OUTSTANDING"
      onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>ยกเลิก</button>
        <button className="btn btn-primary" disabled={parsed.new_.length === 0} onClick={importNow}>
          <Icon name="upload" size={14} /> นำเข้าใบใหม่ ({parsed.new_.length})
        </button>
      </>}
    >
      <div style={{ fontSize: 12.5, marginBottom: 8, color: 'var(--ink-500)' }}>
        วางข้อมูลใบแจ้งหนี้คงค้างที่ดึงจากระบบ (รูปแบบ TSV จาก Excel หรือ JSON). คอลัมน์ที่ใช้:&nbsp;
        <strong>proj_dpt</strong>, <strong>invno</strong>, <strong>invdate</strong>, <strong>Balance</strong>, <strong>period</strong> (ถ้ามี)
        <br />
        ระบบจะเปรียบเทียบกับใบในตาราง — เฉพาะใบที่ <strong>ไม่ซ้ำ</strong> จะถูกนำเข้า
      </div>

      <textarea
        className="input"
        rows={8}
        placeholder={`ตัวอย่าง (วางจาก Excel ได้เลย):

proj_dpt\tinvno\tinvdate\tBalance\tperiod
PP064-STIIS\tIV2026-077\t2026-05-10\t231525\t1
PP073-AYT\tIV2026-076\t2026-05-05\t4200000\t2
…`}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        style={{ fontFamily: 'ui-monospace', fontSize: 12, width: '100%', resize: 'vertical' }}
      />

      {/* Preview */}
      {raw.trim() && (
        <div style={{ marginTop: 14 }}>
          <div className="grid grid-3" style={{ marginBottom: 10 }}>
            <div style={{ padding: 10, borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
              <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>ใบใหม่ (จะนำเข้า)</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--good)' }}>{parsed.new_.length}</div>
            </div>
            <div style={{ padding: 10, borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a' }}>
              <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>ใบเก่า — มูลค่าเปลี่ยน</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'oklch(60% 0.16 75)' }}>{parsed.updated.length}</div>
            </div>
            <div style={{ padding: 10, borderRadius: 8, background: '#f1f5f9', border: '1px solid var(--line)' }}>
              <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>ใบเก่า — ไม่เปลี่ยน</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink-700)' }}>{parsed.existing.length}</div>
            </div>
          </div>

          {parsed.new_.length > 0 && (
            <div className="card" style={{ padding: 0, overflow: 'auto', maxHeight: 240 }}>
              <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)', fontSize: 12, fontWeight: 600, background: '#f8fafc' }}>ใบที่จะนำเข้า</div>
              <table className="tbl" style={{ fontSize: 12 }}>
                <thead><tr><th>Job no</th><th>IV no</th><th>Date</th><th style={{ textAlign: 'right' }}>Balance</th><th style={{ textAlign: 'center' }}>งวด</th></tr></thead>
                <tbody>
                  {parsed.new_.map((r, i) => (
                    <tr key={i}>
                      <td style={{ fontFamily: 'ui-monospace' }}>{r.jobNo}</td>
                      <td style={{ fontFamily: 'ui-monospace' }}>{r.ivNo}</td>
                      <td>{fmtDate(r.invoiceDate)}</td>
                      <td className="num">{fmtNum(r.balance, 0)}</td>
                      <td style={{ textAlign: 'center' }}>{r.period || 1}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

// Parse TSV/CSV from RAW_IV_OUTSTANDING
// Expected columns (case-insensitive): proj_dpt, invno, invdate, balance, period
function parseRawIv(text) {
  // Try JSON first
  const t = text.trim();
  if (t.startsWith('[') || t.startsWith('{')) {
    try {
      const j = JSON.parse(t);
      const arr = Array.isArray(j) ? j : [j];
      return arr.map(normalizeIvRow).filter(Boolean);
    } catch (_) { /* fall through */ }
  }
  // TSV/CSV: detect delimiter
  const lines = t.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return [];
  const delim = lines[0].includes('\t') ? '\t' : (lines[0].includes(',') ? ',' : '\t');
  const headers = lines[0].split(delim).map(h => h.trim().toLowerCase());
  const idx = (name) => headers.indexOf(name);
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delim);
    const row = {
      jobNo:       (cols[idx('proj_dpt')] || cols[idx('jobno')] || cols[idx('job no')] || '').trim(),
      ivNo:        (cols[idx('invno')] || cols[idx('iv no')] || cols[idx('iv_no')] || '').trim(),
      invoiceDate: normalizeDate((cols[idx('invdate')] || cols[idx('inv date')] || cols[idx('date')] || '').trim()),
      balance:     parseNum(cols[idx('balance')]),
      period:      parseNum(cols[idx('period')]) || 1,
    };
    if (row.ivNo) out.push(row);
  }
  return out;
}
function normalizeIvRow(r) {
  const get = (...keys) => { for (const k of keys) { const lk = k.toLowerCase(); for (const rk of Object.keys(r)) { if (rk.toLowerCase() === lk) return r[rk]; } } return null; };
  const ivNo = (get('invno', 'iv no', 'iv_no') || '').toString().trim();
  if (!ivNo) return null;
  return {
    jobNo: (get('proj_dpt', 'jobno') || '').toString().trim(),
    ivNo,
    invoiceDate: normalizeDate((get('invdate', 'inv date', 'date') || '').toString().trim()),
    balance: parseNum(get('balance')),
    period: parseNum(get('period')) || 1,
  };
}
function parseNum(s) {
  if (s == null || s === '') return 0;
  const n = Number(String(s).replace(/,/g, '').trim());
  return isNaN(n) ? 0 : n;
}
function normalizeDate(s) {
  if (!s) return '';
  // Accept YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    let [_, a, b, y] = m;
    if (y.length === 2) y = '20' + y;
    // Assume DD/MM/YYYY (Thai)
    return `${y}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`;
  }
  return s;
}

Object.assign(window, { InvoicesPage });
