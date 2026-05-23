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

const BankDiaryPage = () => {
  const { bankAccounts = [], bankEntries = [] } = WTPData.load();
  const today = new Date().toISOString().slice(0, 10);

  const ENTRY_TYPE_LABEL = {
    inflow_project:       'รับเงินโครงการ',
    inflow_loan:          'เบิกสินเชื่อ',
    inflow_transfer:      'รับโอนจากบัญชีอื่น',
    inflow_misc:          'รับเงินอื่นๆ',
    outflow_check:        'จ่ายเช็ค',
    outflow_transfer:     'โอนออกไปบัญชีอื่น',
    outflow_loan_interest:'ชำระดอกเบี้ย',
    outflow_salary:       'จ่ายเงินเดือน',
    outflow_proj:         'ค่าใช้จ่ายโครงการ',
    outflow_misc:         'เบ็ดเตล็ด',
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
    /* subtract past entries to get starting balance before listed entries */
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

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-title">Bank Diary</div>
          <div className="page-sub">แผนเงินรับ-จ่ายล่วงหน้าแยกตามบัญชี • ณ {fmtDate(today)}</div>
        </div>
      </div>

      {/* Top KPIs */}
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <BDStatTile label="ยอดเงินปัจจุบันรวม"   value={fmtMoney(totalCurrent)}   sub={`${bankAccounts.length} บัญชี`} color="blue" />
        <BDStatTile label="ยอดเงินประมาณการรวม"   value={fmtMoney(totalProjected)} sub="หลังรายการที่วางแผน" color={totalProjected < 0 ? 'red' : 'teal'} />
        <BDStatTile label="บัญชีติดลบ (คาดการณ์)" value={redAccounts}              sub="ต้องเพิ่มเงิน" color={redAccounts > 0 ? 'red' : 'green'} />
        <BDStatTile label="รายการโอนระหว่างบัญชี" value={Object.keys(transferPairs).length} sub="คู่โอน" color="orange" />
      </div>

      {/* Account Cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(340px, 1fr))', gap: 14, marginBottom: 20 }}>
        {bankAccounts.map(acct => {
          const entries    = runningBalances(acct);
          const projected  = projectedBalance(acct);
          const isNegative = projected < 0;
          const isExpanded = expandedAcct[acct.accountNo] !== false; // default expanded

          return (
            <div key={acct.id} className="card" style={{
              padding: 0, overflow:'hidden',
              border: isNegative ? '2px solid #fc8181' : '1px solid #e2e8f0',
              boxShadow: isNegative ? '0 0 0 3px rgba(252,129,129,0.15)' : undefined
            }}>
              {/* Card header */}
              <div style={{
                background: isNegative ? 'linear-gradient(135deg,#fff5f5,#fed7d7)' : 'linear-gradient(135deg,#ebf8ff,#dbeafe)',
                padding: '12px 16px', cursor:'pointer',
                display:'flex', justifyContent:'space-between', alignItems:'flex-start'
              }} onClick={() => toggleAcct(acct.accountNo)}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color:'#1a202c' }}>
                    {acct.bankName}
                    {isNegative && <span style={{ marginLeft: 8, fontSize: 11, background:'#e53e3e', color:'#fff', borderRadius: 4, padding:'1px 6px' }}>⚠ ติดลบ</span>}
                  </div>
                  <div style={{ fontSize: 12, color:'#4a5568', marginTop: 2 }}>{acct.accountNo}</div>
                  <div style={{ fontSize: 11, color:'#718096' }}>{acct.accountName || acct.note}</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize: 11, color:'#718096' }}>ยอดปัจจุบัน</div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: parseFloat(acct.balance) < 0 ? '#e53e3e' : '#2d3748' }}>
                    {fmtMoney(acct.balance)}
                  </div>
                  <div style={{ fontSize: 11, color:'#718096', marginTop: 4 }}>ประมาณการ</div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: isNegative ? '#e53e3e' : '#276749' }}>
                    {fmtMoney(projected)}
                  </div>
                </div>
              </div>

              {/* Entries list */}
              {isExpanded && (
                <div style={{ padding:'8px 0' }}>
                  {entries.length === 0 && (
                    <div style={{ textAlign:'center', color:'#a0aec0', fontSize: 12, padding:'12px 0' }}>ไม่มีรายการ</div>
                  )}
                  {entries.map((e, i) => {
                    const isInflow  = (parseFloat(e.amount)||0) > 0;
                    const isPast    = e.entryDate < today;
                    const isTransfer= e.entryType === 'inflow_transfer' || e.entryType === 'outflow_transfer';
                    return (
                      <div key={e.id || i} style={{
                        display:'grid', gridTemplateColumns:'70px 1fr auto auto',
                        gap: '4px 8px', padding:'5px 14px',
                        background: isPast ? '#fafafa' : 'transparent',
                        borderBottom:'1px solid #f0f4f8',
                        opacity: isPast ? 0.6 : 1,
                        alignItems:'start'
                      }}>
                        <div style={{ fontSize: 11, color:'#718096', paddingTop: 1 }}>
                          {fmtDate(e.entryDate)}
                        </div>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: isTransfer ? 600 : 400 }}>
                            {isTransfer && <span style={{ color:'#805ad5', marginRight: 4 }}>⇄</span>}
                            {ENTRY_TYPE_LABEL[e.entryType] || e.entryType}
                          </div>
                          <div style={{ fontSize: 11, color:'#718096' }}>{e.description}</div>
                          {e.transferRef && <div style={{ fontSize: 10, color:'#805ad5' }}>{e.transferRef}</div>}
                        </div>
                        <div style={{
                          textAlign:'right', fontWeight: 600, fontSize: 12,
                          color: isInflow ? '#276749' : '#c53030',
                          fontVariantNumeric:'tabular-nums', whiteSpace:'nowrap'
                        }}>
                          {isInflow ? '+' : ''}{fmtMoney(e.amount)}
                        </div>
                        <div style={{
                          textAlign:'right', fontSize: 11,
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
                    fontWeight: 700, fontSize: 13
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

      {/* Inter-account Transfers Section */}
      {Object.keys(transferPairs).length > 0 && (
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>
            การโอนเงินระหว่างบัญชี
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap: 10 }}>
            {Object.entries(transferPairs).map(([ref, entries]) => {
              const outEntry = entries.find(e => e.entryType === 'outflow_transfer');
              const inEntry  = entries.find(e => e.entryType === 'inflow_transfer');
              return (
                <div key={ref} style={{
                  display:'grid', gridTemplateColumns:'1fr auto 1fr',
                  gap: 12, alignItems:'center',
                  background:'#faf5ff', borderRadius: 8, padding:'10px 16px',
                  border:'1px solid #d6bcfa'
                }}>
                  {/* From */}
                  <div>
                    <div style={{ fontSize: 11, color:'#805ad5', marginBottom: 2 }}>โอนออกจาก</div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      {outEntry ? `${outEntry.bankName} ${outEntry.accountNo}` : '—'}
                    </div>
                    <div style={{ fontSize: 11, color:'#c53030', fontVariantNumeric:'tabular-nums' }}>
                      {outEntry ? fmtMoney(outEntry.amount) : ''}
                    </div>
                    <div style={{ fontSize: 11, color:'#718096' }}>{outEntry ? fmtDate(outEntry.entryDate) : ''}</div>
                  </div>
                  {/* Arrow */}
                  <div style={{ textAlign:'center', fontSize: 20, color:'#805ad5' }}>→</div>
                  {/* To */}
                  <div>
                    <div style={{ fontSize: 11, color:'#805ad5', marginBottom: 2 }}>โอนเข้า</div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      {inEntry ? `${inEntry.bankName} ${inEntry.accountNo}` : '—'}
                    </div>
                    <div style={{ fontSize: 11, color:'#276749', fontVariantNumeric:'tabular-nums' }}>
                      {inEntry ? fmtMoney(inEntry.amount) : ''}
                    </div>
                    <div style={{ fontSize: 11, color:'#718096' }}>{inEntry ? fmtDate(inEntry.entryDate) : ''}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
