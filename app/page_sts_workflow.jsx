/* page_sts_workflow.jsx — STS Workflow
   จับคู่ receipts (รับเงินจากราชการ) ↔ debtMaster (สัญญา STS)
   คำนวณดอกเบี้ย + ค่าบริการเอนคอมพาส (สุทธิหลังหักดอกเบี้ย STS)
   แสดง queue ของรายการที่รอ review + รายการที่ตรวจแล้ว
*/
'use strict';

// Defaults from sample 118.ENC132 contract
const DEFAULT_MGMT_FEE_RATE = 0.065;
const DEFAULT_STS_INT_RATE  = 0.15;
const DEFAULT_WHT_MGMT      = 0.03;
const DEFAULT_WHT_INTEREST  = 0.01;

function dayDiff(d1, d2) {
  if (!d1 || !d2) return 0;
  return Math.max(0, Math.round((new Date(d2) - new Date(d1)) / 86400000));
}
function simpleInterest(p, r, days) {
  return (Number(p) || 0) * (Number(r) || 0) * (Number(days) || 0) / 365;
}
function bMoney(n) { return (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
function bMoney2(n) { return (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// Expand a debtMaster row into a list of drawdown legs:
// (a) the primary drawdown (receiveDate + principalAmount), plus
// (b) every debtEvents row with type='drawdown' for this contract.
function expandDrawdowns(row, allEvents) {
  const out = [];
  const rate = Number(row.interestRate) || 0;
  if (row.receiveDate && Number(row.principalAmount)) {
    out.push({ date: row.receiveDate, amount: Number(row.principalAmount), rate, note: 'ครั้งที่ 1' });
  }
  (allEvents || []).filter(e =>
    e.eventType === 'drawdown' && (e.contractId === row.id || e.contractNo === row.contractNo)
  ).forEach(e => {
    out.push({ date: e.eventDate, amount: Number(e.amount), rate, note: e.note || '' });
  });
  return out;
}

// Build matching index: jobNo → primary STS row + WCI-Project row
function buildStsIndex(debtMaster) {
  const sts = {};   // jobNo → STS contract
  const wci = {};   // jobNo → WCI-Project contract
  (debtMaster || []).forEach(d => {
    const cat = d.debtCategory;
    const job = d.projectCode;
    if (!job) return;
    if (cat === 'STS' && !sts[job])         sts[job] = d;
    if (cat === 'WCI-Project' && !wci[job]) wci[job] = d;
  });
  return { sts, wci };
}

// Find STS+WCI contracts matching a receipt → { sts, wciList, jobNo }
function matchStsContract(receipt, idx, invoices) {
  if (!receipt) return null;
  let jobNo = null;
  // Try in order — each fallback if previous didn't find a match
  if (receipt.projectCode && idx.sts[receipt.projectCode]) jobNo = receipt.projectCode;
  if (!jobNo && receipt.invoiceNo && invoices) {
    const iv = invoices.find(i => i.ivNo === receipt.invoiceNo);
    if (iv && iv.jobNo && idx.sts[iv.jobNo]) jobNo = iv.jobNo;
  }
  if (!jobNo && receipt.projectName) {
    for (const k of Object.keys(idx.sts)) {
      const c = idx.sts[k];
      if (c.projectName && (c.projectName.includes((receipt.projectName || '').slice(0, 15)) || (receipt.projectName || '').includes((c.projectName || '').slice(0, 15)))) {
        jobNo = k; break;
      }
    }
  }
  if (!jobNo) return null;
  return {
    jobNo,
    sts: idx.sts[jobNo],
    wci: idx.wci[jobNo],
  };
}

// Compute one drawdown's interest (used for both STS and each WCI tranche)
function legInterest(drawdownDate, receiveDate, principal, rate) {
  const days = dayDiff(drawdownDate, receiveDate);
  const interest = simpleInterest(principal, rate, days);
  return { drawdown: drawdownDate, days, principal: Number(principal) || 0, rate: Number(rate) || 0, interest };
}

// Compute full STS calc — STS leg(s) + WCI-Project legs combined
// match = { sts, wci, jobNo }; debtEvents from data
function computeStsRow(receipt, match, params, debtEvents) {
  const mgmtRate    = Number(params.mgmtRate) || DEFAULT_MGMT_FEE_RATE;
  const whtMgmt     = Number(params.whtMgmt) || DEFAULT_WHT_MGMT;
  const whtInt      = Number(params.whtInterest) || DEFAULT_WHT_INTEREST;
  const receiveDate = receipt.receiptDate;
  const baseAmount  = Number(receipt.grossAmount) || 0;

  // STS legs (primary + debtEvents drawdowns)
  const stsDraws = match.sts ? expandDrawdowns(match.sts, debtEvents) : [];
  const stsLegs = stsDraws.map(d =>
    legInterest(d.date, receiveDate, d.amount, d.rate || DEFAULT_STS_INT_RATE)
  );
  // WCI legs
  const wciDraws = match.wci ? expandDrawdowns(match.wci, debtEvents) : [];
  const wciLegs = wciDraws.map(d =>
    legInterest(d.date, receiveDate, d.amount, d.rate || 0.10)
  );

  const stsInterest = stsLegs.reduce((s, l) => s + l.interest, 0);
  const wciInterest = wciLegs.reduce((s, l) => s + l.interest, 0);
  const totalInterest = stsInterest + wciInterest;

  const mgmtGross = baseAmount * mgmtRate;
  const mgmtNet   = mgmtGross - totalInterest;
  const whtOnMgmt = mgmtGross * whtMgmt;
  const whtOnInt  = totalInterest * whtInt;
  const encompassPayable = mgmtNet - whtOnMgmt + whtOnInt;

  // Primary STS info for display
  const primary = match.sts || {};
  return {
    drawdown: primary.receiveDate || primary.startDate,
    receiveDate,
    days: stsLegs[0]?.days || 0,
    principal: Number(primary.principalAmount) || 0,
    intRate: Number(primary.interestRate) || DEFAULT_STS_INT_RATE,
    baseAmount, mgmtRate, mgmtGross,
    interest: totalInterest,           // total (STS + WCI) — for backward-compat display
    stsInterest, wciInterest,
    stsLegs, wciLegs,
    mgmtNet, whtOnMgmt, whtOnInt, encompassPayable,
  };
}

// ── Drawer for a single receipt ───────────────────────────────────────────
// Same layout as page_sts_calc (full calculator-style view) — but pulls real
// data from the matched receipt + debtMaster contract instead of being editable.
function StsCalcDrawer({ receipt, match, calcResult, isOpen, onClose, onConfirm, params, setParams, debtEvents }) {
  if (!isOpen) return null;
  const contract = match?.sts;

  // Error state — no matching STS contract
  if (!contract) {
    return (
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,36,77,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
        <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 28, maxWidth: 520, boxShadow: '0 24px 60px rgba(15,36,77,0.18)' }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>ไม่พบสัญญา STS ที่ตรงกับใบรับนี้</div>
          <div style={{ fontSize: 12, color: 'var(--ink-500)' }}>
            Project: <strong>{receipt.projectCode || '—'}</strong> · {receipt.projectName || '—'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 8 }}>
            ตรวจสอบว่ามีสัญญา STS-* ใน debtMaster ที่ projectCode/jobNo ตรงกับใบรับนี้
          </div>
          <button onClick={onClose} style={{ marginTop: 16, background: '#2a6fdb', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', cursor: 'pointer' }}>ปิด</button>
        </div>
      </div>
    );
  }

  const c            = computeStsRow(receipt, match, params, debtEvents);
  const wci          = match?.wci;
  const contractValue= Number(contract.contractValueIncVAT) || Number(receipt.grossAmount) || 0;
  const stsRate      = Number(contract.interestRate) || DEFAULT_STS_INT_RATE;
  const wciRate      = wci ? (Number(wci.interestRate) || 0.10) : 0.10;
  const stsDraws     = expandDrawdowns(contract, debtEvents);
  const wciDraws     = wci ? expandDrawdowns(wci, debtEvents) : [];
  const totalStsDraw = stsDraws.reduce((s, d) => s + (Number(d.amount) || 0), 0);
  const totalWciDraw = wciDraws.reduce((s, d) => s + (Number(d.amount) || 0), 0);

  // Reused styles for read-only input look (parallels sts_calc edit inputs but disabled)
  const roInput = { width: '100%', padding: 8, border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, background: '#f8fafc', color: 'var(--ink-700)', cursor: 'default' };
  const roInputRight = { ...roInput, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
  const editInput = { width: '100%', padding: 8, border: '1px solid #cbd5e0', borderRadius: 6, fontSize: 12, textAlign: 'right' };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,36,77,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: 'min(960px, 95vw)', maxHeight: '92vh', overflow: 'auto', boxShadow: '0 24px 60px rgba(15,36,77,0.18)' }}>

        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: '#fff', zIndex: 5 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 17 }}>STS Calculator · {receipt.receiptNo || receipt.invoiceNo || '—'}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>
              คำนวณดอกเบี้ย STS+WCI และค่าบริการเอนคอมพาส
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: 'var(--ink-400)', lineHeight: 1, padding: 4 }}>×</button>
        </div>

        <div style={{ padding: 18 }}>

          {/* ── Formula explainer (orange box) ──────────────────────────── */}
          <div className="card" style={{ padding: '14px 16px', marginBottom: 16, background: '#fffbeb', borderLeft: '4px solid #f6ad55' }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>📐 สูตรคำนวณ</div>
            <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--ink-700)' }}>
              1. <strong>ดอกเบี้ย STS (#1)</strong> = เงินต้น × {(stsRate*100).toFixed(2)}%/ปี × วันที่กู้ถึงวันรับเงินจากราชการ ÷ 365<br/>
              2. <strong>ดอกเบี้ย WCI (#2)</strong> = เงินต้น × {(wciRate*100).toFixed(2)}%/ปี × วันที่กู้ถึงวันรับเงิน ÷ 365<br/>
              3. <strong>ค่าบริการเอนคอมพาส (เต็ม)</strong> = ยอดรับจากราชการ × {(params.mgmtRate*100).toFixed(2)}%<br/>
              4. <strong>ค่าบริการสุทธิ</strong> = ค่าบริการ (เต็ม) − ดอกเบี้ยรวม (STS + WCI)<br/>
              5. <strong>หัก WHT</strong>: {(params.whtMgmt*100).toFixed(0)}% ค่าบริการ / {(params.whtInterest*100).toFixed(0)}% ดอกเบี้ย (รับคืน)
            </div>
          </div>

          {/* ── Contract parameters ─────────────────────────────────────── */}
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>⚙ ข้อมูลสัญญา</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--ink-500)', display: 'block', marginBottom: 3 }}>ชื่อโครงการ</label>
                <input value={contract.projectName || receipt.projectName || ''} readOnly style={roInput} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--ink-500)', display: 'block', marginBottom: 3 }}>เลขที่สัญญา / อ้างอิง</label>
                <input value={contract.contractNo || ''} readOnly style={roInput} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--ink-500)', display: 'block', marginBottom: 3 }}>มูลค่าสัญญา (รวม VAT)</label>
                <input value={bMoney2(contractValue)} readOnly style={roInputRight} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--ink-500)', display: 'block', marginBottom: 3 }}>Mgmt fee (เอนคอมพาส) %</label>
                <input type="number" step="0.001" value={params.mgmtRate}
                  onChange={e => setParams(p => ({ ...p, mgmtRate: Number(e.target.value) }))} style={editInput} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--ink-500)', display: 'block', marginBottom: 3 }}>ดอกเบี้ย STS (#1) /ปี</label>
                <input value={stsRate} readOnly style={roInputRight} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--ink-500)', display: 'block', marginBottom: 3 }}>ดอกเบี้ย WCI (#2) /ปี</label>
                <input value={wciRate} readOnly style={roInputRight} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--ink-500)', display: 'block', marginBottom: 3 }}>WHT mgmt %</label>
                <input type="number" step="0.01" value={params.whtMgmt}
                  onChange={e => setParams(p => ({ ...p, whtMgmt: Number(e.target.value) }))} style={editInput} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--ink-500)', display: 'block', marginBottom: 3 }}>WHT interest %</label>
                <input type="number" step="0.01" value={params.whtInterest}
                  onChange={e => setParams(p => ({ ...p, whtInterest: Number(e.target.value) }))} style={editInput} />
              </div>
            </div>
          </div>

          {/* ── STS drawdowns ────────────────────────────────────────────── */}
          <div className="card" style={{ padding: 0, marginBottom: 16, overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', background: '#f0f9ff', borderBottom: '1px solid #bfdbfe' }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>💰 เงินกู้ STS (#1)</div>
            </div>
            <table className="tbl" style={{ width: '100%', fontSize: 12 }}>
              <thead>
                <tr><th style={{ width: 70 }}>รายการ</th><th style={{ width: 130 }}>วันที่</th><th style={{ width: 140, textAlign: 'right' }}>จำนวนเงิน</th><th>หมายเหตุ</th></tr>
              </thead>
              <tbody>
                {stsDraws.length === 0 && (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: 20, color: 'var(--ink-400)' }}>ไม่มีรายการเบิกเงิน STS</td></tr>
                )}
                {stsDraws.map((d, i) => (
                  <tr key={'sts-d-'+i}>
                    <td style={{ fontSize: 11 }}>STS #{i + 1}</td>
                    <td>{fmtDate(d.date) || d.date}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{bMoney2(d.amount)}</td>
                    <td style={{ fontSize: 11, color: 'var(--ink-500)' }}>{d.note || '—'}</td>
                  </tr>
                ))}
                {stsDraws.length > 0 && (
                  <tr style={{ background: '#fafbfc', fontWeight: 700 }}>
                    <td colSpan={2}>รวม STS</td>
                    <td style={{ textAlign: 'right' }}>{bMoney2(totalStsDraw)}</td>
                    <td></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ── WCI drawdowns ────────────────────────────────────────────── */}
          <div className="card" style={{ padding: 0, marginBottom: 16, overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', background: '#f5f3ff', borderBottom: '1px solid #ddd6fe' }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>💰 เงินกู้ WCI (#2)</div>
            </div>
            <table className="tbl" style={{ width: '100%', fontSize: 12 }}>
              <thead>
                <tr><th style={{ width: 70 }}>รายการ</th><th style={{ width: 130 }}>วันที่</th><th style={{ width: 140, textAlign: 'right' }}>จำนวนเงิน</th><th>หมายเหตุ</th></tr>
              </thead>
              <tbody>
                {wciDraws.length === 0 && (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: 20, color: 'var(--ink-400)' }}>ไม่มีรายการเบิกเงิน WCI</td></tr>
                )}
                {wciDraws.map((d, i) => (
                  <tr key={'wci-d-'+i}>
                    <td style={{ fontSize: 11 }}>WCI #{i + 1}</td>
                    <td>{fmtDate(d.date) || d.date}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{bMoney2(d.amount)}</td>
                    <td style={{ fontSize: 11, color: 'var(--ink-500)' }}>{d.note || '—'}</td>
                  </tr>
                ))}
                {wciDraws.length > 0 && (
                  <tr style={{ background: '#fafbfc', fontWeight: 700 }}>
                    <td colSpan={2}>รวม WCI</td>
                    <td style={{ textAlign: 'right' }}>{bMoney2(totalWciDraw)}</td>
                    <td></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ── Government receipt (the one being processed) ─────────────── */}
          <div className="card" style={{ padding: 0, marginBottom: 16, overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', background: '#f0fdf4', borderBottom: '1px solid #bbf7d0' }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>🏛 รับเงินจากราชการ</div>
            </div>
            <table className="tbl" style={{ width: '100%', fontSize: 12 }}>
              <thead>
                <tr><th style={{ width: 100 }}>เลขที่ใบรับ</th><th style={{ width: 130 }}>วันที่รับ</th><th style={{ width: 120 }}>ใบแจ้งหนี้</th><th style={{ textAlign: 'right' }}>จำนวนเงิน (gross)</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ fontFamily: 'ui-monospace', fontWeight: 600 }}>{receipt.receiptNo || '—'}</td>
                  <td>{fmtDate(receipt.receiptDate)}</td>
                  <td style={{ fontFamily: 'ui-monospace', fontSize: 11 }}>{receipt.invoiceNo || '—'}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: '#0369a1' }}>{bMoney2(receipt.grossAmount)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ── Interest calculation details ────────────────────────────── */}
          <div className="card" style={{ padding: 0, marginBottom: 16, overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', background: '#fff7ed', borderBottom: '1px solid #fed7aa' }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>📈 รายละเอียดดอกเบี้ย (คำนวณถึงวันรับเงิน {fmtDate(receipt.receiptDate)})</div>
            </div>
            <table className="tbl" style={{ width: '100%', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ width: 90 }}>ฝ่าย</th>
                  <th style={{ width: 130 }}>วันที่กู้</th>
                  <th style={{ width: 80, textAlign: 'right' }}>จำนวนวัน</th>
                  <th style={{ width: 140, textAlign: 'right' }}>เงินต้น</th>
                  <th style={{ width: 90, textAlign: 'right' }}>อัตรา</th>
                  <th style={{ width: 150, textAlign: 'right' }}>ดอกเบี้ย</th>
                </tr>
              </thead>
              <tbody>
                {c.stsLegs.map((l, i) => (
                  <tr key={'sts-l-'+i}>
                    <td><Badge kind="b-blue" dot={false}>STS</Badge></td>
                    <td>{fmtDate(l.drawdown) || l.drawdown}</td>
                    <td style={{ textAlign: 'right' }}>{l.days}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{bMoney2(l.principal)}</td>
                    <td style={{ textAlign: 'right' }}>{(l.rate*100).toFixed(2)}%</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: '#9b1c1c' }}>{bMoney2(l.interest)}</td>
                  </tr>
                ))}
                {c.wciLegs.map((l, i) => (
                  <tr key={'wci-l-'+i}>
                    <td><Badge kind="b-violet" dot={false}>WCI</Badge></td>
                    <td>{fmtDate(l.drawdown) || l.drawdown}</td>
                    <td style={{ textAlign: 'right' }}>{l.days}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{bMoney2(l.principal)}</td>
                    <td style={{ textAlign: 'right' }}>{(l.rate*100).toFixed(2)}%</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: '#6b46c1' }}>{bMoney2(l.interest)}</td>
                  </tr>
                ))}
                {(c.stsLegs.length + c.wciLegs.length) === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: 20, color: 'var(--ink-400)' }}>ไม่มีข้อมูลดอกเบี้ย</td></tr>
                )}
                <tr style={{ background: '#fef3c7', fontWeight: 700 }}>
                  <td colSpan={5} style={{ textAlign: 'right', paddingRight: 12 }}>รวมดอกเบี้ย STS</td>
                  <td style={{ textAlign: 'right', color: '#9b1c1c', fontVariantNumeric: 'tabular-nums' }}>{bMoney2(c.stsInterest)}</td>
                </tr>
                <tr style={{ background: '#fef3c7', fontWeight: 700 }}>
                  <td colSpan={5} style={{ textAlign: 'right', paddingRight: 12 }}>รวมดอกเบี้ย WCI</td>
                  <td style={{ textAlign: 'right', color: '#6b46c1', fontVariantNumeric: 'tabular-nums' }}>{bMoney2(c.wciInterest)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ── Final summary (gradient card) ───────────────────────────── */}
          <div className="card" style={{ padding: 18, background: 'linear-gradient(135deg, #fff7ed, #fefce8)' }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14, color: '#9a3412' }}>💰 สรุปสำหรับเอนคอมพาส</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>ค่าบริการ (เต็ม) — {(c.mgmtRate*100).toFixed(2)}% × ยอดรับ</div>
                <div style={{ fontWeight: 700, fontSize: 18, fontVariantNumeric: 'tabular-nums' }}>{bMoney(c.mgmtGross)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>(−) หักดอกเบี้ยรวม (STS + WCI)</div>
                <div style={{ fontWeight: 700, fontSize: 18, fontVariantNumeric: 'tabular-nums', color: '#9b1c1c' }}>−{bMoney(c.interest)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>= ค่าบริการสุทธิ</div>
                <div style={{ fontWeight: 700, fontSize: 20, fontVariantNumeric: 'tabular-nums', color: '#276749' }}>{bMoney(c.mgmtNet)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>(−) WHT ค่าบริการ {(params.whtMgmt*100).toFixed(0)}%</div>
                <div style={{ fontWeight: 600, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>−{bMoney(c.whtOnMgmt)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>(+) WHT ดอกเบี้ย {(params.whtInterest*100).toFixed(0)}% (รับคืน)</div>
                <div style={{ fontWeight: 600, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>+{bMoney(c.whtOnInt)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>= สุทธิจ่ายเอนคอมพาส</div>
                <div style={{ fontWeight: 700, fontSize: 22, fontVariantNumeric: 'tabular-nums', color: '#0369a1' }}>
                  {bMoney(c.encompassPayable)}
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div style={{ padding: '12px 18px', background: '#f8fafc', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', bottom: 0, zIndex: 5 }}>
          <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>
            {calcResult ? `✓ บันทึกแล้ว ${calcResult.calculatedAt ? new Date(calcResult.calculatedAt).toLocaleString('th-TH') : ''}` : 'ยังไม่บันทึก'}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} className="btn btn-ghost">ปิด</button>
            <button onClick={() => onConfirm(c)} className="btn btn-primary">
              {calcResult ? 'บันทึกใหม่' : 'ยืนยัน + บันทึก'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────
function StsWorkflowPage({ data, setData, toast }) {
  const receipts     = data?.receipts || [];
  const debtMaster   = data?.debtMaster || [];
  const debtEvents   = data?.debtEvents || [];
  const invoices     = data?.invoices || [];
  const calcResults  = data?.stsCalcResult || [];
  const [params, setParams] = React.useState({
    mgmtRate: DEFAULT_MGMT_FEE_RATE,
    whtMgmt: DEFAULT_WHT_MGMT,
    whtInterest: DEFAULT_WHT_INTEREST,
  });
  const [openReceiptId, setOpenReceiptId] = React.useState(null);
  const [filter, setFilter] = React.useState('all'); // all | pending | done

  // STS contract index
  const stsIdx = React.useMemo(() => buildStsIndex(debtMaster), [debtMaster]);

  // Match each receipt to STS contract; only keep matched
  const matched = React.useMemo(() => {
    return receipts.map(r => {
      const match = matchStsContract(r, stsIdx, invoices);
      const result = calcResults.find(x => x.pendingCalcId === r.id);
      return { receipt: r, match, result };
    }).filter(m => m.match); // STS-relevant only
  }, [receipts, stsIdx, invoices, calcResults]);

  const filtered = React.useMemo(() => {
    if (filter === 'pending') return matched.filter(m => !m.result);
    if (filter === 'done')    return matched.filter(m =>  m.result);
    return matched;
  }, [matched, filter]);

  // KPIs
  const pendingCount = matched.filter(m => !m.result).length;
  const doneCount    = matched.filter(m =>  m.result).length;
  let totalSts = 0, totalWci = 0, totalEncompass = 0;
  matched.forEach(m => {
    const c = computeStsRow(m.receipt, m.match, params, debtEvents);
    totalSts      += c.stsInterest;
    totalWci      += c.wciInterest;
    totalEncompass+= c.encompassPayable;
  });
  const totalInterest = totalSts + totalWci;

  // Confirm handler — save to stsCalcResult (local state; needs Sheet write to persist)
  const handleConfirm = (calcVals) => {
    if (!openReceiptId) return;
    const m = matched.find(x => x.receipt.id === openReceiptId);
    if (!m) return;
    const debtIds = [m.match.sts?.id, m.match.wci?.id].filter(Boolean);
    const newResult = {
      id: 'cr_' + Math.random().toString(36).slice(2, 10),
      pendingCalcId: m.receipt.id,
      debtIds,
      interestTotal: calcVals.interest,
      serviceFeeFull: calcVals.mgmtGross,
      serviceFeeNet:  calcVals.mgmtNet,
      encompassPayableId: '',
      note: 'คำนวณ STS วันที่ ' + new Date().toISOString().slice(0, 10),
      calculatedAt: new Date().toISOString(),
    };
    if (setData) {
      setData(d => ({
        ...d,
        stsCalcResult: [...((d.stsCalcResult) || []).filter(x => x.pendingCalcId !== match.receipt.id), newResult],
      }));
    }
    if (toast) toast('บันทึกผลการคำนวณแล้ว (ยังไม่ส่งกลับ Google Sheet)');
    setOpenReceiptId(null);
  };

  const openMatch = matched.find(m => m.receipt.id === openReceiptId);

  return (
    <div className="page">
      <div className="page-head anim-in">
        <div>
          <h1 className="page-title">STS Workflow · review &amp; calc</h1>
          <div className="page-sub">
            จับคู่ใบรับเงินกับสัญญา STS · คำนวณดอกเบี้ย + ค่าบริการเอนคอมพาส
          </div>
        </div>
      </div>

      <div className="grid grid-4 anim-stagger" style={{ marginBottom: 16 }}>
        <KpiTile animate={false} label="รอ Review"            value={pendingCount}   accent="var(--bad)"            icon="invoice" unit=" ใบ" digits={0} />
        <KpiTile animate={false} label="ตรวจสอบแล้ว"          value={doneCount}      accent="var(--good)"           icon="coin"    unit=" ใบ" digits={0} />
        <KpiTile animate={false} label="ดอกเบี้ย STS+WCI รวม" value={totalInterest}  accent="var(--brand-500)"      icon="money" />
        <KpiTile animate={false} label="ค่าบริการเอนคอมพาส"   value={totalEncompass} accent="oklch(52% 0.16 220)"   icon="bank" />
      </div>

      <div className="card" style={{ padding: '10px 14px', marginBottom: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
        <div className="tabnav" style={{ flex: 'none' }}>
          <button className={filter === 'all'     ? 'active' : ''} onClick={() => setFilter('all')}>ทั้งหมด ({matched.length})</button>
          <button className={filter === 'pending' ? 'active' : ''} onClick={() => setFilter('pending')}>รอ review ({pendingCount})</button>
          <button className={filter === 'done'    ? 'active' : ''} onClick={() => setFilter('done')}>ตรวจแล้ว ({doneCount})</button>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink-500)' }}>
          Mgmt {(params.mgmtRate*100).toFixed(1)}% · WHT mgmt {(params.whtMgmt*100).toFixed(0)}% / int {(params.whtInterest*100).toFixed(0)}%
        </div>
      </div>

      {matched.length === 0 && (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
          <div style={{ fontWeight: 600, color: 'var(--ink-600)', marginBottom: 8 }}>ไม่พบใบรับที่ match กับสัญญา STS</div>
          <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>
            ตรวจสอบว่า: debtMaster มีสัญญาหมวด STS, receipts มี projectCode ตรงกับ jobNo ของสัญญา
          </div>
        </div>
      )}

      {matched.length > 0 && (
        <div className="card anim-in" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'min(480px, calc(100vh - 400px))' }}>
            <table className="tbl" style={{ minWidth: 1100, fontSize: 12 }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 3, background: 'var(--surface)' }}>
                <tr>
                  <th style={{ width: 100 }}>วันที่รับเงิน</th>
                  <th style={{ width: 120 }}>เลขที่ใบรับ / IV</th>
                  <th style={{ width: 90 }}>รหัสโครงการ</th>
                  <th>สัญญา STS</th>
                  <th style={{ textAlign: 'right', width: 110 }}>ยอดรับ (฿)</th>
                  <th style={{ textAlign: 'right', width: 70 }}>จำนวนวัน</th>
                  <th style={{ textAlign: 'right', width: 120 }}>ดอกเบี้ยรวม (฿)</th>
                  <th style={{ textAlign: 'right', width: 120 }}>ค่าบริการ (฿)</th>
                  <th style={{ width: 100 }}>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(m => {
                  const c = computeStsRow(m.receipt, m.match, params, debtEvents);
                  const isDone = !!m.result;
                  const sts = m.match.sts;
                  const wciCount = m.match.wci ? expandDrawdowns(m.match.wci, debtEvents).length : 0;
                  const stsCount = sts ? expandDrawdowns(sts, debtEvents).length : 0;
                  return (
                    <tr key={m.receipt.id} onClick={() => setOpenReceiptId(m.receipt.id)} style={{ cursor: 'pointer', background: isDone ? '#f0fdf4' : undefined }}>
                      <td>{fmtDate(m.receipt.receiptDate)}</td>
                      <td style={{ fontFamily: 'ui-monospace', fontSize: 11 }}>
                        <div>{m.receipt.receiptNo || '—'}</div>
                        <div style={{ fontSize: 10, color: 'var(--ink-400)' }}>{m.receipt.invoiceNo || '—'}</div>
                      </td>
                      <td style={{ fontFamily: 'ui-monospace', fontSize: 11 }}>{m.receipt.projectCode || '—'}</td>
                      <td style={{ fontSize: 11 }}>
                        <div style={{ fontWeight: 600 }}>{sts.contractNo}</div>
                        <div style={{ fontSize: 10, color: 'var(--ink-400)' }}>
                          STS {bMoney(sts.principalAmount)} ฿{stsCount > 1 ? ' (' + stsCount + ' งวด)' : ''} · WCI {wciCount} งวด
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{bMoney(m.receipt.grossAmount)}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{c.days}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#9b1c1c' }}>{bMoney(c.interest)}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: '#0369a1' }}>{bMoney(c.encompassPayable)}</td>
                      <td>
                        {isDone
                          ? <Badge kind="b-green" dot={false}>✓ ตรวจแล้ว</Badge>
                          : <Badge kind="b-amber" dot={false}>รอ review</Badge>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <StsCalcDrawer
        receipt={openMatch?.receipt}
        match={openMatch?.match}
        calcResult={openMatch?.result}
        isOpen={!!openMatch}
        onClose={() => setOpenReceiptId(null)}
        onConfirm={handleConfirm}
        params={params}
        setParams={setParams}
        debtEvents={debtEvents}
      />
    </div>
  );
}

Object.assign(window, { StsWorkflowPage });
