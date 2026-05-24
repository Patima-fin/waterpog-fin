/* page_debt_ledger.jsx — Debt Ledger · ดอกเบี้ย
   v3: debtMaster (contract) + debtLedger (monthly interest schedule)
   แสดงรายการสัญญา + สรุปดอกเบี้ยค้างจ่าย คลิกเข้าดูตารางเดือนได้
*/
'use strict';

const DL_CATEGORY_COLOR = {
  'WCI':       '#2a6fdb',
  'Non-WCI':   '#0d9488',
  'กรรมการ':    '#7c3aed',
  'LockWood':  '#0369a1',
  'Zigo':      '#b45309',
  'Employyim': '#be185d',
  'ลีซอิท':     '#c2410c',
  'STS':       '#15803d',
  'FS':        '#9d174d',
  'ธนาคาร':     '#475569',
  'อื่นๆ':       '#525252',
};

// Build per-contract interest summary by aggregating debtLedger rows
function buildInterestByContract(debtLedger) {
  const map = {};
  debtLedger.forEach(r => {
    const k = r.contractNo;
    if (!k) return;
    if (!map[k]) {
      map[k] = {
        contractNo: k,
        totalInterest: 0,
        outstandingInterest: 0,
        paidInterest: 0,
        unpaidMonths: 0,
        paidMonths: 0,
        firstYear: null,
        lastYear: null,
      };
    }
    const m = map[k];
    const amt = Number(r.interestAmount) || 0;
    m.totalInterest += amt;
    if (r.paymentDate) {
      m.paidInterest += amt;
      m.paidMonths += 1;
    } else {
      m.outstandingInterest += amt;
      m.unpaidMonths += 1;
    }
    const y = Number(r.year);
    if (y) {
      if (m.firstYear == null || y < m.firstYear) m.firstYear = y;
      if (m.lastYear  == null || y > m.lastYear)  m.lastYear  = y;
    }
  });
  return map;
}

function DebtLedgerRow({ master, summary, onOpen }) {
  const cat = master.debtCategory || 'อื่นๆ';
  const color = DL_CATEGORY_COLOR[cat] || '#525252';
  const isActive  = master.status === 'Active';
  const principal = Number(master.principalAmount) || 0;
  const rate      = Number(master.interestRate) || 0;
  const isUSD     = master.currency === 'USD';
  const s = summary || { totalInterest: 0, outstandingInterest: 0, paidInterest: 0, unpaidMonths: 0, paidMonths: 0 };
  return (
    <tr style={{ opacity: isActive ? 1 : 0.6, cursor: onOpen ? 'pointer' : 'default' }} onClick={() => onOpen && onOpen(master)}>
      <td>
        <Badge kind="b-blue" dot={false} style={{ background: color + '22', color }}>
          {cat}
        </Badge>
      </td>
      <td style={{ fontFamily: 'ui-monospace', fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={master.contractNo}>
        {master.contractNo || '—'}
      </td>
      <td style={{ fontSize: 12.5, fontWeight: 600 }}>{master.borrowerName || '—'}</td>
      <td>
        <Badge kind={isActive ? 'b-blue' : 'b-gray'} dot={false}>{isActive ? 'Active' : 'Close'}</Badge>
      </td>
      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 12.5, fontWeight: 600 }}>
        {fmtNum(principal, 0)} {isUSD && <span style={{ color: 'var(--ink-400)', fontSize: 10 }}>USD</span>}
      </td>
      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
        {rate > 0 ? (rate * 100).toFixed(2) + '%' : '—'}
      </td>
      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 12.5 }}>
        {fmtNum(s.totalInterest, 0)}
      </td>
      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 12.5, color: 'var(--good)' }}>
        {s.paidInterest > 0 ? fmtNum(s.paidInterest, 0) : '—'}
        {s.paidMonths > 0 && <div style={{ fontSize: 10, color: 'var(--ink-400)' }}>{s.paidMonths} เดือน</div>}
      </td>
      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 13,
                   color: s.outstandingInterest > 0 ? 'var(--bad)' : 'var(--ink-300)' }}>
        {fmtNum(s.outstandingInterest, 0)}
        {s.unpaidMonths > 0 && <div style={{ fontSize: 10, color: 'var(--ink-400)', fontWeight: 400 }}>{s.unpaidMonths} เดือน</div>}
      </td>
      <td style={{ fontSize: 11.5, color: 'var(--ink-500)' }}>
        {master.receiveDate ? fmtDate(master.receiveDate) : '—'}
      </td>
    </tr>
  );
}

// Monthly schedule popup ────────────────────────────────────────────────────
function InterestSchedulePopup({ master, ledgerRows, events, onClose }) {
  if (!master) return null;
  // Filter events for this contract (by contractId OR contractNo)
  const myEvents = (events || []).filter(e =>
    e.contractId === master.id || e.contractNo === master.contractNo
  ).sort((a, b) => (a.eventDate || '').localeCompare(b.eventDate || ''));
  const drawdownsExtra = myEvents.filter(e => e.eventType === 'drawdown');
  const repaymentsAll  = myEvents.filter(e => e.eventType === 'repayment');
  const principalIn  = (Number(master.principalAmount) || 0) + drawdownsExtra.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const principalOut = repaymentsAll.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const principalNet = principalIn - principalOut;
  const sortedRows = [...ledgerRows].sort((a, b) =>
    (Number(a.year) || 0) - (Number(b.year) || 0) ||
    (Number(a.month) || 0) - (Number(b.month) || 0)
  );
  const totalInterest    = sortedRows.reduce((s, r) => s + (Number(r.interestAmount) || 0), 0);
  const totalPaid        = sortedRows.filter(r => r.paymentDate).reduce((s, r) => s + (Number(r.interestAmount) || 0), 0);
  const outstanding      = totalInterest - totalPaid;
  const monthLabel = ['', 'ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 12, width: 'min(900px, 95vw)', maxHeight: '90vh',
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{master.borrowerName}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>
              {master.debtCategory} · {master.contractNo} ·
              วงเงิน {fmtNum(Number(master.principalAmount) || 0, 0)} {master.currency || 'THB'} ·
              ดอกเบี้ย {((Number(master.interestRate) || 0) * 100).toFixed(2)}%/ปี
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--ink-400)' }}>×</button>
        </div>

        <div style={{ padding: '12px 20px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, background: 'var(--brand-50, #f0f6ff)' }}>
          <div>
            <div style={{ fontSize: 10.5, color: 'var(--ink-400)' }}>เงินต้นรวม</div>
            <div style={{ fontWeight: 700, fontSize: 16, fontVariantNumeric: 'tabular-nums' }}>{fmtNum(principalIn, 0)}</div>
            {drawdownsExtra.length > 0 && <div style={{ fontSize: 10, color: 'var(--ink-400)' }}>+{drawdownsExtra.length} drawdown</div>}
          </div>
          <div>
            <div style={{ fontSize: 10.5, color: 'var(--ink-400)' }}>คืนเงินต้น</div>
            <div style={{ fontWeight: 700, fontSize: 16, fontVariantNumeric: 'tabular-nums', color: 'var(--good)' }}>{fmtNum(principalOut, 0)}</div>
            {repaymentsAll.length > 0 && <div style={{ fontSize: 10, color: 'var(--ink-400)' }}>{repaymentsAll.length} ครั้ง</div>}
          </div>
          <div>
            <div style={{ fontSize: 10.5, color: 'var(--ink-400)' }}>ดอกเบี้ยรวม</div>
            <div style={{ fontWeight: 700, fontSize: 16, fontVariantNumeric: 'tabular-nums' }}>{fmtNum(totalInterest, 0)}</div>
            <div style={{ fontSize: 10, color: 'var(--good)' }}>จ่ายแล้ว {fmtNum(totalPaid, 0)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10.5, color: 'var(--ink-400)' }}>ดอกเบี้ยค้างจ่าย</div>
            <div style={{ fontWeight: 700, fontSize: 18, fontVariantNumeric: 'tabular-nums',
                          color: outstanding > 0 ? 'var(--bad)' : 'var(--ink-300)' }}>
              {fmtNum(outstanding, 0)}
            </div>
          </div>
        </div>

        {myEvents.length > 0 && (
          <div style={{ padding: '8px 20px 0', borderTop: '1px solid var(--line)' }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--ink-700)', marginBottom: 6 }}>
              📋 รายการรับ/คืนเงินกู้ ({myEvents.length} events)
            </div>
            <table className="tbl" style={{ width: '100%', fontSize: 11.5, marginBottom: 10 }}>
              <thead>
                <tr>
                  <th style={{ width: 90 }}>วันที่</th>
                  <th style={{ width: 100 }}>ประเภท</th>
                  <th style={{ textAlign: 'right', width: 140 }}>จำนวนเงิน</th>
                  <th>หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                {myEvents.map(e => (
                  <tr key={e.id} style={{ background: e.eventType === 'repayment' ? '#f0fdf4' : '#fff7ed' }}>
                    <td>{fmtDate(e.eventDate)}</td>
                    <td>
                      <Badge kind={e.eventType === 'repayment' ? 'b-green' : 'b-amber'} dot={false}>
                        {e.eventType === 'repayment' ? 'คืนเงิน' : 'รับเงินกู้'}
                      </Badge>
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600,
                                 color: e.eventType === 'repayment' ? 'var(--good)' : '#9a3412' }}>
                      {e.eventType === 'repayment' ? '−' : '+'}{fmtNum(Number(e.amount), 0)}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--ink-500)' }}>{e.note || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ overflow: 'auto', flex: 1 }}>
          <table className="tbl" style={{ width: '100%', fontSize: 12 }}>
            <thead style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
              <tr>
                <th style={{ width: 90 }}>เดือน</th>
                <th style={{ textAlign: 'right', width: 110 }}>เงินต้น</th>
                <th style={{ textAlign: 'right', width: 60 }}>อัตรา</th>
                <th style={{ textAlign: 'right', width: 50 }}>วัน</th>
                <th style={{ textAlign: 'right', width: 110 }}>ดอกเบี้ย</th>
                <th style={{ textAlign: 'right', width: 110 }}>คงเหลือ</th>
                <th style={{ width: 100 }}>วันจ่าย</th>
                <th>หมายเหตุ</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 36, color: 'var(--ink-400)' }}>ไม่มีข้อมูลตารางดอกเบี้ย</td></tr>
              )}
              {sortedRows.map(r => {
                const isPaid = !!r.paymentDate;
                return (
                  <tr key={r.id} style={{ background: isPaid ? '#f0fdf4' : undefined }}>
                    <td style={{ fontWeight: 600 }}>{monthLabel[Number(r.month)] || r.month} {r.year}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtNum(Number(r.principal) || 0, 0)}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 11 }}>
                      {Number(r.interestRate) ? (Number(r.interestRate) * 100).toFixed(2) + '%' : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.days || '—'}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmtNum(Number(r.interestAmount) || 0, 2)}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtNum(Number(r.outstanding) || 0, 0)}</td>
                    <td style={{ fontSize: 11, color: isPaid ? 'var(--good)' : 'var(--bad)' }}>
                      {isPaid ? fmtDate(r.paymentDate) : <span style={{ fontWeight: 600 }}>ค้าง</span>}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--ink-500)' }}>{r.note || ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function DebtLedgerPage({ data }) {
  const masters    = data?.debtMaster || [];
  const allLedger  = data?.debtLedger || [];
  const allEvents  = data?.debtEvents || [];
  const today      = new Date().toISOString().slice(0, 10);

  const summaryByContract = React.useMemo(() => buildInterestByContract(allLedger), [allLedger]);

  const [tab, setTab]                 = React.useState('Active');  // all | Active | Close
  const [categoryFilter, setCategoryFilter] = React.useState('all');
  const [query, setQuery]             = React.useState('');
  const [selectedMaster, setSelectedMaster] = React.useState(null);

  const categoriesPresent = [...new Set(masters.map(m => m.debtCategory).filter(Boolean))];

  // ── KPIs (only Active contracts) ──────────────────────────────────────────
  const activeMasters = masters.filter(m => m.status === 'Active');
  let totalOutstanding = 0, totalPaid = 0, totalInterest = 0;
  activeMasters.forEach(m => {
    const s = summaryByContract[m.contractNo];
    if (!s) return;
    totalOutstanding += s.outstandingInterest;
    totalPaid        += s.paidInterest;
    totalInterest    += s.totalInterest;
  });

  const filtered = React.useMemo(() => {
    let rows = masters;
    if (tab !== 'all')             rows = rows.filter(m => m.status === tab);
    if (categoryFilter !== 'all')  rows = rows.filter(m => m.debtCategory === categoryFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      rows = rows.filter(m =>
        (m.contractNo   || '').toLowerCase().includes(q) ||
        (m.borrowerName || '').toLowerCase().includes(q)
      );
    }
    return rows;
  }, [masters, tab, categoryFilter, query]);

  // Sort by outstanding interest desc
  const sortedRows = React.useMemo(() => {
    return [...filtered].sort((a, b) => {
      const sa = (summaryByContract[a.contractNo] || {}).outstandingInterest || 0;
      const sb = (summaryByContract[b.contractNo] || {}).outstandingInterest || 0;
      return sb - sa;
    });
  }, [filtered, summaryByContract]);

  // Ledger rows for selected contract
  const selectedLedger = React.useMemo(() => {
    if (!selectedMaster) return [];
    return allLedger.filter(r => r.contractNo === selectedMaster.contractNo);
  }, [selectedMaster, allLedger]);

  return (
    <div className="page">
      <div className="page-head anim-in">
        <div>
          <h1 className="page-title">Debt Ledger · ดอกเบี้ย</h1>
          <div className="page-sub">
            ณ {fmtDate(today)} · {masters.length} สัญญา · Active {activeMasters.length} · ตารางดอกเบี้ย {allLedger.length} แถว
          </div>
        </div>
      </div>

      <div className="grid grid-4 anim-stagger" style={{ marginBottom: 16 }}>
        <KpiTile animate={false} label="ดอกเบี้ยค้างชำระ"       value={totalOutstanding}          accent="var(--bad)"            icon="money" />
        <KpiTile animate={false} label="ดอกเบี้ยชำระแล้ว"       value={totalPaid}                 accent="var(--good)"           icon="coin" />
        <KpiTile animate={false} label="ดอกเบี้ยรวม (คำนวณ)"    value={totalInterest}             accent="oklch(52% 0.16 145)"   icon="arrow_up" />
        <KpiTile animate={false} label="สัญญา Active"            value={activeMasters.length}      accent="var(--brand-500)"      icon="bank" unit=" สัญญา" digits={0} />
      </div>

      <div className="card" style={{ padding: '10px 14px', marginBottom: 12, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="tabnav" style={{ flex: 'none' }}>
          <button className={tab === 'Active' ? 'active' : ''} onClick={() => setTab('Active')}>Active ({masters.filter(m => m.status==='Active').length})</button>
          <button className={tab === 'Close'  ? 'active' : ''} onClick={() => setTab('Close')}>ปิดแล้ว ({masters.filter(m => m.status!=='Active').length})</button>
          <button className={tab === 'all'    ? 'active' : ''} onClick={() => setTab('all')}>ทั้งหมด ({masters.length})</button>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 'none' }}>
          <button onClick={() => setCategoryFilter('all')}
            style={{
              padding: '4px 12px', borderRadius: 20, border: '1.5px solid', fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
              borderColor: categoryFilter === 'all' ? 'var(--brand-500)' : 'var(--line)',
              background:  categoryFilter === 'all' ? 'var(--brand-50, #f0f6ff)' : '#fff',
              color:       categoryFilter === 'all' ? 'var(--brand-700)' : 'var(--ink-500)',
            }}>ทุกหมวด</button>
          {categoriesPresent.map(cat => {
            const isSelected = categoryFilter === cat;
            const color = DL_CATEGORY_COLOR[cat] || '#525252';
            return (
              <button key={cat} onClick={() => setCategoryFilter(cat)}
                style={{
                  padding: '4px 12px', borderRadius: 20, border: '1.5px solid', fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                  borderColor: isSelected ? color : 'var(--line)',
                  background:  isSelected ? color + '11' : '#fff',
                  color:       isSelected ? color : 'var(--ink-500)',
                }}>{cat}</button>
            );
          })}
        </div>
        <div className="tb-search" style={{ width: 280, marginLeft: 'auto' }}>
          <Icon name="search" size={14} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="ค้นหา ผู้กู้ / สัญญา…" />
        </div>
      </div>

      {masters.length === 0 && (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
          <div style={{ fontWeight: 600, color: 'var(--ink-600)' }}>ยังไม่มีข้อมูล debtMaster</div>
        </div>
      )}

      {masters.length > 0 && (
        <div className="card anim-in" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'min(480px, calc(100vh - 400px))' }}>
            <table className="tbl" style={{ minWidth: 1200 }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 3, background: 'var(--surface)' }}>
                <tr>
                  <th style={{ width: 100 }}>หมวดหนี้</th>
                  <th style={{ width: 150 }}>เลขที่สัญญา</th>
                  <th>ผู้กู้ / ผู้รับสินเชื่อ</th>
                  <th style={{ width: 80 }}>สถานะ</th>
                  <th style={{ textAlign: 'right', width: 120 }}>วงเงิน (฿)</th>
                  <th style={{ textAlign: 'right', width: 70 }}>อัตราดอกเบี้ย</th>
                  <th style={{ textAlign: 'right', width: 120 }}>ดอกเบี้ยรวม (฿)</th>
                  <th style={{ textAlign: 'right', width: 120 }}>ชำระแล้ว (฿)</th>
                  <th style={{ textAlign: 'right', width: 120 }}>ค้างชำระ (฿)</th>
                  <th style={{ width: 100 }}>วันเริ่มสัญญา</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.length === 0 && (
                  <tr><td colSpan={10} style={{ textAlign: 'center', padding: 36, color: 'var(--ink-400)' }}>ไม่พบข้อมูลที่ตรงกับเงื่อนไข</td></tr>
                )}
                {sortedRows.map(m => (
                  <DebtLedgerRow
                    key={m.id || m.contractNo}
                    master={m}
                    summary={summaryByContract[m.contractNo]}
                    onOpen={setSelectedMaster}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <InterestSchedulePopup master={selectedMaster} ledgerRows={selectedLedger} events={allEvents} onClose={() => setSelectedMaster(null)} />
    </div>
  );
}
