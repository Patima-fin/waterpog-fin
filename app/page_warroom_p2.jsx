// War Room — Page 2: Estimated annual cash flow from existing projects.
// Matches "Present War room - 18052026 การเงินด้านรับ" PDF page 2.
// Globals: React, KpiTile, AnimatedNumber, Badge, Icon, StackedBars, fmtNum, fmtMoney, fmtDate, KpiCallout, SectionCard, BigCallout

const { useMemo: wr2Memo, useState: wr2State } = React;

function WarRoomPage2({ data, setData, toast }) {
  const { monthlyForecast, warroomP2, meta } = data;
  const [editMode, setEditMode] = wr2State(false);
  const [drill, setDrill] = wr2State(null);
  useOverrideSubAny();

  // ── Helpers (prefixed wr2 เพื่อกัน collision กับ page อื่น) ─────────────
  const getStart = (p) => p['Start'] || p['start'] || p['startDate'] || p['_start'] || '';
  const isEmpty = (v) => {
    if (v == null) return true;
    const s = String(v).trim();
    return s === '' || s === '—' || s === '-' || s === '0' || s.toLowerCase() === 'null';
  };
  const wr2ToN = (v) => { const n = Number(String(v == null ? '' : v).replace(/[, ]/g, '')); return isNaN(n) ? 0 : n; };
  const wr2NormCode = (code) => {
    const s = String(code || '').trim();
    if (!s) return '';
    const m = s.match(/^(.+?)-[A-Z]{2,6}$/);
    return m ? m[1] : s;
  };
  const wr2IsCancelled = (p) => {
    if (!p) return false;
    for (const k in p) {
      if (!/ยกเลิก/.test(k)) continue;
      const v = p[k]; if (v == null || v === '') continue;
      if (wr2ToN(v) === 1) return true;
      if (/^(❌|❎|✗|✘|x|true|yes)$/i.test(String(v).trim())) return true;
    }
    return false;
  };
  // มูลค่าใบจัดสรร: เงินตามใบจัดสรร → งบประมาณ → fallback
  const wr2GetAlloc = (p) =>
    wr2ToN(p['เงินตามใบจัดสรร']) || wr2ToN(p['งบประมาณ']) || wr2ToN(p.budget) || wr2ToN(p.allocBudget) || 0;
  // มูลค่าสัญญารวม VAT (ตามชีต ถ้าไม่มี → คูณ 1.07 จากค่าก่อน VAT)
  const wr2GetContract = (p) => {
    const vat = wr2ToN(p['มูลค่าสัญญาที่เซ็น (รวมVAT)']) || wr2ToN(p['มูลค่าสัญญาที่เซ็น (รวม VAT)']);
    if (vat > 0) return vat;
    const pre = wr2ToN(p['มูลค่าสัญญาที่เซ็น']) || wr2ToN(p.signedValue);
    return pre > 0 ? Math.round(pre * 1.07 * 100) / 100 : 0;
  };

  // ── Live calculation — ดึงทุกยอดจาก data.projects + data.invoices + data.receipts
  const liveCalc = wr2Memo(() => {
    const projects = data.projects || [];
    const invoices = data.invoices || [];
    const receipts = data.receipts || [];
    // ตัดโครงการยกเลิกออกจาก dashboard ทั้งหมด
    const active = projects.filter(p => !wr2IsCancelled(p));

    // index ใบแจ้งหนี้ตาม project code (normalize เผื่อ suffix -STIIS)
    const invByCode = {};
    invoices.forEach(iv => {
      const c = wr2NormCode(iv.jobNo || iv.contractRef || iv.projectCode || '');
      if (c) (invByCode[c] = invByCode[c] || []).push(iv);
    });
    // index receipts ตาม invoice number (เพื่อตรวจสอบเงินรับจริงผ่าน IV)
    const rcByIvNo = {};
    receipts.forEach(rc => {
      const ivNo = rc.invoiceNo || rc.ivNo;
      if (ivNo) (rcByIvNo[ivNo] = rcByIvNo[ivNo] || []).push(rc);
    });
    const projInvoicesOf = (p) => {
      const c = wr2NormCode(p['Contract No.'] || p.code || '');
      return c ? (invByCode[c] || []) : [];
    };
    const receiptsOfIv = (iv) => rcByIvNo[iv.ivNo || iv.invoiceNo] || [];

    // 1) รอลงนาม — Start ว่าง + ไม่ยกเลิก → ใช้มูลค่าใบจัดสรร
    const unsignedList = active
      .filter(p => isEmpty(getStart(p)))
      .map(p => ({
        id: p.id,
        code: String(p['Contract No.'] || p.code || '—').trim(),
        name: String(p['พื้นที่'] || p.name || '—').trim(),
        province: p['Province'] || '',
        value: wr2GetAlloc(p),
      }))
      .filter(p => p.value > 0)
      .sort((a, b) => b.value - a.value);
    const unsignedValue = unsignedList.reduce((s, p) => s + p.value, 0);

    // 2) ใบแจ้งหนี้คงค้าง — IV status != paid, balance > 0
    const invForwardList = invoices
      .filter(iv => iv.status !== 'paid' && wr2ToN(iv.balance) > 0)
      .map(iv => ({
        id: iv.id,
        ivNo: iv.ivNo || iv.invoiceNo || '—',
        code: iv.jobNo || iv.contractRef || '',
        name: iv.projectName || iv.customer || iv.customerName || '',
        invoiceDate: iv.invoiceDate || '',
        expectedReceive: iv.expectedReceive || '',
        value: wr2ToN(iv.balance),
        status: iv.status || '',
      }))
      .sort((a, b) => b.value - a.value);
    const invForwardValue = invForwardList.reduce((s, iv) => s + iv.value, 0);

    // 3) งานระหว่างก่อสร้าง (WIP) — ลงนามแล้ว + ยังไม่ออก/ไม่จ่าย IV ครบ
    //    settled = max(billed, received) — เลือกตัวที่มากกว่า (เผื่อรับเงินไม่ผ่าน IV)
    //    WIP = contract - settled
    //    ตัดออก: โครงการที่ไม่มี IV link เลย AND ไม่มี receipt link เลย
    //      → น่าจะเป็นข้อมูลเก่า/ปิดไปแล้ว ที่ไม่ track ใน IV system
    const wipList = active
      .filter(p => !isEmpty(getStart(p)))
      .map(p => {
        const contract = wr2GetContract(p);
        const ivs = projInvoicesOf(p);
        // billed = ผลรวม IV ที่ออกแล้ว (paid + outstanding)
        const billed = ivs.reduce((s, iv) => {
          const paid = wr2ToN(iv.netReceived || iv.grossAmount || 0);
          const bal  = wr2ToN(iv.balance || 0);
          return s + (iv.status === 'paid' ? paid : (paid + bal));
        }, 0);
        // received = ผลรวม receipts ที่ link ผ่าน IV ของโครงการนี้
        const received = ivs.reduce((s, iv) => {
          const rcs = receiptsOfIv(iv);
          return s + rcs.reduce((s2, rc) => s2 + wr2ToN(rc.netReceived || rc.grossAmount || 0), 0);
        }, 0);
        const settled = Math.max(billed, received);
        const wip = Math.max(0, contract - settled);
        const hasOutstandingIV = ivs.some(iv => iv.status !== 'paid' && wr2ToN(iv.balance) > 0);
        return {
          id: p.id,
          code: String(p['Contract No.'] || p.code || '—').trim(),
          name: String(p['พื้นที่'] || p.name || '—').trim(),
          province: p['Province'] || '',
          contract, billed, received, settled, wip,
          ivCount: ivs.length,
          rcCount: ivs.reduce((s, iv) => s + receiptsOfIv(iv).length, 0),
          hasOutstandingIV,
        };
      })
      // เก็บเฉพาะที่ยังมี work รออยู่ (wip > 0) AND มีร่องรอย IV/receipt
      // (ถ้าไม่มี IV/receipt เลย = น่าจะเป็นข้อมูลเก่า ปิดไปแล้ว ไม่ใช่ WIP จริง)
      .filter(x => x.wip > 0 && (x.ivCount > 0 || x.rcCount > 0))
      .sort((a, b) => b.wip - a.wip);
    const wipValue = wipList.reduce((s, x) => s + x.wip, 0);

    // แยกโครงการที่ "settled แล้ว" (รับเงินครบ ไม่มี IV ค้าง) ไว้สำหรับ debug/drill
    const closedList = active
      .filter(p => !isEmpty(getStart(p)))
      .map(p => {
        const contract = wr2GetContract(p);
        const ivs = projInvoicesOf(p);
        const received = ivs.reduce((s, iv) => {
          const rcs = receiptsOfIv(iv);
          return s + rcs.reduce((s2, rc) => s2 + wr2ToN(rc.netReceived || 0), 0);
        }, 0);
        return {
          id: p.id, code: p['Contract No.'] || p.code, name: p['พื้นที่'] || p.name,
          contract, received, ivCount: ivs.length, rcCount: ivs.reduce((s,iv) => s + receiptsOfIv(iv).length, 0),
        };
      })
      .filter(x => x.received >= x.contract * 0.99 && x.contract > 0);

    const signedTotal = invForwardValue + wipValue;
    const grandTotal = signedTotal + unsignedValue;

    if (typeof window !== 'undefined') {
      window.__wtpDebug_wr2 = {
        unsigned: { count: unsignedList.length, value: unsignedValue },
        invForward: { count: invForwardList.length, value: invForwardValue },
        wip: { count: wipList.length, value: wipValue },
        signedTotal, grandTotal,
      };
    }

    return {
      unsigned:   { value: unsignedValue,   count: unsignedList.length,   list: unsignedList },
      invForward: { value: invForwardValue, count: invForwardList.length, list: invForwardList },
      wip:        { value: wipValue,        count: wipList.length,        list: wipList },
      signedTotal, grandTotal,
    };
  }, [data.projects, data.invoices]);

  // ── Drill-down builders ─────────────────────────────────────────────────
  const fmtT0 = (v) => Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const openUnsignedDrill = () => setDrill({
    title: '📋 โครงการที่รอลงนามสัญญา',
    subtitle: liveCalc.unsigned.count + ' โครงการ · รวม ' + fmtT0(liveCalc.unsigned.value) + ' บาท · (Start ว่าง · ไม่ยกเลิก · ใช้มูลค่าใบจัดสรร)',
    items: liveCalc.unsigned.list,
    total: liveCalc.unsigned.value,
    columns: [
      { key: 'code', label: 'Contract No.', width: 110 },
      { key: 'name', label: 'ชื่อโครงการ / พื้นที่' },
      { key: 'province', label: 'จังหวัด', width: 100 },
      { key: 'value', label: 'มูลค่าใบจัดสรร (฿)', align: 'right', width: 150, fmt: (v) => fmtT0(v), isMoney: true },
    ],
  });
  const openInvForwardDrill = () => setDrill({
    title: '🧾 ใบแจ้งหนี้คงค้าง',
    subtitle: liveCalc.invForward.count + ' ใบ · รวม ' + fmtT0(liveCalc.invForward.value) + ' บาท · (ออก IV แล้ว · รอรับเงิน)',
    items: liveCalc.invForward.list,
    total: liveCalc.invForward.value,
    columns: [
      { key: 'ivNo', label: 'IV No.', width: 110 },
      { key: 'code', label: 'Job No.', width: 110 },
      { key: 'name', label: 'โครงการ / ลูกค้า' },
      { key: 'expectedReceive', label: 'คาดรับ', width: 100, fmt: (v) => v ? fmtDate(v) : '—' },
      { key: 'value', label: 'ยอดคงค้าง (฿)', align: 'right', width: 140, fmt: (v) => fmtT0(v), isMoney: true },
    ],
  });
  const openWipDrill = () => setDrill({
    title: '🚧 มูลค่างานระหว่างก่อสร้าง (WIP)',
    subtitle: liveCalc.wip.count + ' โครงการ · รวม ' + fmtT0(liveCalc.wip.value) + ' บาท · (ลงนามแล้ว · contract − max(IV billed, รับเงิน) · ตัดที่ไม่มี IV/receipt)',
    items: liveCalc.wip.list,
    total: liveCalc.wip.value,
    columns: [
      { key: 'code', label: 'Contract No.', width: 110 },
      { key: 'name', label: 'ชื่อโครงการ' },
      { key: 'contract', label: 'สัญญา (฿)', align: 'right', width: 110, fmt: (v) => fmtT0(v) },
      { key: 'billed', label: 'ออก IV (฿)', align: 'right', width: 110, fmt: (v) => fmtT0(v) },
      { key: 'received', label: 'รับเงิน (฿)', align: 'right', width: 110, fmt: (v) => fmtT0(v) },
      { key: 'ivCount', label: '#IV', align: 'center', width: 50 },
      { key: 'wip', label: 'WIP (฿)', align: 'right', width: 120, fmt: (v) => fmtT0(v), isMoney: true },
    ],
  });
  const openSignedDrill = () => setDrill({
    title: '✍️ โครงการที่ลงนามแล้ว',
    subtitle: 'รวม ' + fmtT0(liveCalc.signedTotal) + ' บาท · = ใบแจ้งหนี้คงค้าง + WIP',
    items: [
      { label: '🧾 ใบแจ้งหนี้คงค้าง', sub: liveCalc.invForward.count + ' ใบ · รอรับเงิน', value: liveCalc.invForward.value, _click: openInvForwardDrill },
      { label: '🚧 งานระหว่างก่อสร้าง', sub: liveCalc.wip.count + ' โครงการ · ส่วนที่เหลือยังไม่ออก IV', value: liveCalc.wip.value, _click: openWipDrill },
    ],
    total: liveCalc.signedTotal,
    columns: [
      { key: 'label', label: 'รายการ' },
      { key: 'sub', label: 'รายละเอียด' },
      { key: 'value', label: 'มูลค่า (฿)', align: 'right', width: 150, fmt: (v) => fmtT0(v), isMoney: true },
    ],
  });
  const openGrandTotalDrill = () => setDrill({
    title: '💰 มูลค่าโครงการที่คาดว่าจะได้รับทั้งหมด',
    subtitle: 'ทั้งปี ' + meta.year + ' · รวม ' + fmtT0(liveCalc.grandTotal) + ' บาท',
    items: [
      { label: '🧾 ใบแจ้งหนี้คงค้าง', sub: liveCalc.invForward.count + ' ใบ · ออก IV แล้ว · รอรับเงิน', value: liveCalc.invForward.value, _click: openInvForwardDrill },
      { label: '🚧 งานระหว่างก่อสร้าง', sub: liveCalc.wip.count + ' โครงการ · ลงนามแล้ว · ส่วน WIP', value: liveCalc.wip.value, _click: openWipDrill },
      { label: '📋 โครงการที่รอลงนาม', sub: liveCalc.unsigned.count + ' โครงการ · มีใบจัดสรร · ยังไม่ลงนาม', value: liveCalc.unsigned.value, _click: openUnsignedDrill },
    ],
    total: liveCalc.grandTotal,
    columns: [
      { key: 'label', label: 'หมวด' },
      { key: 'sub', label: 'รายละเอียด' },
      { key: 'value', label: 'มูลค่า (฿)', align: 'right', width: 150, fmt: (v) => fmtT0(v), isMoney: true },
    ],
  });

  // backwards-compat aliases (ใช้กับ block ด้านล่าง)
  const liveUnsigned = { value: liveCalc.unsigned.value, count: liveCalc.unsigned.count };
  const liveTotalProjectValue = liveCalc.grandTotal;

  // Compute monthly totals
  const monthTotals = wr2Memo(() => monthlyForecast.reduce((acc, m) => ({
    invIssued: acc.invIssued + (m.invIssued || 0),
    signed:    acc.signed    + (m.signed    || 0),
    unsigned:  acc.unsigned  + (m.unsigned  || 0),
    debt:      acc.debt      + (m.debt      || 0),
    netUsable: acc.netUsable + (m.netUsable || 0),
  }), { invIssued: 0, signed: 0, unsigned: 0, debt: 0, netUsable: 0 }), [monthlyForecast]);

  // Bar chart data
  const barData = monthlyForecast.map(m => ({
    label: m.en,
    segments: [
      { key: 'inv',      label: 'IV คงค้าง',    value: m.invIssued || 0, color: 'oklch(60% 0.13 245)' },
      { key: 'signed',   label: 'ลงนามแล้ว',    value: m.signed    || 0, color: 'oklch(55% 0.16 215)' },
      { key: 'unsigned', label: 'ยังไม่ลงนาม',  value: m.unsigned  || 0, color: 'oklch(75% 0.10 250)' },
    ],
    net: m.netUsable,
  }));

  return (
    <div className="page bg-pattern">
      <div className="page-head anim-in">
        <div>
          <h1 className="page-title">Estimated Annual Cash Flow from Existing Projects</h1>
          <div className="page-sub">ประมาณการรับเงินจากโครงการทั้งหมด · ทั้งปี {meta.year} · ข้อมูล ณ {fmtDate(meta.asOf)}</div>
        </div>
        <div className="page-head-r">
          <CloudSyncStatusButton />
          <EditModeToggle value={editMode} onChange={setEditMode} />
          <a className="btn btn-ghost" href="#warroom1"><Icon name="arrow" size={14} style={{ transform: 'rotate(180deg)' }} /> ย้อนกลับ · หน้า 1</a>
          <PrintButton label="พิมพ์ / PDF" />
        </div>
      </div>

      {editMode && (
        <div style={{ marginBottom: 12, padding: '8px 14px', borderRadius: 10, background: 'color-mix(in oklch, var(--brand-500) 8%, transparent)', border: '1.5px solid color-mix(in oklch, var(--brand-500) 30%, transparent)', fontSize: 12, color: 'var(--brand-700)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700 }}>📝 โหมดแก้ไข — คลิกในช่องตัวเลขเพื่อกรอกค่า (Tab/Enter เพื่อบันทึก, ✕ เพื่อล้าง)</span>
          <button type="button" onClick={() => { if (confirm('ล้างค่าที่กรอกมือทั้งหมดในหน้านี้?')) WTPOverride.clearAll(); }}
            style={{ marginLeft: 'auto', padding: '3px 10px', fontSize: 11, borderRadius: 5, border: '1px solid var(--bad)', background: 'transparent', color: 'var(--bad)', cursor: 'pointer' }}>
            ล้างทั้งหมด
          </button>
        </div>
      )}

      {/* Headline KPI — มูลค่าโครงการที่คาดว่าจะได้รับทั้งหมด */}
      <div className="hero-pill anim-in" style={{ marginBottom: 18 }}>
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ cursor: editMode ? 'auto' : 'pointer' }}
            onClick={editMode ? undefined : openGrandTotalDrill}
            title={editMode ? '' : 'คลิกเพื่อดูที่มาของยอดรวม'}>
            <div style={{ fontSize: 13, opacity: 0.85, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
              มูลค่าโครงการที่คาดว่าจะได้รับทั้งหมด
              {!editMode && <span style={{ fontSize: 11, opacity: 0.7 }}>🔍</span>}
            </div>
            <div style={{ fontSize: 44, fontWeight: 800, marginTop: 4, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
              <EditableNumber ovKey="wr2.heroTotal" computed={liveCalc.grandTotal} editMode={editMode} digits={2} /> <span style={{ fontSize: 18, opacity: 0.8, fontWeight: 500 }}>บาท</span>
            </div>
            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6 }}>Total project value forecast · ปี {meta.year}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, auto)', gap: 24, fontSize: 12 }}>
            <div style={{ cursor: editMode ? 'auto' : 'pointer' }} onClick={editMode ? undefined : openInvForwardDrill} title={editMode ? '' : 'คลิกดูรายการ IV'}>
              <HeroStatEditable ovKey="wr2.heroInvForward" label="ใบแจ้งหนี้คงค้าง 🔍" computed={liveCalc.invForward.value} count={liveCalc.invForward.count} countKey="wr2.heroInvForwardCount" editMode={editMode} />
            </div>
            <div style={{ cursor: editMode ? 'auto' : 'pointer' }} onClick={editMode ? undefined : openWipDrill} title={editMode ? '' : 'คลิกดูโครงการระหว่างก่อสร้าง'}>
              <HeroStatEditable ovKey="wr2.heroWip" label="งานระหว่างก่อสร้าง 🔍" computed={liveCalc.wip.value} count={liveCalc.wip.count} countKey="wr2.heroWipCount" editMode={editMode} />
            </div>
            <div style={{ cursor: editMode ? 'auto' : 'pointer' }} onClick={editMode ? undefined : openUnsignedDrill} title={editMode ? '' : 'คลิกดูโครงการรอลงนาม'}>
              <HeroStatEditable ovKey="wr2.heroUnsigned" label="ใบจัดสรร · รอลงนาม 🔍" computed={liveCalc.unsigned.value} count={liveCalc.unsigned.count} editMode={editMode} countKey="wr2.heroUnsignedCount" />
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 1 — ประมาณการรับเงินจากโครงการทั้งหมด */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', marginTop: 6, marginBottom: 10 }}>
        <div style={{ width: 4, height: 22, background: 'var(--brand-500)', borderRadius: 2 }} />
        <h2 style={{ margin: 0, fontSize: 17, color: 'var(--ink-900)', fontWeight: 700 }}>ส่วนที่ 1 · ประมาณการรับเงินจากโครงการทั้งหมด</h2>
      </div>

      <div className="grid grid-2 anim-stagger" style={{ marginBottom: 18 }}>
        {/* 1.1 — Unsigned (clickable) */}
        <div className="card" onClick={editMode ? undefined : openUnsignedDrill}
          style={{ padding: 22, position: 'relative', overflow: 'hidden', cursor: editMode ? 'auto' : 'pointer' }}
          title={editMode ? '' : 'คลิกเพื่อดูรายการโครงการที่รอลงนาม'}>
          <div style={{ position: 'absolute', right: -40, top: -40, width: 140, height: 140, borderRadius: '50%', background: 'oklch(96% 0.04 250)' }} />
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Badge kind="b-gray" dot={false}>1.1</Badge>
              {!editMode && <span style={{ fontSize: 11, color: 'var(--ink-500)' }}>🔍 คลิกดูรายละเอียด</span>}
            </div>
            <div style={{ marginTop: 10, fontSize: 14, color: 'var(--ink-600)', fontWeight: 500 }}>โครงการที่รอลงนามสัญญา</div>
            <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>ได้รับใบจัดสรรแล้ว · Start ว่าง · ไม่ยกเลิก · ใช้มูลค่าใบจัดสรร</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 14 }}>
              <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--ink-900)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-.01em' }}
                onClick={editMode ? (e) => e.stopPropagation() : undefined}>
                <EditableNumber ovKey="wr2.s11Value" computed={liveCalc.unsigned.value} editMode={editMode} digits={2} />
              </div>
              <div style={{ fontSize: 14, color: 'var(--ink-500)' }}>บาท</div>
            </div>
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Badge kind="b-amber" dot>
                <EditableNumber ovKey="wr2.s11Count" computed={liveCalc.unsigned.count} editMode={editMode} digits={0} /> โครงการ
              </Badge>
              {liveCalc.grandTotal > 0 && (
                <span style={{ fontSize: 11.5, color: 'var(--ink-500)' }}>
                  {((WTPOverride.resolve('wr2.s11Value', liveCalc.unsigned.value) / liveCalc.grandTotal) * 100).toFixed(1)}% ของมูลค่าทั้งหมด
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 1.2 — Signed (clickable rows for breakdown) */}
        <div className="card" data-comment-anchor="cc-1" style={{ padding: 22, position: 'relative', overflow: 'hidden', borderColor: 'var(--brand-200)' }}>
          <div style={{ position: 'absolute', right: -40, top: -40, width: 140, height: 140, borderRadius: '50%', background: 'var(--brand-50)' }} />
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Badge kind="b-blue" dot={false}>1.2</Badge>
              {!editMode && <span style={{ fontSize: 11, color: 'var(--ink-500)' }}>🔍 คลิกแถวเพื่อดู</span>}
            </div>
            <div style={{ marginTop: 10, fontSize: 14, color: 'var(--ink-600)', fontWeight: 500, cursor: editMode ? 'auto' : 'pointer' }}
              onClick={editMode ? undefined : openSignedDrill}>
              ประมาณการรับเงินจากโครงการที่ลงนามแล้ว
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>= ใบแจ้งหนี้คงค้าง + งานระหว่างก่อสร้าง</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 14, cursor: editMode ? 'auto' : 'pointer' }}
              onClick={editMode ? undefined : openSignedDrill}>
              <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--brand-700)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-.01em' }}>
                <EditableNumber ovKey="wr2.s12Value" computed={liveCalc.signedTotal} editMode={editMode} digits={2} />
              </div>
              <div style={{ fontSize: 14, color: 'var(--ink-500)' }}>บาท</div>
            </div>

            {/* Breakdown — invoice vs WIP (each row clickable) */}
            <div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: 'white', border: '1px solid var(--line)', display: 'grid', gap: 10 }}>
              <div onClick={editMode ? undefined : openInvForwardDrill}
                style={{ cursor: editMode ? 'auto' : 'pointer', borderRadius: 8, padding: 4, margin: -4 }}
                title={editMode ? '' : 'คลิกดูใบแจ้งหนี้คงค้างทั้งหมด'}>
                <SignedBreakdownRow
                  color="oklch(60% 0.13 245)"
                  label={'มูลค่าใบแจ้งหนี้คงค้าง ' + (editMode ? '' : '🔍')}
                  sub={liveCalc.invForward.count + ' ใบ · ออก IV แล้ว · รอติดตามรับเงิน'}
                  value={WTPOverride.resolve('wr2.s12Inv', liveCalc.invForward.value)}
                  total={WTPOverride.resolve('wr2.s12Value', liveCalc.signedTotal)}
                  editMode={editMode}
                  ovKey="wr2.s12Inv"
                />
              </div>
              <div onClick={editMode ? undefined : openWipDrill}
                style={{ cursor: editMode ? 'auto' : 'pointer', borderRadius: 8, padding: 4, margin: -4 }}
                title={editMode ? '' : 'คลิกดูโครงการระหว่างก่อสร้าง'}>
                <SignedBreakdownRow
                  color="oklch(55% 0.16 215)"
                  label={'มูลค่างานระหว่างก่อสร้าง ' + (editMode ? '' : '🔍')}
                  sub={liveCalc.wip.count + ' โครงการ · contract – billed'}
                  value={WTPOverride.resolve('wr2.s12Wip', liveCalc.wip.value)}
                  total={WTPOverride.resolve('wr2.s12Value', liveCalc.signedTotal)}
                  editMode={editMode}
                  ovKey="wr2.s12Wip"
                />
              </div>
            </div>

            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Badge kind="b-blue" dot>{liveCalc.grandTotal > 0 ? ((liveCalc.signedTotal / liveCalc.grandTotal) * 100).toFixed(0) : 0}% ของมูลค่าทั้งหมด</Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Drill-down modal */}
      {drill && <Wr2DrillModal drill={drill} onClose={() => setDrill(null)} onPickRow={(row) => row && row._click && row._click()} />}

      {/* SECTION 2 — Monthly forecast table & chart */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', marginTop: 6, marginBottom: 10 }}>
        <div style={{ width: 4, height: 22, background: 'var(--brand-500)', borderRadius: 2 }} />
        <h2 style={{ margin: 0, fontSize: 17, color: 'var(--ink-900)', fontWeight: 700 }}>ส่วนที่ 2 · รวมประมาณการเงินที่คาดว่าจะได้รับในแต่ละเดือน</h2>
      </div>

      <div className="card anim-in" style={{ marginBottom: 18, padding: 18 }}>
        <div className="card-hd">
          <div>
            <div className="card-title">ประมาณการรับเงินรายเดือน</div>
            <div className="card-sub">แยกตามที่มา · IV คงค้าง / ลงนามแล้ว / ยังไม่ลงนาม</div>
          </div>
          <div style={{ display: 'flex', gap: 12, fontSize: 11.5, color: 'var(--ink-700)' }}>
            <LegendDot color="oklch(60% 0.13 245)" label="IV คงค้าง" />
            <LegendDot color="oklch(55% 0.16 215)" label="ลงนามแล้ว (รอส่งงาน)" />
            <LegendDot color="oklch(75% 0.10 250)" label="ยังไม่ลงนาม" />
          </div>
        </div>
        <StackedBars data={barData} height={300} />
      </div>

      {/* Monthly forecast detailed table */}
      <div className="card anim-in" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)' }}>
          <div className="card-title">ตารางประมาณการรับเงินรายเดือน (รายละเอียด)</div>
          <div className="card-sub">รวม {fmtNum(monthTotals.netUsable, 2)} บาท · 8 เดือนข้างหน้า</div>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>เดือน</th>
              <th style={{ textAlign: 'center', width: 80 }}>%</th>
              <th style={{ textAlign: 'right' }}>ใบแจ้งหนี้ยกมา</th>
              <th style={{ textAlign: 'right' }}>ลงนามแล้ว (รอส่งงาน)</th>
              <th style={{ textAlign: 'right' }}>ยังไม่ลงนาม</th>
              <th style={{ textAlign: 'right' }}>หักภาระหนี้</th>
              <th style={{ textAlign: 'right' }}>ใช้ได้สุทธิ</th>
            </tr>
          </thead>
          <tbody>
            {monthlyForecast.map((m, i) => (
              <tr key={i}>
                <td>
                  <span style={{ fontWeight: 600 }}>{m.month}</span>
                  <span className="muted" style={{ fontSize: 11.5, marginLeft: 6, fontWeight: 400 }}>({m.en})</span>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <Badge kind={m.pctOfRemaining >= 20 ? 'b-blue' : m.pctOfRemaining > 0 ? 'b-gray' : 'b-gray'} dot={false}>{m.pctOfRemaining}%</Badge>
                </td>
                <td className="num">{m.invIssued ? fmtNum(m.invIssued, 2) : <span className="muted">-</span>}</td>
                <td className="num">{m.signed ? fmtNum(m.signed, 2) : <span className="muted">-</span>}</td>
                <td className="num">{m.unsigned ? fmtNum(m.unsigned, 2) : <span className="muted">-</span>}</td>
                <td className="num" style={{ color: m.debt ? 'var(--bad)' : 'var(--ink-400)' }}>{m.debt ? '(' + fmtNum(Math.abs(m.debt), 2) + ')' : '-'}</td>
                <td className="num strong">{m.netUsable ? fmtNum(m.netUsable, 2) : <span className="muted">-</span>}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>รวมทั้งสิ้น</td>
              <td style={{ textAlign: 'center' }}>100%</td>
              <td className="num">{fmtNum(monthTotals.invIssued, 2)}</td>
              <td className="num">{fmtNum(monthTotals.signed, 2)}</td>
              <td className="num">{fmtNum(monthTotals.unsigned, 2)}</td>
              <td className="num" style={{ color: 'var(--bad)' }}>({fmtNum(Math.abs(monthTotals.debt), 2)})</td>
              <td className="num">{fmtNum(monthTotals.netUsable, 2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* (removed bottom stat strip per user request) */}
    </div>
  );
}

function HeroStat({ label, value, count }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 11, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
        {(value / 1_000_000).toFixed(2)} <span style={{ fontSize: 12, opacity: 0.85, fontWeight: 500 }}>ลบ.</span>
      </div>
      {count != null && <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>{count} โครงการ</div>}
    </div>
  );
}

// Editable variant — รับ ovKey เพื่อให้แก้ค่าได้ด้วย EditableNumber
function HeroStatEditable({ ovKey, label, computed, count, countKey, editMode }) {
  // ตอน editMode = แสดง input ของยอด (เป็นบาทเต็ม) แทน ลบ.
  // ตอน view = แสดง "X.XX ลบ." ตามเดิม + badge ✏️ ถ้า override
  const overridden = WTPOverride.has(ovKey);
  useOverrideSub(ovKey);
  useOverrideSub(countKey || '_');
  const value = WTPOverride.resolve(ovKey, computed);
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 11, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
        {editMode ? (
          <EditableNumber ovKey={ovKey} computed={computed} editMode={true} digits={0} />
        ) : (
          <>
            {(value / 1_000_000).toFixed(2)} <span style={{ fontSize: 12, opacity: 0.85, fontWeight: 500 }}>ลบ.</span>
            {overridden && <span title="แก้มือ" style={{ fontSize: 9, marginLeft: 4, opacity: 0.85 }}>✏️</span>}
          </>
        )}
      </div>
      {(count != null || countKey) && (
        <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>
          {countKey ? (
            <EditableNumber ovKey={countKey} computed={count || 0} editMode={editMode} digits={0} />
          ) : count} โครงการ
        </div>
      )}
    </div>
  );
}

function LegendDot({ color, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: color }} />
      {label}
    </span>
  );
}

function SmallStat({ label, value, accent }) {
  return (
    <div className="card" style={{ padding: 16, borderLeft: `3px solid ${accent}` }}>
      <div style={{ fontSize: 11.5, color: 'var(--ink-500)', fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink-900)', fontVariantNumeric: 'tabular-nums', marginTop: 4, letterSpacing: '-.01em' }}>
        <AnimatedNumber value={value} digits={2} />
        <span style={{ fontSize: 12, color: 'var(--ink-500)', fontWeight: 500, marginLeft: 4 }}>บาท</span>
      </div>
    </div>
  );
}

function SignedBreakdownRow({ color, label, sub, value, total, editMode, ovKey }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-800)' }}>{label}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>{sub}</div>
          </div>
        </div>
        <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-900)' }}>
            {ovKey ? (
              <EditableNumber ovKey={ovKey} computed={value} editMode={editMode} digits={2} />
            ) : fmtNum(value, 2)}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--ink-500)' }}>{pct.toFixed(1)}%</div>
        </div>
      </div>
      <div style={{ height: 5, background: 'var(--ink-100)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 800ms ease' }} />
      </div>
    </div>
  );
}

// ─── Drill-down modal ──────────────────────────────────────────────────────
function Wr2DrillModal({ drill, onClose, onPickRow }) {
  const { title, subtitle, items, columns, total } = drill;
  const fmtT0 = (v) => Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)',
      display: 'grid', placeItems: 'center', zIndex: 9000, padding: 20,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'white', borderRadius: 14, padding: 0,
        width: 'min(1000px, 95vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 60px rgba(15,23,42,0.35)',
      }}>
        <div style={{ padding: '20px 24px 12px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{title}</h2>
            {subtitle && <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 4, lineHeight: 1.5 }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 26, cursor: 'pointer', color: '#94a3b8', lineHeight: 1, flexShrink: 0 }}>×</button>
        </div>

        <div style={{ overflow: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 1 }}>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} style={{
                    padding: '10px 12px', textAlign: c.align || 'left', width: c.width,
                    borderBottom: '1px solid #cbd5e1', fontSize: 11, fontWeight: 700, color: '#475569',
                    whiteSpace: 'nowrap',
                  }}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={columns.length} style={{ padding: 36, textAlign: 'center', color: '#94a3b8' }}>ไม่มีรายการ</td></tr>
              )}
              {items.map((row, i) => {
                const clickable = !!row._click;
                return (
                  <tr key={i}
                    onClick={() => clickable && onPickRow(row)}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      cursor: clickable ? 'pointer' : 'default',
                      background: clickable && i % 2 === 0 ? '#fafbfc' : undefined,
                    }}
                    onMouseEnter={(e) => { if (clickable) e.currentTarget.style.background = '#eff6ff'; }}
                    onMouseLeave={(e) => { if (clickable) e.currentTarget.style.background = i % 2 === 0 ? '#fafbfc' : 'white'; }}
                  >
                    {columns.map((c) => {
                      const v = row[c.key];
                      const display = c.fmt ? c.fmt(v, row) : (v != null && v !== '' ? v : '—');
                      return (
                        <td key={c.key} style={{
                          padding: '8px 12px', textAlign: c.align || 'left',
                          color: c.isMoney ? '#0f172a' : '#0f172a',
                          fontWeight: c.isMoney ? 600 : 400,
                          fontVariantNumeric: c.align === 'right' ? 'tabular-nums' : 'normal',
                          maxWidth: c.width || 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }} title={typeof display === 'string' ? display : ''}>{display}</td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
            {total != null && items.length > 0 && (
              <tfoot>
                <tr style={{ background: '#f1f5f9', borderTop: '2px solid #cbd5e1' }}>
                  {columns.map((c, idx) => (
                    <td key={c.key} style={{
                      padding: '12px', fontWeight: 700, fontSize: 12.5, color: '#0f172a',
                      textAlign: c.align || 'left', fontVariantNumeric: 'tabular-nums',
                    }}>
                      {idx === 0 ? 'รวม ' + items.length + ' รายการ' : (c.isMoney ? fmtT0(total) + ' บาท' : '')}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { WarRoomPage2 });
