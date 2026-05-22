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

// Parse dd/MM/yyyy or ISO date string → Date object
function parseDue(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

// Robust number parser — handles "2,000.00" strings, ฿ signs, etc.
function parseNum(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? 0 : n;
}

// Amount input: formatted display (2,000.00) when not focused; raw number when editing
function AmountInput({ value, onChange, label, required }) {
  const [focused, setFocused] = dxState(false);
  const [raw, setRaw] = dxState('');
  const numVal = parseNum(value);
  const display = numVal === 0 && (value == null || value === '') ? '' : fmtNum(numVal, 2);
  return (
    <div className="field">
      <label style={{ fontSize: 12 }}>{label}{required && <span style={{ color: 'var(--bad)', marginLeft: 4 }}>*</span>}</label>
      <div style={{ position: 'relative' }}>
        <input
          className="input"
          type="text"
          value={focused ? raw : display}
          onChange={e => setRaw(e.target.value)}
          onFocus={e => { setFocused(true); setRaw(numVal === 0 ? '' : String(numVal)); setTimeout(() => e.target.select(), 0); }}
          onBlur={() => { onChange(parseNum(raw)); setFocused(false); }}
          style={{ textAlign: 'right', paddingRight: 26, fontWeight: 600, fontFamily: 'ui-monospace', color: numVal < 0 ? 'var(--bad)' : 'inherit' }}
        />
        <span style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--ink-400)', pointerEvents: 'none' }}>฿</span>
      </div>
    </div>
  );
}

// ─── AP Edit Modal — wide landscape, 4-col grid, styled delete confirm ───────
function APEditModal({ row, onClose, onSave, onDelete }) {
  const [draft, setDraft]             = dxState(null);
  const [confirmDelete, setConfirm]   = dxState(false);
  dxEffect(() => { setDraft(row ? { ...row } : null); setConfirm(false); }, [row]);
  if (!row || !draft) return null;
  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));

  const Hdr = ({ label, icon }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--brand-700)', paddingBottom: 6, borderBottom: '1px solid var(--ink-100)', gridColumn: '1 / -1', marginTop: 4 }}>
      <Icon name={icon} size={13} />{label}
    </div>
  );

  const F = ({ fkey, label, type, hint, required, placeholder, span }) => {
    const v = draft[fkey];
    return (
      <div className="field" style={{ gridColumn: span ? `span ${span}` : 'auto' }}>
        <label style={{ fontSize: 12 }}>{label}{required && <span style={{ color: 'var(--bad)', marginLeft: 4 }}>*</span>}</label>
        {type === 'textarea'
          ? <textarea className="input" rows={2} value={v || ''} onChange={e => set(fkey, e.target.value)} placeholder={placeholder} style={{ resize: 'vertical' }} />
          : <input className="input" type={type || 'text'} value={v ?? ''} onChange={e => set(fkey, e.target.value)} placeholder={placeholder} />
        }
        {hint && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{hint}</div>}
      </div>
    );
  };

  return (
    <>
      <Modal open={!!row} title={draft.id ? `แก้ไข AP · ${draft.vchno || '—'}` : 'เพิ่ม AP ใหม่'}
        maxWidth={1160} onClose={onClose}
        footer={<>
          {draft.id && <button className="btn btn-ghost" style={{ color: 'var(--bad)', marginRight: 'auto' }}
            onClick={() => setConfirm(true)}>
            <Icon name="trash" size={13} /> ลบรายการ
          </button>}
          <button className="btn btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn btn-primary" onClick={() => onSave(draft)}><Icon name="check" size={13} /> บันทึก</button>
        </>}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px 16px' }}>
          <Hdr label="ข้อมูลเอกสาร" icon="invoice" />
          <F fkey="vchno"   label="vchno · ใบสำคัญ"         required hint="APO2026040181" />
          <F fkey="docno"   label="docno (col B)" />
          <F fkey="vchdate" label="วันที่ใบสำคัญ"             type="date" />
          <F fkey="due2"    label="วันครบกำหนด"               hint="dd/MM/yyyy" />
          <F fkey="refno"   label="refno · เลขที่อ้างอิง"    hint="เลขอ้างอิง (col E)" />
          <F fkey="refcode" label="refcode"                    hint="รหัสอ้างอิง" />

          <Hdr label="เจ้าหนี้ (Vendor)" icon="money" />
          <F fkey="cust_name" label="ชื่อเจ้าหนี้" required span={3} />
          <F fkey="acct_no"   label="รหัสเจ้าหนี้" />

          <Hdr label="แผนก / โครงการ" icon="forecast" />
          <F fkey="dpt_code" label="รหัสแผนก" hint="HRD / MNG / FIN / ITD" />
          <F fkey="dpt_name" label="ชื่อแผนก" />
          <F fkey="jobcode"  label="Job Code" />
          <F fkey="jobname"  label="ชื่องาน" />

          <Hdr label="ยอดเงิน (Amounts)" icon="coin" />
          <AmountInput value={draft.Amount}     onChange={v => set('Amount', v)}     label="Amount · ยอดก่อนหัก"      required />
          <AmountInput value={draft.VAT}        onChange={v => set('VAT', v)}        label="VAT · ภาษีมูลค่าเพิ่ม" />
          <AmountInput value={draft.net_new}    onChange={v => set('net_new', v)}    label="net_new · รวม VAT" />
          <AmountInput value={draft.Less_Ret}   onChange={v => set('Less_Ret', v)}   label="Less_Ret · หักประกัน" />
          <AmountInput value={draft.WHT_EXT}    onChange={v => set('WHT_EXT', v)}    label="WHT_EXT · ภาษีหัก ณ จ่าย" />
          <AmountInput value={draft.netpayment} onChange={v => set('netpayment', v)} label="netpayment · ยอดสุทธิ"    required />

          <Hdr label="หมายเหตุ" icon="edit" />
          <F fkey="remark" label="remark · คำอธิบาย" type="textarea" span={4} />
        </div>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal open={confirmDelete} title="ยืนยันการลบรายการ" maxWidth={400} onClose={() => setConfirm(false)}
        footer={<>
          <button className="btn btn-ghost" onClick={() => setConfirm(false)}>ยกเลิก</button>
          <button className="btn btn-primary" style={{ background: 'var(--bad)', borderColor: 'var(--bad)' }}
            onClick={() => { onDelete(draft.id); setConfirm(false); onClose(); }}>
            <Icon name="trash" size={13} /> ยืนยันลบ
          </button>
        </>}>
        <div style={{ textAlign: 'center', padding: '20px 8px' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🗑️</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>ต้องการลบรายการนี้?</div>
          <div style={{ fontFamily: 'ui-monospace', fontWeight: 700, color: 'var(--brand-700)', fontSize: 14, marginBottom: 6 }}>{draft.vchno}</div>
          {draft.cust_name && <div style={{ fontSize: 13, color: 'var(--ink-500)', marginBottom: 10 }}>{draft.cust_name}</div>}
          <div style={{ fontSize: 12, color: 'var(--bad)', fontWeight: 500 }}>การลบไม่สามารถย้อนกลับได้</div>
        </div>
      </Modal>
    </>
  );
}

// ─── AP Outstanding page ─────────────────────────────────────────────────────
function DataPayablePage({ data, setData, toast }) {
  const [edit, setEdit]             = dxState(null);
  const [query, setQuery]           = dxState('');
  const [showSug, setShowSug]       = dxState(false);
  const [docFilter, setDocFilter]   = dxState('all');
  const [dptFilter, setDptFilter]   = dxState('all');
  const [sortKey, setSortKey]       = dxState('vchdate');
  const [sortDir, setSortDir]       = dxState('desc');
  const [showImport, setShowImport] = dxState(false);
  const [importText, setImportText] = dxState('');

  const rows = data.payables || [];

  const getDocType = (vchno) => {
    if (!vchno) return 'other';
    const v = String(vchno).toUpperCase();
    if (v.startsWith('APO')) return 'APO';
    if (v.startsWith('APS')) return 'APS';
    if (v.startsWith('APV')) return 'APV';
    return 'other';
  };

  const dptCodes = dxMemo(() =>
    [...new Set(rows.map(r => r.dpt_code).filter(Boolean))].sort()
  , [rows]);

  const filtered = dxMemo(() => {
    let xs = rows;
    if (docFilter !== 'all') xs = xs.filter(r => getDocType(r.vchno) === docFilter);
    if (dptFilter !== 'all') xs = xs.filter(r => r.dpt_code === dptFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      xs = xs.filter(r => ['cust_name','vchno','docno','jobcode','jobname','remark','dpt_code']
        .some(k => String(r[k]||'').toLowerCase().includes(q)));
    }
    return xs.slice().sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey];
      if (sortKey === 'vchdate' || sortKey === 'due2') {
        const da = parseDue(av) || new Date(0), db = parseDue(bv) || new Date(0);
        return sortDir === 'asc' ? da - db : db - da;
      }
      const na = Number(av), nb = Number(bv);
      if (!isNaN(na) && !isNaN(nb)) return sortDir === 'asc' ? na - nb : nb - na;
      av = String(av||''); bv = String(bv||'');
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [rows, docFilter, dptFilter, query, sortKey, sortDir]);

  const suggestions = dxMemo(() => {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase();
    const seen = new Set();
    const out = [];
    rows.forEach(r => {
      ['cust_name','vchno'].forEach(k => {
        const v = String(r[k]||'');
        if (v.toLowerCase().includes(q) && !seen.has(v) && v) { seen.add(v); out.push(v); }
      });
    });
    return out.slice(0, 8);
  }, [rows, query]);

  // KPI — netpayment (col Q) tracks filtered rows
  const fNet    = filtered.reduce((s, r) => s + parseNum(r.netpayment), 0);
  const overdue = filtered.filter(r => { const d = parseDue(r.due2||r.due); return d && d < new Date(); }).length;

  // Doc-type counts
  const dtCount = { APO: 0, APS: 0, APV: 0 };
  rows.forEach(r => { const t = getDocType(r.vchno); if (dtCount[t] !== undefined) dtCount[t]++; });

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };
  const SI = ({ k }) => sortKey !== k
    ? <span style={{ opacity: 0.25, fontSize: 10, marginLeft: 2 }}>⇅</span>
    : <span style={{ fontSize: 10, marginLeft: 2 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>;

  const save = (row) => {
    setData(d => ({
      ...d,
      payables: row.id
        ? d.payables.map(x => x.id === row.id ? row : x)
        : [{ ...row, id: WTPData.newId() }, ...d.payables],
    }));
    setEdit(null);
    toast('บันทึกข้อมูลแล้ว');
  };

  const remove = (id) => {
    setData(d => ({ ...d, payables: d.payables.filter(x => x.id !== id) }));
    toast('ลบรายการแล้ว');
  };

  const handleImport = () => {
    if (!importText.trim()) { toast('ไม่มีข้อมูล'); return; }
    const lines = importText.trim().split('\n');
    if (lines.length < 2) { toast('ต้องมีแถวหัวตารางและข้อมูลอย่างน้อย 1 แถว'); return; }
    const headers = lines[0].split('\t').map(h => h.trim());
    const existing = new Set((data.payables || []).map(r => r.vchno).filter(Boolean));
    let added = 0, skipped = 0;
    const newRows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split('\t');
      if (cols.every(c => !c.trim())) continue;
      const obj = { id: WTPData.newId() };
      headers.forEach((h, j) => { obj[h] = cols[j] != null ? cols[j].trim() : ''; });
      if (obj.vchno && existing.has(obj.vchno)) { skipped++; continue; }
      if (obj.vchno) existing.add(obj.vchno);
      newRows.push(obj);
      added++;
    }
    if (newRows.length > 0) {
      setData(d => ({ ...d, payables: [...(d.payables||[]), ...newRows] }));
    }
    setShowImport(false);
    setImportText('');
    toast(`นำเข้าแล้ว ${added} รายการ · ข้ามซ้ำ ${skipped} รายการ`);
  };

  const COLS = [
    { key: 'vchdate',    label: 'วันที่',            w: 90  },
    { key: 'vchno',      label: 'เลขที่ใบสำคัญ',    w: 140 },
    { key: 'cust_name',  label: 'เจ้าหนี้ / Vendor', w: 260 },
    { key: 'dpt_code',   label: 'แผนก',              w: 76  },
    { key: 'due2',       label: 'วันครบกำหนด',       w: 105 },
    { key: '_overdue',   label: 'เกินกำหนด',         w: 88  },
    { key: 'netpayment', label: 'Net Payment (฿)',   w: 148 },
    { key: 'remark',     label: 'หมายเหตุ',           w: 300 },
  ];

  return (
    <div className="page">
      {/* Page header */}
      <div className="page-head anim-in">
        <div>
          <h1 className="page-title">DATA AP Outstanding · ใบแจ้งหนี้เจ้าหนี้คงค้าง</h1>
          <div className="page-sub">RAW_AP_OUTSTANDING · 54 คอลัมน์ · วางข้อมูล RAW ได้เลย</div>
        </div>
        <div className="page-head-r">
          <button className="btn btn-ghost" onClick={() => setShowImport(true)}>
            <Icon name="upload" size={14} /> นำเข้า Excel
          </button>
        </div>
      </div>

      {/* KPI — 2 cards, values follow filtered table */}
      <div className="grid grid-2 anim-stagger" style={{ marginBottom: 16 }}>
        <KpiTile label="จำนวนรายการ (ตามตาราง)" value={filtered.length} unit=" รายการ" digits={0} accent="var(--brand-500)" icon="invoice" animate={false} />
        <KpiTile label="Net Payment รวม (ตามตาราง)" value={fNet} unit=" ฿" digits={2} accent="oklch(55% 0.18 30)" icon="coin" animate={false}
          delta={overdue > 0 ? `${overdue} รายการเกินกำหนด` : undefined} deltaKind={overdue > 0 ? 'bad' : 'neu'} />
      </div>

      {/* Filter bar — tabs left, dropdown + search right (inline) */}
      <div className="card" style={{ padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div className="tabnav" style={{ flex: '0 0 auto' }}>
          <button className={docFilter === 'all' ? 'active' : ''} onClick={() => setDocFilter('all')}>ทั้งหมด ({rows.length})</button>
          {['APO','APS','APV'].map(t => (
            <button key={t} className={docFilter === t ? 'active' : ''} onClick={() => setDocFilter(t)}>{t} ({dtCount[t]||0})</button>
          ))}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Dept dropdown */}
          <select value={dptFilter} onChange={e => setDptFilter(e.target.value)}
            style={{ height: 34, fontSize: 13, padding: '0 10px', border: '1px solid var(--ink-150)', borderRadius: 8, background: 'var(--surface)', color: 'var(--ink-800)', minWidth: 158, cursor: 'pointer' }}>
            <option value="all">แผนก: ทั้งหมด</option>
            {dptCodes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          {/* Search — solid surface bg so text doesn't bleed through */}
          <div style={{ position: 'relative', width: 268 }}>
            <div className="tb-search" style={{ background: 'var(--surface)', border: '1px solid var(--ink-150)', borderRadius: 8, boxShadow: 'none' }}>
              <Icon name="search" size={14} />
              <input value={query}
                onChange={e => { setQuery(e.target.value); setShowSug(true); }}
                onFocus={() => setShowSug(true)}
                onBlur={() => setTimeout(() => setShowSug(false), 180)}
                placeholder="ค้นหา cust_name / vchno…"
                style={{ background: 'transparent' }}
              />
              {query && <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', color: 'var(--ink-400)' }} onClick={() => setQuery('')}>✕</button>}
            </div>
            {showSug && suggestions.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: '#ffffff', border: '1px solid var(--ink-150)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', marginTop: 4, maxHeight: 230, overflowY: 'auto' }}>
                {suggestions.map((s, i) => (
                  <div key={i} style={{ padding: '8px 13px', cursor: 'pointer', fontSize: 13, borderBottom: i < suggestions.length-1 ? '1px solid var(--ink-50)' : 'none' }}
                    onMouseDown={() => { setQuery(s); setShowSug(false); }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--brand-50)'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}>{s}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card anim-in" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 370px)' }}>
          <table className="tbl" style={{ minWidth: 1050 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 3, background: 'var(--surface)' }}>
              <tr>
                {COLS.map(c => (
                  <th key={c.key}
                    style={{ width: c.w, minWidth: c.w, cursor: c.key !== '_overdue' ? 'pointer' : 'default', userSelect: 'none', whiteSpace: 'nowrap' }}
                    onClick={() => c.key !== '_overdue' && toggleSort(c.key)}>
                    {c.label}{c.key !== '_overdue' && <SI k={c.key} />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center' }} className="muted">ไม่พบข้อมูล</td></tr>
              )}
              {filtered.map(row => {
                const due = parseDue(row.due2 || row.due);
                const days = due ? Math.ceil((due - new Date()) / 86400000) : null;
                const dueColor = days === null ? 'var(--ink-400)' : days < 0 ? 'var(--bad)' : days < 7 ? 'oklch(60% 0.16 75)' : days < 30 ? 'oklch(70% 0.16 60)' : 'var(--ink-400)';
                const netPay = parseNum(row.netpayment);
                const vt = { verticalAlign: 'top', paddingTop: 10, paddingBottom: 10 };
                return (
                  <tr key={row.id} onClick={() => setEdit(row)} style={{ cursor: 'pointer' }}>
                    <td style={{ ...vt, fontSize: 12, whiteSpace: 'nowrap', color: 'var(--ink-600)' }}>{row.vchdate || '—'}</td>
                    <td style={vt}><span style={{ fontWeight: 600, color: 'var(--brand-700)', fontFamily: 'ui-monospace', fontSize: 12 }}>{row.vchno || '—'}</span></td>
                    <td style={{ ...vt, fontSize: 13 }}>{row.cust_name || <span className="muted">—</span>}</td>
                    <td style={vt}>{row.dpt_code ? <Badge kind="b-blue" dot={false}>{row.dpt_code}</Badge> : <span className="muted">—</span>}</td>
                    <td style={{ ...vt, fontSize: 12, whiteSpace: 'nowrap', color: dueColor }}>{row.due2 || row.due || <span className="muted">—</span>}</td>
                    <td style={{ ...vt, textAlign: 'center' }}>
                      {days === null ? <span className="muted">—</span>
                        : days < 0 ? <span style={{ background: 'var(--bad)', color: '#fff', borderRadius: 5, padding: '2px 6px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{Math.abs(days)} วัน</span>
                        : days === 0 ? <span style={{ color: 'var(--bad)', fontWeight: 700, fontSize: 11 }}>วันนี้!</span>
                        : <span style={{ color: dueColor, fontSize: 11 }}>อีก {days}d</span>}
                    </td>
                    <td style={{ ...vt, textAlign: 'right', fontWeight: 700, color: 'var(--bad)', fontVariantNumeric: 'tabular-nums' }}>{fmtNum(netPay, 2)}</td>
                    <td style={{ ...vt, fontSize: 12, color: 'var(--ink-600)' }}><span title={row.remark||''}>{row.remark || <span className="muted">—</span>}</span></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--brand-50)', fontWeight: 700 }}>
                <td colSpan={6} style={{ padding: '8px 14px', fontSize: 12, color: 'var(--brand-700)' }}>รวม {filtered.length} รายการ</td>
                <td className="num" style={{ padding: '8px 14px', color: 'var(--bad)' }}>{fmtNum(fNet, 2)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Import modal */}
      {showImport && (
        <Modal open={showImport} title="นำเข้า Excel · AP Outstanding" maxWidth={680}
          onClose={() => { setShowImport(false); setImportText(''); }}
          footer={<>
            <button className="btn btn-ghost" onClick={() => { setShowImport(false); setImportText(''); }}>ยกเลิก</button>
            <button className="btn btn-primary" onClick={handleImport}><Icon name="upload" size={13} /> นำเข้า</button>
          </>}>
          <div style={{ fontSize: 13, color: 'var(--ink-600)', marginBottom: 10, lineHeight: 1.6 }}>
            คัดลอกข้อมูลจาก Excel <strong>พร้อมแถวหัวตาราง</strong> แล้ววางในช่องด้านล่าง<br />
            รายการที่ <strong>vchno ซ้ำ</strong>กับข้อมูลที่มีอยู่แล้วจะถูกข้ามโดยอัตโนมัติ — เฉพาะแถวใหม่เท่านั้นที่จะถูกเพิ่ม
          </div>
          <textarea
            className="input"
            rows={14}
            value={importText}
            onChange={e => setImportText(e.target.value)}
            placeholder={"วางข้อมูล TSV จาก Excel ที่นี่…\n(เลือกทั้งหมดใน Excel → Ctrl+C → วางที่นี่)"}
            style={{ fontFamily: 'ui-monospace', fontSize: 11.5, width: '100%', resize: 'vertical' }}
          />
        </Modal>
      )}

      {/* Edit / view modal */}
      <APEditModal row={edit} onClose={() => setEdit(null)} onSave={save} onDelete={remove} />
    </div>
  );
}

Object.assign(window, { ForecastEntriesPage, DataBankPage, DataPVPage, DataPayablePage });
