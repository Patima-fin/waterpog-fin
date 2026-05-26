// Water POG Financial Dashboard – shared UI primitives.
// Globals: React, ReactDOM

const { useState, useEffect, useRef, useMemo, useCallback } = React;

// ─── Formatters ──────────────────────────────────────────────────────────────
const TH_LOCALE = 'th-TH';
function fmtNum(n, digits = 2) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString(TH_LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function fmtInt(n) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString(TH_LOCALE);
}
function fmtMoney(n, opts = {}) {
  if (n == null || isNaN(n)) return '—';
  const { compact = false, digits = 2, sign = false } = opts;
  const abs = Math.abs(n);
  if (compact && abs >= 1_000_000) return (sign && n > 0 ? '+' : '') + (n / 1_000_000).toLocaleString(TH_LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ลบ.';
  if (compact && abs >= 1000)     return (sign && n > 0 ? '+' : '') + (n / 1000).toLocaleString(TH_LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' พัน';
  return (sign && n > 0 ? '+' : '') + Number(n).toLocaleString(TH_LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
// Robust date parser — รองรับ ISO (YYYY-MM-DD), DD/MM/YYYY (Thai), MM/DD/YYYY (US), Date object
function parseDateFlexible(v) {
  if (v == null || v === '') return null;
  // already Date object
  if (v instanceof Date) return isNaN(v) ? null : v;
  const s = String(v).trim();
  if (!s) return null;
  // ISO: YYYY-MM-DD or YYYY-MM-DDT...
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    return isNaN(d) ? null : d;
  }
  // DD/MM/YYYY or DD/MM/YY — Thai/EU format (priority)
  // กรณีนี้ user paste จาก Google Sheets ที่ตั้ง locale Thai
  const m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (m) {
    let [_, a, b, y] = m;
    let yi = parseInt(y, 10);
    if (yi < 100) yi += 2000;
    // Convert พ.ศ. → ค.ศ. (รองรับปีพศ เช่น 2569 → 2026)
    if (yi > 2400) yi -= 543;
    const a1 = parseInt(a, 10), b1 = parseInt(b, 10);
    // Use DD/MM if first part > 12 (definitely day), else assume DD/MM for Thai
    if (a1 > 12) {
      // a = day, b = month
      const d = new Date(yi, b1 - 1, a1);
      return isNaN(d) ? null : d;
    } else if (b1 > 12) {
      // b = day, a = month (US)
      const d = new Date(yi, a1 - 1, b1);
      return isNaN(d) ? null : d;
    } else {
      // Ambiguous — default DD/MM (Thai)
      const d = new Date(yi, b1 - 1, a1);
      return isNaN(d) ? null : d;
    }
  }
  // Fallback to native Date parser
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

function fmtDate(iso) {
  const d = parseDateFlexible(iso);
  if (!d) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}
function fmtDateLong(iso) {
  const d = parseDateFlexible(iso);
  if (!d) return '—';
  return d.toLocaleDateString('th-TH-u-ca-gregory', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ─── Excel / Print export ───────────────────────────────────────────────────
//
// exportRowsToExcel(rows, columns, opts) — write an .xlsx file
//   rows:    array of records
//   columns: [ { key, label, fmt?, type? } ]    // fmt: (value, row) => string|number
//                                                // type: 'number' | 'date' | 'text' (auto if fmt absent)
//   opts:    { filename, sheetName, title }     // title is an optional H1 row at top
//
// Uses the SheetJS library loaded from CDN in index.html.
function exportRowsToExcel(rows, columns, opts = {}) {
  if (typeof XLSX === 'undefined') {
    alert('ระบบ Export ยังไม่พร้อม (SheetJS โหลดไม่สำเร็จ) — กรุณารีเฟรชหน้า');
    return;
  }
  const cols = (columns || []).filter(c => c && c.key);
  if (!cols.length) {
    alert('ไม่มีคอลัมน์ที่ Export ได้');
    return;
  }
  const filename = (opts.filename || 'export') + '_' + new Date().toISOString().slice(0,10) + '.xlsx';
  const sheetName = (opts.sheetName || 'Sheet1').slice(0, 31);

  // Build 2D array: [headers], [...rows]
  const aoa = [];
  if (opts.title) aoa.push([opts.title]);
  aoa.push(cols.map(c => c.label || c.key));
  (rows || []).forEach(r => {
    aoa.push(cols.map(c => {
      const raw = r[c.key];
      if (c.fmt) {
        try { return c.fmt(raw, r); }
        catch (_) { return raw == null ? '' : String(raw); }
      }
      if (raw == null || raw === '') return '';
      if (c.type === 'number') {
        const n = Number(String(raw).replace(/[^0-9.-]/g, ''));
        return isNaN(n) ? '' : n;
      }
      if (c.type === 'date') {
        if (raw instanceof Date) return raw;
        const d = new Date(raw);
        return isNaN(d) ? String(raw) : d;
      }
      return typeof raw === 'object' ? JSON.stringify(raw) : raw;
    }));
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // Auto column width based on header + sample of values
  const colWidths = cols.map((c, i) => {
    let max = (c.label || c.key || '').length;
    for (let r = 0; r < Math.min(aoa.length, 50); r++) {
      const v = aoa[r][i];
      const s = v == null ? '' : String(v);
      if (s.length > max) max = s.length;
    }
    return { wch: Math.min(60, Math.max(8, max + 2)) };
  });
  ws['!cols'] = colWidths;
  // If title row, merge across all columns
  if (opts.title) {
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: cols.length - 1 } }];
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

// ─── Excel-like column filter (dropdown of unique values) ─────────────────
//
// Apply to any sortable table — pair with FilterableColHeader. Parent owns
// state: `colFilters` = { [colKey]: Set<displayValue> | null }.
// `getValue(row, colKey)` returns the display string used for both rendering
// and matching. Defaults to row[colKey].
function ColFilterDropdown({ btnRef, colKey, allRows, active, getValue, onApply, onClose }) {
  const [search, setSearch] = useState('');
  const [pos, setPos] = useState(null);
  const selfRef = useRef(null);
  const _val = getValue || ((r, k) => { const v = r[k]; return v == null || v === '' ? '—' : String(v); });

  useEffect(() => {
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

  useEffect(() => {
    const h = (e) => {
      if (selfRef.current && !selfRef.current.contains(e.target) &&
          btnRef.current  && !btnRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const allVals = useMemo(() => {
    const map = new Map();
    allRows.forEach(r => {
      const v = _val(r, colKey);
      map.set(v, (map.get(v) || 0) + 1);
    });
    return [...map.entries()].sort((a, b) => {
      if (a[0] === '—') return 1; if (b[0] === '—') return -1;
      return String(a[0]).localeCompare(String(b[0]), 'th');
    });
  }, [allRows, colKey]);

  const visibleVals = search.trim()
    ? allVals.filter(([v]) => String(v).toLowerCase().includes(search.trim().toLowerCase()))
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
      <div style={{ padding: '8px 10px 6px' }}>
        <input autoFocus className="input"
          style={{ fontSize: 12, padding: '4px 8px', width: '100%', boxSizing: 'border-box' }}
          placeholder="ค้นหาใน dropdown..." value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Escape' && onClose()} />
      </div>
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
            }}>
              <input type="checkbox" checked={checked} onChange={() => toggle(val)}
                style={{ width: 14, height: 14, cursor: 'pointer', flexShrink: 0 }} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val}</span>
              <span style={{ flexShrink: 0, color: 'var(--ink-400)', fontSize: 11 }}>{count}</span>
            </label>
          );
        })}
      </div>
      <div style={{ borderTop: '1px solid var(--ink-100)', padding: '6px 10px', display: 'flex', justifyContent: 'space-between', gap: 6 }}>
        <button className="btn btn-ghost btn-sm"
          style={{ fontSize: 11, color: 'var(--bad)', padding: '2px 8px' }}
          onClick={() => { onApply(null); onClose(); }}>ล้างตัวกรอง</button>
        <button className="btn btn-sm"
          style={{ fontSize: 11, padding: '2px 10px', background: 'var(--brand-500)', color: '#fff', border: 'none', borderRadius: 5 }}
          onClick={onClose}>✓ ตกลง</button>
      </div>
    </div>
  );
  return ReactDOM.createPortal(dropdown, document.body);
}

// FilterableColHeader — drop-in replacement for SortHeader, adds funnel button
function FilterableColHeader({ label, sortKey, sort, sortToggle, align = 'center', width,
                               colKey, colFilters, setColFilters, openCol, setOpenCol, allRows, getValue }) {
  const btnRef = useRef(null);
  const active = colFilters[colKey || sortKey];
  const isActive = active && active.size > 0;
  const isOpen = openCol === (colKey || sortKey);
  const sortOn = sort.key === sortKey;
  const effectiveKey = colKey || sortKey;

  const applyFilter = (vals) => setColFilters(prev => {
    const next = { ...prev };
    if (!vals) delete next[effectiveKey]; else next[effectiveKey] = vals;
    return next;
  });

  return (
    <th style={{ width, textAlign: align, userSelect: 'none', position: 'relative' }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        width: '100%', justifyContent: align === 'right' ? 'flex-end' : 'center',
      }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: sortKey ? 'pointer' : 'default' }}
          onClick={() => sortKey && sortToggle && sortToggle(sortKey)}>
          {label}
          {sortKey && (
            <span style={{ opacity: sortOn ? 1 : 0.25, fontSize: 9, display: 'inline-flex', flexDirection: 'column', lineHeight: 1 }}>
              <span style={{ color: sortOn && sort.dir === 'asc' ? 'var(--brand-600)' : 'inherit' }}>▲</span>
              <span style={{ color: sortOn && sort.dir === 'desc' ? 'var(--brand-600)' : 'inherit', marginTop: -2 }}>▼</span>
            </span>
          )}
        </span>
        <button ref={btnRef}
          onClick={(e) => { e.stopPropagation(); setOpenCol(isOpen ? null : effectiveKey); }}
          title={isActive ? `กรองอยู่ ${active.size} ค่า` : 'กรองคอลัมน์'}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 2,
            background: isActive ? 'var(--brand-500)' : 'transparent',
            color: isActive ? '#fff' : isOpen ? 'var(--brand-500)' : 'var(--ink-350,#aab)',
            border: isActive ? 'none' : `1px solid ${isOpen ? 'var(--brand-300)' : 'transparent'}`,
            borderRadius: 4, padding: '1px 3px', cursor: 'pointer',
            fontSize: 10, lineHeight: 1, flexShrink: 0,
          }}>
          <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor">
            <path d="M1 1.5h8L6.2 5v3.5l-2.4-1V5L1 1.5z"/>
          </svg>
          {isActive && <span style={{ fontSize: 9, fontWeight: 700 }}>{active.size}</span>}
        </button>
      </div>
      {isOpen && (
        <ColFilterDropdown btnRef={btnRef} colKey={effectiveKey} allRows={allRows}
          active={active} getValue={getValue}
          onApply={applyFilter} onClose={() => setOpenCol(null)} />
      )}
    </th>
  );
}

// ─── Reusable export + print button ────────────────────────────────────────
// Drop-in button that calls exportRowsToExcel with the current rows. Use:
// <ExportButton rows={filtered} columns={[{key,label},..]} filename="invoices" />
function ExportButton({ rows, columns, filename, sheetName, title, label = 'Excel', icon = 'download' }) {
  return (
    <button
      className="btn btn-ghost"
      onClick={() => exportRowsToExcel(rows, columns, { filename, sheetName, title })}
      title={`ส่งออกเป็น Excel (.xlsx) — ${(rows || []).length} แถว`}
    >
      <Icon name={icon} size={14} /> {label}
    </button>
  );
}

// Print current page using browser print dialog.
// Each page should hook .print-area / .no-print classes via styles.css @media print.
function PrintButton({ label = 'พิมพ์', icon = 'print' }) {
  return (
    <button className="btn btn-ghost" onClick={() => window.print()} title="พิมพ์หน้านี้ (Ctrl+P)">
      <Icon name={icon} size={14} /> {label}
    </button>
  );
}

// ─── Animated number counter ─────────────────────────────────────────────────
function useCountUp(target, duration = 900, deps = []) {
  const [val, setVal] = useState(0);
  const startTime = useRef(null);
  const startVal = useRef(0);
  useEffect(() => {
    startVal.current = val;
    startTime.current = null;
    let raf;
    const tick = (t) => {
      if (startTime.current == null) startTime.current = t;
      const dt = Math.min(1, (t - startTime.current) / duration);
      const eased = 1 - Math.pow(1 - dt, 3);
      setVal(startVal.current + (target - startVal.current) * eased);
      if (dt < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line
  }, [target, ...deps]);
  return val;
}

function AnimatedNumber({ value, digits = 2, prefix = '', suffix = '', duration = 900 }) {
  const v = useCountUp(value || 0, duration, [value]);
  return <span>{prefix}{fmtNum(v, digits)}{suffix}</span>;
}

// ─── Icons (inline SVG – minimal, no third-party) ────────────────────────────
const Icon = ({ name, size = 16, stroke = 1.6, ...rest }) => {
  const paths = {
    home:        <><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/></>,
    chart:       <><path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 16v-5"/><path d="M12 16V8"/><path d="M16 16v-7"/></>,
    receivables: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/><path d="M7 15h4"/></>,
    daily:       <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    projects:    <><path d="M3 7h6l2 2h10v10H3z"/></>,
    invoice:     <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/></>,
    forecast:    <><path d="M3 17l5-5 4 4 8-9"/><path d="M14 7h7v7"/></>,
    plus:        <><path d="M12 5v14M5 12h14"/></>,
    edit:        <><path d="M16 3l5 5L8 21H3v-5z"/></>,
    trash:       <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></>,
    x:           <><path d="M6 6l12 12M18 6l-12 12"/></>,
    check:       <><path d="M5 12l5 5L20 7"/></>,
    arrow:       <><path d="M5 12h14M13 6l6 6-6 6"/></>,
    arrow_up:    <><path d="M12 19V5M5 12l7-7 7 7"/></>,
    arrow_down:  <><path d="M12 5v14M5 12l7 7 7-7"/></>,
    download:    <><path d="M12 4v12M6 12l6 6 6-6"/><path d="M4 20h16"/></>,
    print:       <><path d="M6 9V2h12v7"/><rect x="3" y="9" width="18" height="9" rx="1"/><path d="M6 18h12v4H6z"/></>,
    filter:      <><path d="M3 5h18l-7 9v6l-4-2v-4z"/></>,
    upload:      <><path d="M12 20V8M6 12l6-6 6 6"/><path d="M4 4h16"/></>,
    refresh:     <><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></>,
    search:      <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>,
    settings:    <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></>,
    money:       <><circle cx="12" cy="12" r="9"/><path d="M9 9.5c0-1 1.3-2 3-2s3 .9 3 1.8c0 1.4-3 1.7-3 3 0 1 1.5 1.7 3 1.7M12 7v10"/></>,
    bank:        <><path d="M3 10 12 4l9 6"/><path d="M5 10v8M19 10v8M9 10v8M15 10v8"/><path d="M3 20h18"/></>,
    coin:        <><circle cx="12" cy="12" r="9"/><path d="M9 12h6"/></>,
    copy:        <><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></>,
  };
  const p = paths[name] || <circle cx="12" cy="12" r="9"/>;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" {...rest}>
      {p}
    </svg>
  );
};

// ─── Modal ───────────────────────────────────────────────────────────────────
function Modal({ open, title, onClose, children, footer, wide, maxWidth }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose && onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  const widthStyle = maxWidth ? { width: `min(${maxWidth}px, calc(100vw - 32px))` } : undefined;
  return (
    <div className="modal-back" onClick={onClose}>
      <div className={`modal${wide ? ' modal-wide' : ''}`} style={widthStyle} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <h3 className="modal-title">{title}</h3>
          <button className="btn btn-icon btn-ghost" onClick={onClose} aria-label="ปิด"><Icon name="x" /></button>
        </div>
        <div>{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// ─── Toast ───────────────────────────────────────────────────────────────────
function useToasts() {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((msg, opts = {}) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((arr) => [...arr, { id, msg, ...opts }]);
    setTimeout(() => setToasts((arr) => arr.filter((t) => t.id !== id)), opts.duration || 2200);
  }, []);
  const node = (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <Icon name="check" size={14} />
          {t.msg}
        </div>
      ))}
    </div>
  );
  return { push, node };
}

// ─── Badges ──────────────────────────────────────────────────────────────────
function Badge({ kind, dot = true, children }) {
  return <span className={`badge ${dot ? 'dot' : ''} ${kind || 'b-gray'}`}>{children}</span>;
}

// ─── KPI Tile ────────────────────────────────────────────────────────────────
function KpiTile({ label, value, unit = 'บาท', delta, deltaKind = 'neu', accent = 'var(--brand-500)', icon, digits = 2, animate = true }) {
  const v = animate ? useCountUp(value || 0, 900, [value]) : (value || 0);
  return (
    <div className="kpi">
      <div className="kpi-accent" style={{ background: accent }}/>
      <div className="kpi-label">
        {icon && <Icon name={icon} size={14} />}
        {label}
      </div>
      <div className="kpi-value">{fmtNum(v, digits)}{unit && <span className="u">{unit}</span>}</div>
      {delta != null && (
        <div className={`kpi-delta ${deltaKind}`}>
          {deltaKind === 'up' && <Icon name="arrow_up" size={11} />}
          {deltaKind === 'dn' && <Icon name="arrow_down" size={11} />}
          {delta}
        </div>
      )}
    </div>
  );
}

// ─── Editable cell helper ────────────────────────────────────────────────────
function EditableCell({ value, onChange, type = 'text', placeholder, align }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);
  useEffect(() => { setV(value); }, [value]);
  if (!editing) {
    return (
      <span onClick={() => setEditing(true)} style={{ cursor: 'text', display: 'inline-block', width: '100%', textAlign: align || 'left' }}>
        {value || <span className="muted">{placeholder || '—'}</span>}
      </span>
    );
  }
  return (
    <input
      autoFocus
      className="input"
      type={type}
      value={v ?? ''}
      onChange={(e) => setV(type === 'number' ? Number(e.target.value) : e.target.value)}
      onBlur={() => { setEditing(false); onChange(v); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { setEditing(false); onChange(v); }
        if (e.key === 'Escape') { setEditing(false); setV(value); }
      }}
      style={{ padding: '4px 8px', fontSize: 13, textAlign: align || 'left' }}
    />
  );
}

// ─── Sortable table helper ───────────────────────────────────────────────────
function useSortable(rows, defaultKey = null, defaultDir = 'asc') {
  const [sort, setSort] = useState({ key: defaultKey, dir: defaultDir });
  const sorted = useMemo(() => {
    if (!sort.key) return rows;
    const arr = [...rows];
    arr.sort((a, b) => {
      const av = typeof sort.key === 'function' ? sort.key(a) : a[sort.key];
      const bv = typeof sort.key === 'function' ? sort.key(b) : b[sort.key];
      // null/undefined go last
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      // date strings (YYYY-MM-DD) compare lexically OK
      if (typeof av === 'number' && typeof bv === 'number') return sort.dir === 'asc' ? av - bv : bv - av;
      const as = String(av).toLowerCase();
      const bs = String(bv).toLowerCase();
      return sort.dir === 'asc' ? as.localeCompare(bs, 'th') : bs.localeCompare(as, 'th');
    });
    return arr;
  }, [rows, sort]);
  const toggle = (key) => setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
  return { sorted, sort, toggle };
}

function SortHeader({ label, sortKey, sort, toggle, align = 'left', width }) {
  const active = sort.key === sortKey;
  return (
    <th style={{ width, textAlign: align, cursor: 'pointer', userSelect: 'none' }} onClick={() => toggle(sortKey)}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start', width: '100%' }}>
        {label}
        <span style={{ opacity: active ? 1 : 0.25, fontSize: 9, lineHeight: 1, display: 'inline-flex', flexDirection: 'column' }}>
          <span style={{ color: active && sort.dir === 'asc' ? 'var(--brand-600)' : 'inherit' }}>▲</span>
          <span style={{ color: active && sort.dir === 'desc' ? 'var(--brand-600)' : 'inherit', marginTop: -2 }}>▼</span>
        </span>
      </span>
    </th>
  );
}

// ─── Status pill (clickable, for IV / period status changes) ─────────────────
function StatusPill({ value, options, onChange, size = 'md' }) {
  const opt = options.find(o => o.value === value) || options[0];
  return (
    <select
      className={`badge dot ${opt.kind || 'b-gray'}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        border: 'none',
        padding: size === 'sm' ? '2px 18px 2px 18px' : '4px 22px 4px 22px',
        fontSize: size === 'sm' ? 11 : 12,
        fontWeight: 600,
        cursor: 'pointer',
        appearance: 'none',
        WebkitAppearance: 'none',
        backgroundImage: 'linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%)',
        backgroundPosition: 'calc(100% - 10px) center, calc(100% - 6px) center',
        backgroundSize: '4px 4px',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// ─── Manual Override System ──────────────────────────────────────────────────
// คีย์เลขมือทับค่าที่ระบบคำนวณ — เก็บใน localStorage (ไม่ sync ไป Apps Script)
// ใช้ใน Warroom รายปี + Cashflow รายสัปดาห์ ตอน present ก่อนผูกข้อมูลจริง
const OVERRIDE_LS_KEY = 'wtp-manual-overrides';
const WTPOverride = {
  _load() { try { return JSON.parse(localStorage.getItem(OVERRIDE_LS_KEY) || '{}'); } catch (_) { return {}; } },
  _save(all) { try { localStorage.setItem(OVERRIDE_LS_KEY, JSON.stringify(all)); } catch (_) {} },
  get(key) { return this._load()[key]; },
  has(key) {
    const v = this._load()[key];
    return v !== undefined && v !== null && v !== '';
  },
  set(key, value) {
    const all = this._load();
    if (value === null || value === '' || value === undefined) delete all[key];
    else all[key] = value;
    this._save(all);
    window.dispatchEvent(new CustomEvent('wtp-override-change', { detail: { key } }));
  },
  clear(key) { this.set(key, null); },
  clearAll() {
    this._save({});
    window.dispatchEvent(new CustomEvent('wtp-override-change', { detail: { key: '*' } }));
  },
  resolve(key, computed) {
    const v = this._load()[key];
    if (v === undefined || v === null || v === '') return computed;
    const n = Number(v);
    return isNaN(n) ? computed : n;
  },
};

// Subscribe helper — เรียก setState เมื่อมี override เปลี่ยน (ของ key นี้ หรือ '*')
function useOverrideSub(key) {
  const [, force] = useState(0);
  useEffect(() => {
    const h = (e) => {
      const k = e.detail && e.detail.key;
      if (k === '*' || k === key) force(x => x + 1);
    };
    window.addEventListener('wtp-override-change', h);
    return () => window.removeEventListener('wtp-override-change', h);
  }, [key]);
}

// useOverrideSubAny — re-render ทุกครั้งที่มี override เปลี่ยน (ใช้ที่ระดับ page)
// เพื่อให้ค่า resolved ที่อยู่นอก <EditableNumber> (เช่น sum, total) อัปเดตด้วย
function useOverrideSubAny() {
  const [, force] = useState(0);
  useEffect(() => {
    const h = () => force(x => x + 1);
    window.addEventListener('wtp-override-change', h);
    return () => window.removeEventListener('wtp-override-change', h);
  }, []);
}

/**
 * EditableNumber — ตัวเลขที่เมื่อ editMode=true จะคลิกแก้ได้
 * - ovKey      : คีย์เฉพาะของ field (เช่น 'wr2.heroTotal')
 * - computed   : ค่าที่ระบบคำนวณ (ใช้เป็น fallback ถ้ายังไม่มี override)
 * - editMode   : true = แสดง <input>, false = แสดงข้อความ
 * - format     : (n) => 'string'  ของแสดงตอน view mode (default fmtNum 2 ตำแหน่ง)
 * - digits     : ทศนิยมตอน format (default 2)
 * - style      : CSS ของกล่อง outer
 * - showBadge  : แสดง ✏️ ตัวเล็กข้างเลขเมื่อมี override (default true)
 */
function EditableNumber({ ovKey, computed, editMode, format, digits = 2, style, showBadge = true, suffix = '' }) {
  useOverrideSub(ovKey);
  const overridden = WTPOverride.has(ovKey);
  const value      = WTPOverride.resolve(ovKey, computed);
  const fmt = format || ((n) => fmtNum(n, digits));

  if (editMode) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <input
          type="number"
          step="0.01"
          defaultValue={overridden ? value : ''}
          placeholder={fmt(computed)}
          onBlur={(e) => {
            const raw = e.target.value;
            if (raw === '') { WTPOverride.clear(ovKey); return; }
            const n = parseFloat(raw);
            if (!isNaN(n)) WTPOverride.set(ovKey, n);
          }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { e.target.value = overridden ? value : ''; e.target.blur(); } }}
          style={{
            ...style,
            minWidth: 80,
            padding: '4px 8px',
            border: `1.5px solid ${overridden ? 'var(--brand-500)' : 'var(--ink-200)'}`,
            borderRadius: 6,
            background: overridden ? 'color-mix(in oklch, var(--brand-500) 6%, white)' : 'white',
            textAlign: 'right',
            fontFamily: 'ui-monospace',
            fontVariantNumeric: 'tabular-nums',
            fontWeight: 600,
            fontSize: 'inherit',
            color: 'inherit',
          }}
        />
        {overridden && (
          <button
            type="button"
            onClick={() => WTPOverride.clear(ovKey)}
            title="ล้างค่าที่กรอกเอง — กลับไปใช้ค่าระบบคำนวณ"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--bad)', fontSize: 14, padding: 0 }}
          >✕</button>
        )}
      </span>
    );
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4, ...style }}>
      <span>{fmt(value)}{suffix}</span>
      {showBadge && overridden && (
        <span
          title="ค่าที่กรอกมือ (override)"
          style={{
            fontSize: 9,
            background: 'var(--brand-500)',
            color: 'white',
            padding: '1px 4px',
            borderRadius: 3,
            fontWeight: 700,
            letterSpacing: '.05em',
            verticalAlign: 'baseline',
          }}
        >✏️</span>
      )}
    </span>
  );
}

/**
 * EditModeToggle — ปุ่ม toggle ที่ใช้ใส่ในหัวหน้า
 *   <EditModeToggle value={editMode} onChange={setEditMode} />
 */
function EditModeToggle({ value, onChange, label = 'โหมดแก้ไข' }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      title={value ? 'ปิดโหมดแก้ไข (กลับไปดูปกติ)' : 'เปิดโหมดแก้ไข (คีย์เลขเองทับค่าระบบ)'}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '6px 14px',
        borderRadius: 18,
        border: `1.5px solid ${value ? 'var(--brand-500)' : 'var(--ink-200)'}`,
        background: value ? 'var(--brand-500)' : 'white',
        color: value ? 'white' : 'var(--ink-700)',
        cursor: 'pointer',
        fontSize: 12.5,
        fontWeight: 600,
        transition: 'all .15s',
      }}
    >
      <span style={{ fontSize: 13 }}>✏️</span>
      {value ? `${label} ON` : label}
    </button>
  );
}

// ─── Export to globals ───────────────────────────────────────────────────────
Object.assign(window, {
  fmtNum, fmtInt, fmtMoney, fmtDate, fmtDateLong, parseDateFlexible,
  useCountUp, AnimatedNumber, Icon, Modal, useToasts, Badge, KpiTile, EditableCell,
  useSortable, SortHeader, StatusPill,
  exportRowsToExcel, ExportButton, PrintButton,
  ColFilterDropdown, FilterableColHeader,
  WTPOverride, EditableNumber, EditModeToggle, useOverrideSub, useOverrideSubAny,
});
