/* page_debt.jsx — ภาระหนี้ทั้งหมด (projectFinance schema v2: LIT / KU / OTHER)
   ใช้ข้อมูลจาก data.projectFinance ที่ sync มาจาก Google Sheets
*/
'use strict';

// ── Constants ─────────────────────────────────────────────────────────────────
const DEBT_TYPE_META = {
  LIT:   { label: 'โอนสิทธิรับเงิน (LIT)', badge: 'b-blue',   color: '#2a6fdb', bg: '#ebf8ff', border: '#63b3ed' },
  KU:    { label: 'กู้ยืม / สินเชื่อ (KU)', badge: 'b-green',  color: '#276749', bg: '#f0fdf4', border: '#68d391' },
  OTHER: { label: 'อื่นๆ (OTHER)',            badge: 'b-gray',   color: '#475569', bg: '#f1f5f9', border: '#cbd5e0' },
};

const PERIOD_STATUS_META = {
  DONE:    { label: 'จ่ายแล้ว',  badge: 'b-green', color: '#276749' },
  PENDING: { label: 'รอจ่าย',   badge: 'b-amber',  color: '#b45309' },
  '':      null,
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function PeriodCell({ amount, pStatus }) {
  const n = Number(amount) || 0;
  const meta = PERIOD_STATUS_META[pStatus || ''];
  if (!n && !pStatus) return <span className="muted">—</span>;
  return (
    <div style={{ textAlign: 'right' }}>
      {n > 0 && (
        <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, fontSize: 12.5 }}>
          {fmtNum(n, 0)}
        </div>
      )}
      {meta && (
        <div style={{ marginTop: 2 }}>
          <Badge kind={meta.badge} dot={false}>{meta.label}</Badge>
        </div>
      )}
    </div>
  );
}

function DaysBadge({ endDate, isActive }) {
  if (!endDate) return <span className="muted">—</span>;
  const today = new Date().toISOString().slice(0, 10);
  const days  = Math.round((new Date(endDate) - new Date(today)) / 86400000);
  const color = !isActive ? 'var(--ink-300)'
    : days < 0   ? 'var(--bad)'
    : days <= 30 ? '#dd6b20'
    : 'var(--ink-600)';
  return (
    <div>
      <div style={{ fontSize: 12, color, whiteSpace: 'nowrap' }}>{fmtDate(endDate)}</div>
      {isActive && (
        <div style={{ fontSize: 10.5, color, marginTop: 1 }}>
          {days < 0 ? `⚠ เกิน ${Math.abs(days)} วัน` : `${days} วัน`}
        </div>
      )}
    </div>
  );
}

// ── ProjectSummaryRow — แสดง aggregate ต่อโครงการ ──────────────────────────
function ProjectSummaryBlock({ projectCode, rows }) {
  const [open, setOpen] = React.useState(false);
  const totalBalance  = rows.reduce((s, r) => s + (Number(r.balance) || 0), 0);
  const totalDebt     = rows.reduce((s, r) => s + (Number(r.totalDebt) || 0), 0);
  const totalPaid     = rows.reduce((s, r) => s + (Number(r.totalPaid) || 0), 0);
  const hasActive     = rows.some(r => r.status === 'Active');
  const assignees     = [...new Set(rows.map(r => r.assignee).filter(a => a && a !== '—'))];
  const types         = [...new Set(rows.map(r => r.debtType).filter(Boolean))];

  return (
    <React.Fragment>
      {/* Project header row */}
      <tr
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'var(--brand-50, #f0f6ff)',
          cursor: 'pointer',
          borderTop: '2px solid var(--brand-200, #b9d4ff)',
        }}
      >
        <td colSpan={2}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--ink-400)', transition: 'transform 200ms', display: 'inline-block', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
            <span style={{ fontFamily: 'ui-monospace', fontWeight: 800, fontSize: 13.5, color: 'var(--brand-700)' }}>
              {projectCode}
            </span>
            <span style={{ fontSize: 11, color: 'var(--ink-400)' }}>{rows.length} รายการ</span>
          </div>
        </td>
        <td colSpan={2}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {types.map(t => {
              const m = DEBT_TYPE_META[t];
              return m ? <Badge key={t} kind={m.badge} dot={false}>{t}</Badge> : null;
            })}
          </div>
        </td>
        <td>
          <Badge kind={hasActive ? 'b-blue' : 'b-gray'} dot={false}>
            {hasActive ? 'มีหนี้ค้าง' : 'ปิดครบแล้ว'}
          </Badge>
        </td>
        <td></td>
        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 13, color: 'var(--ink-700)' }}>
          {fmtNum(totalDebt, 0)}
        </td>
        <td colSpan={2}></td>
        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: 'var(--good)' }}>
          {totalPaid > 0 ? fmtNum(totalPaid, 0) : <span className="muted">—</span>}
        </td>
        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 800, fontSize: 14,
                     color: totalBalance > 0 ? 'var(--bad)' : 'var(--ink-400)' }}>
          {fmtNum(totalBalance, 0)}
        </td>
        <td colSpan={3}>
          {assignees.length > 0 && (
            <div style={{ fontSize: 11.5, color: 'var(--ink-600)' }}>{assignees.join(' · ')}</div>
          )}
        </td>
      </tr>

      {/* Detail rows */}
      {open && rows.map(r => (
        <DebtDetailRow key={r.id || r.debtorRef} r={r} indent />
      ))}
    </React.Fragment>
  );
}

// ── Flat detail row ───────────────────────────────────────────────────────────
function DebtDetailRow({ r, indent }) {
  const dt       = DEBT_TYPE_META[r.debtType] || DEBT_TYPE_META.OTHER;
  const isActive = r.status === 'Active';
  const balance  = Number(r.balance) || 0;
  const totalPaid = Number(r.totalPaid) || 0;
  const totalDebt = Number(r.totalDebt) || 0;

  return (
    <tr style={{ opacity: isActive ? 1 : 0.65, background: indent ? '#fafcff' : undefined }}>
      <td>
        {!indent && (
          <span style={{ fontFamily: 'ui-monospace', fontWeight: 700, fontSize: 12.5, color: 'var(--brand-700)' }}>
            {r.code}
          </span>
        )}
        {indent && (
          <span style={{ paddingLeft: 24, color: 'var(--ink-300)', fontSize: 11 }}>└─</span>
        )}
      </td>
      <td>
        <Badge kind={dt.badge} dot={false}>{r.debtType || '—'}</Badge>
      </td>
      <td style={{ fontSize: 11.5, fontFamily: 'ui-monospace', color: 'var(--ink-600)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {r.debtorRef || '—'}
      </td>
      <td>
        <Badge kind={isActive ? 'b-blue' : 'b-gray'} dot={false}>
          {isActive ? 'Active' : 'ปิดแล้ว'}
        </Badge>
      </td>
      <td><DaysBadge endDate={r.endDate} isActive={isActive} /></td>
      <td style={{ fontSize: 11, color: 'var(--ink-400)', whiteSpace: 'nowrap' }}>{fmtDate(r.startDate)}</td>
      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 12.5, fontWeight: 600 }}>
        {fmtNum(totalDebt, 0)}
      </td>
      <td><PeriodCell amount={r.period1Amount} pStatus={r.period1Status} /></td>
      <td><PeriodCell amount={r.period2Amount} pStatus={r.period2Status} /></td>
      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 12.5,
                   color: totalPaid > 0 ? 'var(--good)' : 'var(--ink-300)' }}>
        {totalPaid > 0 ? fmtNum(totalPaid, 0) : '—'}
      </td>
      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 13.5,
                   color: balance > 0 ? 'var(--bad)' : 'var(--ink-300)' }}>
        {fmtNum(balance, 0)}
      </td>
      <td>
        {r.assignee && r.assignee !== '—'
          ? <Badge kind="b-violet" dot={false}>{r.assignee}</Badge>
          : <span className="muted">—</span>}
      </td>
      <td style={{ fontSize: 12, color: 'var(--ink-600)' }}>{r.bank || '—'}</td>
      <td style={{ fontSize: 11.5, color: 'var(--ink-500)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          title={r.remark || ''}>
        {r.remark || ''}
      </td>
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
function DebtPage({ data }) {
  // รองรับทั้ง new schema (debtType field) และ old seed data
  const rawRows = (data?.projectFinance || WTPData.load().projectFinance || []);
  const allRows = React.useMemo(
    () => rawRows.filter(r => r.debtType),  // เฉพาะ schema ใหม่ที่มี debtType
    [rawRows]
  );

  const [tab,        setTab]        = React.useState('all');   // all | Active | Non-Active
  const [typeFilter, setTypeFilter] = React.useState('all');   // all | LIT | KU | OTHER
  const [query,      setQuery]      = React.useState('');
  const [viewMode,   setViewMode]   = React.useState('flat');  // flat | grouped

  const today = new Date().toISOString().slice(0, 10);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const activeRows   = allRows.filter(r => r.status === 'Active');
  const totalBalance = activeRows.reduce((s, r) => s + (Number(r.balance) || 0), 0);
  const litBalance   = activeRows.filter(r => r.debtType === 'LIT').reduce((s,r) => s + (Number(r.balance)||0), 0);
  const kuBalance    = activeRows.filter(r => r.debtType === 'KU').reduce((s,r) => s + (Number(r.balance)||0), 0);
  const totalPaid    = allRows.reduce((s, r) => s + (Number(r.totalPaid) || 0), 0);

  // ── Filtered rows ─────────────────────────────────────────────────────────
  const filtered = React.useMemo(() => {
    let rows = allRows;
    if (tab !== 'all')        rows = rows.filter(r => r.status === tab);
    if (typeFilter !== 'all') rows = rows.filter(r => r.debtType === typeFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      rows = rows.filter(r =>
        (r.code      || '').toLowerCase().includes(q) ||
        (r.debtorRef || '').toLowerCase().includes(q) ||
        (r.assignee  || '').toLowerCase().includes(q) ||
        (r.bank      || '').toLowerCase().includes(q) ||
        (r.remark    || '').toLowerCase().includes(q)
      );
    }
    return rows;
  }, [allRows, tab, typeFilter, query]);

  const { sorted, sort, toggle } = useSortable(filtered, 'code', 'asc');

  // ── Grouped view: project → rows ──────────────────────────────────────────
  const groupedByCode = React.useMemo(() => {
    const map = {};
    filtered.forEach(r => {
      if (!map[r.code]) map[r.code] = [];
      map[r.code].push(r);
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  // ── Footer totals ─────────────────────────────────────────────────────────
  const filtTotalDebt  = filtered.reduce((s,r) => s + (Number(r.totalDebt)||0), 0);
  const filtTotalPaid  = filtered.reduce((s,r) => s + (Number(r.totalPaid)||0), 0);
  const filtBalance    = filtered.reduce((s,r) => s + (Number(r.balance)||0), 0);

  // ── Tab counts ────────────────────────────────────────────────────────────
  const cntAll    = allRows.length;
  const cntActive = allRows.filter(r => r.status === 'Active').length;
  const cntClosed = allRows.filter(r => r.status === 'Non-Active').length;

  return (
    <div className="page">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="page-head anim-in">
        <div>
          <h1 className="page-title">ภาระหนี้ทั้งหมด</h1>
          <div className="page-sub">
            คำนวณ ณ {fmtDate(today)} · {allRows.length} รายการ ·&nbsp;
            Active {cntActive} รายการ
          </div>
        </div>
        {/* View mode toggle */}
        <div className="page-head-r">
          <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--line)' }}>
            <button
              onClick={() => setViewMode('flat')}
              style={{ padding: '5px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
                       background: viewMode === 'flat' ? 'var(--brand-600,#2a6fdb)' : '#fff',
                       color:      viewMode === 'flat' ? '#fff' : 'var(--ink-600)' }}>
              ตาราง
            </button>
            <button
              onClick={() => setViewMode('grouped')}
              style={{ padding: '5px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
                       borderLeft: '1px solid var(--line)',
                       background: viewMode === 'grouped' ? 'var(--brand-600,#2a6fdb)' : '#fff',
                       color:      viewMode === 'grouped' ? '#fff' : 'var(--ink-600)' }}>
              จัดกลุ่ม
            </button>
          </div>
        </div>
      </div>

      {/* ── KPI Row ───────────────────────────────────────────────────────── */}
      <div className="grid grid-4 anim-stagger" style={{ marginBottom: 16 }}>
        <KpiTile
          label="ภาระหนี้คงเหลือ (Active)"
          value={totalBalance}
          accent="var(--bad)"
          icon="money"
          delta={`${cntActive} รายการ`}
        />
        <KpiTile
          label="โอนสิทธิ LIT"
          value={litBalance}
          accent="var(--brand-500)"
          icon="arrow_up"
          delta={`${activeRows.filter(r=>r.debtType==='LIT').length} ราย`}
        />
        <KpiTile
          label="กู้ยืม KU"
          value={kuBalance}
          accent="oklch(52% 0.16 145)"
          icon="bank"
          delta={`${activeRows.filter(r=>r.debtType==='KU').length} ราย`}
        />
        <KpiTile
          label="จ่ายแล้วรวม (ทั้งหมด)"
          value={totalPaid}
          accent="oklch(52% 0.16 185)"
          icon="coin"
          delta={`${allRows.filter(r=>r.status==='Non-Active').length} รายการปิด`}
        />
      </div>

      {/* ── Summary cards by debt type ─────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        {Object.entries(DEBT_TYPE_META).map(([key, meta]) => {
          const typeRows   = allRows.filter(r => r.debtType === key);
          const activeAmt  = typeRows.filter(r => r.status === 'Active').reduce((s,r) => s + (Number(r.balance)||0), 0);
          const paidAmt    = typeRows.reduce((s,r) => s + (Number(r.totalPaid)||0), 0);
          const cntA       = typeRows.filter(r => r.status === 'Active').length;
          if (typeRows.length === 0) return null;
          return (
            <div key={key} className="card" style={{
              flex: '1 1 260px', padding: '12px 16px',
              borderLeft: `4px solid ${meta.color}`,
            }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: meta.color, marginBottom: 10 }}>
                {meta.label}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 10.5, color: 'var(--ink-400)', marginBottom: 2 }}>จำนวน</div>
                  <div style={{ fontWeight: 700, fontSize: 18 }}>{typeRows.length}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--ink-400)' }}>
                    Active {cntA} · ปิด {typeRows.length - cntA}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, color: 'var(--ink-400)', marginBottom: 2 }}>ค้างชำระ</div>
                  <div style={{ fontWeight: 700, fontSize: 15, fontVariantNumeric: 'tabular-nums',
                               color: activeAmt > 0 ? 'var(--bad)' : 'var(--ink-300)' }}>
                    {fmtNum(activeAmt, 0)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, color: 'var(--ink-400)', marginBottom: 2 }}>จ่ายแล้ว</div>
                  <div style={{ fontWeight: 700, fontSize: 15, fontVariantNumeric: 'tabular-nums', color: 'var(--good)' }}>
                    {fmtNum(paidAmt, 0)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Filter bar ────────────────────────────────────────────────────── */}
      <div className="card" style={{ padding: '10px 14px', marginBottom: 12, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Status tabs */}
        <div className="tabnav" style={{ flex: 'none' }}>
          <button className={tab === 'all'        ? 'active' : ''} onClick={() => setTab('all')}>
            ทั้งหมด ({cntAll})
          </button>
          <button className={tab === 'Active'     ? 'active' : ''} onClick={() => setTab('Active')}>
            Active ({cntActive})
          </button>
          <button className={tab === 'Non-Active' ? 'active' : ''} onClick={() => setTab('Non-Active')}>
            ปิดแล้ว ({cntClosed})
          </button>
        </div>

        {/* Type filter pills */}
        <div style={{ display: 'flex', gap: 6, flex: 'none' }}>
          {[['all', 'ทุกประเภท', null], ...Object.entries(DEBT_TYPE_META).map(([k,m]) => [k, k, m])].map(([key, label, meta]) => {
            const isSelected = typeFilter === key;
            return (
              <button
                key={key}
                onClick={() => setTypeFilter(key)}
                style={{
                  padding: '4px 13px', borderRadius: 20, border: '1.5px solid', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', transition: 'all 120ms',
                  borderColor: isSelected ? (meta?.color || 'var(--brand-500)') : 'var(--line)',
                  background:  isSelected ? (meta?.bg || 'var(--brand-50,#f0f6ff)') : '#fff',
                  color:       isSelected ? (meta?.color || 'var(--brand-700)') : 'var(--ink-500)',
                }}>
                {label}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="tb-search" style={{ width: 300, marginLeft: 'auto' }}>
          <Icon name="search" size={14} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="ค้นหา โครงการ / เลขที่อ้างอิง / ผู้รับโอน / ธนาคาร…"
          />
        </div>
      </div>

      {/* ── No data state ─────────────────────────────────────────────────── */}
      {allRows.length === 0 && (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
          <div style={{ fontWeight: 600, color: 'var(--ink-600)', marginBottom: 8 }}>ยังไม่มีข้อมูลภาระหนี้</div>
          <div style={{ fontSize: 13, color: 'var(--ink-400)' }}>
            ข้อมูลจะปรากฏเมื่อ sync จาก Google Sheets แล้ว
            (ตาราง projectFinance schema ใหม่ที่มี column debtType)
          </div>
        </div>
      )}

      {/* ── FLAT TABLE VIEW ───────────────────────────────────────────────── */}
      {allRows.length > 0 && viewMode === 'flat' && (
        <div className="card anim-in" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl" style={{ minWidth: 1180 }}>
              <thead>
                <tr>
                  <SortHeader label="โครงการ"       sortKey="code"        sort={sort} toggle={toggle} width={90} />
                  <SortHeader label="ประเภท"         sortKey="debtType"    sort={sort} toggle={toggle} width={80} />
                  <SortHeader label="เลขที่อ้างอิง" sortKey="debtorRef"   sort={sort} toggle={toggle} />
                  <SortHeader label="สถานะ"          sortKey="status"      sort={sort} toggle={toggle} width={90} />
                  <SortHeader label="ครบกำหนด"       sortKey="endDate"     sort={sort} toggle={toggle} width={105} />
                  <th style={{ width: 80, textAlign: 'left', fontSize: 11.5, color: 'var(--ink-400)' }}>เริ่มสัญญา</th>
                  <SortHeader label="วงเงินรวม"      sortKey="totalDebt"   sort={sort} toggle={toggle} align="right" width={110} />
                  <th style={{ textAlign: 'right', width: 110 }}>งวด 1</th>
                  <th style={{ textAlign: 'right', width: 110 }}>งวด 2</th>
                  <SortHeader label="จ่ายแล้ว"       sortKey="totalPaid"   sort={sort} toggle={toggle} align="right" width={110} />
                  <SortHeader label="คงเหลือ"         sortKey="balance"     sort={sort} toggle={toggle} align="right" width={115} />
                  <SortHeader label="ผู้รับโอนสิทธิ์" sortKey="assignee"   sort={sort} toggle={toggle} width={100} />
                  <th style={{ width: 70 }}>ธนาคาร</th>
                  <th style={{ width: 160 }}>หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={14} style={{ textAlign: 'center', color: 'var(--ink-400)', padding: 36 }}>
                      ไม่พบข้อมูลที่ตรงกับเงื่อนไข
                    </td>
                  </tr>
                )}
                {sorted.map(r => <DebtDetailRow key={r.id || r.debtorRef || Math.random()} r={r} />)}
              </tbody>
              {sorted.length > 0 && (
                <tfoot>
                  <tr style={{ background: '#edf2ff', fontWeight: 700 }}>
                    <td colSpan={6} style={{ textAlign: 'right', paddingRight: 10, fontSize: 12 }}>
                      รวม ({filtered.length} รายการ)
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtNum(filtTotalDebt, 0)}</td>
                    <td colSpan={2}></td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--good)' }}>{fmtNum(filtTotalPaid, 0)}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--bad)', fontSize: 14 }}>{fmtNum(filtBalance, 0)}</td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ── GROUPED VIEW ──────────────────────────────────────────────────── */}
      {allRows.length > 0 && viewMode === 'grouped' && (
        <div className="card anim-in" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl" style={{ minWidth: 1180 }}>
              <thead>
                <tr>
                  <th style={{ width: 90 }}>โครงการ</th>
                  <th style={{ width: 80 }}>ประเภท</th>
                  <th>เลขที่อ้างอิง</th>
                  <th style={{ width: 90 }}>สถานะ</th>
                  <th style={{ width: 105 }}>ครบกำหนด</th>
                  <th style={{ width: 80, fontSize: 11.5, color: 'var(--ink-400)' }}>เริ่มสัญญา</th>
                  <th style={{ textAlign: 'right', width: 110 }}>วงเงินรวม</th>
                  <th style={{ textAlign: 'right', width: 110 }}>งวด 1</th>
                  <th style={{ textAlign: 'right', width: 110 }}>งวด 2</th>
                  <th style={{ textAlign: 'right', width: 110 }}>จ่ายแล้ว</th>
                  <th style={{ textAlign: 'right', width: 115 }}>คงเหลือ</th>
                  <th style={{ width: 100 }}>ผู้รับโอนสิทธิ์</th>
                  <th style={{ width: 70 }}>ธนาคาร</th>
                  <th style={{ width: 160 }}>หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                {groupedByCode.length === 0 && (
                  <tr>
                    <td colSpan={14} style={{ textAlign: 'center', color: 'var(--ink-400)', padding: 36 }}>
                      ไม่พบข้อมูลที่ตรงกับเงื่อนไข
                    </td>
                  </tr>
                )}
                {groupedByCode.map(([code, rows]) => (
                  <ProjectSummaryBlock key={code} projectCode={code} rows={rows} />
                ))}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr style={{ background: '#edf2ff', fontWeight: 700 }}>
                    <td colSpan={6} style={{ textAlign: 'right', paddingRight: 10, fontSize: 12 }}>
                      รวม ({groupedByCode.length} โครงการ · {filtered.length} รายการ)
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtNum(filtTotalDebt, 0)}</td>
                    <td colSpan={2}></td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--good)' }}>{fmtNum(filtTotalPaid, 0)}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--bad)', fontSize: 14 }}>{fmtNum(filtBalance, 0)}</td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
