// War Room — Page 1: Revenue Collection & Receivables Overview
// Sections 01–03 use live data: data.receipts + data.invoices
// Section 04 uses pre-computed sheet data (WIP construction)
// Globals: React, KpiTile, AnimatedNumber, Badge, Icon, fmtNum, fmtMoney, fmtDate

const { useMemo: wr1Memo } = React;

function WarRoomPage1({ data, setData, toast }) {
  const { warroomP1, meta } = data;

  // ── Finance lookup for debt enrichment ──────────────────────────────────────
  const { financeByCode } = wr1Memo(() => WTPData.buildLookups(data), [data.projects]);

  const liveToday     = new Date().toISOString().slice(0, 10);
  const liveYear      = liveToday.slice(0, 4);
  const liveThisMonth = liveToday.slice(0, 7);

  const liveMonthName = wr1Memo(() =>
    new Date(liveThisMonth + '-01T12:00:00').toLocaleDateString('th-TH-u-ca-gregory', { month: 'long', year: 'numeric' }),
    [liveThisMonth]
  );

  // ════════════════════════════════════════════════════════════════════════════
  // SECTION 01 — YTD จาก data.receipts (ประวัติรับเงิน)
  // ════════════════════════════════════════════════════════════════════════════
  const liveYtd = wr1Memo(() => {
    const map = {};
    (data.receipts || []).forEach(r => {
      const m = r.receiptDate ? r.receiptDate.slice(0, 7) : null;
      if (!m || !m.startsWith(liveYear)) return;
      (map[m] = map[m] || []).push(r);
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([m, recs]) => {
        const d = new Date(m + '-01T12:00:00');
        return {
          month: d.toLocaleDateString('th-TH-u-ca-gregory', { month: 'long' }),
          en:    d.toLocaleString('en-US', { month: 'short' }),
          count: recs.length,
          gross: recs.reduce((s, r) => s + (Number(r.grossAmount)         || 0), 0),
          debt:  recs.reduce((s, r) => s + (Number(r.transferDeduction)   || 0), 0),
          net:   recs.reduce((s, r) => s + (Number(r.netReceived)         || 0), 0),
        };
      });
  }, [data.receipts, liveYear]);

  const liveYtdTotal = wr1Memo(() => liveYtd.reduce((acc, m) => ({
    count: acc.count + m.count,
    gross: acc.gross + m.gross,
    debt:  acc.debt  + m.debt,
    net:   acc.net   + m.net,
  }), { count: 0, gross: 0, debt: 0, net: 0 }), [liveYtd]);

  // ════════════════════════════════════════════════════════════════════════════
  // OUTSTANDING ROWS — base for Section 02 & 03
  // ════════════════════════════════════════════════════════════════════════════
  const WR_ALIAS = { pending: 'tracking', '': 'pending_inspection' };
  const WR_VALID = new Set(['pending_inspection', 'tracking', 'issue', 'paid']);

  const liveOuts = wr1Memo(() => (data.invoices || []).flatMap(iv => {
    const rawStatus = (iv.status || '').toString().trim();
    const aliased   = WR_ALIAS[rawStatus] != null ? WR_ALIAS[rawStatus] : rawStatus;
    const status    = WR_VALID.has(aliased) ? aliased : 'pending_inspection';
    if (status === 'paid') return [];
    const s  = (iv.jobNo || '').trim();
    const mx = s.match(/^(.+)-([A-Z]{2,6})$/);
    const cj = mx ? mx[1] : s;
    const f        = financeByCode[cj] || financeByCode[iv.contractRef] || {};
    const debt     = Number(f.debt ?? f['ภาระหนี้'] ?? 0);
    const balance  = Number(iv.balance) || 0;              // ← Number() ป้องกัน string concat
    const assignee = f.assignee || f['ผู้รับโอนสิทธิ์'] || '';
    return [{ ...iv, jobNo: cj, status, debt, balance, netExpected: balance - debt, assignee }];
  }), [data.invoices, financeByCode]);

  // ════════════════════════════════════════════════════════════════════════════
  // SECTION 02 — คาดการณ์รับเดือนปัจจุบัน (expectedReceive เดือนนี้)
  // ════════════════════════════════════════════════════════════════════════════
  const thisMthIvs = wr1Memo(() =>
    liveOuts.filter(iv => iv.expectedReceive && iv.expectedReceive.startsWith(liveThisMonth)),
    [liveOuts, liveThisMonth]
  );

  // จัดกลุ่มตามสัปดาห์ภายในเดือน: สัปดาห์ 1=วันที่ 1-7, 2=8-14, 3=15-21, 4=22-28, 5=29+
  const thisMthByWeek = wr1Memo(() => {
    const weeks = [1,2,3,4,5].map(w => ({ week: w, count: 0, gross: 0, debt: 0, net: 0 }));
    thisMthIvs.forEach(iv => {
      const day  = parseInt((iv.expectedReceive || '').slice(8, 10), 10) || 1;
      const wIdx = Math.min(Math.ceil(day / 7), 5) - 1;
      weeks[wIdx].count++;
      weeks[wIdx].gross += iv.balance;
      weeks[wIdx].debt  += iv.debt;
      weeks[wIdx].net   += iv.netExpected;
    });
    return weeks;
  }, [thisMthIvs]);

  const thisMthTotal = wr1Memo(() => thisMthByWeek.reduce((acc, w) => ({
    count: acc.count + w.count,
    gross: acc.gross + w.gross,
    debt:  acc.debt  + w.debt,
    net:   acc.net   + w.net,
  }), { count: 0, gross: 0, debt: 0, net: 0 }), [thisMthByWeek]);

  // ════════════════════════════════════════════════════════════════════════════
  // SECTION 03 — ใบแจ้งหนี้คงค้างนอกเดือนปัจจุบัน (คาดรับเดือนถัดไป)
  // ════════════════════════════════════════════════════════════════════════════
  const nextMthIvs = wr1Memo(() =>
    liveOuts.filter(iv => !iv.expectedReceive || !iv.expectedReceive.startsWith(liveThisMonth)),
    [liveOuts, liveThisMonth]
  );

  // แยกตามโอนสิทธิ์ (infer จาก assignee)
  const nextMthByTransfer = wr1Memo(() => {
    const m = {
      'ไม่โอนสิทธิรับเงิน': { count: 0, gross: 0, debt: 0, net: 0 },
      'โอนสิทธิรับเงิน':    { count: 0, gross: 0, debt: 0, net: 0 },
    };
    nextMthIvs.forEach(iv => {
      const k = (iv.assignee && iv.assignee !== '—') ? 'โอนสิทธิรับเงิน' : 'ไม่โอนสิทธิรับเงิน';
      m[k].count++;
      m[k].gross += iv.balance;
      m[k].debt  += iv.debt;
      m[k].net   += iv.netExpected;
    });
    return Object.entries(m).map(([type, v]) => ({ type, ...v }));
  }, [nextMthIvs]);

  const outstandingAll = wr1Memo(() => ({
    count: liveOuts.length,
    gross: liveOuts.reduce((s, iv) => s + iv.balance, 0),
    debt:  liveOuts.reduce((s, iv) => s + iv.debt,    0),
    net:   liveOuts.reduce((s, iv) => s + iv.netExpected, 0),
  }), [liveOuts]);

  const nextMthTotal = wr1Memo(() => ({
    count: nextMthIvs.length,
    gross: nextMthIvs.reduce((s, iv) => s + iv.balance, 0),
    debt:  nextMthIvs.reduce((s, iv) => s + iv.debt,    0),
    net:   nextMthIvs.reduce((s, iv) => s + iv.netExpected, 0),
  }), [nextMthIvs]);

  return (
    <div className="page bg-pattern">
      <div className="page-head anim-in">
        <div>
          <h1 className="page-title">Revenue Collection & Receivables Overview</h1>
          <div className="page-sub">การเงินด้านรับ · {meta.companyName} · ข้อมูล ณ {fmtDate(liveToday)}</div>
        </div>
        <div className="page-head-r">
          <a className="btn btn-ghost" href="#warroom2"><Icon name="arrow" size={14} /> หน้าถัดไป · ประมาณการรายปี</a>
          <button className="btn btn-ghost"><Icon name="download" size={14} /> ส่งออก PDF</button>
        </div>
      </div>

      {/* SECTION 01 — Annual YTD (from data.receipts) */}
      <SectionCard num="01" title="รายรับสะสมประจำปี" subtitle={`Annual YTD · เงินรับสะสมจากชีทประวัติรับเงิน · ปี ${liveYear}`} totalLabel="Total YTD" total={liveYtdTotal.net}>
        <table className="tbl">
          <thead>
            <tr>
              <th>เดือน (Month)</th>
              <th style={{ width: 90, textAlign: 'center' }}>จำนวน</th>
              <th style={{ textAlign: 'right' }}>รายรับรวม (GROSS)</th>
              <th style={{ textAlign: 'right' }}>หักโอนสิทธิ์ (Deduct)</th>
              <th style={{ textAlign: 'right' }}>เงินเข้าจริง (NET)</th>
            </tr>
          </thead>
          <tbody>
            {liveYtd.length === 0 && (
              <tr><td colSpan={5} style={{ padding: '24px 14px', textAlign: 'center', color: 'var(--ink-400)' }}>ไม่มีข้อมูลใบรับเงินในปีนี้</td></tr>
            )}
            {liveYtd.map((m, i) => (
              <tr key={i}>
                <td>
                  <span style={{ fontWeight: 600 }}>{m.month}</span>
                  <span className="muted" style={{ fontSize: 11.5, marginLeft: 6, fontWeight: 400 }}>({m.en})</span>
                </td>
                <td style={{ textAlign: 'center' }}>{m.count}</td>
                <td className="num">{fmtNum(m.gross, 2)}</td>
                <td className="num" style={{ color: m.debt ? 'var(--bad)' : 'var(--ink-400)' }}>
                  {m.debt ? '(' + fmtNum(m.debt, 2) + ')' : '-'}
                </td>
                <td className="num strong">{fmtNum(m.net, 2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total YTD</td>
              <td style={{ textAlign: 'center' }}>{liveYtdTotal.count}</td>
              <td className="num">{fmtNum(liveYtdTotal.gross, 2)}</td>
              <td className="num" style={{ color: 'var(--bad)' }}>({fmtNum(liveYtdTotal.debt, 2)})</td>
              <td className="num">{fmtNum(liveYtdTotal.net, 2)}</td>
            </tr>
          </tfoot>
        </table>
      </SectionCard>

      {/* SECTION 02 — This-month forecast (from data.invoices, expectedReceive = this month) */}
      <SectionCard num="02" title="คาดการณ์ได้รับเพิ่มในเดือนปัจจุบัน" subtitle={`รายสัปดาห์ · ${liveMonthName} · จากการติดตาม IV ที่ระบุวันคาดรับไว้ในเดือนนี้`} totalLabel="คาดการณ์ยอดรับสุทธิในเดือนนี้" total={thisMthTotal.net}>
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
            {thisMthTotal.count === 0 && (
              <tr><td colSpan={5} style={{ padding: '24px 14px', textAlign: 'center', color: 'var(--ink-400)' }}>ไม่มีใบแจ้งหนี้ที่ระบุวันคาดรับในเดือนนี้</td></tr>
            )}
            {thisMthTotal.count > 0 && thisMthByWeek.map((w, i) => (
              <tr key={i}>
                <td>สัปดาห์ที่ {w.week} <span className="muted" style={{ fontSize: 11 }}>({['1–7','8–14','15–21','22–28','29+'][i]})</span></td>
                <td style={{ textAlign: 'center' }}>{w.count}</td>
                <td className="num">{w.gross ? fmtNum(w.gross, 2) : <span className="muted">-</span>}</td>
                <td className="num" style={{ color: w.debt ? 'var(--bad)' : 'var(--ink-400)' }}>
                  {w.debt ? '(' + fmtNum(w.debt, 2) + ')' : '-'}
                </td>
                <td className="num strong">{w.net ? fmtNum(w.net, 2) : <span className="muted">-</span>}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td style={{ textAlign: 'center' }}>{thisMthTotal.count}</td>
              <td className="num">{fmtNum(thisMthTotal.gross, 2)}</td>
              <td className="num" style={{ color: 'var(--bad)' }}>({fmtNum(thisMthTotal.debt, 2)})</td>
              <td className="num">{fmtNum(thisMthTotal.net, 2)}</td>
            </tr>
          </tfoot>
        </table>
      </SectionCard>

      {/* SECTION 03 — Outstanding (NOT this month → roll to next month) */}
      <SectionCard num="03" title="ประมาณการรับเงินจากใบแจ้งหนี้คงค้าง" subtitle="IV ที่ยังไม่ได้รับเงิน และวันคาดรับอยู่นอกเดือนปัจจุบัน → คาดรับเดือนถัดไปขึ้นไป" totalLabel="คาดการณ์รับในเดือนถัดไป" total={nextMthTotal.net}>
        {/* Summary breakdown */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 0, padding: '12px 18px', borderBottom: '1px dashed var(--line)', background: 'linear-gradient(180deg, var(--ink-50), white)' }}>
          <OutstandingMiniStat
            label="ใบแจ้งหนี้คงค้างทั้งหมด"
            count={outstandingAll.count}
            net={outstandingAll.net}
            accent="var(--ink-700)"
            anchor="left"
            hint="รวมทุกใบที่ยังไม่ได้รับเงิน"
          />
          <OutstandingMiniStat
            label="คาดรับเดือนถัดไป"
            count={nextMthTotal.count}
            net={nextMthTotal.net}
            accent="oklch(60% 0.16 75)"
            anchor="right"
            hint="ตารางด้านล่าง · แยกตามโอนสิทธิ์"
            highlight
          />
        </div>

        {/* By transfer type */}
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
            {nextMthByTransfer.map((t, i) => (
              <tr key={i}>
                <td><Badge kind={t.type.startsWith('โอน') ? 'b-amber' : 'b-blue'} dot={false}>{t.type}</Badge></td>
                <td style={{ textAlign: 'center' }}>{t.count}</td>
                <td className="num">{t.gross ? fmtNum(t.gross, 2) : <span className="muted">-</span>}</td>
                <td className="num" style={{ color: t.debt ? 'var(--bad)' : 'var(--ink-400)' }}>
                  {t.debt ? '(' + fmtNum(t.debt, 2) + ')' : '-'}
                </td>
                <td className="num strong">{fmtNum(t.net, 2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total · คาดรับเดือนถัดไป</td>
              <td style={{ textAlign: 'center' }}>{nextMthTotal.count}</td>
              <td className="num">{fmtNum(nextMthTotal.gross, 2)}</td>
              <td className="num" style={{ color: 'var(--bad)' }}>({fmtNum(nextMthTotal.debt, 2)})</td>
              <td className="num">{fmtNum(nextMthTotal.net, 2)}</td>
            </tr>
          </tfoot>
        </table>
      </SectionCard>

      {/* SECTION 04 — WIP construction (pre-computed from sheet — ยังไม่ส่งมอบ ไม่มีใน data.invoices) */}
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
  const align     = anchor === 'right' ? 'flex-end' : anchor === 'left' ? 'flex-start' : 'center';
  const textAlign = anchor === 'right' ? 'right'    : anchor === 'left' ? 'left'       : 'center';
  return (
    <div style={{
      padding: '8px 14px', display: 'flex', flexDirection: 'column', alignItems: align, gap: 3,
      borderLeft: anchor === 'left' ? 'none' : '1px dashed var(--line)',
      opacity: dimmed ? 0.55 : 1,
      background: highlight ? 'linear-gradient(135deg, var(--warn-bg), transparent)' : 'transparent',
      borderRadius: highlight ? 8 : 0,
    }}>
      <div style={{ fontSize: 11.5, color: 'var(--ink-500)', fontWeight: 500, textAlign }}>{label}</div>
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
