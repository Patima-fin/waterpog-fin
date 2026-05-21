// War Room — Page 2: Estimated annual cash flow from existing projects.
// Matches "Present War room - 18052026 การเงินด้านรับ" PDF page 2.
// Globals: React, KpiTile, AnimatedNumber, Badge, Icon, StackedBars, fmtNum, fmtMoney, fmtDate, KpiCallout, SectionCard, BigCallout

const { useMemo: wr2Memo } = React;

function WarRoomPage2({ data, setData, toast }) {
  const { monthlyForecast, warroomP2, meta } = data;

  // Compute monthly totals
  const monthTotals = wr2Memo(() => monthlyForecast.reduce((acc, m) => ({
    invIssued: acc.invIssued + (m.invIssued || 0),
    signed:    acc.signed    + (m.signed    || 0),
    unsigned:  acc.unsigned  + (m.unsigned  || 0),
    debt:      acc.debt      + (m.debt      || 0),
    netUsable: acc.netUsable + (m.netUsable || 0),
  }), { invIssued: 0, signed: 0, unsigned: 0, debt: 0, netUsable: 0 }), [monthlyForecast]);

  // Bar chart data
  const barData = monthlyForecast.map(m => ({
    label: m.en,
    segments: [
      { key: 'inv',      label: 'IV คงค้าง',    value: m.invIssued || 0, color: 'oklch(60% 0.13 245)' },
      { key: 'signed',   label: 'ลงนามแล้ว',    value: m.signed    || 0, color: 'oklch(55% 0.16 215)' },
      { key: 'unsigned', label: 'ยังไม่ลงนาม',  value: m.unsigned  || 0, color: 'oklch(75% 0.10 250)' },
    ],
    net: m.netUsable,
  }));

  return (
    <div className="page bg-pattern">
      <div className="page-head anim-in">
        <div>
          <h1 className="page-title">Estimated Annual Cash Flow from Existing Projects</h1>
          <div className="page-sub">ประมาณการรับเงินจากโครงการทั้งหมด · ทั้งปี {meta.year} · ข้อมูล ณ {fmtDate(meta.asOf)}</div>
        </div>
        <div className="page-head-r">
          <a className="btn btn-ghost" href="#warroom1"><Icon name="arrow" size={14} style={{ transform: 'rotate(180deg)' }} /> ย้อนกลับ · หน้า 1</a>
          <button className="btn btn-ghost"><Icon name="download" size={14} /> ส่งออก PDF</button>
        </div>
      </div>

      {/* Headline KPI — มูลค่าโครงการที่คาดว่าจะได้รับทั้งหมด */}
      <div className="hero-pill anim-in" style={{ marginBottom: 18 }}>
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13, opacity: 0.85, fontWeight: 500 }}>มูลค่าโครงการที่คาดว่าจะได้รับทั้งหมด</div>
            <div style={{ fontSize: 44, fontWeight: 800, marginTop: 4, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
              <AnimatedNumber value={warroomP2.totalProjectValue} digits={2} /> <span style={{ fontSize: 18, opacity: 0.8, fontWeight: 500 }}>บาท</span>
            </div>
            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6 }}>Total project value forecast · ปี {meta.year}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, auto)', gap: 24, fontSize: 12 }}>
            <HeroStat label="ใบแจ้งหนี้คงค้าง" value={warroomP2.invoiceForwardTotal} />
            <HeroStat label="งานระหว่างก่อสร้าง" value={warroomP2.wipValue} />
            <HeroStat label="ใบจัดสรร" value={warroomP2.unsignedTotal.value} count={warroomP2.unsignedTotal.count} />
          </div>
        </div>
      </div>

      {/* SECTION 1 — ประมาณการรับเงินจากโครงการทั้งหมด */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', marginTop: 6, marginBottom: 10 }}>
        <div style={{ width: 4, height: 22, background: 'var(--brand-500)', borderRadius: 2 }} />
        <h2 style={{ margin: 0, fontSize: 17, color: 'var(--ink-900)', fontWeight: 700 }}>ส่วนที่ 1 · ประมาณการรับเงินจากโครงการทั้งหมด</h2>
      </div>

      <div className="grid grid-2 anim-stagger" style={{ marginBottom: 18 }}>
        {/* 1.1 — Unsigned */}
        <div className="card" style={{ padding: 22, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', right: -40, top: -40, width: 140, height: 140, borderRadius: '50%', background: 'oklch(96% 0.04 250)' }} />
          <div style={{ position: 'relative' }}>
            <Badge kind="b-gray" dot={false}>1.1</Badge>
            <div style={{ marginTop: 10, fontSize: 14, color: 'var(--ink-600)', fontWeight: 500 }}>โครงการที่รอลงนามสัญญา</div>
            <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>ได้รับใบจัดสรรแล้ว · ยังไม่ลงนาม</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 14 }}>
              <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--ink-900)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-.01em' }}>
                <AnimatedNumber value={warroomP2.unsignedTotal.value} digits={2} />
              </div>
              <div style={{ fontSize: 14, color: 'var(--ink-500)' }}>บาท</div>
            </div>
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Badge kind="b-amber" dot>{warroomP2.unsignedTotal.count} โครงการ</Badge>
              <span style={{ fontSize: 11.5, color: 'var(--ink-500)' }}>{((warroomP2.unsignedTotal.value / warroomP2.totalProjectValue) * 100).toFixed(0)}% ของมูลค่าทั้งหมด</span>
            </div>
          </div>
        </div>

        {/* 1.2 — Signed */}
        <div className="card" data-comment-anchor="cc-1" style={{ padding: 22, position: 'relative', overflow: 'hidden', borderColor: 'var(--brand-200)' }}>
          <div style={{ position: 'absolute', right: -40, top: -40, width: 140, height: 140, borderRadius: '50%', background: 'var(--brand-50)' }} />
          <div style={{ position: 'relative' }}>
            <Badge kind="b-blue" dot={false}>1.2</Badge>
            <div style={{ marginTop: 10, fontSize: 14, color: 'var(--ink-600)', fontWeight: 500 }}>ประมาณการรับเงินจากโครงการที่ลงนามแล้ว</div>
            <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>รวมใบแจ้งหนี้ยกมา + ลงนามแล้ว (รอส่งงาน)</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 14 }}>
              <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--brand-700)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-.01em' }}>
                <AnimatedNumber value={warroomP2.signedTotal.value} digits={2} />
              </div>
              <div style={{ fontSize: 14, color: 'var(--ink-500)' }}>บาท</div>
            </div>

            {/* Breakdown — invoice vs WIP */}
            <div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: 'white', border: '1px solid var(--line)', display: 'grid', gap: 10 }}>
              <SignedBreakdownRow
                color="oklch(60% 0.13 245)"
                label="มูลค่าใบแจ้งหนี้ยกมา"
                sub="ออก IV แล้ว · รอติดตามรับเงิน"
                value={warroomP2.invoiceForwardTotal}
                total={warroomP2.signedTotal.value}
              />
              <SignedBreakdownRow
                color="oklch(55% 0.16 215)"
                label="มูลค่างานระหว่างก่อสร้าง"
                sub="ลงนามแล้ว · ยังไม่ส่งมอบ · ยังไม่ออก IV"
                value={warroomP2.wipValue}
                total={warroomP2.signedTotal.value}
              />
            </div>

            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Badge kind="b-blue" dot>{((warroomP2.signedTotal.value / warroomP2.totalProjectValue) * 100).toFixed(0)}% ของมูลค่าทั้งหมด</Badge>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2 — Monthly forecast table & chart */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', marginTop: 6, marginBottom: 10 }}>
        <div style={{ width: 4, height: 22, background: 'var(--brand-500)', borderRadius: 2 }} />
        <h2 style={{ margin: 0, fontSize: 17, color: 'var(--ink-900)', fontWeight: 700 }}>ส่วนที่ 2 · รวมประมาณการเงินที่คาดว่าจะได้รับในแต่ละเดือน</h2>
      </div>

      <div className="card anim-in" style={{ marginBottom: 18, padding: 18 }}>
        <div className="card-hd">
          <div>
            <div className="card-title">ประมาณการรับเงินรายเดือน</div>
            <div className="card-sub">แยกตามที่มา · IV คงค้าง / ลงนามแล้ว / ยังไม่ลงนาม</div>
          </div>
          <div style={{ display: 'flex', gap: 12, fontSize: 11.5, color: 'var(--ink-700)' }}>
            <LegendDot color="oklch(60% 0.13 245)" label="IV คงค้าง" />
            <LegendDot color="oklch(55% 0.16 215)" label="ลงนามแล้ว (รอส่งงาน)" />
            <LegendDot color="oklch(75% 0.10 250)" label="ยังไม่ลงนาม" />
          </div>
        </div>
        <StackedBars data={barData} height={300} />
      </div>

      {/* Monthly forecast detailed table */}
      <div className="card anim-in" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)' }}>
          <div className="card-title">ตารางประมาณการรับเงินรายเดือน (รายละเอียด)</div>
          <div className="card-sub">รวม {fmtNum(monthTotals.netUsable, 2)} บาท · 8 เดือนข้างหน้า</div>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>เดือน</th>
              <th style={{ textAlign: 'center', width: 80 }}>%</th>
              <th style={{ textAlign: 'right' }}>ใบแจ้งหนี้ยกมา</th>
              <th style={{ textAlign: 'right' }}>ลงนามแล้ว (รอส่งงาน)</th>
              <th style={{ textAlign: 'right' }}>ยังไม่ลงนาม</th>
              <th style={{ textAlign: 'right' }}>หักภาระหนี้</th>
              <th style={{ textAlign: 'right' }}>ใช้ได้สุทธิ</th>
            </tr>
          </thead>
          <tbody>
            {monthlyForecast.map((m, i) => (
              <tr key={i}>
                <td>
                  <span style={{ fontWeight: 600 }}>{m.month}</span>
                  <span className="muted" style={{ fontSize: 11.5, marginLeft: 6, fontWeight: 400 }}>({m.en})</span>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <Badge kind={m.pctOfRemaining >= 20 ? 'b-blue' : m.pctOfRemaining > 0 ? 'b-gray' : 'b-gray'} dot={false}>{m.pctOfRemaining}%</Badge>
                </td>
                <td className="num">{m.invIssued ? fmtNum(m.invIssued, 2) : <span className="muted">-</span>}</td>
                <td className="num">{m.signed ? fmtNum(m.signed, 2) : <span className="muted">-</span>}</td>
                <td className="num">{m.unsigned ? fmtNum(m.unsigned, 2) : <span className="muted">-</span>}</td>
                <td className="num" style={{ color: m.debt ? 'var(--bad)' : 'var(--ink-400)' }}>{m.debt ? '(' + fmtNum(Math.abs(m.debt), 2) + ')' : '-'}</td>
                <td className="num strong">{m.netUsable ? fmtNum(m.netUsable, 2) : <span className="muted">-</span>}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>รวมทั้งสิ้น</td>
              <td style={{ textAlign: 'center' }}>100%</td>
              <td className="num">{fmtNum(monthTotals.invIssued, 2)}</td>
              <td className="num">{fmtNum(monthTotals.signed, 2)}</td>
              <td className="num">{fmtNum(monthTotals.unsigned, 2)}</td>
              <td className="num" style={{ color: 'var(--bad)' }}>({fmtNum(Math.abs(monthTotals.debt), 2)})</td>
              <td className="num">{fmtNum(monthTotals.netUsable, 2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* (removed bottom stat strip per user request) */}
    </div>
  );
}

function HeroStat({ label, value, count }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 11, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
        {(value / 1_000_000).toFixed(2)} <span style={{ fontSize: 12, opacity: 0.85, fontWeight: 500 }}>ลบ.</span>
      </div>
      {count != null && <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>{count} โครงการ</div>}
    </div>
  );
}

function LegendDot({ color, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: color }} />
      {label}
    </span>
  );
}

function SmallStat({ label, value, accent }) {
  return (
    <div className="card" style={{ padding: 16, borderLeft: `3px solid ${accent}` }}>
      <div style={{ fontSize: 11.5, color: 'var(--ink-500)', fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink-900)', fontVariantNumeric: 'tabular-nums', marginTop: 4, letterSpacing: '-.01em' }}>
        <AnimatedNumber value={value} digits={2} />
        <span style={{ fontSize: 12, color: 'var(--ink-500)', fontWeight: 500, marginLeft: 4 }}>บาท</span>
      </div>
    </div>
  );
}

function SignedBreakdownRow({ color, label, sub, value, total }) {
  const pct = (value / total) * 100;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-800)' }}>{label}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>{sub}</div>
          </div>
        </div>
        <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-900)' }}>{fmtNum(value, 2)}</div>
          <div style={{ fontSize: 10.5, color: 'var(--ink-500)' }}>{pct.toFixed(1)}%</div>
        </div>
      </div>
      <div style={{ height: 5, background: 'var(--ink-100)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 800ms ease' }} />
      </div>
    </div>
  );
}

Object.assign(window, { WarRoomPage2 });
