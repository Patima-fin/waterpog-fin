// 4 data-management CRUD pages: forecast entries / bank / PS notes / payables.
// Globals: React, Modal, Icon, Badge, KpiTile, fmtNum, fmtMoney, fmtDate, useToasts, ForecastEntryModal

const { useState: dxState, useMemo: dxMemo, useEffect: dxEffect } = React;

// ─── Generic CRUD page ────────────────────────────────────────────────────────
function DataCrudPage({ data, setData, toast, config }) {
  const [edit, setEdit] = dxState(null);
  const [query, setQuery] = dxState('');
  const [filter, setFilter] = dxState('all');

  const rows = data[config.dataKey] || [];

  const filtered = dxMemo(() => {
    let xs = rows;
    if (config.filters && filter !== 'all') {
      xs = xs.filter(r => config.filterFn(r, filter));
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      xs = xs.filter(r => config.searchKeys.some(k => String(r[k] || '').toLowerCase().includes(q)));
    }
    return xs;
  }, [rows, filter, query]);

  const save = (row) => {
    setData(d => ({
      ...d,
      [config.dataKey]: row.id
        ? d[config.dataKey].map(x => x.id === row.id ? row : x)
        : [{ ...row, id: WTPData.newId() }, ...d[config.dataKey]],
    }));
    setEdit(null);
    toast('บันทึกข้อมูลแล้ว');
  };
  const remove = (id) => {
    if (!confirm('ยืนยันการลบรายการนี้?')) return;
    setData(d => ({ ...d, [config.dataKey]: d[config.dataKey].filter(x => x.id !== id) }));
    toast('ลบรายการแล้ว');
  };

  const stats = config.summary ? config.summary(rows) : [];

  return (
    <div className="page">
      <div className="page-head anim-in">
        <div>
          <h1 className="page-title">{config.title}</h1>
          <div className="page-sub">{config.sub}</div>
        </div>
        <div className="page-head-r">
          <button className="btn btn-ghost"><Icon name="upload" size={14} /> นำเข้า Excel</button>
          <button className="btn btn-primary" onClick={() => setEdit({ ...config.emptyRow, id: null })}>
            <Icon name="plus" size={14} /> {config.addLabel || 'เพิ่ม'}
          </button>
        </div>
      </div>

      {stats.length > 0 && (
        <div className={`grid grid-${Math.min(4, stats.length)} anim-stagger`} style={{ marginBottom: 16 }}>
          {stats.map((s, i) => (
            <KpiTile
              key={i}
              label={s.label}
              value={s.value}
              unit={s.unit || 'บาท'}
              digits={s.digits ?? 2}
              accent={s.accent || 'var(--brand-500)'}
              icon={s.icon}
              delta={s.delta}
              deltaKind={s.deltaKind || 'neu'}
            />
          ))}
        </div>
      )}

      <div className="card" style={{ padding: 14, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        {config.filters ? (
          <div className="tabnav">
            <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>ทั้งหมด ({rows.length})</button>
            {config.filters.map(f => (
              <button key={f.key} className={filter === f.key ? 'active' : ''} onClick={() => setFilter(f.key)}>{f.label} ({rows.filter(r => config.filterFn(r, f.key)).length})</button>
            ))}
          </div>
        ) : <div />}
        <div className="tb-search" style={{ width: 300 }}>
          <Icon name="search" size={14} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={config.searchPlaceholder || 'ค้นหา…'} />
        </div>
      </div>

      <div className="card anim-in" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="tbl">
          <thead>
            <tr>
              {config.columns.map((c, i) => (
                <th key={i} style={{ width: c.width, textAlign: c.align || 'left' }}>{c.label}</th>
              ))}
              <th style={{ width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={config.columns.length + 1} style={{ padding: 36, textAlign: 'center' }} className="muted">ไม่พบข้อมูล · กดปุ่ม "{config.addLabel || 'เพิ่ม'}" เพื่อบันทึก</td></tr>
            )}
            {filtered.map(row => (
              <tr key={row.id}>
                {config.columns.map((c, i) => (
                  <td key={i} style={{ textAlign: c.align || 'left' }} className={c.numeric ? 'num' : ''}>
                    {c.render ? c.render(row) : (
                      c.type === 'money' ? <span style={{ color: row[c.key] < 0 ? 'var(--bad)' : 'inherit', fontWeight: 600 }}>{fmtNum(row[c.key], c.digits ?? 2)}</span>
                      : c.type === 'date' ? fmtDate(row[c.key])
                      : c.mono ? <span style={{ fontFamily: 'ui-monospace', color: 'var(--brand-700)', fontWeight: 600 }}>{row[c.key]}</span>
                      : row[c.key] || <span className="muted">—</span>
                    )}
                  </td>
                ))}
                <td>
                  <div className="row-act">
                    <button className="btn-icon" onClick={() => setEdit(row)} title="แก้ไข"><Icon name="edit" size={14} /></button>
                    <button className="btn-icon danger" onClick={() => remove(row.id)} title="ลบ"><Icon name="trash" size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          {config.footer && (
            <tfoot>{config.footer(filtered)}</tfoot>
          )}
        </table>
      </div>

      <GenericEditModal
        row={edit}
        onClose={() => setEdit(null)}
        onSave={save}
        fields={config.modalFields}
        header={config.modalHeader}
        title={edit?.id ? `แก้ไข ${config.singular || 'รายการ'}` : `เพิ่ม ${config.singular || 'รายการ'}ใหม่`}
      />
    </div>
  );
}

function GenericEditModal({ row, onClose, onSave, fields, title, header }) {
  const [draft, setDraft] = dxState(null);
  dxEffect(() => { setDraft(row ? { ...row } : null); }, [row]);
  if (!row || !draft) return null;   // wait for draft to be populated
  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));

  // Group fields by `section` markers so we can render visual sub-headers.
  const groups = [];
  let current = { title: null, icon: null, fields: [] };
  fields.forEach((f) => {
    if (f.type === 'section') {
      if (current.fields.length || current.title) groups.push(current);
      current = { title: f.label, icon: f.icon, fields: [] };
    } else {
      current.fields.push(f);
    }
  });
  if (current.fields.length) groups.push(current);

  const renderField = (f, i) => {
    const v = draft[f.key];
    const hasSuffix = !!f.suffix;
    const inputEl =
      f.type === 'select' ? (
        <select className="select input" value={v || ''} onChange={(e) => set(f.key, e.target.value)}>
          {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : f.type === 'textarea' ? (
        <textarea className="input" rows={f.rows || 2} value={v || ''} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder} />
      ) : (
        <input
          className="input"
          type={f.type || 'text'}
          value={v ?? ''}
          onChange={(e) => set(f.key, f.type === 'number' ? Number(e.target.value) : e.target.value)}
          placeholder={f.placeholder}
          style={hasSuffix ? { paddingRight: 36, textAlign: f.type === 'number' ? 'right' : undefined } : (f.type === 'number' ? { textAlign: 'right' } : undefined)}
        />
      );
    return (
      <div className="field" key={i} style={{ gridColumn: f.full ? '1 / -1' : 'auto' }}>
        <label>{f.label}{f.required && <span style={{ color: 'var(--bad)', marginLeft: 4 }}>*</span>}</label>
        {hasSuffix ? (
          <div style={{ position: 'relative' }}>
            {inputEl}
            <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-500)', fontSize: 12, pointerEvents: 'none' }}>{f.suffix}</span>
          </div>
        ) : inputEl}
        {f.hint && <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>{f.hint}</div>}
      </div>
    );
  };

  return (
    <Modal open={!!row} title={title} maxWidth={720} onClose={onClose} footer={<>
      <button className="btn btn-ghost" onClick={onClose}>ยกเลิก</button>
      <button className="btn btn-primary" onClick={() => onSave(draft)}><Icon name="check" size={14} /> บันทึก</button>
    </>}>
      {header && <div style={{ marginBottom: 18 }}>{header(draft)}</div>}
      <div style={{ display: 'grid', gap: 20 }}>
        {groups.map((g, gi) => (
          <div key={gi}>
            {g.title && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 11.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
                color: 'var(--brand-700)', marginBottom: 10,
                paddingBottom: 6, borderBottom: '1px solid var(--ink-100)',
              }}>
                {g.icon && <Icon name={g.icon} size={14} />}
                {g.title}
              </div>
            )}
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
              {g.fields.map(renderField)}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

// ─── Page configs ─────────────────────────────────────────────────────────────

function ForecastEntriesPage({ data, setData, toast }) {
  return (
    <DataCrudPage data={data} setData={setData} toast={toast} config={{
      title: 'Manual Expense · ค่าใช้จ่ายที่บันทึกเอง',
      sub: 'RAW_MANUAL_EXPENSE · รายการที่ยังไม่อยู่ในระบบ AP · วาง RAW ได้เลย',
      dataKey: 'forecastEntries',
      addLabel: 'เพิ่มรายการ',
      singular: 'รายการ',
      searchPlaceholder: 'ค้นหา DESCRIPTION / JOB_NO / CATEGORY…',
      searchKeys: ['DESCRIPTION', 'JOB_NO', 'PROJECT_NAME', 'CATEGORY'],
      filters: [
        { key: 'PLANNED',  label: 'PLANNED' },
        { key: 'DONE',     label: 'DONE' },
        { key: 'CANCELED', label: 'CANCELED' },
      ],
      filterFn: (r, k) => (r.STATUS || r.status || '') === k,
      emptyRow: {
        DATE: data.meta.asOf, PAYMENT_DATE: '', EXPENSE_TYPE: 'Manual',
        DESCRIPTION: '', JOB_NO: '', PROJECT_NAME: '',
        AMOUNT: 0, Bank_AC: '', STATUS: 'PLANNED', CATEGORY: '', IS_ACCRUED: '', NOTE: '',
      },
      columns: [
        { key: 'DATE',          label: 'DATE', type: 'date', width: 105 },
        { key: 'PAYMENT_DATE',  label: 'PAYMENT_DATE', type: 'date', width: 105 },
        { key: 'DESCRIPTION',   label: 'DESCRIPTION', render: r => <div><div style={{ fontWeight: 500 }}>{r.DESCRIPTION || r.label}</div>{r.NOTE && <div className="muted" style={{ fontSize: 11.5 }}>{r.NOTE}</div>}</div> },
        { key: 'JOB_NO',        label: 'JOB_NO', width: 100, mono: true },
        { key: 'CATEGORY',      label: 'CATEGORY', width: 110, render: r => r.CATEGORY ? <Badge kind="b-gray" dot={false}>{r.CATEGORY}</Badge> : <span className="muted">—</span> },
        { key: 'AMOUNT',        label: 'AMOUNT', align: 'right', width: 140, render: r => {
          const v = Number(r.AMOUNT || r.amount || 0);
          return <span style={{ color: v < 0 ? 'var(--bad)' : 'var(--good)', fontWeight: 700 }}>{v > 0 ? '+' : ''}{fmtNum(v, 0)}</span>;
        }},
        { key: 'STATUS',        label: 'STATUS', width: 100, render: r => {
          const s = r.STATUS || r.status || '';
          const kind = s === 'DONE' ? 'b-green' : s === 'CANCELED' ? 'b-red' : 'b-amber';
          return <Badge kind={kind} dot={false}>{s || '—'}</Badge>;
        }},
      ],
      modalFields: [
        { key: 'DATE',          label: 'DATE', type: 'date' },
        { key: 'PAYMENT_DATE',  label: 'PAYMENT_DATE', type: 'date' },
        { key: 'EXPENSE_TYPE',  label: 'EXPENSE_TYPE', type: 'text' },
        { key: 'DESCRIPTION',   label: 'DESCRIPTION', type: 'text', full: true },
        { key: 'JOB_NO',        label: 'JOB_NO', type: 'text' },
        { key: 'PROJECT_NAME',  label: 'PROJECT_NAME', type: 'text', full: true },
        { key: 'AMOUNT',        label: 'AMOUNT (บาท) · ติดลบ = ออก', type: 'number' },
        { key: 'Bank_AC',       label: 'Bank_AC', type: 'text' },
        { key: 'STATUS',        label: 'STATUS', type: 'text', placeholder: 'PLANNED / DONE / CANCELED' },
        { key: 'CATEGORY',      label: 'CATEGORY', type: 'text', placeholder: 'Project / Finance / HR…' },
        { key: 'IS_ACCRUED',    label: 'IS_ACCRUED', type: 'text' },
        { key: 'NOTE',          label: 'NOTE', type: 'textarea', full: true },
      ],
      summary: (rows) => {
        const inflow  = rows.filter(r => Number(r.AMOUNT||r.amount||0) > 0).reduce((s, r) => s + Number(r.AMOUNT||r.amount||0), 0);
        const outflow = rows.filter(r => Number(r.AMOUNT||r.amount||0) < 0).reduce((s, r) => s + Number(r.AMOUNT||r.amount||0), 0);
        return [
          { label: 'จำนวนรายการ', value: rows.length, unit: ' รายการ', digits: 0, icon: 'forecast', accent: 'var(--brand-500)' },
          { label: 'เงินเข้ารวม',  value: inflow,  accent: 'var(--good)', icon: 'arrow_down' },
          { label: 'เงินออกรวม',   value: Math.abs(outflow), accent: 'var(--bad)',  icon: 'arrow_up' },
          { label: 'สุทธิ',         value: inflow + outflow, accent: (inflow + outflow) >= 0 ? 'var(--good)' : 'var(--bad)', icon: 'coin' },
        ];
      },
    }} />
  );
}

function DataBankPage({ data, setData, toast }) {
  return (
    <DataCrudPage data={data} setData={setData} toast={toast} config={{
      title: 'DATA BANK · บัญชีธนาคาร',
      sub: 'RAW_BANK_BALANCE · ยอดคงเหลือบัญชีธนาคาร · วาง RAW ได้เลย',
      dataKey: 'bankAccounts',
      addLabel: 'เพิ่มบัญชี',
      singular: 'บัญชี',
      searchPlaceholder: 'ค้นหาธนาคาร/เลขที่บัญชี…',
      searchKeys: ['BANK_NAME', 'Bank_AC', 'NOTE'],
      filters: [
        { key: 'positive', label: 'ยอดเป็นบวก' },
        { key: 'negative', label: 'OD/ติดลบ' },
      ],
      filterFn: (r, k) => {
        const bal = Number(r.BALANCE ?? r.balance ?? 0);
        return k === 'positive' ? bal >= 0 : bal < 0;
      },
      emptyRow: { DATE: data.meta.asOf, BANK_NAME: '', Bank_AC: '', BALANCE: 0, AVAILABLE_BALANCE: 0, HOLD_AMOUNT: 0, NOTE: '' },
      columns: [
        { key: 'BANK_NAME',          label: 'ธนาคาร', width: 130, render: r => <div style={{ fontWeight: 700, color: 'var(--brand-700)' }}>{r.BANK_NAME || r.bankName}</div> },
        { key: 'Bank_AC',            label: 'Bank_AC (เลขที่บัญชี)', width: 160, mono: true },
        { key: 'BALANCE',            label: 'BALANCE', align: 'right', width: 160, render: r => {
          const v = Number(r.BALANCE ?? r.balance ?? 0);
          return <span style={{ color: v < 0 ? 'var(--bad)' : 'inherit', fontWeight: 600 }}>{fmtNum(v, 2)}</span>;
        }},
        { key: 'AVAILABLE_BALANCE',  label: 'AVAILABLE_BALANCE', align: 'right', width: 160, render: r => <span>{fmtNum(Number(r.AVAILABLE_BALANCE||0), 2)}</span> },
        { key: 'HOLD_AMOUNT',        label: 'HOLD_AMOUNT', align: 'right', width: 120, render: r => <span className="muted">{fmtNum(Number(r.HOLD_AMOUNT||0), 2)}</span> },
        { key: 'DATE',               label: 'DATE', type: 'date', width: 110 },
        { key: 'NOTE',               label: 'NOTE' },
      ],
      modalHeader: (draft) => {
        const bal   = Number(draft.BALANCE ?? 0);
        const avail = Number(draft.AVAILABLE_BALANCE ?? 0);
        const hold  = Number(draft.HOLD_AMOUNT ?? 0);
        const bank  = draft.BANK_NAME || '—';
        const ac    = draft.Bank_AC || '—';
        return (
          <div style={{
            padding: '16px 18px',
            borderRadius: 12,
            background: bal >= 0
              ? 'linear-gradient(135deg, color-mix(in oklch, var(--brand-500) 12%, transparent), color-mix(in oklch, var(--good) 8%, transparent))'
              : 'linear-gradient(135deg, color-mix(in oklch, var(--bad) 12%, transparent), color-mix(in oklch, var(--bad) 4%, transparent))',
            border: '1px solid var(--ink-100)',
            display: 'grid', gap: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 38, height: 38, borderRadius: 10,
                background: 'color-mix(in oklch, var(--brand-500) 18%, transparent)',
                color: 'var(--brand-700)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}><Icon name="bank" size={20} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--brand-700)' }}>{bank}</div>
                <div className="muted" style={{ fontFamily: 'ui-monospace', fontSize: 12 }}>{ac}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="muted" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5 }}>BALANCE</div>
                <div style={{ fontWeight: 700, fontSize: 20, color: bal < 0 ? 'var(--bad)' : 'var(--good)' }}>
                  {fmtNum(bal, 2)} <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>฿</span>
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, paddingTop: 6, borderTop: '1px dashed var(--ink-100)' }}>
              <div>
                <div className="muted" style={{ fontSize: 10.5 }}>AVAILABLE</div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{fmtNum(avail, 2)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="muted" style={{ fontSize: 10.5 }}>HOLD</div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{fmtNum(hold, 2)}</div>
              </div>
            </div>
          </div>
        );
      },
      modalFields: [
        { type: 'section', label: 'ข้อมูลบัญชี', icon: 'bank' },
        { key: 'BANK_NAME',         label: 'ชื่อธนาคาร',           type: 'text',   required: true, placeholder: 'เช่น SCB, KBANK, KTB', hint: 'รหัสย่อของธนาคาร' },
        { key: 'Bank_AC',           label: 'เลขที่บัญชี (Bank_AC)', type: 'text',   required: true, placeholder: '0000000000', hint: 'ไม่ต้องใส่ขีดคั่น' },

        { type: 'section', label: 'ยอดเงิน', icon: 'coin' },
        { key: 'BALANCE',           label: 'BALANCE (ยอดคงเหลือ)', type: 'number', suffix: '฿', required: true, hint: 'ยอดบัญชีรวม — ติดลบหมายถึง OD' },
        { key: 'AVAILABLE_BALANCE', label: 'AVAILABLE (ใช้ได้)',    type: 'number', suffix: '฿', hint: 'ยอดที่เบิกใช้ได้จริง' },
        { key: 'HOLD_AMOUNT',       label: 'HOLD (ติด hold)',       type: 'number', suffix: '฿', hint: 'จำนวนที่ถูก hold ไว้' },

        { type: 'section', label: 'อื่นๆ', icon: 'edit' },
        { key: 'DATE',              label: 'DATE (วันที่อัปเดต)',  type: 'date',   hint: 'วันที่ดึงยอดล่าสุด' },
        { key: 'NOTE',              label: 'NOTE (หมายเหตุ)',       type: 'textarea', full: true, rows: 2, placeholder: 'บันทึกเพิ่มเติม เช่น OD Limit, วงเงิน L/C ...' },
      ],
      summary: (rows) => {
        const bal  = rows.reduce((s, r) => s + Number(r.BALANCE ?? r.balance ?? 0), 0);
        const avail= rows.reduce((s, r) => s + Number(r.AVAILABLE_BALANCE ?? 0), 0);
        const pos  = rows.filter(r => Number(r.BALANCE??r.balance??0) >= 0).reduce((s, r) => s + Number(r.BALANCE??r.balance??0), 0);
        return [
          { label: 'จำนวนบัญชี',       value: rows.length, unit: ' บัญชี', digits: 0, icon: 'bank',  accent: 'var(--brand-500)' },
          { label: 'BALANCE รวม',      value: bal,   accent: bal >= 0 ? 'var(--good)' : 'var(--bad)', icon: 'coin' },
          { label: 'AVAILABLE รวม',    value: avail, accent: 'oklch(60% 0.18 295)', icon: 'arrow_down' },
          { label: 'ยอดบวก',          value: pos,   accent: 'var(--good)', icon: 'check' },
        ];
      },
    }} />
  );
}

function DataPVPage({ data, setData, toast }) {
  return (
    <DataCrudPage data={data} setData={setData} toast={toast} config={{
      title: 'DATA PV · Payment Voucher',
      sub: 'RAW_PV_PAYMENT · รายการจ่ายเงินจริงทั้งหมด · วาง RAW ได้เลย',
      dataKey: 'pvVouchers',
      addLabel: 'เพิ่ม PV',
      singular: 'PV',
      searchPlaceholder: 'ค้นหา PL_PV_No / Payee / AP_No / Ref_Code…',
      searchKeys: ['PL_PV_No', 'Payee', 'AP_No', 'Ref_Code', 'cc_remark'],
      filters: [
        { key: 'HRD', label: 'HRD' }, { key: 'FIN', label: 'FIN' },
        { key: 'ACC', label: 'ACC' }, { key: 'PMD', label: 'PMD' },
      ],
      filterFn: (r, k) => r.Ref_Code === k,
      emptyRow: {
        Project_Dpt: '', Ref_Code: '', PL_PV_No: '', jobcode: '',
        Pmt_Date: data.meta.asOf, Type_of_Pmt: 'Transfer Bank', Option: '',
        Payee: '', Type: '', AP_No: '', vchdate: '', Chq_No: '', Chq_Date: '',
        Bnf_Acct_No: '', Bnf_Bank: '', Bank_AC: '', Bank_Id: '',
        Remark: '', cc_remark: '',
        Amount: 0, Down_payment: 0, Deduct: 0, Vat: 0, Ret: 0,
        Before_WHT: 0, WHT: 0, Less_Other: 0, Total: 0, Minus_Other: 0, Net_Amount: 0,
      },
      columns: [
        { key: 'PL_PV_No',     label: 'PL_PV_No', width: 150, mono: true },
        { key: 'Pmt_Date',     label: 'Pmt_Date', type: 'date', width: 105 },
        { key: 'Payee',        label: 'Payee' },
        { key: 'Ref_Code',     label: 'Ref_Code', width: 80, render: r => <Badge kind="b-gray" dot={false}>{r.Ref_Code}</Badge> },
        { key: 'Type_of_Pmt', label: 'Type_of_Pmt', width: 110, render: r => <Badge kind="b-blue" dot={false}>{r.Type_of_Pmt}</Badge> },
        { key: 'Bank_AC',      label: 'Bank_AC', width: 140, mono: true },
        { key: 'Net_Amount',   label: 'Net_Amount', align: 'right', width: 140, render: r => <span style={{ fontWeight: 600, color: Number(r.Net_Amount||0) < 0 ? 'var(--bad)' : 'inherit' }}>{fmtNum(Number(r.Net_Amount||0), 2)}</span> },
        { key: 'AP_No',        label: 'AP_No', width: 150, mono: true },
        { key: 'cc_remark',    label: 'cc_remark' },
      ],
      modalFields: [
        { key: 'PL_PV_No',    label: 'PL_PV_No', type: 'text', placeholder: 'PV20260500XXX' },
        { key: 'Pmt_Date',    label: 'Pmt_Date', type: 'date' },
        { key: 'Payee',       label: 'Payee', type: 'text', full: true },
        { key: 'Ref_Code',    label: 'Ref_Code', type: 'text', placeholder: 'HRD / FIN / PMD…' },
        { key: 'jobcode',     label: 'jobcode', type: 'text' },
        { key: 'Type_of_Pmt',label: 'Type_of_Pmt', type: 'text' },
        { key: 'AP_No',       label: 'AP_No', type: 'text' },
        { key: 'Bank_AC',     label: 'Bank_AC', type: 'text' },
        { key: 'Net_Amount',  label: 'Net_Amount (บาท)', type: 'number' },
        { key: 'Amount',      label: 'Amount (ก่อนหัก)', type: 'number' },
        { key: 'WHT',         label: 'WHT', type: 'number' },
        { key: 'Vat',         label: 'Vat', type: 'number' },
        { key: 'cc_remark',   label: 'cc_remark', type: 'textarea', full: true },
      ],
      summary: (rows) => {
        const total = rows.reduce((s, r) => s + Number(r.Net_Amount || r.amount || 0), 0);
        const month = (new Date()).toISOString().slice(0, 7);
        const thisMonth = rows.filter(r => (r.Pmt_Date || r.paidDate || '').slice(0, 7) === month)
          .reduce((s, r) => s + Number(r.Net_Amount || r.amount || 0), 0);
        const byRef = {};
        rows.forEach(r => { const k = r.Ref_Code || r.category || '?'; byRef[k] = (byRef[k]||0) + Number(r.Net_Amount||r.amount||0); });
        const topRef = Object.entries(byRef).sort((a,b)=>b[1]-a[1])[0] || ['—', 0];
        return [
          { label: 'จำนวน PV',       value: rows.length, unit: ' รายการ', digits: 0, icon: 'invoice', accent: 'var(--brand-500)' },
          { label: 'Net_Amount รวม', value: total,     accent: 'var(--bad)', icon: 'arrow_up' },
          { label: 'เดือนนี้',        value: thisMonth, accent: 'oklch(60% 0.18 295)', icon: 'coin' },
          { label: `Ref สูงสุด: ${topRef[0]}`, value: topRef[1], accent: 'oklch(70% 0.16 75)', icon: 'money' },
        ];
      },
    }} />
  );
}

// Parse dd/MM/yyyy or ISO date string → Date object (handles RAW Excel text dates)
function parseDue(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

function DataPayablePage({ data, setData, toast }) {
  return (
    <DataCrudPage data={data} setData={setData} toast={toast} config={{
      title: 'DATA AP Outstanding · ใบแจ้งหนี้เจ้าหนี้คงค้าง',
      sub: 'RAW_AP_OUTSTANDING · 54 คอลัมน์ตาม format ต้นฉบับ · วาง RAW ได้เลย',
      dataKey: 'payables',
      addLabel: 'เพิ่มรายการ',
      singular: 'รายการ AP',
      searchPlaceholder: 'ค้นหา cust_name / vchno / jobcode / remark…',
      searchKeys: ['cust_name', 'vchno', 'docno', 'jobcode', 'jobname', 'remark', 'dpt_code'],
      filters: [
        { key: 'HRD', label: 'HRD · บุคคล' },
        { key: 'MNG', label: 'MNG · บริหาร' },
        { key: 'HO',  label: 'HO · สำนักงาน' },
        { key: 'ITD', label: 'ITD · IT' },
        { key: 'IPD', label: 'IPD · ผลิตภัณฑ์' },
        { key: 'FIN', label: 'FIN · การเงิน' },
        { key: 'ACC', label: 'ACC · บัญชี' },
        { key: 'SAL', label: 'SAL · ขาย' },
      ],
      filterFn: (r, k) => r.dpt_code === k,
      emptyRow: {
        maincode: 'MG1', ty: 'AP', doctype: 'O', typecode: '', data_ty: '1', aptype: '4',
        docno: '', vchno: '', vchdate: '', refno: '', due: '', due2: '', remark: '',
        Amount: 0, Less_Adv: 0, Less: 0, exchange: 1, VAT: 0, net_new: 0,
        WHT_EMP: 0, Less_Other: 0, Balance_Amount2: 0, Less_Ret: 0, Balance_Amount1: 0,
        amt_bf_wt: 0, WHT_EXT: 0, Net_amount2_new: 0, netpayment: 0,
        pre_event: '', pre_event2: '', refcode: '', pre_des: '',
        jobcode: '', jobname: '', ac_code_ven: '', dpt_code: '', dpt_name: '',
        acct_no: '', cust_name: '', acct_no_h: '', acct_header_name: '',
        bus_code: '', taxinv: 'N', glretap: '', whamt: 0, Less_adv_amount: 0,
        acctcust: '', h1_group: '', h2_group: '', h3_group: '', bold: 'FALSE',
        vendor_group: '', vendor_group2: '', exchange2: 1,
      },
      columns: [
        { key: 'vchno', label: 'vchno (ใบสำคัญ)', width: 165, mono: true,
          render: r => (
            <div>
              <div style={{ fontWeight: 600, color: 'var(--brand-700)', fontFamily: 'ui-monospace' }}>{r.vchno || '—'}</div>
              {r.docno && <div className="muted" style={{ fontSize: 10.5 }}>{r.docno}</div>}
            </div>
          )
        },
        { key: 'vchdate', label: 'vchdate', type: 'date', width: 95 },
        { key: 'due2', label: 'due (ครบกำหนด)', width: 120,
          render: r => {
            const due = parseDue(r.due2 || r.due);
            if (!due) return <span className="muted">—</span>;
            const days = Math.ceil((due - new Date()) / 86400000);
            const color = days < 0 ? 'var(--bad)' : days < 7 ? 'oklch(60% 0.16 75)' : days < 30 ? 'oklch(70% 0.16 60)' : 'var(--ink-500)';
            return (
              <div>
                <div style={{ fontSize: 12 }}>{r.due2 || fmtDate(r.due)}</div>
                <div style={{ fontSize: 10.5, color }}>
                  {days < 0 ? `เลย ${Math.abs(days)} วัน` : days === 0 ? 'วันนี้!' : `อีก ${days} วัน`}
                </div>
              </div>
            );
          }
        },
        { key: 'cust_name', label: 'cust_name (เจ้าหนี้)',
          render: r => (
            <div>
              <div style={{ fontWeight: 500 }}>{r.cust_name || '—'}</div>
              {r.acct_no && <div className="muted" style={{ fontSize: 10.5, fontFamily: 'ui-monospace' }}>{r.acct_no}</div>}
            </div>
          )
        },
        { key: 'dpt_code', label: 'แผนก', width: 100,
          render: r => r.dpt_code ? (
            <div>
              <Badge kind="b-blue" dot={false}>{r.dpt_code}</Badge>
              {r.dpt_name && <div className="muted" style={{ fontSize: 10, marginTop: 2 }}>{r.dpt_name.split(' ')[0]}</div>}
            </div>
          ) : <span className="muted">—</span>
        },
        { key: 'jobcode', label: 'jobcode', width: 100, mono: true,
          render: r => r.jobcode ? (
            <div>
              <div style={{ fontFamily: 'ui-monospace', fontSize: 12 }}>{r.jobcode}</div>
              {r.jobname && <div className="muted" style={{ fontSize: 10.5 }}>{r.jobname.length > 20 ? r.jobname.slice(0,20) + '…' : r.jobname}</div>}
            </div>
          ) : <span className="muted">—</span>
        },
        { key: 'Amount', label: 'Amount', align: 'right', width: 110,
          render: r => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtNum(Number(r.Amount||0), 2)}</span>
        },
        { key: 'netpayment', label: 'netpayment', align: 'right', width: 120,
          render: r => <span style={{ fontWeight: 700, color: 'var(--bad)' }}>{fmtNum(Number(r.netpayment||0), 2)}</span>
        },
        { key: 'Balance_Amount1', label: 'Balance (คงค้าง)', align: 'right', width: 130,
          render: r => {
            const v = Number(r.Balance_Amount1||0);
            return <span style={{ fontWeight: 600, color: v > 0 ? 'oklch(55% 0.18 30)' : 'var(--ink-500)' }}>{fmtNum(v, 2)}</span>;
          }
        },
        { key: 'remark', label: 'remark (คำอธิบาย)',
          render: r => <span className="muted" style={{ fontSize: 12 }}>{r.remark ? (r.remark.length > 40 ? r.remark.slice(0,40) + '…' : r.remark) : '—'}</span>
        },
      ],
      footer: (rows) => {
        const amt  = rows.reduce((s, r) => s + Number(r.Amount||0), 0);
        const net  = rows.reduce((s, r) => s + Number(r.netpayment||0), 0);
        const bal1 = rows.reduce((s, r) => s + Number(r.Balance_Amount1||0), 0);
        const colCount = 10; // matches columns above + action col
        return (
          <tr style={{ background: 'var(--brand-50)', fontWeight: 700 }}>
            <td colSpan={5} style={{ padding: '8px 14px', fontSize: 12, color: 'var(--brand-700)' }}>รวม {rows.length} รายการ</td>
            <td />
            <td className="num" style={{ padding: '8px 14px' }}>{fmtNum(amt, 2)}</td>
            <td className="num" style={{ padding: '8px 14px', color: 'var(--bad)' }}>{fmtNum(net, 2)}</td>
            <td className="num" style={{ padding: '8px 14px', color: 'oklch(55% 0.18 30)' }}>{fmtNum(bal1, 2)}</td>
            <td colSpan={2} />
          </tr>
        );
      },
      modalFields: [
        { type: 'section', label: 'ข้อมูลเอกสาร (Document)', icon: 'invoice' },
        { key: 'vchno',          label: 'vchno (ใบสำคัญ)', type: 'text', required: true, hint: 'เช่น APO2026040181' },
        { key: 'docno',          label: 'docno (เลขที่เอกสาร)', type: 'text', hint: 'เช่น 20260001155' },
        { key: 'vchdate',        label: 'vchdate (วันที่ใบสำคัญ)', type: 'date' },
        { key: 'due2',           label: 'due2 (วันครบกำหนดจ่าย)', type: 'text', hint: 'dd/MM/yyyy เช่น 25/05/2026' },
        { key: 'taxinv',         label: 'taxinv', type: 'text', hint: 'Y หรือ N' },
        { key: 'refcode',        label: 'refcode', type: 'text', hint: 'รหัสอ้างอิง' },

        { type: 'section', label: 'เจ้าหนี้ (Vendor)', icon: 'money' },
        { key: 'cust_name',      label: 'cust_name (ชื่อเจ้าหนี้)', type: 'text', required: true, full: true },
        { key: 'acct_no',        label: 'acct_no (รหัสเจ้าหนี้)', type: 'text' },
        { key: 'vendor_group',   label: 'vendor_group', type: 'text', full: true, hint: 'Vendor : (XXXXX) ชื่อบริษัท' },

        { type: 'section', label: 'แผนก / โครงการ', icon: 'forecast' },
        { key: 'dpt_code',       label: 'dpt_code (รหัสแผนก)', type: 'text', hint: 'HRD / MNG / FIN / ACC / ITD ฯลฯ' },
        { key: 'dpt_name',       label: 'dpt_name (ชื่อแผนก)', type: 'text' },
        { key: 'jobcode',        label: 'jobcode (รหัสงาน)', type: 'text' },
        { key: 'jobname',        label: 'jobname (ชื่องาน)', type: 'text', full: true },

        { type: 'section', label: 'ยอดเงิน (Amounts)', icon: 'coin' },
        { key: 'Amount',         label: 'Amount (ยอดก่อนหัก)', type: 'number', suffix: '฿', required: true },
        { key: 'VAT',            label: 'VAT', type: 'number', suffix: '฿' },
        { key: 'net_new',        label: 'net_new (รวม VAT)', type: 'number', suffix: '฿' },
        { key: 'Less_Ret',       label: 'Less_Ret (หักประกันผลงาน)', type: 'number', suffix: '฿' },
        { key: 'WHT_EXT',        label: 'WHT_EXT (ภาษีหัก ณ ที่จ่าย)', type: 'number', suffix: '฿' },
        { key: 'Balance_Amount1',label: 'Balance_Amount1 (ยอดคงค้าง)', type: 'number', suffix: '฿' },
        { key: 'netpayment',     label: 'netpayment (ยอดสุทธิที่ต้องจ่าย)', type: 'number', suffix: '฿', required: true },

        { type: 'section', label: 'หมายเหตุ', icon: 'edit' },
        { key: 'remark',         label: 'remark (คำอธิบาย)', type: 'textarea', full: true, rows: 3 },
      ],
      summary: (rows) => {
        const amt     = rows.reduce((s, r) => s + Number(r.Amount||0), 0);
        const net     = rows.reduce((s, r) => s + Number(r.netpayment||0), 0);
        const bal1    = rows.reduce((s, r) => s + Number(r.Balance_Amount1||0), 0);
        const overdue = rows.filter(r => {
          const d = parseDue(r.due2 || r.due);
          return d && d < new Date();
        }).length;
        return [
          { label: 'จำนวนรายการ',         value: rows.length, unit: ' รายการ', digits: 0, icon: 'invoice', accent: 'var(--brand-500)' },
          { label: 'Amount รวม',          value: amt,    accent: 'oklch(70% 0.16 75)', icon: 'money' },
          { label: 'netpayment รวม',      value: net,    accent: 'var(--bad)', icon: 'arrow_up' },
          { label: 'คงค้าง (Balance_1)',   value: bal1,   accent: 'oklch(55% 0.18 30)', icon: 'coin',
            delta: overdue > 0 ? `${overdue} รายการเกินกำหนด` : undefined, deltaKind: overdue > 0 ? 'bad' : 'neu' },
        ];
      },
    }} />
  );
}

Object.assign(window, { ForecastEntriesPage, DataBankPage, DataPVPage, DataPayablePage });
