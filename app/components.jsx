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
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(TH_LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtDateLong(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(TH_LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });
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
    upload:      <><path d="M12 20V8M6 12l6-6 6 6"/><path d="M4 4h16"/></>,
    refresh:     <><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></>,
    search:      <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>,
    settings:    <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></>,
    money:       <><circle cx="12" cy="12" r="9"/><path d="M9 9.5c0-1 1.3-2 3-2s3 .9 3 1.8c0 1.4-3 1.7-3 3 0 1 1.5 1.7 3 1.7M12 7v10"/></>,
    bank:        <><path d="M3 10 12 4l9 6"/><path d="M5 10v8M19 10v8M9 10v8M15 10v8"/><path d="M3 20h18"/></>,
    coin:        <><circle cx="12" cy="12" r="9"/><path d="M9 12h6"/></>,
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
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: align === 'right' ? 'flex-end' : 'flex-start', width: '100%' }}>
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

// ─── Export to globals ───────────────────────────────────────────────────────
Object.assign(window, {
  fmtNum, fmtInt, fmtMoney, fmtDate, fmtDateLong,
  useCountUp, AnimatedNumber, Icon, Modal, useToasts, Badge, KpiTile, EditableCell,
  useSortable, SortHeader, StatusPill,
});
