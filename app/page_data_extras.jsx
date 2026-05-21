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

      <GenericEditModal row={edit} onClose={() => setEdit(null)} onSave={save} fields={config.modalFields} title={edit?.id ? `แก้ไข ${config.singular || 'รายการ'}` : `เพิ่ม ${config.singular || 'รายการ'}ใหม่`} />
    </div>
  );
}

function GenericEditModal({ row, onClose, onSave, fields, title }) {
  const [draft, setDraft] = dxState(row);
  dxEffect(() => { setDraft(row); }, [row]);
  if (!row) return null;
  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));
  return (
    <Modal open={!!row} title={title} onClose={onClose} footer={<>
      <button className="btn btn-ghost" onClick={onClose}>ยกเลิก</button>
      <button className="btn btn-primary" onClick={() => onSave(draft)}><Icon name="check" size={14} /> บันทึก</button>
    </>}>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        {fields.map((f, i) => (
          <div className="field" key={i} style={{ gridColumn: f.full ? '1 / -1' : 'auto' }}>
            <label>{f.label}</label>
            {f.type === 'select' ? (
              <select className="select input" value={draft[f.key] || ''} onChange={(e) => set(f.key, e.target.value)}>
                {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : f.type === 'textarea' ? (
              <textarea className="input" rows={2} value={draft[f.key] || ''} onChange={(e) => set(f.key, e.target.value)} />
            ) : (
              <input
                className="input"
                type={f.type || 'text'}
                value={draft[f.key] ?? ''}
                onChange={(e) => set(f.key, f.type === 'number' ? Number(e.target.value) : e.target.value)}
                placeholder={f.placeholder}
              />
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}

// ─── Page configs ─────────────────────────────────────────────────────────────

const FORECAST_CATEGORIES = {
  inflow_project: 'เข้า — โครงการ',
  inflow_loan:    'เข้า — เงินกู้',
  outflow_op:     'ออก — ดำเนินงาน',
  outflow_proj:   'ออก — โครงการ',
  outflow_fin:    'ออก — การเงิน',
  outflow_misc:   'ออก — เบ็ดเตล็ด',
};

function ForecastEntriesPage({ data, setData, toast }) {
  return (
    <DataCrudPage data={data} setData={setData} toast={toast} config={{
      title: 'รายการประมาณการนอกระบบ',
      sub: 'บันทึกโดย: ฝ่ายงบประมาณการรับ-จ่าย · เงินคาดการณ์ที่ยังไม่อยู่ในระบบ',
      dataKey: 'forecastEntries',
      addLabel: 'เพิ่มประมาณการ',
      singular: 'รายการประมาณการ',
      searchPlaceholder: 'ค้นหารายการ…',
      searchKeys: ['label', 'note'],
      filters: [
        { key: 'in',  label: 'เงินเข้า' },
        { key: 'out', label: 'เงินออก' },
      ],
      filterFn: (r, k) => k === 'in' ? r.amount > 0 : r.amount < 0,
      emptyRow: { date: data.meta.asOf, category: 'inflow_project', label: '', amount: 0, note: '' },
      columns: [
        { key: 'date',  label: 'วันที่',  type: 'date', width: 110 },
        { key: 'label', label: 'รายการ', render: r => <div><div style={{ fontWeight: 500 }}>{r.label}</div>{r.note && <div className="muted" style={{ fontSize: 11.5 }}>{r.note}</div>}</div> },
        { key: 'category', label: 'ประเภท', width: 130, render: r => <Badge kind={r.amount > 0 ? 'b-green' : 'b-red'} dot={false}>{FORECAST_CATEGORIES[r.category]}</Badge> },
        { key: 'amount', label: 'มูลค่า', align: 'right', width: 160, render: r => <span style={{ color: r.amount > 0 ? 'var(--good)' : 'var(--bad)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{r.amount > 0 ? '+' : ''}{fmtNum(r.amount, 0)}</span> },
      ],
      modalFields: [
        { key: 'date', label: 'วันที่คาดการณ์', type: 'date' },
        { key: 'category', label: 'ประเภท', type: 'select', options: Object.entries(FORECAST_CATEGORIES).map(([v, l]) => ({ value: v, label: l })) },
        { key: 'label', label: 'รายการ', type: 'text', full: true, placeholder: 'เช่น เบิกสินเชื่อหมุนเวียน' },
        { key: 'amount', label: 'มูลค่า (บาท) · ติดลบ = เงินออก', type: 'number' },
        { key: 'note', label: 'หมายเหตุ', type: 'textarea', full: true },
      ],
      summary: (rows) => {
        const inflow = rows.filter(r => r.amount > 0).reduce((s, r) => s + r.amount, 0);
        const outflow = rows.filter(r => r.amount < 0).reduce((s, r) => s + r.amount, 0);
        return [
          { label: 'จำนวนรายการ', value: rows.length, unit: ' รายการ', digits: 0, icon: 'forecast', accent: 'var(--brand-500)' },
          { label: 'เงินเข้ารวม',  value: inflow,  accent: 'var(--good)', icon: 'arrow_down' },
          { label: 'เงินออกรวม',   value: outflow, accent: 'var(--bad)',  icon: 'arrow_up' },
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
      sub: 'ยอดคงเหลือบัญชีธนาคารทั้งหมดของบริษัท · ใช้สำหรับคำนวณกระแสเงินสดจริง',
      dataKey: 'bankAccounts',
      addLabel: 'เพิ่มบัญชี',
      singular: 'บัญชี',
      searchPlaceholder: 'ค้นหาธนาคาร/เลขที่บัญชี…',
      searchKeys: ['bankName', 'accountNo', 'accountName'],
      filters: [
        { key: 'positive', label: 'ยอดเป็นบวก' },
        { key: 'negative', label: 'OD/ติดลบ' },
      ],
      filterFn: (r, k) => k === 'positive' ? r.balance >= 0 : r.balance < 0,
      emptyRow: { bankName: '', accountNo: '', accountName: '', type: 'ออมทรัพย์', balance: 0, asOf: data.meta.asOf, note: '' },
      columns: [
        { key: 'bankName',    label: 'ธนาคาร', width: 130, render: r => <div><div style={{ fontWeight: 700, color: 'var(--brand-700)' }}>{r.bankName}</div><div className="muted" style={{ fontSize: 11.5 }}>{r.type}</div></div> },
        { key: 'accountNo',   label: 'เลขที่บัญชี', width: 160, mono: true },
        { key: 'accountName', label: 'ชื่อบัญชี' },
        { key: 'balance',     label: 'ยอดคงเหลือ', type: 'money', align: 'right', width: 160 },
        { key: 'asOf',        label: 'ณ วันที่', type: 'date', width: 110 },
        { key: 'note',        label: 'หมายเหตุ' },
      ],
      modalFields: [
        { key: 'bankName', label: 'ธนาคาร', type: 'text' },
        { key: 'type', label: 'ประเภทบัญชี', type: 'select', options: [
          { value: 'ออมทรัพย์', label: 'ออมทรัพย์' },
          { value: 'กระแสรายวัน', label: 'กระแสรายวัน' },
          { value: 'เดินสะพัด/OD', label: 'เดินสะพัด/OD' },
          { value: 'L/C', label: 'L/C' },
          { value: 'อื่นๆ', label: 'อื่นๆ' },
        ] },
        { key: 'accountNo', label: 'เลขที่บัญชี', type: 'text' },
        { key: 'accountName', label: 'ชื่อบัญชี', type: 'text', full: true },
        { key: 'balance', label: 'ยอดคงเหลือ (บาท) · ติดลบ = OD', type: 'number' },
        { key: 'asOf', label: 'ณ วันที่', type: 'date' },
        { key: 'note', label: 'หมายเหตุ', type: 'textarea', full: true },
      ],
      summary: (rows) => {
        const total = rows.reduce((s, r) => s + r.balance, 0);
        const pos = rows.filter(r => r.balance >= 0).reduce((s, r) => s + r.balance, 0);
        const od = rows.filter(r => r.balance < 0).reduce((s, r) => s + r.balance, 0);
        return [
          { label: 'จำนวนบัญชี',  value: rows.length, unit: ' บัญชี', digits: 0, icon: 'bank',  accent: 'var(--brand-500)' },
          { label: 'ยอดบวกรวม',   value: pos,   accent: 'var(--good)', icon: 'arrow_down' },
          { label: 'OD/ติดลบ',    value: Math.abs(od), accent: 'var(--bad)', icon: 'arrow_up' },
          { label: 'สุทธิ',        value: total, accent: total >= 0 ? 'var(--good)' : 'var(--bad)', icon: 'coin' },
        ];
      },
    }} />
  );
}

function DataPVPage({ data, setData, toast }) {
  const PV_CATEGORIES = ['วัสดุ', 'รับเหมา', 'ขนส่ง', 'สาธารณูปโภค', 'บริการ', 'เงินเดือน', 'การเงิน', 'ภาษี', 'อื่นๆ'];
  const PV_METHODS = ['โอน', 'เช็ค', 'เงินสด', 'หักบัญชี', 'ตั๋วแลกเงิน'];
  return (
    <DataCrudPage data={data} setData={setData} toast={toast} config={{
      title: 'DATA PV · Payment Voucher',
      sub: 'รายการที่จ่ายเงินจริงแล้วทั้งหมด · ใช้สำหรับเทียบกับแผนการจ่ายและบันทึกค่าใช้จ่ายจริง',
      dataKey: 'pvVouchers',
      addLabel: 'เพิ่ม PV',
      singular: 'PV',
      searchPlaceholder: 'ค้นหาเลขที่ PV / ผู้รับเงิน / อ้างอิง…',
      searchKeys: ['voucherNo', 'payee', 'reference', 'category'],
      filters: PV_CATEGORIES.slice(0, 5).map(c => ({ key: c, label: c })),
      filterFn: (r, k) => r.category === k,
      emptyRow: { voucherNo: '', paidDate: data.meta.asOf, payee: '', amount: 0, category: 'วัสดุ', paymentMethod: 'โอน', bankAccount: '', reference: '', note: '' },
      columns: [
        { key: 'voucherNo', label: 'เลขที่ PV', width: 130, mono: true },
        { key: 'paidDate',  label: 'วันที่จ่าย', type: 'date', width: 110 },
        { key: 'payee',     label: 'ผู้รับเงิน' },
        { key: 'category',  label: 'หมวด',   width: 110, render: r => <Badge kind="b-gray" dot={false}>{r.category}</Badge> },
        { key: 'amount',    label: 'จำนวนเงิน', type: 'money', align: 'right', width: 150 },
        { key: 'paymentMethod', label: 'วิธีจ่าย', width: 110, render: r => <Badge kind="b-blue" dot={false}>{r.paymentMethod}</Badge> },
        { key: 'bankAccount', label: 'บัญชี/ที่มา', width: 200 },
        { key: 'reference', label: 'อ้างอิง', width: 160 },
      ],
      modalFields: [
        { key: 'voucherNo', label: 'เลขที่ PV', type: 'text', placeholder: 'PV2026-XXX' },
        { key: 'paidDate', label: 'วันที่จ่ายจริง', type: 'date' },
        { key: 'payee', label: 'ผู้รับเงิน', type: 'text', full: true },
        { key: 'amount', label: 'จำนวนเงิน (บาท)', type: 'number' },
        { key: 'category', label: 'หมวดค่าใช้จ่าย', type: 'select', options: PV_CATEGORIES.map(c => ({ value: c, label: c })) },
        { key: 'paymentMethod', label: 'วิธีจ่าย', type: 'select', options: PV_METHODS.map(m => ({ value: m, label: m })) },
        { key: 'bankAccount', label: 'บัญชี/แหล่งเงิน', type: 'text', full: true, placeholder: 'เช่น กรุงเทพ 123-4-56789-0' },
        { key: 'reference', label: 'อ้างอิง (PO/IV/PS/Project)', type: 'text', full: true, placeholder: 'เช่น PO-2026-088 / PP088 งวด 2' },
        { key: 'note', label: 'หมายเหตุ', type: 'textarea', full: true },
      ],
      summary: (rows) => {
        const total = rows.reduce((s, r) => s + (r.amount || 0), 0);
        const byCat = {};
        rows.forEach(r => { byCat[r.category] = (byCat[r.category] || 0) + (r.amount || 0); });
        const sortedCats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
        const topCat = sortedCats[0] || ['—', 0];
        const month = (new Date()).toISOString().slice(0, 7);
        const thisMonth = rows.filter(r => (r.paidDate || '').slice(0, 7) === month).reduce((s, r) => s + (r.amount || 0), 0);
        return [
          { label: 'จำนวนรายการ',   value: rows.length, unit: ' รายการ', digits: 0, icon: 'invoice', accent: 'var(--brand-500)' },
          { label: 'ยอดจ่ายรวม',     value: total, accent: 'var(--bad)', icon: 'arrow_up' },
          { label: 'จ่ายเดือนนี้',    value: thisMonth, accent: 'oklch(60% 0.18 295)', icon: 'coin' },
          { label: `หมวดสูงสุด: ${topCat[0]}`, value: topCat[1], accent: 'oklch(70% 0.16 75)', icon: 'money' },
        ];
      },
    }} />
  );
}

function DataPayablePage({ data, setData, toast }) {
  return (
    <DataCrudPage data={data} setData={setData} toast={toast} config={{
      title: 'DATA เจ้าหนี้คงค้าง · Accounts Payable',
      sub: 'รายการเจ้าหนี้และค่าใช้จ่ายค้างจ่าย · ใช้สำหรับวางแผนการจ่ายเงิน',
      dataKey: 'payables',
      addLabel: 'เพิ่มเจ้าหนี้',
      singular: 'เจ้าหนี้',
      searchPlaceholder: 'ค้นหาชื่อเจ้าหนี้/เลขที่ Invoice…',
      searchKeys: ['creditorName', 'invoiceNo', 'category'],
      filters: [
        { key: 'pending', label: 'ค้างจ่าย' },
        { key: 'overdue', label: 'เลยกำหนด' },
        { key: 'paid',    label: 'ชำระแล้ว' },
      ],
      filterFn: (r, k) => r.status === k,
      emptyRow: { creditorName: '', invoiceNo: '', amount: 0, dueDate: '', category: 'วัสดุ', status: 'pending', note: '' },
      columns: [
        { key: 'creditorName', label: 'ชื่อเจ้าหนี้' },
        { key: 'invoiceNo',    label: 'เลขที่ Invoice', width: 150, mono: true },
        { key: 'category',     label: 'หมวด', width: 110, render: r => <Badge kind="b-gray" dot={false}>{r.category}</Badge> },
        { key: 'amount',       label: 'มูลค่า', type: 'money', align: 'right', width: 150 },
        { key: 'dueDate',      label: 'วันครบกำหนด', type: 'date', width: 120, render: r => {
          const due = new Date(r.dueDate); const today = new Date();
          const days = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
          return (
            <div>
              <div>{fmtDate(r.dueDate)}</div>
              <div className="muted" style={{ fontSize: 11, color: days < 0 ? 'var(--bad)' : days < 7 ? 'oklch(60% 0.16 75)' : 'var(--ink-500)' }}>
                {days < 0 ? `เลย ${Math.abs(days)} วัน` : days === 0 ? 'วันนี้' : `อีก ${days} วัน`}
              </div>
            </div>
          );
        } },
        { key: 'status', label: 'สถานะ', width: 110, render: r => {
          const map = { pending: { kind: 'b-amber', label: 'ค้างจ่าย' }, overdue: { kind: 'b-red', label: 'เลยกำหนด' }, paid: { kind: 'b-green', label: 'ชำระแล้ว' } };
          const m = map[r.status] || map.pending;
          return <Badge kind={m.kind}>{m.label}</Badge>;
        } },
      ],
      modalFields: [
        { key: 'creditorName', label: 'ชื่อเจ้าหนี้', type: 'text', full: true },
        { key: 'invoiceNo', label: 'เลขที่ Invoice', type: 'text' },
        { key: 'category', label: 'หมวดค่าใช้จ่าย', type: 'select', options: [
          { value: 'วัสดุ', label: 'วัสดุ' }, { value: 'รับเหมา', label: 'รับเหมา' },
          { value: 'ขนส่ง', label: 'ขนส่ง' }, { value: 'สาธารณูปโภค', label: 'สาธารณูปโภค' },
          { value: 'บริการ', label: 'บริการ' }, { value: 'เงินเดือน', label: 'เงินเดือน' },
          { value: 'การเงิน', label: 'การเงิน' }, { value: 'อื่นๆ', label: 'อื่นๆ' },
        ] },
        { key: 'amount', label: 'มูลค่า (บาท)', type: 'number' },
        { key: 'dueDate', label: 'วันครบกำหนด', type: 'date' },
        { key: 'status', label: 'สถานะ', type: 'select', options: [
          { value: 'pending', label: 'ค้างจ่าย' }, { value: 'overdue', label: 'เลยกำหนด' }, { value: 'paid', label: 'ชำระแล้ว' },
        ] },
        { key: 'note', label: 'หมายเหตุ', type: 'textarea', full: true },
      ],
      summary: (rows) => {
        const pending = rows.filter(r => r.status === 'pending').reduce((s, r) => s + r.amount, 0);
        const overdue = rows.filter(r => r.status === 'overdue').reduce((s, r) => s + r.amount, 0);
        const paid    = rows.filter(r => r.status === 'paid').reduce((s, r) => s + r.amount, 0);
        return [
          { label: 'จำนวนรายการ', value: rows.length, unit: ' รายการ', digits: 0, icon: 'invoice', accent: 'var(--brand-500)' },
          { label: 'ค้างจ่ายรวม',  value: pending, accent: 'oklch(70% 0.16 75)', icon: 'forecast' },
          { label: 'เลยกำหนด',     value: overdue, accent: 'var(--bad)', icon: 'arrow_up' },
          { label: 'ชำระแล้ว',     value: paid, accent: 'var(--good)', icon: 'check' },
        ];
      },
    }} />
  );
}

Object.assign(window, { ForecastEntriesPage, DataBankPage, DataPVPage, DataPayablePage });
