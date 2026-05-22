// Daily Revenue Dashboard — สรุปรายงานรับเงินประจำวัน
// ดึงข้อมูลจาก invoices โดยตรง: status=paid + actualReceive.date

const { useState: dRState, useMemo: dRMemo } = React;

function DailyRevenueDashboard({ data, setData, toast }) {
  const { invoices, meta } = data;

  // ใช้วันที่จริงของระบบเสมอ
  const todayStr   = new Date().toISOString().slice(0, 10);
  const thisMonth  = todayStr.slice(0, 7);
  const thisYear   = todayStr.slice(0, 4);
  const todayLabel = new Date(todayStr + 'T00:00:00').toLocaleDateString('th-TH-u-ca-gregory', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  const [drillModal, setDrillModal] = dRState(null); // { title, list }

  const { projectByCode } = dRMemo(() => WTPData.buildLookups(data), [data.projects, data.projectFinance]);

  // เฉพาะ paid ที่มี actualReceive.date
  const paidInvoices = dRMemo(() =>
    invoices.filter(iv => iv.status === 'paid' && iv.actualReceive?.date),
    [invoices]
  );

  const todayList = dRMemo(() => paidInvoices.filter(iv => iv.actualReceive.date === todayStr),    [paidInvoices, todayStr]);
  const monthList = dRMemo(() => paidInvoices.filter(iv => iv.actualReceive.date.startsWith(thisMonth)), [paidInvoices, thisMonth]);
  const ytdList   = dRMemo(() => paidInvoices.filter(iv => iv.actualReceive.date.startsWith(thisYear)),  [paidInvoices, thisYear]);

  const sumBal = list => list.reduce((s, iv) => s + (iv.balance || 0), 0);

  return (
    <div className="page bg-pattern">
      <div className="page-head anim-in">
        <div>
          <h1 className="page-title">สรุปรายงานรับเงินประจำวัน</h1>
          <div className="page-sub">Daily Revenue Report · ข้อมูล ณ {todayLabel}</div>
        </div>
      </div>

      {/* Hero banner */}
      <div className="hero-pill anim-in" style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 1 }}>
          <div>
            <div className="hero-pill-sub">{meta.companyName}</div>
            <div className="hero-pill-title" style={{ marginTop: 4 }}>สรุปรายงานรับเงินประจำวัน</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '.1em' }}>วันที่</div>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 2, letterSpacing: '.02em' }}>
              {fmtDate(todayStr)}
            </div>
          </div>
        </div>
      </div>

      {/* Summary pills — YTD & MTD clickable */}
      <div style={{ marginBottom: 24 }} className="anim-stagger">
        <div className="summary-pill"
          style={{ cursor: 'pointer', transition: 'opacity .15s' }}
          title="คลิกเพื่อดูรายละเอียด"
          onClick={() => setDrillModal({ title: `มูลค่ารับสะสมในปี ${thisYear}`, list: ytdList })}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="lbl-pill"><Icon name="money" size={16} /> มูลค่ารับสะสมในปี {thisYear}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: .5 }}>
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </div>
          <div className="count-bit"><AnimatedNumber value={ytdList.length} digits={0} /><small>จำนวน IV</small></div>
          <div className="val-bit"><AnimatedNumber value={sumBal(ytdList)} /><small>มูลค่า (บาท)</small></div>
        </div>

        <div className="summary-pill"
          style={{ cursor: 'pointer', transition: 'opacity .15s' }}
          title="คลิกเพื่อดูรายละเอียด"
          onClick={() => setDrillModal({ title: 'มูลค่ารับสะสมในเดือนนี้', list: monthList })}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="lbl-pill"><Icon name="bank" size={16} /> มูลค่ารับสะสมในเดือนนี้</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: .5 }}>
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </div>
          <div className="count-bit"><AnimatedNumber value={monthList.length} digits={0} /><small>จำนวน IV</small></div>
          <div className="val-bit"><AnimatedNumber value={sumBal(monthList)} /><small>มูลค่า (บาท)</small></div>
        </div>

        <div className="summary-pill is-today">
          <div><span className="lbl-pill"><Icon name="daily" size={16} /> โครงการที่รับเงินวันนี้</span></div>
          <div className="count-bit"><AnimatedNumber value={todayList.length} digits={0} /><small>จำนวน IV</small></div>
          <div className="val-bit"><AnimatedNumber value={sumBal(todayList)} /><small>มูลค่า (บาท)</small></div>
        </div>
      </div>

      {/* Today's invoice list — read-only view from invoices data */}
      <div className="card anim-in" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)' }}>
          <div className="card-title">รายการใบแจ้งหนี้ที่รับเงินวันนี้</div>
          <div className="card-sub">{todayList.length} รายการ · รวม {fmtNum(sumBal(todayList))} บาท</div>
        </div>
        <DailyIvTable list={todayList} projectByCode={projectByCode} showDate={false}
          empty="ยังไม่มีใบแจ้งหนี้ที่รับเงินในวันนี้ · บันทึกการรับเงินได้จากหน้า ใบแจ้งหนี้" />
      </div>

      {/* Drill-down popup */}
      {drillModal && (
        <DrillModal title={drillModal.title} list={drillModal.list} projectByCode={projectByCode} onClose={() => setDrillModal(null)} />
      )}
    </div>
  );
}

/* ── Shared invoice table (used in page + modal) ───────────────── */
function DailyIvTable({ list, projectByCode, showDate, empty }) {
  const total = list.reduce((s, iv) => s + (iv.balance || 0), 0);
  const cols = showDate ? 7 : 6;
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th style={{ width: 44 }}>ที่</th>
          <th style={{ width: 110 }}>Job No</th>
          <th style={{ width: 130 }}>เลข IV</th>
          <th>ชื่อโครงการ</th>
          <th style={{ width: 70, textAlign: 'center' }}>งวด</th>
          <th style={{ width: 170, textAlign: 'right' }}>Balance (บาท)</th>
          {showDate && <th style={{ width: 120 }}>วันที่รับเงิน</th>}
        </tr>
      </thead>
      <tbody>
        {list.length === 0 && (
          <tr><td colSpan={cols} style={{ padding: '36px 14px', textAlign: 'center', color: 'var(--ink-500)' }}>{empty}</td></tr>
        )}
        {list.map((iv, idx) => {
          const p = projectByCode[iv.jobNo] || {};
          return (
            <tr key={iv.id || idx}>
              <td>{idx + 1}</td>
              <td><span style={{ fontWeight: 600, fontSize: 13 }}>{iv.jobNo}</span></td>
              <td><span style={{ color: 'var(--ink-500)', fontSize: 12 }}>{iv.ivNo}</span></td>
              <td>{p.name || '—'}</td>
              <td style={{ textAlign: 'center' }}>{iv.period}</td>
              <td className="num strong">{fmtNum(iv.balance || 0)}</td>
              {showDate && <td style={{ color: 'var(--ink-600)' }}>{fmtDate(iv.actualReceive?.date)}</td>}
            </tr>
          );
        })}
      </tbody>
      {list.length > 0 && (
        <tfoot>
          <tr>
            <td colSpan={showDate ? 5 : 4}></td>
            <td className="num" style={{ fontWeight: 700 }}>{fmtNum(total)}</td>
            {showDate && <td></td>}
          </tr>
        </tfoot>
      )}
    </table>
  );
}

/* ── Drill-down modal ──────────────────────────────────────────── */
function DrillModal({ title, list, projectByCode, onClose }) {
  const total = list.reduce((s, iv) => s + (iv.balance || 0), 0);
  return (
    <Modal open={true} title={title} onClose={onClose} wide
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <span style={{ fontWeight: 600, color: 'var(--brand-500)' }}>
            รวม {fmtNum(total)} บาท &nbsp;·&nbsp; {list.length} ใบ
          </span>
          <button className="btn btn-ghost" onClick={onClose}>ปิด</button>
        </div>
      }>
      <div style={{ maxHeight: '55vh', overflowY: 'auto', margin: '0 -20px' }}>
        <DailyIvTable list={list} projectByCode={projectByCode} showDate={true} empty="ไม่มีข้อมูล" />
      </div>
    </Modal>
  );
}

Object.assign(window, { DailyRevenueDashboard });
