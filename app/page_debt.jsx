/* page_debt.jsx — ภาระหนี้ทั้งหมด (debtLedger schema)
   debtType: transfer_rights | od | pn | term_loan | internal | lc
   ดอกเบี้ยค้างคำนวณ real-time ผ่าน WTPData.calcInterest()
*/
'use strict';

// ── Type & Status metadata ────────────────────────────────────────────────────
const DL_TYPE = {
  transfer_rights: { label: 'โอนสิทธิรับเงิน', short: 'TR',  color: '#2a6fdb', bg: '#ebf8ff', border: '#63b3ed' },
  od:              { label: 'OD เบิกเกินบัญชี', short: 'OD',  color: '#c05621', bg: '#fffaf0', border: '#fbd38d' },
  pn:              { label: 'PN ตั๋วสัญญา',      short: 'PN',  color: '#6b46c1', bg: '#faf5ff', border: '#d6bcfa' },
  term_loan:       { label: 'Term Loan',          short: 'TL',  color: '#276749', bg: '#f0fdf4', border: '#68d391' },
  internal:        { label: 'กู้ภายใน',            short: 'IN',  color: '#718096', bg: '#f7fafc', border: '#cbd5e0' },
  lc:              { label: 'L/C ค้ำประกัน',       short: 'LC',  color: '#b7791f', bg: '#fffff0', border: '#f6e05e' },
};
const DL_STATUS = {
  active:           { label: 'Active',      badge: 'b-blue',   color: '#2b6cb0' },
  pending_approval: { label: 'รออนุมัติ',   badge: 'b-amber',  color: '#b45309' },
  closed:           { label: 'ปิดแล้ว',     badge: 'b-gray',   color: '#718096' },
  overdue:          { label: 'เกินกำหนด',   badge: 'b-red',    color: '#c53030' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function typeMeta(t) { return DL_TYPE[t] || { label: t, short: t, color: '#718096', bg: '#f7fafc', border: '#e2e8f0' }; }
function statusMeta(s) { return DL_STATUS[s] || DL_STATUS.active; }

function MaturityCell({ maturityDate, drawdownDate, status }) {
  if (!maturityDate) return <span style={{ color:'#a0aec0', fontSize:11 }}>—</span>;
  const today = new Date().toISOString().slice(0,10);
  const days  = Math.round((new Date(maturityDate) - new Date(today)) / 86400000);
  const isActive = status === 'active' || status === 'overdue';
  const color = !isActive ? '#a0aec0'
    : days < 0    ? '#c53030'
    : days <= 30  ? '#c05621'
    : days <= 90  ? '#b45309'
    : '#276749';
  return (
    <div>
      <div style={{ fontSize:12, color, fontWeight:600 }}>{fmtDate(maturityDate)}</div>
      {isActive && (
        <div style={{ fontSize:10, color, marginTop:1 }}>
          {days < 0 ? '⚠ เกิน '+Math.abs(days)+' วัน' : days+' วัน'}
        </div>
      )}
    </div>
  );
}

function TypeBadge({ debtType }) {
  const m = typeMeta(debtType);
  return (
    <span style={{
      display:'inline-block', padding:'2px 8px', borderRadius:20,
      fontSize:11, fontWeight:700,
      background: m.bg, color: m.color, border:'1px solid '+m.border,
      whiteSpace:'nowrap',
    }}>
      {m.short}
    </span>
  );
}

// ── Type Summary Card ─────────────────────────────────────────────────────────
function TypeCard({ debtType, rows, today }) {
  const m          = typeMeta(debtType);
  const active     = rows.filter(function(r){ return r.status==='active'||r.status==='overdue'; });
  const outstanding= active.reduce(function(s,r){ return s+(parseFloat(r.outstandingBalance)||0); }, 0);
  const interest   = active.reduce(function(s,r){ return s+(WTPData.calcInterest(r,today)||0); }, 0);
  return (
    <div className="card" style={{ padding:'12px 16px', borderLeft:'4px solid '+m.color, minWidth:200, flex:'1 1 200px' }}>
      <div style={{ fontWeight:700, fontSize:13, color:m.color, marginBottom:8 }}>{m.label}</div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:4 }}>
        <div>
          <div style={{ fontSize:10, color:'#718096' }}>รายการ</div>
          <div style={{ fontWeight:700, fontSize:16 }}>{rows.length}</div>
          <div style={{ fontSize:10, color:'#718096' }}>Active {active.length}</div>
        </div>
        <div>
          <div style={{ fontSize:10, color:'#718096' }}>คงค้าง</div>
          <div style={{ fontWeight:700, fontSize:13, fontVariantNumeric:'tabular-nums', color: outstanding>0?'#c53030':'#a0aec0' }}>
            {outstanding>0 ? fmtMoney(outstanding) : '—'}
          </div>
        </div>
        <div>
          <div style={{ fontSize:10, color:'#718096' }}>ดอกเบี้ย</div>
          <div style={{ fontWeight:700, fontSize:13, fontVariantNumeric:'tabular-nums', color: interest>0?'#c05621':'#a0aec0' }}>
            {interest>0 ? fmtMoney(interest) : '—'}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Detail Row ────────────────────────────────────────────────────────────────
function DebtRow({ r, today, highlight }) {
  const m         = typeMeta(r.debtType);
  const sm        = statusMeta(r.status);
  const isActive  = r.status === 'active' || r.status === 'overdue';
  const interest  = isActive ? (WTPData.calcInterest(r, today) || 0) : 0;
  const balance   = parseFloat(r.outstandingBalance) || 0;
  const principal = parseFloat(r.principalAmount) || 0;

  // Days since drawdown (for interest context)
  const daysSince = r.drawdownDate
    ? Math.round((new Date(today) - new Date(r.drawdownDate)) / 86400000)
    : null;

  return (
    <tr style={{ opacity: isActive ? 1 : 0.55, background: highlight ? '#fffbf0' : 'transparent' }}>
      {/* debtNo */}
      <td style={{ padding:'8px 12px', fontFamily:'ui-monospace', fontSize:12, color:'var(--brand-700,#1a4490)', whiteSpace:'nowrap', fontWeight:600 }}>
        {r.debtNo}
      </td>
      {/* ประเภท */}
      <td style={{ padding:'8px 10px' }}>
        <TypeBadge debtType={r.debtType} />
      </td>
      {/* โครงการ / อ้างอิง */}
      <td style={{ padding:'8px 10px' }}>
        {r.linkedProjectCode
          ? <div style={{ fontWeight:700, fontSize:12, color:'#1a202c' }}>{r.linkedProjectCode}</div>
          : <span style={{ fontSize:11, color:'#718096' }}>Standalone</span>}
        <div style={{ fontSize:11, color:'#718096', whiteSpace:'nowrap' }}>{r.accountRef||''}</div>
      </td>
      {/* ธนาคาร */}
      <td style={{ padding:'8px 10px', fontSize:12, color:'#4a5568', whiteSpace:'nowrap' }}>{r.bankName||'—'}</td>
      {/* อัตราดอกเบี้ย */}
      <td style={{ padding:'8px 10px', textAlign:'center' }}>
        <div style={{ fontWeight:700, fontSize:13, color:'#c05621' }}>{r.interestRate}%</div>
        <div style={{ fontSize:10, color:'#718096' }}>p.a.</div>
      </td>
      {/* วงเงินต้น */}
      <td style={{ padding:'8px 10px', textAlign:'right', fontVariantNumeric:'tabular-nums', fontSize:12 }}>
        {fmtMoney(principal)}
      </td>
      {/* คงเหลือ */}
      <td style={{ padding:'8px 10px', textAlign:'right', fontVariantNumeric:'tabular-nums', fontWeight:700, fontSize:13,
                   color: balance>0 ? '#c53030' : '#276749' }}>
        {fmtMoney(balance)}
        {principal>0 && balance<principal && isActive &&
          <div style={{ fontSize:10, color:'#718096' }}>{((balance/principal)*100).toFixed(0)}%</div>}
      </td>
      {/* ดอกเบี้ยค้าง */}
      <td style={{ padding:'8px 10px', textAlign:'right', fontVariantNumeric:'tabular-nums', fontSize:12,
                   color: interest>0 ? '#c05621' : '#a0aec0', fontWeight: interest>0 ? 600 : 400 }}>
        {interest>0 ? fmtMoney(interest) : '—'}
        {interest>0 && daysSince!==null && <div style={{ fontSize:10, color:'#718096' }}>{daysSince} วัน</div>}
      </td>
      {/* วันเบิก */}
      <td style={{ padding:'8px 10px', fontSize:11, color:'#718096', whiteSpace:'nowrap' }}>
        {r.drawdownDate ? fmtDate(r.drawdownDate) : '—'}
      </td>
      {/* ครบกำหนด */}
      <td style={{ padding:'8px 10px' }}>
        <MaturityCell maturityDate={r.maturityDate} drawdownDate={r.drawdownDate} status={r.status} />
      </td>
      {/* หลักประกัน */}
      <td style={{ padding:'8px 10px', fontSize:11, color:'#4a5568', maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}
          title={r.collateral||''}>
        {r.collateral||'—'}
      </td>
      {/* สถานะ */}
      <td style={{ padding:'8px 10px' }}>
        <span style={{ display:'inline-block', padding:'2px 9px', borderRadius:20, fontSize:11, fontWeight:700,
                       background: r.status==='active'?'#ebf8ff': r.status==='overdue'?'#fff5f5': r.status==='pending_approval'?'#fffbeb':'#f7fafc',
                       color: sm.color }}>
          {sm.label}
        </span>
      </td>
      {/* หมายเหตุ */}
      <td style={{ padding:'8px 10px', fontSize:11, color:'#718096', maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}
          title={r.note||''}>
        {r.note||''}
      </td>
    </tr>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
function DebtPage({ data }) {
  const today   = new Date().toISOString().slice(0,10);
  const ledger  = React.useMemo(function(){ return data.debtLedger || []; }, [data.debtLedger]);

  const [typeFilter,   setTypeFilter]   = React.useState('all');
  const [statusFilter, setStatusFilter] = React.useState('active');
  const [query,        setQuery]        = React.useState('');

  // ── Aggregates (all active/overdue) ────────────────────────────────────────
  const active = React.useMemo(function(){
    return ledger.filter(function(r){ return r.status==='active'||r.status==='overdue'; });
  }, [ledger]);

  const totalOutstanding = active.reduce(function(s,r){ return s+(parseFloat(r.outstandingBalance)||0); }, 0);
  const totalInterest    = active.reduce(function(s,r){ return s+(WTPData.calcInterest(r,today)||0); }, 0);
  const trOutstanding    = active.filter(function(r){ return r.debtType==='transfer_rights'; })
                                  .reduce(function(s,r){ return s+(parseFloat(r.outstandingBalance)||0); }, 0);
  const standaloneOut    = active.filter(function(r){ return r.debtType==='od'||r.debtType==='pn'||r.debtType==='term_loan'; })
                                  .reduce(function(s,r){ return s+(parseFloat(r.outstandingBalance)||0); }, 0);

  // Near maturity (≤ 60 days)
  const nearMaturity = active.filter(function(r){
    if (!r.maturityDate) return false;
    var d = Math.round((new Date(r.maturityDate)-new Date(today))/86400000);
    return d >= 0 && d <= 60;
  }).length;

  const overdueCount = ledger.filter(function(r){ return r.status==='overdue'; }).length;

  // ── Filtered rows ──────────────────────────────────────────────────────────
  const filtered = React.useMemo(function(){
    var rows = ledger;
    if (statusFilter !== 'all') {
      if (statusFilter === 'active') rows = rows.filter(function(r){ return r.status==='active'||r.status==='overdue'; });
      else rows = rows.filter(function(r){ return r.status===statusFilter; });
    }
    if (typeFilter !== 'all') rows = rows.filter(function(r){ return r.debtType===typeFilter; });
    if (query.trim()) {
      var q = query.toLowerCase();
      rows = rows.filter(function(r){
        return (r.debtNo||'').toLowerCase().includes(q)
          || (r.linkedProjectCode||'').toLowerCase().includes(q)
          || (r.bankName||'').toLowerCase().includes(q)
          || (r.accountRef||'').toLowerCase().includes(q)
          || (r.collateral||'').toLowerCase().includes(q)
          || (r.note||'').toLowerCase().includes(q);
      });
    }
    return rows;
  }, [ledger, statusFilter, typeFilter, query]);

  // Sort: overdue first, then by days-to-maturity ascending
  const sorted = React.useMemo(function(){
    return filtered.slice().sort(function(a,b){
      if (a.status==='overdue' && b.status!=='overdue') return -1;
      if (b.status==='overdue' && a.status!=='overdue') return 1;
      if (!a.maturityDate) return 1;
      if (!b.maturityDate) return -1;
      return a.maturityDate < b.maturityDate ? -1 : 1;
    });
  }, [filtered]);

  // Footer totals
  const filtOutstanding = filtered.filter(function(r){ return r.status==='active'||r.status==='overdue'; })
                                    .reduce(function(s,r){ return s+(parseFloat(r.outstandingBalance)||0); }, 0);
  const filtInterest    = filtered.filter(function(r){ return r.status==='active'||r.status==='overdue'; })
                                    .reduce(function(s,r){ return s+(WTPData.calcInterest(r,today)||0); }, 0);

  // Type groups for summary cards
  const typeGroups = React.useMemo(function(){
    var g = {};
    ledger.forEach(function(r){ if(!g[r.debtType]) g[r.debtType]=[]; g[r.debtType].push(r); });
    return g;
  }, [ledger]);

  const inp = { padding:'7px 11px', border:'1.5px solid #e2e8f0', borderRadius:8, fontSize:13, fontFamily:'inherit', outline:'none', background:'#fff' };

  // Count by status
  var cntActive  = ledger.filter(function(r){ return r.status==='active'||r.status==='overdue'; }).length;
  var cntPending = ledger.filter(function(r){ return r.status==='pending_approval'; }).length;
  var cntClosed  = ledger.filter(function(r){ return r.status==='closed'; }).length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-title">ภาระหนี้ทั้งหมด</div>
          <div className="page-sub">
            Debt Ledger — คำนวณ ณ {fmtDate(today)} · {ledger.length} รายการ · Active {cntActive}
          </div>
        </div>
        {(overdueCount > 0 || nearMaturity > 0) && (
          <div style={{ display:'flex', gap:8 }}>
            {overdueCount > 0 &&
              <span style={{ background:'#fef2f2', color:'#c53030', border:'1px solid #fecaca', borderRadius:8, padding:'6px 12px', fontSize:12, fontWeight:700 }}>
                🔴 เกินกำหนด {overdueCount} รายการ
              </span>}
            {nearMaturity > 0 &&
              <span style={{ background:'#fffbeb', color:'#b45309', border:'1px solid #fde68a', borderRadius:8, padding:'6px 12px', fontSize:12, fontWeight:700 }}>
                ⚠ ครบ ≤60 วัน: {nearMaturity} รายการ
              </span>}
          </div>
        )}
      </div>

      {/* ── KPI ── */}
      <div className="grid grid-4" style={{ marginBottom:16 }}>
        <div className="kpi">
          <div className="kpi-accent" style={{ background:'#c53030' }} />
          <div className="kpi-label">ภาระหนี้รวม (Active)</div>
          <div className="kpi-value" style={{ fontSize:17, color:'#c53030' }}>{fmtMoney(totalOutstanding)}</div>
          <div style={{ fontSize:11, color:'#a0aec0', marginTop:2 }}>{active.length} รายการ</div>
        </div>
        <div className="kpi">
          <div className="kpi-accent" style={{ background:'#c05621' }} />
          <div className="kpi-label">ดอกเบี้ยค้างชำระ (real-time)</div>
          <div className="kpi-value" style={{ fontSize:17, color:'#c05621' }}>{fmtMoney(totalInterest)}</div>
          <div style={{ fontSize:11, color:'#a0aec0', marginTop:2 }}>คำนวณ ณ วันนี้</div>
        </div>
        <div className="kpi">
          <div className="kpi-accent" style={{ background:'#2a6fdb' }} />
          <div className="kpi-label">โอนสิทธิรับเงิน (TR)</div>
          <div className="kpi-value" style={{ fontSize:17 }}>{fmtMoney(trOutstanding)}</div>
          <div style={{ fontSize:11, color:'#a0aec0', marginTop:2 }}>{active.filter(function(r){ return r.debtType==='transfer_rights'; }).length} รายการ</div>
        </div>
        <div className="kpi">
          <div className="kpi-accent" style={{ background:'#6b46c1' }} />
          <div className="kpi-label">OD / PN / Term Loan</div>
          <div className="kpi-value" style={{ fontSize:17 }}>{fmtMoney(standaloneOut)}</div>
          <div style={{ fontSize:11, color:'#a0aec0', marginTop:2 }}>Standalone</div>
        </div>
      </div>

      {/* ── Type Summary Cards ── */}
      <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:16 }}>
        {Object.keys(DL_TYPE).map(function(t){
          var rows = typeGroups[t];
          if (!rows || rows.length===0) return null;
          return <TypeCard key={t} debtType={t} rows={rows} today={today} />;
        })}
      </div>

      {/* ── Filter bar ── */}
      <div className="card" style={{ padding:'10px 14px', marginBottom:12, display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
        {/* Status tabs */}
        <div className="tabnav" style={{ flex:'none' }}>
          {[['active','Active ('+cntActive+')'],['pending_approval','รออนุมัติ ('+cntPending+')'],['closed','ปิดแล้ว ('+cntClosed+')'],['all','ทั้งหมด ('+ledger.length+')']].map(function(pair){
            return (
              <button key={pair[0]} className={statusFilter===pair[0]?'active':''} onClick={function(){ setStatusFilter(pair[0]); }}>
                {pair[1]}
              </button>
            );
          })}
        </div>
        {/* Type pills */}
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          <button onClick={function(){ setTypeFilter('all'); }}
            style={{ padding:'3px 11px', borderRadius:20, border:'1.5px solid', fontSize:11, fontWeight:600, cursor:'pointer',
                     borderColor: typeFilter==='all'?'var(--brand-500)':'#e2e8f0',
                     background:  typeFilter==='all'?'var(--brand-50,#f0f6ff)':'#fff',
                     color:       typeFilter==='all'?'var(--brand-700)':'#718096' }}>
            ทุกประเภท
          </button>
          {Object.entries(DL_TYPE).map(function(kv){
            var k=kv[0], m=kv[1];
            var has = typeGroups[k] && typeGroups[k].length > 0;
            if (!has) return null;
            return (
              <button key={k} onClick={function(){ setTypeFilter(k); }}
                style={{ padding:'3px 11px', borderRadius:20, border:'1.5px solid', fontSize:11, fontWeight:600, cursor:'pointer',
                         borderColor: typeFilter===k?m.color:m.border,
                         background:  typeFilter===k?m.bg:'#fff',
                         color:       typeFilter===k?m.color:'#718096' }}>
                {m.short} {m.label}
              </button>
            );
          })}
        </div>
        {/* Search */}
        <input style={{ ...inp, flex:1, minWidth:220, marginLeft:'auto' }}
          value={query} onChange={function(e){ setQuery(e.target.value); }}
          placeholder="ค้นหา เลขที่หนี้ / โครงการ / ธนาคาร / หลักประกัน…" />
        <span style={{ fontSize:12, color:'#718096' }}>{filtered.length} รายการ</span>
      </div>

      {/* ── Detail Table ── */}
      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'#f8fafc' }}>
                {['เลขที่หนี้','ประเภท','โครงการ / อ้างอิง','ธนาคาร','อัตราดอก','วงเงินต้น','คงเหลือ','ดอกเบี้ยค้าง (real-time)','วันเบิก','ครบกำหนด','หลักประกัน','สถานะ','หมายเหตุ'].map(function(h,i){
                  var right = i>=4&&i<=7;
                  return <th key={i} style={{ padding:'8px 12px', textAlign:right?'right':'left', fontWeight:600, color:'#475569', borderBottom:'1px solid #e2e8f0', whiteSpace:'nowrap', fontSize:11 }}>{h}</th>;
                })}
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr><td colSpan={13} style={{ padding:32, textAlign:'center', color:'#a0aec0' }}>ไม่พบรายการ</td></tr>
              )}
              {sorted.map(function(r, i){
                var overdue = r.status==='overdue';
                var nearMat = r.maturityDate && Math.round((new Date(r.maturityDate)-new Date(today))/86400000)<=30 && r.status==='active';
                return <DebtRow key={r.id||r.debtNo||i} r={r} today={today} highlight={overdue||nearMat} />;
              })}
            </tbody>
            {sorted.length > 0 && (
              <tfoot>
                <tr style={{ background:'#fef2f2', fontWeight:700, borderTop:'2px solid #e2e8f0' }}>
                  <td colSpan={5} style={{ padding:'9px 12px', fontSize:12, color:'#475569' }}>
                    รวม {filtered.length} รายการ (ที่ Active {filtered.filter(function(r){ return r.status==='active'||r.status==='overdue'; }).length})
                  </td>
                  <td style={{ padding:'9px 12px', textAlign:'right', fontVariantNumeric:'tabular-nums' }}>
                    {fmtMoney(filtered.reduce(function(s,r){ return s+(parseFloat(r.principalAmount)||0); },0))}
                  </td>
                  <td style={{ padding:'9px 12px', textAlign:'right', fontVariantNumeric:'tabular-nums', color:'#c53030', fontSize:13 }}>
                    {fmtMoney(filtOutstanding)}
                  </td>
                  <td style={{ padding:'9px 12px', textAlign:'right', fontVariantNumeric:'tabular-nums', color:'#c05621' }}>
                    {filtInterest > 0 ? fmtMoney(filtInterest) : '—'}
                  </td>
                  <td colSpan={5}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { DebtPage });
