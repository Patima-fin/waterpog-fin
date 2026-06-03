/* page_bank_diary.jsx — Bank Diary + Inter-account Transfers
 *
 * การ์ดบัญชีดึงข้อมูลจริงจาก 2 แหล่ง:
 *   • bankAccounts  — ยอดคงเหลือต่อบัญชี (รองรับชื่อ field จาก Sheet: BANK_NAME / Bank_AC / BALANCE / AVAILABLE_BALANCE / HOLD_AMOUNT / DATE / NOTE)
 *   • checks        — เช็คจ่าย ผูกเข้าบัญชีด้วยเลขบัญชี (รองรับเลข 4 ตัวท้าย) เพื่อดูว่าบัญชีไหนมีรายการครบกำหนดวันไหน เงินพอไหม
 */
'use strict';

/* ── Field normalization helpers (live Sheet fields ↔ seed fields) ─────── */
function bdNum(v) {
  if (v == null || v === '') return 0;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}
function bdHas(v) { return v != null && v !== ''; }

/* Normalize one bank-account record into a canonical shape */
function bdAcct(a) {
  return {
    id:          a.id,
    bankName:    a.BANK_NAME   || a.bankName    || '',
    accountNo:   a.Bank_AC     || a.accountNo   || '',
    accountName: a.accountName || a.ACCOUNT_NAME || '',
    type:        a.type || a.accountType || '',
    balance:     bdNum(bdHas(a.BALANCE) ? a.BALANCE : a.balance),
    available:   bdHas(a.AVAILABLE_BALANCE) ? bdNum(a.AVAILABLE_BALANCE) : null,
    hold:        bdHas(a.HOLD_AMOUNT) ? bdNum(a.HOLD_AMOUNT) : null,
    asOf:        a.DATE || a.asOf || '',
    note:        a.NOTE || a.note || '',
    _raw:        a,
  };
}

/* Match a bank account to a check by account number (tolerates last-N-digit refs) */
function bdDigits(s) { return String(s == null ? '' : s).replace(/\D/g, ''); }
function bdAcctMatchesCheck(acctNo, checkAcctNo) {
  const a = bdDigits(acctNo), c = bdDigits(checkAcctNo);
  if (!a || !c) return false;
  if (a === c) return true;
  if (c.length >= 4 && c.length < a.length && a.slice(-c.length) === c) return true;
  if (a.length >= 4 && a.length < c.length && c.slice(-a.length) === a) return true;
  return false;
}

/* Normalize Thai check status → outstanding | cleared | cancelled */
function bdCheckStatus(s) {
  s = s || '';
  if (s === 'จ่ายแล้ว' || s === 'ขึ้นเงินแล้ว' || s.indexOf('ได้รับคืน') >= 0 || s.indexOf('ได้รับเช็คคืน') >= 0) return 'cleared';
  if (s.indexOf('ยกเลิก') >= 0 || s.indexOf('เด้ง') >= 0) return 'cancelled';
  if (s.indexOf('รอ') >= 0) return 'clearing';
  return 'outstanding'; // blank / null = ยังไม่เคลียร์ = ค้างจ่าย
}
function bdIsOutstanding(st) { return st === 'outstanding' || st === 'clearing'; }

/* Local-date → 'YYYY-MM-DD' (ไม่ใช้ toISOString เพราะจะเพี้ยน timezone) */
function bdISO(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
/* แปลงค่าวันที่ใดๆ → ISO ('' ถ้าแปลงไม่ได้ เช่น "30-พ.ค.") */
function bdToISO(v) {
  if (!v) return '';
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const t = Date.parse(s);
  return isNaN(t) ? '' : bdISO(new Date(t));
}

/* ปลายช่วงเวลาตาม preset (นับจาก today ไปข้างหน้า) */
function bdPeriodEnd(today, key) {
  const d = new Date(today + 'T00:00:00');
  const y = d.getFullYear(), m = d.getMonth(), day = d.getDate(), dow = d.getDay();
  const mk = (yy, mm, dd) => bdISO(new Date(yy, mm, dd));
  switch (key) {
    case 'thisWeek':      return mk(y, m, day + ((7 - dow) % 7));        // ถึงอาทิตย์นี้
    case 'nextWeek':      return mk(y, m, day + ((7 - dow) % 7) + 7);    // ถึงสิ้นสัปดาห์หน้า
    case 'thisMonth':     return mk(y, m + 1, 0);                        // ถึงสิ้นเดือนนี้
    case 'firstWeekNext': return mk(y, m + 1, 7);                        // ถึงสัปดาห์แรกเดือนหน้า
    case 'midNext':       return mk(y, m + 1, 15);                       // ถึงกลางเดือนหน้า
    case 'all':
    default:              return '9999-12-31';
  }
}
const BD_PERIODS = [
  { key: 'thisWeek',      label: 'สัปดาห์นี้' },
  { key: 'nextWeek',      label: 'ถึงสัปดาห์หน้า' },
  { key: 'thisMonth',     label: 'เดือนนี้' },
  { key: 'firstWeekNext', label: 'ถึงสัปดาห์แรกเดือนหน้า' },
  { key: 'midNext',       label: 'ถึงกลางเดือนหน้า' },
  { key: 'all',           label: 'ทั้งหมด' },
];

/* Normalize forecastEntries → ใช้ยอดจริง (ACTUAL_AMOUNT) อัตโนมัติเมื่อมี (ตัด PV แล้ว) */
function bdNormForecast(e) {
  const planAmount = bdNum(e.AMOUNT);
  const hasActual  = e.ACTUAL_AMOUNT != null && e.ACTUAL_AMOUNT !== '';
  const actualAmt  = hasActual ? bdNum(e.ACTUAL_AMOUNT) : null;
  const sign       = planAmount < 0 ? -1 : 1;
  const amount     = hasActual ? sign * Math.abs(actualAmt) : planAmount; // ใช้ยอดจริงแต่คงทิศ รับ/จ่าย
  const date       = bdToISO(e.ACTUAL_DATE) || bdToISO(e.PAYMENT_DATE) || bdToISO(e.DATE);
  const isActual   = hasActual || e.STATUS === 'ACTUAL';
  return {
    id: e.id, date, payDate: bdToISO(e.PAYMENT_DATE), planAmount, actualAmount: actualAmt, amount,
    desc: e.DESCRIPTION || 'ประมาณการ', bankAc: e.Bank_AC || '', status: e.STATUS || 'PLANNED',
    isActual, refDoc: e.REF_DOC || '', expType: e.EXPENSE_TYPE || '', type: amount >= 0 ? 'in' : 'out', raw: e,
  };
}

/* Build the per-account view (เช็คค้างจ่าย + forecast ที่ผูกบัญชี) — base = ยอดเงินจริง (ไม่หัก HOLD)
 * สัญญาณ "เงินไม่พอ" ใช้กรอบ 7 วัน (near-term) เทียบยอดเงินจริง */
function bdBuildAccountView(acct, matchedChecks, matchedForecasts, matchedTransfers, today, next7) {
  const asOfRef = (acct.asOf && acct.asOf < today) ? acct.asOf : today;
  const base    = acct.balance; // ยอดเงินจริง

  const items = [];
  matchedChecks
    .filter(c => bdIsOutstanding(c._st) && (c.checkDate || '') >= asOfRef)
    .forEach(c => items.push({
      date: c.checkDate, signed: -bdNum(c.amount), kind: 'check',
      title: c.payee || '—', sub: 'เช็ค #' + (c.checkNo || '—'), status: c._st, raw: c,
    }));
  matchedForecasts
    .filter(f => f.date && f.date >= asOfRef)
    .forEach(f => items.push({
      date: f.date, signed: f.amount, kind: 'forecast',
      title: f.desc, sub: (f.isActual ? '✓ ' + (f.amount >= 0 ? 'รับจริงแล้ว' : 'จ่ายจริงแล้ว') : 'ประมาณการ') + (f.refDoc ? ' • ' + f.refDoc : ''),
      status: f.isActual ? 'actual' : 'planned', raw: f,
    }));
  // โอนระหว่างบัญชี: นับเฉพาะที่ "ยังไม่กลืนยอด" = ยังไม่ยืนยัน และลงวันที่ตั้งแต่วัน BALANCE เป็นต้นไป
  // (ยืนยัน = โอนจริง+เอา PV เข้าแล้ว → ถือว่าอยู่ใน BALANCE ที่ sync มาแล้ว จึงไม่นับซ้ำ)
  (matchedTransfers || [])
    .filter(e => (e.entryDate || '') >= asOfRef && !e.reconciled)
    .forEach(e => items.push({
      date: e.entryDate, signed: bdNum(e.amount), kind: 'transfer', ref: e.transferRef || '',
      title: e.description || 'โอนระหว่างบัญชี',
      sub: 'โอนระหว่างบัญชี (รอกลืนยอด)' + (e.transferRef ? ' • ' + e.transferRef : ''),
      status: 'pending', raw: e,
    }));
  items.sort((a, b) => (a.date || '') < (b.date || '') ? -1 : 1);

  // กลุ่มตามวัน + ยอดคงเหลือสะสม (running = base + Σ signed)
  const groups = {};
  items.forEach(it => { (groups[it.date] = groups[it.date] || []).push(it); });
  let running = base;
  const dayGroups = Object.keys(groups).sort().map(date => {
    const its = groups[date];
    const net = its.reduce((s, i) => s + i.signed, 0);
    running += net;
    return { date, items: its, net, running };
  });

  const outTotal = items.filter(i => i.signed < 0).reduce((s, i) => s - i.signed, 0);
  const inTotal  = items.filter(i => i.signed > 0).reduce((s, i) => s + i.signed, 0);

  // near-term 7 วัน
  const near    = items.filter(i => (i.date || '') <= next7);
  const nearNet = near.reduce((s, i) => s + i.signed, 0);
  const afterNear = base + nearNet;
  const shortNear = afterNear < 0;
  const shortBy   = shortNear ? -afterNear : 0;

  const dueToday    = items.filter(i => i.date === today);
  const dueTodayOut = dueToday.filter(i => i.signed < 0).reduce((s, i) => s - i.signed, 0);
  const overdue     = items.filter(i => i.kind === 'check' && (i.date || '') < today);

  return { acct, base, items, dayGroups, outTotal, inTotal,
           near, nearNet, afterNear, shortNear, shortBy, dueToday, dueTodayOut, overdue };
}

/* ── Add/Edit Transfer Modal (พร้อมจำลอง what-if เงินพอไหม + เลือกช่วงในตัว) ── */
function AddTransferModal({ bankAccounts, onSave, onClose, initialTo, initialFrom, initial, onDelete, canDelete, acctData, initialPeriod }) {
  const today = new Date().toISOString().slice(0, 10);
  const isEdit = !!(initial && initial.ref);
  const [form, setForm] = React.useState({
    fromAccountNo: (initial && initial.fromAccountNo) || initialFrom || '',
    toAccountNo:   (initial && initial.toAccountNo)   || initialTo   || '',
    amount: (initial && initial.amount != null) ? String(initial.amount) : '',
    date:   (initial && initial.date) || today,
    ref:    (initial && initial.ref) || '',
    note:   (initial && initial.note) || '',
  });
  const [err, setErr] = React.useState('');
  const [simPeriod, setSimPeriod] = React.useState(initialPeriod || 'thisMonth');

  // คำนวณภาระจ่ายของบัญชีตาม "ช่วงเวลาที่เลือกใน modal" — ปรับได้สดโดยไม่ต้องปิด
  const data      = acctData || {};
  const simEnd    = bdPeriodEnd(today, simPeriod);
  const simLabel  = (BD_PERIODS.find(p => p.key === simPeriod) || {}).label || '';
  const editRef = isEdit ? initial.ref : null;
  const periodOutOf = (accountNo) => {
    const a = data[accountNo];
    if (!a) return null;
    // ตอนแก้ไข: ไม่นับ leg ของรายการโอนตัวเอง (กันนับซ้ำ เพราะ amt คือยอดใหม่ที่กำลังจะแทน)
    const out = a.items.filter(i => i.signed < 0 && i.date <= simEnd && !(editRef && i.ref === editRef)).reduce((s, i) => s - i.signed, 0);
    return { base: a.base, periodOut: out };
  };

  const setF = (k, v) => { setErr(''); setForm(prev => ({ ...prev, [k]: v })); };

  const handleSave = () => {
    if (!form.fromAccountNo)                     return setErr('กรุณาเลือกบัญชีต้นทาง');
    if (!form.toAccountNo)                       return setErr('กรุณาเลือกบัญชีปลายทาง');
    if (form.fromAccountNo === form.toAccountNo) return setErr('บัญชีต้นทางและปลายทางต้องไม่ใช่บัญชีเดียวกัน');
    const amt = parseFloat(form.amount);
    if (!amt || amt <= 0)                        return setErr('กรุณาระบุจำนวนเงินที่ถูกต้อง');
    if (!form.date)                              return setErr('กรุณาเลือกวันที่');

    const ref      = form.ref.trim() || ('TRF-' + Date.now());
    const fromAcct = bankAccounts.find(function(a){ return a.accountNo === form.fromAccountNo; });
    const toAcct   = bankAccounts.find(function(a){ return a.accountNo === form.toAccountNo; });
    const noteText = form.note.trim();
    const ts       = Date.now();

    onSave([
      { id:'be-'+ts+'-out', accountNo:form.fromAccountNo, bankName:(fromAcct ? fromAcct.bankName : ''), entryDate:form.date, entryType:'outflow_transfer', amount:-amt, description:noteText || ('โอนเงินไป '+(toAcct ? toAcct.bankName : '')+' '+form.toAccountNo), transferRef:ref, reconciled:false },
      { id:'be-'+ts+'-in',  accountNo:form.toAccountNo,   bankName:(toAcct  ? toAcct.bankName  : ''), entryDate:form.date, entryType:'inflow_transfer',  amount: amt, description:noteText || ('รับโอนจาก '+(fromAcct ? fromAcct.bankName : '')+' '+form.fromAccountNo), transferRef:ref, reconciled:false },
    ], isEdit);
  };

  const inp = { width:'100%', padding:'8px 11px', boxSizing:'border-box', border:'1.5px solid #e2e8f0', borderRadius:8, fontSize:13, fontFamily:'inherit', outline:'none' };
  const sel = { ...inp, background:'#fff' };
  const lbl = { fontSize:12, fontWeight:600, color:'#475569', marginBottom:4, display:'block' };

  const acctLabel = (a) => (a.bankName ? a.bankName + ' — ' : '') + a.accountNo;
  const fromName = form.fromAccountNo ? acctLabel(bankAccounts.find(function(a){ return a.accountNo===form.fromAccountNo; }) || {accountNo:form.fromAccountNo}) : '—';
  const toName   = form.toAccountNo   ? acctLabel(bankAccounts.find(function(a){ return a.accountNo===form.toAccountNo;   }) || {accountNo:form.toAccountNo})   : '—';

  /* ── จำลอง what-if: โอนแล้วแต่ละบัญชีพอจ่ายภาระตัวเองไหม ── */
  const amt   = parseFloat(form.amount) || 0;
  const fromS = periodOutOf(form.fromAccountNo);   // { base, periodOut } ตามช่วงที่เลือก
  const toS   = periodOutOf(form.toAccountNo);
  const fromAfter      = fromS ? fromS.base - amt : null;          // เหลือหลังโอนออก
  const fromAfterCover = fromS ? fromAfter - fromS.periodOut : null; // เหลือหลังหักภาระตัวเอง
  const toAfter        = toS ? toS.base + amt : null;              // เหลือหลังรับเข้า
  const toBeforeCover  = toS ? toS.base - toS.periodOut : null;
  const toAfterCover   = toS ? toAfter - toS.periodOut : null;
  const suggest        = toS ? Math.max(0, toS.periodOut - toS.base) : 0; // ยอดที่ควรโอนให้ปลายทางพอ
  const overdraw       = fromS ? amt > fromS.base : false;        // โอนเกินยอดที่มี

  const money = (v) => (v >= 0 ? '' : '−') + fmtMoney(Math.abs(v));

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.45)', zIndex:9000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
         onClick={onClose}>
      <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:500, maxHeight:'calc(100vh - 32px)', display:'flex', flexDirection:'column', boxShadow:'0 24px 64px rgba(0,0,0,0.18)', overflow:'hidden' }}
           onClick={function(e){ e.stopPropagation(); }}>

        {/* Header */}
        <div style={{ flexShrink:0, padding:'16px 20px', background:'linear-gradient(135deg,#faf5ff,#ede9fe)', borderBottom:'1px solid #d6bcfa', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontWeight:700, fontSize:15, color:'#44337a' }}>{isEdit ? '✏️ แก้ไขการโอนเงินระหว่างบัญชี' : '⇄ บันทึกการโอนเงินระหว่างบัญชี'}</div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', fontSize:18, color:'#805ad5', lineHeight:1, padding:'0 4px' }}>✕</button>
        </div>

        {/* Body (เลื่อนได้ถ้ายาวเกินจอ) */}
        <div style={{ padding:20, overflowY:'auto', flex:1, minHeight:0 }}>
          {/* Preview arrow */}
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16, padding:'10px 14px', background:'#f8fafc', borderRadius:10, border:'1px solid #e2e8f0' }}>
            <div style={{ flex:1, textAlign:'center' }}>
              <div style={{ fontSize:11, color:'#718096', marginBottom:2 }}>โอนออกจาก</div>
              <div style={{ fontWeight:700, fontSize:13, color:'#c53030' }}>{fromName}</div>
            </div>
            <div style={{ fontSize:20, color:'#805ad5' }}>→</div>
            <div style={{ flex:1, textAlign:'center' }}>
              <div style={{ fontSize:11, color:'#718096', marginBottom:2 }}>โอนเข้า</div>
              <div style={{ fontWeight:700, fontSize:13, color:'#276749' }}>{toName}</div>
            </div>
            {form.amount ? <div style={{ fontSize:13, fontWeight:700, color:'#1a202c', whiteSpace:'nowrap', marginLeft:8 }}>{fmtMoney(parseFloat(form.amount)||0)}</div> : null}
          </div>

          {/* What-if simulation — แสดงเมื่อเลือกครบ */}
          {(fromS || toS) && form.fromAccountNo && form.toAccountNo && form.fromAccountNo !== form.toAccountNo && (
            <div style={{ marginBottom:16, border:'1px solid #e2e8f0', borderRadius:10, overflow:'hidden' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 12px', background:'#f1f5f9', fontSize:11, fontWeight:700, color:'#475569' }}>
                <span>จำลองหลังโอน · ภาระจ่ายช่วง “{simLabel}”</span>
                {amt > 0 && <span style={{ color:'#805ad5' }}>{fmtMoney(amt)}</span>}
              </div>
              {/* เลือกช่วงเวลาในตัว modal — ปรับดูพอ/ไม่พอแต่ละช่วงได้สด */}
              <div style={{ display:'flex', flexWrap:'wrap', gap:5, padding:'7px 12px', borderBottom:'1px solid #eef0f6' }}>
                {BD_PERIODS.map(p => (
                  <button key={p.key} type="button" onClick={() => setSimPeriod(p.key)}
                    style={{ padding:'3px 9px', borderRadius:14, fontSize:10, fontWeight:600, cursor:'pointer', fontFamily:'inherit',
                             border:'1px solid ' + (simPeriod===p.key ? '#805ad5' : '#e2e8f0'),
                             background: simPeriod===p.key ? '#805ad5' : '#fff',
                             color: simPeriod===p.key ? '#fff' : '#64748b' }}>
                    {p.label}
                  </button>
                ))}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr' }}>
                {/* FROM */}
                <div style={{ padding:'9px 12px', borderRight:'1px solid #eef0f6' }}>
                  <div style={{ fontSize:10, color:'#c53030', fontWeight:700, marginBottom:3 }}>↑ ต้นทาง (โอนออก)</div>
                  {fromS ? (
                    <div style={{ fontSize:11, color:'#475569', display:'grid', gap:2 }}>
                      <div style={{ display:'flex', justifyContent:'space-between' }}><span>ยอดจริง</span><b>{fmtMoney(fromS.base)}</b></div>
                      <div style={{ display:'flex', justifyContent:'space-between', color:'#94a3b8' }}><span>ภาระจ่าย</span><span>−{fmtMoney(fromS.periodOut)}</span></div>
                      <div style={{ display:'flex', justifyContent:'space-between', borderTop:'1px dashed #e2e8f0', paddingTop:2, fontWeight:700 }}>
                        <span>เหลือหลังโอน</span><span style={{ color: fromAfterCover < 0 ? '#dc2626' : '#276749' }}>{money(fromAfterCover)}</span>
                      </div>
                      {fromAfterCover < 0
                        ? <div style={{ fontSize:10, color:'#dc2626' }}>⚠ โอนแล้วต้นทางจะไม่พอจ่ายภาระตัวเอง</div>
                        : <div style={{ fontSize:10, color:'#276749' }}>✓ ต้นทางยังพอ</div>}
                    </div>
                  ) : <div style={{ fontSize:11, color:'#a0aec0' }}>—</div>}
                </div>
                {/* TO */}
                <div style={{ padding:'9px 12px' }}>
                  <div style={{ fontSize:10, color:'#276749', fontWeight:700, marginBottom:3 }}>↓ ปลายทาง (รับเข้า)</div>
                  {toS ? (
                    <div style={{ fontSize:11, color:'#475569', display:'grid', gap:2 }}>
                      <div style={{ display:'flex', justifyContent:'space-between' }}><span>ยอดจริง</span><b>{fmtMoney(toS.base)}</b></div>
                      <div style={{ display:'flex', justifyContent:'space-between', color:'#94a3b8' }}><span>ภาระจ่าย</span><span>−{fmtMoney(toS.periodOut)}</span></div>
                      <div style={{ display:'flex', justifyContent:'space-between', borderTop:'1px dashed #e2e8f0', paddingTop:2, fontWeight:700 }}>
                        <span>เหลือหลังรับ</span><span style={{ color: toAfterCover < 0 ? '#dc2626' : '#276749' }}>{money(toAfterCover)}</span>
                      </div>
                      {toAfterCover < 0
                        ? <div style={{ fontSize:10, color:'#dc2626' }}>⚠ รับแล้วยังขาดอีก {fmtMoney(-toAfterCover)}</div>
                        : <div style={{ fontSize:10, color:'#276749' }}>✓ ปลายทางพอจ่ายภาระ</div>}
                    </div>
                  ) : <div style={{ fontSize:11, color:'#a0aec0' }}>—</div>}
                </div>
              </div>
              {/* Suggestion */}
              {suggest > 0 && (
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, padding:'7px 12px', background:'#faf5ff', borderTop:'1px solid #eef0f6' }}>
                  <span style={{ fontSize:11, color:'#6b46c1' }}>ปลายทางขาดอยู่ — ควรโอนอย่างน้อย <b>{fmtMoney(suggest)}</b></span>
                  <button type="button" onClick={() => setF('amount', String(Math.ceil(suggest)))}
                    style={{ background:'#6b46c1', color:'#fff', border:'none', borderRadius:6, padding:'3px 10px', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>
                    ใช้ยอดนี้
                  </button>
                </div>
              )}
              {overdraw && (
                <div style={{ padding:'6px 12px', background:'#fff5f5', borderTop:'1px solid #fecaca', fontSize:10, color:'#dc2626' }}>
                  ⚠ จำนวนที่โอน ({fmtMoney(amt)}) มากกว่ายอดเงินจริงของต้นทาง ({fmtMoney(fromS.base)})
                </div>
              )}
            </div>
          )}

          {/* Form grid */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px 14px' }}>

            <div style={{ gridColumn:'1/-1' }}>
              <label style={lbl}>บัญชีต้นทาง (โอนออก) *</label>
              <select style={sel} value={form.fromAccountNo} onChange={function(e){ setF('fromAccountNo', e.target.value); }}>
                <option value="">— เลือกบัญชีต้นทาง —</option>
                {bankAccounts.map(function(a, i){ return <option key={i} value={a.accountNo}>{a.bankName} — {a.accountNo}</option>; })}
              </select>
            </div>

            <div style={{ gridColumn:'1/-1' }}>
              <label style={lbl}>บัญชีปลายทาง (รับโอน) *</label>
              <select style={sel} value={form.toAccountNo} onChange={function(e){ setF('toAccountNo', e.target.value); }}>
                <option value="">— เลือกบัญชีปลายทาง —</option>
                {bankAccounts.map(function(a, i){ return <option key={i} value={a.accountNo}>{a.bankName} — {a.accountNo}</option>; })}
              </select>
            </div>

            <div>
              <label style={lbl}>จำนวนเงิน (บาท) *</label>
              <input type="number" style={inp} value={form.amount} min="0" step="0.01"
                onChange={function(e){ setF('amount', e.target.value); }} placeholder="0.00" />
            </div>

            <div>
              <label style={lbl}>วันที่โอน *</label>
              <input type="date" style={inp} value={form.date}
                onChange={function(e){ setF('date', e.target.value); }} />
            </div>

            <div style={{ gridColumn:'1/-1' }}>
              <label style={lbl}>เลขที่อ้างอิง <span style={{ fontWeight:400, color:'#94a3b8' }}>(ระบบสร้างให้ถ้าไม่กรอก)</span></label>
              <input type="text" style={inp} value={form.ref}
                onChange={function(e){ setF('ref', e.target.value); }} placeholder="เช่น TRF-2026-001" />
            </div>

            <div style={{ gridColumn:'1/-1' }}>
              <label style={lbl}>หมายเหตุ</label>
              <input type="text" style={inp} value={form.note}
                onChange={function(e){ setF('note', e.target.value); }} placeholder="รายละเอียดการโอน" />
            </div>

          </div>

          {err ? <div style={{ marginTop:10, padding:'8px 12px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:7, fontSize:12, color:'#dc2626' }}>⚠ {err}</div> : null}

          <div style={{ marginTop:18, display:'flex', gap:10, justifyContent: isEdit && onDelete && canDelete ? 'space-between' : 'flex-end', alignItems:'center' }}>
            {isEdit && onDelete && canDelete && (
              <button onClick={() => onDelete(initial.ref)}
                style={{ padding:'8px 14px', borderRadius:8, border:'1.5px solid #fecaca', background:'#fff', color:'#dc2626', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                ลบการโอน
              </button>
            )}
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={onClose}
                style={{ padding:'8px 18px', borderRadius:8, border:'1.5px solid #e2e8f0', background:'#fff', color:'#475569', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                ยกเลิก
              </button>
              <button onClick={handleSave}
                style={{ padding:'8px 20px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#2a6fdb,#1a4490)', color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit', boxShadow:'0 4px 12px rgba(42,111,219,0.3)' }}>
                {isEdit ? 'บันทึกการแก้ไข' : 'บันทึกการโอน'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Reconcile Panel ─────────────────────────────────────────────────── */
function ReconcilePanel({ transferPairs, bankAccounts, onReconcile, onEdit, canEdit }) {
  const acctMap = React.useMemo(() => {
    const m = {};
    bankAccounts.forEach(a => { m[a.accountNo] = a; });
    return m;
  }, [bankAccounts]);

  const pairs = Object.entries(transferPairs);
  if (pairs.length === 0) return null;

  const pendingCount = pairs.filter(([, entries]) => entries.some(e => !e.reconciled)).length;

  return (
    <div className="card" style={{ marginBottom:20, padding:0, overflow:'hidden' }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px', background:'linear-gradient(135deg,#faf5ff,#ede9fe)', borderBottom:'1px solid #d6bcfa' }}>
        <div>
          <div style={{ fontWeight:700, fontSize:14, color:'#44337a' }}>⇄ ตรวจสอบการโอนเงินระหว่างบัญชี</div>
          <div style={{ fontSize:12, color:'#6b46c1', marginTop:2 }}>
            {pairs.length} คู่โอนทั้งหมด
            {pendingCount > 0 && ` · ${pendingCount} รายการรอกลืนยอด`}
            <span style={{ color:'#9f7aea' }}> · กดยืนยันเมื่อโอนจริง+ลง PV แล้ว (จะเลิกนับในยอดคาดการณ์)</span>
          </div>
        </div>
        {pendingCount > 0 && (
          <span style={{ background:'#fed7d7', color:'#c53030', fontSize:11, fontWeight:700, borderRadius:20, padding:'4px 12px' }}>
            ⚠ {pendingCount} รอ Reconcile
          </span>
        )}
        {pendingCount === 0 && pairs.length > 0 && (
          <span style={{ background:'#c6f6d5', color:'#276749', fontSize:11, fontWeight:700, borderRadius:20, padding:'4px 12px' }}>
            ✓ ยืนยันครบทุกรายการ
          </span>
        )}
      </div>

      {/* Table */}
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead>
            <tr style={{ background:'#faf5ff' }}>
              {['วันที่', 'จากบัญชี', '', 'ไปบัญชี', 'จำนวนเงิน', 'เลขอ้างอิง', 'หมายเหตุ', 'สถานะ', ''].map((h, i) => (
                <th key={i} style={{ padding:'7px 10px', textAlign: h==='จำนวนเงิน' ? 'right' : 'left', fontWeight:600, color:'#6b46c1', borderBottom:'1px solid #e9d8fd', whiteSpace:'nowrap', fontSize:11 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pairs.map(([ref, entries]) => {
              const outEntry    = entries.find(e => e.entryType === 'outflow_transfer');
              const inEntry     = entries.find(e => e.entryType === 'inflow_transfer');
              const isReconciled= entries.every(e => e.reconciled);
              const date        = outEntry?.entryDate || inEntry?.entryDate || '';
              const fromAcct    = acctMap[outEntry?.accountNo];
              const toAcct      = acctMap[inEntry?.accountNo];
              const amount      = Math.abs(parseFloat(outEntry?.amount || inEntry?.amount || 0));

              const editObj = { fromAccountNo: outEntry?.accountNo || '', toAccountNo: inEntry?.accountNo || '', amount: amount, date: date, ref: ref, note: (outEntry?.description || inEntry?.description || '') };
              return (
                <tr key={ref}
                    onClick={canEdit ? () => onEdit(editObj) : undefined}
                    title={canEdit ? 'กดเพื่อแก้ไข / แก้จำนวนเงิน' : undefined}
                    style={{ borderBottom:'1px solid #f0f4f8', background: isReconciled ? '#f0fff4' : 'transparent', cursor: canEdit ? 'pointer' : 'default' }}>
                  <td style={{ padding:'8px 10px', whiteSpace:'nowrap', color:'#4a5568', fontSize:11 }}>{fmtDate(date)}</td>
                  <td style={{ padding:'8px 10px' }}>
                    <div style={{ fontWeight:600, color:'#c53030', fontSize:12 }}>{fromAcct?.bankName || outEntry?.bankName || '—'}</div>
                    <div style={{ fontSize:10, color:'#718096' }}>{outEntry?.accountNo || '—'}</div>
                  </td>
                  <td style={{ padding:'8px 4px', textAlign:'center', fontSize:18, color:'#805ad5' }}>→</td>
                  <td style={{ padding:'8px 10px' }}>
                    <div style={{ fontWeight:600, color:'#276749', fontSize:12 }}>{toAcct?.bankName || inEntry?.bankName || '—'}</div>
                    <div style={{ fontSize:10, color:'#718096' }}>{inEntry?.accountNo || '—'}</div>
                  </td>
                  <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:700, fontVariantNumeric:'tabular-nums', whiteSpace:'nowrap', color:'#1a202c' }}>
                    {fmtMoney(amount)}
                  </td>
                  <td style={{ padding:'8px 10px', fontSize:11, color:'#805ad5' }}>{ref}</td>
                  <td style={{ padding:'8px 10px', color:'#4a5568', maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {outEntry?.description || inEntry?.description || '—'}
                  </td>
                  <td style={{ padding:'8px 10px', whiteSpace:'nowrap' }}>
                    {isReconciled
                      ? <span style={{ background:'#c6f6d5', color:'#276749', fontSize:11, fontWeight:600, borderRadius:12, padding:'2px 9px' }}>✓ กลืนยอดแล้ว</span>
                      : <span style={{ background:'#feebc8', color:'#b45309', fontSize:11, fontWeight:600, borderRadius:12, padding:'2px 9px' }}>รอกลืนยอด</span>
                    }
                  </td>
                  <td style={{ padding:'8px 10px', whiteSpace:'nowrap' }}>
                    {!isReconciled && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onReconcile(ref); }}
                        style={{ background:'#6b46c1', color:'#fff', border:'none', borderRadius:6, padding:'4px 12px', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}
                      >
                        ยืนยัน
                      </button>
                    )}
                    {canEdit && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onEdit(editObj); }}
                        title="แก้ไข"
                        style={{ background:'none', border:'none', cursor:'pointer', fontSize:14, marginLeft:6, padding:'2px 4px' }}
                      >
                        ✏️
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Day group row (expandable) — เช็คที่ครบกำหนดในวันเดียวกัน ────────── */
function BDDayGroup({ day, today }) {
  const [open, setOpen] = React.useState(false);
  const isToday   = day.date === today;
  const isOverdue = day.date < today;
  const dueColor  = isOverdue ? '#c026d3' : isToday ? '#dc2626' : '#1e293b';

  return (
    <div style={{ borderBottom:'1px solid #f0f4f8' }}>
      {/* Day header — clickable */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display:'grid', gridTemplateColumns:'16px 86px 1fr auto auto',
          gap:'0 8px', alignItems:'center', padding:'7px 14px', cursor:'pointer',
          background: isToday ? '#fff1f2' : isOverdue ? '#fdf4ff' : 'transparent',
        }}
      >
        <span style={{ fontSize:10, color:'#94a3b8', transform: open ? 'rotate(90deg)' : 'none', transition:'transform .15s' }}>▶</span>
        <div style={{ fontSize:11, fontWeight:700, color:dueColor, whiteSpace:'nowrap' }}>
          {fmtDate(day.date)}
          {isToday   && <span style={{ display:'block', fontSize:9, fontWeight:700, color:'#dc2626' }}>วันนี้</span>}
          {isOverdue && <span style={{ display:'block', fontSize:9, fontWeight:700, color:'#c026d3' }}>เลยกำหนด</span>}
        </div>
        <div style={{ fontSize:11, color:'#64748b' }}>
          {day.items.length} รายการ
        </div>
        <div style={{ textAlign:'right', fontWeight:700, fontSize:12, color: day.net >= 0 ? '#276749' : '#c53030', fontVariantNumeric:'tabular-nums', whiteSpace:'nowrap' }}>
          {day.net >= 0 ? '+' : '−'}{fmtMoney(Math.abs(day.net))}
        </div>
        <div style={{ textAlign:'right', fontSize:11, fontWeight:600, color: day.running < 0 ? '#dc2626' : '#475569', fontVariantNumeric:'tabular-nums', whiteSpace:'nowrap', minWidth:88 }}>
          คงเหลือ {fmtMoney(day.running)}
        </div>
      </div>

      {/* Items — shown when open */}
      {open && (
        <div style={{ background:'#fafbff', padding:'2px 14px 8px 34px' }}>
          {day.items.map((it, i) => {
            const inflow  = it.signed >= 0;
            const tag = it.kind === 'forecast' ? { t:'ประมาณการ', bg:'#ede9fe', c:'#6b21a8' }
                      : it.kind === 'transfer' ? { t:'โอน',       bg:'#fae8ff', c:'#86198f' }
                      : { t:'เช็ค', bg:'#e0f2fe', c:'#075985' };
            return (
              <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:'0 8px', padding:'5px 0', borderTop: i ? '1px dashed #e9e9f3' : 'none' }}>
                <div>
                  <div style={{ fontSize:12, color:'#1e293b' }}>
                    <span style={{ display:'inline-block', fontSize:9, fontWeight:700, borderRadius:4, padding:'0 5px', marginRight:5,
                      background: tag.bg, color: tag.c }}>
                      {tag.t}
                    </span>
                    {it.title}
                  </div>
                  <div style={{ fontSize:10, color:'#94a3b8' }}>{it.sub}</div>
                </div>
                <div style={{ textAlign:'right', fontWeight:600, fontSize:12, color: inflow ? '#276749' : '#c53030', fontVariantNumeric:'tabular-nums', whiteSpace:'nowrap' }}>
                  {inflow ? '+' : '−'}{fmtMoney(Math.abs(it.signed))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Account Card — ยอดเงินจริง + เช็ค/ประมาณการแยกตามวัน ───────────── */
function BankAccountCard({ view, today, periodEnd, periodLabel, onQuickTransfer, canEdit }) {
  const [expanded, setExpanded] = React.useState(true);
  const [showAll, setShowAll]   = React.useState(false);
  const { acct, base, dayGroups, near, afterNear, shortNear, shortBy, dueToday, dueTodayOut, overdue } = view;

  const visibleGroups = showAll ? dayGroups : dayGroups.filter(g => g.date <= periodEnd);
  const hiddenCount   = dayGroups.length - visibleGroups.length;

  // สรุปยอดตาม "ช่วงที่กำลังดู" (ไม่ใช่ทั้งหมด) — ถ้ากดดูทั้งหมดก็สรุปทั้งหมด
  const visItems = visibleGroups.reduce((a, g) => a.concat(g.items), []);
  const visCount = visItems.length;
  const visIn    = visItems.filter(i => i.signed > 0).reduce((s, i) => s + i.signed, 0);
  const visOut   = visItems.filter(i => i.signed < 0).reduce((s, i) => s - i.signed, 0);

  const headerBg = shortNear ? 'linear-gradient(135deg,#fff5f5,#fed7d7)'
                 : dueToday.length ? 'linear-gradient(135deg,#fffbeb,#fef3c7)'
                 : 'linear-gradient(135deg,#ebf8ff,#dbeafe)';

  return (
    <div className="card" style={{
      padding:0, overflow:'hidden',
      border: shortNear ? '2px solid #fc8181' : '1px solid #e2e8f0',
      boxShadow: shortNear ? '0 0 0 3px rgba(252,129,129,0.15)' : undefined,
    }}>
      {/* Header */}
      <div style={{ background:headerBg, padding:'12px 16px', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}
           onClick={() => setExpanded(e => !e)}>
        <div style={{ minWidth:0 }}>
          <div style={{ fontWeight:700, fontSize:14, color:'#1a202c' }}>
            {acct.bankName || 'บัญชี'}
            {shortNear && <span style={{ marginLeft:8, fontSize:11, background:'#e53e3e', color:'#fff', borderRadius:4, padding:'1px 6px' }}>⚠ เงินไม่พอใน 7 วัน</span>}
          </div>
          <div style={{ fontSize:12, color:'#4a5568', marginTop:2, fontFamily:'ui-monospace' }}>{acct.accountNo || '—'}</div>
          {(acct.accountName || acct.note) && <div style={{ fontSize:11, color:'#718096' }}>{acct.accountName || acct.note}</div>}
        </div>
        <div style={{ textAlign:'right', whiteSpace:'nowrap' }}>
          <div style={{ fontSize:11, color:'#718096' }}>ยอดเงินจริง</div>
          <div style={{ fontWeight:700, fontSize:16, color: base < 0 ? '#e53e3e' : '#1a4490' }}>{fmtMoney(base)}</div>
          {acct.available != null && acct.available !== acct.balance && (
            <div style={{ fontSize:10, color:'#94a3b8', marginTop:1 }}>ใช้ได้ {fmtMoney(acct.available)}</div>
          )}
          {acct.hold != null && acct.hold > 0 && (
            <div style={{ fontSize:10, color:'#a16207' }}>อายัด/ค้ำ {fmtMoney(acct.hold)}</div>
          )}
        </div>
      </div>

      {/* Alert strip */}
      {(dueToday.length > 0 || overdue.length > 0 || near.length > 0) && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:6, padding:'8px 14px', background:'#fff', borderBottom:'1px solid #f0f4f8' }}>
          {dueToday.length > 0 && (
            <span style={{ background:'#fee2e2', color:'#991b1b', fontSize:11, fontWeight:700, borderRadius:6, padding:'3px 9px' }}>
              📅 ครบกำหนดวันนี้ {dueToday.length} รายการ · {fmtMoney(dueTodayOut)}
            </span>
          )}
          {near.length > 0 && (
            <span style={{ background:'#fef3c7', color:'#92400e', fontSize:11, fontWeight:700, borderRadius:6, padding:'3px 9px' }}>
              📆 ภายใน 7 วัน {near.length} รายการ
            </span>
          )}
          {overdue.length > 0 && (
            <span style={{ background:'#fae8ff', color:'#86198f', fontSize:11, fontWeight:700, borderRadius:6, padding:'3px 9px' }}>
              ⏰ เลยกำหนดยังไม่เคลียร์ {overdue.length} ฉบับ
            </span>
          )}
        </div>
      )}

      {/* Body */}
      {expanded && (
        <div>
          {/* Summary — สรุปตามช่วงที่กำลังดู */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 14px', fontSize:12, color:'#475569', borderBottom:'1px solid #f0f4f8' }}>
            <span>{showAll ? 'ทั้งหมด' : '“' + periodLabel + '”'} <b>{visCount}</b> รายการ</span>
            <span>
              {visIn > 0 && <span style={{ color:'#276749', marginRight:8 }}>รับ +{fmtMoney(visIn)}</span>}
              <span style={{ color:'#c53030' }}>จ่าย −{fmtMoney(visOut)}</span>
            </span>
          </div>

          {/* Day groups (default = ตามช่วงเวลาที่เลือก) */}
          {dayGroups.length === 0 ? (
            <div style={{ textAlign:'center', color:'#a0aec0', fontSize:12, padding:'14px 0' }}>ไม่มีรายการในบัญชีนี้</div>
          ) : visibleGroups.length === 0 ? (
            <div style={{ textAlign:'center', color:'#a0aec0', fontSize:12, padding:'12px 0' }}>ไม่มีรายการในช่วง “{periodLabel}”</div>
          ) : (
            visibleGroups.map(day => <BDDayGroup key={day.date} day={day} today={today} />)
          )}
          {(hiddenCount > 0 || (showAll && dayGroups.length > 0)) && (
            <button onClick={() => setShowAll(s => !s)}
              style={{ width:'100%', background:'#f8fafc', border:'none', borderBottom:'1px solid #f0f4f8', padding:'7px 14px', fontSize:11, fontWeight:600, color:'#2a6fdb', cursor:'pointer', fontFamily:'inherit' }}>
              {showAll ? `▴ ย่อ (เฉพาะช่วง “${periodLabel}”)` : `▾ ดูทั้งหมด (อีก ${hiddenCount} วัน)`}
            </button>
          )}

          {/* 7-day actionable footer */}
          <div style={{
            display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 14px',
            background: shortNear ? '#fff5f5' : '#f0fdf4',
            borderTop:'2px solid ' + (shortNear ? '#fc8181' : '#68d391'),
            fontWeight:700, fontSize:13,
          }}>
            <span>{near.length > 0 ? 'เงินคงเหลือหลังรายการใน 7 วัน' : 'ไม่มีรายการใน 7 วัน'}</span>
            {near.length > 0 && <span style={{ color: shortNear ? '#e53e3e' : '#276749' }}>{fmtMoney(afterNear)}</span>}
          </div>

          {/* Quick transfer when short near-term */}
          {shortNear && canEdit && (
            <div style={{ padding:'10px 14px', background:'#fff5f5', borderTop:'1px dashed #fecaca', display:'flex', justifyContent:'space-between', alignItems:'center', gap:10 }}>
              <span style={{ fontSize:11, color:'#b91c1c' }}>ต้องเติมเงินอีกประมาณ <b>{fmtMoney(shortBy)}</b> ก่อนรายการครบกำหนด</span>
              <button onClick={() => onQuickTransfer(acct.accountNo)}
                style={{ background:'linear-gradient(135deg,#2a6fdb,#1a4490)', color:'#fff', border:'none', borderRadius:7, padding:'6px 12px', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>
                ⇄ โอนเข้าบัญชีนี้
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Forecast Modal — เพิ่ม/แก้ไขรายการประมาณการ ────────────────────── */
function ForecastModal({ bankAccounts, today, initial, onSave, onClose, onDelete, canDelete }) {
  const isEdit = !!(initial && initial.id);
  const raw    = (initial && initial.raw) || {};
  const [form, setForm] = React.useState({
    payDate:     (initial && (initial.payDate || initial.date)) || today,
    dir:         (initial && initial.amount != null) ? (initial.amount < 0 ? 'out' : 'in') : 'out',
    amount:      (initial && initial.planAmount != null) ? String(Math.abs(initial.planAmount)) : '',
    description: (initial && initial.desc) || '',
    bankAc:      (initial && initial.bankAc) || '',
    note:        (raw.NOTE || '') ,
  });
  const [err, setErr] = React.useState('');
  const setF = (k, v) => { setErr(''); setForm(prev => ({ ...prev, [k]: v })); };

  const handleSave = () => {
    const amt = parseFloat(form.amount);
    if (!form.payDate)            return setErr('กรุณาเลือกวันที่');
    if (!amt || amt <= 0)         return setErr('กรุณาระบุจำนวนเงินที่ถูกต้อง');
    if (!form.description.trim()) return setErr('กรุณาระบุรายละเอียด');
    const signed = (form.dir === 'out' ? -1 : 1) * Math.abs(amt);
    if (isEdit) {
      // คงค่าฟิลด์เดิมทั้งหมด (เช่น ACTUAL_*) แล้วทับเฉพาะที่แก้
      onSave(Object.assign({}, raw, {
        id: initial.id, PAYMENT_DATE: form.payDate, AMOUNT: String(signed),
        DESCRIPTION: form.description.trim(), Bank_AC: form.bankAc || null, NOTE: form.note.trim() || null,
      }), true);
    } else {
      const id = (window.WTPData && WTPData.newId) ? WTPData.newId() : ('fe-' + Date.now());
      onSave({
        id, DATE: today, PAYMENT_DATE: form.payDate, EXPENSE_TYPE: 'Manual',
        DESCRIPTION: form.description.trim(), JOB_NO: null, PROJECT_NAME: null,
        AMOUNT: String(signed), Bank_AC: form.bankAc || null, STATUS: 'PLANNED',
        CATEGORY: null, IS_ACCRUED: null, NOTE: form.note.trim() || null,
        ACTUAL_AMOUNT: null, ACTUAL_DATE: null, REF_DOC: null, BOOKED_AT: null, CFS_ACTIVITY: null,
      }, false);
    }
  };

  const inp = { width:'100%', padding:'8px 11px', boxSizing:'border-box', border:'1.5px solid #e2e8f0', borderRadius:8, fontSize:13, fontFamily:'inherit', outline:'none' };
  const lbl = { fontSize:12, fontWeight:600, color:'#475569', marginBottom:4, display:'block' };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.45)', zIndex:9000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }} onClick={onClose}>
      <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:480, maxHeight:'calc(100vh - 32px)', display:'flex', flexDirection:'column', boxShadow:'0 24px 64px rgba(0,0,0,0.18)', overflow:'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={{ flexShrink:0, padding:'16px 20px', background:'linear-gradient(135deg,#eef2ff,#e0e7ff)', borderBottom:'1px solid #c7d2fe', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontWeight:700, fontSize:15, color:'#3730a3' }}>{isEdit ? '✏️ แก้ไขรายการประมาณการ' : '➕ เพิ่มรายการประมาณการ'}</div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', fontSize:18, color:'#6366f1', lineHeight:1, padding:'0 4px' }}>✕</button>
        </div>
        <div style={{ padding:20, overflowY:'auto', flex:1, minHeight:0 }}>
          {isEdit && initial.isActual && (
            <div style={{ marginBottom:12, padding:'8px 12px', background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:7, fontSize:11, color:'#166534' }}>
              ✓ รายการนี้ตัด PV/จ่ายจริงแล้ว (ยอดจริง {fmtMoney(Math.abs(initial.amount))}) — แก้ที่นี่จะแก้เฉพาะ “ค่าประมาณการ”
            </div>
          )}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px 14px' }}>
            <div>
              <label style={lbl}>ประเภท *</label>
              <div style={{ display:'flex', gap:8 }}>
                {[{ k:'out', t:'จ่าย', c:'#c53030' }, { k:'in', t:'รับ', c:'#276749' }].map(o => (
                  <button key={o.k} onClick={() => setF('dir', o.k)}
                    style={{ flex:1, padding:'8px 0', borderRadius:8, border:'1.5px solid ' + (form.dir===o.k ? o.c : '#e2e8f0'),
                             background: form.dir===o.k ? o.c : '#fff', color: form.dir===o.k ? '#fff' : '#475569',
                             fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                    {o.t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={lbl}>วันที่คาดเงินเคลื่อน *</label>
              <input type="date" style={inp} value={form.payDate} onChange={e => setF('payDate', e.target.value)} />
            </div>
            <div>
              <label style={lbl}>จำนวนเงิน (บาท) *</label>
              <input type="number" style={inp} value={form.amount} min="0" step="0.01" placeholder="0.00" onChange={e => setF('amount', e.target.value)} />
            </div>
            <div>
              <label style={{ ...lbl, color:'#4338ca' }}>บัญชี (Bank_AC)</label>
              <select style={{ ...inp, background:'#fff', borderColor:'#c7d2fe' }} value={form.bankAc} onChange={e => setF('bankAc', e.target.value)}>
                <option value="">— ไม่ระบุ (รวมบริษัท) —</option>
                {bankAccounts.map((a, i) => <option key={i} value={a.accountNo}>{a.bankName} — {a.accountNo}</option>)}
              </select>
            </div>
            <div style={{ gridColumn:'1/-1' }}>
              <label style={lbl}>รายละเอียด *</label>
              <input type="text" style={inp} value={form.description} placeholder="เช่น คาดรับเงินงวด / จ่ายเงินเดือน" onChange={e => setF('description', e.target.value)} />
            </div>
            <div style={{ gridColumn:'1/-1' }}>
              <label style={lbl}>หมายเหตุ</label>
              <input type="text" style={inp} value={form.note} onChange={e => setF('note', e.target.value)} />
            </div>
          </div>
          {err ? <div style={{ marginTop:10, padding:'8px 12px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:7, fontSize:12, color:'#dc2626' }}>⚠ {err}</div> : null}
          <div style={{ marginTop:18, display:'flex', gap:10, justifyContent: isEdit && onDelete && canDelete ? 'space-between' : 'flex-end', alignItems:'center' }}>
            {isEdit && onDelete && canDelete && (
              <button onClick={() => onDelete(initial.id)} style={{ padding:'8px 14px', borderRadius:8, border:'1.5px solid #fecaca', background:'#fff', color:'#dc2626', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>ลบรายการ</button>
            )}
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={onClose} style={{ padding:'8px 18px', borderRadius:8, border:'1.5px solid #e2e8f0', background:'#fff', color:'#475569', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>ยกเลิก</button>
              <button onClick={handleSave} style={{ padding:'8px 20px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#6366f1,#4338ca)', color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit', boxShadow:'0 4px 12px rgba(99,102,241,0.3)' }}>บันทึก</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Forecast Panel — ประมาณการกระแสเงินสด (รวมทุกบัญชี) ───────────── */
function BDForecastPanel({ forecasts, periodEnd, periodLabel, today, totalRealBalance, onAdd, onEdit, canEdit }) {
  const rows = React.useMemo(
    () => forecasts.filter(f => f.date && f.date >= today && f.date <= periodEnd).sort((a, b) => a.date < b.date ? -1 : 1),
    [forecasts, periodEnd, today]
  );
  const inflow  = rows.filter(r => r.amount > 0).reduce((s, r) => s + r.amount, 0);
  const outflow = rows.filter(r => r.amount < 0).reduce((s, r) => s - r.amount, 0);
  const net     = inflow - outflow;
  const projected = totalRealBalance + net;

  return (
    <div className="card" style={{ padding:0, overflow:'hidden', marginBottom:20 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px', background:'linear-gradient(135deg,#eef2ff,#e0e7ff)', borderBottom:'1px solid #c7d2fe' }}>
        <div>
          <div style={{ fontWeight:700, fontSize:14, color:'#3730a3' }}>📊 ประมาณการกระแสเงินสด</div>
          <div style={{ fontSize:12, color:'#4f46e5', marginTop:2 }}>ช่วง “{periodLabel}” · {rows.length} รายการ</div>
        </div>
        {canEdit && (
          <button onClick={onAdd} style={{ background:'#4338ca', color:'#fff', border:'none', borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:6 }}>
            ➕ เพิ่มประมาณการ
          </button>
        )}
      </div>

      {/* Summary tiles */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))', gap:1, background:'#eef0f6' }}>
        {[
          { l:'เงินจริงตอนนี้', v:totalRealBalance, c:'#1a4490' },
          { l:'คาดรับ (ช่วงนี้)', v:inflow, c:'#276749' },
          { l:'คาดจ่าย (ช่วงนี้)', v:-outflow, c:'#c53030' },
          { l:'เงินสดคาดการณ์สิ้นช่วง', v:projected, c: projected < 0 ? '#dc2626' : '#1a4490', bold:true },
        ].map((t, i) => (
          <div key={i} style={{ background:'#fff', padding:'10px 14px' }}>
            <div style={{ fontSize:11, color:'#718096' }}>{t.l}</div>
            <div style={{ fontSize: t.bold ? 16 : 14, fontWeight:700, color:t.c, fontVariantNumeric:'tabular-nums' }}>{fmtMoney(t.v)}</div>
          </div>
        ))}
      </div>

      {/* Rows */}
      <div style={{ overflowX:'auto' }}>
        <table className="tbl" style={{ minWidth:720, fontSize:12 }}>
          <thead>
            <tr>
              <th style={{ width:90 }}>วันที่</th>
              <th>รายการ</th>
              <th style={{ width:120 }}>บัญชี</th>
              <th style={{ width:110 }}>สถานะ</th>
              <th style={{ textAlign:'right', width:130 }}>จำนวนเงิน</th>
              {canEdit && <th style={{ width:44 }}></th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={canEdit ? 6 : 5} style={{ textAlign:'center', color:'#a0aec0', padding:'16px 0' }}>ไม่มีรายการประมาณการในช่วงนี้</td></tr>
            ) : rows.map(r => (
              <tr key={r.id}
                  onClick={canEdit ? () => onEdit(r) : undefined}
                  style={{ cursor: canEdit ? 'pointer' : 'default' }}
                  title={canEdit ? 'กดเพื่อแก้ไข / เปลี่ยนบัญชี' : undefined}>
                <td style={{ whiteSpace:'nowrap' }}>{fmtDate(r.date)}</td>
                <td>
                  {r.desc}
                  {r.isActual && r.actualAmount != null && r.actualAmount !== Math.abs(r.planAmount) && (
                    <span style={{ marginLeft:6, fontSize:10, color:'#94a3b8' }}>(ประมาณการ {fmtMoney(Math.abs(r.planAmount))})</span>
                  )}
                </td>
                <td style={{ fontFamily:'ui-monospace', fontSize:11, color: r.bankAc ? '#64748b' : '#cbd5e1' }}>{r.bankAc || 'ไม่ระบุ'}</td>
                <td>
                  {r.isActual
                    ? <span style={{ background:'#c6f6d5', color:'#276749', fontSize:11, fontWeight:600, borderRadius:12, padding:'2px 9px' }}>✓ จ่าย/รับจริง</span>
                    : <span style={{ background:'#e9d8fd', color:'#6b21a8', fontSize:11, fontWeight:600, borderRadius:12, padding:'2px 9px' }}>ประมาณการ</span>
                  }
                </td>
                <td style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', fontWeight:700, color: r.amount >= 0 ? '#276749' : '#c53030', whiteSpace:'nowrap' }}>
                  {r.amount >= 0 ? '+' : '−'}{fmtMoney(Math.abs(r.amount))}
                </td>
                {canEdit && (
                  <td style={{ textAlign:'center', color:'#6366f1' }}>
                    <span style={{ fontSize:14 }}>✏️</span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────────────────────── */
const BankDiaryPage = ({ data: propData, setData, toast }) => {
  const raw = propData || WTPData.load();
  const { bankAccounts: rawAccounts = [], bankEntries = [], bankTransfers = [], checks: rawChecks = [], forecastEntries: rawForecast = [] } = raw;
  const today = new Date().toISOString().slice(0, 10);
  const next7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const [showAddTransfer, setShowAddTransfer] = React.useState(false);
  const [transferTo, setTransferTo]           = React.useState('');
  const [editTransfer, setEditTransfer]       = React.useState(null);
  const [showAddForecast, setShowAddForecast] = React.useState(false);
  const [editForecast, setEditForecast]       = React.useState(null);
  const [period, setPeriod]                   = React.useState('thisMonth');

  const periodEnd   = bdPeriodEnd(today, period);
  const periodLabel = (BD_PERIODS.find(p => p.key === period) || {}).label || '';

  const canEdit   = window.WTPAuth ? window.WTPAuth.can('canEdit')   : true;
  const canDelete = window.WTPAuth ? window.WTPAuth.can('canDelete') : true;

  /* Normalize accounts (รองรับชื่อ field จาก Sheet) */
  const accounts = React.useMemo(() => rawAccounts.map(bdAcct), [rawAccounts]);

  /* Normalize checks + attach status code */
  const checks = React.useMemo(
    () => rawChecks.map(c => ({ ...c, _st: bdCheckStatus(c.status) })),
    [rawChecks]
  );

  /* Match checks → accounts (เลขบัญชี รองรับเลข 4 ตัวท้าย) */
  const { checksByAccount, unmatchedOutstanding } = React.useMemo(() => {
    const byAcct = {};
    accounts.forEach(a => { byAcct[a.accountNo] = []; });
    const unmatched = [];
    checks.forEach(c => {
      const hit = accounts.find(a => bdAcctMatchesCheck(a.accountNo, c.accountNo));
      if (hit) byAcct[hit.accountNo].push(c);
      else if (bdIsOutstanding(c._st)) unmatched.push(c);
    });
    return { checksByAccount: byAcct, unmatchedOutstanding: unmatched };
  }, [accounts, checks]);

  /* Normalize forecast + match → accounts (ที่มี Bank_AC) */
  const forecasts = React.useMemo(() => rawForecast.map(bdNormForecast), [rawForecast]);
  const forecastByAccount = React.useMemo(() => {
    const byAcct = {};
    accounts.forEach(a => { byAcct[a.accountNo] = []; });
    forecasts.forEach(f => {
      if (!f.bankAc) return;
      const hit = accounts.find(a => bdAcctMatchesCheck(a.accountNo, f.bankAc));
      if (hit) byAcct[hit.accountNo].push(f);
    });
    return byAcct;
  }, [accounts, forecasts]);

  /* Pair up transfer entries by transferRef (จาก bankEntries ที่บันทึกโอนเอง) */
  const transferPairs = React.useMemo(() => {
    const pairs = {};
    bankEntries.forEach(e => {
      if (!e.transferRef) return;
      if (!pairs[e.transferRef]) pairs[e.transferRef] = [];
      pairs[e.transferRef].push(e);
    });
    return pairs;
  }, [bankEntries]);

  /* Group manual transfer entries → accounts (โผล่ในการ์ด BANK) */
  const transfersByAccount = React.useMemo(() => {
    const byAcct = {};
    accounts.forEach(a => { byAcct[a.accountNo] = []; });
    bankEntries.forEach(e => {
      if (e.entryType !== 'outflow_transfer' && e.entryType !== 'inflow_transfer') return;
      const hit = accounts.find(a => bdAcctMatchesCheck(a.accountNo, e.accountNo));
      if (hit) byAcct[hit.accountNo].push(e);
    });
    return byAcct;
  }, [accounts, bankEntries]);

  /* Per-account views (เช็ค + forecast + การโอน + สัญญาณเงินไม่พอ 7 วัน) */
  const accountViews = React.useMemo(
    () => accounts.map(a => bdBuildAccountView(a, checksByAccount[a.accountNo] || [], forecastByAccount[a.accountNo] || [], transfersByAccount[a.accountNo] || [], today, next7)),
    [accounts, checksByAccount, forecastByAccount, transfersByAccount, today, next7]
  );

  /* ── Totals across all accounts ── */
  const totalBalance     = accounts.reduce((s, a) => s + a.balance, 0);
  const totalAvailable   = accounts.reduce((s, a) => s + (a.available != null ? a.available : a.balance), 0);
  const shortAccounts    = accountViews.filter(v => v.shortNear).length;
  // ยอดจ่ายรวมเฉพาะช่วงที่เลือก (KPI)
  const periodOut = accountViews.reduce(
    (s, v) => s + v.items.filter(i => i.signed < 0 && i.date <= periodEnd).reduce((a, i) => a - i.signed, 0),
    0
  );
  // ข้อมูลต่อบัญชีสำหรับจำลองการโอน (modal คำนวณภาระจ่ายตามช่วงของตัวเองได้)
  const acctData = React.useMemo(() => {
    const m = {};
    accountViews.forEach(v => {
      m[v.acct.accountNo] = { base: v.base, bankName: v.acct.bankName, items: v.items.map(i => ({ date: i.date, signed: i.signed, ref: i.ref || '' })) };
    });
    return m;
  }, [accountViews]);

  /* Add/Edit Transfer handler — สร้าง/แทนที่ 2 bankEntries (out+in) ของ transferRef เดียวกัน */
  const handleSaveTransfer = (newEntries, isEdit) => {
    if (setData) {
      setData(prev => {
        let list = prev.bankEntries || [];
        if (isEdit) { const ref = newEntries[0] && newEntries[0].transferRef; list = list.filter(e => e.transferRef !== ref); }
        return { ...prev, bankEntries: [...list, ...newEntries] };
      });
      if (toast) toast(isEdit ? 'แก้ไขการโอนแล้ว ✓' : 'บันทึกการโอนเงินเรียบร้อย');
    }
    setShowAddTransfer(false);
    setTransferTo('');
    setEditTransfer(null);
  };

  /* Delete a transfer (both legs) */
  const handleDeleteTransfer = (ref) => {
    if (!window.confirm('ลบรายการโอนนี้?')) return;
    if (setData) {
      setData(prev => ({ ...prev, bankEntries: (prev.bankEntries || []).filter(e => e.transferRef !== ref) }));
      if (toast) toast('ลบรายการโอนแล้ว');
    }
    setEditTransfer(null);
  };

  /* Reconcile handler — marks both legs of a pair as reconciled */
  const handleReconcile = (ref) => {
    if (!setData) return;
    setData(prev => ({
      ...prev,
      bankEntries: (prev.bankEntries || []).map(e =>
        e.transferRef === ref ? { ...e, reconciled: true } : e
      ),
    }));
    if (toast) toast(`Reconcile ${ref} เรียบร้อย ✓`);
  };

  const openQuickTransfer = (toAccountNo) => { setTransferTo(toAccountNo); setShowAddTransfer(true); };

  /* Add/Edit Forecast handler — append or replace by id */
  const handleSaveForecast = (row, isEdit) => {
    if (setData) {
      setData(prev => {
        const list = prev.forecastEntries || [];
        const next = isEdit ? list.map(e => (e.id === row.id ? row : e)) : [...list, row];
        return { ...prev, forecastEntries: next };
      });
      if (toast) toast(isEdit ? 'แก้ไขรายการประมาณการแล้ว ✓' : 'เพิ่มรายการประมาณการเรียบร้อย');
    }
    setShowAddForecast(false);
    setEditForecast(null);
  };

  /* Delete a forecast row */
  const handleDeleteForecast = (id) => {
    if (!window.confirm('ลบรายการประมาณการนี้?')) return;
    if (setData) {
      setData(prev => ({ ...prev, forecastEntries: (prev.forecastEntries || []).filter(e => e.id !== id) }));
      if (toast) toast('ลบรายการประมาณการแล้ว');
    }
    setEditForecast(null);
  };

  /* Export rows — เช็คค้างจ่ายทุกบัญชี */
  const exportRows = React.useMemo(() => {
    const rows = [];
    accounts.forEach(a => {
      (checksByAccount[a.accountNo] || []).filter(c => bdIsOutstanding(c._st)).forEach(c => {
        rows.push({ bankName:a.bankName, accountNo:a.accountNo, checkDate:c.checkDate, payee:c.payee, checkNo:c.checkNo, amount:bdNum(c.amount), referenceNo:c.referenceNo, status:c.status });
      });
    });
    return rows.sort((x, y) => (x.checkDate || '') < (y.checkDate || '') ? -1 : 1);
  }, [accounts, checksByAccount]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-title">Bank Diary</div>
          <div className="page-sub">ยอดเงินจริงแยกตามบัญชี + เช็ค/ประมาณการ เพื่อวางแผนกระแสเงินสดและโอนระหว่างบัญชี • ณ {fmtDate(today)}</div>
        </div>
        <div className="page-head-r">
        <ExportButton
          rows={exportRows}
          columns={[
            { key: 'bankName',   label: 'ธนาคาร' },
            { key: 'accountNo',  label: 'เลขที่บัญชี' },
            { key: 'checkDate',  label: 'วันที่ครบกำหนด', type: 'date' },
            { key: 'payee',      label: 'ผู้รับ' },
            { key: 'checkNo',    label: 'เลขที่เช็ค' },
            { key: 'amount',     label: 'จำนวนเงิน (฿)', type: 'number' },
            { key: 'referenceNo',label: 'อ้างอิง' },
            { key: 'status',     label: 'สถานะ' },
          ]}
          filename="bank_diary_outstanding"
          sheetName="Bank Diary"
          title="Bank Diary · เช็คค้างจ่ายแยกตามบัญชี"
        />
        <PrintButton />
        {canEdit && (
        <button
          className="btn-primary"
          onClick={() => { setTransferTo(''); setShowAddTransfer(true); }}
          style={{ display:'flex', alignItems:'center', gap:7 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
          บันทึกการโอน
        </button>
        )}
        </div>
      </div>

      {/* Top KPIs */}
      <div className="grid grid-4 anim-stagger" style={{ marginBottom:16 }}>
        <KpiTile label="ยอดเงินจริงรวม"      value={totalBalance}     accent="var(--brand-500)"                                  icon="bank"  animate={false} />
        <KpiTile label="ยอดเงินใช้ได้รวม"   value={totalAvailable}   accent="oklch(52% 0.16 185)"                               icon="coin"  animate={false} />
        <KpiTile label={`จ่ายในช่วง “${periodLabel}”`} value={periodOut} accent={periodOut > 0 ? 'oklch(60% 0.18 55)' : 'var(--good)'} icon="money" animate={false} />
        <KpiTile label="บัญชีเงินไม่พอ"      value={shortAccounts}    accent={shortAccounts > 0 ? 'var(--bad)' : 'var(--good)'}  unit=" บัญชี" digits={0} icon="arrow_up" animate={false} />
      </div>

      {/* Period selector — คุมทั้งเช็คในการ์ดและพาเนลประมาณการ */}
      <div style={{ display:'flex', flexWrap:'wrap', alignItems:'center', gap:8, marginBottom:16 }}>
        <span style={{ fontSize:12, fontWeight:600, color:'#64748b' }}>ช่วงเวลา:</span>
        {BD_PERIODS.map(p => (
          <button key={p.key} onClick={() => setPeriod(p.key)}
            style={{
              padding:'6px 13px', borderRadius:20, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit',
              border:'1.5px solid ' + (period === p.key ? '#2a6fdb' : '#e2e8f0'),
              background: period === p.key ? '#2a6fdb' : '#fff',
              color: period === p.key ? '#fff' : '#475569',
            }}>
            {p.label}
          </button>
        ))}
        {period !== 'all' && (
          <span style={{ fontSize:11, color:'#94a3b8' }}>(ถึง {fmtDate(periodEnd)})</span>
        )}
      </div>

      {/* Reconcile Panel — only when there are manual transfers */}
      <ReconcilePanel
        transferPairs={transferPairs}
        bankAccounts={accounts}
        onReconcile={handleReconcile}
        onEdit={(obj) => setEditTransfer(obj)}
        canEdit={canEdit}
      />

      {/* No accounts fallback */}
      {accounts.length === 0 && (
        <div className="card" style={{ padding:'28px 16px', textAlign:'center', color:'#94a3b8', marginBottom:20 }}>
          ยังไม่มีข้อมูลบัญชีธนาคาร — ตรวจสอบชีต <b>bankAccounts</b>
        </div>
      )}

      {/* Account Cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(360px, 1fr))', gap:14, marginBottom:20 }}>
        {accountViews.map(view => (
          <BankAccountCard
            key={view.acct.id || view.acct.accountNo}
            view={view}
            today={today}
            periodEnd={periodEnd}
            periodLabel={periodLabel}
            onQuickTransfer={openQuickTransfer}
            canEdit={canEdit}
          />
        ))}
      </div>

      {/* Forecast panel — ประมาณการกระแสเงินสด (รวมทุกบัญชี) */}
      <BDForecastPanel
        forecasts={forecasts}
        periodEnd={periodEnd}
        periodLabel={periodLabel}
        today={today}
        totalRealBalance={totalBalance}
        onAdd={() => { setEditForecast(null); setShowAddForecast(true); }}
        onEdit={(r) => setEditForecast(r)}
        canEdit={canEdit}
      />

      {/* Unmatched outstanding checks (จับคู่บัญชีไม่ได้) */}
      {unmatchedOutstanding.length > 0 && (
        <div className="card" style={{ padding:0, overflow:'hidden', marginBottom:20 }}>
          <div style={{ padding:'10px 16px', borderBottom:'1px solid var(--line)', background:'#fffbeb' }}>
            <div style={{ fontWeight:700, fontSize:13, color:'#92400e' }}>
              เช็คค้างจ่ายที่ยังจับคู่บัญชีไม่ได้
              <span style={{ marginLeft:8, fontSize:11, color:'#b45309', fontWeight:400 }}>
                {unmatchedOutstanding.length} ฉบับ · ตรวจสอบเลขบัญชีในชีต checks
              </span>
            </div>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table className="tbl" style={{ minWidth:760, fontSize:12 }}>
              <thead>
                <tr>
                  <th style={{ width:90 }}>วันที่</th>
                  <th style={{ width:110 }}>เลขบัญชี</th>
                  <th>ผู้รับ</th>
                  <th style={{ width:100 }}>เลขที่เช็ค</th>
                  <th style={{ textAlign:'right', width:120 }}>จำนวนเงิน</th>
                </tr>
              </thead>
              <tbody>
                {[...unmatchedOutstanding].sort((a, b) => (a.checkDate || '') < (b.checkDate || '') ? -1 : 1).map(c => (
                  <tr key={c.id}>
                    <td style={{ whiteSpace:'nowrap' }}>{fmtDate(c.checkDate) || '—'}</td>
                    <td style={{ fontFamily:'ui-monospace', fontSize:11 }}>{c.accountNo || '—'}</td>
                    <td>{c.payee || '—'}</td>
                    <td style={{ fontFamily:'ui-monospace', fontSize:11 }}>{c.checkNo || '—'}</td>
                    <td style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', fontWeight:600, color:'#c53030' }}>{fmtMoney(bdNum(c.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Historical bank transfers (from RAW_BANK_TRANSFER import) ── */}
      {bankTransfers.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--line)', background: '#fafbfc' }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink-700)' }}>
              ประวัติการโอนระหว่างบัญชี (จากระบบ)
              <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--ink-400)', fontWeight: 400 }}>
                {bankTransfers.length} รายการ
              </span>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl" style={{ minWidth: 1100, fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ width: 90 }}>วันที่</th>
                  <th style={{ width: 110 }}>PV No.</th>
                  <th>ผู้รับ</th>
                  <th style={{ width: 100 }}>Document No.</th>
                  <th style={{ width: 90 }}>เลขที่เช็ค</th>
                  <th style={{ width: 130 }}>บัญชี (Bank_AC)</th>
                  <th style={{ textAlign: 'right', width: 120 }}>ยอดเงิน</th>
                  <th style={{ minWidth: 220 }}>หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                {[...bankTransfers]
                  .sort((a, b) => (b.paydate || '').localeCompare(a.paydate || ''))
                  .map(t => (
                    <tr key={t.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(t.paydate) || '—'}</td>
                      <td style={{ fontFamily: 'ui-monospace', fontSize: 11 }}>{t.PL_PV_No || '—'}</td>
                      <td>{t.Payee || '—'}</td>
                      <td style={{ fontFamily: 'ui-monospace', fontSize: 11 }}>{t.Document_No || '—'}</td>
                      <td style={{ fontFamily: 'ui-monospace', fontSize: 11 }}>{t.Chq_No || '—'}</td>
                      <td style={{ fontFamily: 'ui-monospace', fontSize: 11 }}>{t.Bank_AC || '—'}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600,
                                   color: 'var(--brand-700)' }}>
                        {fmtMoney(t.Net_Amount)}
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--ink-500)' }}>{t.remark || ''}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Transfer Modal */}
      {(showAddTransfer || editTransfer) && (
        <AddTransferModal
          bankAccounts={accounts}
          initialTo={transferTo}
          initial={editTransfer}
          onDelete={handleDeleteTransfer}
          canDelete={canDelete}
          acctData={acctData}
          initialPeriod={period}
          onSave={handleSaveTransfer}
          onClose={() => { setShowAddTransfer(false); setTransferTo(''); setEditTransfer(null); }}
        />
      )}

      {/* Add / Edit Forecast Modal */}
      {(showAddForecast || editForecast) && (
        <ForecastModal
          bankAccounts={accounts}
          today={today}
          initial={editForecast}
          onSave={handleSaveForecast}
          onDelete={handleDeleteForecast}
          canDelete={canDelete}
          onClose={() => { setShowAddForecast(false); setEditForecast(null); }}
        />
      )}
    </div>
  );
};
