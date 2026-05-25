// Invoices page — ใหม่ตาม spec
// - Columns: Job no | invno | invdate | ชื่อโครงการ | Balance | ผู้รับโอนสิทธิ | ภาระหนี้ | สุทธิ | สถานะ
// - 4 statuses: pending_inspection / tracking / issue / paid
// - Follow-up log (รอบติดตาม) + ผู้ติดต่อ + เบอร์โทร + คาดรับเงิน + รับจริง (วันที่/จำนวน/บัญชี)
// - Paste RAW_IV_OUTSTANDING (TSV/JSON) → ระบบหาว่าใบไหนใหม่ → import เฉพาะใหม่
// - Sort + Filter + Search

const { useState: ivState, useMemo: ivMemo, useRef: ivRef, useEffect: ivEffect } = React;

// ── normalizeJobNo: ตัด productType suffix ออกจาก jobNo ──────────────────────
// INS049-PL  → { jobNo: 'INS049',  productType: 'PL'    }
// SV-878-PL  → { jobNo: 'SV-878',  productType: 'PL'    }
// TWC007-PDH → { jobNo: 'TWC007',  productType: 'PDH'   }
// AW097-STIIS→ { jobNo: 'AW097',   productType: 'STIIS' }
// PP064      → { jobNo: 'PP064',   productType: ''      }  (ไม่มี suffix → ไม่แตะ)
function normalizeJobNo(raw) {
  if (!raw) return { jobNo: '', productType: '' };
  const s = raw.trim();
  // match: <anything>-<2-6 uppercase letters> at end
  const m = s.match(/^(.+)-([A-Z]{2,6})$/);
  if (m) return { jobNo: m[1], productType: m[2] };
  return { jobNo: s, productType: '' };
}

// ── helper: ค่าที่ใช้แสดงใน filter dropdown สำหรับแต่ละ column ──────────────
function ivColDisplayVal(colKey, iv) {
  switch (colKey) {
    case 'status':          return WTPData.IV_STATUS_META[iv.status]?.label || iv.status || '—';
    case 'invoiceDate':     return fmtDate(iv.invoiceDate) || '—';
    case 'expectedReceive': return fmtDate(iv.expectedReceive) || '—';
    default: {
      const v = iv[colKey];
      return (v == null || v === '' || v === '—') ? '—' : String(v);
    }
  }
}

// ── Dropdown portal (fixed-position เพื่อข้าม overflow ของตาราง) ─────────────
function IvColFilterDropdown({ btnRef, colKey, allRows, active, onApply, onClose }) {
  const [search, setSearch] = ivState('');
  const [pos, setPos]       = ivState(null);
  const selfRef             = ivRef(null);

  // คำนวณตำแหน่งจาก button
  ivEffect(() => {
    const calc = () => {
      if (!btnRef.current) return;
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: Math.min(r.left, window.innerWidth - 290) });
    };
    calc();
    window.addEventListener('scroll', calc, true);
    window.addEventListener('resize', calc);
    return () => { window.removeEventListener('scroll', calc, true); window.removeEventListener('resize', calc); };
  }, []);

  // ปิดเมื่อคลิกข้างนอก
  ivEffect(() => {
    const h = (e) => {
      if (selfRef.current && !selfRef.current.contains(e.target) &&
          btnRef.current  && !btnRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // unique values + count
  const allVals = ivMemo(() => {
    const map = new Map();
    allRows.forEach(iv => {
      const v = ivColDisplayVal(colKey, iv);
      map.set(v, (map.get(v) || 0) + 1);
    });
    return [...map.entries()].sort((a, b) => {
      if (a[0] === '—') return 1; if (b[0] === '—') return -1;
      return a[0].localeCompare(b[0], 'th');
    });
  }, [allRows, colKey]);

  const visibleVals = search.trim()
    ? allVals.filter(([v]) => v.toLowerCase().includes(search.trim().toLowerCase()))
    : allVals;

  const isAllSelected = !active || active.size === 0;
  const isChecked = (v) => isAllSelected || (active && active.has(v));

  const toggle = (val) => {
    let next;
    if (isAllSelected) {
      next = new Set(allVals.map(([v]) => v));
      next.delete(val);
    } else {
      next = new Set(active);
      if (next.has(val)) next.delete(val); else next.add(val);
    }
    onApply(next.size === 0 || next.size === allVals.length ? null : next);
  };

  if (!pos) return null;

  const dropdown = (
    <div ref={selfRef} onClick={e => e.stopPropagation()} style={{
      position: 'fixed', top: pos.top, left: pos.left, zIndex: 99999,
      background: 'var(--surface, #fff)', border: '1.5px solid var(--ink-200, #dde3ee)',
      borderRadius: 10, boxShadow: '0 10px 40px rgba(0,0,0,0.18)',
      minWidth: 230, maxWidth: 300, fontSize: 12.5,
    }}>
      {/* ช่องค้นหาใน dropdown */}
      <div style={{ padding: '8px 10px 6px' }}>
        <input autoFocus className="input"
          style={{ fontSize: 12, padding: '4px 8px', width: '100%', boxSizing: 'border-box' }}
          placeholder="ค้นหาใน dropdown..." value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Escape' && onClose()} />
      </div>

      {/* เลือกทั้งหมด */}
      <div style={{ borderTop: '1px solid var(--ink-100)', borderBottom: '1px solid var(--ink-100)' }}>
        <label style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px', cursor: 'pointer',
          background: isAllSelected ? 'color-mix(in oklch,var(--brand-500) 8%,transparent)' : '',
        }}>
          <input type="checkbox" checked={isAllSelected} onChange={() => onApply(null)}
            style={{ width: 14, height: 14, cursor: 'pointer', flexShrink: 0 }} />
          <span style={{ fontWeight: 600, color: 'var(--ink-700)', flex: 1 }}>(เลือกทั้งหมด)</span>
          <span style={{ color: 'var(--ink-400)', fontSize: 11 }}>{allRows.length}</span>
        </label>
      </div>

      {/* รายการค่า */}
      <div style={{ maxHeight: 260, overflowY: 'auto' }}>
        {visibleVals.length === 0 && (
          <div style={{ padding: '10px 12px', color: 'var(--ink-400)' }}>ไม่พบค่าที่ตรงกัน</div>
        )}
        {visibleVals.map(([val, count]) => {
          const checked = isChecked(val);
          return (
            <label key={val} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '5px 12px', cursor: 'pointer',
              borderBottom: '1px solid var(--ink-50)',
              background: checked && !isAllSelected ? 'color-mix(in oklch,var(--brand-500) 5%,transparent)' : '',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--ink-50)'}
            onMouseLeave={e => e.currentTarget.style.background = checked && !isAllSelected ? 'color-mix(in oklch,var(--brand-500) 5%,transparent)' : ''}>
              <input type="checkbox" checked={checked} onChange={() => toggle(val)}
                style={{ width: 14, height: 14, cursor: 'pointer', flexShrink: 0 }} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val}</span>
              <span style={{ flexShrink: 0, color: 'var(--ink-400)', fontSize: 11 }}>{count}</span>
            </label>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px solid var(--ink-100)', padding: '6px 10px', display: 'flex', justifyContent: 'space-between', gap: 6 }}>
        <button className="btn btn-ghost btn-sm"
          style={{ fontSize: 11, color: 'var(--bad)', padding: '2px 8px' }}
          onClick={() => { onApply(null); onClose(); }}>
          ล้างตัวกรอง
        </button>
        <button className="btn btn-sm"
          style={{ fontSize: 11, padding: '2px 10px', background: 'var(--brand-500)', color: '#fff', border: 'none', borderRadius: 5 }}
          onClick={onClose}>
          ✓ ตกลง
        </button>
      </div>
    </div>
  );

  return ReactDOM.createPortal(dropdown, document.body);
}

// ── Column header: sort + filter icon ────────────────────────────────────────
function IvColHeader({ label, sortKey, sort, sortToggle, align = 'center', width,
                       colKey, colFilters, setColFilters, openCol, setOpenCol, allRows }) {
  const btnRef    = ivRef(null);
  const active    = colFilters[colKey];
  const isActive  = active && active.size > 0;
  const isOpen    = openCol === colKey;
  const sortOn    = sort.key === sortKey;

  const applyFilter = (vals) => setColFilters(prev => {
    const next = { ...prev };
    if (!vals) delete next[colKey]; else next[colKey] = vals;
    return next;
  });

  return (
    <th style={{ width, textAlign: align, userSelect: 'none', position: 'relative' }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        width: '100%', justifyContent: align === 'right' ? 'flex-end' : 'center',
      }}>
        {/* Sort label */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
          onClick={() => sortToggle(sortKey)}>
          {label}
          <span style={{ opacity: sortOn ? 1 : 0.25, fontSize: 9, display: 'inline-flex', flexDirection: 'column', lineHeight: 1 }}>
            <span style={{ color: sortOn && sort.dir === 'asc' ? 'var(--brand-600)' : 'inherit' }}>▲</span>
            <span style={{ color: sortOn && sort.dir === 'desc' ? 'var(--brand-600)' : 'inherit', marginTop: -2 }}>▼</span>
          </span>
        </span>

        {/* Filter button */}
        <button ref={btnRef}
          onClick={(e) => { e.stopPropagation(); setOpenCol(isOpen ? null : colKey); }}
          title={isActive ? `กรองอยู่ ${active.size} ค่า — คลิกแก้ไข` : 'กรองคอลัมน์'}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 2,
            background: isActive ? 'var(--brand-500)' : 'transparent',
            color: isActive ? '#fff' : isOpen ? 'var(--brand-500)' : 'var(--ink-350,#aab)',
            border: isActive ? 'none' : `1px solid ${isOpen ? 'var(--brand-300)' : 'transparent'}`,
            borderRadius: 4, padding: '1px 3px', cursor: 'pointer',
            fontSize: 10, lineHeight: 1, flexShrink: 0,
            transition: 'background 120ms, color 120ms',
          }}
          onMouseEnter={e => { if (!isActive) { e.currentTarget.style.color = 'var(--brand-500)'; e.currentTarget.style.borderColor = 'var(--brand-200)'; }}}
          onMouseLeave={e => { if (!isActive) { e.currentTarget.style.color = isOpen ? 'var(--brand-500)' : 'var(--ink-350,#aab)'; e.currentTarget.style.borderColor = isOpen ? 'var(--brand-300)' : 'transparent'; }}}>
          {/* funnel icon */}
          <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor">
            <path d="M1 1.5h8L6.2 5v3.5l-2.4-1V5L1 1.5z"/>
          </svg>
          {isActive && <span style={{ fontSize: 9, fontWeight: 700 }}>{active.size}</span>}
        </button>
      </div>

      {/* Dropdown */}
      {isOpen && (
        <IvColFilterDropdown
          btnRef={btnRef} colKey={colKey} allRows={allRows} active={active}
          onApply={applyFilter} onClose={() => setOpenCol(null)}
        />
      )}
    </th>
  );
}

function InvoicesPage({ data, setData, toast }) {
  const [filter, setFilter] = ivState('all');
  const [query, setQuery] = ivState('');
  const [detail, setDetail] = ivState(null);
  const [showImport, setShowImport] = ivState(false);
  const [payModal, setPayModal] = ivState(null);
  const [sugOpen, setSugOpen] = ivState(false);
  const searchBoxRef = ivRef(null);
  const [colFilters, setColFilters] = ivState({});   // { colKey: Set<displayVal> }
  const [openCol, setOpenCol]       = ivState(null); // colKey ของ dropdown ที่เปิดอยู่

  const { projectByCode, financeByCode } = ivMemo(() => WTPData.buildLookups(data), [data.projects]);

  // Joined rows: invoice + project name + finance (assignee, debt)
  const VALID_STATUS = new Set(['pending_inspection', 'tracking', 'issue', 'paid']);
  // map รหัสสถานะแบบเก่า/ทางเลือก → สถานะ canonical 4 ตัว
  const STATUS_ALIAS = { pending: 'tracking', '': 'pending_inspection' };
  const rows = ivMemo(() => data.invoices.map(iv => {
    // ── normalize jobNo: ตัด productType suffix ออก ───────────────────────────
    // INS049-PL → jobNo='INS049', productType='PL'  |  SV-878-PL → 'SV-878'
    const norm = normalizeJobNo(iv.jobNo);
    const cleanJobNo    = norm.jobNo;
    const inferredPType = norm.productType;

    // lookup ด้วย cleanJobNo → fallback ด้วย contractRef (Ref.code เช่น 6901-01)
    const p = projectByCode[cleanJobNo] || projectByCode[iv.contractRef] || {};
    const f = financeByCode[cleanJobNo] || financeByCode[iv.contractRef] || {};
    // Support both old schema (f.debt, f.assignee) and new RAW schema
    const debt     = Number(f.debt ?? f['ภาระหนี้'] ?? 0);
    const assignee = f.assignee || f['ผู้รับโอนสิทธิ์'] || '—';
    // normalize: trim + alias map + fallback → 4 canonical statuses
    const rawStatus = (iv.status || '').toString().trim();
    const aliased   = STATUS_ALIAS[rawStatus] != null ? STATUS_ALIAS[rawStatus] : rawStatus;
    const status    = VALID_STATUS.has(aliased) ? aliased : 'pending_inspection';
    return {
      ...iv,
      jobNo:       cleanJobNo,                              // แสดง INS049 แทน INS049-PL
      productType: iv.productType || inferredPType || '',   // ใช้ที่มีอยู่ หรือ infer จาก suffix
      status,
      // fallback ลำดับ: project lookup (พื้นที่) → iv.projectName (parse จาก proj_dpt ตอน import) → '—'
      projectName: p['พื้นที่'] || p.name || iv.projectName || '—',
      assignee,
      debt,
      netExpected: (iv.balance || 0) - debt,
    };
  }), [data.invoices, projectByCode, financeByCode]);

  // match function: ค้นหาทุก column ที่อ่านได้
  const matchQuery = (iv, q) => {
    if (!q) return true;
    const fields = [
      iv.ivNo, iv.jobNo, iv.projectName, iv.contactName, iv.contactPhone,
      iv.remark, iv.customer, iv.productType, iv.assignee, iv.contractRef,
      iv.invoiceDate, iv.expectedReceive,
      iv.balance != null ? String(iv.balance) : '',
      iv.debt    != null ? String(iv.debt)    : '',
      iv.netExpected != null ? String(iv.netExpected) : '',
      WTPData.IV_STATUS_META[iv.status]?.label || '',
    ];
    return fields.some(v => (v || '').toString().toLowerCase().includes(q));
  };

  const filtered = ivMemo(() => {
    let xs = rows;
    if (filter !== 'all') xs = xs.filter(iv => iv.status === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      xs = xs.filter(iv => matchQuery(iv, q));
    }
    // ── column filters (Excel-style) ──────────────────────────────────────
    for (const [key, vals] of Object.entries(colFilters)) {
      if (vals && vals.size > 0) {
        xs = xs.filter(iv => vals.has(ivColDisplayVal(key, iv)));
      }
    }
    return xs;
  }, [rows, filter, query, colFilters]);

  // suggestions สำหรับ dropdown (สูงสุด 8 รายการ ค้นข้าม filter)
  const suggestions = ivMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return rows.filter(iv => matchQuery(iv, q)).slice(0, 8);
  }, [rows, query]);

  // ปิด suggestions เมื่อคลิกนอก search box
  ivEffect(() => {
    if (!sugOpen) return;
    const handler = (e) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target)) setSugOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [sugOpen]);

  // highlight ส่วนที่ตรงกับคำค้นใน text
  const highlight = (text, q) => {
    if (!q || !text) return text || '';
    const s = String(text);
    const i = s.toLowerCase().indexOf(q);
    if (i < 0) return s;
    return (
      <>{s.slice(0, i)}<mark style={{ background: 'oklch(95% 0.12 95)', color: 'inherit', padding: 0, borderRadius: 2 }}>{s.slice(i, i + q.length)}</mark>{s.slice(i + q.length)}</>
    );
  };

  const { sorted, sort, toggle } = useSortable(filtered, 'invoiceDate', 'desc');

  const counts = {
    all: rows.length,
    pending_inspection: rows.filter(r => r.status === 'pending_inspection').length,
    tracking:           rows.filter(r => r.status === 'tracking').length,
    issue:              rows.filter(r => r.status === 'issue').length,
    paid:               rows.filter(r => r.status === 'paid').length,
  };
  const sums = {
    balance:    rows.reduce((s, r) => s + (Number(r.balance) || 0), 0),
    debt:       rows.reduce((s, r) => s + (Number(r.debt) || 0), 0),
    net:        rows.reduce((s, r) => s + (Number(r.netExpected) || 0), 0),
    pendingNet: rows.filter(r => r.status !== 'paid').reduce((s, r) => s + (Number(r.netExpected) || 0), 0),
  };

  const save = (iv) => {
    setData(d => ({
      ...d,
      invoices: iv.id ? d.invoices.map(x => x.id === iv.id ? iv : x) : [{ ...iv, id: WTPData.newId() }, ...d.invoices],
    }));
    setDetail(prev => prev && prev.id === iv.id ? iv : prev);
    toast('บันทึกใบแจ้งหนี้แล้ว');
  };
  const remove = (id) => {
    if (!confirm('ยืนยันการลบใบแจ้งหนี้นี้?')) return;
    setData(d => ({ ...d, invoices: d.invoices.filter(iv => iv.id !== id) }));
    setDetail(null);
    toast('ลบใบแจ้งหนี้แล้ว');
  };

  const newInvoice = () => setDetail({
    id: null,
    ivNo: '', jobNo: data.projects[0]?.code || '', period: 1,
    invoiceDate: data.meta.asOf, balance: 0,
    status: 'pending_inspection', expectedReceive: '',
    contactName: '', contactPhone: '',
    followUps: [], actualReceive: null,
  });

  // Status quick-set on each row (table-level)
  const updateStatus = (iv, newStatus) => {
    if (newStatus === 'paid') {
      // เปิด QuickPayModal แทนบันทึกทันที
      setPayModal({
        iv,
        draft: {
          date: new Date().toISOString().slice(0, 10),
          amount: iv.balance,
          bankAccount: '',
          bankFee: 0,
          otherFee: 0,
        },
      });
      return;
    }
    save({ ...iv, status: newStatus });
  };

  return (
    <div className="page">
      <div className="page-head anim-in">
        <div>
          <h1 className="page-title">ใบแจ้งหนี้คงค้าง</h1>
          <div className="page-sub">RAW_IV_OUTSTANDING · {rows.length} ใบ · ผู้ดูแล: ฝ่ายติดตามรับเงิน</div>
        </div>
        <div className="page-head-r">
          <button className="btn btn-ghost" onClick={() => setShowImport(true)}><Icon name="upload" size={14} /> วาง RAW_IV_OUTSTANDING</button>
        </div>
      </div>

      <div className="grid grid-4 anim-stagger" style={{ marginBottom: 16 }}>
        <KpiTile label="ยอด Balance รวม" value={sums.balance} accent="var(--brand-500)" icon="invoice" />
        <KpiTile label="ภาระหนี้รวม"      value={sums.debt} accent="var(--bad)" icon="arrow_up" />
        <KpiTile label="คาดรับสุทธิ (ค้าง)" value={sums.pendingNet} accent="var(--good)" icon="coin" />
        <KpiTile label="ติดปัญหา"          value={counts.issue} unit=" ใบ" digits={0} accent="oklch(60% 0.22 25)" icon="invoice" />
      </div>

      <div className="card" style={{ padding: 14, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div className="tabnav">
          <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>ทั้งหมด ({counts.all})</button>
          <button className={filter === 'pending_inspection' ? 'active' : ''} onClick={() => setFilter('pending_inspection')}>รอใบตรวจรับ ({counts.pending_inspection})</button>
          <button className={filter === 'tracking' ? 'active' : ''} onClick={() => setFilter('tracking')}>กำลังติดตาม ({counts.tracking})</button>
          <button className={filter === 'issue' ? 'active' : ''} onClick={() => setFilter('issue')}>ติดปัญหา ({counts.issue})</button>
          <button className={filter === 'paid' ? 'active' : ''} onClick={() => setFilter('paid')}>รับชำระแล้ว ({counts.paid})</button>
        </div>
        <div ref={searchBoxRef} style={{ position: 'relative', width: 360 }}>
          <div className="tb-search" style={{ width: '100%' }}>
            <Icon name="search" size={14} />
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setSugOpen(true); }}
              onFocus={() => query.trim() && setSugOpen(true)}
              onKeyDown={(e) => { if (e.key === 'Escape') setSugOpen(false); }}
              placeholder="ค้นหาทุกคอลัมน์ — IV / Job / โครงการ / จังหวัด / ยอดเงิน / สถานะ…"
            />
            {query && (
              <button
                type="button"
                onClick={() => { setQuery(''); setSugOpen(false); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-400)', padding: '0 4px', fontSize: 14 }}
                title="ล้างคำค้นหา"
              >×</button>
            )}
          </div>

          {sugOpen && query.trim() && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50,
              background: 'var(--surface, #fff)', border: '1px solid var(--ink-200, #e2e8f0)',
              borderRadius: 9, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              maxHeight: 360, overflowY: 'auto',
            }}>
              {suggestions.length === 0 ? (
                <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--ink-400)' }}>
                  ไม่พบรายการที่ตรงกับ "{query}"
                </div>
              ) : (
                <>
                  <div style={{ padding: '6px 12px', fontSize: 10.5, color: 'var(--ink-400)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--ink-100)' }}>
                    ผลที่แนะนำ · {suggestions.length}{rows.filter(iv => matchQuery(iv, query.trim().toLowerCase())).length > suggestions.length ? '+' : ''} จาก {rows.length}
                  </div>
                  {suggestions.map(iv => {
                    const q = query.trim().toLowerCase();
                    const sMeta = WTPData.IV_STATUS_META[iv.status] || { label: iv.status, badge: 'b-gray' };
                    return (
                      <div
                        key={iv.id}
                        onClick={() => { setDetail(iv); setSugOpen(false); }}
                        style={{
                          padding: '8px 12px', cursor: 'pointer',
                          borderBottom: '1px solid var(--ink-50, #f1f5f9)',
                          display: 'flex', alignItems: 'center', gap: 10,
                          transition: 'background 100ms',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--ink-50, #f7fafc)'}
                        onMouseLeave={e => e.currentTarget.style.background = ''}
                      >
                        <div style={{ minWidth: 80 }}>
                          <div style={{ fontFamily: 'ui-monospace', fontWeight: 700, fontSize: 11.5, color: 'var(--brand-700)' }}>
                            {highlight(iv.jobNo, q)}
                          </div>
                          <div style={{ fontFamily: 'ui-monospace', fontSize: 10.5, color: 'var(--ink-500)' }}>
                            {highlight(iv.ivNo, q)}
                          </div>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {highlight(iv.projectName, q)}
                          </div>
                          {(iv.contactName || iv.customer || iv.remark) && (
                            <div style={{ fontSize: 10.5, color: 'var(--ink-500)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {highlight(iv.contactName || iv.customer || iv.remark, q)}
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign: 'right', minWidth: 90 }}>
                          <div style={{ fontFamily: 'ui-monospace', fontSize: 11.5, fontWeight: 600 }}>
                            {fmtNum(iv.balance, 0)} ฿
                          </div>
                          <Badge kind={sMeta.badge}>{sMeta.label}</Badge>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── active column filters summary bar ────────────────────────────────── */}
      {Object.keys(colFilters).some(k => colFilters[k] && colFilters[k].size > 0) && (
        <div style={{
          display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6,
          padding: '6px 12px', marginBottom: 8,
          background: 'color-mix(in oklch,var(--brand-500) 7%,transparent)',
          border: '1px solid color-mix(in oklch,var(--brand-500) 25%,transparent)',
          borderRadius: 8, fontSize: 12,
        }}>
          <span style={{ color: 'var(--brand-700)', fontWeight: 600, fontSize: 11 }}>🔽 กรองอยู่:</span>
          {Object.entries(colFilters).filter(([, v]) => v && v.size > 0).map(([key, vals]) => {
            const labelMap = { jobNo:'Job No.', ivNo:'IV No.', invoiceDate:'วันที่ออก IV', projectName:'ชื่อโครงการ', balance:'ยอดค้างชำระ', assignee:'ผู้รับโอนสิทธิ์', debt:'ภาระหนี้', netExpected:'คาดรับสุทธิ', expectedReceive:'วันคาดรับเงิน', status:'สถานะ' };
            const preview = [...vals].slice(0, 2).join(', ') + (vals.size > 2 ? ` +${vals.size - 2}` : '');
            return (
              <span key={key} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: 'var(--brand-500)', color: '#fff',
                borderRadius: 20, padding: '2px 8px', fontSize: 11,
              }}>
                <strong>{labelMap[key] || key}</strong>: {preview}
                <button onClick={() => setColFilters(p => { const n={...p}; delete n[key]; return n; })}
                  style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0, marginLeft: 2, fontSize: 13, lineHeight: 1 }}>×</button>
              </span>
            );
          })}
          <button onClick={() => setColFilters({})}
            style={{ background: 'none', border: '1px solid var(--brand-400)', color: 'var(--brand-700)', borderRadius: 5, padding: '2px 8px', cursor: 'pointer', fontSize: 11 }}>
            ล้างทั้งหมด
          </button>
          <span style={{ marginLeft: 'auto', color: 'var(--ink-500)', fontSize: 11 }}>
            แสดง {filtered.length} / {rows.length} รายการ
          </span>
        </div>
      )}

      <div className="card anim-in" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'min(480px, calc(100vh - 400px))' }}>
        <table className="tbl" style={{ tableLayout: 'fixed', width: '100%', minWidth: 1080 }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 3, background: 'var(--surface)' }}>
            <tr>
              <IvColHeader label="Job No."          sortKey="jobNo"           colKey="jobNo"           sort={sort} sortToggle={toggle} align="center" width={90}  colFilters={colFilters} setColFilters={setColFilters} openCol={openCol} setOpenCol={setOpenCol} allRows={rows} />
              <IvColHeader label="เลขที่ IV"        sortKey="ivNo"            colKey="ivNo"            sort={sort} sortToggle={toggle} align="center" width={110} colFilters={colFilters} setColFilters={setColFilters} openCol={openCol} setOpenCol={setOpenCol} allRows={rows} />
              <IvColHeader label="วันที่ออก IV"     sortKey="invoiceDate"     colKey="invoiceDate"     sort={sort} sortToggle={toggle} align="center" width={95}  colFilters={colFilters} setColFilters={setColFilters} openCol={openCol} setOpenCol={setOpenCol} allRows={rows} />
              <IvColHeader label="ชื่อโครงการ"      sortKey="projectName"     colKey="projectName"     sort={sort} sortToggle={toggle} align="center"            colFilters={colFilters} setColFilters={setColFilters} openCol={openCol} setOpenCol={setOpenCol} allRows={rows} />
              <IvColHeader label="ยอดค้างชำระ (฿)" sortKey="balance"         colKey="balance"         sort={sort} sortToggle={toggle} align="right"  width={130} colFilters={colFilters} setColFilters={setColFilters} openCol={openCol} setOpenCol={setOpenCol} allRows={rows} />
              <IvColHeader label="ผู้รับโอนสิทธิ์"  sortKey="assignee"        colKey="assignee"        sort={sort} sortToggle={toggle} align="center" width={110} colFilters={colFilters} setColFilters={setColFilters} openCol={openCol} setOpenCol={setOpenCol} allRows={rows} />
              <IvColHeader label="ภาระหนี้ (฿)"    sortKey="debt"            colKey="debt"            sort={sort} sortToggle={toggle} align="right"  width={110} colFilters={colFilters} setColFilters={setColFilters} openCol={openCol} setOpenCol={setOpenCol} allRows={rows} />
              <IvColHeader label="คาดรับสุทธิ (฿)" sortKey="netExpected"     colKey="netExpected"     sort={sort} sortToggle={toggle} align="right"  width={120} colFilters={colFilters} setColFilters={setColFilters} openCol={openCol} setOpenCol={setOpenCol} allRows={rows} />
              <IvColHeader label="วันคาดรับเงิน"    sortKey="expectedReceive" colKey="expectedReceive" sort={sort} sortToggle={toggle} align="center" width={105} colFilters={colFilters} setColFilters={setColFilters} openCol={openCol} setOpenCol={setOpenCol} allRows={rows} />
              <th style={{ width: 150, textAlign: 'center' }}>สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && <tr><td colSpan={11} className="muted" style={{ padding: 36, textAlign: 'center' }}>ไม่พบใบแจ้งหนี้</td></tr>}
            {sorted.map(iv => (
              <tr key={iv.id} style={{ cursor: 'pointer' }} onClick={() => setDetail(iv)}>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <span style={{ fontFamily: 'ui-monospace', fontWeight: 700, color: 'var(--brand-700)', fontSize: 12.5 }}>{iv.jobNo}</span>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <span style={{ fontFamily: 'ui-monospace', fontWeight: 600, fontSize: 12.5 }}>{iv.ivNo}</span>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(iv.invoiceDate)}</td>
                <td style={{ overflow: 'hidden', maxWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
                    {iv.productType && (
                      <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--brand-100,#e0f0ff)', color: 'var(--brand-700)', borderRadius: 4, padding: '1px 5px', letterSpacing: '0.03em', flexShrink: 0 }}>
                        {iv.productType}
                      </span>
                    )}
                    <span style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={iv.projectName}>
                      {iv.projectName}
                    </span>
                    {iv.followUps && iv.followUps.length > 0 && (
                      <span title={`📞 ติดตาม ${iv.followUps.length} ครั้ง · ล่าสุด ${fmtDate(iv.followUps[iv.followUps.length - 1].date)}`}
                        style={{ flexShrink: 0, fontSize: 10, color: 'var(--ink-400)', background: 'var(--ink-100)', borderRadius: 10, padding: '1px 5px', cursor: 'help' }}>
                        📞{iv.followUps.length}
                      </span>
                    )}
                  </div>
                </td>
                <td className="num strong" style={{ whiteSpace: 'nowrap' }}>{fmtNum(iv.balance, 0)}</td>
                <td style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>
                  {iv.assignee && iv.assignee !== '—' ? (
                    <Badge kind="b-violet" dot={false}>{iv.assignee}</Badge>
                  ) : <span className="muted">ไม่โอน</span>}
                </td>
                <td className="num" style={{ whiteSpace: 'nowrap', color: iv.debt ? 'var(--bad)' : 'inherit' }}>{iv.debt ? '-' + fmtNum(iv.debt, 0) : <span className="muted">—</span>}</td>
                <td className="num" style={{ whiteSpace: 'nowrap', color: 'var(--good)', fontWeight: 700 }}>{fmtNum(iv.netExpected, 0)}</td>
                <td style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>{fmtDate(iv.expectedReceive)}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <StatusPill
                    value={iv.status}
                    onChange={(v) => updateStatus(iv, v)}
                    options={Object.entries(WTPData.IV_STATUS_META).map(([k, v]) => ({ value: k, label: v.label, kind: v.badge }))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}>รวม ({sorted.length} ใบ)</td>
              <td className="num strong">{fmtNum(sorted.reduce((s,r)=>s+(Number(r.balance)||0), 0), 0)}</td>
              <td></td>
              <td className="num" style={{ color: 'var(--bad)' }}>-{fmtNum(sorted.reduce((s,r)=>s+(Number(r.debt)||0), 0), 0)}</td>
              <td className="num" style={{ color: 'var(--good)' }}>{fmtNum(sorted.reduce((s,r)=>s+(Number(r.netExpected)||0), 0), 0)}</td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
        </div>
      </div>

      <InvoiceDetailModal
        iv={detail}
        onClose={() => setDetail(null)}
        onSave={save}
        bankAccounts={data.bankAccounts}
        projects={data.projects}
        financeByCode={financeByCode}
        projectByCode={projectByCode}
      />

      <QuickPayModal
        open={!!payModal}
        iv={payModal?.iv}
        draft={payModal?.draft}
        bankAccounts={data.bankAccounts}
        onChangeDraft={(patch) => setPayModal(pm => pm ? { ...pm, draft: { ...pm.draft, ...patch } } : pm)}
        onConfirm={(ar) => {
          save({ ...payModal.iv, status: 'paid', actualReceive: ar });
          setPayModal(null);
        }}
        onCancel={() => setPayModal(null)}
      />

      <ImportRawIvModal
        open={showImport}
        onClose={() => setShowImport(false)}
        existing={data.invoices}
        onImport={({ newRows, patchRows }) => {
          setData(d => {
            let invoices = d.invoices;
            if (patchRows.length > 0) {
              const patchById = Object.fromEntries(patchRows.map(p => [p.id, p]));
              invoices = invoices.map(iv => patchById[iv.id] ? { ...iv, ...patchById[iv.id] } : iv);
            }
            if (newRows.length > 0) {
              invoices = [...newRows.map(r => ({ ...r, id: WTPData.newId() })), ...invoices];
            }
            return { ...d, invoices };
          });
          setShowImport(false);
          const msgs = [];
          if (newRows.length) msgs.push(`นำเข้าใบใหม่ ${newRows.length} ใบ`);
          if (patchRows.length) msgs.push(`อัปเดตข้อมูล ${patchRows.length} ใบ`);
          toast(msgs.join(' · ') || 'ไม่มีการเปลี่ยนแปลง');
        }}
      />
    </div>
  );
}

/* ── IV Report View — รายงานติดตามสถานะใบแจ้งหนี้คงค้าง ──────────────────── */
function IvReportView({ rows, onOpen }) {
  const today        = new Date().toISOString().slice(0, 10);
  const weekEnd      = new Date(Date.now() + (6 - new Date().getDay()) * 86400000).toISOString().slice(0, 10);
  const nextWeekStart= new Date(Date.now() + (7 - new Date().getDay()) * 86400000).toISOString().slice(0, 10);
  const nextWeekEnd  = new Date(Date.now() + (13 - new Date().getDay()) * 86400000).toISOString().slice(0, 10);

  const daysDiff = (d) => d ? Math.round((new Date(d) - new Date(today)) / 86400000) : null;

  // ── Section definitions ──────────────────────────────────────────────────
  const sections = [
    {
      key: 'overdue',
      icon: '🚨', label: 'เกินกำหนดชำระ',
      color: '#9b1c1c', bg: '#fff5f5', border: '#fc8181',
      rows: rows.filter(iv =>
        iv.status === 'tracking' && iv.expectedReceive && iv.expectedReceive < today
      ),
    },
    {
      key: 'issue',
      icon: '⚠️', label: 'ติดปัญหา',
      color: '#c53030', bg: '#fff8f5', border: '#feb2b2',
      rows: rows.filter(iv => iv.status === 'issue'),
    },
    {
      key: 'today',
      icon: '✅', label: 'รับเงินแล้ววันนี้',
      color: '#276749', bg: '#f0fdf4', border: '#68d391',
      rows: rows.filter(iv => iv.status === 'paid' && iv.actualReceive?.date === today),
    },
    {
      key: 'this_week',
      icon: '📅', label: 'คาดรับสัปดาห์นี้',
      color: '#1e4fbd', bg: '#ebf8ff', border: '#63b3ed',
      rows: rows.filter(iv =>
        iv.status === 'tracking' &&
        iv.expectedReceive >= today && iv.expectedReceive <= weekEnd
      ),
    },
    {
      key: 'next_week',
      icon: '🗓', label: 'คาดรับสัปดาห์หน้า',
      color: '#6b46c1', bg: '#faf5ff', border: '#b794f4',
      rows: rows.filter(iv =>
        iv.status === 'tracking' &&
        iv.expectedReceive >= nextWeekStart && iv.expectedReceive <= nextWeekEnd
      ),
    },
    {
      key: 'tracking',
      icon: '🔍', label: 'กำลังติดตาม (ยังไม่ชัดเจน)',
      color: '#b45309', bg: '#fffbeb', border: '#f6ad55',
      rows: rows.filter(iv =>
        iv.status === 'tracking' &&
        !(iv.expectedReceive && iv.expectedReceive >= today && iv.expectedReceive <= nextWeekEnd) &&
        !(iv.expectedReceive && iv.expectedReceive < today)
      ),
    },
    {
      key: 'pending',
      icon: '📋', label: 'รอใบตรวจรับ',
      color: '#4a5568', bg: '#f7fafc', border: '#cbd5e0',
      rows: rows.filter(iv => iv.status === 'pending_inspection'),
    },
  ];

  // ── Summary KPIs ─────────────────────────────────────────────────────────
  const pending  = rows.filter(r => r.status !== 'paid');
  const totalBal = pending.reduce((s, r) => s + (Number(r.balance) || 0), 0);
  const totalNet = pending.reduce((s, r) => s + (Number(r.netExpected) || 0), 0);
  const cntOver  = sections.find(s => s.key === 'overdue').rows.length;
  const cntIssue = sections.find(s => s.key === 'issue').rows.length;
  const cntThis  = sections.find(s => s.key === 'this_week').rows.length;

  // ── Row component (detailed) ──────────────────────────────────────────────
  const IvDetailRow = ({ iv, secColor }) => {
    const lastLog  = iv.followUps && iv.followUps.length > 0
      ? iv.followUps[iv.followUps.length - 1] : null;
    const daysSince = lastLog ? -daysDiff(lastLog.date) : null;
    const daysLeft  = daysDiff(iv.expectedReceive);
    const isOverdue = daysLeft !== null && daysLeft < 0 && iv.status === 'tracking';
    const isPaid    = iv.status === 'paid';

    return (
      <div
        onClick={() => onOpen(iv)}
        style={{
          padding: '10px 16px', cursor: 'pointer',
          borderBottom: '1px solid #f0f4f8',
          transition: 'background 120ms',
        }}
        onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
        onMouseLeave={e => e.currentTarget.style.background = ''}
      >
        {/* Main row */}
        <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr auto auto', gap: '0 16px', alignItems: 'start' }}>

          {/* Col 1: Job + IV */}
          <div>
            <div style={{ fontFamily: 'ui-monospace', fontWeight: 800, fontSize: 12.5, color: 'var(--brand-700,#2a6fdb)' }}>
              {iv.jobNo}
            </div>
            <div style={{ fontSize: 10.5, color: '#718096', marginTop: 1 }}>
              {iv.ivNo}
            </div>
            <div style={{ fontSize: 10.5, color: '#a0aec0' }}>งวด {iv.period}</div>
          </div>

          {/* Col 2: Project + contact + last log */}
          <div>
            <div style={{ fontWeight: 600, fontSize: 12.5, lineHeight: 1.3, marginBottom: 3 }}>
              {iv.productType && (
                <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--brand-100,#dceaff)', color: 'var(--brand-700)', borderRadius: 4, padding: '1px 5px', marginRight: 5 }}>
                  {iv.productType}
                </span>
              )}
              {iv.projectName}
            </div>
            {(iv.contactName || iv.contactPhone) && (
              <div style={{ fontSize: 11, color: '#4a5568', marginBottom: 2 }}>
                📞 <span style={{ fontWeight: 500 }}>{iv.contactName}</span>
                {iv.contactPhone && <span style={{ color: '#718096' }}> · {iv.contactPhone}</span>}
              </div>
            )}
            {lastLog && (
              <div style={{ fontSize: 11, color: '#718096', background: '#f7f8fa', borderRadius: 5, padding: '3px 7px', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <span style={{ color: '#a0aec0', fontSize: 10 }}>
                  {fmtDate(lastLog.date)}
                  {daysSince !== null && daysSince > 0 && (
                    <span style={{ color: daysSince > 7 ? '#e53e3e' : '#718096', marginLeft: 3 }}>
                      ({daysSince} วันที่แล้ว)
                    </span>
                  )}
                </span>
                <span>— {lastLog.note}</span>
              </div>
            )}
            {!lastLog && iv.status !== 'paid' && (
              <div style={{ fontSize: 11, color: '#fc8181', fontStyle: 'italic' }}>⚠ ยังไม่มีการติดตาม</div>
            )}
          </div>

          {/* Col 3: Amount */}
          <div style={{ textAlign: 'right', minWidth: 110 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, fontVariantNumeric: 'tabular-nums' }}>
              {fmtNum(iv.balance, 0)}
            </div>
            {iv.netExpected !== iv.balance && (
              <div style={{ fontSize: 11, color: 'var(--good,#276749)', fontVariantNumeric: 'tabular-nums' }}>
                สุทธิ {fmtNum(iv.netExpected, 0)}
              </div>
            )}
            {iv.assignee && iv.assignee !== '—' && (
              <div style={{ fontSize: 10, color: '#6b46c1', marginTop: 2 }}>{iv.assignee}</div>
            )}
          </div>

          {/* Col 4: Date / status */}
          <div style={{ textAlign: 'right', minWidth: 90 }}>
            {isPaid && iv.actualReceive?.date ? (
              <div>
                <div style={{ fontSize: 11, color: '#276749', fontWeight: 600 }}>✓ รับแล้ว</div>
                <div style={{ fontSize: 11, color: '#276749' }}>{fmtDate(iv.actualReceive.date)}</div>
              </div>
            ) : iv.expectedReceive ? (
              <div>
                <div style={{ fontSize: 10.5, color: '#a0aec0' }}>คาดรับ</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: isOverdue ? '#e53e3e' : daysLeft !== null && daysLeft <= 7 ? '#dd6b20' : '#2d3748' }}>
                  {fmtDate(iv.expectedReceive)}
                </div>
                {daysLeft !== null && (
                  <div style={{ fontSize: 10.5, fontWeight: 600, color: isOverdue ? '#e53e3e' : daysLeft <= 7 ? '#dd6b20' : '#a0aec0' }}>
                    {isOverdue ? `เกิน ${Math.abs(daysLeft)} วัน` : `อีก ${daysLeft} วัน`}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: '#a0aec0' }}>ยังไม่ระบุ</div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Summary strip ──────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
        {[
          { label: 'ใบค้างชำระทั้งหมด', value: `${pending.length} ใบ`, sub: `${fmtNum(totalBal,0)} ฿`, color: 'var(--ink-700)', bg: '#f8fafc', border: '#e2e8f0' },
          { label: 'เกินกำหนด',         value: `${cntOver} ใบ`,        sub: cntOver > 0 ? 'ต้องจัดการด่วน!' : 'ไม่มี',  color: cntOver > 0 ? '#9b1c1c' : '#276749', bg: cntOver > 0 ? '#fff5f5' : '#f0fdf4', border: cntOver > 0 ? '#fc8181' : '#68d391' },
          { label: 'ติดปัญหา',          value: `${cntIssue} ใบ`,       sub: cntIssue > 0 ? 'รอแก้ไข' : 'ไม่มี',          color: cntIssue > 0 ? '#c53030' : '#276749', bg: cntIssue > 0 ? '#fff8f5' : '#f0fdf4', border: cntIssue > 0 ? '#feb2b2' : '#68d391' },
          { label: 'คาดรับสัปดาห์นี้', value: `${cntThis} ใบ`,        sub: `${fmtNum(sections.find(s=>s.key==='this_week').rows.reduce((a,r)=>a+(Number(r.balance)||0),0),0)} ฿`, color: '#1e4fbd', bg: '#ebf8ff', border: '#63b3ed' },
        ].map((k, i) => (
          <div key={i} style={{ background: k.bg, border: `1.5px solid ${k.border}`, borderRadius: 10, padding: '10px 14px' }}>
            <div style={{ fontSize: 11, color: '#718096', marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontWeight: 800, fontSize: 18, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 11.5, color: k.color, fontVariantNumeric: 'tabular-nums' }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Sections ───────────────────────────────────────────────────────── */}
      {sections.map(sec => {
        if (sec.rows.length === 0) return null; // ซ่อน section ที่ว่าง
        const secTotal = sec.rows.reduce((s, r) => s + (Number(r.balance) || 0), 0);
        const secNet   = sec.rows.reduce((s, r) => s + (Number(r.netExpected) || 0), 0);
        return (
          <div key={sec.key} className="card" style={{ padding: 0, overflow: 'hidden', border: `2px solid ${sec.border}` }}>
            {/* Section header */}
            <div style={{
              background: sec.bg, padding: '10px 16px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              borderBottom: `1px solid ${sec.border}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 15 }}>{sec.icon}</span>
                <span style={{ fontWeight: 700, fontSize: 13.5, color: sec.color }}>{sec.label}</span>
                <span style={{ background: sec.border, color: '#fff', borderRadius: 20, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>
                  {sec.rows.length} ใบ
                </span>
              </div>
              <div style={{ textAlign: 'right', fontSize: 12 }}>
                <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: sec.color }}>
                  {fmtNum(secTotal, 0)} ฿
                </span>
                {secNet !== secTotal && (
                  <span style={{ color: '#718096', marginLeft: 8 }}>สุทธิ {fmtNum(secNet, 0)} ฿</span>
                )}
              </div>
            </div>
            {/* Rows */}
            {sec.rows.map(iv => <IvDetailRow key={iv.id} iv={iv} secColor={sec.color} />)}
          </div>
        );
      })}

      {/* ── All clear ──────────────────────────────────────────────────────── */}
      {pending.length === 0 && (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🎉</div>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#276749' }}>ไม่มีใบแจ้งหนี้ค้างชำระ</div>
          <div style={{ fontSize: 13, color: '#718096', marginTop: 4 }}>ทุกใบได้รับชำระแล้ว</div>
        </div>
      )}
    </div>
  );
}

/* ── Formatted money input — shows xx,xxx.xx when not focused ───────────── */
function IvAmountInput({ value, onChange }) {
  const [focused, setFocused] = ivState(false);
  const [raw, setRaw]         = ivState('');
  const numVal = (value == null || value === '') ? 0 : (typeof value === 'number' ? value : parseFloat(String(value).replace(/,/g, '')) || 0);
  const display = numVal === 0 ? '' : fmtNum(numVal, 2);
  return (
    <div style={{ position: 'relative' }}>
      <input
        className="input"
        type="text"
        inputMode="decimal"
        value={focused ? raw : display}
        onChange={e => setRaw(e.target.value)}
        onFocus={e => { setFocused(true); setRaw(numVal === 0 ? '' : String(numVal)); setTimeout(() => e.target.select(), 0); }}
        onBlur={() => { const n = parseFloat(String(raw).replace(/,/g, '')) || 0; onChange(n); setFocused(false); }}
        placeholder="0.00"
        style={{ textAlign: 'right', paddingRight: 24, fontFamily: 'ui-monospace', fontWeight: 600 }}
      />
      <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--ink-400)', pointerEvents: 'none' }}>฿</span>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Detail modal: landscape split — read-only system data (left) + tracking (right)
// ────────────────────────────────────────────────────────────────────────────
function InvoiceDetailModal({ iv, onClose, onSave, bankAccounts, projects, financeByCode, projectByCode }) {
  const [draft, setDraft]         = ivState(iv);
  const [newLog, setNewLog]       = ivState({ date: new Date().toISOString().slice(0, 10), note: '' });
  const [saveError, setSaveError] = ivState('');

  React.useEffect(() => {
    setDraft(iv);
    setNewLog({ date: new Date().toISOString().slice(0, 10), note: '' });
    setSaveError('');
  }, [iv]);

  if (!iv || !draft) return null;

  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));
  const setReceive = (patch) => {
    if (patch === null) { setDraft(d => ({ ...d, actualReceive: null })); return; }
    setDraft(d => ({ ...d, actualReceive: { ...(d.actualReceive || {}), ...patch } }));
  };

  const isNew    = !draft.id;
  const isPaid   = draft.status === 'paid';
  const project  = projectByCode[draft.jobNo];
  const finance  = financeByCode[draft.jobNo];
  const debt     = finance?.debt || 0;
  const netExpected = (draft.balance || 0) - debt;

  // Computed: เงินเข้าบัญชีสุทธิ
  const ar       = draft.actualReceive;
  const netCash  = ar ? (ar.amount || 0) - (ar.bankFee || 0) - (ar.otherFee || 0) : 0;

  const addLog = () => {
    if (!newLog.note.trim()) return;
    setDraft(d => ({ ...d, followUps: [...(d.followUps || []), { ...newLog }] }));
    setNewLog(s => ({ ...s, note: '' }));
  };
  const removeLog = (idx) => setDraft(d => ({ ...d, followUps: d.followUps.filter((_, i) => i !== idx) }));

  const handleSave = () => {
    if (isPaid && (!ar || !ar.amount)) {
      setSaveError('กรุณากรอก "จำนวนเงินที่ได้รับจริง" เนื่องจากสถานะเป็น "รับชำระแล้ว"');
      return;
    }
    setSaveError('');
    onSave(draft);
  };

  const s = WTPData.IV_STATUS_META[draft.status] || { label: draft.status || '—', badge: 'b-gray', short: draft.status || '—' };

  // ── Sub-components ──────────────────────────────────────────────────────────
  const ROField = ({ fkey, label, mono, style: fieldStyle }) => {
    const v = draft[fkey];
    return (
      <div className="field" style={fieldStyle}>
        <label style={{ fontSize: 11, color: 'var(--ink-500)', display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ fontSize: 10, opacity: 0.5 }}>🔒</span>{label}
        </label>
        <div style={{
          height: 32, borderRadius: 7, border: '1px solid var(--ink-100)',
          background: 'var(--ink-50, #f7f8fa)', padding: '0 9px',
          display: 'flex', alignItems: 'center',
          fontFamily: mono ? 'ui-monospace' : undefined,
          fontSize: mono ? 11.5 : 12.5,
          color: !v ? 'var(--ink-300)' : mono ? 'var(--brand-700)' : 'var(--ink-800)',
          fontWeight: mono && v ? 600 : undefined,
          overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
          cursor: 'default', userSelect: 'text',
        }} title={v ? String(v) : ''}>{v || '—'}</div>
      </div>
    );
  };

  const RONum = ({ value, label, negative, style: fieldStyle }) => (
    <div className="field" style={fieldStyle}>
      <label style={{ fontSize: 11, color: 'var(--ink-500)', display: 'flex', alignItems: 'center', gap: 3 }}>
        <span style={{ fontSize: 10, opacity: 0.5 }}>🔒</span>{label}
      </label>
      <div style={{
        height: 32, borderRadius: 7, border: '1px solid var(--ink-100)',
        background: 'var(--ink-50, #f7f8fa)', padding: '0 22px 0 9px', position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        fontFamily: 'ui-monospace', fontSize: 12, fontWeight: 600, cursor: 'default',
        color: !value ? 'var(--ink-300)' : negative ? 'var(--bad)' : 'var(--ink-800)',
      }}>
        {!value ? '—' : (negative ? '-' : '') + fmtNum(Math.abs(value), 0)}
        {!!value && <span style={{ position: 'absolute', right: 7, fontSize: 10, color: 'var(--ink-400)', fontWeight: 400 }}>฿</span>}
      </div>
    </div>
  );

  const SectionHdr = ({ label, icon, muted }) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10,
      fontSize: 10.5, fontWeight: 700, letterSpacing: 0.65, textTransform: 'uppercase',
      color: muted ? 'var(--ink-500)' : 'var(--brand-700)',
      paddingBottom: 5, borderBottom: `1px solid ${muted ? 'var(--ink-100)' : 'color-mix(in oklch, var(--brand-500) 20%, transparent)'}`,
    }}>
      <Icon name={icon} size={11} />{label}
    </div>
  );

  return (
    <Modal
      open={!!iv}
      title={isNew ? 'IV ใหม่' : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Badge kind={s.badge}>{s.label}</Badge>
          <span style={{ fontFamily: 'ui-monospace', fontWeight: 700, color: 'var(--brand-700)', fontSize: 13 }}>{draft.jobNo || '—'}</span>
          <span style={{ color: 'var(--ink-300)', fontSize: 12 }}>·</span>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-700)' }}>{project?.['พื้นที่'] || project?.name || iv.projectName || '—'}</span>
        </div>
      )}
      maxWidth={920}
      onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>ยกเลิก</button>
        <button className="btn btn-primary" onClick={handleSave}><Icon name="check" size={14} /> บันทึก</button>
      </>}
    >
      {saveError && (
        <div style={{
          background: 'color-mix(in oklch, var(--bad) 8%, transparent)',
          border: '1px solid color-mix(in oklch, var(--bad) 28%, transparent)',
          borderRadius: 8, padding: '7px 13px', marginBottom: 12,
          fontSize: 13, color: 'var(--bad)', fontWeight: 500,
        }}>⚠️ {saveError}</div>
      )}

      {isNew ? (
        /* ── NEW INVOICE: compact single-column editable ─────────────────── */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <div className="field"><label>Job no</label>
            <select className="select input" value={draft.jobNo || ''} onChange={(e) => set('jobNo', e.target.value)}>
              <option value="">— เลือก —</option>
              {projects.map(p => <option key={p.id} value={p['Contract No.'] || p.code}>{p['Contract No.'] || p.code} · {(p['พื้นที่'] || p.name || '').slice(0,30)}</option>)}
            </select>
          </div>
          <div className="field"><label>เลขที่ IV</label><input className="input" value={draft.ivNo || ''} onChange={(e) => set('ivNo', e.target.value)} placeholder="IV2026-XXX" /></div>
          <div className="field"><label>วันที่ IV</label><input className="input" type="date" value={draft.invoiceDate || ''} onChange={(e) => set('invoiceDate', e.target.value)} /></div>
          <div className="field"><label>งวดที่</label><input className="input" type="number" value={draft.period || 1} onChange={(e) => set('period', Number(e.target.value))} /></div>
          <div className="field"><label>Balance (บาท)</label><input className="input" type="number" value={draft.balance || 0} onChange={(e) => set('balance', Number(e.target.value))} /></div>
          <div className="field"><label>สถานะ</label>
            <select className="select input" value={draft.status} onChange={(e) => { set('status', e.target.value); setSaveError(''); }}>
              {Object.entries(WTPData.IV_STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div className="field"><label>ชื่อผู้ติดต่อ</label><input className="input" value={draft.contactName || ''} onChange={(e) => set('contactName', e.target.value)} placeholder="เช่น คุณสมหญิง" /></div>
          <div className="field"><label>เบอร์โทร</label><input className="input" value={draft.contactPhone || ''} onChange={(e) => set('contactPhone', e.target.value)} placeholder="0XX-XXX-XXXX" /></div>
          <div className="field"><label>วันที่คาดว่าจะได้รับเงิน</label><input className="input" type="date" value={draft.expectedReceive || ''} onChange={(e) => set('expectedReceive', e.target.value)} /></div>
        </div>
      ) : (
        /* ── EXISTING INVOICE: flex layout — each field sized to content ─────── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* ── ข้อมูลจากระบบ ──────────────────────────────────────────────── */}
          <div>
            <SectionHdr label="ข้อมูลจากระบบ — แก้ไขไม่ได้" icon="lock" muted />
            <div style={{ display: 'grid', gridTemplateColumns: '108px 140px 130px 1fr 115px 152px', gap: '0 12px' }}>
              <ROField fkey="invoiceDate" label="วันที่ IV" />
              <ROField fkey="ivNo"        label="เลขที่ IV"  mono />
              <RONum   value={draft.balance} label="Balance" />
              <div className="field">
                <label style={{ fontSize: 11, color: 'var(--ink-500)', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <span style={{ fontSize: 10, opacity: 0.5 }}>🔒</span>ผู้รับโอนสิทธิ
                </label>
                <div style={{ height: 32, borderRadius: 7, border: '1px solid var(--ink-100)', background: 'var(--ink-50)', padding: '0 9px', display: 'flex', alignItems: 'center', fontSize: 12.5, color: finance?.assignee ? 'var(--ink-800)' : 'var(--ink-300)', cursor: 'default', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {finance?.assignee || '—'}
                </div>
              </div>
              <RONum value={debt} label="ภาระหนี้" negative />
              <div className="field">
                <label style={{ fontSize: 11, color: 'var(--ink-500)', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <span style={{ fontSize: 10, opacity: 0.5 }}>🔒</span>คาดรับสุทธิ <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 3 }}>(คำนวณ)</span>
                </label>
                <div style={{ height: 32, borderRadius: 7, padding: '0 22px 0 9px', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', background: 'color-mix(in oklch, var(--good) 10%, transparent)', border: '1px solid color-mix(in oklch, var(--good) 25%, transparent)', fontFamily: 'ui-monospace', fontSize: 13, fontWeight: 700, color: 'var(--good)' }}>
                  {fmtNum(netExpected, 0)}
                  <span style={{ position: 'absolute', right: 7, fontSize: 10, color: 'var(--ink-400)', fontWeight: 400 }}>฿</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── ข้อมูลติดตาม ───────────────────────────────────────────────── */}
          <div>
            <SectionHdr label="ข้อมูลติดตาม — กรอกได้" icon="edit" />
            <div style={{ display: 'grid', gridTemplateColumns: '72px 160px 140px 1fr 155px', gap: '0 12px' }}>
              <div className="field">
                <label style={{ fontSize: 12 }}>งวดที่</label>
                <input className="input" type="number" min="1" value={draft.period || 1}
                  onChange={(e) => set('period', Number(e.target.value))}
                  style={{ textAlign: 'center', fontWeight: 700, fontSize: 15 }} />
              </div>
              <div className="field">
                <label style={{ fontSize: 12 }}>สถานะ</label>
                <select className="select input" value={draft.status}
                  onChange={(e) => { set('status', e.target.value); setSaveError(''); }}>
                  {Object.entries(WTPData.IV_STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label style={{ fontSize: 12 }}>วันที่คาดรับเงิน</label>
                <input className="input" type="date" value={draft.expectedReceive || ''}
                  onChange={(e) => set('expectedReceive', e.target.value)} />
              </div>
              <div className="field">
                <label style={{ fontSize: 12 }}>ชื่อผู้ติดต่อ</label>
                <input className="input" value={draft.contactName || ''}
                  onChange={(e) => set('contactName', e.target.value)} placeholder="เช่น คุณสมหญิง" />
              </div>
              <div className="field">
                <label style={{ fontSize: 12 }}>เบอร์โทร</label>
                <input className="input" value={draft.contactPhone || ''}
                  onChange={(e) => set('contactPhone', e.target.value)} placeholder="0XX-XXX-XXXX" />
              </div>
            </div>
          </div>

          {/* ── ประวัติติดตาม ──────────────────────────────────────────────── */}
          <div>
            <SectionHdr label={`ประวัติติดตาม · ${draft.followUps?.length || 0} ครั้ง`} icon="phone" />
            <div style={{ border: '1px solid var(--ink-100)', borderRadius: 9, overflow: 'hidden' }}>
              <div style={{ maxHeight: 130, overflowY: 'auto' }}>
                {(!draft.followUps || draft.followUps.length === 0) ? (
                  <div className="muted" style={{ padding: '9px 12px', fontSize: 12 }}>ยังไม่มีการติดตาม</div>
                ) : (
                  <table className="tbl" style={{ fontSize: 11.5 }}>
                    <thead><tr><th style={{ width: 88 }}>วันที่</th><th>หมายเหตุ</th><th style={{ width: 30 }}></th></tr></thead>
                    <tbody>
                      {draft.followUps.map((f, i) => (
                        <tr key={i}>
                          <td style={{ fontSize: 11 }}>{fmtDate(f.date)}</td>
                          <td>{f.note}</td>
                          <td><button className="btn-icon danger" onClick={() => removeLog(i)}><Icon name="trash" size={11} /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div style={{ borderTop: '1px solid var(--ink-100)', padding: '7px 8px', background: 'var(--brand-50, #f0f6ff)', display: 'grid', gridTemplateColumns: '135px 1fr 60px', gap: 6, alignItems: 'end' }}>
                <input className="input input-cell" type="date" value={newLog.date} onChange={(e) => setNewLog(s => ({ ...s, date: e.target.value }))} style={{ fontSize: 11.5 }} />
                <input className="input input-cell" placeholder="บันทึกการติดตาม…" value={newLog.note} onChange={(e) => setNewLog(s => ({ ...s, note: e.target.value }))} style={{ fontSize: 11.5 }}
                  onKeyDown={(e) => e.key === 'Enter' && addLog()} />
                <button className="btn btn-primary btn-sm" onClick={addLog} disabled={!newLog.note.trim()} style={{ fontSize: 11 }}>+ บันทึก</button>
              </div>
            </div>
          </div>

          {/* ── การรับเงินจริง ─────────────────────────────────────────────── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <SectionHdr label={`การรับเงินจริง${isPaid ? ' *' : ''}`} icon="coin" />
              {!ar && <button className="btn btn-sm" style={{ fontSize: 11, padding: '2px 10px' }}
                onClick={() => setReceive({ date: new Date().toISOString().slice(0, 10), amount: draft.balance, bankAccount: '', bankFee: 0, otherFee: 0 })}>
                + บันทึก
              </button>}
            </div>
            {ar ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* แถว 1: วันที่ + 3 ช่องเงิน */}
                <div style={{ display: 'grid', gridTemplateColumns: '128px 1fr 1fr 1fr', gap: '0 12px' }}>
                  <div className="field"><label style={{ fontSize: 12 }}>วันที่รับจริง</label>
                    <input className="input" type="date" value={ar.date || ''} onChange={(e) => setReceive({ date: e.target.value })} />
                  </div>
                  <div className="field"><label style={{ fontSize: 12 }}>จำนวนที่ได้รับ{isPaid && <span style={{ color: 'var(--bad)', marginLeft: 3 }}>*</span>}</label>
                    <IvAmountInput value={ar.amount} onChange={(n) => { setReceive({ amount: n }); setSaveError(''); }} />
                  </div>
                  <div className="field"><label style={{ fontSize: 12 }}>ค่าธรรมเนียมธนาคาร</label>
                    <IvAmountInput value={ar.bankFee} onChange={(n) => setReceive({ bankFee: n })} />
                  </div>
                  <div className="field"><label style={{ fontSize: 12 }}>ค่าอื่นๆ</label>
                    <IvAmountInput value={ar.otherFee} onChange={(n) => setReceive({ otherFee: n })} />
                  </div>
                </div>
                {/* แถว 2: รายละเอียด + สุทธิ + บัญชี */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 155px 185px', gap: '0 12px' }}>
                  <div className="field"><label style={{ fontSize: 12 }}>รายละเอียดค่าอื่นๆ</label>
                    <input className="input" value={ar.otherFeeNote || ''} onChange={(e) => setReceive({ otherFeeNote: e.target.value })}
                      placeholder="เช่น หักชำระ PS2026-014 / ค่าปรับ / หักเงินกู้…" />
                  </div>
                  <div className="field"><label style={{ fontSize: 12, color: 'var(--ink-600)' }}>เงินเข้าบัญชีสุทธิ <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--ink-400)' }}>(คำนวณ)</span></label>
                    <div style={{ height: 34, borderRadius: 7, position: 'relative', background: 'color-mix(in oklch, var(--good) 10%, transparent)', border: '1px solid color-mix(in oklch, var(--good) 22%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 24px 0 10px', fontFamily: 'ui-monospace', fontSize: 14, fontWeight: 700, color: netCash < 0 ? 'var(--bad)' : 'var(--good)' }}>
                      {fmtNum(netCash, 0)}
                      <span style={{ position: 'absolute', right: 7, fontSize: 10, color: 'var(--ink-400)', fontWeight: 400 }}>฿</span>
                    </div>
                  </div>
                  <div className="field"><label style={{ fontSize: 12 }}>เข้าบัญชี</label>
                    <select className="select input" value={ar.bankAccount || ''} onChange={(e) => setReceive({ bankAccount: e.target.value })}>
                      <option value="">— เลือกบัญชี —</option>
                      {(bankAccounts || []).map(b => <option key={b.id} value={`${b.BANK_NAME || b.bankName} ${b.Bank_AC || b.accountNo}`}>{b.BANK_NAME || b.bankName} · {b.Bank_AC || b.accountNo}</option>)}
                    </select>
                  </div>
                </div>
                {/* ลบบันทึก */}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, color: 'var(--bad)' }} onClick={() => setReceive(null)}>
                    <Icon name="trash" size={11} /> ลบบันทึก
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ padding: '9px 12px', fontSize: 12, border: '1px solid var(--ink-100)', borderRadius: 9, color: 'var(--ink-400)' }}>
                {isPaid
                  ? <span style={{ color: 'var(--bad)', fontWeight: 500 }}>⚠️ กรุณาบันทึกการรับเงิน — สถานะ "รับชำระแล้ว"</span>
                  : 'ยังไม่มีบันทึกรับเงิน — กด "+ บันทึก" เมื่อเงินเข้าจริง'}
              </div>
            )}
          </div>

          {/* ── หมายเหตุ / บันทึก ─────────────────────────────────────────── */}
          <div>
            <SectionHdr label="หมายเหตุ / บันทึก" icon="edit" />
            <textarea
              className="input"
              rows={2}
              value={draft.remark || ''}
              onChange={(e) => set('remark', e.target.value)}
              placeholder="บันทึกหมายเหตุเกี่ยวกับใบแจ้งหนี้นี้…"
              style={{ width: '100%', resize: 'none', fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>

        </div>
      )}
    </Modal>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// ────────────────────────────────────────────────────────────────────────────
// QuickPayModal — popup รับข้อมูลชำระเงิน เมื่อเลือก "รับชำระแล้ว" จาก dropdown
// ────────────────────────────────────────────────────────────────────────────
function QuickPayModal({ open, iv, draft, bankAccounts, onChangeDraft, onConfirm, onCancel }) {
  if (!open || !iv || !draft) return null;

  const netCash = (draft.amount || 0) - (draft.bankFee || 0) - (draft.otherFee || 0);

  return (
    <div className="modal-back" onClick={onCancel}>
      <div className="modal" style={{ maxWidth: 480, width: '95vw' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <div>
            <div className="modal-title" style={{ fontSize: 16 }}>บันทึกรับชำระเงิน</div>
            <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 2 }}>
              {iv.ivNo} · {iv.projectName} · Balance {fmtNum(iv.balance, 0)} ฿
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onCancel}><Icon name="x" size={16} /></button>
        </div>

        <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', padding: '20px 24px' }}>

          <div className="field" style={{ gridColumn: '1/-1' }}>
            <label>วันที่รับจริง</label>
            <input className="input" type="date" value={draft.date || ''} onChange={(e) => onChangeDraft({ date: e.target.value })} />
          </div>

          <div className="field" style={{ gridColumn: '1/-1' }}>
            <label>จำนวนเงินที่ได้รับจริง (฿)</label>
            <input className="input" type="number" value={draft.amount ?? ''} onChange={(e) => onChangeDraft({ amount: Number(e.target.value) })} style={{ fontFamily: 'ui-monospace', textAlign: 'right' }} />
          </div>

          <div className="field">
            <label>ค่าธรรมเนียมธนาคาร (฿)</label>
            <input className="input" type="number" value={draft.bankFee ?? 0} onChange={(e) => onChangeDraft({ bankFee: Number(e.target.value) })} style={{ fontFamily: 'ui-monospace', textAlign: 'right' }} />
          </div>

          <div className="field">
            <label>ค่าใช้จ่ายอื่น ๆ (฿)</label>
            <input className="input" type="number" value={draft.otherFee ?? 0} onChange={(e) => onChangeDraft({ otherFee: Number(e.target.value) })} style={{ fontFamily: 'ui-monospace', textAlign: 'right' }} />
          </div>

          <div className="field" style={{ gridColumn: '1/-1' }}>
            <label>เข้าบัญชี</label>
            <select className="select input" value={draft.bankAccount || ''} onChange={(e) => onChangeDraft({ bankAccount: e.target.value })}>
              <option value="">— เลือกบัญชี —</option>
              {(bankAccounts || []).map(b => (
                <option key={b.id} value={`${b.BANK_NAME || b.bankName} ${b.Bank_AC || b.accountNo}`}>
                  {b.BANK_NAME || b.bankName} · {b.Bank_AC || b.accountNo}
                </option>
              ))}
            </select>
          </div>

          {/* สรุปยอดสุทธิ */}
          <div style={{ gridColumn: '1/-1', background: 'color-mix(in oklch, var(--good) 9%, transparent)', border: '1px solid color-mix(in oklch, var(--good) 22%, transparent)', borderRadius: 9, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>เงินเข้าบัญชีสุทธิ</span>
            <span style={{ fontFamily: 'ui-monospace', fontWeight: 700, fontSize: 16, color: netCash < 0 ? 'var(--bad)' : 'var(--good)' }}>
              {fmtNum(netCash, 0)} ฿
            </span>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>ยกเลิก</button>
          <button
            className="btn btn-primary"
            onClick={() => onConfirm(draft)}
            disabled={!draft.date || !draft.amount}
          >
            <Icon name="check" size={13} /> ยืนยันรับชำระแล้ว
          </button>
        </div>
      </div>
    </div>
  );
}

// Import RAW_IV_OUTSTANDING — paste TSV/CSV → auto-detect new IVs vs existing
// ────────────────────────────────────────────────────────────────────────────
function ImportRawIvModal({ open, onClose, existing, onImport }) {
  const [raw, setRaw] = ivState('');
  const [parsed, setParsed] = ivState({ all: [], existing: [], updated: [], new_: [] });

  React.useEffect(() => {
    if (!raw.trim()) { setParsed({ all: [], existing: [], updated: [], new_: [] }); return; }
    const all = parseRawIv(raw);
    const existingByIv = Object.fromEntries(existing.map(iv => [iv.ivNo, iv]));
    const new_ = [];
    const existingList = [];
    const updated = [];
    all.forEach(r => {
      const ex = existingByIv[r.ivNo];
      if (!ex) {
        new_.push(r);
      } else {
        const balanceChanged = (ex.balance || 0) !== (r.balance || 0);
        const needsMetaUpdate = (!ex.projectName && r.projectName) || (!ex.productType && r.productType)
          || (!ex.remark && r.remark) || (!ex.customer && r.customer);
        if (balanceChanged || needsMetaUpdate) {
          updated.push({
            ...ex,
            balance: r.balance,
            projectName: r.projectName || ex.projectName || '',
            productType: r.productType || ex.productType || '',
            contractRef: r.contractRef || ex.contractRef || '',
            remark: r.remark || ex.remark || '',
            customer: r.customer || ex.customer || '',
            _oldBalance: ex.balance,
            _metaUpdated: needsMetaUpdate && !balanceChanged,
          });
        } else {
          existingList.push(ex);
        }
      }
    });
    setParsed({ all, existing: existingList, updated, new_ });
  }, [raw]);

  if (!open) return null;

  const importNow = () => {
    const newRows = parsed.new_.map(r => ({
      ivNo: r.ivNo, jobNo: r.jobNo, invoiceDate: r.invoiceDate,
      balance: r.balance, period: r.period || 1,
      productType: r.productType || '',
      projectName: r.projectName || '',
      contractRef: r.contractRef || '',
      remark: r.remark || '', customer: r.customer || '',
      status: 'pending_inspection', expectedReceive: '',
      contactName: '', contactPhone: '',
      followUps: [], actualReceive: null,
    }));
    const patchRows = parsed.updated.map(r => ({
      id: r.id,
      balance: r.balance,
      projectName: r.projectName || '',
      productType: r.productType || '',
      contractRef: r.contractRef || '',
      remark: r.remark || '',
      customer: r.customer || '',
    }));
    onImport({ newRows, patchRows });
    setRaw('');
  };

  return (
    <Modal
      open={open}
      title="📥 นำเข้า RAW_IV_OUTSTANDING"
      onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>ยกเลิก</button>
        <button className="btn btn-primary" disabled={parsed.new_.length === 0 && parsed.updated.length === 0} onClick={importNow}>
          <Icon name="upload" size={14} /> นำเข้า
          {parsed.new_.length > 0 && ` ${parsed.new_.length} ใบใหม่`}
          {parsed.new_.length > 0 && parsed.updated.length > 0 && ' ·'}
          {parsed.updated.length > 0 && ` อัปเดต ${parsed.updated.length} ใบ`}
        </button>
      </>}
    >
      <div style={{ fontSize: 12.5, marginBottom: 8, color: 'var(--ink-500)' }}>
        วางข้อมูลใบแจ้งหนี้คงค้างที่ดึงจากระบบ (รูปแบบ TSV จาก Excel หรือ JSON). คอลัมน์ที่ใช้:&nbsp;
        <strong>refcode</strong> (Job/Contract code), <strong>invno</strong>, <strong>invdate</strong>, <strong>Balance</strong>
        <br />
        งวด (period) จะดึงจาก <strong>remark</strong> อัตโนมัติ เช่น "งวดที่ 2" → period = 2
        <br />
        ระบบจะเปรียบเทียบกับใบในตาราง — เฉพาะใบที่ <strong>ไม่ซ้ำ</strong> จะถูกนำเข้า
      </div>

      <textarea
        className="input"
        rows={8}
        placeholder={`ตัวอย่าง (วางจาก Excel RAW_IV_OUTSTANDING ได้เลย):

refcode\tinvno\tinvdate\tBalance\tremark\tCustomer
6802-01\tIV2603-031\t11/03/2026\t5,395,000.00\tระบบผลิตน้ำประปาขนาดใหญ่\tที่ทำการปกครองอำเภอเขาย้อย
6901-01\tIV2604-025\t28/04/2026\t3,240,000.00\tระบบผลิตน้ำประปา-งวดที่ 2 (60%)\tองค์การบริหารส่วนตำบลบ้านนา
…`}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        style={{ fontFamily: 'ui-monospace', fontSize: 12, width: '100%', resize: 'vertical' }}
      />

      {/* Preview */}
      {raw.trim() && (
        <div style={{ marginTop: 14 }}>
          <div className="grid grid-3" style={{ marginBottom: 10 }}>
            <div style={{ padding: 10, borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
              <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>ใบใหม่ (จะนำเข้า)</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--good)' }}>{parsed.new_.length}</div>
            </div>
            <div style={{ padding: 10, borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a' }}>
              <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>ใบเก่า — อัปเดต</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'oklch(60% 0.16 75)' }}>{parsed.updated.length}</div>
              <div style={{ fontSize: 10, color: 'var(--ink-400)' }}>
                {parsed.updated.filter(r => !r._metaUpdated).length > 0 && `${parsed.updated.filter(r => !r._metaUpdated).length} มูลค่า`}
                {parsed.updated.filter(r => r._metaUpdated).length > 0 && ` ${parsed.updated.filter(r => r._metaUpdated).length} ข้อมูลโครงการ`}
              </div>
            </div>
            <div style={{ padding: 10, borderRadius: 8, background: '#f1f5f9', border: '1px solid var(--line)' }}>
              <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>ใบเก่า — ไม่เปลี่ยน</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink-700)' }}>{parsed.existing.length}</div>
            </div>
          </div>

          {parsed.new_.length > 0 && (
            <div className="card" style={{ padding: 0, overflow: 'auto', maxHeight: 240 }}>
              <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)', fontSize: 12, fontWeight: 600, background: '#f8fafc' }}>ใบที่จะนำเข้า</div>
              <table className="tbl" style={{ fontSize: 12 }}>
                <thead><tr><th>Job no</th><th>IV no</th><th>Date</th><th style={{ textAlign: 'right' }}>Balance</th><th style={{ textAlign: 'center' }}>งวด</th></tr></thead>
                <tbody>
                  {parsed.new_.map((r, i) => (
                    <tr key={i}>
                      <td style={{ fontFamily: 'ui-monospace' }}>{r.jobNo}</td>
                      <td style={{ fontFamily: 'ui-monospace' }}>{r.ivNo}</td>
                      <td>{fmtDate(r.invoiceDate)}</td>
                      <td className="num">{fmtNum(r.balance, 0)}</td>
                      <td style={{ textAlign: 'center' }}>{r.period || 1}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

// ─── parse proj_dpt ──────────────────────────────────────────────────────────
// Format: "Project No. : (INTERNAL_NO) JOBNO-PRODUCTTYPE-ชื่อโครงการ (REFCODE) (Owner : ...)"
// ผลลัพธ์:
//   jobNo       = PP064, TTI040, STR067, MA-926, 979 (code ก่อน product type)
//   productType = STIIS, PDH, PL, PM  (ตัวพิมพ์ใหญ่ระหว่าง JOBNO กับชื่อ)
//   projectName = บ้านพรุกง ม.2 ต.วังใหญ่... (ชื่อจริงหลัง productType)
//   contractRef = 6901-01 (refcode ในวงเล็บสุดท้าย ก่อน Owner)
function parseProjDpt(projDpt) {
  if (!projDpt) return { jobNo: '', productType: '', projectName: '', contractRef: '' };
  // 1) ลบ prefix
  let s = projDpt.replace(/^Project\s+No\.\s*:\s*/i, '').trim();
  // 2) ตัดส่วน (Owner: ...)
  const ownerIdx = s.indexOf('(Owner');
  if (ownerIdx >= 0) s = s.slice(0, ownerIdx).trim();
  // 3) ดึง contractRef จาก () สุดท้าย (เช่น 6901-01)
  const lastParen = s.match(/\(([^()]+)\)\s*$/);
  const contractRef = lastParen ? lastParen[1].trim() : '';
  if (lastParen) s = s.slice(0, s.lastIndexOf('(')).trim();
  // 4) ลบ (INTERNAL_NO) แรก → เหลือ description
  const desc = s.replace(/^\([^)]*\)\s*/, '').trim();
  // 5) parse JOBNO-PRODUCTTYPE-ชื่อโครงการ
  //    PRODUCTTYPE = ตัวพิมพ์ใหญ่ล้วน 2-6 ตัว (STIIS, PDH, PL, PM, PD, PDH)
  //    JOBNO = ทุกอย่างก่อน PRODUCTTYPE (PP064, TTI040, MA-926, 979 ฯลฯ)
  const codeMatch = desc.match(/^(.+?)-([A-Z]{2,6})-(.+)$/);
  if (codeMatch) {
    return {
      jobNo:       codeMatch[1].trim(),
      productType: codeMatch[2].trim(),
      projectName: codeMatch[3].trim(),
      contractRef,
    };
  }
  // ไม่เจอ code pattern → ชื่อโครงการ = desc ทั้งหมด, ใช้ contractRef เป็น jobNo
  return { jobNo: contractRef, productType: '', projectName: desc, contractRef };
}

// Parse TSV/CSV from RAW_IV_OUTSTANDING
// Expected columns (case-insensitive):
//   jobNo / refcode / proj_dpt → jobNo  (proj_dpt จะถูก parse ด้วย parseProjDpt)
//   projectName → ชื่อโครงการ (ถ้าไม่มี จะ parse จาก proj_dpt)
//   invno → ivNo
//   invdate → invoiceDate
//   balance → balance
//   remark → remark (period extracted automatically จาก "งวดที่ N")
//   period → override period (optional)
function parseRawIv(text) {
  // Try JSON first
  const t = text.trim();
  if (t.startsWith('[') || t.startsWith('{')) {
    try {
      const j = JSON.parse(t);
      const arr = Array.isArray(j) ? j : [j];
      return arr.map(normalizeIvRow).filter(Boolean);
    } catch (_) { /* fall through */ }
  }
  // TSV/CSV: detect delimiter
  const lines = t.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return [];
  const delim = lines[0].includes('\t') ? '\t' : (lines[0].includes(',') ? ',' : '\t');
  const headers = lines[0].split(delim).map(h => h.trim().toLowerCase());
  const idx = (name) => headers.indexOf(name);
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delim);
    const remark  = (cols[idx('remark')] || cols[idx('vch_remark')] || '').trim();
    const rawPeriod = parseNum(cols[idx('period')]);

    // ลำดับ priority: jobno column → parse จาก proj_dpt
    let jobNo       = (cols[idx('jobno')] || cols[idx('job no')] || '').trim();
    let productType = (cols[idx('producttype')] || cols[idx('product_type')] || '').trim();
    let projectName = (cols[idx('projectname')] || cols[idx('project_name')] || '').trim();
    let contractRef = (cols[idx('contractref')] || cols[idx('contract_ref')] || cols[idx('refcode')] || '').trim();
    const rawProjDpt = (cols[idx('proj_dpt')] || '').trim();
    if (rawProjDpt) {
      const parsed = parseProjDpt(rawProjDpt);
      if (!jobNo)       jobNo       = parsed.jobNo;
      if (!productType) productType = parsed.productType;
      if (!projectName) projectName = parsed.projectName;
      if (!contractRef) contractRef = parsed.contractRef;
    }

    const row = {
      jobNo,
      productType,
      projectName,
      contractRef,
      ivNo:        (cols[idx('invno')] || cols[idx('iv no')] || cols[idx('iv_no')] || '').trim(),
      invoiceDate: normalizeDate((cols[idx('invdate')] || cols[idx('inv date')] || cols[idx('date')] || '').trim()),
      balance:     parseNum(cols[idx('balance')]),
      remark,
      customer:    (cols[idx('customer')] || '').trim(),
      overDue:     parseNum(cols[idx('over_due')]),
      period:      rawPeriod || extractPeriodFromRemark(remark),
    };
    if (row.ivNo) out.push(row);
  }
  return out;
}
function normalizeIvRow(r) {
  const get = (...keys) => { for (const k of keys) { const lk = k.toLowerCase(); for (const rk of Object.keys(r)) { if (rk.toLowerCase() === lk) return r[rk]; } } return null; };
  const ivNo = (get('invno', 'iv no', 'iv_no') || '').toString().trim();
  if (!ivNo) return null;
  const remark = (get('remark', 'vch_remark') || '').toString().trim();
  const rawPeriod = parseNum(get('period'));
  // jobNo: priority = jobNo column → parse จาก proj_dpt
  let jobNo       = (get('jobno', 'job no') || '').toString().trim();
  let productType = (get('producttype', 'product_type') || '').toString().trim();
  let projectName = (get('projectname', 'project_name') || '').toString().trim();
  let contractRef = (get('contractref', 'contract_ref', 'refcode') || '').toString().trim();
  const rawProjDpt = (get('proj_dpt') || '').toString().trim();
  if (rawProjDpt) {
    const parsed = parseProjDpt(rawProjDpt);
    if (!jobNo)       jobNo       = parsed.jobNo;
    if (!productType) productType = parsed.productType;
    if (!projectName) projectName = parsed.projectName;
    if (!contractRef) contractRef = parsed.contractRef;
  }
  return {
    jobNo,
    productType,
    projectName,
    contractRef,
    ivNo,
    invoiceDate: normalizeDate((get('invdate', 'inv date', 'date') || '').toString().trim()),
    balance:     parseNum(get('balance')),
    remark,
    customer:    (get('customer') || '').toString().trim(),
    overDue:     parseNum(get('over_due')),
    period:      rawPeriod || extractPeriodFromRemark(remark),
  };
}
// ดึงเลขงวดจาก remark เช่น "งวดที่ 2 (60%)" → 2
function extractPeriodFromRemark(remark) {
  if (!remark) return 1;
  const m = remark.match(/งวดที่\s*(\d+)/);
  return m ? (parseInt(m[1]) || 1) : 1;
}
function parseNum(s) {
  if (s == null || s === '') return 0;
  const n = Number(String(s).replace(/,/g, '').trim());
  return isNaN(n) ? 0 : n;
}
function normalizeDate(s) {
  if (!s) return '';
  // Accept YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    let [_, a, b, y] = m;
    if (y.length === 2) y = '20' + y;
    // Assume DD/MM/YYYY (Thai)
    return `${y}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`;
  }
  return s;
}

// ── Standalone IV Report Page (รายงาน/วิเคราะห์ section) ──────────────────
function IvReportStandalonePage({ data, setData, toast }) {
  const { projectByCode, financeByCode } = React.useMemo(
    () => WTPData.buildLookups(data),
    [data.projects]
  );

  const rows = React.useMemo(() => (data.invoices || []).map(iv => {
    const p = projectByCode[iv.jobNo] || projectByCode[iv.contractRef] || projectByCode[iv.projectCode] || {};
    const f = financeByCode[iv.jobNo] || financeByCode[iv.contractRef] || financeByCode[iv.projectCode] || {};
    const debt     = Number(f.debt ?? f['ภาระหนี้'] ?? 0);
    // Prefer existing fields, fall back to imported v2 fields
    const assignee = iv.assignee || f.assignee || f['ผู้รับโอนสิทธิ์'] || '—';
    const projectName = iv.projectName || p['พื้นที่'] || p.name || '—';
    // Map v2 'pending' → 'tracking' so existing date-bucketed sections include it.
    // Real 'paid' rows keep status='paid'.
    const status = iv.status === 'pending' ? 'tracking' : iv.status;
    // Map dueDate → expectedReceive for date filtering, prefer actualReceiveDate if set
    const expectedReceive = iv.expectedReceive || iv.dueDate || iv.actualReceiveDate || null;
    const balance = Number(iv.balance) || 0;
    return {
      ...iv,
      status,
      expectedReceive,
      projectName,
      assignee,
      debt,
      netExpected: balance - debt,
    };
  }), [data.invoices, projectByCode, financeByCode]);

  const pending = rows.filter(r => r.status !== 'paid');
  const today   = new Date().toISOString().slice(0, 10);

  const [detail, setDetail] = React.useState(null);
  const [payModal, setPayModal] = React.useState(null);

  const save = (iv) => {
    setData(d => ({
      ...d,
      invoices: iv.id
        ? d.invoices.map(x => x.id === iv.id ? iv : x)
        : [{ ...iv, id: WTPData.newId() }, ...d.invoices],
    }));
    setDetail(prev => prev && prev.id === iv.id ? iv : prev);
    toast && toast('บันทึกแล้ว');
  };

  return (
    <div className="page">
      <div className="page-head anim-in">
        <div>
          <h1 className="page-title">รายงานติดตามใบแจ้งหนี้คงค้าง</h1>
          <div className="page-sub">
            ข้อมูล ณ {fmtDate(today)} · ค้างชำระ {pending.length} ใบ · รวม {rows.length} ใบ
          </div>
        </div>
      </div>

      <IvReportView rows={rows} onOpen={setDetail} />

      <InvoiceDetailModal
        iv={detail}
        onClose={() => setDetail(null)}
        onSave={save}
        bankAccounts={data.bankAccounts}
        projects={data.projects}
        financeByCode={financeByCode}
        projectByCode={projectByCode}
      />

      <QuickPayModal
        open={!!payModal}
        iv={payModal?.iv}
        draft={payModal?.draft}
        bankAccounts={data.bankAccounts}
        onChangeDraft={(patch) => setPayModal(pm => pm ? { ...pm, draft: { ...pm.draft, ...patch } } : pm)}
        onConfirm={(ar) => {
          save({ ...payModal.iv, status: 'paid', actualReceive: ar });
          setPayModal(null);
        }}
        onCancel={() => setPayModal(null)}
      />
    </div>
  );
}

Object.assign(window, { InvoicesPage, IvReportStandalonePage });
