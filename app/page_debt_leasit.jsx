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
function LeasitLoanDrawer({ loan, prepaid, actual, refund, onClose, onExportOne }) {
  if (!loan) return null;
  const Modal = window.Modal;

  const pre = prepaid.filter(r => r.loanId === loan.leasitLoanId).sort((a, b) => (a.seq || 0) - (b.seq || 0));
  const act = actual.filter(r => r.loanId === loan.leasitLoanId).sort((a, b) => (a.seq || 0) - (b.seq || 0));
  const ref = refund.filter(r => r.loanId === loan.leasitLoanId).sort((a, b) => (a.refundDate || '').localeCompare(b.refundDate || ''));

  // ── PRE/POS classification + principal summary ──
  const isPRE = String(loan.leasitTicketType || '').toUpperCase() === 'PRE';
  const ticketLabel = isPRE ? 'PRE' : 'POS';
  const ticketColor = isPRE ? 'oklch(52% 0.16 250)' : 'oklch(56% 0.18 25)';
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
              ({isPRE ? 'Pre-financing' : 'Post-financing'})
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

        {/* Prepaid */}
        <div style={{ fontWeight: 600, marginTop: 12, marginBottom: 6 }}>📋 ดอกเบี้ยจ่ายล่วงหน้า ({pre.length} งวด)</div>
        <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--ink-200)', borderRadius: 8 }}>
          <table className="tbl" style={{ width: '100%', fontSize: 12 }}>
            <thead><tr>
              <th>#</th><th>เดือน/ปี</th><th>เริ่ม</th><th>สิ้นสุด</th>
              <th style={{ textAlign: 'right' }}>เงินต้น</th><th style={{ textAlign: 'right' }}>อัตรา</th>
              <th style={{ textAlign: 'right' }}>วัน</th><th style={{ textAlign: 'right' }}>ดอกเบี้ย</th>
            </tr></thead>
            <tbody>
              {pre.map(p => (
                <tr key={p.seq}>
                  <td>{p.seq}</td><td>{p.month} {p.year}</td>
                  <td>{LIT_fmtDate(p.dateStart)}</td><td>{LIT_fmtDate(p.dateEnd)}</td>
                  <td style={{ textAlign: 'right' }}>{LIT_fmt(p.principal, 0)}</td>
                  <td style={{ textAlign: 'right' }}>{(p.intRate * 100).toFixed(2)}%</td>
                  <td style={{ textAlign: 'right' }}>{p.days}</td>
                  <td style={{ textAlign: 'right' }}>{LIT_fmt(p.intAmount, 2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr style={{ fontWeight: 600, background: 'var(--ink-50)' }}>
              <td colSpan={7} style={{ textAlign: 'right' }}>รวม</td>
              <td style={{ textAlign: 'right' }}>{LIT_fmt(pre.reduce((s, p) => s + (Number(p.intAmount) || 0), 0), 2)}</td>
            </tr></tfoot>
          </table>
        </div>

        {/* Actual */}
        <div style={{ fontWeight: 600, marginTop: 12, marginBottom: 6 }}>✅ ดอกเบี้ยที่เกิดขึ้นจริง ({act.length} งวด)</div>
        <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--ink-200)', borderRadius: 8 }}>
          <table className="tbl" style={{ width: '100%', fontSize: 12 }}>
            <thead><tr>
              <th>#</th><th>เดือน/ปี</th><th>เริ่ม</th><th>สิ้นสุด</th>
              <th style={{ textAlign: 'right' }}>เงินต้น</th><th style={{ textAlign: 'right' }}>อัตรา</th>
              <th style={{ textAlign: 'right' }}>วัน</th><th style={{ textAlign: 'right' }}>ดอกเบี้ย</th>
            </tr></thead>
            <tbody>
              {act.map(p => (
                <tr key={p.seq}>
                  <td>{p.seq}</td><td>{p.month} {p.year}</td>
                  <td>{LIT_fmtDate(p.dateStart)}</td><td>{LIT_fmtDate(p.dateEnd)}</td>
                  <td style={{ textAlign: 'right' }}>{LIT_fmt(p.principal, 0)}</td>
                  <td style={{ textAlign: 'right' }}>{(p.intRate * 100).toFixed(2)}%</td>
                  <td style={{ textAlign: 'right' }}>{p.days}</td>
                  <td style={{ textAlign: 'right' }}>{LIT_fmt(p.intAmount, 2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr style={{ fontWeight: 600, background: 'var(--ink-50)' }}>
              <td colSpan={7} style={{ textAlign: 'right' }}>รวม</td>
              <td style={{ textAlign: 'right' }}>{LIT_fmt(act.reduce((s, p) => s + (Number(p.intAmount) || 0), 0), 2)}</td>
            </tr></tfoot>
          </table>
        </div>

        {/* Refund */}
        <div style={{ fontWeight: 600, marginTop: 12, marginBottom: 6 }}>💸 ขารับคืน ({ref.length} รายการ)</div>
        {ref.length === 0 ? (
          <div style={{ padding: 12, color: 'var(--ink-500)', textAlign: 'center', border: '1px dashed var(--ink-200)', borderRadius: 8 }}>
            ยังไม่มีรับคืน
          </div>
        ) : (
          <div style={{ border: '1px solid var(--ink-200)', borderRadius: 8 }}>
            <table className="tbl" style={{ width: '100%', fontSize: 12 }}>
              <thead><tr>
                <th>วันที่</th><th>ประเภท</th><th>เอกสาร</th><th>หมายเหตุ</th>
                <th style={{ textAlign: 'right' }}>จำนวน</th>
              </tr></thead>
              <tbody>
                {ref.map((r, i) => (
                  <tr key={i}>
                    <td>{LIT_fmtDate(r.refundDate)}</td>
                    <td>{r.refundType === 'RV' ? '🧾 หักตอน RV' : '🏦 โอนคืน'}</td>
                    <td>{r.refDoc || '—'}</td>
                    <td title={r.note} style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.note}</td>
                    <td style={{ textAlign: 'right' }}>{LIT_fmt(r.amount, 2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr style={{ fontWeight: 600, background: 'var(--ink-50)' }}>
                <td colSpan={4} style={{ textAlign: 'right' }}>รวมรับคืน</td>
                <td style={{ textAlign: 'right' }}>{LIT_fmt(ref.reduce((s, r) => s + (Number(r.amount) || 0), 0), 2)}</td>
              </tr></tfoot>
            </table>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>ปิด</button>
          <button className="btn btn-primary" onClick={() => onExportOne(loan)}>
            📥 Export ชีตสัญญานี้ (มีสูตร)
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ── LeasitPanel — main component ─────────────────────────────────────── */
function LeasitPanel({ data, setData, toast, canEdit }) {
  const [showImport, setShowImport] = React.useState(false);
  const [viewLoan, setViewLoan] = React.useState(null);
  const [query, setQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');

  const allRows = (data?.debtMaster || []).filter(r => r.leasitSource === true);
  const prepaid = data?.interestSchedulePrepaid || [];
  const actual = data?.interestScheduleActual || [];
  const refund = data?.interestRefund || [];

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
    return rows.slice().sort((a, b) => (a.leasitLoanId || 0) - (b.leasitLoanId || 0));
  }, [allRows, query, statusFilter]);

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
    setData(d => {
      // 1) debtMaster — keep non-leasit + replace leasit rows that overlap
      const existing = d.debtMaster || [];
      const keepDm = existing.filter(r => !r.leasitSource || !litLoanIds.has(r.leasitLoanId));
      const newDm = parsed.loans.map(L => window.LeasitEngine.litLoanToDebtRow(L));
      // map id ของแถวเดิม (กัน id ใหม่ทับ — แต่เราใช้ deterministic 'lit_<n>' อยู่แล้ว → ทับเป็นเรื่องดี)
      const nextDm = keepDm.concat(newDm);

      // 2) child tables — replace rows for imported loanIds
      const keepPre = (d.interestSchedulePrepaid || []).filter(r => !litLoanIds.has(r.loanId));
      const newPre = parsed.prepaid.map((p, i) => ({
        id: litRowId(p.loanId, 'pre', p.seq || i + 1),
        ...p
      }));
      const keepAct = (d.interestScheduleActual || []).filter(r => !litLoanIds.has(r.loanId));
      const newAct = parsed.actual.map((p, i) => ({
        id: litRowId(p.loanId, 'act', p.seq || i + 1),
        ...p
      }));
      const keepRef = (d.interestRefund || []).filter(r => !litLoanIds.has(r.loanId));
      const newRef = parsed.refund.map((p, i) => ({
        id: litRowId(p.loanId, 'ref', i + 1),
        ...p
      }));

      return {
        ...d,
        debtMaster: nextDm,
        interestSchedulePrepaid: keepPre.concat(newPre),
        interestScheduleActual: keepAct.concat(newAct),
        interestRefund: keepRef.concat(newRef)
      };
    });
    if (window.WTPData && window.WTPData.forceSyncNow) {
      setTimeout(() => window.WTPData.forceSyncNow(), 200);
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

  // ── Principal summary: PRE vs POS (drawn / repaid / outstanding) ──
  const principalSummary = React.useMemo(() => {
    const acc = {
      PRE: { count: 0, active: 0, drawn: 0, repaid: 0, outstanding: 0 },
      POS: { count: 0, active: 0, drawn: 0, repaid: 0, outstanding: 0 }
    };
    allRows.forEach(r => {
      const isPRE = String(r.leasitTicketType || '').toUpperCase() === 'PRE';
      const bkt = isPRE ? acc.PRE : acc.POS;
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
    <div className="card" style={{ padding: 14, borderTop: '3px solid ' + color }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{
          padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
          background: color, color: '#fff'
        }}>{label}</span>
        <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>
          {bkt.count} สัญญา · Active {bkt.active}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, fontSize: 12 }}>
        <div>
          <div style={{ color: 'var(--ink-500)' }}>↗ เบิก</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{LIT_fmt(bkt.drawn, 0)}</div>
        </div>
        <div>
          <div style={{ color: 'var(--ink-500)' }}>↙ คืน</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'oklch(50% 0.14 145)' }}>{LIT_fmt(bkt.repaid, 0)}</div>
        </div>
        <div>
          <div style={{ color: 'var(--ink-500)' }}>● คงเหลือ</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: bkt.outstanding > 0 ? 'var(--bad)' : 'var(--ink-500)' }}>
            {LIT_fmt(bkt.outstanding, 0)}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      {/* ⏰ Maturity alert banner — Active loans ครบกำหนดใน 30 วัน */}
      {maturityAlerts.length > 0 && (
        <div className="card" style={{
          padding: 14, marginBottom: 14,
          background: 'oklch(96% 0.06 80)',
          borderLeft: '4px solid oklch(70% 0.18 80)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              ⏰ ครบกำหนดภายใน 30 วัน ({maturityAlerts.length} สัญญา)
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-500)' }}>
              เงินต้นรวม {LIT_fmt(maturityAlerts.reduce((s, a) => s + (Number(a.row.principalAmount) || 0), 0), 0)}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
            {maturityAlerts.slice(0, 12).map(({ row: r, dueISO, days }) => (
              <div
                key={r.id}
                onClick={() => setViewLoan(r)}
                style={{
                  padding: 10, background: 'var(--panel)', borderRadius: 8, cursor: 'pointer',
                  border: '1px solid ' + (days < 0 ? 'var(--bad)' : days <= 7 ? 'oklch(70% 0.18 80)' : 'var(--ink-200)')
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: 12 }}>#{r.leasitLoanId} · {r.contractNo}</div>
                  <span style={{
                    padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                    background: days < 0 ? 'var(--bad)' : days <= 7 ? 'oklch(70% 0.18 80)' : 'var(--ink-300)',
                    color: '#fff'
                  }}>
                    {days < 0 ? `เกิน ${Math.abs(days)} วัน` : days === 0 ? 'วันนี้' : `อีก ${days} วัน`}
                  </span>
                </div>
                <div title={r.projectName} style={{ fontSize: 11, color: 'var(--ink-700)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.projectName}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-500)', marginTop: 2 }}>
                  ครบกำหนด {LIT_fmtDate(dueISO)} · เงินต้น {LIT_fmt(r.principalAmount, 0)}
                </div>
              </div>
            ))}
          </div>
          {maturityAlerts.length > 12 && (
            <div style={{ fontSize: 11, color: 'var(--ink-500)', marginTop: 6 }}>
              แสดง 12 รายการแรก จากทั้งหมด {maturityAlerts.length}
            </div>
          )}
        </div>
      )}

      {/* 💰 Principal summary by PRE/POS */}
      <div className="grid grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 14 }}>
        <PrincipalCard label="PRE" bkt={principalSummary.PRE} color="oklch(52% 0.16 250)" />
        <PrincipalCard label="POS" bkt={principalSummary.POS} color="oklch(56% 0.18 25)" />
      </div>

      {/* KPI Row */}
      <div className="grid grid-4 anim-stagger" style={{ marginBottom: 16 }}>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>สัญญาทั้งหมด</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{allRows.length}</div>
          <div style={{ fontSize: 11, color: 'var(--ink-500)', marginTop: 4 }}>
            🟢 Active {activeCnt} · ⚫ ปิด {closedCnt}
          </div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>ดอกจ่ายล่วงหน้ารวม</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{LIT_fmt(totPre, 0)}</div>
          <div style={{ fontSize: 11, color: 'var(--ink-500)', marginTop: 4 }}>
            ดอกเกิดจริง {LIT_fmt(totAct, 0)}
          </div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>ส่วนต่างรวม</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'oklch(52% 0.16 145)' }}>{LIT_fmt(totVar, 0)}</div>
          <div style={{ fontSize: 11, color: 'var(--ink-500)', marginTop: 4 }}>
            (ต้องได้คืน)
          </div>
        </div>
        <div className="card" style={{ padding: 14, background: totOut > 0.01 ? 'oklch(96% 0.05 22)' : 'oklch(96% 0.04 145)' }}>
          <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>ค้างรับคืน</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: totOut > 0.01 ? 'var(--bad)' : 'inherit' }}>
            {LIT_fmt(totOut, 0)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-500)', marginTop: 4 }}>
            รับคืนแล้ว {LIT_fmt(totRef, 0)}
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
          <button className="btn btn-primary" onClick={() => setShowImport(true)}>
            📥 นำเข้า Excel
          </button>
        )}
        <button className="btn btn-ghost" onClick={handleExportAll} disabled={!allRows.length}>
          📤 Export ทั้งหมด (มีสูตร)
        </button>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--ink-500)' }}>
          {allRows.length === 0
            ? '⚠️ ยังไม่มีข้อมูลลีซอิท — กด "📥 นำเข้า Excel" เพื่อ upload ไฟล์ตารางคำนวณดอกเบี้ย'
            : 'ไม่พบสัญญาที่ค้นหา'}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl" style={{ width: '100%', fontSize: 13 }}>
              <thead>
                <tr>
                  <th>#</th><th>เลขที่สัญญา</th><th>JOB</th><th>โครงการ</th>
                  <th style={{ textAlign: 'right' }}>วงเงิน</th>
                  <th style={{ textAlign: 'right' }}>อัตรา</th>
                  <th>รับเงิน</th><th>ครบกำหนด</th><th>สถานะ</th>
                  <th style={{ textAlign: 'right' }}>ดอกล่วงหน้า</th>
                  <th style={{ textAlign: 'right' }}>ดอกเกิดจริง</th>
                  <th style={{ textAlign: 'right' }}>ส่วนต่าง</th>
                  <th style={{ textAlign: 'right' }}>รับคืนแล้ว</th>
                  <th style={{ textAlign: 'right' }}>ค้างรับคืน</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} onClick={() => setViewLoan(r)} style={{ cursor: 'pointer' }}>
                    <td>{r.leasitLoanId}</td>
                    <td>{r.contractNo}</td>
                    <td>{r.projectCode || '—'}</td>
                    <td title={r.projectName} style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.projectName}</td>
                    <td style={{ textAlign: 'right' }}>{LIT_fmt(r.principalAmount, 0)}</td>
                    <td style={{ textAlign: 'right' }}>{(r.interestRate * 100).toFixed(2)}%</td>
                    <td>{LIT_fmtDate(r.leasitDateReceived)}</td>
                    <td>{LIT_fmtDate(r.leasitDateDue)}</td>
                    <td>{r.status === 'Active' ? '🟢' : '⚫'}</td>
                    <td style={{ textAlign: 'right' }}>{LIT_fmt(r.leasitTotalPrepaid, 2)}</td>
                    <td style={{ textAlign: 'right' }}>{LIT_fmt(r.leasitTotalActual, 2)}</td>
                    <td style={{ textAlign: 'right', color: 'oklch(52% 0.16 145)' }}>{LIT_fmt(r.leasitVariance, 2)}</td>
                    <td style={{ textAlign: 'right' }}>{LIT_fmt(r.leasitRefunded, 2)}</td>
                    <td style={{ textAlign: 'right', color: r.leasitRefundOutstanding > 0.01 ? 'var(--bad)' : 'var(--ink-500)', fontWeight: r.leasitRefundOutstanding > 0.01 ? 600 : 400 }}>
                      {LIT_fmt(r.leasitRefundOutstanding, 2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 600, background: 'var(--ink-50)' }}>
                  <td colSpan={4} style={{ textAlign: 'right' }}>รวม {filtered.length} สัญญา</td>
                  <td style={{ textAlign: 'right' }}>{LIT_fmt(filtered.reduce((s, r) => s + (Number(r.principalAmount) || 0), 0), 0)}</td>
                  <td colSpan={4}></td>
                  <td style={{ textAlign: 'right' }}>{LIT_fmt(filtered.reduce((s, r) => s + (Number(r.leasitTotalPrepaid) || 0), 0), 2)}</td>
                  <td style={{ textAlign: 'right' }}>{LIT_fmt(filtered.reduce((s, r) => s + (Number(r.leasitTotalActual) || 0), 0), 2)}</td>
                  <td style={{ textAlign: 'right' }}>{LIT_fmt(filtered.reduce((s, r) => s + (Number(r.leasitVariance) || 0), 0), 2)}</td>
                  <td style={{ textAlign: 'right' }}>{LIT_fmt(filtered.reduce((s, r) => s + (Number(r.leasitRefunded) || 0), 0), 2)}</td>
                  <td style={{ textAlign: 'right' }}>{LIT_fmt(filtered.reduce((s, r) => s + (Number(r.leasitRefundOutstanding) || 0), 0), 2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      <LeasitImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onConfirm={handleImport}
      />
      <LeasitLoanDrawer
        loan={viewLoan}
        prepaid={prepaid}
        actual={actual}
        refund={refund}
        onClose={() => setViewLoan(null)}
        onExportOne={handleExportOne}
      />
    </div>
  );
}

// expose
window.LeasitPanel = LeasitPanel;
