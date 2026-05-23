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

// Build matching index: jobNo/projectCode → STS contract from debtMaster
function buildStsIndex(debtMaster) {
  const byJob = {};
  const byProj = {};
  (debtMaster || []).filter(d => d.debtCategory === 'STS').forEach(d => {
    if (d.projectCode) byJob[d.projectCode] = d;
    if (d.projectName) byProj[d.projectName] = d;
  });
  return { byJob, byProj };
}

// Find STS contract matching a receipt (by projectCode or invoiceNo)
function matchStsContract(receipt, idx, invoices) {
  if (!receipt) return null;
  // 1. Direct projectCode match
  if (receipt.projectCode && idx.byJob[receipt.projectCode]) return idx.byJob[receipt.projectCode];
  // 2. Lookup via invoice → jobNo
  if (receipt.invoiceNo && invoices) {
    const iv = invoices.find(i => i.ivNo === receipt.invoiceNo);
    if (iv && iv.jobNo && idx.byJob[iv.jobNo]) return idx.byJob[iv.jobNo];
  }
  // 3. By projectName substring (loose)
  if (receipt.projectName) {
    for (const k of Object.keys(idx.byJob)) {
      const c = idx.byJob[k];
      if (c.projectName && (c.projectName.includes(receipt.projectName.slice(0, 15)) || receipt.projectName.includes((c.projectName || '').slice(0, 15)))) return c;
    }
  }
  return null;
}

// Compute STS row: interest + encompass fee net
function computeStsRow(receipt, contract, params) {
  const mgmtRate    = Number(params.mgmtRate) || DEFAULT_MGMT_FEE_RATE;
  const intRate     = Number(contract.interestRate) || DEFAULT_STS_INT_RATE;
  const whtMgmt     = Number(params.whtMgmt) || DEFAULT_WHT_MGMT;
  const whtInt      = Number(params.whtInterest) || DEFAULT_WHT_INTEREST;
  const drawdown    = contract.receiveDate || contract.startDate;
  const receiveDate = receipt.receiptDate;
  const days        = dayDiff(drawdown, receiveDate);
  const principal   = Number(contract.principalAmount) || 0;
  const interest    = simpleInterest(principal, intRate, days);
  // Use receipt's gross as the basis for management fee (proportional to this receipt's share)
  const baseAmount  = Number(receipt.grossAmount) || 0;
  const mgmtGross   = baseAmount * mgmtRate;
  const mgmtNet     = mgmtGross - interest;
  const whtOnMgmt   = mgmtGross * whtMgmt;
  const whtOnInt    = interest * whtInt;
  const encompassPayable = mgmtNet - whtOnMgmt + whtOnInt;
  return {
    drawdown, receiveDate, days, principal, intRate,
    baseAmount, mgmtRate, mgmtGross, interest, mgmtNet,
    whtOnMgmt, whtOnInt, encompassPayable,
  };
}

// ── Drawer for a single receipt ───────────────────────────────────────────
function StsCalcDrawer({ receipt, contract, calcResult, isOpen, onClose, onConfirm, params, setParams }) {
  if (!isOpen) return null;
  if (!contract) {
    return (
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
        <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 30, maxWidth: 520 }}>
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
  const c = computeStsRow(receipt, contract, params);
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, width: 'min(800px, 95vw)', maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>คำนวณ STS สำหรับใบรับ {receipt.receiptNo || receipt.invoiceNo}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-500)', marginTop: 3 }}>
              ใบรับ {fmtDate(receipt.receiptDate)} · {bMoney(receipt.grossAmount)} ฿
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--ink-400)' }}>×</button>
        </div>

        <div style={{ padding: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ background: '#f0f9ff', padding: 12, borderRadius: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: '#0369a1', marginBottom: 8 }}>📋 ใบรับเงินจากราชการ</div>
            <div style={{ fontSize: 12, lineHeight: 1.7 }}>
              <div>เลขที่: <strong>{receipt.receiptNo || '—'}</strong></div>
              <div>วันที่รับ: <strong>{fmtDate(receipt.receiptDate)}</strong></div>
              <div>ใบแจ้งหนี้: {receipt.invoiceNo || '—'}</div>
              <div>โครงการ: <strong>{receipt.projectCode || '—'}</strong></div>
              <div>ยอดรับ (gross): <strong style={{ color: '#0369a1' }}>{bMoney(receipt.grossAmount)} ฿</strong></div>
            </div>
          </div>

          <div style={{ background: '#fff7ed', padding: 12, borderRadius: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: '#9a3412', marginBottom: 8 }}>💰 สัญญา STS</div>
            <div style={{ fontSize: 12, lineHeight: 1.7 }}>
              <div>เลขที่สัญญา: <strong>{contract.contractNo}</strong></div>
              <div>วันเบิกเงินกู้: <strong>{fmtDate(contract.receiveDate || contract.startDate)}</strong></div>
              <div>วงเงินกู้ STS: <strong>{bMoney(contract.principalAmount)} ฿</strong></div>
              <div>อัตราดอกเบี้ย: <strong>{((Number(contract.interestRate) || 0) * 100).toFixed(2)}% / ปี</strong></div>
              <div>หมวด: <strong>{contract.debtCategory}</strong></div>
            </div>
          </div>
        </div>

        <div style={{ padding: '0 18px 18px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          <div>
            <label style={{ fontSize: 10, color: 'var(--ink-500)', display: 'block' }}>Mgmt fee %</label>
            <input type="number" step="0.001" value={params.mgmtRate} onChange={e => setParams(p => ({ ...p, mgmtRate: Number(e.target.value) }))}
              style={{ width: '100%', padding: 6, border: '1px solid #cbd5e0', borderRadius: 4, fontSize: 12, textAlign: 'right' }} />
          </div>
          <div>
            <label style={{ fontSize: 10, color: 'var(--ink-500)', display: 'block' }}>WHT mgmt %</label>
            <input type="number" step="0.01" value={params.whtMgmt} onChange={e => setParams(p => ({ ...p, whtMgmt: Number(e.target.value) }))}
              style={{ width: '100%', padding: 6, border: '1px solid #cbd5e0', borderRadius: 4, fontSize: 12, textAlign: 'right' }} />
          </div>
          <div>
            <label style={{ fontSize: 10, color: 'var(--ink-500)', display: 'block' }}>WHT interest %</label>
            <input type="number" step="0.01" value={params.whtInterest} onChange={e => setParams(p => ({ ...p, whtInterest: Number(e.target.value) }))}
              style={{ width: '100%', padding: 6, border: '1px solid #cbd5e0', borderRadius: 4, fontSize: 12, textAlign: 'right' }} />
          </div>
          <div>
            <label style={{ fontSize: 10, color: 'var(--ink-500)', display: 'block' }}>จำนวนวัน</label>
            <input value={c.days} readOnly
              style={{ width: '100%', padding: 6, border: '1px solid #cbd5e0', borderRadius: 4, fontSize: 12, textAlign: 'right', background: '#f8fafc' }} />
          </div>
        </div>

        <div style={{ padding: '0 18px 18px' }}>
          <table className="tbl" style={{ width: '100%', fontSize: 12 }}>
            <tbody>
              <tr><td>ดอกเบี้ย STS ({c.days} วัน × {((c.intRate)*100).toFixed(2)}% × {bMoney(c.principal)})</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: '#9b1c1c' }}>{bMoney2(c.interest)}</td></tr>
              <tr><td>ค่าบริการเอนคอมพาส (gross) = {(c.mgmtRate*100).toFixed(2)}% × {bMoney(c.baseAmount)}</td>
                  <td style={{ textAlign: 'right' }}>{bMoney2(c.mgmtGross)}</td></tr>
              <tr style={{ background: '#fffbeb' }}><td>(−) หักดอกเบี้ย STS</td>
                  <td style={{ textAlign: 'right', color: '#9b1c1c' }}>−{bMoney2(c.interest)}</td></tr>
              <tr style={{ borderTop: '2px solid var(--line)' }}><td><strong>= ค่าบริการสุทธิ</strong></td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: '#276749' }}>{bMoney2(c.mgmtNet)}</td></tr>
              <tr><td>(−) WHT ค่าบริการ {(c.mgmtRate ? (params.whtMgmt*100).toFixed(0) : 0)}%</td>
                  <td style={{ textAlign: 'right', fontSize: 11 }}>−{bMoney2(c.whtOnMgmt)}</td></tr>
              <tr><td>(+) WHT ดอกเบี้ย {(params.whtInterest*100).toFixed(0)}% (รับคืน)</td>
                  <td style={{ textAlign: 'right', fontSize: 11 }}>+{bMoney2(c.whtOnInt)}</td></tr>
              <tr style={{ background: '#f0f9ff', borderTop: '2px solid #2a6fdb' }}>
                  <td><strong>= สุทธิจ่ายเอนคอมพาส</strong></td>
                  <td style={{ textAlign: 'right', fontWeight: 800, fontSize: 16, color: '#0369a1' }}>{bMoney(c.encompassPayable)}</td></tr>
            </tbody>
          </table>
        </div>

        <div style={{ padding: '12px 18px', background: '#f8fafc', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>
            {calcResult ? `✓ บันทึกแล้ว ${calcResult.calculatedAt || ''}` : 'ยังไม่บันทึก'}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ padding: '7px 14px', border: '1px solid #cbd5e0', background: '#fff', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>ปิด</button>
            <button onClick={() => onConfirm(c)} style={{ padding: '7px 16px', background: '#0369a1', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
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
      const contract = matchStsContract(r, stsIdx, invoices);
      const result   = calcResults.find(x => x.pendingCalcId === r.id);
      return { receipt: r, contract, result };
    }).filter(m => m.contract); // STS-relevant only
  }, [receipts, stsIdx, invoices, calcResults]);

  const filtered = React.useMemo(() => {
    if (filter === 'pending') return matched.filter(m => !m.result);
    if (filter === 'done')    return matched.filter(m =>  m.result);
    return matched;
  }, [matched, filter]);

  // KPIs
  const pendingCount = matched.filter(m => !m.result).length;
  const doneCount    = matched.filter(m =>  m.result).length;
  let totalInterest = 0, totalMgmtNet = 0, totalEncompass = 0;
  matched.forEach(m => {
    const c = computeStsRow(m.receipt, m.contract, params);
    totalInterest += c.interest;
    totalMgmtNet  += c.mgmtNet;
    totalEncompass+= c.encompassPayable;
  });

  // Confirm handler — save to stsCalcResult (local state; needs Sheet write to persist)
  const handleConfirm = (calcVals) => {
    if (!openReceiptId) return;
    const match = matched.find(m => m.receipt.id === openReceiptId);
    if (!match) return;
    const newResult = {
      id: 'cr_' + Math.random().toString(36).slice(2, 10),
      pendingCalcId: match.receipt.id,
      debtIds: [match.contract.id],
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
        <KpiTile animate={false} label="รอ review" value={pendingCount} accent="var(--bad)"   icon="invoice" unit="" digits={0} delta="ใบรับ"  />
        <KpiTile animate={false} label="ตรวจแล้ว"  value={doneCount}    accent="var(--good)"  icon="coin"    unit="" digits={0} delta="ใบรับ" />
        <KpiTile animate={false} label="ดอกเบี้ย STS รวม" value={totalInterest} accent="var(--brand-500)" icon="money" delta="จากทั้งหมด" />
        <KpiTile animate={false} label="เอนคอมพาส (สุทธิ)" value={totalEncompass} accent="oklch(52% 0.16 220)" icon="bank" delta="คงเหลือจ่าย" />
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
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl" style={{ minWidth: 1100, fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ width: 100 }}>วันที่รับ</th>
                  <th style={{ width: 120 }}>ใบรับ / IV</th>
                  <th style={{ width: 90 }}>Project</th>
                  <th>สัญญา STS</th>
                  <th style={{ textAlign: 'right', width: 100 }}>ยอดรับ</th>
                  <th style={{ textAlign: 'right', width: 60 }}>วัน</th>
                  <th style={{ textAlign: 'right', width: 110 }}>ดอกเบี้ย</th>
                  <th style={{ textAlign: 'right', width: 110 }}>เอนคอมพาส</th>
                  <th style={{ width: 100 }}>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(m => {
                  const c = computeStsRow(m.receipt, m.contract, params);
                  const isDone = !!m.result;
                  return (
                    <tr key={m.receipt.id} onClick={() => setOpenReceiptId(m.receipt.id)} style={{ cursor: 'pointer', background: isDone ? '#f0fdf4' : undefined }}>
                      <td>{fmtDate(m.receipt.receiptDate)}</td>
                      <td style={{ fontFamily: 'ui-monospace', fontSize: 11 }}>
                        <div>{m.receipt.receiptNo || '—'}</div>
                        <div style={{ fontSize: 10, color: 'var(--ink-400)' }}>{m.receipt.invoiceNo || '—'}</div>
                      </td>
                      <td style={{ fontFamily: 'ui-monospace', fontSize: 11 }}>{m.receipt.projectCode || '—'}</td>
                      <td style={{ fontSize: 11 }}>
                        <div style={{ fontWeight: 600 }}>{m.contract.contractNo}</div>
                        <div style={{ fontSize: 10, color: 'var(--ink-400)' }}>
                          เบิก {fmtDate(m.contract.receiveDate)} · {bMoney(m.contract.principalAmount)} ฿
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
        contract={openMatch?.contract}
        calcResult={openMatch?.result}
        isOpen={!!openMatch}
        onClose={() => setOpenReceiptId(null)}
        onConfirm={handleConfirm}
        params={params}
        setParams={setParams}
      />
    </div>
  );
}

Object.assign(window, { StsWorkflowPage });
