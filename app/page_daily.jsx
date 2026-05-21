// Daily Revenue Dashboard – matches "สรุปรายงานรับเงินประจำวัน" report (image attached).
// Globals: React, KpiTile, AnimatedNumber, Badge, Icon, fmtNum, fmtMoney, fmtDate, useToasts

const { useState: dRState, useMemo: dRMemo } = React;

function DailyRevenueDashboard({ data, setData, toast }) {
  const { daily, invoices, projects, meta } = data;
  const todayStr = daily.asOfDate || '2026-05-15';
  const todayLabel = new Date(todayStr).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const [editIv, setEditIv] = dRState(null);

  // List of invoices received today
  const todayInvoices = dRMemo(() => {
    return invoices.filter(iv => iv.receivedAt === todayStr);
  }, [invoices, todayStr]);

  const monthInvoices = dRMemo(() => {
    const m = todayStr.slice(0, 7);
    return invoices.filter(iv => iv.receivedAt && iv.receivedAt.startsWith(m));
  }, [invoices, todayStr]);

  const projectByCode = dRMemo(() => Object.fromEntries(projects.map(p => [p.code, p])), [projects]);

  const onAddPaid = () => setEditIv({ id: null, ivNo: '', projectCode: projects[0]?.code, period: 1, amount: 0, status: 'paid', deliveryStatus: 'received', invoiceDate: todayStr, expectedReceive: todayStr, receivedAt: todayStr });

  const saveIv = (iv) => {
    setData(d => {
      const next = { ...d };
      if (iv.id) {
        next.invoices = d.invoices.map(x => x.id === iv.id ? iv : x);
      } else {
        next.invoices = [{ ...iv, id: WTPData.newId() }, ...d.invoices];
      }
      return next;
    });
    setEditIv(null);
    toast('บันทึกใบแจ้งหนี้แล้ว');
  };

  const removeIv = (id) => {
    setData(d => ({ ...d, invoices: d.invoices.filter(x => x.id !== id) }));
    toast('ลบใบแจ้งหนี้แล้ว');
  };

  // Hero stats — count + value
  const ytdCount = invoices.filter(iv => iv.status === 'paid' && (iv.receivedAt || '').startsWith(String(meta.year))).length || daily.ytdAccum?.count || 77;
  const ytdValue = invoices.filter(iv => iv.status === 'paid' && (iv.receivedAt || '').startsWith(String(meta.year))).reduce((s, iv) => s + iv.amount, 0) || daily.ytdAccum?.value;
  const mtdCount = monthInvoices.length || daily.mtdAccum?.count || 5;
  const mtdValue = monthInvoices.reduce((s, iv) => s + iv.amount, 0) || daily.mtdAccum?.value;
  const todayCount = todayInvoices.length;
  const todayValue = todayInvoices.reduce((s, iv) => s + iv.amount, 0);

  return (
    <div className="page bg-pattern">
      <div className="page-head anim-in">
        <div>
          <h1 className="page-title">สรุปรายงานรับเงินประจำวัน</h1>
          <div className="page-sub">Daily Revenue Report · ข้อมูล ณ วันที่ {todayLabel}</div>
        </div>
        <div className="page-head-r">
          <button className="btn btn-ghost"><Icon name="refresh" size={14} /> อัปเดต Excel</button>
          <button className="btn btn-ghost"><Icon name="download" size={14} /> ส่งออก</button>
          <button className="btn btn-primary" onClick={onAddPaid}><Icon name="plus" size={14} /> บันทึกรับเงิน</button>
        </div>
      </div>

      {/* Hero panel — replicates the blue rounded panel from the image */}
      <div className="hero-pill anim-in" style={{ marginBottom: 18, position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 1 }}>
          <div>
            <div className="hero-pill-sub">{meta.companyName}</div>
            <div className="hero-pill-title" style={{ marginTop: 4 }}>สรุปรายงานรับเงินประจำวัน</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '.1em' }}>วันที่</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{todayLabel}</div>
          </div>
        </div>
      </div>

      {/* Three summary pills — replicates the image layout exactly */}
      <div style={{ marginBottom: 24 }} className="anim-stagger">
        <div className="summary-pill">
          <div><span className="lbl-pill"><Icon name="money" size={16} /> มูลค่ารับสะสมในปี {meta.year}</span></div>
          <div className="count-bit"><AnimatedNumber value={ytdCount} digits={0} /><small>จำนวน IV</small></div>
          <div className="val-bit"><AnimatedNumber value={ytdValue} /><small>มูลค่า (บาท)</small></div>
        </div>
        <div className="summary-pill">
          <div><span className="lbl-pill"><Icon name="bank" size={16} /> มูลค่ารับสะสมในเดือนนี้</span></div>
          <div className="count-bit"><AnimatedNumber value={mtdCount} digits={0} /><small>จำนวน IV</small></div>
          <div className="val-bit"><AnimatedNumber value={mtdValue} /><small>มูลค่า (บาท)</small></div>
        </div>
        <div className="summary-pill is-today">
          <div><span className="lbl-pill"><Icon name="daily" size={16} /> โครงการที่รับเงินวันนี้</span></div>
          <div className="count-bit"><AnimatedNumber value={todayCount} digits={0} /><small>จำนวน IV</small></div>
          <div className="val-bit"><AnimatedNumber value={todayValue} /><small>มูลค่า (บาท)</small></div>
        </div>
      </div>

      {/* Today's invoice list */}
      <div className="card anim-in" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="card-title">รายการใบแจ้งหนี้ที่รับเงินวันนี้</div>
            <div className="card-sub">{todayInvoices.length} รายการ · รวม {fmtNum(todayValue)} บาท</div>
          </div>
          <button className="btn btn-sm" onClick={onAddPaid}><Icon name="plus" size={12} /> เพิ่มรายการ</button>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 50 }}>ที่</th>
              <th>ชื่อโครงการ</th>
              <th style={{ width: 90, textAlign: 'center' }}>งวด</th>
              <th style={{ width: 180, textAlign: 'right' }}>มูลค่าใบแจ้งหนี้</th>
              <th style={{ width: 140 }}>วันที่เงินเข้า</th>
              <th style={{ width: 110 }}></th>
            </tr>
          </thead>
          <tbody>
            {todayInvoices.length === 0 && (
              <tr><td colSpan={6} style={{ padding: '36px 14px', textAlign: 'center', color: 'var(--ink-500)' }}>ยังไม่มีใบแจ้งหนี้ที่รับเงินในวันนี้ · กดเพิ่มรายการเพื่อบันทึก</td></tr>
            )}
            {todayInvoices.map((iv, idx) => {
              const p = projectByCode[iv.projectCode];
              return (
                <tr key={iv.id}>
                  <td>{idx + 1}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{iv.projectCode}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{p?.name || '—'}</div>
                  </td>
                  <td style={{ textAlign: 'center' }}>{iv.period}</td>
                  <td className="num strong">{fmtNum(iv.amount)}</td>
                  <td>{fmtDate(iv.receivedAt)}</td>
                  <td>
                    <div className="row-act">
                      <button className="btn-icon" title="แก้ไข" onClick={() => setEditIv(iv)}><Icon name="edit" size={14} /></button>
                      <button className="btn-icon danger" title="ลบ" onClick={() => removeIv(iv.id)}><Icon name="trash" size={14} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {todayInvoices.length > 0 && (
            <tfoot>
              <tr>
                <td></td>
                <td>รวมทั้งสิ้น</td>
                <td></td>
                <td className="num">{fmtNum(todayValue)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <InvoiceEditModal iv={editIv} projects={projects} onClose={() => setEditIv(null)} onSave={saveIv} />
    </div>
  );
}

function InvoiceEditModal({ iv, projects, onClose, onSave }) {
  const [draft, setDraft] = dRState(iv);
  React.useEffect(() => { setDraft(iv); }, [iv]);
  if (!iv) return null;
  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));
  return (
    <Modal
      open={!!iv}
      title={iv.id ? 'แก้ไขใบแจ้งหนี้' : 'บันทึกใบแจ้งหนี้ใหม่'}
      onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>ยกเลิก</button>
        <button className="btn btn-primary" onClick={() => onSave(draft)}><Icon name="check" size={14} /> บันทึก</button>
      </>}
    >
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        <div className="field"><label>เลขที่ใบแจ้งหนี้ (IV)</label>
          <input className="input" value={draft.ivNo || ''} onChange={(e) => set('ivNo', e.target.value)} placeholder="IV2026-XXX" />
        </div>
        <div className="field"><label>รหัสโครงการ</label>
          <select className="select input" value={draft.projectCode || ''} onChange={(e) => set('projectCode', e.target.value)}>
            <option value="">— เลือก —</option>
            {projects.map(p => <option key={p.id} value={p.code}>{p.code} · {p.name.slice(0,30)}</option>)}
          </select>
        </div>
        <div className="field"><label>งวดที่</label>
          <input className="input" type="number" value={draft.period || 1} onChange={(e) => set('period', Number(e.target.value))} />
        </div>
        <div className="field"><label>มูลค่า (บาท)</label>
          <input className="input" type="number" value={draft.amount || 0} onChange={(e) => set('amount', Number(e.target.value))} />
        </div>
        <div className="field"><label>วันที่ออก IV</label>
          <input className="input" type="date" value={draft.invoiceDate || ''} onChange={(e) => set('invoiceDate', e.target.value)} />
        </div>
        <div className="field"><label>คาดการณ์รับเงิน</label>
          <input className="input" type="date" value={draft.expectedReceive || ''} onChange={(e) => set('expectedReceive', e.target.value)} />
        </div>
        <div className="field"><label>วันที่เงินเข้า</label>
          <input className="input" type="date" value={draft.receivedAt || ''} onChange={(e) => set('receivedAt', e.target.value || null)} />
        </div>
        <div className="field"><label>สถานะ</label>
          <select className="select input" value={draft.status || 'pending_delivery'} onChange={(e) => set('status', e.target.value)}>
            <option value="pending_delivery">รอส่งมอบงาน</option>
            <option value="awaiting_payment">รอรับชำระ</option>
            <option value="paid">รับชำระแล้ว</option>
          </select>
        </div>
      </div>
    </Modal>
  );
}

Object.assign(window, { DailyRevenueDashboard });
