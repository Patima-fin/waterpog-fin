// Weekly Cash Flow Forecast dashboard – matches the original Forecast PDF structure.
// 3 sections: (1) Monthly overview with Plan vs Actual comparisons,
//             (2) Weekly forecast — only current + remaining weeks,
//             (3) Comparison summary across all weeks with charts.
// Globals: React, KpiTile, AnimatedNumber, Badge, Icon, fmtNum, fmtMoney, CashFlowBar, AreaChart, ProgressBar, EditableCell

const { useState: cfState, useMemo: cfMemo } = React;

function CashFlowDashboard({ data, setData, toast }) {
  const cf = data.cashFlow;
  const weekLabels = ['WEEK 1', 'WEEK 2', 'WEEK 3', 'WEEK 4', 'WEEK 5'];
  const nowWeek = cf.nowWeek;  // index of current week (0-based)

  // Monthly totals
  const sumArr = (arr) => (arr || []).reduce((s, v) => s + (v || 0), 0);
  const inflowProject = cf.inflow.find(r => r.key === 'project') || { plan: [], actual: [] };
  const inflowLoan    = cf.inflow.find(r => r.key === 'loan')    || { plan: [], actual: [] };

  const planProject  = sumArr(inflowProject.plan);
  const planLoan     = sumArr(inflowLoan.plan);
  const planOutflow  = cf.outflow.reduce((s, r) => s + sumArr(r.plan), 0);
  const actualOutflow = cf.outflow.reduce((s, r) => s + sumArr(r.actual), 0);
  const actualProject = cf.revInflow;     // use authoritative summary from PDF
  const actualLoan    = cf.loanReceived;

  // Weekly Plan vs Actual totals (for the comparison chart)
  const weeklyInflow = weekLabels.map((_, i) => {
    const planSum = cf.inflow.reduce((s, r) => s + (r.plan[i] || 0), 0);
    const actualSum = cf.inflow.reduce((s, r) => s + (r.actual[i] || 0), 0);
    return { week: i + 1, plan: planSum, actual: actualSum };
  });
  const weeklyOutflow = weekLabels.map((_, i) => {
    const planSum = cf.outflow.reduce((s, r) => s + (r.plan[i] || 0), 0);
    const actualSum = cf.outflow.reduce((s, r) => s + (r.actual[i] || 0), 0);
    return { week: i + 1, plan: planSum, actual: actualSum };
  });

  const closingData = cf.closing.map((c, i) => ({ label: weekLabels[i], value: c }));

  // Visible weeks for section 2 (current + future)
  const visibleWeekIdx = weekLabels.map((_, i) => i).filter(i => i >= nowWeek);

  const [editEntry, setEditEntry] = cfState(null);

  // Forecast-entries summary (support both old lowercase & new uppercase field names)
  const upcomingEntries = data.forecastEntries.slice().sort((a, b) => {
    const da = a.DATE || a.date || '';
    const db = b.DATE || b.date || '';
    return da.localeCompare(db);
  });
  const upcomingInflow  = upcomingEntries.filter(e => Number(e.AMOUNT ?? e.amount ?? 0) > 0).reduce((s, e) => s + Number(e.AMOUNT ?? e.amount ?? 0), 0);
  const upcomingOutflow = upcomingEntries.filter(e => Number(e.AMOUNT ?? e.amount ?? 0) < 0).reduce((s, e) => s + Number(e.AMOUNT ?? e.amount ?? 0), 0);

  // Bank balance (from DATA BANK)
  const bankAccounts   = data.bankAccounts || [];
  const totalBankBal   = bankAccounts.reduce((s, r) => s + Number(r.BALANCE ?? r.balance ?? 0), 0);
  const totalAvailable = bankAccounts.reduce((s, r) => s + Number(r.AVAILABLE_BALANCE ?? 0), 0);

  const saveEntry = (entry) => {
    setData(d => ({
      ...d,
      forecastEntries: entry.id
        ? d.forecastEntries.map(x => x.id === entry.id ? entry : x)
        : [{ ...entry, id: WTPData.newId() }, ...d.forecastEntries],
    }));
    setEditEntry(null);
    toast('บันทึกรายการประมาณการแล้ว');
  };
  const removeEntry = (id) => {
    setData(d => ({ ...d, forecastEntries: d.forecastEntries.filter(x => x.id !== id) }));
    toast('ลบรายการแล้ว');
  };

  // Edit cell handler
  const editCell = (kind, key, weekIdx, field, newValue) => {
    setData(d => ({
      ...d,
      cashFlow: {
        ...d.cashFlow,
        [kind]: d.cashFlow[kind].map(row => {
          if (row.key !== key) return row;
          const arr = [...row[field]];
          arr[weekIdx] = Number(newValue) || 0;
          return { ...row, [field]: arr };
        }),
      },
    }));
  };

  return (
    <div className="page bg-pattern">
      <div className="page-head anim-in">
        <div>
          <h1 className="page-title">แผนประมาณการจ่ายรายสัปดาห์</h1>
          <div className="page-sub">Weekly Expenditure Forecast Plan · {cf.month} · ข้อมูล ณ วันที่ {fmtDate(data.meta.asOf)}</div>
        </div>
        <div className="page-head-r">
          <button className="btn btn-ghost"><Icon name="refresh" size={14} /> รีเฟรชจาก Excel</button>
          <a className="btn btn-primary" href="#data_forecast">
            <Icon name="plus" size={14} /> จัดการประมาณการนอกระบบ
          </a>
        </div>
      </div>

      {/* ───── SECTION 1 — Monthly Overview ───────────────────────────── */}
      <SectionTitle num="01" title="ภาพรวมประจำเดือน" subtitle="Monthly Cash Position · เทียบงบประมาณการกับจ่ายจริง" />

      {/* B/F + Net hero strip */}
      <div className="grid grid-2 anim-in" style={{ marginBottom: 14 }}>
        <BalanceCard tone="bf" label="เงินสดคงเหลือยกมา (B/F)" value={cf.bf} hint="ต้นเดือน · พฤษภาคม 2026" icon="coin" />
        <BalanceCard tone={cf.finalNet < 0 ? 'bad' : 'good'} label="คงเหลือสุทธิปัจจุบัน (Net Position)" value={cf.finalNet} hint={cf.finalNet < 0 ? 'ติดลบ — ต้องการเงินกู้/รับเงินเพิ่ม' : 'อยู่ในเกณฑ์ปลอดภัย'} icon={cf.finalNet < 0 ? 'arrow_down' : 'arrow_up'} />
      </div>

      {/* Bank balance strip (from DATA BANK) */}
      {bankAccounts.length > 0 && (
        <div className="card anim-in" style={{ marginBottom: 14, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', background: 'linear-gradient(90deg, color-mix(in oklch, var(--brand-500) 8%, transparent), transparent)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '0 0 auto' }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: 'var(--brand-100)', color: 'var(--brand-700)', display: 'grid', placeItems: 'center' }}><Icon name="bank" size={18} /></div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--ink-500)' }}>ยอดเงินในธนาคารจริง (DATA BANK · {bankAccounts.length} บัญชี)</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: totalBankBal < 0 ? 'var(--bad)' : 'var(--good)' }}>{fmtNum(totalBankBal, 2)} <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>฿</span></div>
            </div>
          </div>
          <div style={{ flex: 1, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {bankAccounts.map((b, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>{b.BANK_NAME || b.bankName}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: Number(b.BALANCE ?? b.balance ?? 0) < 0 ? 'var(--bad)' : 'var(--ink-900)', fontVariantNumeric: 'tabular-nums' }}>{fmtNum(Number(b.BALANCE ?? b.balance ?? 0), 0)}</div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
            <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>AVAILABLE รวม</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'oklch(60% 0.18 295)' }}>{fmtNum(totalAvailable, 2)} ฿</div>
            <a href="#data_bank" style={{ fontSize: 11, color: 'var(--brand-600)', textDecoration: 'none' }}>→ แก้ไขยอด</a>
          </div>
        </div>
      )}

      {/* 3 Plan-vs-Actual comparison cards */}
      <div className="grid grid-3 anim-stagger" style={{ marginBottom: 22 }}>
        <PlanVsActualCard
          tone="good"
          icon="bank"
          label="รับเงินโครงการ"
          plan={planProject || 8500523.50}
          actual={actualProject}
          unit="บาท"
          hint="เงินเข้าจากค่างวด/ใบแจ้งหนี้รับชำระ"
        />
        <PlanVsActualCard
          tone="info"
          icon="money"
          label="เงินกู้/สินเชื่อหมุนเวียน"
          plan={planLoan || 3200000}
          actual={actualLoan}
          unit="บาท"
          hint={`วงเงินรวม ${fmtMoney(cf.loanLine, { compact: true, digits: 1 })} ลบ. · เบิกแล้ว ${((cf.loanReceived / cf.loanLine) * 100).toFixed(1)}%`}
        />
        <PlanVsActualCard
          tone="bad"
          icon="arrow_up"
          label="ค่าใช้จ่ายรวม"
          plan={planOutflow || cf.planTotal}
          actual={actualOutflow || cf.actualPaid}
          unit="บาท"
          hint="รวม 4 หมวด: ดำเนินงาน / โครงการ / การเงิน / เบ็ดเตล็ด"
        />
      </div>

      {/* ───── SECTION 2 — Weekly forecast (current + future only) ───── */}
      <SectionTitle num="02"
        title="ประมาณการรายสัปดาห์ที่ยังเหลือ"
        subtitle={`Weekly Forecast · เริ่มจาก WEEK ${nowWeek + 1} (ปัจจุบัน) ถึงสิ้นเดือน · สัปดาห์ที่ผ่านไปแล้วดูได้ที่ส่วนที่ 03`}
      />

      <div className="card anim-in" style={{ marginBottom: 22, padding: 18 }}>
        <div className="card-hd">
          <div>
            <div className="card-title">รายการประมาณการจ่ายรายสัปดาห์</div>
            <div className="card-sub">Click ตัวเลขเพื่อแก้ Plan — ข้อมูล Actual จะดึงจากระบบธนาคารและ DATA BANK</div>
          </div>
          <Badge kind="b-amber">{visibleWeekIdx.length} สัปดาห์เหลือ</Badge>
        </div>

        <div className="week-grid" style={{ gridTemplateColumns: `220px repeat(${visibleWeekIdx.length}, 1fr) 140px` }}>
          <div className="h">รายการ</div>
          {visibleWeekIdx.map(i => (
            <div key={i} className={`h ${i === nowWeek ? 'is-now' : ''}`}>
              {weekLabels[i]}{i === nowWeek && ' • ปัจจุบัน'}
            </div>
          ))}
          <div className="h">รวม (สัปดาห์ที่เหลือ)</div>

          {/* Inflow section */}
          <div className="sec">1: กระแสเงินสดเข้า (Inflow)</div>
          {cf.inflow.filter(r => r.key !== 'bf').map(row => {
            const remainPlan = visibleWeekIdx.reduce((s, i) => s + (row.plan[i] || 0), 0);
            return (
              <React.Fragment key={row.key}>
                <div className="cat">{row.label}</div>
                {visibleWeekIdx.map(i => (
                  <div key={i} className="cell">
                    <EditableCell value={row.plan[i] || 0} type="number" onChange={(nv) => editCell('inflow', row.key, i, 'plan', nv)} align="right" />
                  </div>
                ))}
                <div className="cell total">{fmtNum(remainPlan, 0)}</div>
              </React.Fragment>
            );
          })}

          {/* Outflow section */}
          <div className="sec out">2: กระแสเงินสดออก (Outflow)</div>
          {cf.outflow.map(row => {
            const remainPlan = visibleWeekIdx.reduce((s, i) => s + (row.plan[i] || 0), 0);
            return (
              <React.Fragment key={row.key}>
                <div className="cat">{row.label}</div>
                {visibleWeekIdx.map(i => (
                  <div key={i} className="cell">
                    <EditableCell value={row.plan[i] || 0} type="number" onChange={(nv) => editCell('outflow', row.key, i, 'plan', nv)} align="right" />
                  </div>
                ))}
                <div className="cell total">{fmtNum(remainPlan, 0)}</div>
              </React.Fragment>
            );
          })}

          {/* Closing per week */}
          <div className="sec net">ยอดคงเหลือสุทธิปลายงวด (Final Net Position)</div>
          <div className="cat">คงเหลือสุทธิ</div>
          {visibleWeekIdx.map(i => (
            <div key={i} className={`cell ${cf.closing[i] < 0 ? 'neg' : 'actual'}`} style={{ fontWeight: 700 }}>
              {fmtNum(cf.closing[i], 0)}
            </div>
          ))}
          <div className="cell total" style={{ color: cf.finalNet < 0 ? 'var(--bad)' : 'var(--good)' }}>{fmtNum(cf.finalNet, 0)}</div>
        </div>
      </div>

      {/* Forecast entries (รายการประมาณการนอกระบบ) — moved to จัดการข้อมูล page */}
      <div className="card anim-in" style={{ marginBottom: 22, padding: 14, background: 'linear-gradient(135deg, var(--brand-50), white)', borderColor: 'var(--brand-100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--brand-100)', color: 'var(--brand-700)', display: 'grid', placeItems: 'center' }}><Icon name="forecast" size={18} /></div>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink-900)' }}>รายการประมาณการนอกระบบ · {data.forecastEntries.length} รายการ</div>
            <div style={{ fontSize: 12, color: 'var(--ink-600)' }}>สุทธิ {fmtNum(upcomingInflow + upcomingOutflow, 0)} บาท · ย้ายไปจัดการที่หน้า "ประมาณการนอกระบบ"</div>
          </div>
        </div>
        <a className="btn btn-primary btn-sm" href="#data_forecast">
          <Icon name="arrow" size={12} /> ไปจัดการ
        </a>
      </div>

      {/* ───── SECTION 3 — Weekly comparison summary (all weeks) ────── */}
      <SectionTitle num="03"
        title="สรุปภาพรวมเปรียบเทียบรายสัปดาห์"
        subtitle="Weekly Comparison Summary · เทียบ Plan vs Actual ทั้ง 5 สัปดาห์ พร้อมแนวโน้มเงินคงเหลือ"
      />

      <div className="grid grid-2 anim-in" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="card-hd"><div className="card-title">เทียบ Plan vs Actual รายสัปดาห์ (เงินสดออก)</div></div>
          <PlanActualBars weekly={weeklyOutflow} nowWeek={nowWeek} />
        </div>
        <div className="card">
          <div className="card-hd"><div className="card-title">เงินคงเหลือสุทธิรายสัปดาห์ (Final Net Position)</div></div>
          <AreaChart data={closingData} color="oklch(60% 0.18 22)" height={220} />
        </div>
      </div>

      <div className="card anim-in" style={{ marginBottom: 18, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)' }}>
          <div className="card-title">งบประมาณการจ่ายเทียบจริงสะสม</div>
          <div className="card-sub">Total Paid {((actualOutflow / planOutflow) * 100).toFixed(2)}% of {fmtMoney(planOutflow, { compact: true, digits: 1 })} ลบ. Plan</div>
        </div>
        <div style={{ padding: 18, display: 'grid', gap: 18 }}>
          <ProgressBar
            value={(actualOutflow / planOutflow) * 100}
            max={100} kind="brand" height={10}
            label={<><span>จ่ายจริงสะสม</span><span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmtNum(actualOutflow, 0)} / {fmtNum(planOutflow, 0)} บาท</span></>}
          />
          <CashFlowBar inflow={cf.revInflow + cf.loanReceived} outflow={cf.actualPaid} net={cf.finalNet} />
        </div>
      </div>

      <div className="card anim-in" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)' }}>
          <div className="card-title">ตารางสรุปทุกสัปดาห์ (รวมที่ผ่านไปแล้ว)</div>
          <div className="card-sub">ดูข้อมูลย้อนหลังของสัปดาห์ที่ผ่านมา</div>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>สัปดาห์</th>
              <th style={{ textAlign: 'right' }}>Plan Out</th>
              <th style={{ textAlign: 'right' }}>Actual Out</th>
              <th style={{ textAlign: 'right' }}>ส่วนต่าง</th>
              <th style={{ textAlign: 'right' }}>% ใช้จ่าย</th>
              <th style={{ textAlign: 'right' }}>คงเหลือสิ้นงวด</th>
              <th>สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {weekLabels.map((w, i) => {
              const status = i < nowWeek ? 'past' : i === nowWeek ? 'now' : 'future';
              const diff = weeklyOutflow[i].actual - weeklyOutflow[i].plan;
              const pct = weeklyOutflow[i].plan > 0 ? (weeklyOutflow[i].actual / weeklyOutflow[i].plan) * 100 : 0;
              return (
                <tr key={i} style={status === 'now' ? { background: 'var(--brand-50)' } : status === 'past' ? { opacity: 0.85 } : {}}>
                  <td>
                    <div style={{ fontWeight: 700 }}>{w}</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>
                      {status === 'past' ? 'ผ่านไปแล้ว' : status === 'now' ? 'สัปดาห์ปัจจุบัน' : 'สัปดาห์ถัดไป'}
                    </div>
                  </td>
                  <td className="num">{fmtNum(weeklyOutflow[i].plan, 0)}</td>
                  <td className="num" style={{ color: 'var(--bad)' }}>{fmtNum(weeklyOutflow[i].actual, 0)}</td>
                  <td className="num" style={{ color: diff > 0 ? 'var(--bad)' : 'var(--good)' }}>{diff > 0 ? '+' : ''}{fmtNum(diff, 0)}</td>
                  <td className="num strong">{weeklyOutflow[i].plan > 0 ? pct.toFixed(1) + '%' : <span className="muted">—</span>}</td>
                  <td className="num" style={{ color: cf.closing[i] < 0 ? 'var(--bad)' : 'var(--good)', fontWeight: 700 }}>{fmtNum(cf.closing[i], 0)}</td>
                  <td>
                    {status === 'past'   && <Badge kind="b-gray"  dot={false}>ผ่านไปแล้ว</Badge>}
                    {status === 'now'    && <Badge kind="b-amber" dot>ปัจจุบัน</Badge>}
                    {status === 'future' && <Badge kind="b-blue"  dot={false}>คาดการณ์</Badge>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ForecastEntryModal entry={editEntry} onClose={() => setEditEntry(null)} onSave={saveEntry} />
    </div>
  );
}

// keep ForecastEntryModal for reuse from data pages — exported below

// ── Helpers ─────────────────────────────────────────────────────────

function SectionTitle({ num, title, subtitle }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 0 14px' }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg, var(--brand-500), var(--brand-700))', color: 'white', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 14 }}>{num}</div>
      <div>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--ink-900)' }}>{title}</h2>
        <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>{subtitle}</div>
      </div>
    </div>
  );
}

function BalanceCard({ tone, label, value, hint, icon }) {
  const tones = {
    bf:   { bg: 'linear-gradient(135deg, var(--brand-500), var(--brand-700))', text: 'white' },
    good: { bg: 'linear-gradient(135deg, oklch(65% 0.16 152), oklch(50% 0.16 152))', text: 'white' },
    bad:  { bg: 'linear-gradient(135deg, oklch(65% 0.18 22), oklch(50% 0.18 22))',   text: 'white' },
  };
  const t = tones[tone] || tones.bf;
  return (
    <div className="card" style={{ background: t.bg, color: t.text, borderColor: 'transparent', padding: 22, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', right: -40, top: -40, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13, opacity: 0.9, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
            {icon && <Icon name={icon} size={14} />} {label}
          </div>
          <div style={{ fontSize: 36, fontWeight: 800, fontVariantNumeric: 'tabular-nums', marginTop: 6, letterSpacing: '-.02em' }}>
            <AnimatedNumber value={value} digits={2} />
          </div>
          {hint && <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>{hint}</div>}
        </div>
      </div>
    </div>
  );
}

function PlanVsActualCard({ tone, icon, label, plan, actual, unit, hint }) {
  const pct = plan > 0 ? Math.max(0, Math.min(150, (actual / plan) * 100)) : 0;
  const gap = actual - plan;
  const tones = {
    good: { accent: 'var(--good)', bg: 'var(--good-bg)' },
    bad:  { accent: 'var(--bad)',  bg: 'var(--bad-bg)' },
    info: { accent: 'var(--info)', bg: 'var(--brand-50)' },
  };
  const t = tones[tone] || tones.info;
  return (
    <div className="card" style={{ padding: 18, position: 'relative' }}>
      <div className="kpi-accent" style={{ background: t.accent }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-700)', fontWeight: 600 }}>
          {icon && <Icon name={icon} size={15} />}{label}
        </div>
        <Badge kind={pct >= 100 ? 'b-green' : pct >= 50 ? 'b-blue' : 'b-amber'} dot={false}>{pct.toFixed(1)}%</Badge>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Plan</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink-700)', fontVariantNumeric: 'tabular-nums' }}>
            <AnimatedNumber value={plan} digits={0} />
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Actual</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: t.accent, fontVariantNumeric: 'tabular-nums' }}>
            <AnimatedNumber value={actual} digits={0} />
          </div>
        </div>
      </div>

      <div style={{ marginTop: 14, position: 'relative' }}>
        <div style={{ height: 8, background: 'var(--ink-100)', borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
          <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: `linear-gradient(90deg, ${t.accent} 0%, ${t.accent} 100%)`, borderRadius: 6, transition: 'width 800ms cubic-bezier(.2,.7,.2,1)' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--ink-500)', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
          <span>{hint}</span>
          <span style={{ color: gap >= 0 ? (tone === 'bad' ? 'var(--bad)' : 'var(--good)') : (tone === 'bad' ? 'var(--good)' : 'var(--bad)'), fontWeight: 600 }}>
            {gap >= 0 ? '+' : ''}{fmtNum(gap, 0)}
          </span>
        </div>
      </div>
    </div>
  );
}

function PlanActualBars({ weekly, nowWeek }) {
  const max = Math.max(...weekly.map(w => Math.max(w.plan, w.actual))) || 1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
      {weekly.map((w, i) => {
        const planW = (w.plan / max) * 100;
        const actW  = (w.actual / max) * 100;
        const isNow = i === nowWeek;
        const isPast = i < nowWeek;
        return (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 160px', gap: 8, alignItems: 'center', opacity: isPast ? 0.7 : 1 }}>
            <div style={{ fontSize: 12, fontWeight: isNow ? 700 : 500, color: isNow ? 'var(--brand-700)' : 'var(--ink-700)' }}>
              WEEK {w.week}{isNow && ' •'}
            </div>
            <div style={{ display: 'grid', gap: 3 }}>
              {/* Plan */}
              <div style={{ position: 'relative', height: 10, background: 'var(--ink-100)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${planW}%`, height: '100%', background: 'oklch(75% 0.10 250)', borderRadius: 4, transition: `width ${300 + i * 80}ms ease` }} />
              </div>
              {/* Actual */}
              <div style={{ position: 'relative', height: 10, background: 'var(--ink-100)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${actW}%`, height: '100%', background: 'oklch(55% 0.16 22)', borderRadius: 4, transition: `width ${300 + i * 80}ms ease` }} />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
              <span style={{ color: 'oklch(60% 0.10 250)' }}>P {fmtMoney(w.plan, { compact: true, digits: 1 })}</span>
              <span style={{ color: 'var(--bad)' }}>A {fmtMoney(w.actual, { compact: true, digits: 1 })}</span>
            </div>
          </div>
        );
      })}
      <div style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: 11.5, color: 'var(--ink-600)', borderTop: '1px dashed var(--line)', paddingTop: 8 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 12, height: 6, borderRadius: 2, background: 'oklch(75% 0.10 250)' }} /> Plan
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 12, height: 6, borderRadius: 2, background: 'oklch(55% 0.16 22)' }} /> Actual
        </span>
      </div>
    </div>
  );
}

function ForecastEntryModal({ entry, onClose, onSave }) {
  const [draft, setDraft] = cfState(entry);
  React.useEffect(() => { setDraft(entry); }, [entry]);
  if (!entry) return null;
  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));
  return (
    <Modal open={!!entry} title={entry.id ? 'แก้ไขรายการประมาณการ' : 'เพิ่มรายการประมาณการ'} onClose={onClose} footer={<>
      <button className="btn btn-ghost" onClick={onClose}>ยกเลิก</button>
      <button className="btn btn-primary" onClick={() => onSave(draft)}><Icon name="check" size={14} /> บันทึก</button>
    </>}>
      <div style={{ display: 'grid', gap: 12 }}>
        <div className="field"><label>วันที่คาดการณ์</label>
          <input className="input" type="date" value={draft.date || ''} onChange={(e) => set('date', e.target.value)} />
        </div>
        <div className="field"><label>รายการ</label>
          <input className="input" value={draft.label || ''} onChange={(e) => set('label', e.target.value)} placeholder="เช่น เบิกสินเชื่อหมุนเวียน" />
        </div>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
          <div className="field"><label>ประเภท</label>
            <select className="select input" value={draft.category || 'inflow_project'} onChange={(e) => set('category', e.target.value)}>
              <option value="inflow_project">เข้า — โครงการ</option>
              <option value="inflow_loan">เข้า — เงินกู้</option>
              <option value="outflow_op">ออก — ดำเนินงาน</option>
              <option value="outflow_proj">ออก — โครงการ</option>
              <option value="outflow_fin">ออก — การเงิน</option>
              <option value="outflow_misc">ออก — เบ็ดเตล็ด</option>
            </select>
          </div>
          <div className="field"><label>มูลค่า (บาท) — ติดลบ = เงินออก</label>
            <input className="input" type="number" value={draft.amount || 0} onChange={(e) => set('amount', Number(e.target.value))} />
          </div>
        </div>
        <div className="field"><label>หมายเหตุ</label>
          <textarea className="input" rows={2} value={draft.note || ''} onChange={(e) => set('note', e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

Object.assign(window, { CashFlowDashboard, ForecastEntryModal });
