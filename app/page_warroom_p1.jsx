// War Room — Page 1: Revenue Collection & Receivables Overview
// Matches "Present War room - 18052026 การเงินด้านรับ" PDF page 1.
// Globals: React, KpiTile, AnimatedNumber, Badge, Icon, fmtNum, fmtMoney, fmtDate

const { useMemo: wr1Memo, useState: wr1State } = React;

function WarRoomPage1({ data, setData, toast }) {
  const { ytdRevenue, weeklyExpectedReceipt, warroomP1, meta } = data;

  // ── Live finance lookups ──────────────────────────────────────────────────
  const { financeByCode } = wr1Memo(() => WTPData.buildLookups(data), [data.projects]);

  // ── Live outstanding rows from data.invoices ──────────────────────────────
  const WR_ALIAS = { pending: 'tracking', '': 'pending_inspection' };
  const WR_VALID = new Set(['pending_inspection', 'tracking', 'issue', 'paid']);
  const liveRows = wr1Memo(() => {
    return (data.invoices || []).flatMap(iv => {
      const rawStatus = (iv.status || '').toString().trim();
      const aliased   = WR_ALIAS[rawStatus] != null ? WR_ALIAS[rawStatus] : rawStatus;
      const status    = WR_VALID.has(aliased) ? aliased : 'pending_inspection';
      if (status === 'paid') return [];
      const s  = (iv.jobNo || '').trim();
      const mx = s.match(/^(.+)-([A-Z]{2,6})$/);
      const cj = mx ? mx[1] : s;
      const f  = financeByCode[cj] || financeByCode[iv.contractRef] || {};
      const debt = Number(f.debt ?? f['ภาระหนี้'] ?? 0);
      return [{ ...iv, jobNo: cj, status, debt, netExpected: (iv.balance || 0) - debt }];
    });
  }, [data.invoices, financeByCode]);

  const liveToday     = new Date().toISOString().slice(0, 10);
  const liveThisMonth = liveToday.slice(0, 7);

  // group by status
  const liveByStatus = wr1Memo(() => {
    const m = { pending_inspection: [], tracking: [], issue: [] };
    liveRows.forEach(iv => { if (m[iv.status]) m[iv.status].push(iv); });
    return m;
  }, [liveRows]);

  // group by expected month, sorted chronologically (ไม่ระบุ last)
  const liveByMonth = wr1Memo(() => {
    const m = {};
    liveRows.forEach(iv => {
      const key = iv.expectedReceive ? iv.expectedReceive.slice(0, 7) : 'ไม่ระบุ';
      (m[key] = m[key] || []).push(iv);
    });
    return Object.entries(m).sort(([a], [b]) => {
      if (a === 'ไม่ระบุ') return 1;
      if (b === 'ไม่ระบุ') return -1;
      return a.localeCompare(b);
    });
  }, [liveRows]);

  const liveTotal = wr1Memo(() => ({
    count: liveRows.length,
    gross: liveRows.reduce((s, iv) => s + (iv.balance || 0), 0),
    debt:  liveRows.reduce((s, iv) => s + (iv.debt || 0), 0),
    net:   liveRows.reduce((s, iv) => s + (iv.netExpected || 0), 0),
  }), [liveRows]);

  const totalYtd = wr1Memo(() => {
    return ytdRevenue.reduce((acc, m) => {
      acc.count += m.count;
      acc.gross += m.gross;
      acc.debt += m.debt;
      acc.net += m.net;
      return acc;
    }, { count: 0, gross: 0, debt: 0, net: 0 });
  }, [ytdRevenue]);

  const totalWeek = weeklyExpectedReceipt.reduce((acc, w) => ({
    count: acc.count + w.count, gross: acc.gross + w.gross, debt: acc.debt + w.debt, net: acc.net + w.net
  }), { count: 0, gross: 0, debt: 0, net: 0 });

  return (
    <div className="page bg-pattern">
      <div className="page-head anim-in">
        <div>
          <h1 className="page-title">Revenue Collection & Receivables Overview</h1>
          <div className="page-sub">การเงินด้านรับ · {meta.companyName} · ข้อมูล ณ {fmtDate(meta.asOf)}</div>
        </div>
        <div className="page-head-r">
          <a className="btn btn-ghost" href="#warroom2"><Icon name="arrow" size={14} /> หน้าถัดไป · ประมาณการรายปี</a>
          <PrintButton label="พิมพ์ / PDF" />
        </div>
      </div>

      {/* (top 4 KPI strip removed per user request — values are shown inside section headers) */}

      {/* SECTION 01 — Annual YTD */}
      <SectionCard num="01" title="รายรับสะสมประจำปี" subtitle="Annual YTD · เงินรับสะสมตั้งแต่เดือนมกราคม" totalLabel="Total YTD" total={totalYtd.net}>
        <table className="tbl">
          <thead>
            <tr>
              <th>เดือน (Month)</th>
              <th style={{ width: 90, textAlign: 'center' }}>จำนวน</th>
              <th style={{ textAlign: 'right' }}>รายรับรวม (GROSS)</th>
              <th style={{ textAlign: 'right' }}>หักภาระหนี้ (Debt)</th>
              <th style={{ textAlign: 'right' }}>คงเหลือสุทธิ (NET)</th>
            </tr>
          </thead>
          <tbody>
            {ytdRevenue.map((m, i) => (
              <tr key={i}>
                <td>
                  <span style={{ fontWeight: 600 }}>{m.month}</span>
                  <span className="muted" style={{ fontSize: 11.5, marginLeft: 6, fontWeight: 400 }}>({m.en})</span>
                </td>
                <td style={{ textAlign: 'center' }}>{m.count}</td>
                <td className="num">{fmtNum(m.gross, 2)}</td>
                <td className="num" style={{ color: m.debt ? 'var(--bad)' : 'var(--ink-400)' }}>{m.debt ? '(' + fmtNum(Math.abs(m.debt), 2) + ')' : '-'}</td>
                <td className="num strong">{fmtNum(m.net, 2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total YTD</td>
              <td style={{ textAlign: 'center' }}>{totalYtd.count}</td>
              <td className="num">{fmtNum(totalYtd.gross, 2)}</td>
              <td className="num" style={{ color: 'var(--bad)' }}>({fmtNum(Math.abs(totalYtd.debt), 2)})</td>
              <td className="num">{fmtNum(totalYtd.net, 2)}</td>
            </tr>
          </tfoot>
        </table>
      </SectionCard>

      {/* SECTION 02 — Weekly current-month forecast */}
      <SectionCard num="02" title="คาดการณ์ได้รับเพิ่มในเดือนปัจจุบัน" subtitle="รายสัปดาห์ · พฤษภาคม 2026" totalLabel="คาดการณ์ยอดรับสุทธิในเดือนนี้" total={warroomP1.thisMonthNetProjection}>
        <table className="tbl">
          <thead>
            <tr>
              <th>ช่วงเวลา (PERIOD)</th>
              <th style={{ width: 90, textAlign: 'center' }}>จำนวน</th>
              <th style={{ textAlign: 'right' }}>รายรับรวม (GROSS)</th>
              <th style={{ textAlign: 'right' }}>หักภาระหนี้ (Debt)</th>
              <th style={{ textAlign: 'right' }}>คงเหลือสุทธิ (NET)</th>
            </tr>
          </thead>
          <tbody>
            {weeklyExpectedReceipt.map((w, i) => (
              <tr key={i}>
                <td>สัปดาห์ที่ {w.week}</td>
                <td style={{ textAlign: 'center' }}>{w.count}</td>
                <td className="num">{w.gross ? fmtNum(w.gross, 2) : <span className="muted">-</span>}</td>
                <td className="num" style={{ color: w.debt ? 'var(--bad)' : 'var(--ink-400)' }}>{w.debt ? '(' + fmtNum(Math.abs(w.debt), 2) + ')' : '-'}</td>
                <td className="num strong">{w.net ? fmtNum(w.net, 2) : <span className="muted">-</span>}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td style={{ textAlign: 'center' }}>{totalWeek.count}</td>
              <td className="num">{fmtNum(totalWeek.gross, 2)}</td>
              <td className="num" style={{ color: 'var(--bad)' }}>({fmtNum(Math.abs(totalWeek.debt), 2)})</td>
              <td className="num">{fmtNum(totalWeek.net, 2)}</td>
            </tr>
          </tfoot>
        </table>
      </SectionCard>

      {/* SECTION 03 — Outstanding invoices that cannot be tracked this month → rollover next month */}
      <SectionCard num="03" title="ประมาณการรับเงินจากใบแจ้งหนี้คงค้าง" subtitle="ที่ไม่สามารถติดตามได้ในเดือนนี้ · โครงการที่ออก IV แล้ว แต่ยังไม่ได้รับเงิน → คาดรับเดือนถัดไป" totalLabel="คาดการณ์รับในเดือนถัดไป" total={warroomP1.outstandingTotal.net}>
        {/* Summary breakdown — total + next month rollover */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 0, padding: '12px 18px', borderBottom: '1px dashed var(--line)', background: 'linear-gradient(180deg, var(--ink-50), white)' }}>
          <OutstandingMiniStat
            label="ใบแจ้งหนี้ในระบบทั้งหมด"
            count={warroomP1.outstandingSummary.systemTotal.count}
            net={warroomP1.outstandingSummary.systemTotal.net}
            accent="var(--ink-700)"
            anchor="left"
            hint="รวมทุกใบที่ยังไม่ได้รับเงิน"
          />
          <OutstandingMiniStat
            label="คาดรับเดือนถัดไป"
            count={warroomP1.outstandingSummary.nextMonthRollover.count}
            net={warroomP1.outstandingSummary.nextMonthRollover.net}
            accent="oklch(60% 0.16 75)"
            anchor="right"
            hint="ตารางด้านล่าง · แยกตามโอนสิทธิ์"
            highlight
          />
        </div>

        {/* Rollover next-month table */}
        <table className="tbl">
          <thead>
            <tr>
              <th>ประเภทการโอนสิทธิ์</th>
              <th style={{ width: 90, textAlign: 'center' }}>จำนวน</th>
              <th style={{ textAlign: 'right' }}>รายรับรวม (GROSS)</th>
              <th style={{ textAlign: 'right' }}>หักภาระหนี้ (Debt)</th>
              <th style={{ textAlign: 'right' }}>คงเหลือสุทธิ (NET)</th>
            </tr>
          </thead>
          <tbody>
            {warroomP1.outstandingByTransfer.map((t, i) => (
              <tr key={i}>
                <td><Badge kind={t.type.startsWith('โอน') ? 'b-amber' : 'b-blue'} dot={false}>{t.type}</Badge></td>
                <td style={{ textAlign: 'center' }}>{t.count}</td>
                <td className="num">{fmtNum(t.gross, 2)}</td>
                <td className="num" style={{ color: t.debt ? 'var(--bad)' : 'var(--ink-400)' }}>{t.debt ? '(' + fmtNum(Math.abs(t.debt), 2) + ')' : '-'}</td>
                <td className="num strong">{fmtNum(t.net, 2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total · คาดรับเดือนถัดไป</td>
              <td style={{ textAlign: 'center' }}>{warroomP1.outstandingTotal.count}</td>
              <td className="num">{fmtNum(warroomP1.outstandingTotal.gross, 2)}</td>
              <td className="num" style={{ color: 'var(--bad)' }}>({fmtNum(Math.abs(warroomP1.outstandingTotal.debt), 2)})</td>
              <td className="num">{fmtNum(warroomP1.outstandingTotal.net, 2)}</td>
            </tr>
          </tfoot>
        </table>
      </SectionCard>

      {/* SECTION 04 — WIP construction */}
      <SectionCard num="04" title="งานที่อยู่ระหว่างดำเนินการก่อสร้าง" subtitle="ยังไม่ส่งมอบงาน และยังไม่เปิดใบแจ้งหนี้" totalLabel="คาดการณ์รับสุทธิงานก่อสร้างทั้งหมด" total={warroomP1.wipTotal.net}>
        <table className="tbl">
          <thead>
            <tr>
              <th>ประเภทการโอนสิทธิ์</th>
              <th style={{ width: 90, textAlign: 'center' }}>จำนวน</th>
              <th style={{ textAlign: 'right' }}>รายรับรวม (GROSS)</th>
              <th style={{ textAlign: 'right' }}>หักภาระหนี้ (Debt)</th>
              <th style={{ textAlign: 'right' }}>คงเหลือสุทธิ (NET)</th>
            </tr>
          </thead>
          <tbody>
            {warroomP1.wipByTransfer.map((t, i) => (
              <tr key={i}>
                <td>
                  <Badge kind={t.type.startsWith('โอน') ? 'b-amber' : 'b-blue'} dot={false}>{t.type}</Badge>
                </td>
                <td style={{ textAlign: 'center' }}>{t.count}</td>
                <td className="num">{fmtNum(t.gross, 2)}</td>
                <td className="num" style={{ color: t.debt ? 'var(--bad)' : 'var(--ink-400)' }}>{t.debt ? '(' + fmtNum(Math.abs(t.debt), 2) + ')' : '-'}</td>
                <td className="num strong">{fmtNum(t.net, 2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td style={{ textAlign: 'center' }}>{warroomP1.wipTotal.count}</td>
              <td className="num">{fmtNum(warroomP1.wipTotal.gross, 2)}</td>
              <td className="num" style={{ color: 'var(--bad)' }}>({fmtNum(Math.abs(warroomP1.wipTotal.debt), 2)})</td>
              <td className="num">{fmtNum(warroomP1.wipTotal.net, 2)}</td>
            </tr>
          </tfoot>
        </table>
      </SectionCard>

      {/* (bottom callouts removed per user request — info already shown in section headers above) */}

      {/* SECTION 05 — Live Outstanding from data.invoices */}
      <SectionCard num="05" title="ประมาณการจากใบแจ้งหนี้คงค้าง (Live)" subtitle="คำนวณตรงจากระบบใบแจ้งหนี้ · ข้อมูลล่าสุด ณ ขณะนี้" totalLabel="ยอดคาดรับสุทธิรวม" total={liveTotal.net}>

        {/* Status breakdown strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 0, padding: '12px 18px', borderBottom: '1px dashed var(--line)', background: 'linear-gradient(180deg, var(--ink-50), white)' }}>
          <OutstandingMiniStat
            label="รอใบตรวจรับ"
            count={liveByStatus.pending_inspection.length}
            net={liveByStatus.pending_inspection.reduce((s, iv) => s + (iv.netExpected || 0), 0)}
            accent="var(--ink-700)"
            anchor="left"
            hint="ยังไม่เริ่มติดตาม"
          />
          <OutstandingMiniStat
            label="กำลังติดตาม"
            count={liveByStatus.tracking.length}
            net={liveByStatus.tracking.reduce((s, iv) => s + (iv.netExpected || 0), 0)}
            accent="var(--brand-700)"
            anchor="center"
            hint="มีวันคาดรับ / อยู่ระหว่างติดตาม"
          />
          <OutstandingMiniStat
            label="ติดปัญหา"
            count={liveByStatus.issue.length}
            net={liveByStatus.issue.reduce((s, iv) => s + (iv.netExpected || 0), 0)}
            accent="var(--bad)"
            anchor="right"
            hint="ต้องจัดการด่วน"
            highlight={liveByStatus.issue.length > 0}
          />
        </div>

        {/* By expected-receipt month */}
        <table className="tbl">
          <thead>
            <tr>
              <th>เดือนที่คาดรับ</th>
              <th style={{ width: 90, textAlign: 'center' }}>จำนวน</th>
              <th style={{ textAlign: 'right' }}>Balance (GROSS)</th>
              <th style={{ textAlign: 'right' }}>หักภาระหนี้ (Debt)</th>
              <th style={{ textAlign: 'right' }}>คาดรับสุทธิ (NET)</th>
            </tr>
          </thead>
          <tbody>
            {liveByMonth.length === 0 && (
              <tr><td colSpan={5} style={{ padding: '24px 14px', textAlign: 'center', color: 'var(--ink-400)' }}>ไม่มีข้อมูลใบแจ้งหนี้คงค้าง</td></tr>
            )}
            {liveByMonth.map(([month, ivs], i) => {
              const gross = ivs.reduce((s, iv) => s + (iv.balance || 0), 0);
              const debt  = ivs.reduce((s, iv) => s + (iv.debt  || 0), 0);
              const net   = ivs.reduce((s, iv) => s + (iv.netExpected || 0), 0);
              const isThis = month === liveThisMonth;
              let monthLabel;
              if (month === 'ไม่ระบุ') {
                monthLabel = <span className="muted">ยังไม่ระบุวันคาดรับ</span>;
              } else {
                const d = new Date(month + '-01T12:00:00');
                const thai = d.toLocaleDateString('th-TH-u-ca-gregory', { month: 'long', year: 'numeric' });
                monthLabel = (
                  <>
                    <span style={{ fontWeight: isThis ? 700 : 600 }}>{thai}</span>
                    <span className="muted" style={{ fontSize: 11.5, marginLeft: 6, fontWeight: 400 }}>({month})</span>
                    {isThis && <Badge kind="b-blue" dot={false} style={{ marginLeft: 8, fontSize: 10 }}>เดือนนี้</Badge>}
                  </>
                );
              }
              return (
                <tr key={i} style={{ background: isThis ? 'color-mix(in oklch,var(--brand-500) 5%,transparent)' : '' }}>
                  <td>{monthLabel}</td>
                  <td style={{ textAlign: 'center' }}>{ivs.length}</td>
                  <td className="num">{fmtNum(gross, 2)}</td>
                  <td className="num" style={{ color: debt ? 'var(--bad)' : 'var(--ink-400)' }}>
                    {debt ? '(' + fmtNum(Math.abs(debt), 2) + ')' : '-'}
                  </td>
                  <td className="num strong">{fmtNum(net, 2)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>Total · คงค้างทั้งหมด</td>
              <td style={{ textAlign: 'center' }}>{liveTotal.count}</td>
              <td className="num">{fmtNum(liveTotal.gross, 2)}</td>
              <td className="num" style={{ color: 'var(--bad)' }}>({fmtNum(Math.abs(liveTotal.debt), 2)})</td>
              <td className="num">{fmtNum(liveTotal.net, 2)}</td>
            </tr>
          </tfoot>
        </table>
      </SectionCard>

    </div>
  );
}

function KpiCallout({ label, value, unit = 'บาท', digits = 2, accent, icon, sub }) {
  return (
    <div className="kpi" style={{ paddingTop: 16 }}>
      <div className="kpi-accent" style={{ background: accent }} />
      <div className="kpi-label">
        {icon && <Icon name={icon} size={14} />}
        {label}
      </div>
      <div className="kpi-value">
        <AnimatedNumber value={value} digits={digits} />
        {unit && <span className="u">{unit}</span>}
      </div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--ink-500)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function SectionCard({ num, title, subtitle, totalLabel, total, children }) {
  return (
    <div className="card anim-in" style={{ marginBottom: 18, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, background: 'linear-gradient(180deg, var(--brand-50), white)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg, var(--brand-500), var(--brand-700))', color: 'white', display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 700, letterSpacing: '.02em' }}>{num}</div>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--ink-900)', fontSize: 15 }}>{title}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>{subtitle}</div>
          </div>
        </div>
        {total != null && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{totalLabel}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--brand-700)', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
              <AnimatedNumber value={total} digits={2} /> <span style={{ fontSize: 13, color: 'var(--ink-500)', fontWeight: 500 }}>บาท</span>
            </div>
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

function BigCallout({ tone, label, value, hint }) {
  const toneMap = {
    info: { bg: 'linear-gradient(135deg, var(--brand-500), var(--brand-700))', text: 'white' },
    warn: { bg: 'linear-gradient(135deg, oklch(75% 0.16 75), oklch(60% 0.16 75))', text: 'white' },
  };
  const t = toneMap[tone] || toneMap.info;
  return (
    <div className="card" style={{ background: t.bg, color: t.text, borderColor: 'transparent', padding: 22, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', right: -30, top: -30, width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
      <div style={{ fontSize: 13, opacity: 0.9, fontWeight: 500, position: 'relative' }}>{label}</div>
      <div style={{ fontSize: 36, fontWeight: 800, fontVariantNumeric: 'tabular-nums', marginTop: 6, position: 'relative', letterSpacing: '-.02em' }}>
        <AnimatedNumber value={value} digits={2} />
      </div>
      {hint && <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6, position: 'relative' }}>{hint}</div>}
    </div>
  );
}

function OutstandingMiniStat({ label, count, net, accent, anchor, hint, dimmed, highlight }) {
  const align = anchor === 'right' ? 'flex-end' : anchor === 'left' ? 'flex-start' : 'center';
  const textAlign = anchor === 'right' ? 'right' : anchor === 'left' ? 'left' : 'center';
  return (
    <div style={{
      padding: '8px 14px', display: 'flex', flexDirection: 'column', alignItems: align, gap: 3,
      borderLeft: anchor === 'left' ? 'none' : '1px dashed var(--line)',
      opacity: dimmed ? 0.55 : 1,
      background: highlight ? 'linear-gradient(135deg, var(--warn-bg), transparent)' : 'transparent',
      borderRadius: highlight ? 8 : 0,
    }}>
      <div style={{ fontSize: 11.5, color: 'var(--ink-500)', fontWeight: 500, textAlign }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 24, fontWeight: 700, color: accent, fontVariantNumeric: 'tabular-nums', letterSpacing: '-.01em' }}>
          <AnimatedNumber value={count} digits={0} />
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--ink-500)' }}>ใบ</span>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--ink-700)', fontVariantNumeric: 'tabular-nums', textAlign }}>
        NET <strong>{fmtNum(net, 2)}</strong> บาท
      </div>
      {hint && <div style={{ fontSize: 10.5, color: 'var(--ink-400)', textAlign, fontStyle: 'italic', marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

Object.assign(window, { WarRoomPage1, KpiCallout, SectionCard, BigCallout });
