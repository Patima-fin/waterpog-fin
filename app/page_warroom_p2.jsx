// War Room — Page 2: Estimated annual cash flow from existing projects.
// Matches "Present War room - 18052026 การเงินด้านรับ" PDF page 2.
// Globals: React, KpiTile, AnimatedNumber, Badge, Icon, StackedBars, fmtNum, fmtMoney, fmtDate, KpiCallout, SectionCard, BigCallout

const { useMemo: wr2Memo, useState: wr2State } = React;

function WarRoomPage2({ data, setData, toast }) {
  const { monthlyForecast, warroomP2, meta } = data;
  const [editMode, setEditMode] = wr2State(false);  // โหมดคีย์เลขมือ
  useOverrideSubAny();  // re-render เมื่อ override เปลี่ยน — sum/% ใช้ค่าใหม่

  // ── Live: โครงการรอลงนาม (Start ว่าง = ยังไม่ลงนาม) ─────────────────────
  // คำนวณตรงจาก data.projects แทน warroomP2.unsignedTotal (pre-computed) เพื่อให้
  // sync กับหน้า "โครงการทั้งหมด" — เพิ่ม/แก้/ลบ project แล้วยอดอัปเดตทันที
  // มูลค่า: ใช้ งบประมาณ (ใบจัดสรร) ก่อน, fall back ไป มูลค่าสัญญาที่เซ็น
  // (กรณี user ยังไม่ได้กรอก งบประมาณ แต่มีค่ามูลค่าสัญญา)
  // Helper: ดึงค่าจาก project — รองรับชื่อ field หลายแบบ
  const getStart = (p) => p['Start'] || p['start'] || p['วันที่เริ่ม'] || p['startDate'] || p['_start'] || '';
  const getBudget = (p) => Number(p['งบประมาณ']) || Number(p['budget']) || Number(p['allocBudget']) || 0;
  const getSigned = (p) => Number(p['มูลค่าสัญญาที่เซ็น']) || Number(p['signedValue']) || Number(p['มูลค่าสัญญา']) || Number(p['signed']) || 0;
  const isEmpty   = (v) => {
    if (v == null) return true;
    const s = String(v).trim();
    return s === '' || s === '—' || s === '-' || s === '0' || s.toLowerCase() === 'null';
  };

  const liveUnsigned = wr2Memo(() => {
    const projects = data.projects || [];
    const unsigned = projects.filter(p => isEmpty(getStart(p)));
    const value = unsigned.reduce((sum, p) => {
      const budget = getBudget(p);
      const signed = getSigned(p);
      return sum + (budget > 0 ? budget : signed);
    }, 0);
    // diagnostic — ดูใน Console (F12)
    if (typeof window !== 'undefined') {
      window.__wtpDebug_unsigned = {
        totalProjects: projects.length,
        unsignedCount: unsigned.length,
        unsignedValue: value,
        sampleProject: projects[0] && Object.keys(projects[0]).slice(0, 12),
        sampleStart: projects[0] && getStart(projects[0]),
        sampleSigned: projects[0] && getSigned(projects[0]),
      };
    }
    return { count: unsigned.length, value };
  }, [data.projects]);

  // มูลค่าโครงการทั้งหมด (ใช้คำนวณ %) — sum ของ มูลค่าสัญญา + งบประมาณ ทุกโครงการ
  const liveTotalProjectValue = wr2Memo(() => {
    return (data.projects || []).reduce((sum, p) => {
      const budget = getBudget(p);
      const signed = getSigned(p);
      return sum + Math.max(budget, signed);
    }, 0);
  }, [data.projects]);

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
          <CloudSyncStatusButton />
          <EditModeToggle value={editMode} onChange={setEditMode} />
          <a className="btn btn-ghost" href="#warroom1"><Icon name="arrow" size={14} style={{ transform: 'rotate(180deg)' }} /> ย้อนกลับ · หน้า 1</a>
          <PrintButton label="พิมพ์ / PDF" />
        </div>
      </div>

      {editMode && (
        <div style={{ marginBottom: 12, padding: '8px 14px', borderRadius: 10, background: 'color-mix(in oklch, var(--brand-500) 8%, transparent)', border: '1.5px solid color-mix(in oklch, var(--brand-500) 30%, transparent)', fontSize: 12, color: 'var(--brand-700)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700 }}>📝 โหมดแก้ไข — คลิกในช่องตัวเลขเพื่อกรอกค่า (Tab/Enter เพื่อบันทึก, ✕ เพื่อล้าง)</span>
          <button type="button" onClick={() => { if (confirm('ล้างค่าที่กรอกมือทั้งหมดในหน้านี้?')) WTPOverride.clearAll(); }}
            style={{ marginLeft: 'auto', padding: '3px 10px', fontSize: 11, borderRadius: 5, border: '1px solid var(--bad)', background: 'transparent', color: 'var(--bad)', cursor: 'pointer' }}>
            ล้างทั้งหมด
          </button>
        </div>
      )}

      {/* Headline KPI — มูลค่าโครงการที่คาดว่าจะได้รับทั้งหมด */}
      <div className="hero-pill anim-in" style={{ marginBottom: 18 }}>
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13, opacity: 0.85, fontWeight: 500 }}>มูลค่าโครงการที่คาดว่าจะได้รับทั้งหมด</div>
            <div style={{ fontSize: 44, fontWeight: 800, marginTop: 4, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
              <EditableNumber ovKey="wr2.heroTotal" computed={warroomP2.totalProjectValue} editMode={editMode} digits={2} /> <span style={{ fontSize: 18, opacity: 0.8, fontWeight: 500 }}>บาท</span>
            </div>
            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6 }}>Total project value forecast · ปี {meta.year}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, auto)', gap: 24, fontSize: 12 }}>
            <HeroStatEditable ovKey="wr2.heroInvForward" label="ใบแจ้งหนี้คงค้าง" computed={warroomP2.invoiceForwardTotal} editMode={editMode} />
            <HeroStatEditable ovKey="wr2.heroWip"        label="งานระหว่างก่อสร้าง" computed={warroomP2.wipValue}             editMode={editMode} />
            <HeroStatEditable ovKey="wr2.heroUnsigned"   label="ใบจัดสรร · รอลงนาม"  computed={liveUnsigned.value} count={liveUnsigned.count} editMode={editMode} countKey="wr2.heroUnsignedCount" />
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
            <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>ได้รับใบจัดสรรแล้ว · ยังไม่ลงนาม (Start ว่าง)</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 14 }}>
              <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--ink-900)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-.01em' }}>
                <EditableNumber ovKey="wr2.s11Value" computed={liveUnsigned.value} editMode={editMode} digits={2} />
              </div>
              <div style={{ fontSize: 14, color: 'var(--ink-500)' }}>บาท</div>
            </div>
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Badge kind="b-amber" dot>
                <EditableNumber ovKey="wr2.s11Count" computed={liveUnsigned.count} editMode={editMode} digits={0} /> โครงการ
              </Badge>
              {liveTotalProjectValue > 0 && (
                <span style={{ fontSize: 11.5, color: 'var(--ink-500)' }}>
                  {((WTPOverride.resolve('wr2.s11Value', liveUnsigned.value) / liveTotalProjectValue) * 100).toFixed(1)}% ของมูลค่าทั้งหมด
                </span>
              )}
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
                <EditableNumber ovKey="wr2.s12Value" computed={warroomP2.signedTotal.value} editMode={editMode} digits={2} />
              </div>
              <div style={{ fontSize: 14, color: 'var(--ink-500)' }}>บาท</div>
            </div>

            {/* Breakdown — invoice vs WIP */}
            <div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: 'white', border: '1px solid var(--line)', display: 'grid', gap: 10 }}>
              <SignedBreakdownRow
                color="oklch(60% 0.13 245)"
                label="มูลค่าใบแจ้งหนี้ยกมา"
                sub="ออก IV แล้ว · รอติดตามรับเงิน"
                value={WTPOverride.resolve('wr2.s12Inv', warroomP2.invoiceForwardTotal)}
                total={WTPOverride.resolve('wr2.s12Value', warroomP2.signedTotal.value)}
                editMode={editMode}
                ovKey="wr2.s12Inv"
              />
              <SignedBreakdownRow
                color="oklch(55% 0.16 215)"
                label="มูลค่างานระหว่างก่อสร้าง"
                sub="ลงนามแล้ว · ยังไม่ส่งมอบ · ยังไม่ออก IV"
                value={WTPOverride.resolve('wr2.s12Wip', warroomP2.wipValue)}
                total={WTPOverride.resolve('wr2.s12Value', warroomP2.signedTotal.value)}
                editMode={editMode}
                ovKey="wr2.s12Wip"
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

// Editable variant — รับ ovKey เพื่อให้แก้ค่าได้ด้วย EditableNumber
function HeroStatEditable({ ovKey, label, computed, count, countKey, editMode }) {
  // ตอน editMode = แสดง input ของยอด (เป็นบาทเต็ม) แทน ลบ.
  // ตอน view = แสดง "X.XX ลบ." ตามเดิม + badge ✏️ ถ้า override
  const overridden = WTPOverride.has(ovKey);
  useOverrideSub(ovKey);
  useOverrideSub(countKey || '_');
  const value = WTPOverride.resolve(ovKey, computed);
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 11, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
        {editMode ? (
          <EditableNumber ovKey={ovKey} computed={computed} editMode={true} digits={0} />
        ) : (
          <>
            {(value / 1_000_000).toFixed(2)} <span style={{ fontSize: 12, opacity: 0.85, fontWeight: 500 }}>ลบ.</span>
            {overridden && <span title="แก้มือ" style={{ fontSize: 9, marginLeft: 4, opacity: 0.85 }}>✏️</span>}
          </>
        )}
      </div>
      {(count != null || countKey) && (
        <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>
          {countKey ? (
            <EditableNumber ovKey={countKey} computed={count || 0} editMode={editMode} digits={0} />
          ) : count} โครงการ
        </div>
      )}
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

function SignedBreakdownRow({ color, label, sub, value, total, editMode, ovKey }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
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
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-900)' }}>
            {ovKey ? (
              <EditableNumber ovKey={ovKey} computed={value} editMode={editMode} digits={2} />
            ) : fmtNum(value, 2)}
          </div>
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
