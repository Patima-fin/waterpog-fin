/* page_bank_diary.jsx — Bank Diary + Inter-account Transfers */
'use strict';

const _ACCENT = { blue:'var(--brand-500)', orange:'oklch(60% 0.18 55)', yellow:'oklch(65% 0.18 75)', teal:'oklch(52% 0.16 185)', red:'var(--bad,#e53e3e)', green:'oklch(50% 0.18 145)' };
const BDStatTile = ({ label, value, sub, color = 'blue' }) => (
  <div className="kpi">
    <div className="kpi-accent" style={{ background: _ACCENT[color] || _ACCENT.blue }} />
    <div className="kpi-label">{label}</div>
    <div className="kpi-value" style={{ fontSize: 18 }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color:'var(--ink-400,#8a94a6)', marginTop: 2 }}>{sub}</div>}
  </div>
);

/* ── Add Transfer Modal ──────────────────────────────────────────────── */
function AddTransferModal({ bankAccounts, onSave, onClose }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = React.useState({
    fromAccountNo: '',
    toAccountNo: '',
    amount: '',
    date: today,
    ref: '',
    note: '',
  });
  const [err, setErr] = React.useState('');

  const setF = (k, v) => { setErr(''); setForm(prev => ({ ...prev, [k]: v })); };

  const handleSave = () => {
    if (!form.fromAccountNo)                          return setErr('กรุณาเลือกบัญชีต้นทาง');
    if (!form.toAccountNo)                            return setErr('กรุณาเลือกบัญชีปลายทาง');
    if (form.fromAccountNo === form.toAccountNo)      return setErr('บัญชีต้นทางและปลายทางต้องไม่ใช่บัญชีเดียวกัน');
    const amt = parseFloat(form.amount);
    if (!amt || amt <= 0)                             return setErr('กรุณาระบุจำนวนเงินที่ถูกต้อง');
    if (!form.date)                                   return setErr('กรุณาเลือกวันที่');

    const ref      = form.ref.trim() || `TRF-${Date.now()}`;
    const fromAcct = bankAccounts.find(a => a.accountNo === form.fromAccountNo);
    const toAcct   = bankAccounts.find(a => a.accountNo === form.toAccountNo);
    const noteText = form.note.trim();

    const ts = Date.now();
    const outEntry = {
      id:          `be-${ts}-out`,
      accountNo:   form.fromAccountNo,
      bankName:    fromAcct?.bankName || '',
      entryDate:   form.date,
      entryType:   'outflow_transfer',
      amount:      -amt,
      description: noteText || `โอนเงินไป ${toAcct?.bankName || ''} ${form.toAccountNo}`,
      transferRef: ref,
      reconciled:  false,
    };
    const inEntry = {
      id:          `be-${ts}-in`,
      accountNo:   form.toAccountNo,
      bankName:    toAcct?.bankName || '',
      entryDate:   form.date,
      entryType:   'inflow_transfer',
      amount:      amt,
      description: noteText || `รับโอนจาก ${fromAcct?.bankName || ''} ${form.fromAccountNo}`,
      transferRef: ref,
      reconciled:  false,
    };
    onSave([outEntry, inEntry]);
  };

  const inp = { width:'100%', padding:'8px 11px', boxSizing:'border-box', border:'1.5px solid #e2e8f0', borderRadius:8, fontSize:13, fontFamily:'inherit', outline:'none' };
  const sel = { ...inp, background:'#fff' };
  const lbl = { fontSize:12, fontWeight:600, color:'#475569', marginBottom:4, display:'block' };

  const acctOpts = bankAccounts.map(a => (
    <option key={a.accountNo} value={a.accountNo}>{a.bankName} — {a.accountNo}</option>
  ));

  return (
    <Modal open={true} title="บันทึกการโอนเงินระหว่างบัญชี" onClose={onClose} maxWidth={500}>
      {/* Arrow diagram */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16, padding:'10px 14px', background:'#f8fafc', borderRadius:10, border:'1px solid #e2e8f0' }}>
        <div style={{ flex:1, textAlign:'center' }}>
          <div style={{ fontSize:11, color:'#718096', marginBottom:3 }}>โอนออกจาก</div>
          <div style={{ fontWeight:700, fontSize:13, color:'#c53030' }}>
            {form.fromAccountNo ? (bankAccounts.find(a=>a.accountNo===form.fromAccountNo)?.bankName || form.fromAccountNo) : '—'}
          </div>
        </div>
        <div style={{ fontSize:22, color:'#805ad5', fontWeight:300 }}>→</div>
        <div style={{ flex:1, textAlign:'center' }}>
          <div style={{ fontSize:11, color:'#718096', marginBottom:3 }}>โอนเข้า</div>
          <div style={{ fontWeight:700, fontSize:13, color:'#276749' }}>
            {form.toAccountNo ? (bankAccounts.find(a=>a.accountNo===form.toAccountNo)?.bankName || form.toAccountNo) : '—'}
          </div>
        </div>
        {form.amount && <div style={{ marginLeft:8, fontSize:14, fontWeight:700, color:'#1a202c', whiteSpace:'nowrap' }}>{fmtMoney(parseFloat(form.amount)||0)}</div>}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px 16px' }}>
        <div style={{ gridColumn:'1/-1' }}>
          <label style={lbl}>บัญชีต้นทาง (โอนออก) *</label>
          <select style={sel} value={form.fromAccountNo} onChange={e => setF('fromAccountNo', e.target.value)}>
            <option value="">— เลือกบัญชีต้นทาง —</option>
            {acctOpts}
          </select>
        </div>
        <div style={{ gridColumn:'1/-1' }}>
          <label style={lbl}>บัญชีปลายทาง (รับโอน) *</label>
          <select style={sel} value={form.toAccountNo} onChange={e => setF('toAccountNo', e.target.value)}>
            <option value="">— เลือกบัญชีปลายทาง —</option>
            {acctOpts}
          </select>
        </div>
        <div>
          <label style={lbl}>จำนวนเงิน (บาท) *</label>
          <input type="number" style={inp} value={form.amount} min="0" step="0.01"
            onChange={e => setF('amount', e.target.value)} placeholder="0.00" />
        </div>
        <div>
          <label style={lbl}>วันที่โอน *</label>
          <input type="date" style={inp} value={form.date}
            onChange={e => setF('date', e.target.value)} />
        </div>
        <div style={{ gridColumn:'1/-1' }}>
          <label style={lbl}>เลขที่อ้างอิง <span style={{ fontWeight:400, color:'#94a3b8' }}>(ไม่บังคับ — ระบบสร้างให้อัตโนมัติ)</span></label>
          <input type="text" style={inp} value={form.ref}
            onChange={e => setF('ref', e.target.value)} placeholder="เช่น TRF-2026-001" />
        </div>
        <div style={{ gridColumn:'1/-1' }}>
          <label style={lbl}>หมายเหตุ</label>
          <input type="text" style={inp} value={form.note}
            onChange={e => setF('note', e.target.value)} placeholder="รายละเอียดการโอน" />
        </div>
      </div>

      {err && (
        <div style={{ marginTop:10, padding:'8px 12px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:7, fontSize:12, color:'#dc2626' }}>
          ⚠ {err}
        </div>
      )}

      <div style={{ marginTop:18, display:'flex', gap:10, justifyContent:'flex-end' }}>
        <button className="btn-ghost" onClick={onClose}>ยกเลิก</button>
        <button className="btn-primary" onClick={handleSave}>
          บันทึกการโอน
        </button>
      </div>
    </Modal>
  );
}

/* ── Reconcile Panel ─────────────────────────────────────────────────── */
function ReconcilePanel({ transferPairs, bankAccounts, onReconcile }) {
  const acctMap = React.useMemo(() => {
    const m = {};
    bankAccounts.forEach(a => { m[a.accountNo] = a; });
    return m;
  }, [bankAccounts]);

  const pairs = Object.entries(transferPairs);
  if (pairs.length === 0) return null;

  const pendingCount = pairs.filter(([, entries]) => entries.some(e => !e.reconciled)).length;

  return (
    <div className="card" style={{ marginBottom:20, padding:0, overflow:'hidden' }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px', background:'linear-gradient(135deg,#faf5ff,#ede9fe)', borderBottom:'1px solid #d6bcfa' }}>
        <div>
          <div style={{ fontWeight:700, fontSize:14, color:'#44337a' }}>⇄ ตรวจสอบการโอนเงินระหว่างบัญชี</div>
          <div style={{ fontSize:12, color:'#6b46c1', marginTop:2 }}>
            {pairs.length} คู่โอนทั้งหมด
            {pendingCount > 0 && ` · ${pendingCount} รายการรอยืนยัน`}
          </div>
        </div>
        {pendingCount > 0 && (
          <span style={{ background:'#fed7d7', color:'#c53030', fontSize:11, fontWeight:700, borderRadius:20, padding:'4px 12px' }}>
            ⚠ {pendingCount} รอ Reconcile
          </span>
        )}
        {pendingCount === 0 && pairs.length > 0 && (
          <span style={{ background:'#c6f6d5', color:'#276749', fontSize:11, fontWeight:700, borderRadius:20, padding:'4px 12px' }}>
            ✓ ยืนยันครบทุกรายการ
          </span>
        )}
      </div>

      {/* Table */}
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead>
            <tr style={{ background:'#faf5ff' }}>
              {['วันที่', 'จากบัญชี', '', 'ไปบัญชี', 'จำนวนเงิน', 'เลขอ้างอิง', 'หมายเหตุ', 'สถานะ', ''].map((h, i) => (
                <th key={i} style={{ padding:'7px 10px', textAlign: h==='จำนวนเงิน' ? 'right' : 'left', fontWeight:600, color:'#6b46c1', borderBottom:'1px solid #e9d8fd', whiteSpace:'nowrap', fontSize:11 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pairs.map(([ref, entries]) => {
              const outEntry    = entries.find(e => e.entryType === 'outflow_transfer');
              const inEntry     = entries.find(e => e.entryType === 'inflow_transfer');
              const isReconciled= entries.every(e => e.reconciled);
              const date        = outEntry?.entryDate || inEntry?.entryDate || '';
              const fromAcct    = acctMap[outEntry?.accountNo];
              const toAcct      = acctMap[inEntry?.accountNo];
              const amount      = Math.abs(parseFloat(outEntry?.amount || inEntry?.amount || 0));

              return (
                <tr key={ref} style={{ borderBottom:'1px solid #f0f4f8', background: isReconciled ? '#f0fff4' : 'transparent' }}>
                  <td style={{ padding:'8px 10px', whiteSpace:'nowrap', color:'#4a5568', fontSize:11 }}>{fmtDate(date)}</td>
                  <td style={{ padding:'8px 10px' }}>
                    <div style={{ fontWeight:600, color:'#c53030', fontSize:12 }}>{fromAcct?.bankName || outEntry?.bankName || '—'}</div>
                    <div style={{ fontSize:10, color:'#718096' }}>{outEntry?.accountNo || '—'}</div>
                  </td>
                  <td style={{ padding:'8px 4px', textAlign:'center', fontSize:18, color:'#805ad5' }}>→</td>
                  <td style={{ padding:'8px 10px' }}>
                    <div style={{ fontWeight:600, color:'#276749', fontSize:12 }}>{toAcct?.bankName || inEntry?.bankName || '—'}</div>
                    <div style={{ fontSize:10, color:'#718096' }}>{inEntry?.accountNo || '—'}</div>
                  </td>
                  <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:700, fontVariantNumeric:'tabular-nums', whiteSpace:'nowrap', color:'#1a202c' }}>
                    {fmtMoney(amount)}
                  </td>
                  <td style={{ padding:'8px 10px', fontSize:11, color:'#805ad5' }}>{ref}</td>
                  <td style={{ padding:'8px 10px', color:'#4a5568', maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {outEntry?.description || inEntry?.description || '—'}
                  </td>
                  <td style={{ padding:'8px 10px', whiteSpace:'nowrap' }}>
                    {isReconciled
                      ? <span style={{ background:'#c6f6d5', color:'#276749', fontSize:11, fontWeight:600, borderRadius:12, padding:'2px 9px' }}>✓ ยืนยันแล้ว</span>
                      : <span style={{ background:'#feebc8', color:'#b45309', fontSize:11, fontWeight:600, borderRadius:12, padding:'2px 9px' }}>รอยืนยัน</span>
                    }
                  </td>
                  <td style={{ padding:'8px 10px' }}>
                    {!isReconciled && (
                      <button
                        onClick={() => onReconcile(ref)}
                        style={{ background:'#6b46c1', color:'#fff', border:'none', borderRadius:6, padding:'4px 12px', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}
                      >
                        ยืนยัน
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────────────────────── */
const BankDiaryPage = ({ data: propData, setData, toast }) => {
  const { bankAccounts = [], bankEntries = [] } = propData || WTPData.load();
  const today = new Date().toISOString().slice(0, 10);

  const [showAddTransfer, setShowAddTransfer] = React.useState(false);

  const ENTRY_TYPE_LABEL = {
    inflow_project:        'รับเงินโครงการ',
    inflow_loan:           'เบิกสินเชื่อ',
    inflow_transfer:       'รับโอนจากบัญชีอื่น',
    inflow_misc:           'รับเงินอื่นๆ',
    outflow_check:         'จ่ายเช็ค',
    outflow_transfer:      'โอนออกไปบัญชีอื่น',
    outflow_loan_interest: 'ชำระดอกเบี้ย',
    outflow_salary:        'จ่ายเงินเดือน',
    outflow_proj:          'ค่าใช้จ่ายโครงการ',
    outflow_misc:          'เบ็ดเตล็ด',
  };

  /* Group entries by accountNo */
  const entriesByAccount = React.useMemo(() => {
    const map = {};
    bankEntries.forEach(e => {
      if (!map[e.accountNo]) map[e.accountNo] = [];
      map[e.accountNo].push(e);
    });
    Object.values(map).forEach(arr => arr.sort((a, b) => a.entryDate > b.entryDate ? 1 : -1));
    return map;
  }, [bankEntries]);

  /* Pair up transfer entries by transferRef */
  const transferPairs = React.useMemo(() => {
    const pairs = {};
    bankEntries.forEach(e => {
      if (!e.transferRef) return;
      if (!pairs[e.transferRef]) pairs[e.transferRef] = [];
      pairs[e.transferRef].push(e);
    });
    return pairs;
  }, [bankEntries]);

  const [expandedAcct, setExpandedAcct] = React.useState({});
  const toggleAcct = (acctNo) => setExpandedAcct(prev => ({ ...prev, [acctNo]: !prev[acctNo] }));

  /* Compute projected balance for each account */
  const projectedBalance = (acct) => {
    const entries = entriesByAccount[acct.accountNo] || [];
    const futureOnly = entries.filter(e => e.entryDate >= today);
    const delta = futureOnly.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
    return (parseFloat(acct.balance) || 0) + delta;
  };

  /* Running balance for a single account */
  const runningBalances = (acct) => {
    const entries = entriesByAccount[acct.accountNo] || [];
    let bal = parseFloat(acct.balance) || 0;
    entries.filter(e => e.entryDate < today).forEach(e => { bal -= (parseFloat(e.amount)||0); });
    const rows = [];
    let running = bal;
    entries.forEach(e => {
      running += (parseFloat(e.amount)||0);
      rows.push({ ...e, runningBalance: running });
    });
    return rows;
  };

  /* Total cash across all accounts */
  const totalCurrent   = bankAccounts.reduce((s, a) => s + (parseFloat(a.balance)||0), 0);
  const totalProjected = bankAccounts.reduce((s, a) => s + projectedBalance(a), 0);
  const redAccounts    = bankAccounts.filter(a => projectedBalance(a) < 0).length;

  /* Add Transfer handler — creates 2 bankEntries atomically */
  const handleAddTransfer = (newEntries) => {
    if (setData) {
      setData(prev => ({ ...prev, bankEntries: [...(prev.bankEntries || []), ...newEntries] }));
      if (toast) toast('บันทึกการโอนเงินเรียบร้อย');
    }
    setShowAddTransfer(false);
  };

  /* Reconcile handler — marks both legs of a pair as reconciled */
  const handleReconcile = (ref) => {
    if (!setData) return;
    setData(prev => ({
      ...prev,
      bankEntries: (prev.bankEntries || []).map(e =>
        e.transferRef === ref ? { ...e, reconciled: true } : e
      ),
    }));
    if (toast) toast(`Reconcile ${ref} เรียบร้อย ✓`);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-title">Bank Diary</div>
          <div className="page-sub">แผนเงินรับ-จ่ายล่วงหน้าแยกตามบัญชี • ณ {fmtDate(today)}</div>
        </div>
        <button
          className="btn-primary"
          onClick={() => setShowAddTransfer(true)}
          style={{ display:'flex', alignItems:'center', gap:7 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
          บันทึกการโอน
        </button>
      </div>

      {/* Top KPIs */}
      <div className="grid grid-4" style={{ marginBottom:16 }}>
        <BDStatTile label="ยอดเงินปัจจุบันรวม"    value={fmtMoney(totalCurrent)}   sub={`${bankAccounts.length} บัญชี`} color="blue" />
        <BDStatTile label="ยอดเงินประมาณการรวม"    value={fmtMoney(totalProjected)} sub="หลังรายการที่วางแผน" color={totalProjected < 0 ? 'red' : 'teal'} />
        <BDStatTile label="บัญชีติดลบ (คาดการณ์)"  value={redAccounts}              sub="ต้องเพิ่มเงิน" color={redAccounts > 0 ? 'red' : 'green'} />
        <BDStatTile label="รายการโอนระหว่างบัญชี"  value={Object.keys(transferPairs).length} sub="คู่โอน" color="orange" />
      </div>

      {/* Reconcile Panel — shows all transfer pairs */}
      <ReconcilePanel
        transferPairs={transferPairs}
        bankAccounts={bankAccounts}
        onReconcile={handleReconcile}
      />

      {/* Account Cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(340px, 1fr))', gap:14, marginBottom:20 }}>
        {bankAccounts.map(acct => {
          const entries    = runningBalances(acct);
          const projected  = projectedBalance(acct);
          const isNegative = projected < 0;
          const isExpanded = expandedAcct[acct.accountNo] !== false; // default expanded

          return (
            <div key={acct.id} className="card" style={{
              padding:0, overflow:'hidden',
              border: isNegative ? '2px solid #fc8181' : '1px solid #e2e8f0',
              boxShadow: isNegative ? '0 0 0 3px rgba(252,129,129,0.15)' : undefined
            }}>
              {/* Card header */}
              <div style={{
                background: isNegative ? 'linear-gradient(135deg,#fff5f5,#fed7d7)' : 'linear-gradient(135deg,#ebf8ff,#dbeafe)',
                padding:'12px 16px', cursor:'pointer',
                display:'flex', justifyContent:'space-between', alignItems:'flex-start'
              }} onClick={() => toggleAcct(acct.accountNo)}>
                <div>
                  <div style={{ fontWeight:700, fontSize:14, color:'#1a202c' }}>
                    {acct.bankName}
                    {isNegative && <span style={{ marginLeft:8, fontSize:11, background:'#e53e3e', color:'#fff', borderRadius:4, padding:'1px 6px' }}>⚠ ติดลบ</span>}
                  </div>
                  <div style={{ fontSize:12, color:'#4a5568', marginTop:2 }}>{acct.accountNo}</div>
                  <div style={{ fontSize:11, color:'#718096' }}>{acct.accountName || acct.note}</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:11, color:'#718096' }}>ยอดปัจจุบัน</div>
                  <div style={{ fontWeight:700, fontSize:15, color: parseFloat(acct.balance) < 0 ? '#e53e3e' : '#2d3748' }}>
                    {fmtMoney(acct.balance)}
                  </div>
                  <div style={{ fontSize:11, color:'#718096', marginTop:4 }}>ประมาณการ</div>
                  <div style={{ fontWeight:700, fontSize:15, color: isNegative ? '#e53e3e' : '#276749' }}>
                    {fmtMoney(projected)}
                  </div>
                </div>
              </div>

              {/* Entries list */}
              {isExpanded && (
                <div style={{ padding:'8px 0' }}>
                  {entries.length === 0 && (
                    <div style={{ textAlign:'center', color:'#a0aec0', fontSize:12, padding:'12px 0' }}>ไม่มีรายการ</div>
                  )}
                  {entries.map((e, i) => {
                    const isInflow   = (parseFloat(e.amount)||0) > 0;
                    const isPast     = e.entryDate < today;
                    const isTransfer = e.entryType === 'inflow_transfer' || e.entryType === 'outflow_transfer';
                    const isRecon    = !!e.reconciled;
                    return (
                      <div key={e.id || i} style={{
                        display:'grid', gridTemplateColumns:'70px 1fr auto auto',
                        gap:'4px 8px', padding:'5px 14px',
                        background: isPast ? '#fafafa' : 'transparent',
                        borderBottom:'1px solid #f0f4f8',
                        opacity: isPast ? 0.6 : 1,
                        alignItems:'start'
                      }}>
                        <div style={{ fontSize:11, color:'#718096', paddingTop:1 }}>
                          {fmtDate(e.entryDate)}
                        </div>
                        <div>
                          <div style={{ fontSize:12, fontWeight: isTransfer ? 600 : 400 }}>
                            {isTransfer && <span style={{ color:'#805ad5', marginRight:4 }}>⇄</span>}
                            {ENTRY_TYPE_LABEL[e.entryType] || e.entryType}
                            {isRecon && <span style={{ marginLeft:6, fontSize:10, background:'#c6f6d5', color:'#276749', borderRadius:3, padding:'1px 5px' }}>✓</span>}
                          </div>
                          <div style={{ fontSize:11, color:'#718096' }}>{e.description}</div>
                          {e.transferRef && <div style={{ fontSize:10, color:'#805ad5' }}>{e.transferRef}</div>}
                        </div>
                        <div style={{
                          textAlign:'right', fontWeight:600, fontSize:12,
                          color: isInflow ? '#276749' : '#c53030',
                          fontVariantNumeric:'tabular-nums', whiteSpace:'nowrap'
                        }}>
                          {isInflow ? '+' : ''}{fmtMoney(e.amount)}
                        </div>
                        <div style={{
                          textAlign:'right', fontSize:11,
                          color: e.runningBalance < 0 ? '#e53e3e' : '#4a5568',
                          fontVariantNumeric:'tabular-nums', whiteSpace:'nowrap'
                        }}>
                          {fmtMoney(e.runningBalance)}
                        </div>
                      </div>
                    );
                  })}
                  {/* Final projected balance bar */}
                  <div style={{
                    display:'flex', justifyContent:'space-between', padding:'8px 14px',
                    background: isNegative ? '#fff5f5' : '#f0fdf4',
                    borderTop:'2px solid ' + (isNegative ? '#fc8181' : '#68d391'),
                    fontWeight:700, fontSize:13
                  }}>
                    <span>ยอดประมาณการสุดท้าย</span>
                    <span style={{ color: isNegative ? '#e53e3e' : '#276749' }}>{fmtMoney(projected)}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Transfer Modal */}
      {showAddTransfer && (
        <AddTransferModal
          bankAccounts={bankAccounts}
          onSave={handleAddTransfer}
          onClose={() => setShowAddTransfer(false)}
        />
      )}
    </div>
  );
};
