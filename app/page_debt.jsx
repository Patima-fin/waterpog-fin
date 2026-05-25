/* page_debt.jsx — ภาระหนี้ทั้งหมด
   v3: ใช้ data.debtMaster (schema ใหม่)
   หมวด: WCI, Non-WCI, กรรมการ, LockWood, Zigo, Employyim, ลีซอิท, STS, FS, ธนาคาร, อื่นๆ
*/
'use strict';

const CATEGORY_META = {
  'WCI':       { color: '#2a6fdb', bg: '#ebf8ff', label: 'WCI (นักลงทุนรายบุคคล)' },
  'Non-WCI':   { color: '#0d9488', bg: '#f0fdfa', label: 'Non-WCI (รายบุคคลอื่น)' },
  'กรรมการ':    { color: '#7c3aed', bg: '#f5f3ff', label: 'เงินกู้กรรมการ' },
  'LockWood':  { color: '#0369a1', bg: '#f0f9ff', label: 'LockWood (ไทย)' },
  'Zigo':      { color: '#b45309', bg: '#fffbeb', label: 'Zigo (ต่างประเทศ)' },
  'Employyim': { color: '#be185d', bg: '#fdf2f8', label: 'Employyim' },
  'ลีซอิท':     { color: '#c2410c', bg: '#fff7ed', label: 'ลีซอิท (โอนสิทธิ)' },
  'STS':       { color: '#15803d', bg: '#f0fdf4', label: 'STS (โอนสิทธิ)' },
  'FS':        { color: '#9d174d', bg: '#fdf2f8', label: 'FS' },
  'ธนาคาร':     { color: '#475569', bg: '#f1f5f9', label: 'ธนาคาร / OD / LG' },
  'อื่นๆ':       { color: '#525252', bg: '#f5f5f5', label: 'อื่นๆ' },
};
function metaFor(cat) {
  return CATEGORY_META[cat] || { color: '#525252', bg: '#f5f5f5', label: cat || '—' };
}

// ── Detail row ────────────────────────────────────────────────────────────────
function DebtRow({ r, onClick }) {
  const meta     = metaFor(r.debtCategory);
  const isActive = r.status === 'Active';
  const balance  = Number(r.balance || r.principalAmount) || 0;
  const principal= Number(r.principalAmount) || 0;
  const rate     = Number(r.interestRate) || 0;
  const isUSD    = r.currency === 'USD';

  return (
    <tr onClick={onClick} style={{ opacity: isActive ? 1 : 0.6, cursor: onClick ? 'pointer' : 'default' }}>
      <td>
        <Badge kind="b-blue" dot={false}
          style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.color}33` }}>
          {r.debtCategory || '—'}
        </Badge>
      </td>
      <td style={{ fontFamily: 'ui-monospace', fontSize: 11.5, color: 'var(--ink-700)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          title={r.contractNo || ''}>
        {r.contractNo || '—'}
      </td>
      <td style={{ fontSize: 12.5, fontWeight: 600 }}>
        {r.borrowerName || '—'}
      </td>
      <td>
        <Badge kind={isActive ? 'b-blue' : 'b-gray'} dot={false}>
          {isActive ? 'Active' : r.status || 'Close'}
        </Badge>
      </td>
      <td style={{ fontSize: 11.5, color: 'var(--ink-500)', whiteSpace: 'nowrap' }}>
        {fmtDate(r.receiveDate || r.startDate) || '—'}
      </td>
      <td style={{ fontSize: 11.5, color: 'var(--ink-500)', whiteSpace: 'nowrap' }}>
        {fmtDate(r.maturityDate || r.endDate) || '—'}
      </td>
      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, fontSize: 12.5 }}>
        {fmtNum(principal, 0)} {isUSD && <span style={{ color: 'var(--ink-400)', fontSize: 10 }}>USD</span>}
      </td>
      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
        {rate > 0 ? (rate * 100).toFixed(2) + '%' : '—'}
      </td>
      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 13,
                   color: balance > 0 ? 'var(--bad)' : 'var(--ink-300)' }}>
        {fmtNum(balance, 0)}
      </td>
      <td style={{ fontSize: 11.5, color: 'var(--ink-600)' }}>
        {r.bankName || '—'}
      </td>
      <td style={{ fontSize: 11.5, color: 'var(--ink-500)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          title={r.projectName || ''}>
        {r.projectCode ? <span style={{ fontFamily: 'ui-monospace', color: 'var(--brand-700)', marginRight: 4 }}>{r.projectCode}</span> : null}
        {r.projectName || (r.projectCode ? '' : '—')}
      </td>
      <td style={{ fontSize: 11, color: 'var(--ink-400)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          title={r.note || ''}>
        {r.note || ''}
      </td>
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
function DebtPage({ data }) {
  const rawRows = (data?.debtMaster || []);
  const [tab,           setTab]           = React.useState('all');   // all | Active | Close
  const [categoryFilter, setCategoryFilter] = React.useState('all');
  const [query,         setQuery]         = React.useState('');
  const [view,          setView]          = React.useState(null);    // row to show in popup
  const today = new Date().toISOString().slice(0, 10);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const activeRows = rawRows.filter(r => r.status === 'Active');
  const closedRows = rawRows.filter(r => r.status !== 'Active');
  // Only sum THB rows for total (Zigo USD is separate)
  const thbActive  = activeRows.filter(r => r.currency !== 'USD');
  const usdActive  = activeRows.filter(r => r.currency === 'USD');
  const totalBalanceThb = thbActive.reduce((s, r) => s + (Number(r.balance || r.principalAmount) || 0), 0);
  const totalBalanceUsd = usdActive.reduce((s, r) => s + (Number(r.balance || r.principalAmount) || 0), 0);
  const totalPrincipal  = thbActive.reduce((s, r) => s + (Number(r.principalAmount) || 0), 0);

  // Category counts
  const categoriesPresent = [...new Set(rawRows.map(r => r.debtCategory).filter(Boolean))];

  // ── Filtered rows ─────────────────────────────────────────────────────────
  const filtered = React.useMemo(() => {
    let rows = rawRows;
    if (tab !== 'all')          rows = rows.filter(r => r.status === tab);
    if (categoryFilter !== 'all') rows = rows.filter(r => r.debtCategory === categoryFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      rows = rows.filter(r =>
        (r.contractNo   || '').toLowerCase().includes(q) ||
        (r.borrowerName || '').toLowerCase().includes(q) ||
        (r.bankName     || '').toLowerCase().includes(q) ||
        (r.projectName  || '').toLowerCase().includes(q) ||
        (r.projectCode  || '').toLowerCase().includes(q) ||
        (r.note         || '').toLowerCase().includes(q)
      );
    }
    return rows;
  }, [rawRows, tab, categoryFilter, query]);

  const { sorted, sort, toggle } = useSortable(filtered, 'debtCategory', 'asc');

  // ── Footer totals ─────────────────────────────────────────────────────────
  const filtBalance   = filtered.reduce((s,r) => s + (Number(r.balance || r.principalAmount)||0), 0);
  const filtPrincipal = filtered.reduce((s,r) => s + (Number(r.principalAmount)||0), 0);

  const cntAll    = rawRows.length;
  const cntActive = activeRows.length;
  const cntClosed = closedRows.length;

  return (
    <div className="page">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="page-head anim-in">
        <div>
          <h1 className="page-title">ภาระหนี้ทั้งหมด</h1>
          <div className="page-sub">
            ณ {fmtDate(today)} · {rawRows.length} สัญญา · Active {cntActive} · ปิดแล้ว {cntClosed}
          </div>
        </div>
      </div>

      {/* ── KPI Row ──────────────────────────────────────────────────────── */}
      <div className="grid grid-4 anim-stagger" style={{ marginBottom: 16 }}>
        <KpiTile animate={false}
          label="ยอดคงเหลือ THB (Active)"
          value={totalBalanceThb}
          accent="var(--bad)"
          icon="money"
          delta={`${thbActive.length} สัญญา`}
        />
        <KpiTile animate={false}
          label="ยอดคงเหลือ USD (Active)"
          value={totalBalanceUsd}
          accent="var(--brand-500)"
          icon="bank"
          unit="USD"
          delta={`${usdActive.length} สัญญา · Zigo`}
        />
        <KpiTile animate={false}
          label="วงเงินรวม Active (THB)"
          value={totalPrincipal}
          accent="oklch(52% 0.16 145)"
          icon="arrow_up"
          delta={`${categoriesPresent.length} หมวด`}
        />
        <KpiTile animate={false}
          label="ปิดสัญญาแล้ว"
          value={cntClosed}
          accent="var(--ink-400)"
          icon="coin"
          unit=""
          digits={0}
          delta="สัญญา"
        />
      </div>

      {/* ── Summary by category ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {categoriesPresent.map(cat => {
          const m = metaFor(cat);
          const catRows = rawRows.filter(r => r.debtCategory === cat);
          const activeCnt = catRows.filter(r => r.status === 'Active').length;
          const activeBal = catRows.filter(r => r.status === 'Active')
            .reduce((s, r) => s + (Number(r.balance || r.principalAmount) || 0), 0);
          const isUSD = catRows.some(r => r.currency === 'USD');
          return (
            <div key={cat} className="card" style={{
              flex: '1 1 200px', padding: '10px 14px',
              borderLeft: `4px solid ${m.color}`,
            }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: m.color, marginBottom: 6 }}>
                {m.label}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--ink-400)' }}>สัญญา</div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{catRows.length}</div>
                  <div style={{ fontSize: 10, color: 'var(--ink-400)' }}>Active {activeCnt}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--ink-400)' }}>คงเหลือ</div>
                  <div style={{ fontWeight: 700, fontSize: 13, fontVariantNumeric: 'tabular-nums',
                               color: activeBal > 0 ? 'var(--bad)' : 'var(--ink-300)' }}>
                    {fmtNum(activeBal, 0)} {isUSD && <span style={{ fontSize: 9, color: 'var(--ink-400)' }}>USD</span>}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Filter bar ───────────────────────────────────────────────────── */}
      <div className="card" style={{ padding: '10px 14px', marginBottom: 12, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="tabnav" style={{ flex: 'none' }}>
          <button className={tab === 'all'    ? 'active' : ''} onClick={() => setTab('all')}>
            ทั้งหมด ({cntAll})
          </button>
          <button className={tab === 'Active' ? 'active' : ''} onClick={() => setTab('Active')}>
            Active ({cntActive})
          </button>
          <button className={tab === 'Close'  ? 'active' : ''} onClick={() => setTab('Close')}>
            ปิดแล้ว ({cntClosed})
          </button>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 'none' }}>
          <button
            onClick={() => setCategoryFilter('all')}
            style={{
              padding: '4px 12px', borderRadius: 20, border: '1.5px solid', fontSize: 11.5, fontWeight: 600,
              cursor: 'pointer',
              borderColor: categoryFilter === 'all' ? 'var(--brand-500)' : 'var(--line)',
              background:  categoryFilter === 'all' ? 'var(--brand-50,#f0f6ff)' : '#fff',
              color:       categoryFilter === 'all' ? 'var(--brand-700)' : 'var(--ink-500)',
            }}>
            ทุกหมวด
          </button>
          {categoriesPresent.map(cat => {
            const m = metaFor(cat);
            const isSelected = categoryFilter === cat;
            return (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                style={{
                  padding: '4px 12px', borderRadius: 20, border: '1.5px solid', fontSize: 11.5, fontWeight: 600,
                  cursor: 'pointer',
                  borderColor: isSelected ? m.color : 'var(--line)',
                  background:  isSelected ? m.bg : '#fff',
                  color:       isSelected ? m.color : 'var(--ink-500)',
                }}>
                {cat}
              </button>
            );
          })}
        </div>

        <div className="tb-search" style={{ width: 300, marginLeft: 'auto' }}>
          <Icon name="search" size={14} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="ค้นหา สัญญา / ผู้กู้ / ธนาคาร / โครงการ…"
          />
        </div>
      </div>

      {/* ── No data ──────────────────────────────────────────────────────── */}
      {rawRows.length === 0 && (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
          <div style={{ fontWeight: 600, color: 'var(--ink-600)', marginBottom: 8 }}>ยังไม่มีข้อมูลภาระหนี้</div>
          <div style={{ fontSize: 13, color: 'var(--ink-400)' }}>
            ข้อมูลจะปรากฏเมื่อตาราง debtMaster ใน Google Sheet มีข้อมูล
          </div>
        </div>
      )}

      {/* ── Table ────────────────────────────────────────────────────────── */}
      {rawRows.length > 0 && (
        <div className="card anim-in" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl" style={{ minWidth: 1280 }}>
              <thead>
                <tr>
                  <SortHeader label="หมวด"         sortKey="debtCategory" sort={sort} toggle={toggle} width={110} />
                  <SortHeader label="เลขที่สัญญา"  sortKey="contractNo"   sort={sort} toggle={toggle} width={150} />
                  <SortHeader label="ผู้กู้ยืม"     sortKey="borrowerName" sort={sort} toggle={toggle} />
                  <SortHeader label="สถานะ"        sortKey="status"       sort={sort} toggle={toggle} width={80} />
                  <SortHeader label="วันที่รับเงิน" sortKey="receiveDate"  sort={sort} toggle={toggle} width={100} />
                  <th style={{ width: 100 }}>ครบกำหนด</th>
                  <SortHeader label="วงเงิน"       sortKey="principalAmount" sort={sort} toggle={toggle} align="right" width={120} />
                  <SortHeader label="ดอกเบี้ย/ปี" sortKey="interestRate" sort={sort} toggle={toggle} align="right" width={80} />
                  <SortHeader label="คงเหลือ"      sortKey="balance"      sort={sort} toggle={toggle} align="right" width={120} />
                  <th style={{ width: 100 }}>ธนาคาร</th>
                  <th style={{ width: 200 }}>โครงการ</th>
                  <th style={{ width: 160 }}>หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={12} style={{ textAlign: 'center', color: 'var(--ink-400)', padding: 36 }}>
                      ไม่พบข้อมูลที่ตรงกับเงื่อนไข
                    </td>
                  </tr>
                )}
                {sorted.map(r => <DebtRow key={r.id || r.contractNo} r={r} onClick={() => setView(r)} />)}
              </tbody>
              {sorted.length > 0 && (
                <tfoot>
                  <tr style={{ background: '#edf2ff', fontWeight: 700 }}>
                    <td colSpan={6} style={{ textAlign: 'right', paddingRight: 10, fontSize: 12 }}>
                      รวม ({filtered.length} สัญญา)
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtNum(filtPrincipal, 0)}</td>
                    <td></td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--bad)', fontSize: 14 }}>{fmtNum(filtBalance, 0)}</td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ── Detail Popup (read-only view) ────────────────────────────────── */}
      {view && (() => {
        const m       = metaFor(view.debtCategory);
        const isActive= view.status === 'Active';
        const isUSD   = view.currency === 'USD';
        const bal     = Number(view.balance || view.principalAmount) || 0;
        const princ   = Number(view.principalAmount) || 0;
        const rate    = Number(view.interestRate) || 0;
        const paid    = princ > 0 ? Math.max(0, princ - bal) : 0;
        const paidPct = princ > 0 ? Math.min(100, (paid / princ) * 100) : 0;
        const fld = (label, value, opts = {}) => (
          <div className="field" style={opts.span ? { gridColumn: `span ${opts.span}` } : (opts.full ? { gridColumn: '1/-1' } : {})}>
            <label style={{ fontSize: 12, color: 'var(--ink-500)' }}>{label}</label>
            <div style={{
              minHeight: 34, borderRadius: 7, border: '1px solid var(--ink-100)',
              padding: '6px 10px', fontSize: 13, lineHeight: 1.5,
              background: opts.highlight ? 'color-mix(in oklch, var(--bad) 9%, transparent)' : 'var(--ink-25, #f9fafb)',
              color: opts.highlight ? 'var(--bad)' : 'var(--ink-700)',
              fontWeight: opts.highlight ? 700 : (opts.bold ? 600 : 400),
              fontFamily: opts.mono ? 'ui-monospace' : 'inherit',
              textAlign: opts.right ? 'right' : 'left',
              fontVariantNumeric: opts.right ? 'tabular-nums' : 'normal',
              wordBreak: 'break-word', userSelect: 'text',
            }}>{value || '—'}</div>
          </div>
        );
        const Hdr = ({ label, icon }) => (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7,
            fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
            color: 'var(--brand-700)', paddingBottom: 6, marginTop: 6,
            borderBottom: '1px solid var(--ink-100)', gridColumn: '1 / -1',
          }}>
            <Icon name={icon} size={13} />{label}
          </div>
        );

        return (
          <div className="modal-back" onClick={() => setView(null)}>
            <div className="modal" style={{ maxWidth: 760 }} onClick={e => e.stopPropagation()}>
              <div className="modal-hd">
                <span className="modal-title" style={{ fontSize: 16 }}>
                  ข้อมูลหนี้ · {view.contractNo || view.borrowerName || '—'}
                </span>
                <button className="btn btn-ghost btn-sm" onClick={() => setView(null)}>
                  <Icon name="x" size={16} />
                </button>
              </div>

              {/* Hero header — category, balance, repayment progress */}
              <div style={{
                padding: '14px 16px', borderRadius: 12, marginBottom: 16,
                background: `linear-gradient(135deg, ${m.bg}, color-mix(in oklch, ${m.color} 4%, #ffffff))`,
                border: `1px solid ${m.color}33`,
                display: 'grid', gap: 12,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <Badge kind="b-blue" dot={false}
                    style={{ background: m.bg, color: m.color, border: `1px solid ${m.color}55`, fontSize: 12 }}>
                    {view.debtCategory || '—'}
                  </Badge>
                  <Badge kind={isActive ? 'b-blue' : 'b-gray'} dot={false}>
                    {isActive ? 'Active' : view.status || 'Close'}
                  </Badge>
                  <div style={{ flex: 1 }} />
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10.5, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: 0.5 }}>ยอดคงเหลือ</div>
                    <div style={{ fontWeight: 700, fontSize: 22, color: bal > 0 ? 'var(--bad)' : 'var(--ink-400)', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtNum(bal, 0)} <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>{isUSD ? 'USD' : '฿'}</span>
                    </div>
                  </div>
                </div>
                {princ > 0 && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink-500)', marginBottom: 4 }}>
                      <span>ชำระแล้ว {fmtNum(paid, 0)} / วงเงิน {fmtNum(princ, 0)}</span>
                      <span>{paidPct.toFixed(1)}%</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: 'var(--ink-100)', overflow: 'hidden' }}>
                      <div style={{ width: `${paidPct}%`, height: '100%', background: m.color, transition: 'width 240ms' }} />
                    </div>
                  </div>
                )}
              </div>

              {/* Field grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px 12px' }}>

                <Hdr label="สัญญา" icon="invoice" />
                {fld('เลขที่สัญญา', view.contractNo, { mono: true, span: 2 })}
                {fld('สกุลเงิน', view.currency || 'THB')}
                {fld('ผู้กู้ / ผู้รับสินเชื่อ', view.borrowerName, { bold: true, span: 2 })}
                {fld('ธนาคาร / เจ้าหนี้', view.bankName)}

                <Hdr label="ระยะเวลา" icon="forecast" />
                {fld('วันที่รับเงิน', fmtDate(view.receiveDate || view.startDate))}
                {fld('วันเริ่มสัญญา', fmtDate(view.startDate))}
                {fld('วันครบกำหนด', fmtDate(view.maturityDate || view.endDate))}

                <Hdr label="ยอดเงิน & อัตรา" icon="coin" />
                {fld('วงเงิน (Principal)', fmtNum(princ, 2), { right: true, bold: true })}
                {fld('อัตราดอกเบี้ย / ปี', rate > 0 ? (rate * 100).toFixed(4) + ' %' : '—', { right: true })}
                {fld('ยอดคงเหลือ (Balance)', fmtNum(bal, 2), { right: true, highlight: bal > 0 })}

                <Hdr label="โครงการที่ผูก" icon="projects" />
                {fld('รหัสโครงการ', view.projectCode, { mono: true })}
                {fld('ชื่อโครงการ', view.projectName, { span: 2 })}

                {view.note && <>
                  <Hdr label="หมายเหตุ" icon="edit" />
                  {fld('Note', view.note, { full: true })}
                </>}
              </div>

              <div className="modal-foot">
                <button className="btn btn-ghost" onClick={() => setView(null)}>ปิด</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
