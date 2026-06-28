/* page_debt_leasit.jsx — แท็บ "ลีซอิท" ในหน้า #debt
   - Upload ไฟล์ตารางคำนวณดอกเบี้ยลีซอิท (.xlsx 94 ชีต)
   - แสดงรายสัญญา + รวม prepaid/actual/variance/refund/outstanding
   - คลิกแถว → drawer ดู schedule prepaid/actual/refund + ปุ่ม Export ราย loan
   - Export Excel ทั้งหมด (ชีตต่อสัญญา มีสูตร =Principal*Rate*Days/365)

   identifiers prefix Leasit / lit  (กัน global-scope name collision)
*/
'use strict';

/* ── helpers (ภายใน) ──────────────────────────────────────────────────── */
const LIT_fmt = (n, d = 2) =>
  (typeof window.fmtNum === 'function' ? window.fmtNum(n, d) : Number(n || 0).toFixed(d));

const LIT_fmtDate = (iso) =>
  (typeof window.fmtDate === 'function' ? window.fmtDate(iso) : (iso || ''));

const litRowId = (loanId, kind, seq) => 'lit_' + kind + '_' + loanId + '_' + seq;

/* ── LeasitImportModal — preview diff ก่อน import ─────────────────────── */
function LeasitImportModal({ open, onClose, onConfirm }) {
  const [file, setFile] = React.useState(null);
  const [parsed, setParsed] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState('');

  React.useEffect(() => {
    if (!open) { setFile(null); setParsed(null); setErr(''); }
  }, [open]);

  const handleFile = async (f) => {
    if (!f) return;
    setFile(f); setErr(''); setBusy(true); setParsed(null);
    try {
      const XLSX = window.XLSX;
      if (!XLSX) throw new Error('ไม่พบ XLSX library');
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: false });
      const result = window.LeasitEngine.parseLeasitWorkbook(wb);
      setParsed(result);
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;
  const Modal = window.Modal;
  return (
    <Modal open={open} onClose={onClose} title="📥 นำเข้าตารางคำนวณดอกเบี้ยลีซอิท" maxWidth={1100}>
      <div style={{ padding: '8px 4px', fontSize: 14 }}>
        <div style={{
          border: '2px dashed var(--ink-200)', borderRadius: 12, padding: 24,
          textAlign: 'center', background: 'var(--ink-50)', cursor: 'pointer'
        }}
          onClick={() => document.getElementById('lit-file-in').click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
        >
          <div style={{ fontSize: 24 }}>📂</div>
          <div style={{ marginTop: 4, color: 'var(--ink-700)' }}>
            ลากไฟล์ <code>.xlsx</code> มาวาง หรือคลิกเพื่อเลือก
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 4 }}>
            ไฟล์ต้นทาง: ตารางคำนวณดอกเบี้ยเงินกู้-ลีซอิท.xlsx
          </div>
          {file && <div style={{ marginTop: 8, fontWeight: 600 }}>{file.name}</div>}
          <input
            id="lit-file-in"
            type="file"
            accept=".xlsx,.xls"
            style={{ display: 'none' }}
            onChange={(e) => handleFile(e.target.files[0])}
          />
        </div>

        {busy && <div style={{ marginTop: 12, color: 'var(--brand-500)' }}>⏳ กำลังอ่านไฟล์…</div>}
        {err && <div style={{ marginTop: 12, color: 'var(--bad)' }}>❌ {err}</div>}

        {parsed && (
          <div style={{ marginTop: 16 }}>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12
            }}>
              <div className="card" style={{ padding: 10 }}>
                <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>สัญญา</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{parsed.loans.length}</div>
              </div>
              <div className="card" style={{ padding: 10 }}>
                <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>งวด Prepaid</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{parsed.prepaid.length}</div>
              </div>
              <div className="card" style={{ padding: 10 }}>
                <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>งวด Actual</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{parsed.actual.length}</div>
              </div>
              <div className="card" style={{ padding: 10 }}>
                <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>รับคืน</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{parsed.refund.length}</div>
              </div>
            </div>

            {parsed.errors.length > 0 && (
              <div style={{
                padding: 10, background: 'oklch(95% 0.05 80)', borderRadius: 8,
                fontSize: 12, color: 'var(--ink-700)', marginBottom: 12
              }}>
                ⚠️ มี {parsed.errors.length} ชีตที่อ่านไม่ครบ:
                <ul style={{ margin: '4px 0 0 16px' }}>
                  {parsed.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
                  {parsed.errors.length > 5 && <li>… อีก {parsed.errors.length - 5} รายการ</li>}
                </ul>
              </div>
            )}

            <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid var(--ink-200)', borderRadius: 8 }}>
              <table className="tbl" style={{ width: '100%', fontSize: 12 }}>
                <thead>
                  <tr><th>ลำดับ</th><th>เลขที่สัญญา</th><th>โครงการ</th><th style={{ textAlign: 'right' }}>วงเงิน</th><th>สถานะ</th><th style={{ textAlign: 'right' }}>ค้างรับคืน</th></tr>
                </thead>
                <tbody>
                  {parsed.loans.slice(0, 50).map(L => (
                    <tr key={L.loanId}>
                      <td>{L.loanId}</td>
                      <td>{L.contractNo}</td>
                      <td title={L.projectName} style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{L.projectName}</td>
                      <td style={{ textAlign: 'right' }}>{LIT_fmt(L.principal, 0)}</td>
                      <td>{L.status === 'Active' ? '🟢 Active' : '⚫ Close'}</td>
                      <td style={{ textAlign: 'right', color: L.refundOutstanding > 0.01 ? 'var(--bad)' : 'var(--ink-500)' }}>
                        {LIT_fmt(L.refundOutstanding, 2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsed.loans.length > 50 && (
              <div style={{ fontSize: 11, color: 'var(--ink-500)', marginTop: 4 }}>
                แสดง 50 จาก {parsed.loans.length} สัญญา
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={onClose}>ยกเลิก</button>
              <button className="btn btn-primary" onClick={() => onConfirm(parsed)}>
                ✓ นำเข้า ({parsed.loans.length} สัญญา)
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ── LeasitLoanDrawer — ดู schedule prepaid/actual/refund ────────────── */
function LeasitLoanDrawer({ loan, prepaid, actual, refund, onClose, onExportOne, onEdit, canEdit, onCalcPrepaid, onCalcActual }) {
  if (!loan) return null;
  const Modal = window.Modal;

  const pre = prepaid.filter(r => r.loanId === loan.leasitLoanId).sort((a, b) => (a.seq || 0) - (b.seq || 0));
  const act = actual.filter(r => r.loanId === loan.leasitLoanId).sort((a, b) => (a.seq || 0) - (b.seq || 0));
  const ref = refund.filter(r => r.loanId === loan.leasitLoanId).sort((a, b) => (a.refundDate || '').localeCompare(b.refundDate || ''));

  // ── PRE/POS/NON classification + principal summary ──
  const ticketRaw = String(loan.leasitTicketType || '').toUpperCase();
  const ticketLabel = ticketRaw === 'NON' ? 'NON' : ticketRaw === 'PRE' ? 'PRE' : 'POS';
  const ticketColor = ticketLabel === 'PRE' ? 'oklch(52% 0.16 250)'
                    : ticketLabel === 'NON' ? 'oklch(48% 0.14 305)'
                    : 'oklch(56% 0.18 25)';
  const ticketDesc = ticketLabel === 'PRE' ? 'Pre-financing'
                   : ticketLabel === 'NON' ? 'Non-PRE (Term Loan)'
                   : 'Post-financing';
  const principal = Number(loan.principalAmount) || 0;
  const isActive = loan.status === 'Active';
  const drawn = principal;
  const repaidPrincipal = isActive ? 0 : principal;
  const outstandingPrincipal = isActive ? principal : 0;

  // ── Maturity countdown ──
  const today = new Date();
  const todayISO = today.toISOString().slice(0, 10);
  const dueISO = loan.leasitDateDueRoll || loan.leasitDateDue || '';
  const daysToMaturity = dueISO ? Math.ceil((new Date(dueISO).getTime() - today.getTime()) / 86400000) : null;
  const maturityNear = isActive && daysToMaturity != null && daysToMaturity >= 0 && daysToMaturity <= 30;
  const maturityOverdue = isActive && daysToMaturity != null && daysToMaturity < 0;

  return (
    <Modal open={!!loan} onClose={onClose} title={`📑 ${loan.contractNo} · ลำดับ ${loan.leasitLoanId}`} maxWidth={1400}>
      <div style={{ padding: '8px 4px', fontSize: 13 }}>
        {/* Maturity warning banner */}
        {(maturityNear || maturityOverdue) && (
          <div className="card" style={{
            padding: 12, marginBottom: 12,
            background: maturityOverdue ? 'oklch(95% 0.06 22)' : 'oklch(95% 0.08 80)',
            borderLeft: '4px solid ' + (maturityOverdue ? 'var(--bad)' : 'oklch(70% 0.18 80)')
          }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>
              {maturityOverdue
                ? `⚠️ เกินกำหนดแล้ว ${Math.abs(daysToMaturity)} วัน`
                : `⏰ ครบกำหนดในอีก ${daysToMaturity} วัน`}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-700)', marginTop: 4 }}>
              ครบกำหนด: {LIT_fmtDate(dueISO)} · เงินต้นคงเหลือ {LIT_fmt(outstandingPrincipal, 0)}
            </div>
          </div>
        )}

        {/* Principal summary — เบิก/จ่ายคืน/คงเหลือ + PRE/POS tag */}
        <div className="card" style={{ padding: 12, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>💰 สรุปเงินต้น</div>
            <span style={{
              padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
              background: ticketColor, color: '#fff'
            }}>{ticketLabel}</span>
            <span style={{ fontSize: 11, color: 'var(--ink-500)' }}>
              ({ticketDesc})
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <div style={{ padding: 10, background: 'var(--ink-50)', borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>↗ เบิกมาแล้ว</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{LIT_fmt(drawn, 0)}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-500)', marginTop: 2 }}>
                รับเงิน {LIT_fmtDate(loan.leasitDateReceived)}
              </div>
            </div>
            <div style={{ padding: 10, background: 'oklch(96% 0.04 145)', borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>↙ จ่ายคืนเงินต้น</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'oklch(50% 0.14 145)' }}>{LIT_fmt(repaidPrincipal, 0)}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-500)', marginTop: 2 }}>
                {isActive ? '— (ยังไม่ปิดหนี้)' : 'ปิดหนี้ ' + LIT_fmtDate(loan.leasitDateRepaid)}
              </div>
            </div>
            <div style={{
              padding: 10, borderRadius: 8,
              background: isActive ? 'oklch(96% 0.06 22)' : 'var(--ink-50)'
            }}>
              <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>● คงเหลือเงินต้น</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: isActive ? 'var(--bad)' : 'var(--ink-500)' }}>
                {LIT_fmt(outstandingPrincipal, 0)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-500)', marginTop: 2 }}>
                {isActive ? 'ครบกำหนด ' + LIT_fmtDate(dueISO) : 'ปิดสัญญาแล้ว'}
              </div>
            </div>
          </div>
        </div>

        {/* Header card */}
        <div className="card" style={{ padding: 12, marginBottom: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <div><div style={{ fontSize: 11, color: 'var(--ink-500)' }}>โครงการ (JOB)</div>
              <div style={{ fontWeight: 600 }}>{loan.projectCode || '—'}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-700)' }}>{loan.projectName}</div>
            </div>
            <div><div style={{ fontSize: 11, color: 'var(--ink-500)' }}>วงเงินกู้</div>
              <div style={{ fontWeight: 600, fontSize: 18 }}>{LIT_fmt(loan.principalAmount, 0)}</div>
            </div>
            <div><div style={{ fontSize: 11, color: 'var(--ink-500)' }}>อัตรา/ปี · ระยะเวลา</div>
              <div style={{ fontWeight: 600 }}>{(loan.interestRate * 100).toFixed(2)}% · {loan.leasitTermDays || '—'} วัน</div>
            </div>
            <div><div style={{ fontSize: 11, color: 'var(--ink-500)' }}>สถานะ</div>
              <div style={{ fontWeight: 600 }}>{loan.status === 'Active' ? '🟢 Active' : '⚫ ปิดแล้ว ' + (LIT_fmtDate(loan.leasitDateRepaid))}</div>
            </div>
            <div><div style={{ fontSize: 11, color: 'var(--ink-500)' }}>รับเงิน</div>
              <div>{LIT_fmtDate(loan.leasitDateReceived)}</div>
            </div>
            <div><div style={{ fontSize: 11, color: 'var(--ink-500)' }}>ครบกำหนด</div>
              <div>{LIT_fmtDate(loan.leasitDateDue)}</div>
            </div>
            <div><div style={{ fontSize: 11, color: 'var(--ink-500)' }}>ครบกำหนด (โรล)</div>
              <div>{LIT_fmtDate(loan.leasitDateDueRoll) || '—'}</div>
            </div>
            <div><div style={{ fontSize: 11, color: 'var(--ink-500)' }}>เลขเช็คเงินต้น</div>
              <div>{loan.leasitPrincipalChequeNo || '—'}</div>
            </div>
          </div>
        </div>

        {/* Summary card */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 12 }}>
          <div className="card" style={{ padding: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>ดอกจ่ายล่วงหน้า</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{LIT_fmt(loan.leasitTotalPrepaid, 2)}</div>
          </div>
          <div className="card" style={{ padding: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>ดอกเกิดจริง</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{LIT_fmt(loan.leasitTotalActual, 2)}</div>
          </div>
          <div className="card" style={{ padding: 10, background: 'oklch(96% 0.05 145)' }}>
            <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>ส่วนต่าง (ต้องได้คืน)</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{LIT_fmt(loan.leasitVariance, 2)}</div>
          </div>
          <div className="card" style={{ padding: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>รับคืนแล้ว</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{LIT_fmt(loan.leasitRefunded, 2)}</div>
          </div>
          <div className="card" style={{ padding: 10, background: loan.leasitRefundOutstanding > 0.01 ? 'oklch(95% 0.06 22)' : 'oklch(96% 0.04 145)' }}>
            <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>ค้างรับคืน</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: loan.leasitRefundOutstanding > 0.01 ? 'var(--bad)' : 'inherit' }}>
              {LIT_fmt(loan.leasitRefundOutstanding, 2)}
            </div>
          </div>
        </div>

        {/* ── 3-col grid: ดอกล่วงหน้า | ดอกเกิดจริง | รับคืน ── */}
        {(() => {
          const tdCell = { padding: '2px 5px', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
          const tdR = { ...tdCell, textAlign: 'right' };
          const thStyle = { ...tdCell, fontWeight: 600, background: 'var(--ink-50)', position: 'sticky', top: 0 };
          const thR = { ...thStyle, textAlign: 'right' };
          const sectionCard = { border: '1px solid var(--ink-200)', borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column' };
          const tableBox = { flex: 1, overflowY: 'auto', maxHeight: 380 };
          return (
            <div style={{ display: 'grid', gridTemplateColumns: '5fr 5fr 3fr', gap: 8, marginTop: 8 }}>

              {/* ── PREPAID (left) ── */}
              <div style={sectionCard}>
                <div style={{ padding: '6px 10px', background: 'oklch(96% 0.05 250)', borderBottom: '1px solid var(--ink-200)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <div style={{ fontWeight: 700, fontSize: 12 }}>📋 ดอกล่วงหน้า ({pre.length})</div>
                  {canEdit && onCalcPrepaid && (
                    <button
                      className="btn btn-primary"
                      style={{ padding: '2px 8px', fontSize: 11 }}
                      title="คำนวณตารางดอกเบี้ยจ่ายล่วงหน้าใหม่ทั้งหมด (จากวันรับเงิน → วันครบกำหนด)"
                      onClick={() => {
                        if (confirm('คำนวณตารางดอกเบี้ยจ่ายล่วงหน้าใหม่? (จะแทนที่ของเดิม)')) onCalcPrepaid(loan);
                      }}
                    >⚡ คำนวณ</button>
                  )}
                </div>
                <div style={tableBox}>
                  <table className="tbl" style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                    <thead><tr>
                      <th style={thStyle}>#</th><th style={thStyle}>เริ่ม</th><th style={thStyle}>สิ้นสุด</th>
                      <th style={thR}>วัน</th><th style={thR}>ดอกเบี้ย</th>
                    </tr></thead>
                    <tbody>
                      {pre.map(p => (
                        <tr key={p.seq} style={{ borderBottom: '1px solid var(--ink-100)' }}>
                          <td style={tdCell}>{p.seq}</td>
                          <td style={tdCell}>{LIT_fmtDate(p.dateStart)}</td>
                          <td style={tdCell}>{LIT_fmtDate(p.dateEnd)}</td>
                          <td style={tdR}>{p.days}</td>
                          <td style={tdR}>{LIT_fmt(p.intAmount, 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr style={{ fontWeight: 700, background: 'var(--ink-50)' }}>
                      <td colSpan={4} style={{ ...tdCell, textAlign: 'right' }}>รวม</td>
                      <td style={tdR}>{LIT_fmt(pre.reduce((s, p) => s + (Number(p.intAmount) || 0), 0), 2)}</td>
                    </tr></tfoot>
                  </table>
                </div>
              </div>

              {/* ── ACTUAL (middle) ── */}
              <div style={sectionCard}>
                <div style={{ padding: '6px 10px', background: 'oklch(96% 0.05 145)', borderBottom: '1px solid var(--ink-200)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <div style={{ fontWeight: 700, fontSize: 12 }}>✅ ดอกเกิดจริง ({act.length})</div>
                  {canEdit && onCalcActual && (
                    <button
                      className="btn btn-primary"
                      style={{ padding: '2px 8px', fontSize: 11 }}
                      title="คำนวณดอกที่เกิดจริง: ถ้าปิดสัญญาแล้ว = จากวันรับ → วันคืนเงิน, ถ้ายัง Active = ถึงวันนี้"
                      onClick={() => {
                        if (confirm('คำนวณดอกที่เกิดจริงใหม่? (จะแทนที่ของเดิม)')) onCalcActual(loan);
                      }}
                    >⚡ คำนวณ</button>
                  )}
                </div>
                <div style={tableBox}>
                  <table className="tbl" style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                    <thead><tr>
                      <th style={thStyle}>#</th><th style={thStyle}>เริ่ม</th><th style={thStyle}>สิ้นสุด</th>
                      <th style={thR}>วัน</th><th style={thR}>ดอกเบี้ย</th>
                    </tr></thead>
                    <tbody>
                      {act.length === 0 ? (
                        <tr><td colSpan={5} style={{ ...tdCell, textAlign: 'center', padding: '12px 6px', color: 'var(--ink-500)' }}>
                          ยังไม่มีข้อมูลดอกเกิดจริง — กด ⚡ คำนวณ
                        </td></tr>
                      ) : act.map(p => (
                        <tr key={p.seq} style={{ borderBottom: '1px solid var(--ink-100)' }}>
                          <td style={tdCell}>{p.seq}</td>
                          <td style={tdCell}>{LIT_fmtDate(p.dateStart)}</td>
                          <td style={tdCell}>{LIT_fmtDate(p.dateEnd)}</td>
                          <td style={tdR}>{p.days}</td>
                          <td style={tdR}>{LIT_fmt(p.intAmount, 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr style={{ fontWeight: 700, background: 'var(--ink-50)' }}>
                      <td colSpan={4} style={{ ...tdCell, textAlign: 'right' }}>รวม</td>
                      <td style={tdR}>{LIT_fmt(act.reduce((s, p) => s + (Number(p.intAmount) || 0), 0), 2)}</td>
                    </tr></tfoot>
                  </table>
                </div>
              </div>

              {/* ── REFUND (right, narrower) ── */}
              <div style={sectionCard}>
                <div style={{ padding: '6px 10px', background: 'oklch(96% 0.05 80)', borderBottom: '1px solid var(--ink-200)' }}>
                  <div style={{ fontWeight: 700, fontSize: 12 }}>💸 รับคืน/จ่ายคืน ({ref.length})</div>
                </div>
                <div style={tableBox}>
                  {ref.length === 0 ? (
                    <div style={{ padding: 12, color: 'var(--ink-500)', textAlign: 'center', fontSize: 11 }}>
                      ยังไม่มีรับคืน
                    </div>
                  ) : (
                    <table className="tbl" style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                      <thead><tr>
                        <th style={thStyle}>วันที่</th><th style={thStyle}>ประเภท</th><th style={thR}>จำนวน</th>
                      </tr></thead>
                      <tbody>
                        {ref.map((r, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid var(--ink-100)' }} title={`${r.note || ''}\n${r.refDoc || ''}`}>
                            <td style={tdCell}>{LIT_fmtDate(r.refundDate)}</td>
                            <td style={tdCell}>{r.kind === 'principal' ? '💰 เงินต้น' : r.refundType === 'RV' ? '🧾 RV' : '🏦 โอน'}</td>
                            <td style={tdR}>{LIT_fmt(r.amount, 2)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot><tr style={{ fontWeight: 700, background: 'var(--ink-50)' }}>
                        <td colSpan={2} style={{ ...tdCell, textAlign: 'right' }}>รวม</td>
                        <td style={tdR}>{LIT_fmt(ref.reduce((s, r) => s + (Number(r.amount) || 0), 0), 2)}</td>
                      </tr></tfoot>
                    </table>
                  )}
                </div>
              </div>

            </div>
          );
        })()}

        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'space-between' }}>
          <div>
            {onEdit && (
              <button className="btn" style={{ background: 'oklch(60% 0.16 250)', color: '#fff' }} onClick={() => onEdit(loan)}>
                ✏️ แก้ไข / เพิ่มจ่ายคืน
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={onClose}>ปิด</button>
            <button className="btn btn-primary" onClick={() => onExportOne(loan)}>
              📥 Export ชีตสัญญานี้ (มีสูตร)
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ── LeasitProjectAutocomplete — ค้นหาโครงการจาก data.projects ─────────── */
function LeasitProjectAutocomplete({ value, name, projects, onPick, onChangeManual }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const wrapRef = React.useRef(null);

  // ปิด dropdown เมื่อคลิกนอก
  React.useEffect(() => {
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const matches = React.useMemo(() => {
    if (!window.LeasitEngine) return [];
    return window.LeasitEngine.litSearchProjects(projects, query || value, 10);
  }, [projects, query, value]);

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 6 }}>
        <input
          className="input"
          placeholder="รหัสโครงการ"
          value={value || ''}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); onChangeManual('projectCode', e.target.value); }}
          onFocus={() => setOpen(true)}
        />
        <input
          className="input"
          placeholder="ชื่อโครงการ"
          value={name || ''}
          onChange={(e) => onChangeManual('projectName', e.target.value)}
        />
      </div>
      {open && matches.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          background: 'var(--panel)', border: '1px solid var(--ink-200)', borderRadius: 8,
          marginTop: 4, maxHeight: 280, overflowY: 'auto', boxShadow: 'var(--shadow-md)'
        }}>
          {matches.map((m, i) => (
            <div
              key={m.code + '-' + i}
              onClick={() => { onPick(m); setOpen(false); setQuery(''); }}
              style={{
                padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--ink-100)',
                fontSize: 13
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--ink-50)'}
              onMouseLeave={(e) => e.currentTarget.style.background = ''}
            >
              <div style={{ fontWeight: 600, color: 'var(--brand-700)' }}>{m.code || '— ไม่มีรหัส —'}</div>
              <div style={{ color: 'var(--ink-700)', fontSize: 12 }}>{m.name || '—'}</div>
            </div>
          ))}
          <div style={{ padding: '6px 12px', fontSize: 11, color: 'var(--ink-500)', background: 'var(--ink-50)' }}>
            หรือพิมพ์เองได้เลย (ไม่จำเป็นต้องเลือกจากลิสต์)
          </div>
        </div>
      )}
    </div>
  );
}

/* ── LeasitLoanForm — เพิ่ม/แก้ไขสัญญาลีซอิท ─────────────────────────── */
function LeasitLoanForm({ open, mode, initial, data, onClose, onSave, onDelete, canEdit }) {
  const Modal = window.Modal;
  const E = window.LeasitEngine || {};
  const [draft, setDraft] = React.useState(null);
  const [preRows, setPreRows] = React.useState([]);
  const [actRows, setActRows] = React.useState([]);
  const [refRows, setRefRows] = React.useState([]);
  const [tab, setTab] = React.useState('master');
  const [loadErr, setLoadErr] = React.useState('');

  // โหลด initial เมื่อเปิด — defensive (กัน window.LeasitEngine ยังไม่โหลด / data ว่าง)
  React.useEffect(() => {
    if (!open) return;
    setLoadErr('');
    try {
      const E = window.LeasitEngine;
      if (!E || typeof E.litBlankLoanDraft !== 'function') {
        setLoadErr('engine ยังไม่พร้อม — ลอง refresh หน้า');
        return;
      }
      if (mode === 'edit' && initial) {
        setDraft({ ...initial });
        const loanId = initial.leasitLoanId;
        setPreRows((data?.interestSchedulePrepaid || []).filter(r => r.loanId === loanId).slice().sort((a, b) => (a.seq || 0) - (b.seq || 0)));
        setActRows((data?.interestScheduleActual || []).filter(r => r.loanId === loanId).slice().sort((a, b) => (a.seq || 0) - (b.seq || 0)));
        setRefRows((data?.interestRefund || []).filter(r => r.loanId === loanId).slice());
      } else {
        setDraft(E.litBlankLoanDraft(data?.debtMaster || []));
        setPreRows([]); setActRows([]); setRefRows([]);
      }
      setTab('master');
    } catch (err) {
      console.error('[Leasit] form init error:', err);
      setLoadErr(String(err && err.message || err));
    }
  }, [open, mode, initial]);

  // ถ้า open แต่ engine error → render กล่อง error แทน
  if (open && loadErr) {
    return (
      <Modal open={true} onClose={onClose} title="⚠️ เปิดฟอร์มไม่ได้" maxWidth={500}>
        <div style={{ padding: 12 }}>
          <div style={{ color: 'var(--bad)', fontWeight: 600, marginBottom: 8 }}>{loadErr}</div>
          <div style={{ fontSize: 12, color: 'var(--ink-700)' }}>
            ลอง <button className="btn btn-ghost" onClick={() => window.location.reload()}>↻ refresh หน้า</button> แล้วลองอีกครั้ง
          </div>
        </div>
      </Modal>
    );
  }

  if (!open || !draft) return null;

  const set = (k, v) => setDraft(d => {
    const next = { ...d, [k]: v };
    // auto-compute termDays
    if (k === 'leasitDateReceived' || k === 'leasitDateDue') {
      next.leasitTermDays = E.litCalcTermDays(
        k === 'leasitDateReceived' ? v : next.leasitDateReceived,
        k === 'leasitDateDue' ? v : next.leasitDateDue
      );
    }
    return next;
  });

  const projects = data?.projects || [];
  const principal = Number(draft.principalAmount) || 0;
  const rate = Number(draft.interestRate) || 0;
  const totPre = preRows.reduce((s, r) => s + (Number(r.intAmount) || 0), 0);
  const totAct = actRows.reduce((s, r) => s + (Number(r.intAmount) || 0), 0);
  const totRef = refRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  // ── Schedule actions ──
  const generatePrepaid = () => {
    if (!draft.leasitDateReceived || !draft.leasitDateDue || !principal || !rate) {
      alert('กรอก วันรับเงิน · วันครบกำหนด · จำนวนเงินกู้ · อัตราดอกเบี้ย ก่อน');
      return;
    }
    const rows = E.litGenerateMonthlySchedule(principal, rate, draft.leasitDateReceived, draft.leasitDateDue);
    setPreRows(rows);
  };

  const generateActualFromClose = () => {
    if (!draft.leasitDateReceived || !draft.leasitDateRepaid || !principal || !rate) {
      alert('กรอก วันรับเงิน · วันคืนเงิน · จำนวนเงินกู้ · อัตรา ก่อน');
      return;
    }
    const rows = E.litGenerateActualFromClose(principal, rate, draft.leasitDateReceived, draft.leasitDateRepaid);
    setActRows(rows);
  };

  const updateRow = (kind, idx, key, val) => {
    const setter = kind === 'pre' ? setPreRows : kind === 'act' ? setActRows : setRefRows;
    setter(rows => rows.map((r, i) => i === idx ? { ...r, [key]: val } : r));
  };
  const removeRow = (kind, idx) => {
    const setter = kind === 'pre' ? setPreRows : kind === 'act' ? setActRows : setRefRows;
    setter(rows => rows.filter((_, i) => i !== idx));
  };
  const addRefundRow = (kind) => {
    setRefRows(rows => [...rows, { refundDate: '', amount: 0, refDoc: '', refundType: kind, note: '', kind }]);
  };
  const addPrepaidRow = () => {
    setPreRows(rows => [...rows, {
      seq: rows.length + 1, month: '', year: null, dateStart: '', dateEnd: '',
      days: 0, principal: principal, intRate: rate, intAmount: 0, chequeNo: '', paymentDate: ''
    }]);
  };

  const handleSave = () => {
    if (!draft.contractNo.trim()) { alert('กรุณากรอกเลขที่สัญญา'); return; }
    if (!principal) { alert('กรุณากรอกจำนวนเงินกู้'); return; }
    // status = Close ถ้ามีวันคืนเงิน
    const status = draft.leasitDateRepaid ? 'Close' : 'Active';
    const finalDraft = { ...draft, status };
    onSave(finalDraft, preRows, actRows, refRows);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'edit' ? `✏️ แก้ไขสัญญา · ลำดับ ${draft.leasitLoanId}` : '➕ เพิ่มสัญญาลีซอิทใหม่'}
      maxWidth={1300}
    >
      <div style={{ padding: '8px 4px', fontSize: 13 }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, borderBottom: '1px solid var(--ink-200)' }}>
          {[
            { k: 'master', l: '📋 ข้อมูลสัญญา' },
            { k: 'prepaid', l: `💰 ดอกล่วงหน้า (${preRows.length})` },
            { k: 'actual', l: `✅ ดอกเกิดจริง (${actRows.length})` },
            { k: 'refund', l: `💸 รับคืน/จ่ายคืน (${refRows.length})` }
          ].map(t => (
            <button
              key={t.k}
              className={tab === t.k ? 'btn btn-primary' : 'btn btn-ghost'}
              onClick={() => setTab(t.k)}
              style={{ borderRadius: '8px 8px 0 0', marginBottom: -1 }}
            >{t.l}</button>
          ))}
        </div>

        {/* Tab: master */}
        {tab === 'master' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: 'var(--ink-500)' }}>ลำดับที่</label>
              <input className="input" value={draft.leasitLoanId} disabled />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--ink-500)' }}>เลขที่สัญญา *</label>
              <input className="input" value={draft.contractNo} onChange={(e) => set('contractNo', e.target.value)} placeholder="LITSM/PBF/68-XXXXX" />
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ fontSize: 11, color: 'var(--ink-500)' }}>โครงการ (พิมพ์เพื่อค้นหา / เลือกจากลิสต์ / กรอกเอง)</label>
              <LeasitProjectAutocomplete
                value={draft.projectCode}
                name={draft.projectName}
                projects={projects}
                onPick={(m) => setDraft(d => ({ ...d, projectCode: m.code, projectName: m.name }))}
                onChangeManual={(k, v) => setDraft(d => ({ ...d, [k]: v }))}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--ink-500)' }}>ประเภทตั๋ว</label>
              <select className="input" value={draft.leasitTicketType} onChange={(e) => set('leasitTicketType', e.target.value)}>
                <option value="PRE">PRE — Pre-financing</option>
                <option value="POS">POS — Post-financing</option>
                <option value="NON">NON — Non-PRE</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--ink-500)' }}>จำนวนเงินกู้ (เงินต้น) *</label>
              <input type="number" className="input" value={draft.principalAmount} onChange={(e) => set('principalAmount', Number(e.target.value) || 0)} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--ink-500)' }}>อัตราดอกเบี้ย/ปี (decimal เช่น 0.15)</label>
              <input type="number" step="0.01" className="input" value={draft.interestRate} onChange={(e) => set('interestRate', Number(e.target.value) || 0)} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--ink-500)' }}>วันที่รับเงิน *</label>
              <input type="date" className="input" value={draft.leasitDateReceived || ''} onChange={(e) => set('leasitDateReceived', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--ink-500)' }}>วันที่ครบกำหนด *</label>
              <input type="date" className="input" value={draft.leasitDateDue || ''} onChange={(e) => set('leasitDateDue', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--ink-500)' }}>ครบกำหนด (โรลตั๋ว)</label>
              <input type="date" className="input" value={draft.leasitDateDueRoll || ''} onChange={(e) => set('leasitDateDueRoll', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--ink-500)' }}>ระยะเวลากู้ (วัน · auto)</label>
              <input className="input" value={draft.leasitTermDays || 0} disabled />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--ink-500)' }}>เลขที่เช็คเงินต้น</label>
              <input className="input" value={draft.leasitPrincipalChequeNo || ''} onChange={(e) => set('leasitPrincipalChequeNo', e.target.value)} placeholder="10000081" />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--ink-500)' }}>เลขที่เช็คดอกเบี้ย (รวม — รายงวดในแท็บถัดไป)</label>
              <input className="input" value={draft.leasitInterestChequeNo || ''} onChange={(e) => set('leasitInterestChequeNo', e.target.value)} placeholder="10066733" />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--ink-500)' }}>วันที่คืนเงิน (เว้นว่าง = ยังไม่ปิด)</label>
              <input type="date" className="input" value={draft.leasitDateRepaid || ''} onChange={(e) => set('leasitDateRepaid', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--ink-500)' }}>สถานะ (auto จากวันคืนเงิน)</label>
              <input className="input" value={draft.leasitDateRepaid ? 'Close' : 'Active'} disabled />
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ fontSize: 11, color: 'var(--ink-500)' }}>หมายเหตุ</label>
              <textarea className="input" rows={2} value={draft.note || ''} onChange={(e) => set('note', e.target.value)} />
            </div>
          </div>
        )}

        {/* Tab: prepaid */}
        {tab === 'prepaid' && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <button className="btn btn-primary" onClick={generatePrepaid}>
                ⚡ คำนวณตารางดอกเบี้ยอัตโนมัติ (รายเดือน)
              </button>
              <button className="btn btn-ghost" onClick={addPrepaidRow}>+ เพิ่มงวด</button>
              <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 600 }}>
                รวม: {LIT_fmt(totPre, 2)}
              </span>
            </div>
            <div style={{ maxHeight: 380, overflowY: 'auto', border: '1px solid var(--ink-200)', borderRadius: 8 }}>
              <table className="tbl" style={{ width: '100%', fontSize: 12 }}>
                <thead><tr>
                  <th>#</th><th>เริ่ม</th><th>สิ้นสุด</th>
                  <th style={{ textAlign: 'right' }}>เงินต้น</th>
                  <th style={{ textAlign: 'right' }}>อัตรา</th>
                  <th style={{ textAlign: 'right' }}>วัน</th>
                  <th style={{ textAlign: 'right' }}>ดอกเบี้ย</th>
                  <th>เลขเช็ค</th><th>วันจ่าย</th><th></th>
                </tr></thead>
                <tbody>
                  {preRows.map((r, i) => (
                    <tr key={i}>
                      <td>{r.seq || i + 1}</td>
                      <td><input type="date" className="input" style={{ minWidth: 130 }} value={r.dateStart || ''} onChange={(e) => updateRow('pre', i, 'dateStart', e.target.value)} /></td>
                      <td><input type="date" className="input" style={{ minWidth: 130 }} value={r.dateEnd || ''} onChange={(e) => updateRow('pre', i, 'dateEnd', e.target.value)} /></td>
                      <td><input type="number" className="input" style={{ textAlign: 'right', width: 110 }} value={r.principal || 0} onChange={(e) => updateRow('pre', i, 'principal', Number(e.target.value) || 0)} /></td>
                      <td><input type="number" step="0.01" className="input" style={{ textAlign: 'right', width: 70 }} value={r.intRate || 0} onChange={(e) => updateRow('pre', i, 'intRate', Number(e.target.value) || 0)} /></td>
                      <td><input type="number" className="input" style={{ textAlign: 'right', width: 60 }} value={r.days || 0} onChange={(e) => updateRow('pre', i, 'days', Number(e.target.value) || 0)} /></td>
                      <td><input type="number" step="0.01" className="input" style={{ textAlign: 'right', width: 100 }} value={r.intAmount || 0} onChange={(e) => updateRow('pre', i, 'intAmount', Number(e.target.value) || 0)} /></td>
                      <td><input className="input" style={{ width: 110 }} value={r.chequeNo || ''} onChange={(e) => updateRow('pre', i, 'chequeNo', e.target.value)} placeholder="10066733" /></td>
                      <td><input type="date" className="input" style={{ minWidth: 130 }} value={r.paymentDate || ''} onChange={(e) => updateRow('pre', i, 'paymentDate', e.target.value)} /></td>
                      <td><button className="btn btn-icon btn-ghost" onClick={() => removeRow('pre', i)} title="ลบ">✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--ink-500)' }}>
              💡 สูตรคำนวณ: เงินต้น × อัตรา × วัน / 365 — กดปุ่ม "⚡ คำนวณ" เพื่อสร้างใหม่ทั้งตาราง (split รายเดือน)
            </div>
          </div>
        )}

        {/* Tab: actual */}
        {tab === 'actual' && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <button className="btn btn-primary" onClick={generateActualFromClose} disabled={!draft.leasitDateRepaid}>
                ⚡ คำนวณจากวันรับ → วันคืนเงิน
              </button>
              <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 600 }}>
                รวม: {LIT_fmt(totAct, 2)}
              </span>
            </div>
            {!draft.leasitDateRepaid && (
              <div style={{ padding: 10, background: 'var(--ink-50)', borderRadius: 8, fontSize: 12, color: 'var(--ink-700)', marginBottom: 8 }}>
                ℹ️ ดอกเบี้ยเกิดจริง = คำนวณตอนปิดสัญญา (กรอก "วันที่คืนเงิน" ในแท็บ "ข้อมูลสัญญา" ก่อน)
              </div>
            )}
            <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--ink-200)', borderRadius: 8 }}>
              <table className="tbl" style={{ width: '100%', fontSize: 12 }}>
                <thead><tr>
                  <th>#</th><th>เริ่ม</th><th>สิ้นสุด</th>
                  <th style={{ textAlign: 'right' }}>เงินต้น</th>
                  <th style={{ textAlign: 'right' }}>อัตรา</th>
                  <th style={{ textAlign: 'right' }}>วัน</th>
                  <th style={{ textAlign: 'right' }}>ดอกเบี้ย</th>
                  <th></th>
                </tr></thead>
                <tbody>
                  {actRows.map((r, i) => (
                    <tr key={i}>
                      <td>{r.seq || i + 1}</td>
                      <td><input type="date" className="input" style={{ minWidth: 130 }} value={r.dateStart || ''} onChange={(e) => updateRow('act', i, 'dateStart', e.target.value)} /></td>
                      <td><input type="date" className="input" style={{ minWidth: 130 }} value={r.dateEnd || ''} onChange={(e) => updateRow('act', i, 'dateEnd', e.target.value)} /></td>
                      <td><input type="number" className="input" style={{ textAlign: 'right', width: 110 }} value={r.principal || 0} onChange={(e) => updateRow('act', i, 'principal', Number(e.target.value) || 0)} /></td>
                      <td><input type="number" step="0.01" className="input" style={{ textAlign: 'right', width: 70 }} value={r.intRate || 0} onChange={(e) => updateRow('act', i, 'intRate', Number(e.target.value) || 0)} /></td>
                      <td><input type="number" className="input" style={{ textAlign: 'right', width: 60 }} value={r.days || 0} onChange={(e) => updateRow('act', i, 'days', Number(e.target.value) || 0)} /></td>
                      <td><input type="number" step="0.01" className="input" style={{ textAlign: 'right', width: 100 }} value={r.intAmount || 0} onChange={(e) => updateRow('act', i, 'intAmount', Number(e.target.value) || 0)} /></td>
                      <td><button className="btn btn-icon btn-ghost" onClick={() => removeRow('act', i)} title="ลบ">✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab: refund + principal repayment */}
        {tab === 'refund' && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <button className="btn btn-ghost" onClick={() => addRefundRow('interest')}>+ รับคืนดอก (RV/โอน)</button>
              <button className="btn btn-ghost" onClick={() => addRefundRow('principal')}>+ จ่ายคืนเงินต้น</button>
              <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 600 }}>
                รวม: {LIT_fmt(totRef, 2)}
              </span>
            </div>
            <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--ink-200)', borderRadius: 8 }}>
              <table className="tbl" style={{ width: '100%', fontSize: 12 }}>
                <thead><tr>
                  <th>ประเภท</th><th>วันที่</th>
                  <th style={{ textAlign: 'right' }}>จำนวน</th>
                  <th>เอกสารอ้างอิง</th><th>หมายเหตุ</th><th></th>
                </tr></thead>
                <tbody>
                  {refRows.map((r, i) => (
                    <tr key={i}>
                      <td>
                        <select className="input" style={{ width: 130 }} value={r.kind || (r.refundType === 'RV' ? 'interest' : 'interest')} onChange={(e) => updateRow('ref', i, 'kind', e.target.value)}>
                          <option value="interest">🧾 รับคืนดอก</option>
                          <option value="principal">💰 จ่ายคืนเงินต้น</option>
                        </select>
                      </td>
                      <td><input type="date" className="input" style={{ minWidth: 130 }} value={r.refundDate || ''} onChange={(e) => updateRow('ref', i, 'refundDate', e.target.value)} /></td>
                      <td><input type="number" step="0.01" className="input" style={{ textAlign: 'right', width: 120 }} value={r.amount || 0} onChange={(e) => updateRow('ref', i, 'amount', Number(e.target.value) || 0)} /></td>
                      <td><input className="input" style={{ minWidth: 130 }} value={r.refDoc || ''} onChange={(e) => updateRow('ref', i, 'refDoc', e.target.value)} placeholder="RV2603-036 / PV…" /></td>
                      <td><input className="input" value={r.note || ''} onChange={(e) => updateRow('ref', i, 'note', e.target.value)} placeholder="โอนคืน/หักตอน RV/…" /></td>
                      <td><button className="btn btn-icon btn-ghost" onClick={() => removeRow('ref', i)} title="ลบ">✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--ink-500)' }}>
              💡 รับคืนดอก = ส่วนต่างที่ลีซอิทคืนให้ (RV หักกลบ / โอนคืน) · จ่ายคืนเงินต้น = บันทึกการคืนเงินต้น (PV/ใบจ่าย)
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'space-between', borderTop: '1px solid var(--ink-200)', paddingTop: 12 }}>
          <div>
            {mode === 'edit' && canEdit && (
              <button
                className="btn"
                style={{ background: 'var(--bad)', color: '#fff' }}
                onClick={() => { if (confirm(`ลบสัญญา ${draft.contractNo}? · จะลบ schedule prepaid/actual/refund ของสัญญานี้ทั้งหมด`)) onDelete(draft); }}
              >
                🗑️ ลบสัญญา
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={onClose}>ยกเลิก</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={!canEdit}>
              💾 บันทึก
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ── LeasitPanel — main component ─────────────────────────────────────── */
function LeasitPanel({ data, setData, toast, canEdit }) {
  const [showImport, setShowImport] = React.useState(false);
  const [viewLoan, setViewLoan] = React.useState(null);
  // formState: null = ปิด, { mode: 'new'|'edit', initial: row }
  const [formState, setFormState] = React.useState(null);
  const [maturityOpen, setMaturityOpen] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 15;
  const [query, setQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  // sort object format ที่ FilterableColHeader คาด: {key, dir}
  const [sort, setSort] = React.useState({ key: 'leasitLoanId', dir: 'asc' });
  // colFilters: { colKey: Set<displayValue> }
  const [colFilters, setColFilters] = React.useState({});
  const [openCol, setOpenCol] = React.useState(null);

  // ── dedupe: leasit rows ที่มี loanId เดียวกัน → เก็บ "ลำดับความสำคัญ" ──
  //   1) prefer id ที่ขึ้น 'lit_' (deterministic จาก deploy ใหม่)
  //   2) prefer มี leasitTotalPrepaid > 0 (data ครบ)
  //   3) prefer updated ล่าสุด (ถ้ามี updated_at)
  const allRowsRaw = (data?.debtMaster || []).filter(r => r.leasitSource === true);
  const dupCount = React.useMemo(() => {
    const cnt = {};
    allRowsRaw.forEach(r => { const k = r.leasitLoanId; cnt[k] = (cnt[k] || 0) + 1; });
    let dup = 0;
    Object.values(cnt).forEach(n => { if (n > 1) dup += (n - 1); });
    return dup;
  }, [allRowsRaw]);
  const allRows = React.useMemo(() => {
    const byId = new Map();
    allRowsRaw.forEach(r => {
      const k = r.leasitLoanId;
      if (k == null) return;
      const prev = byId.get(k);
      if (!prev) { byId.set(k, r); return; }
      // เก็บแถวที่ "ดีกว่า"
      const score = (x) => (String(x.id || '').startsWith('lit_') ? 4 : 0)
                        + ((Number(x.leasitTotalPrepaid) || 0) > 0 ? 2 : 0)
                        + (x.leasitDateRepaid ? 1 : 0);
      if (score(r) > score(prev)) byId.set(k, r);
    });
    return Array.from(byId.values());
  }, [allRowsRaw]);
  const prepaid = data?.interestSchedulePrepaid || [];
  const actual = data?.interestScheduleActual || [];
  const refund = data?.interestRefund || [];

  // ── คำสั่ง cleanup duplicates: ลบจริงจาก Supabase ──
  const handleCleanupDuplicates = async () => {
    if (!dupCount) return;
    const groupMap = new Map();
    allRowsRaw.forEach(r => {
      const k = r.leasitLoanId; if (k == null) return;
      if (!groupMap.has(k)) groupMap.set(k, []);
      groupMap.get(k).push(r);
    });
    const toDelete = [];
    groupMap.forEach((rows, k) => {
      if (rows.length <= 1) return;
      const winner = allRows.find(w => w.leasitLoanId === k);
      rows.forEach(r => { if (r.id !== winner.id) toDelete.push(r.id); });
    });
    if (!toDelete.length) return;
    if (!confirm(`ลบ debtMaster ซ้ำ ${toDelete.length} แถว? (คงเหลือ ${allRows.length} สัญญา)`)) return;
    try {
      if (window.WTPData && window.WTPData.forceDeleteRows) {
        await window.WTPData.forceDeleteRows('debtMaster', toDelete);
      }
      setData(d => ({ ...d, debtMaster: (d.debtMaster || []).filter(r => !toDelete.includes(r.id)) }));
      if (toast) toast(`ลบสัญญาซ้ำ ${toDelete.length} แถวแล้ว`, 'success');
    } catch (e) {
      if (toast) toast('ลบไม่สำเร็จ: ' + (e.message || e), 'error');
    }
  };

  // Filtered
  const filtered = React.useMemo(() => {
    let rows = allRows;
    if (statusFilter !== 'all') rows = rows.filter(r => r.status === statusFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      rows = rows.filter(r =>
        (r.contractNo || '').toLowerCase().includes(q) ||
        (r.projectName || '').toLowerCase().includes(q) ||
        (r.projectCode || '').toLowerCase().includes(q) ||
        String(r.leasitLoanId || '').includes(q)
      );
    }
    // ── apply column filters (Excel-style) ──
    for (const [key, vals] of Object.entries(colFilters)) {
      if (vals && vals.size > 0) {
        rows = rows.filter(r => vals.has(getColDisplayValue(r, key)));
      }
    }
    // ── dynamic sort ──
    // helper: เงินต้นจ่ายคืน + คงเหลือ (computed)
    const litRepaid = (r) => r.leasitPrincipalRepaid != null
      ? (Number(r.leasitPrincipalRepaid) || 0)
      : (r.status === 'Close' ? (Number(r.principalAmount) || 0) : 0);
    const getSortVal = (r, key) => {
      switch (key) {
        case 'leasitLoanId': return Number(r.leasitLoanId) || 0;
        case 'principalAmount': return Number(r.principalAmount) || 0;
        case 'principalRepaid': return litRepaid(r);
        case 'principalOutstanding': return (Number(r.principalAmount) || 0) - litRepaid(r);
        case 'interestRate': return Number(r.interestRate) || 0;
        case 'leasitDateReceived': return String(r.leasitDateReceived || '');
        case 'leasitDateDue': return String(r.leasitDateDue || '');
        case 'leasitRefundOutstanding': return Number(r.leasitRefundOutstanding) || 0;
        default: return String(r[sort.key] || '');
      }
    };
    const dir = sort.dir === 'desc' ? -1 : 1;
    return rows.slice().sort((a, b) => {
      const va = getSortVal(a, sort.key);
      const vb = getSortVal(b, sort.key);
      if (typeof va === 'number') return (va - vb) * dir;
      return va.localeCompare(vb, 'th') * dir;
    });
  }, [allRows, query, statusFilter, sort, colFilters]);

  // ── display value ต่อคอลัมน์ (ใช้ใน column filter dropdown) ──
  function getColDisplayValue(r, key) {
    switch (key) {
      case 'leasitLoanId': return String(r.leasitLoanId || '');
      case 'leasitTicketType': return String(r.leasitTicketType || '').toUpperCase() || 'POS';
      case 'contractNo': return r.contractNo || '—';
      case 'projectCode': return r.projectCode || '—';
      case 'projectName': return r.projectName || '—';
      case 'principalAmount': return LIT_fmt(r.principalAmount, 0);
      case 'principalRepaid': {
        const v = r.leasitPrincipalRepaid != null ? Number(r.leasitPrincipalRepaid) : (r.status === 'Close' ? Number(r.principalAmount) : 0);
        return LIT_fmt(v || 0, 0);
      }
      case 'principalOutstanding': {
        const rep = r.leasitPrincipalRepaid != null ? Number(r.leasitPrincipalRepaid) : (r.status === 'Close' ? Number(r.principalAmount) : 0);
        return LIT_fmt((Number(r.principalAmount) || 0) - (rep || 0), 0);
      }
      case 'interestRate': return (Number(r.interestRate) * 100).toFixed(2) + '%';
      case 'leasitDateReceived': return LIT_fmtDate(r.leasitDateReceived) || '—';
      case 'leasitDateDue': return LIT_fmtDate(r.leasitDateDue) || '—';
      case 'status': return r.status === 'Active' ? '🟢 Active' : '⚫ ปิดแล้ว';
      case 'leasitTotalPrepaid': return LIT_fmt(r.leasitTotalPrepaid, 2);
      case 'leasitTotalActual': return LIT_fmt(r.leasitTotalActual, 2);
      case 'leasitVariance': return LIT_fmt(r.leasitVariance, 2);
      case 'leasitRefunded': return LIT_fmt(r.leasitRefunded, 2);
      case 'leasitRefundOutstanding': return LIT_fmt(r.leasitRefundOutstanding, 2);
      default: return String(r[key] || '—');
    }
  }
  // sort-value ที่แท้จริง (ISO date/raw number) สำหรับ dropdown ที่ต้องเรียงตามค่าจริง
  function getColSortValue(r, key) {
    const rep = r.leasitPrincipalRepaid != null ? Number(r.leasitPrincipalRepaid) : (r.status === 'Close' ? Number(r.principalAmount) : 0);
    switch (key) {
      case 'leasitLoanId': return Number(r.leasitLoanId) || 0;
      case 'principalAmount': return Number(r.principalAmount) || 0;
      case 'principalRepaid': return rep || 0;
      case 'principalOutstanding': return (Number(r.principalAmount) || 0) - (rep || 0);
      case 'interestRate': return Number(r.interestRate) || 0;
      case 'leasitDateReceived': return r.leasitDateReceived || '';
      case 'leasitDateDue': return r.leasitDateDue || '';
      case 'leasitRefundOutstanding': return Number(r.leasitRefundOutstanding) || 0;
      default: return undefined;
    }
  }

  const sortToggle = (key) => {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
  };

  // KPIs
  const totPre = allRows.reduce((s, r) => s + (Number(r.leasitTotalPrepaid) || 0), 0);
  const totAct = allRows.reduce((s, r) => s + (Number(r.leasitTotalActual) || 0), 0);
  const totVar = allRows.reduce((s, r) => s + (Number(r.leasitVariance) || 0), 0);
  const totRef = allRows.reduce((s, r) => s + (Number(r.leasitRefunded) || 0), 0);
  const totOut = allRows.reduce((s, r) => s + (Number(r.leasitRefundOutstanding) || 0), 0);
  const activeCnt = allRows.filter(r => r.status === 'Active').length;
  const closedCnt = allRows.filter(r => r.status !== 'Active').length;

  // Import handler — upsert debtMaster + replace 3 child tables for imported loanIds
  const handleImport = (parsed) => {
    if (!parsed || !parsed.loans.length) return;
    const litLoanIds = new Set(parsed.loans.map(L => L.loanId));
    let updated;
    setData(d => {
      // 1) debtMaster — keep non-leasit + replace leasit rows that overlap
      const existing = d.debtMaster || [];
      const keepDm = existing.filter(r => !r.leasitSource || !litLoanIds.has(r.leasitLoanId));
      const newDm = parsed.loans.map(L => window.LeasitEngine.litLoanToDebtRow(L));
      const nextDm = keepDm.concat(newDm);

      const keepPre = (d.interestSchedulePrepaid || []).filter(r => !litLoanIds.has(r.loanId));
      const newPre = parsed.prepaid.map((p, i) => ({ id: litRowId(p.loanId, 'pre', p.seq || i + 1), ...p }));
      const keepAct = (d.interestScheduleActual || []).filter(r => !litLoanIds.has(r.loanId));
      const newAct = parsed.actual.map((p, i) => ({ id: litRowId(p.loanId, 'act', p.seq || i + 1), ...p }));
      const keepRef = (d.interestRefund || []).filter(r => !litLoanIds.has(r.loanId));
      const newRef = parsed.refund.map((p, i) => ({ id: litRowId(p.loanId, 'ref', i + 1), ...p }));

      updated = {
        ...d,
        debtMaster: nextDm,
        interestSchedulePrepaid: keepPre.concat(newPre),
        interestScheduleActual: keepAct.concat(newAct),
        interestRefund: keepRef.concat(newRef)
      };
      return updated;
    });
    // ★ ต้องส่ง updated เข้า forceSyncNow ไม่งั้นใช้ cachedData เก่า → push delete แถวที่เพิ่งสร้าง
    if (updated && window.WTPData && window.WTPData.forceSyncNow) {
      setTimeout(() => window.WTPData.forceSyncNow(updated), 0);
    }
    setShowImport(false);
    if (toast) toast(`นำเข้าสำเร็จ · ${parsed.loans.length} สัญญา`, 'success');
  };

  // Export all loans → workbook
  const handleExportAll = () => {
    const XLSX = window.XLSX;
    if (!XLSX || !allRows.length) return;
    // map debtMaster rows → loan shape ที่ engine ใช้
    const loans = allRows.map(r => ({
      loanId: r.leasitLoanId,
      contractNo: r.contractNo,
      jobNo: r.projectCode,
      projectName: r.projectName,
      ticketType: r.leasitTicketType,
      loanType: r.loanType,
      interestRate: r.interestRate,
      principal: r.principalAmount,
      dateReceived: r.leasitDateReceived,
      dateDue: r.leasitDateDue,
      dateDueRoll: r.leasitDateDueRoll,
      termDays: r.leasitTermDays,
      principalChequeNo: r.leasitPrincipalChequeNo,
      dateRepaid: r.leasitDateRepaid,
      status: r.status,
      totalPrepaidInterest: r.leasitTotalPrepaid,
      totalActualInterest: r.leasitTotalActual,
      variance: r.leasitVariance,
      totalRefunded: r.leasitRefunded,
      refundOutstanding: r.leasitRefundOutstanding
    }));
    const wb = window.LeasitEngine.litBuildExportWorkbook(loans, prepaid, actual, refund);
    if (!wb) return;
    const now = new Date();
    const stamp = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
    XLSX.writeFile(wb, `WTP-ตารางคำนวณดอกเบี้ยลีซอิท ${stamp}.xlsx`);
    if (toast) toast('ส่งออก Excel สำเร็จ', 'success');
  };

  // Export single loan
  const handleExportOne = (loan) => {
    const XLSX = window.XLSX;
    if (!XLSX) return;
    const single = [{
      loanId: loan.leasitLoanId,
      contractNo: loan.contractNo,
      jobNo: loan.projectCode,
      projectName: loan.projectName,
      ticketType: loan.leasitTicketType,
      loanType: loan.loanType,
      interestRate: loan.interestRate,
      principal: loan.principalAmount,
      dateReceived: loan.leasitDateReceived,
      dateDue: loan.leasitDateDue,
      dateDueRoll: loan.leasitDateDueRoll,
      termDays: loan.leasitTermDays,
      principalChequeNo: loan.leasitPrincipalChequeNo,
      dateRepaid: loan.leasitDateRepaid,
      status: loan.status,
      totalPrepaidInterest: loan.leasitTotalPrepaid,
      totalActualInterest: loan.leasitTotalActual,
      variance: loan.leasitVariance,
      totalRefunded: loan.leasitRefunded,
      refundOutstanding: loan.leasitRefundOutstanding
    }];
    const wb = window.LeasitEngine.litBuildExportWorkbook(single, prepaid, actual, refund);
    if (!wb) return;
    XLSX.writeFile(wb, `WTP-ลีซอิท-${loan.leasitLoanId}-${loan.contractNo.replace(/[\/\\]/g, '_')}.xlsx`);
  };

  // ── Save form (สร้างใหม่/แก้ไข) — upsert debtMaster + replace 3 child tables ──
  const handleSaveForm = (draft, preRowsArr, actRowsArr, refRowsArr) => {
    const loanId = draft.leasitLoanId;
    const E = window.LeasitEngine;
    // recompute totals
    const totals = {
      totalPrepaidInterest: preRowsArr.reduce((s, r) => s + (Number(r.intAmount) || 0), 0),
      totalActualInterest: actRowsArr.reduce((s, r) => s + (Number(r.intAmount) || 0), 0),
      totalRefunded: refRowsArr.filter(r => (r.kind || 'interest') === 'interest').reduce((s, r) => s + (Number(r.amount) || 0), 0)
    };
    totals.variance = totals.totalPrepaidInterest - totals.totalActualInterest;
    totals.refundOutstanding = totals.variance - totals.totalRefunded;
    const principalRepaid = refRowsArr.filter(r => r.kind === 'principal').reduce((s, r) => s + (Number(r.amount) || 0), 0);
    let updated;
    setData(d => {
      const existing = d.debtMaster || [];
      // build/update row
      const rowId = 'lit_' + loanId;
      const baseFields = {
        id: rowId,
        debtCategory: 'LIT',
        contractNo: draft.contractNo,
        borrowerName: 'บจก. ลีซอิท',
        status: draft.leasitDateRepaid ? 'Close' : 'Active',
        facilityType: 'Loan',
        loanType: draft.leasitTicketType === 'POS' || draft.leasitTicketType === 'NON' ? 'NON' : 'PRE',
        principalAmount: Number(draft.principalAmount) || 0,
        interestRate: Number(draft.interestRate) || 0,
        balance: draft.leasitDateRepaid ? 0 : (Number(draft.principalAmount) || 0) - principalRepaid,
        currency: 'THB',
        projectCode: draft.projectCode || '',
        projectName: draft.projectName || '',
        note: draft.note || '',
        leasitSource: true,
        leasitLoanId: loanId,
        leasitTicketType: draft.leasitTicketType,
        leasitDateReceived: draft.leasitDateReceived || '',
        leasitDateDue: draft.leasitDateDue || '',
        leasitDateDueRoll: draft.leasitDateDueRoll || '',
        leasitDateRepaid: draft.leasitDateRepaid || '',
        leasitTermDays: draft.leasitTermDays || E.litCalcTermDays(draft.leasitDateReceived, draft.leasitDateDue),
        leasitPrincipalChequeNo: draft.leasitPrincipalChequeNo || '',
        leasitInterestChequeNo: draft.leasitInterestChequeNo || '',
        leasitTotalPrepaid: totals.totalPrepaidInterest,
        leasitTotalActual: totals.totalActualInterest,
        leasitVariance: totals.variance,
        leasitRefunded: totals.totalRefunded,
        leasitRefundOutstanding: totals.refundOutstanding,
        leasitPrincipalRepaid: principalRepaid,
        maturityDate: draft.leasitDateDueRoll || draft.leasitDateDue || ''
      };
      const idx = existing.findIndex(r => r.id === rowId);
      const nextDm = idx >= 0
        ? existing.map((r, i) => i === idx ? { ...r, ...baseFields } : r)
        : existing.concat([baseFields]);

      // replace child tables for this loanId
      const keepPre = (d.interestSchedulePrepaid || []).filter(r => r.loanId !== loanId);
      const newPre = preRowsArr.map((p, i) => ({
        id: litRowId(loanId, 'pre', p.seq || i + 1),
        loanId,
        ...p
      }));
      const keepAct = (d.interestScheduleActual || []).filter(r => r.loanId !== loanId);
      const newAct = actRowsArr.map((p, i) => ({
        id: litRowId(loanId, 'act', p.seq || i + 1),
        loanId,
        ...p
      }));
      const keepRef = (d.interestRefund || []).filter(r => r.loanId !== loanId);
      const newRef = refRowsArr.map((p, i) => ({
        id: litRowId(loanId, 'ref', i + 1),
        loanId,
        kind: p.kind || 'interest',
        ...p
      }));

      updated = {
        ...d,
        debtMaster: nextDm,
        interestSchedulePrepaid: keepPre.concat(newPre),
        interestScheduleActual: keepAct.concat(newAct),
        interestRefund: keepRef.concat(newRef)
      };
      return updated;
    });
    // ★ ส่ง updated เข้า forceSyncNow (กัน race vs cachedData เก่า)
    if (updated && window.WTPData && window.WTPData.forceSyncNow) {
      setTimeout(() => window.WTPData.forceSyncNow(updated), 0);
    }
    setFormState(null);
    if (toast) toast(`บันทึก ${draft.contractNo} สำเร็จ`, 'success');
  };

  // ── คำนวณดอกล่วงหน้าอัตโนมัติ (inline จาก drawer) ──
  const handleCalcPrepaid = (loanRow) => {
    const E = window.LeasitEngine;
    if (!E || !E.litGenerateMonthlySchedule) return;
    const principal = Number(loanRow.principalAmount) || 0;
    const rate = Number(loanRow.interestRate) || 0;
    const startISO = loanRow.leasitDateReceived || '';
    const endISO = loanRow.leasitDateDue || '';
    if (!principal || !rate || !startISO || !endISO) {
      if (toast) toast('กรอก เงินต้น/อัตรา/วันรับ/วันครบ ใน "แก้ไข" ก่อน', 'error');
      return;
    }
    const rows = E.litGenerateMonthlySchedule(principal, rate, startISO, endISO);
    const loanId = loanRow.leasitLoanId;
    const total = rows.reduce((s, r) => s + (Number(r.intAmount) || 0), 0);
    let updated;
    setData(d => {
      const keep = (d.interestSchedulePrepaid || []).filter(r => r.loanId !== loanId);
      const fresh = rows.map((p, i) => ({ id: litRowId(loanId, 'pre', p.seq || i + 1), loanId, ...p }));
      const dm = (d.debtMaster || []).map(r => r.leasitLoanId === loanId ? {
        ...r,
        leasitTotalPrepaid: total,
        leasitVariance: total - (Number(r.leasitTotalActual) || 0),
        leasitRefundOutstanding: total - (Number(r.leasitTotalActual) || 0) - (Number(r.leasitRefunded) || 0)
      } : r);
      updated = { ...d, interestSchedulePrepaid: keep.concat(fresh), debtMaster: dm };
      return updated;
    });
    if (updated && window.WTPData && window.WTPData.forceSyncNow) {
      setTimeout(() => window.WTPData.forceSyncNow(updated), 0);
    }
    if (toast) toast(`คำนวณดอกล่วงหน้า ${rows.length} งวด · รวม ${total.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'success');
  };

  // ── คำนวณดอกเกิดจริงอัตโนมัติ (inline จาก drawer) ──
  const handleCalcActual = (loanRow) => {
    const E = window.LeasitEngine;
    if (!E || !E.litGenerateMonthlySchedule) return;
    const principal = Number(loanRow.principalAmount) || 0;
    const rate = Number(loanRow.interestRate) || 0;
    const startISO = loanRow.leasitDateReceived || '';
    const todayISO = new Date().toISOString().slice(0, 10);
    const endISO = loanRow.leasitDateRepaid || todayISO;
    if (!principal || !rate || !startISO) {
      if (toast) toast('กรอก เงินต้น/อัตรา/วันรับ ใน "แก้ไข" ก่อน', 'error');
      return;
    }
    const rows = E.litGenerateMonthlySchedule(principal, rate, startISO, endISO);
    const loanId = loanRow.leasitLoanId;
    const total = rows.reduce((s, r) => s + (Number(r.intAmount) || 0), 0);
    let updated;
    setData(d => {
      const keep = (d.interestScheduleActual || []).filter(r => r.loanId !== loanId);
      const fresh = rows.map((p, i) => ({ id: litRowId(loanId, 'act', p.seq || i + 1), loanId, ...p }));
      const dm = (d.debtMaster || []).map(r => r.leasitLoanId === loanId ? {
        ...r,
        leasitTotalActual: total,
        leasitVariance: (Number(r.leasitTotalPrepaid) || 0) - total,
        leasitRefundOutstanding: (Number(r.leasitTotalPrepaid) || 0) - total - (Number(r.leasitRefunded) || 0)
      } : r);
      updated = { ...d, interestScheduleActual: keep.concat(fresh), debtMaster: dm };
      return updated;
    });
    if (updated && window.WTPData && window.WTPData.forceSyncNow) {
      setTimeout(() => window.WTPData.forceSyncNow(updated), 0);
    }
    if (toast) toast(`คำนวณดอกเกิดจริง ${rows.length} งวด · รวม ${total.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'success');
  };

  const handleDeleteForm = (draft) => {
    const loanId = draft.leasitLoanId;
    const rowId = 'lit_' + loanId;
    let updated;
    setData(d => {
      updated = {
        ...d,
        debtMaster: (d.debtMaster || []).filter(r => r.id !== rowId),
        interestSchedulePrepaid: (d.interestSchedulePrepaid || []).filter(r => r.loanId !== loanId),
        interestScheduleActual: (d.interestScheduleActual || []).filter(r => r.loanId !== loanId),
        interestRefund: (d.interestRefund || []).filter(r => r.loanId !== loanId)
      };
      return updated;
    });
    if (updated && window.WTPData && window.WTPData.forceSyncNow) {
      setTimeout(() => window.WTPData.forceSyncNow(updated), 0);
    }
    setFormState(null);
    setViewLoan(null);
    if (toast) toast(`ลบสัญญา ${draft.contractNo} แล้ว`, 'info');
  };

  // ── Principal summary: PRE / POS / NON (drawn / repaid / outstanding) ──
  //   PRE = Pre-financing, POS = Post-financing, NON = Term Loan (เช่น 20M)
  const principalSummary = React.useMemo(() => {
    const acc = {
      PRE: { count: 0, active: 0, drawn: 0, repaid: 0, outstanding: 0 },
      POS: { count: 0, active: 0, drawn: 0, repaid: 0, outstanding: 0 },
      NON: { count: 0, active: 0, drawn: 0, repaid: 0, outstanding: 0 }
    };
    allRows.forEach(r => {
      const t = String(r.leasitTicketType || '').toUpperCase();
      const bkt = t === 'PRE' ? acc.PRE : t === 'NON' ? acc.NON : acc.POS;
      const p = Number(r.principalAmount) || 0;
      bkt.count++;
      bkt.drawn += p;
      if (r.status === 'Active') { bkt.active++; bkt.outstanding += p; }
      else { bkt.repaid += p; }
    });
    return acc;
  }, [allRows]);

  // ── Maturity alert: Active loans ครบกำหนดใน 30 วัน (รวม overdue) ──
  const maturityAlerts = React.useMemo(() => {
    const todayMs = Date.now();
    const list = [];
    allRows.forEach(r => {
      if (r.status !== 'Active') return;
      const dueISO = r.leasitDateDueRoll || r.leasitDateDue || '';
      if (!dueISO) return;
      const dueMs = new Date(dueISO).getTime();
      if (!isFinite(dueMs)) return;
      const days = Math.ceil((dueMs - todayMs) / 86400000);
      if (days <= 30) list.push({ row: r, dueISO, days });
    });
    return list.sort((a, b) => a.days - b.days);
  }, [allRows]);

  const PrincipalCard = ({ label, bkt, color }) => (
    <div className="card" style={{ padding: 8, borderTop: '2px solid ' + color }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{
          padding: '1px 7px', borderRadius: 999, fontSize: 10, fontWeight: 700,
          background: color, color: '#fff'
        }}>{label}</span>
        <span style={{ fontSize: 11, color: 'var(--ink-500)' }}>
          {bkt.count} · Active {bkt.active}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, fontSize: 11 }}>
        <div>
          <div style={{ color: 'var(--ink-500)', fontSize: 10 }}>↗ เบิก</div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{LIT_fmt(bkt.drawn, 0)}</div>
        </div>
        <div>
          <div style={{ color: 'var(--ink-500)', fontSize: 10 }}>✓ คืน</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'oklch(50% 0.14 145)' }}>{LIT_fmt(bkt.repaid, 0)}</div>
        </div>
        <div>
          <div style={{ color: 'var(--ink-500)', fontSize: 10 }}>● คงเหลือ</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: bkt.outstanding > 0 ? 'var(--bad)' : 'var(--ink-500)' }}>
            {LIT_fmt(bkt.outstanding, 0)}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    // ★ เคยใช้ negative margin breakout — overlap sidebar ที่ zoom 100% ในจอกว้าง
    //   ตอนนี้คงอยู่ใน .page (max 1480px) ตาราง minWidth 1300 + scroll x ถ้าจำเป็น
    <div>
      {/* ⏰ Maturity alert banner — Active loans ครบกำหนดใน 30 วัน (ย่อเป็น 1 บรรทัด คลิกขยาย) */}
      {maturityAlerts.length > 0 && (
        <div className="card" style={{
          padding: '8px 12px', marginBottom: 10,
          background: 'oklch(96% 0.06 80)',
          borderLeft: '4px solid oklch(70% 0.18 80)',
          cursor: 'pointer'
        }}
          onClick={() => setMaturityOpen(o => !o)}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>
              {maturityOpen ? '▾' : '▸'} ⏰ ครบกำหนดภายใน 30 วัน ({maturityAlerts.length} สัญญา · เงินต้น {LIT_fmt(maturityAlerts.reduce((s, a) => s + (Number(a.row.principalAmount) || 0), 0), 0)})
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>
              {maturityAlerts.filter(a => a.days < 0).length} เกินกำหนด · {maturityAlerts.filter(a => a.days >= 0 && a.days <= 7).length} ใน 7 วัน
            </div>
          </div>
          {maturityOpen && (
            <div onClick={(e) => e.stopPropagation()} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 6, marginTop: 8 }}>
              {maturityAlerts.slice(0, 12).map(({ row: r, dueISO, days }) => (
                <div
                  key={r.id}
                  onClick={() => setViewLoan(r)}
                  style={{
                    padding: 7, background: 'var(--panel)', borderRadius: 6, cursor: 'pointer', fontSize: 11,
                    border: '1px solid ' + (days < 0 ? 'var(--bad)' : days <= 7 ? 'oklch(70% 0.18 80)' : 'var(--ink-200)')
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 700 }}>#{r.leasitLoanId} · {r.contractNo}</span>
                    <span style={{
                      padding: '0 6px', borderRadius: 999, fontSize: 10, fontWeight: 700,
                      background: days < 0 ? 'var(--bad)' : days <= 7 ? 'oklch(70% 0.18 80)' : 'var(--ink-300)',
                      color: '#fff'
                    }}>
                      {days < 0 ? `เกิน ${Math.abs(days)}` : days === 0 ? 'วันนี้' : `อีก ${days}`}
                    </span>
                  </div>
                  <div title={r.projectName} style={{ color: 'var(--ink-700)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.projectName}
                  </div>
                  <div style={{ color: 'var(--ink-500)' }}>
                    {LIT_fmtDate(dueISO)} · {LIT_fmt(r.principalAmount, 0)}
                  </div>
                </div>
              ))}
              {maturityAlerts.length > 12 && (
                <div style={{ fontSize: 11, color: 'var(--ink-500)', alignSelf: 'center' }}>
                  +{maturityAlerts.length - 12} รายการ
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── 💰 เงินต้น — Total + แยก PRE/POS/NON ── */}
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-700)', marginBottom: 4 }}>
        💰 เงินต้น — รับ / จ่ายคืน / คงเหลือ
      </div>
      {(() => {
        const tot = ['PRE', 'POS', 'NON'].reduce((acc, k) => {
          const b = principalSummary[k];
          acc.count += b.count; acc.active += b.active;
          acc.drawn += b.drawn; acc.repaid += b.repaid; acc.outstanding += b.outstanding;
          return acc;
        }, { count: 0, active: 0, drawn: 0, repaid: 0, outstanding: 0 });
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
            {/* TOTAL card — เด่น */}
            <div className="card" style={{
              padding: 10, borderTop: '3px solid var(--brand-500)',
              background: 'linear-gradient(135deg, oklch(98% 0.02 250), oklch(94% 0.05 250))'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{
                  padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                  background: 'var(--brand-500)', color: '#fff'
                }}>รวมทั้งหมด</span>
                <span style={{ fontSize: 11, color: 'var(--ink-700)', fontWeight: 600 }}>
                  {tot.count} สัญญา · Active {tot.active}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                <div>
                  <div style={{ color: 'var(--ink-600)', fontSize: 10 }}>↗ รับเงินต้นรวม</div>
                  <div style={{ fontSize: 17, fontWeight: 800 }}>{LIT_fmt(tot.drawn, 0)}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--ink-600)', fontSize: 10 }}>✓ จ่ายคืนรวม</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: 'oklch(50% 0.14 145)' }}>{LIT_fmt(tot.repaid, 0)}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--ink-600)', fontSize: 10 }}>● คงเหลือรวม</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: tot.outstanding > 0 ? 'var(--bad)' : 'var(--ink-500)' }}>{LIT_fmt(tot.outstanding, 0)}</div>
                </div>
              </div>
            </div>
            <PrincipalCard label="PRE" bkt={principalSummary.PRE} color="oklch(52% 0.16 250)" />
            <PrincipalCard label="POS" bkt={principalSummary.POS} color="oklch(56% 0.18 25)" />
            <PrincipalCard label="NON" bkt={principalSummary.NON} color="oklch(48% 0.14 305)" />
          </div>
        );
      })()}

      {/* ── 📈 ดอกเบี้ย (รวมทุกสัญญา) — แถวล่าง ── */}
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-700)', marginBottom: 4 }}>
        📈 ดอกเบี้ย — ล่วงหน้า / เกิดจริง / ส่วนต่าง / ค้างรับคืน
      </div>
      <div className="card" style={{ padding: 10, marginBottom: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, fontSize: 12 }}>
          <div>
            <div style={{ color: 'var(--ink-500)', fontSize: 10 }}>สัญญา</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{allRows.length}</div>
            <div style={{ fontSize: 10, color: 'var(--ink-500)' }}>🟢 {activeCnt} · ⚫ {closedCnt}</div>
          </div>
          <div>
            <div style={{ color: 'var(--ink-500)', fontSize: 10 }}>ดอกล่วงหน้ารวม</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{LIT_fmt(totPre, 0)}</div>
          </div>
          <div>
            <div style={{ color: 'var(--ink-500)', fontSize: 10 }}>ดอกเกิดจริง</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{LIT_fmt(totAct, 0)}</div>
          </div>
          <div>
            <div style={{ color: 'var(--ink-500)', fontSize: 10 }}>ส่วนต่าง (ต้องได้คืน)</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'oklch(52% 0.16 145)' }}>{LIT_fmt(totVar, 0)}</div>
          </div>
          <div>
            <div style={{ color: 'var(--ink-500)', fontSize: 10 }}>ค้างรับคืน</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: totOut > 0.01 ? 'var(--bad)' : 'inherit' }}>{LIT_fmt(totOut, 0)}</div>
            <div style={{ fontSize: 10, color: 'var(--ink-500)' }}>รับแล้ว {LIT_fmt(totRef, 0)}</div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <input
          className="input"
          placeholder="ค้นหา เลขสัญญา / โครงการ / ลำดับ…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: 1 }}
        />
        <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">ทุกสถานะ</option>
          <option value="Active">🟢 Active</option>
          <option value="Close">⚫ ปิดแล้ว</option>
        </select>
        {canEdit && (
          <>
            <button className="btn btn-primary" onClick={() => setFormState({ mode: 'new', initial: null })}>
              ➕ เพิ่มสัญญา
            </button>
            <button className="btn btn-ghost" onClick={() => setShowImport(true)}>
              📥 นำเข้า Excel
            </button>
          </>
        )}
        <button className="btn btn-ghost" onClick={handleExportAll} disabled={!allRows.length}>
          📤 Export (มีสูตร)
        </button>
        <button
          className="btn btn-ghost"
          title="ดึงข้อมูลล่าสุดจาก Supabase (เผื่อ data ตกหล่นหลัง import)"
          onClick={async () => {
            try {
              if (window.WTPData && window.WTPData.refreshFromServer) {
                await window.WTPData.refreshFromServer();
                if (toast) toast('ดึงข้อมูลจาก Supabase สำเร็จ', 'success');
              } else {
                window.location.reload();
              }
            } catch (e) {
              if (toast) toast('ดึงข้อมูลล้มเหลว: ' + (e.message || e), 'error');
            }
          }}
        >
          ↻ ดึงใหม่
        </button>
      </div>

      {/* Duplicate warning + cleanup */}
      {dupCount > 0 && (
        <div className="card" style={{ padding: 10, marginBottom: 10, background: 'oklch(96% 0.05 22)', borderLeft: '4px solid var(--bad)', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div>
            ⚠️ <b>พบสัญญาซ้ำ {dupCount} แถว</b> (loanId เดียวกันแต่มีหลาย debtMaster row) — โชว์เหลือ {allRows.length} จาก {allRowsRaw.length}
          </div>
          {canEdit && (
            <button className="btn" style={{ background: 'var(--bad)', color: '#fff', padding: '4px 12px', fontSize: 12 }} onClick={handleCleanupDuplicates}>
              🧹 ลบซ้ำทั้งหมด
            </button>
          )}
        </div>
      )}

      {/* Warning: ถ้า debtMaster มี leasit rows แต่ 3 child tables ว่างหมด → SQL ยังไม่รัน */}
      {allRows.length > 0 && (data?.interestSchedulePrepaid || []).length === 0 && (data?.interestScheduleActual || []).length === 0 && (data?.interestRefund || []).length === 0 && (
        <div className="card" style={{ padding: 10, marginBottom: 10, background: 'oklch(96% 0.05 80)', borderLeft: '4px solid oklch(70% 0.18 80)', fontSize: 12 }}>
          ⚠️ <b>ตาราง schedule ใน Supabase ยังไม่มี — ดอกเบี้ยรายงวดไม่ถูก persist</b>
          <div style={{ marginTop: 4, color: 'var(--ink-700)' }}>
            ให้ admin รัน <code>supabase/leasit-loans.sql</code> ใน Supabase SQL Editor แล้วลองใหม่ (สัญญา {allRows.length} ตัวที่ใส่ไว้ยังอยู่ใน <code>debtMaster</code> ปกติ ไม่หาย).
          </div>
        </div>
      )}

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--ink-500)' }}>
          {allRows.length === 0
            ? '⚠️ ยังไม่มีข้อมูลลีซอิท — กด "📥 นำเข้า Excel" เพื่อ upload ไฟล์ตารางคำนวณดอกเบี้ย'
            : 'ไม่พบสัญญาที่ค้นหา'}
        </div>
      ) : (() => {
        const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
        const curPage = Math.min(page, totalPages);
        const pageRows = filtered.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE);
        // ★ nowrap base — แถวสูง 1 บรรทัดเสมอ (จะ ellipsis แทน wrap)
        const tdBase = { padding: '3px 6px', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
        const tdRight = { ...tdBase, textAlign: 'right' };
        return (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="tbl" style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 1300 }}>
                <colgroup>
                  <col style={{ width: 34 }} />        {/* # */}
                  <col style={{ width: 48 }} />        {/* ประเภท */}
                  <col style={{ width: 160 }} />       {/* เลขที่สัญญา */}
                  <col style={{ width: 110 }} />       {/* JOB */}
                  <col style={{ minWidth: 220 }} />    {/* โครงการ — flex */}
                  <col style={{ width: 110 }} />       {/* เงินต้นรับ */}
                  <col style={{ width: 110 }} />       {/* จ่ายคืน */}
                  <col style={{ width: 110 }} />       {/* คงเหลือ */}
                  <col style={{ width: 56 }} />        {/* อัตรา */}
                  <col style={{ width: 88 }} />        {/* รับเงิน */}
                  <col style={{ width: 88 }} />        {/* ครบกำหนด */}
                  <col style={{ width: 50 }} />        {/* สถานะ */}
                  <col style={{ width: 100 }} />       {/* ค้างดอก */}
                </colgroup>
                <thead>
                  {(() => {
                    const FCH = window.FilterableColHeader;
                    // ถ้า FilterableColHeader ไม่พร้อม → fallback simple sort header
                    if (typeof FCH !== 'function') {
                      const Th = ({ k, label, right }) => (
                        <th style={{ ...(right ? tdRight : tdBase), fontWeight: 600, cursor: 'pointer' }} onClick={() => sortToggle(k)}>
                          {label}{sort.key === k ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                        </th>
                      );
                      return (
                        <tr style={{ background: 'var(--ink-50)' }}>
                          <Th k="leasitLoanId" label="#" />
                          <Th k="leasitTicketType" label="ประเภท" />
                          <Th k="contractNo" label="เลขที่สัญญา" />
                          <Th k="projectCode" label="JOB" />
                          <Th k="projectName" label="โครงการ" />
                          <Th k="principalAmount" label="เงินต้นรับ" right />
                          <Th k="principalRepaid" label="จ่ายคืน" right />
                          <Th k="principalOutstanding" label="คงเหลือ" right />
                          <Th k="interestRate" label="อัตรา" right />
                          <Th k="leasitDateReceived" label="รับเงิน" />
                          <Th k="leasitDateDue" label="ครบกำหนด" />
                          <Th k="status" label="สถานะ" />
                          <Th k="leasitRefundOutstanding" label="ค้างดอก" right />
                        </tr>
                      );
                    }
                    const commonProps = {
                      sort, sortToggle, colFilters, setColFilters, openCol, setOpenCol,
                      allRows: filtered, getValue: getColDisplayValue, getSortValue: getColSortValue
                    };
                    return (
                      <tr style={{ background: 'var(--ink-50)' }}>
                        <FCH {...commonProps} sortKey="leasitLoanId" label="#" align="left" />
                        <FCH {...commonProps} sortKey="leasitTicketType" label="ประเภท" align="left" />
                        <FCH {...commonProps} sortKey="contractNo" label="เลขสัญญา" align="left" />
                        <FCH {...commonProps} sortKey="projectCode" label="JOB" align="left" />
                        <FCH {...commonProps} sortKey="projectName" label="โครงการ" align="left" />
                        <FCH {...commonProps} sortKey="principalAmount" label="เงินต้นรับ" align="right" />
                        <FCH {...commonProps} sortKey="principalRepaid" label="จ่ายคืน" align="right" />
                        <FCH {...commonProps} sortKey="principalOutstanding" label="คงเหลือ" align="right" />
                        <FCH {...commonProps} sortKey="interestRate" label="อัตรา" align="right" />
                        <FCH {...commonProps} sortKey="leasitDateReceived" label="รับเงิน" align="left" />
                        <FCH {...commonProps} sortKey="leasitDateDue" label="ครบกำหนด" align="left" />
                        <FCH {...commonProps} sortKey="status" label="สถานะ" align="left" />
                        <FCH {...commonProps} sortKey="leasitRefundOutstanding" label="ค้างดอก" align="right" />
                      </tr>
                    );
                  })()}
                </thead>
                <tbody>
                  {pageRows.map(r => {
                    const t = String(r.leasitTicketType || '').toUpperCase();
                    const label = t === 'NON' ? 'NON' : t === 'PRE' ? 'PRE' : 'POS';
                    const col = label === 'PRE' ? 'oklch(52% 0.16 250)' : label === 'NON' ? 'oklch(48% 0.14 305)' : 'oklch(56% 0.18 25)';
                    // เงินต้นจ่ายคืน: ใช้ฟิลด์ที่ฟอร์มบันทึก ถ้าไม่มี → ปิดสัญญาแล้ว = เต็มจำนวน, ยัง Active = 0
                    const principal = Number(r.principalAmount) || 0;
                    const repaid = r.leasitPrincipalRepaid != null
                      ? (Number(r.leasitPrincipalRepaid) || 0)
                      : (r.status === 'Close' ? principal : 0);
                    const outstanding = principal - repaid;
                    return (
                      <tr key={r.id} onClick={() => setViewLoan(r)} style={{ cursor: 'pointer', borderBottom: '1px solid var(--ink-100)' }}>
                        <td style={tdBase}>{r.leasitLoanId}</td>
                        <td style={tdBase}>
                          <span style={{ padding: '1px 6px', borderRadius: 999, fontSize: 10, fontWeight: 700, background: col, color: '#fff' }}>{label}</span>
                        </td>
                        <td style={tdBase} title={r.contractNo}>{r.contractNo}</td>
                        <td style={tdBase} title={r.projectCode}>{r.projectCode || '—'}</td>
                        <td title={r.projectName} style={tdBase}>{r.projectName}</td>
                        <td style={tdRight}>{LIT_fmt(principal, 0)}</td>
                        <td style={{ ...tdRight, color: 'oklch(50% 0.14 145)' }}>{LIT_fmt(repaid, 0)}</td>
                        <td style={{ ...tdRight, color: outstanding > 0.01 ? 'var(--bad)' : 'var(--ink-500)', fontWeight: outstanding > 0.01 ? 600 : 400 }}>{LIT_fmt(outstanding, 0)}</td>
                        <td style={tdRight}>{(r.interestRate * 100).toFixed(2)}%</td>
                        <td style={tdBase}>{LIT_fmtDate(r.leasitDateReceived)}</td>
                        <td style={tdBase}>{LIT_fmtDate(r.leasitDateDue)}</td>
                        <td style={tdBase}>{r.status === 'Active' ? '🟢' : '⚫'}</td>
                        <td style={{ ...tdRight, color: r.leasitRefundOutstanding > 0.01 ? 'var(--bad)' : 'var(--ink-500)', fontWeight: r.leasitRefundOutstanding > 0.01 ? 600 : 400 }}>
                          {LIT_fmt(r.leasitRefundOutstanding, 2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  {(() => {
                    const tot = filtered.reduce((a, r) => {
                      const p = Number(r.principalAmount) || 0;
                      const rep = r.leasitPrincipalRepaid != null ? (Number(r.leasitPrincipalRepaid) || 0) : (r.status === 'Close' ? p : 0);
                      a.principal += p; a.repaid += rep; a.outstanding += (p - rep);
                      a.refundOut += Number(r.leasitRefundOutstanding) || 0;
                      return a;
                    }, { principal: 0, repaid: 0, outstanding: 0, refundOut: 0 });
                    return (
                      <tr style={{ fontWeight: 600, background: 'var(--ink-50)' }}>
                        <td colSpan={5} style={{ ...tdBase, textAlign: 'right' }}>รวม {filtered.length} สัญญา</td>
                        <td style={tdRight}>{LIT_fmt(tot.principal, 0)}</td>
                        <td style={{ ...tdRight, color: 'oklch(50% 0.14 145)' }}>{LIT_fmt(tot.repaid, 0)}</td>
                        <td style={{ ...tdRight, color: 'var(--bad)' }}>{LIT_fmt(tot.outstanding, 0)}</td>
                        <td colSpan={4}></td>
                        <td style={tdRight}>{LIT_fmt(tot.refundOut, 2)}</td>
                      </tr>
                    );
                  })()}
                </tfoot>
              </table>
            </div>
            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', borderTop: '1px solid var(--ink-100)', fontSize: 12 }}>
                <div style={{ color: 'var(--ink-500)' }}>
                  หน้า {curPage}/{totalPages} · แสดง {(curPage - 1) * PAGE_SIZE + 1}–{Math.min(curPage * PAGE_SIZE, filtered.length)} จาก {filtered.length}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => setPage(1)} disabled={curPage <= 1}>« หน้าแรก</button>
                  <button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => setPage(p => Math.max(1, p - 1))} disabled={curPage <= 1}>‹ ก่อนหน้า</button>
                  <button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={curPage >= totalPages}>ถัดไป ›</button>
                  <button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => setPage(totalPages)} disabled={curPage >= totalPages}>หน้าสุดท้าย »</button>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Modals */}
      <LeasitImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onConfirm={handleImport}
      />
      <LeasitLoanDrawer
        loan={viewLoan ? (allRows.find(r => r.id === viewLoan.id) || viewLoan) : null}
        prepaid={prepaid}
        actual={actual}
        refund={refund}
        onClose={() => setViewLoan(null)}
        onExportOne={handleExportOne}
        onEdit={canEdit ? (l) => { setFormState({ mode: 'edit', initial: l }); setViewLoan(null); } : null}
        canEdit={canEdit}
        onCalcPrepaid={handleCalcPrepaid}
        onCalcActual={handleCalcActual}
      />
      <LeasitLoanForm
        open={!!formState}
        mode={formState?.mode}
        initial={formState?.initial}
        data={data}
        onClose={() => setFormState(null)}
        onSave={handleSaveForm}
        onDelete={handleDeleteForm}
        canEdit={canEdit}
      />
    </div>
  );
}

// expose
window.LeasitPanel = LeasitPanel;
