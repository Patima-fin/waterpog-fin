// Daily Revenue Dashboard — สรุปรายงานรับเงินประจำวัน
// ดึงข้อมูลจาก invoices โดยตรง: status=paid + actualReceive.date
// + ประมาณการรับเงินจากใบแจ้งหนี้คงค้าง (outstanding forecast)

const { useState: dRState, useMemo: dRMemo } = React;

// ── normalize jobNo (ตัด productType suffix) ─────────────────────────────────
function drNormJobNo(raw) {
  if (!raw) return '';
  const s = raw.trim();
  const m = s.match(/^(.+)-([A-Z]{2,6})$/);
  return m ? m[1] : s;
}

function DailyRevenueDashboard({ data, setData, toast }) {
  const { invoices, meta } = data;

  // ใช้วันที่จริงของระบบเสมอ
  const todayStr   = new Date().toISOString().slice(0, 10);
  const thisMonth  = todayStr.slice(0, 7);
  const thisYear   = todayStr.slice(0, 4);
  const todayLabel = new Date(todayStr + 'T00:00:00').toLocaleDateString('th-TH-u-ca-gregory', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  // ── week bounds (จันทร์–อาทิตย์) ─────────────────────────────────────────────
  const weekBounds = dRMemo(() => {
    const d = new Date(todayStr + 'T00:00:00');
    const dow = d.getDay(); // 0=Sun
    const mon = new Date(d); mon.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    return { start: mon.toISOString().slice(0, 10), end: sun.toISOString().slice(0, 10) };
  }, [todayStr]);

  const [drillModal, setDrillModal] = dRState(null); // { title, list } — paid drill
  const [fcModal,    setFcModal]    = dRState(null); // { title, list } — forecast drill
  const [ivTypeFilter, setIvTypeFilter] = dRState('all'); // 'all' | 'P' | 'O'

  // invType filter (P=โครงการ, O=อื่นๆ) — default 'P' if missing
  const drInvType = iv => ((iv.invType || iv.invtype || 'P').toString().trim().toUpperCase() === 'O' ? 'O' : 'P');
  const matchType = iv => ivTypeFilter === 'all' || drInvType(iv) === ivTypeFilter;

  const { projectByCode, financeByCode } = dRMemo(() => WTPData.buildLookups(data), [data.projects]);

  // ── PAID invoices (apply invType filter) ─────────────────────────────────────
  const paidInvoices = dRMemo(() =>
    invoices.filter(iv => iv.status === 'paid' && iv.actualReceive?.date && matchType(iv)),
    [invoices, ivTypeFilter]
  );
  const todayList = dRMemo(() => paidInvoices.filter(iv => iv.actualReceive.date === todayStr),              [paidInvoices, todayStr]);
  const monthList = dRMemo(() => paidInvoices.filter(iv => iv.actualReceive.date.startsWith(thisMonth)),    [paidInvoices, thisMonth]);
  const ytdList   = dRMemo(() => paidInvoices.filter(iv => iv.actualReceive.date.startsWith(thisYear)),     [paidInvoices, thisYear]);

  // ── OUTSTANDING rows: non-paid + finance/project enrichment ─────────────────
  const IV_ALIAS  = { pending: 'tracking', '': 'pending_inspection' };
  const IV_VALID  = new Set(['pending_inspection', 'tracking', 'issue', 'paid']);
  const outstandingRows = dRMemo(() =>
    invoices.flatMap(iv => {
      if (!matchType(iv)) return [];
      const rawStatus = (iv.status || '').toString().trim();
      const aliased   = IV_ALIAS[rawStatus] != null ? IV_ALIAS[rawStatus] : rawStatus;
      const status    = IV_VALID.has(aliased) ? aliased : 'pending_inspection';
      if (status === 'paid') return [];
      const cj = drNormJobNo(iv.jobNo);
      const f  = financeByCode[cj] || financeByCode[iv.contractRef] || {};
      const p  = projectByCode[cj] || projectByCode[iv.contractRef] || {};
      const debt    = Number(f.debt ?? f['ภาระหนี้'] ?? 0);
      const balance = Number(iv.balance) || 0;
      return [{
        ...iv,
        jobNo: cj,
        status,
        invType: drInvType(iv),
        balance,
        projectName: p['พื้นที่'] || p.name || iv.projectName || '—',
        debt,
        netExpected: balance - debt,
      }];
    }),
    [invoices, financeByCode, projectByCode, ivTypeFilter]
  );

  // ── Forecast buckets ─────────────────────────────────────────────────────────
  const overdueForecast    = dRMemo(() => outstandingRows.filter(iv =>
    iv.expectedReceive && iv.expectedReceive < todayStr && iv.status === 'tracking'
  ), [outstandingRows, todayStr]);

  const todayForecast      = dRMemo(() => outstandingRows.filter(iv =>
    iv.expectedReceive === todayStr
  ), [outstandingRows, todayStr]);

  const weekForecast       = dRMemo(() => outstandingRows.filter(iv =>
    iv.expectedReceive && iv.expectedReceive >= weekBounds.start && iv.expectedReceive <= weekBounds.end
  ), [outstandingRows, weekBounds]);

  const thisMonthForecast  = dRMemo(() => outstandingRows.filter(iv =>
    iv.expectedReceive && iv.expectedReceive.startsWith(thisMonth) && iv.expectedReceive >= todayStr
  ), [outstandingRows, thisMonth, todayStr]);

  const sumBal = list => list.reduce((s, iv) => s + (iv.balance || 0), 0);
  const sumNet = list => list.reduce((s, iv) => s + (iv.netExpected || 0), 0);

  return (
    <div className="page bg-pattern">
      <div className="page-head anim-in">
        <div>
          <h1 className="page-title">สรุปรายงานรับเงินประจำวัน</h1>
          <div className="page-sub">Daily Revenue Report · ข้อมูล ณ {todayLabel}</div>
        </div>
        <div className="page-head-r">
          <PrintButton label="พิมพ์ / PDF" />
        </div>
      </div>

      {/* invType filter toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }} className="anim-in">
        <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>กรองประเภทใบแจ้งหนี้:</span>
        {[
          { k: 'all', label: 'ทั้งหมด',           bg: '#f8fafc', color: '#2d3748', bd: '#cbd5e0' },
          { k: 'P',   label: '📋 โครงการ (P)',    bg: '#ebf8ff', color: '#1e4fbd', bd: '#63b3ed' },
          { k: 'O',   label: '🛒 อื่นๆ (O)',       bg: '#faf5ff', color: '#6b46c1', bd: '#b794f4' },
        ].map(t => {
          const active = ivTypeFilter === t.k;
          return (
            <button key={t.k} onClick={() => setIvTypeFilter(t.k)}
              style={{
                fontSize: 12, padding: '5px 12px', borderRadius: 16, cursor: 'pointer',
                border: `1.5px solid ${active ? t.bd : 'transparent'}`,
                background: active ? t.bg : 'transparent',
                color: active ? t.color : 'var(--ink-500)',
                fontWeight: active ? 700 : 500,
              }}>
              {t.label}
            </button>
          );
        })}
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
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 2, letterSpacing: '.02em' }}>{fmtDate(todayStr)}</div>
          </div>
        </div>
      </div>

      {/* ── Summary pills: YTD / MTD / Today (paid) ──────────────────────────── */}
      <div style={{ marginBottom: 24 }} className="anim-stagger">
        <div className="summary-pill" style={{ cursor: 'pointer' }} title="คลิกเพื่อดูรายละเอียด"
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

        <div className="summary-pill" style={{ cursor: 'pointer' }} title="คลิกเพื่อดูรายละเอียด"
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

      {/* ── Today's received list ─────────────────────────────────────────────── */}
      <div className="card anim-in" style={{ padding: 0, overflow: 'hidden', marginBottom: 28 }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)' }}>
          <div className="card-title">รายการใบแจ้งหนี้ที่รับเงินวันนี้</div>
          <div className="card-sub">{todayList.length} รายการ · รวม {fmtNum(sumBal(todayList))} บาท</div>
        </div>
        <DailyIvTable list={todayList} projectByCode={projectByCode} showDate={false}
          empty="ยังไม่มีใบแจ้งหนี้ที่รับเงินในวันนี้ · บันทึกการรับเงินได้จากหน้า ใบแจ้งหนี้" />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          FORECAST SECTION — คาดการณ์จากใบแจ้งหนี้คงค้าง
          ═══════════════════════════════════════════════════════════════════ */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }} className="anim-in">
        <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink-800)', margin: 0 }}>
          ประมาณการรับเงิน (Forecast)
        </h2>
        <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>
          คำนวณจากใบแจ้งหนี้คงค้างในระบบ · {outstandingRows.length} ใบ
        </span>
      </div>

      {/* Forecast KPI tiles ─────────────────────────────────────────────────── */}
      <div className="grid grid-4 anim-stagger" style={{ marginBottom: 18 }}>

        {/* เกินกำหนด */}
        <div onClick={() => overdueForecast.length > 0 && setFcModal({ title: '🚨 เกินกำหนดชำระ', list: overdueForecast })}
          style={{ cursor: overdueForecast.length > 0 ? 'pointer' : 'default' }}>
          <div style={{
            background: overdueForecast.length > 0 ? '#fff5f5' : '#f8fafc',
            border: `1.5px solid ${overdueForecast.length > 0 ? '#fc8181' : '#e2e8f0'}`,
            borderRadius: 12, padding: '14px 16px', transition: 'box-shadow .15s',
          }}
          onMouseEnter={e => overdueForecast.length > 0 && (e.currentTarget.style.boxShadow = '0 4px 16px rgba(252,129,129,.25)')}
          onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}>
            <div style={{ fontSize: 11, color: overdueForecast.length > 0 ? '#9b1c1c' : '#718096', fontWeight: 600, marginBottom: 6 }}>🚨 เกินกำหนดชำระ</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: overdueForecast.length > 0 ? '#9b1c1c' : '#a0aec0' }}>
              <AnimatedNumber value={overdueForecast.length} digits={0} />
              <span style={{ fontSize: 13, fontWeight: 500, marginLeft: 4 }}>ใบ</span>
            </div>
            <div style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', marginTop: 4, color: overdueForecast.length > 0 ? '#e53e3e' : '#a0aec0', fontWeight: 600 }}>
              {fmtNum(sumBal(overdueForecast), 0)} ฿
            </div>
            {overdueForecast.length > 0 && <div style={{ fontSize: 10.5, color: '#fc8181', marginTop: 3 }}>คลิกดูรายละเอียด →</div>}
          </div>
        </div>

        {/* คาดรับวันนี้ */}
        <div onClick={() => todayForecast.length > 0 && setFcModal({ title: '✅ คาดรับเงินวันนี้', list: todayForecast })}
          style={{ cursor: todayForecast.length > 0 ? 'pointer' : 'default' }}>
          <div style={{
            background: todayForecast.length > 0 ? '#f0fdf4' : '#f8fafc',
            border: `1.5px solid ${todayForecast.length > 0 ? '#68d391' : '#e2e8f0'}`,
            borderRadius: 12, padding: '14px 16px', transition: 'box-shadow .15s',
          }}
          onMouseEnter={e => todayForecast.length > 0 && (e.currentTarget.style.boxShadow = '0 4px 16px rgba(104,211,145,.25)')}
          onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}>
            <div style={{ fontSize: 11, color: todayForecast.length > 0 ? '#276749' : '#718096', fontWeight: 600, marginBottom: 6 }}>✅ คาดรับเงินวันนี้</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: todayForecast.length > 0 ? '#276749' : '#a0aec0' }}>
              <AnimatedNumber value={todayForecast.length} digits={0} />
              <span style={{ fontSize: 13, fontWeight: 500, marginLeft: 4 }}>ใบ</span>
            </div>
            <div style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', marginTop: 4, color: todayForecast.length > 0 ? '#276749' : '#a0aec0', fontWeight: 600 }}>
              {fmtNum(sumBal(todayForecast), 0)} ฿
            </div>
            {todayForecast.length > 0 && <div style={{ fontSize: 10.5, color: '#68d391', marginTop: 3 }}>คลิกดูรายละเอียด →</div>}
          </div>
        </div>

        {/* คาดรับสัปดาห์นี้ */}
        <div onClick={() => weekForecast.length > 0 && setFcModal({ title: '📅 คาดรับสัปดาห์นี้', list: weekForecast })}
          style={{ cursor: weekForecast.length > 0 ? 'pointer' : 'default' }}>
          <div style={{
            background: weekForecast.length > 0 ? '#ebf8ff' : '#f8fafc',
            border: `1.5px solid ${weekForecast.length > 0 ? '#63b3ed' : '#e2e8f0'}`,
            borderRadius: 12, padding: '14px 16px', transition: 'box-shadow .15s',
          }}
          onMouseEnter={e => weekForecast.length > 0 && (e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,179,237,.25)')}
          onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}>
            <div style={{ fontSize: 11, color: weekForecast.length > 0 ? '#1e4fbd' : '#718096', fontWeight: 600, marginBottom: 6 }}>📅 คาดรับสัปดาห์นี้</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: weekForecast.length > 0 ? '#1e4fbd' : '#a0aec0' }}>
              <AnimatedNumber value={weekForecast.length} digits={0} />
              <span style={{ fontSize: 13, fontWeight: 500, marginLeft: 4 }}>ใบ</span>
            </div>
            <div style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', marginTop: 4, color: weekForecast.length > 0 ? '#2b6cb0' : '#a0aec0', fontWeight: 600 }}>
              {fmtNum(sumBal(weekForecast), 0)} ฿
            </div>
            {weekForecast.length > 0 && <div style={{ fontSize: 10.5, color: '#63b3ed', marginTop: 3 }}>คลิกดูรายละเอียด →</div>}
          </div>
        </div>

        {/* คาดรับเดือนนี้ (ที่เหลือ) */}
        <div onClick={() => thisMonthForecast.length > 0 && setFcModal({ title: '🗓 คาดรับเดือนนี้ (ที่เหลือ)', list: thisMonthForecast })}
          style={{ cursor: thisMonthForecast.length > 0 ? 'pointer' : 'default' }}>
          <div style={{
            background: thisMonthForecast.length > 0 ? '#faf5ff' : '#f8fafc',
            border: `1.5px solid ${thisMonthForecast.length > 0 ? '#b794f4' : '#e2e8f0'}`,
            borderRadius: 12, padding: '14px 16px', transition: 'box-shadow .15s',
          }}
          onMouseEnter={e => thisMonthForecast.length > 0 && (e.currentTarget.style.boxShadow = '0 4px 16px rgba(183,148,244,.25)')}
          onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}>
            <div style={{ fontSize: 11, color: thisMonthForecast.length > 0 ? '#6b46c1' : '#718096', fontWeight: 600, marginBottom: 6 }}>🗓 คาดรับเดือนนี้ (ที่เหลือ)</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: thisMonthForecast.length > 0 ? '#6b46c1' : '#a0aec0' }}>
              <AnimatedNumber value={thisMonthForecast.length} digits={0} />
              <span style={{ fontSize: 13, fontWeight: 500, marginLeft: 4 }}>ใบ</span>
            </div>
            <div style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', marginTop: 4, color: thisMonthForecast.length > 0 ? '#6b46c1' : '#a0aec0', fontWeight: 600 }}>
              {fmtNum(sumBal(thisMonthForecast), 0)} ฿
            </div>
            {thisMonthForecast.length > 0 && <div style={{ fontSize: 10.5, color: '#b794f4', marginTop: 3 }}>คลิกดูรายละเอียด →</div>}
          </div>
        </div>

      </div>

      {/* Outstanding summary table ───────────────────────────────────────────── */}
      <div className="card anim-in" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(180deg,var(--brand-50),white)' }}>
          <div>
            <div className="card-title">ใบแจ้งหนี้คงค้างทั้งหมด</div>
            <div className="card-sub">
              {outstandingRows.length} ใบ · Balance {fmtNum(sumBal(outstandingRows))} ฿ · คาดรับสุทธิ <strong style={{ color: 'var(--good)' }}>{fmtNum(sumNet(outstandingRows))}</strong> ฿
            </div>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <ForecastTable list={outstandingRows} todayStr={todayStr} empty="ไม่มีใบแจ้งหนี้คงค้าง" />
        </div>
      </div>

      {/* Paid drill-down popup */}
      {drillModal && (
        <DrillModal title={drillModal.title} list={drillModal.list} projectByCode={projectByCode} onClose={() => setDrillModal(null)} />
      )}

      {/* Forecast drill-down popup */}
      {fcModal && (
        <ForecastModal title={fcModal.title} list={fcModal.list} todayStr={todayStr} onClose={() => setFcModal(null)} />
      )}
    </div>
  );
}

/* ── Shared paid-invoice table (used in page + DrillModal) ─────────────── */
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
              <td>{p.name || p['พื้นที่'] || '—'}</td>
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

/* ── Paid drill-down modal ──────────────────────────────────────────────── */
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

/* ── Forecast invoice table (outstanding) ──────────────────────────────── */
function ForecastTable({ list, todayStr, empty }) {
  const sumBal = list.reduce((s, iv) => s + (iv.balance || 0), 0);
  const sumNet = list.reduce((s, iv) => s + (iv.netExpected || 0), 0);
  const today  = todayStr || new Date().toISOString().slice(0, 10);
  return (
    <table className="tbl" style={{ minWidth: 900 }}>
      <thead>
        <tr>
          <th style={{ width: 44 }}>ที่</th>
          <th style={{ width: 90 }}>Job No</th>
          <th style={{ width: 120 }}>เลข IV</th>
          <th>ชื่อโครงการ</th>
          <th style={{ width: 60, textAlign: 'center' }}>งวด</th>
          <th style={{ width: 140, textAlign: 'right' }}>Balance (฿)</th>
          <th style={{ width: 135, textAlign: 'right' }}>คาดรับสุทธิ (฿)</th>
          <th style={{ width: 110, textAlign: 'center' }}>วันคาดรับ</th>
          <th style={{ width: 100, textAlign: 'center' }}>สถานะ</th>
        </tr>
      </thead>
      <tbody>
        {list.length === 0 && (
          <tr><td colSpan={9} style={{ padding: '36px 14px', textAlign: 'center', color: 'var(--ink-500)' }}>{empty}</td></tr>
        )}
        {list.map((iv, idx) => {
          const sMeta    = WTPData.IV_STATUS_META[iv.status] || { label: iv.status, badge: 'b-gray' };
          const isOverdue = iv.expectedReceive && iv.expectedReceive < today && iv.status === 'tracking';
          return (
            <tr key={iv.id || idx}>
              <td>{idx + 1}</td>
              <td><span style={{ fontWeight: 600, fontSize: 12.5, fontFamily: 'ui-monospace', color: 'var(--brand-700)' }}>{iv.jobNo}</span></td>
              <td><span style={{ color: 'var(--ink-500)', fontSize: 12 }}>{iv.ivNo}</span></td>
              <td style={{ overflow: 'hidden', maxWidth: 0 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }} title={iv.projectName}>{iv.projectName}</span>
              </td>
              <td style={{ textAlign: 'center' }}>{iv.period}</td>
              <td className="num strong">{fmtNum(iv.balance || 0)}</td>
              <td className="num" style={{ color: 'var(--good)', fontWeight: 700 }}>{fmtNum(iv.netExpected || 0)}</td>
              <td style={{ textAlign: 'center', color: isOverdue ? '#e53e3e' : 'var(--ink-600)', fontWeight: isOverdue ? 700 : 400 }}>
                {iv.expectedReceive ? fmtDate(iv.expectedReceive) : <span className="muted">—</span>}
              </td>
              <td style={{ textAlign: 'center' }}><Badge kind={sMeta.badge}>{sMeta.label}</Badge></td>
            </tr>
          );
        })}
      </tbody>
      {list.length > 0 && (
        <tfoot>
          <tr>
            <td colSpan={5}></td>
            <td className="num" style={{ fontWeight: 700 }}>{fmtNum(sumBal)}</td>
            <td className="num" style={{ fontWeight: 700, color: 'var(--good)' }}>{fmtNum(sumNet)}</td>
            <td colSpan={2}></td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}

/* ── Forecast drill-down modal ──────────────────────────────────────────── */
function ForecastModal({ title, list, todayStr, onClose }) {
  const sumBal = list.reduce((s, iv) => s + (iv.balance || 0), 0);
  const sumNet = list.reduce((s, iv) => s + (iv.netExpected || 0), 0);
  return (
    <Modal open={true} title={title} onClose={onClose} wide
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <span style={{ fontWeight: 600, color: 'var(--brand-500)' }}>
            Balance {fmtNum(sumBal)} · สุทธิ {fmtNum(sumNet)} บาท &nbsp;·&nbsp; {list.length} ใบ
          </span>
          <button className="btn btn-ghost" onClick={onClose}>ปิด</button>
        </div>
      }>
      <div style={{ maxHeight: '58vh', overflowY: 'auto', margin: '0 -20px', overflowX: 'auto' }}>
        <ForecastTable list={list} todayStr={todayStr} empty="ไม่มีข้อมูล" />
      </div>
    </Modal>
  );
}

Object.assign(window, { DailyRevenueDashboard });
