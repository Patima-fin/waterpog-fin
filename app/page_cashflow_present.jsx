/* =====================================================================
 * Cash Flow Presentation (#cashflow_present) — Water POG
 * ---------------------------------------------------------------------
 *  Executive Cash Flow Dashboard (tabbed) — พอร์ตจาก BIOAXEL แต่ป้อนข้อมูล
 *  จากไฟล์ "WTP-Cash Flow 20XX.xlsx" ของเตย (ชีต DATA). 4 แท็บ:
 *    1) ภาพรวม (Executive Summary)  — KPI + waterfall + รายเดือน + insights
 *    2) สรุปกิจกรรม                 — องค์ประกอบ + จุดเฝ้าระวัง รายกิจกรรม
 *    3) งบกระแสเงินสด               — ตารางงบ (สังเคราะห์จากรายการ; กดแถว → รายการ)
 *    4) รายการ (Transaction Explorer) — ตารางรายการ + ค้นหา/กรอง/sort
 *  ★ อัปโหลด "ไฟล์เดียว" (WTP-Cash Flow .xlsx) → อ่านชีต **DATA** (รายการที่จัด
 *    หมวด/กิจกรรม/รับ-จ่ายแล้ว) เป็นหัวใจ + sum(Amount)=กระแสเงินสดสุทธิ;
 *    เงินสดต้นงวด = Σ "ต้นงวด" ของชีตเดือนแรกที่มี (Jan./Feb./…); งบกระแสเงินสด
 *    "สังเคราะห์" จากรายการ (ไม่ต้องอัปไฟล์งบแยกแบบ BIO). prefix `cfp`/`Cfp`.
 *  ★ ข้อมูล "ส่วนกลาง" sync ผ่าน Supabase (ตาราง cashflowPresent, 1 แถว id='current')
 *    → ทุกคน/ผู้บริหารเห็นชุดเดียวกัน. localStorage `wtp-cfpresent-v1` = cache/offline
 *    ต่อเครื่อง. ต้องรัน supabase/cashflow-present.sql ครั้งเดียวก่อน (ไม่งั้น degrade เป็น local).
 * ===================================================================== */
(function () {
  const { useState, useEffect, useMemo, useRef } = React;
  const CFP_LS = 'wtp-cfpresent-v1';
  // ── team-share ผ่าน Supabase: เก็บ 1 แถว (id='current') ในตาราง cashflowPresent
  //    → ทุกคน/ผู้บริหารเห็นชุดเดียวกัน (เดิม localStorage ต่อเครื่อง = เห็นแค่คนอัป).
  //    อ่าน/เขียนผ่าน WTPData.fetchSheetRows/writeTable (cashflowPresent ∈ SHEET_TABLES).
  //    ต้องรัน supabase/cashflow-present.sql ครั้งเดียวก่อน (ไม่งั้น write จะ error → degrade เป็น local).
  const CFP_TABLE = 'cashflowPresent';
  const CFP_ROW_ID = 'current';
  function cfpCanSync() { return !!(window.WTPData && window.WTPData.fetchSheetRows && window.WTPData.writeTable && window.WTP_CONFIG && window.WTP_CONFIG.BACKEND === 'supabase'); }
  function cfpCurrentUser() { try { var s = JSON.parse(localStorage.getItem('wtp-session') || 'null'); return s ? (s.displayName || s.username || '') : ''; } catch (e) { return ''; } }
  function cfpWhen(ts) { try { var d = new Date(ts); var p = function (n) { return (n < 10 ? '0' : '') + n; }; return p(d.getDate()) + '/' + p(d.getMonth() + 1) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); } catch (e) { return ''; } }
  const CFP_MONTHS = { 1: 'ม.ค.', 2: 'ก.พ.', 3: 'มี.ค.', 4: 'เม.ย.', 5: 'พ.ค.', 6: 'มิ.ย.', 7: 'ก.ค.', 8: 'ส.ค.', 9: 'ก.ย.', 10: 'ต.ค.', 11: 'พ.ย.', 12: 'ธ.ค.' };

  // palette — โทนสีแบรนด์ Water POG (น้ำเงิน --brand-*); คงเขียว=เงินเข้า / แดง=เงินออก ตามหลักการเงิน
  const C = {
    primary: '#2a6fdb', primaryD: '#1a4490', teal: '#1f56b8', purple: '#9b7bff',
    ink: '#14233a', mut: '#5b6b86', faint: '#9aa6bd', line: '#e6ebf3',
    pos: '#15a45f', posBg: '#e5f6ec', neg: '#e5484d', negBg: '#fdecec',
    card: 'rgba(255,255,255,.85)', cardSolid: '#ffffff', soft: '#eef3fb',
    shadow: '0 10px 30px rgba(31,86,184,.15)',
  };
  // ── Type scale (ใช้ร่วมทุกแท็บ — ข้อความชนิดเดียวกันต้องขนาดเท่ากันทุกหน้า เพื่อความเป็นมืออาชีพตอนนำเสนอ) ──
  //   pageTitle 22 · sectionTitle 15 · kpiHero 26 · kpiAct 22 · tab/btn 14
  //   body/เซลล์ตาราง/แถวรายการ/ป้าย 13 · caption/สรุป/หัวคอลัมน์ 12 · micro/เชิงอรรถ/แท็ก 11
  const ACT_COLOR = { op: '#2a6fdb', inv: '#e08a3c', fin: '#9b7bff', transfer: '#6b7385', other: '#6b7385' };
  const ACT_TAGBG = { op: '#e3edfb', inv: '#fff0e6', fin: '#efe8ff', transfer: '#eef1f5', other: '#eef1f5' };
  const ACT_TAGFG = { op: '#1a4490', inv: '#d98032', fin: '#7a5fd0', transfer: '#6b7385', other: '#6b7385' };

  /* ---------- helpers ---------- */
  function cfpNum(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    if (v == null) return 0;
    let s = String(v).trim();
    if (s === '' || s === '-') return 0;
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    s = s.replace(/[,\s฿]/g, '');
    if (/^-?\d+(\.\d+)?$/.test(s)) { const n = parseFloat(s); return neg ? -n : n; }
    return 0;
  }
  // ★ ทุก path คืน "ค.ศ. (CE)" เสมอ — กฎรวม: ปีที่ได้ > 2400 = พ.ศ. → ลบ 543
  //   (กัน bug "ปี 612" = เอาปี พ.ศ. 2569 ไปคิดต่อ). era hint คุมเฉพาะปี 2 หลัก.
  let cfpEraHint = 'auto'; function cfpToISO(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'number' && isFinite(v) && v > 1000) {
      const dt = new Date(Math.round((v - 25569) * 86400 * 1000));
      if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
    }
    let s = String(v).trim();
    const era = cfpEraHint || 'auto';
    let d = null, mo = null, y = null;
    if (era === 'auto' && typeof window.parseDateFlexible === 'function') {
      try { const iso = window.parseDateFlexible(s); if (iso && /^\d{4}-\d{2}-\d{2}/.test(iso)) { y = +iso.slice(0, 4); mo = +iso.slice(5, 7); d = +iso.slice(8, 10); } } catch (e) {}
    }
    if (d == null) {
      const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
      if (m) {
        d = +m[1]; mo = +m[2]; y = +m[3];
        if (era === 'be') { if (y < 100) y += 2500; } else { if (y < 100) y += 2000; }
        if (d > 31 && y <= 31) { const t = d; d = y; y = t; }
        if (mo > 12 && d <= 12) { const t = d; d = mo; mo = t; }
      }
    }
    if (d == null || mo == null || y == null) return '';
    if (y > 2400) y -= 543;   // พ.ศ. → ค.ศ. (กฎรวมทุก era/ทุก path)
    return String(y).padStart(4, '0') + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }
  const cfpMonth = iso => (iso && iso.length >= 7) ? +iso.slice(5, 7) : 0;
  function cfpFmtB(v) { const n = Math.round(Math.abs(v || 0)); return (v < 0 ? '-' : '') + n.toLocaleString('en-US'); }
  function cfpFmtM(v) { return (v < 0 ? '-' : '') + (Math.abs(v || 0) / 1e6).toFixed(2) + 'M'; }
  function cfpFmtSigned(v) { return (v < 0 ? '-' : '+') + (Math.abs(v || 0) / 1e6).toFixed(2) + 'M'; }
  function cfpFmtPlain(v) { return Math.round(Math.abs(v || 0)).toLocaleString('en-US'); }
  function cfpThaiDate(iso) {
    if (!iso || iso.length < 10) return iso || '';
    let y = +iso.slice(0, 4); const m = +iso.slice(5, 7), d = +iso.slice(8, 10);
    if (y > 2400) y -= 543;   // กัน iso เก่าที่เก็บเป็น พ.ศ. (อัปก่อนแก้ bug) → แสดงเป็น ค.ศ.
    return d + ' ' + (CFP_MONTHS[m] || m) + ' ' + y;   // ปี ค.ศ. เต็ม (มาตรฐานทั้งแอป)
  }
  // แปลงเลขปี พ.ศ. (2401–2600) ในข้อความอิสระ (เช่น period label จากไฟล์) → ค.ศ. ให้ทั้งหน้าเป็น ค.ศ.
  function cfpCeText(s) { return String(s || '').replace(/\b(2[4-9]\d\d)\b/g, function (m) { var n = +m; return n > 2400 ? String(n - 543) : m; }); }

  function cfpActKey(activity, category) {
    const a = String(activity || ''); const c = String(category || '');
    if (/โอนเงินระหว่างบัญชี|โอนระหว่างบัญชี/.test(c)) return 'transfer';
    if (/ดำเนิน/.test(a)) return 'op';          // POG: "01.กิจกรรมดำเนินการ" · BIO: "ดำเนินงาน"
    if (/ลงทุน/.test(a)) return 'inv';
    if (/จัดหา/.test(a)) return 'fin';          // POG: "02.กิจกรรมจัดหาเงิน" · จัดหาเงิน/จัดหาทุน
    return 'other';
  }
  const CFP_ACT_NAME = { op: 'กิจกรรมดำเนินงาน', inv: 'กิจกรรมลงทุน', fin: 'กิจกรรมจัดหาเงิน', transfer: 'โอนระหว่างบัญชี', other: 'อื่นๆ' };
  const CFP_ACT_SHORT = { op: 'ดำเนินงาน', inv: 'ลงทุน', fin: 'จัดหาเงิน', transfer: 'โอน', other: 'อื่นๆ' };

  // ── chart of accounts: รหัส 5 หลัก → ชื่อกลุ่ม (ฝัง fallback จากชีต "ค่าใช้จ่าย" ของเตย) ──
  //   งบจะย่อยรายการตามรหัส: 10001.01/.02 → กลุ่ม "10001" (ชื่อจาก dict). ★ primary = อ่านชีต
  //   "ค่าใช้จ่าย" จากไฟล์ตอนอัปโหลด (แก้ในไฟล์แล้ว re-upload ได้) · ตัวนี้คือ fallback.
  const CFP_CODE_GROUPS = {
    '10000': 'เงินสดรับจากกิจกรรมดำเนินงาน', '10001': 'เงินสดรับจากการขายสินค้า', '10002': 'เงินสดรับอื่นๆ',
    '20000': 'เงินสดจ่ายจากกิจกรรมดำเนินงาน', '20001': 'เงินสดจ่ายค่าจ้างเหมาติดตั้ง-งานหลัก', '20002': 'เงินสดจ่ายค่าจ้างเหมาติดตั้ง-งานฐานราก',
    '20003': 'เงินสดจ่ายเกี่ยวกับการจ้างเหมา-งานเพิ่ม', '20004': 'เงินสดจ่าย-งานเพิ่มเติม เกี่ยวกับงานหลัก', '20005': 'เงินสดจ่าย-เกี่ยวกับงานสั่งซื้อถัง PNP',
    '20006': 'เงินสดจ่ายเกี่ยวกับคืนเงินประกันผลงาน', '20007': 'เงินสดจ่ายเกี่ยวกับค่าบริหารจัดการโครงการ', '20008': 'เงินสดจ่ายเกี่ยวกับการบริการหลังการขาย PM CM',
    '20009': 'เงินสดจ่ายเกี่ยวกับงานเพิ่มเติม เกี่ยวกับ บริการหลังการขาย', '20010': 'เงินสดจ่ายเกี่ยวกับค่าคอมมิชชั่น', '20011': 'เงินสดจ่ายเกี่ยวกับค่ารับรอง ที่พัก อาหาร และ เครื่องดื่ม',
    '20012': 'เงินสดจ่ายเกี่ยวกับค่าโฆษณา ประชาสัมพันธ์-เพื่อสังคม', '20013': 'เงินสดจ่ายเกี่ยวกับเงินสดย่อย', '20014': 'เงินสดจ่ายเกี่ยวกับเงินทดรองจ่าย',
    '20015': 'เงินสดจ่ายในการดำเนินงานการเดินทางและที่พัก', '20016': 'เงินสดจ่ายเกี่ยวกับบริจาคและการกุศล', '20017': 'เงินสดจ่ายเกี่ยวกับค่าทำบัญชี',
    '20018': 'เงินสดจ่ายเกี่ยวกับค่าตรวจสอบบัญชี', '20019': 'เงินสดจ่ายเกี่ยวกับค่าที่ปรึกษาต่างๆ', '20020': 'เงินสดจ่ายเกี่ยวกับค่าเช่า -สำนักงาน',
    '20021': 'เงินสดจ่ายเกี่ยวกับค่าน้ำและค่าไฟฟ้า', '20022': 'เงินสดจ่ายเกี่ยวกับค่าเช่า - อื่นๆ', '20023': 'เงินสดจ่าย-ค่าวัสดุและอุปกรณ์สำนักงาน',
    '20024': 'เงินสดจ่ายเกี่ยวกับค่าโทรศัพท์ อินเตอร์เน็ต IOT และ อื่นๆ', '20025': 'เงินสดจ่ายเกี่ยวกับค่าประกัน', '20026': 'เงินสดจ่าย พรบ.ยานพาหนะ',
    '20027': 'เงินสดจ่าย ค่าเบี้ยปรับ', '20028': 'เงินสดจ่ายค่าธรรมเนียมธนาคาร', '20029': 'เงินสดจ่าย ค่าธรรมเนียมอื่น เพื่อเข้าSET',
    '20030': 'เงินสดจ่าย ค่าธรรมเนียมอื่น', '20031': 'เงินสดจ่ายเกี่ยวกับค่าปรับปรุงอาคาร สถานที่', '20032': 'เงินสดจ่ายเกี่ยวกับงานซ่อมแซมต่างๆ',
    '20033': 'เงินสดจ่ายเกี่ยวกับภาษีอากร', '20034': 'เงินสดจ่ายเกี่ยวกับเงินเดือนและสวัสดิการพนักงาน', '20035': 'เงินสดจ่ายเกี่ยวกับประกันสังคมและกองทุน',
    '20036': 'เงินสดจ่ายเกี่ยวกับ POG DRINK', '29999': 'เงินสดจ่ายเบ็ดเตล็ด',
    '30000': 'เงินสดรับจากกิจกรรมลงทุน', '30100': 'เงินสดรับจากการขายสินทรัพย์', '30200': 'เงินสดรับเกี่ยวกับการค้ำประกัน', '30300': 'เงินสดรับจากการขายเงินลงทุน',
    '40000': 'เงินสดจ่ายจากกิจกรรมลงทุน', '40100': 'เงินสดจ่ายเกี่ยวกับการซื้อสินทรัพย์', '40200': 'เงินสดจ่ายเกี่ยวกับการค้ำประกัน', '40300': 'เงินสดจ่ายจากการซื้อเงินลงทุน', '40400': 'เงินสดจ่ายจากการทำงานวิจัย',
    '50000': 'เงินสดรับจากกิจกรรมจัดหาเงิน', '50100': 'เงินสดรับจากการกู้ยืม-กรรมการ', '50200': 'เงินสดรับเงินกู้ยืม-สถาบันการเงินที่ไม่ใช่ธนาคาร', '50300': 'เงินสดรับเงินกู้ยืม-ที่เป็นสถาบันการเงินประเภทธนาคาร', '50400': 'เงินสดรับดอกเบี้ย-จากธนาคาร',
    '60000': 'เงินสดจ่ายจากกิจกรรมจัดหาเงิน', '60100': 'เงินสดจ่ายจากการกู้ยืม-กรรมการ', '60200': 'เงินสดจ่ายเงินกู้ยืม-สถาบันการเงินที่ไม่ใช่ธนาคาร', '60300': 'เงินสดจ่ายเงินกู้ยืม-ที่เป็นสถาบันการเงินประเภทธนาคาร',
    '60400': 'เงินสดจ่ายดอกเบี้ย-สถาบันการเงินที่ไม่ใช่ธนาคาร', '60500': 'เงินสดจ่ายดอกเบี้ย-ที่เป็นสถาบันการเงินประเภทธนาคาร', '60600': 'เงินสดจ่ายเกี่ยวกับต้นทุนทางการเงิน -โอนสิทธิ', '60700': 'เงินสดจ่ายเพื่อจ่ายเงินปันผล',
  };
  const cfpCodePrefix = code => { const m = String(code || '').match(/^(\d{4,6})/); return m ? m[1] : ''; };
  // อ่านชีต "ค่าใช้จ่าย" (chart of accounts) → { '10001': 'ชื่อกลุ่ม', … } : code 4-6 หลัก (ไม่มีจุด) + ชื่อ (เซลล์แรกที่มีค่าถัดจากรหัส)
  function cfpParseCodeGroups(aoa) {
    const out = {};
    if (!aoa) return out;
    for (let i = 0; i < aoa.length; i++) {
      const row = aoa[i] || [];
      const code = String(row[0] == null ? '' : row[0]).trim();
      if (!/^\d{4,6}$/.test(code)) continue;       // กลุ่ม = รหัสไม่มีจุด
      let name = '';
      for (let j = 1; j < Math.min(row.length, 8); j++) { const v = String(row[j] == null ? '' : row[j]).trim(); if (v) { name = v; break; } }
      if (name) out[code] = name;
    }
    return out;
  }

  function cfpShort(s) {
    s = String(s || '').replace(/^เงินสดรับจากการขาย\s*-?\s*/, '').replace(/^เงินสดจ่ายเกี่ยวกับ\s*-?\s*/, '').replace(/^เงินสดรับ\s*-?\s*/, '').trim();
    return s.length > 28 ? s.slice(0, 28) + '…' : s;
  }
  // วิเคราะห์ "จุดเฝ้าระวัง" รายกิจกรรม (sev: red ด่วน / amber เฝ้าระวัง / blue ข้อมูล / green ปกติ)
  function cfpWatch(model, k) {
    const a = model.acts[k]; if (!a) return [];
    const cats = a.catList || [];
    const out = cats.filter(c => c.net < 0), inn = cats.filter(c => c.net > 0);
    const outTot = out.reduce((s, c) => s + Math.abs(c.net), 0), inTot = inn.reduce((s, c) => s + c.net, 0);
    const F = [], order = { red: 0, amber: 1, blue: 2, green: 3 };
    if (k === 'op') {
      if (a.net < 0) F.push({ sev: 'red', t: 'กระแสเงินสดดำเนินงานติดลบ ' + cfpFmtM(a.net) + ' — รายจ่ายมากกว่ารายรับจากการดำเนินงาน' });
      if (out.length) { const t = out[0], p = Math.round(Math.abs(t.net) / (outTot || 1) * 100); if (p >= 30) F.push({ sev: p >= 50 ? 'amber' : 'blue', t: 'รายจ่ายกระจุกที่ “' + cfpShort(t.name) + '” ' + p + '% (' + cfpFmtM(t.net) + ')' }); }
      if (inn.length && inTot > 0) { const t = inn[0], p = Math.round(t.net / inTot * 100); if (p >= 70) F.push({ sev: 'amber', t: 'รายได้พึ่ง “' + cfpShort(t.name) + '” ' + p + '% ของรายรับดำเนินงาน — กระจุกตัวสูง' }); }
    } else if (k === 'inv') {
      if (a.net < 0) F.push({ sev: 'blue', t: 'ลงทุนซื้อสินทรัพย์สุทธิ ' + cfpFmtM(a.net) });
      if (a.net > 0) F.push({ sev: 'amber', t: 'มีเงินสดจากการขาย/ลดสินทรัพย์ ' + cfpFmtM(a.net) });
      if (out.length) { const t = out[0]; F.push({ sev: 'blue', t: 'ส่วนใหญ่คือ “' + cfpShort(t.name) + '” (' + cfpFmtM(t.net) + ')' }); }
    } else if (k === 'fin') {
      const interest = cats.filter(c => /ดอกเบี้ย/.test(c.name)).reduce((s, c) => s + Math.abs(c.net), 0);
      const loansIn = inn.filter(c => /กู้/.test(c.name)).reduce((s, c) => s + c.net, 0);
      const director = cats.filter(c => /กรรมการ|ให้กู้ยืม/.test(c.name)).reduce((s, c) => s + Math.abs(c.net), 0);
      const repay = cats.filter(c => /ชำระคืน|คืนเงินกู้/.test(c.name)).reduce((s, c) => s + Math.abs(c.net), 0);
      if (interest > 0) F.push({ sev: (model.payroll && interest >= 0.5 * model.payroll) ? 'red' : 'amber', t: 'ดอกเบี้ยจ่าย ' + cfpFmtM(interest) + (model.payroll ? (' ≈ ' + Math.round(interest / model.payroll * 100) + '% ของเงินเดือนทั้งบริษัท') : '') });
      if (loansIn > 0 && model.acts.op.net < 0) F.push({ sev: 'red', t: 'พึ่งเงินกู้ประคองสภาพคล่อง — รับกู้ ' + cfpFmtM(loansIn) + ' ขณะดำเนินงานติดลบ' });
      else if (loansIn > 0) F.push({ sev: 'blue', t: 'รับเงินกู้เข้า ' + cfpFmtM(loansIn) + ' หนุนสภาพคล่อง' });
      if (director > 0) F.push({ sev: 'amber', t: 'เงินให้กรรมการกู้ยืม ' + cfpFmtM(director) });
      if (repay > 0) F.push({ sev: 'blue', t: 'ชำระคืนเงินกู้ ' + cfpFmtM(repay) });
    }
    if (!F.length) F.push({ sev: 'green', t: 'ไม่พบจุดเฝ้าระวังเด่นชัด' });
    F.sort((x, y) => order[x.sev] - order[y.sev]);
    return F.slice(0, 5);
  }
  const CFP_SEV = { red: { c: '#c0392b', bg: '#fdecea' }, amber: { c: '#8a6400', bg: '#fff7e0' }, blue: { c: '#1f6fb8', bg: '#eaf2ff' }, green: { c: '#15875a', bg: '#e6f7ef' } };

  function cfpAccountLabel(raw) {
    const s = String(raw || '');
    const m = s.match(/([SC])\/A#\s*([A-Za-z]*)\s*([\d-]+)\s*(.*)/);
    if (m) {
      const bank = (m[2] || '').toUpperCase();
      const name = (m[4] || '').trim();
      const tail = (m[3] || '').replace(/\D/g, '').slice(-4);
      return (bank || 'บัญชี') + (tail ? ' ···' + tail : '') + (name ? ' · ' + name : '');
    }
    return s.trim();
  }
  function cfpBankCode(acctLabel) { const m = String(acctLabel || '').match(/^([A-Za-z]{2,4})/); return m ? m[1].toUpperCase() : ''; }
  const BANK_PILL = { BBL: { bg: '#e0f0ff', fg: '#1f6fb8' }, SCB: { bg: '#efe6ff', fg: '#6a3fc0' }, KBANK: { bg: '#e8f7e9', fg: '#2e7d32' }, KTB: { bg: '#e0f2ff', fg: '#1565c0' }, KKP: { bg: '#fbeee0', fg: '#b8730b' }, BAY: { bg: '#fff0e6', fg: '#d98032' } };

  /* ---------- statement-line ↔ STM category matcher ---------- */
  function cfpStripCat(s) {
    return String(s || '')
      .replace(/^เงินสดรับจากการขาย\s*-?\s*/, '').replace(/^เงินสดรับ\s*-?\s*/, '')
      .replace(/^เงินสดจ่ายเกี่ยวกับ\s*-?\s*/, '').replace(/^รวม\s*/, '').replace(/^รายได้\s*/, '').replace(/^ค่า/, '')
      .replace(/[^0-9A-Za-zก-๙]/g, '');
  }
  function cfpLatin(s) { return (String(s || '').match(/[A-Za-z]{3,}/g) || []).map(x => x.toLowerCase()); }
  function cfpLCS(a, b) {
    if (!a || !b) return 0;
    const m = a.length, n = b.length; let best = 0, prev = new Array(n + 1).fill(0);
    for (let i = 1; i <= m; i++) { const cur = new Array(n + 1).fill(0);
      for (let j = 1; j <= n; j++) { if (a[i - 1] === b[j - 1]) { cur[j] = prev[j - 1] + 1; if (cur[j] > best) best = cur[j]; } } prev = cur; }
    return best;
  }
  function cfpStmtMatch(catName, leafLabel) {
    const a = cfpStripCat(catName), b = cfpStripCat(leafLabel);
    if (!a || !b) return false;
    const mn = Math.min(a.length, b.length);
    if (mn >= 5 && (a.indexOf(b) >= 0 || b.indexOf(a) >= 0)) return true;
    const la = cfpLatin(catName), lb = cfpLatin(leafLabel);
    if (la.length && la.some(t => lb.indexOf(t) >= 0)) return true;
    const lcs = cfpLCS(a, b);
    if (lcs >= 8 && lcs >= 0.7 * mn) return true;
    return false;
  }
  // หาหมวด (STM category objects) จากรายชื่อหมวด — ค้นทุกกิจกรรม (op/inv/fin)
  function cfpCatsByNames(model, names) {
    const res = []; if (!names || !names.length) return res;
    ['op', 'inv', 'fin'].forEach(k => { const a = model.acts[k]; if (a) a.catList.forEach(c => { if (names.indexOf(c.name) >= 0) res.push(c); }); });
    return res;
  }
  // ยึด "หมวด" เป็นหลัก: fallback เดาด้วยชื่อหมวดเมื่อยังไม่ได้จับคู่เอง (manual map ดูใน openStmt)
  function cfpFindStmtTxns(model, leafLabel, actKey, monthNum, dir, strict) {
    const act = model.acts[actKey]; if (!act) return { txns: [], matched: false, cats: [] };
    const sameDir = c => !dir || ((c.net >= 0 ? 1 : -1) === dir);
    const cats = leafLabel ? act.catList.filter(c => cfpStmtMatch(c.name, leafLabel) && sameDir(c)) : [];
    const matched = cats.length > 0;
    const src = matched ? cats : (strict ? [] : act.catList.filter(sameDir));
    let txns = []; src.forEach(c => { txns = txns.concat(c.txns); });
    if (monthNum) txns = txns.filter(t => t.month === monthNum);
    return { txns, matched, cats: cats.map(c => c.name) };
  }

  /* ---------- parse POG "DATA" sheet (รายการที่จัดหมวด/กิจกรรม/รับ-จ่ายแล้ว) ----------
   * header-driven (หาคอลัมน์จากชื่อหัว) → ทนทานต่อคอลัมน์เลื่อน. ชีต DATA คอลัมน์:
   *   BANK · ACCOUNT NO. · Department · Document No. · DD/MM/YYYY · Vender ·
   *   Description · Amount · รหัสค่าใช้จ่าย · Account Code · สูตร · ประเภทกิจกรรม ·
   *   รับ - จ่าย · เดือน.  Amount = ยอดเซ็น (วงเล็บ = จ่าย/ติดลบ) → flow โดยตรง;
   *   sum(Amount) = กระแสเงินสดสุทธิ (ตรวจแล้วตรงกับชีต REPORT). opening มาจาก
   *   ชีตเดือน (cfpOpeningFromAoa) ไม่ได้อยู่ในชีตนี้. */
  function cfpFindHeaderRow(aoa) {
    for (let i = 0; i < Math.min(aoa.length, 8); i++) {
      const row = (aoa[i] || []).map(x => String(x == null ? '' : x).trim());
      const has = re => row.some(c => re.test(c));
      if (has(/^BANK$/i) && has(/Amount/i) && (has(/ประเภทกิจกรรม/) || has(/Account\s*Code/i))) return i;
    }
    return -1;
  }
  function cfpDataColMap(headerRow) {
    const H = (headerRow || []).map(x => String(x == null ? '' : x).trim());
    const find = re => { for (let i = 0; i < H.length; i++) if (re.test(H[i])) return i; return -1; };
    return {
      bank: find(/^BANK$/i), acct: find(/ACCOUNT\s*NO/i), dept: find(/Department/i),
      doc: find(/Document\s*No/i), date: find(/DD\/MM|^DATE$|วันที่/i), vender: find(/Vender|Vendor/i),
      desc: find(/Description|รายละเอียด|คำอธิบาย/i), amt: find(/^Amount$/i),
      code: find(/รหัสค่าใช/), cat: find(/Account\s*Code/i), act: find(/ประเภทกิจกรรม/), dir: find(/รับ\s*-?\s*จ่าย/), month: find(/^เดือน$/),
    };
  }
  function cfpDataAccount(bank, acctNo) {
    const b = String(bank || '').trim().toUpperCase();
    const tail = String(acctNo || '').replace(/[^\d]/g, '').slice(-4);
    return (b || 'บัญชี') + (tail ? ' ···' + tail : '');
  }
  // ★ ชื่อยังคงเป็น cfpParseStm เพื่อให้ผู้เรียก (cfpBuildModel/onUpload) ไม่ต้องแก้;
  //   แต่ input = AOA ของชีต DATA แล้ว.
  function cfpParseStm(aoa) {
    const txns = [];
    const hIdx = cfpFindHeaderRow(aoa);
    if (hIdx < 0) return { txns, opening: 0, openingByAcct: {} };
    const C = cfpDataColMap(aoa[hIdx]);
    if (C.amt < 0 || C.date < 0) return { txns, opening: 0, openingByAcct: {} };
    const at = (row, i) => (i >= 0 ? row[i] : '');
    for (let i = hIdx + 1; i < aoa.length; i++) {
      const row = aoa[i] || [];
      const iso = cfpToISO(at(row, C.date));
      // flow = ยอดเซ็นจากคอลัมน์ Amount โดยตรง (วงเล็บ = จ่าย/ติดลบ) = source of truth
      //   ตรงกับชีต REPORT (เงินสดสุทธิ) เป๊ะ. ★ ไม่ override ด้วยคอลัมน์ "รับ - จ่าย"
      //   เพราะบางแถวป้ายทิศทางไม่ตรงเครื่องหมายยอด (เช่น credit memo ยอดบวกแต่ป้ายจ่าย) →
      //   ถ้า flip ตามป้าย ยอดรวมจะเพี้ยนจาก REPORT.
      const flow = cfpNum(at(row, C.amt));
      if (flow === 0) continue;        // ข้ามแถวสรุป/ว่าง (ยอด 0)
      const category = String(at(row, C.cat) || '').trim();
      const activity = String(at(row, C.act) || '').trim();
      const desc = String(at(row, C.desc) || '').trim();
      const vender = String(at(row, C.vender) || '').trim();
      const mMatch = String(at(row, C.month) || '').match(/(\d{1,2})/);
      const month = mMatch ? +mMatch[1] : cfpMonth(iso);
      txns.push({
        account: cfpDataAccount(at(row, C.bank), at(row, C.acct)),
        iso, month,
        docNo: String(at(row, C.doc) || '').trim(),
        note: desc || vender, vender,
        code: String(at(row, C.code) || '').trim(),   // รหัสค่าใช้จ่าย → ใช้เรียงลำดับงบให้ตรงไฟล์
        category: category || '(ไม่ระบุหมวด)', actKey: cfpActKey(activity, category),
        withdraw: flow < 0 ? -flow : 0, deposit: flow > 0 ? flow : 0, balance: 0, flow,
      });
    }
    return { txns, opening: 0, openingByAcct: {} };
  }
  // ยอดรายบัญชีของ "ชีตเดือนหนึ่ง" (ตาราง: BANK | ACCOUNT NO. | ต้นงวด | ปลายงวด | …)
  //   คืน [{name,last4,open,close}] — ★ อ่าน "ปลายงวด" จากไฟล์โดยตรง = ยอดคงเหลือจริง
  //   (ห้ามคำนวณปลายงวดจาก Σ flows เพราะบัญชีดำเนินงาน/เงินโอนทำให้ยอดสะสมเพี้ยนมหาศาล).
  //   key = cfpDataAccount(bank,acct) เดียวกับ txns.
  function cfpMonthBalances(aoa) {
    if (!aoa || !aoa.length) return [];
    let hIdx = -1, bankCol = -1, acctCol = -1, openCol = -1, closeCol = -1;
    for (let i = 0; i < Math.min(aoa.length, 40); i++) {
      const row = (aoa[i] || []).map(x => String(x == null ? '' : x).trim());
      const b = row.findIndex(c => /^BANK$/i.test(c));
      const o = row.findIndex(c => /ต้นงวด/.test(c));
      if (b >= 0 && o >= 0) { hIdx = i; bankCol = b; openCol = o; closeCol = row.findIndex(c => /ปลายงวด/.test(c)); acctCol = row.findIndex(c => /ACCOUNT\s*NO/i.test(c)); if (acctCol < 0) acctCol = b + 1; break; }
    }
    if (hIdx < 0 || openCol < 0) return [];
    const accts = [];
    for (let i = hIdx + 1; i < aoa.length; i++) {
      const row = aoa[i] || [];
      const acctRaw = String(row[acctCol] == null ? '' : row[acctCol]).trim();
      if (!acctRaw) { if (i - hIdx > 1) break; else continue; }   // ตารางจบเมื่อเลขบัญชีว่าง
      accts.push({ name: cfpDataAccount(row[bankCol], acctRaw), last4: String(acctRaw).replace(/[^\d]/g, '').slice(-4), open: cfpNum(row[openCol]), close: closeCol >= 0 ? cfpNum(row[closeCol]) : cfpNum(row[openCol]) });
    }
    return accts;
  }
  const CFP_MON_NUM = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
  // รวมชีตเดือนทุกเดือน → ยอดรายบัญชี: opening(ต้นงวดเดือนแรก) · ending(ปลายงวดเดือนล่าสุด) · byMonth Δ=ปลาย−ต้น ต่อเดือน
  function cfpBuildAcctBalances(aoaOf, MON) {
    const monthBals = [];
    for (let i = 0; i < MON.length; i++) {
      const mn = MON[i]; const a = aoaOf(mn); if (!a) continue;
      const accts = cfpMonthBalances(a); if (!accts.length) continue;
      const mNum = CFP_MON_NUM[String(mn).replace(/\.$/, '')];
      if (!mNum || monthBals.some(x => x.m === mNum)) continue;
      monthBals.push({ m: mNum, accts });
    }
    monthBals.sort((a, b) => a.m - b.m);
    const balMonths = monthBals.map(x => x.m);
    const agg = {};
    monthBals.forEach(mb => mb.accts.forEach(e => { if (!agg[e.name]) { agg[e.name] = { name: e.name, last4: e.last4, opening: null, ending: 0, byMonth: {}, byClose: {} }; balMonths.forEach(m => { agg[e.name].byMonth[m] = 0; }); } }));
    //   byClose[m] = ยอด "ปลายงวด" ของเดือน m (ยอดจริงจากไฟล์) → ใช้หยิบปลายงวดของเดือนสุดท้ายในงวดได้ตรงๆ
    //   (สำคัญเพราะชีตรายเดือนไม่ใช่ running balance ต่อเนื่อง — reconstruct จาก Δ ไม่แม่น)
    monthBals.forEach(mb => mb.accts.forEach(e => { const ag = agg[e.name]; if (ag.opening == null) ag.opening = e.open; ag.ending = e.close; if (e.last4) ag.last4 = e.last4; ag.byMonth[mb.m] = e.close - e.open; ag.byClose[mb.m] = e.close; }));
    const acctBalances = Object.keys(agg).map(n => { const a = agg[n]; return { name: a.name, last4: a.last4, opening: a.opening || 0, ending: a.ending, byMonth: a.byMonth, byClose: a.byClose }; });
    return { acctBalances, balMonths, opening: acctBalances.reduce((s, a) => s + a.opening, 0) };
  }

  /* ---------- parse summary statement ---------- */
  function cfpParseSummary(aoa) {
    const out = { net: null, opening: null, ending: null, periodLabel: '', monthLabels: [], rows: [], actNet: {} };
    let headerIdx = -1, nCols = 0;
    for (let i = 0; i < aoa.length; i++) {
      const row = aoa[i] || []; const c0 = String(row[0] || '').trim();
      if (/สำหรับงวด/.test(c0)) out.periodLabel = c0;
      if (c0 === 'รายการ') { headerIdx = i; nCols = row.length; out.monthLabels = row.slice(1, nCols - 1).map(x => String(x || '').trim()); break; }
    }
    if (headerIdx < 0) {
      const lastNum = row => { for (let k = row.length - 1; k >= 0; k--) { const n = cfpNum(row[k]); if (n !== 0) return n; } return null; };
      for (let i = 0; i < aoa.length; i++) { const row = aoa[i] || []; const l = String(row[0] || '');
        if (/เพิ่มขึ้น.*ลดลง.*สุทธิ/.test(l)) out.net = lastNum(row);
        if (/เงินสด.*ต้นงวด/.test(l)) out.opening = lastNum(row);
        if (/เงินสด.*ปลายงวด/.test(l)) out.ending = lastNum(row); }
      return out;
    }
    const nMonths = out.monthLabels.length; let curAct = null;
    for (let i = headerIdx + 1; i < aoa.length; i++) {
      const row = aoa[i] || []; const label = String(row[0] || '').trim(); if (!label) continue;
      const vals = []; let hasVal = false;
      for (let k = 1; k <= nMonths; k++) { const n = cfpNum(row[k]); vals.push(n); if (n !== 0) hasVal = true; }
      const total = cfpNum(row[nMonths + 1]); if (total !== 0) hasVal = true;
      let type = 'leaf', actKey = curAct;
      if (/^กระแสเงินสดจากกิจกรรม/.test(label)) { type = 'section'; actKey = /ดำเนินงาน/.test(label) ? 'op' : /ลงทุน/.test(label) ? 'inv' : /จัดหา/.test(label) ? 'fin' : null; curAct = actKey; }
      else if (/^กระแสเงินสดสุทธิจากกิจกรรม/.test(label)) { type = 'net'; const k = /ดำเนินงาน/.test(label) ? 'op' : /ลงทุน/.test(label) ? 'inv' : /จัดหา/.test(label) ? 'fin' : null; if (k) out.actNet[k] = total; }
      else if (/เพิ่มขึ้น.*ลดลง.*สุทธิ|สุทธิ.*เพิ่มขึ้น/.test(label)) { type = 'grand'; out.net = total; }
      else if (/เงินสด.*ต้นงวด/.test(label)) { type = 'grand'; out.opening = total; }
      else if (/เงินสด.*ปลายงวด/.test(label)) { type = 'grand'; out.ending = total; }
      else if (/^รวม/.test(label)) type = 'subtotal';
      else if (!hasVal) type = 'group';
      else type = 'leaf';
      out.rows.push({ label, vals, total, type, actKey });
    }
    return out;
  }

  /* ---------- build model ---------- */
  function cfpBuildModel(stm, catGroups, codeGroups) {
    const txns = stm.txns || [];
    const monthsSet = {};
    txns.forEach(t => { if (t.month && t.actKey !== 'transfer' && t.actKey !== 'other') monthsSet[t.month] = true; });
    const months = Object.keys(monthsSet).map(Number).sort((a, b) => a - b);
    const mkAct = key => ({ key, name: CFP_ACT_NAME[key], net: 0, byMonth: {}, cats: {} });
    const acts = { op: mkAct('op'), inv: mkAct('inv'), fin: mkAct('fin') };
    months.forEach(m => { ['op', 'inv', 'fin'].forEach(k => { acts[k].byMonth[m] = 0; }); });
    let transferNet = 0, otherNet = 0;
    txns.forEach(t => {
      if (t.actKey === 'transfer') { transferNet += t.flow; return; }
      if (t.actKey === 'other') { otherNet += t.flow; return; }
      const a = acts[t.actKey]; if (!a) return;
      a.net += t.flow; a.byMonth[t.month] = (a.byMonth[t.month] || 0) + t.flow;
      if (!a.cats[t.category]) a.cats[t.category] = { name: t.category, net: 0, count: 0, txns: [], code: t.code || '' };
      const cat = a.cats[t.category]; cat.net += t.flow; cat.count++; cat.txns.push(t);
      if (t.code && (!cat.code || t.code < cat.code)) cat.code = t.code;   // รหัสน้อยสุดของหมวด → เรียงงบ
    });
    ['op', 'inv', 'fin'].forEach(k => {
      acts[k].catList = Object.keys(acts[k].cats).map(n => acts[k].cats[n]).sort((x, y) => Math.abs(y.net) - Math.abs(x.net));
      acts[k].catList.forEach(c => c.txns.sort((x, y) => Math.abs(y.flow) - Math.abs(x.flow)));
    });
    const opening = stm.opening || 0;
    const net = acts.op.net + acts.inv.net + acts.fin.net;
    const ending = opening + net;
    let run = opening;
    const monthly = months.map(m => {
      const o = acts.op.byMonth[m] || 0, iv = acts.inv.byMonth[m] || 0, f = acts.fin.byMonth[m] || 0;
      const mnet = o + iv + f; run += mnet;
      return { m, label: CFP_MONTHS[m] || ('เดือน ' + m), op: o, inv: iv, fin: f, net: mnet, end: run };
    });
    let interest = 0, payroll = 0, inflowTotal = 0; const inflowByCat = {};
    txns.forEach(t => {
      if (t.actKey === 'transfer' || t.actKey === 'other') return;
      if (/ดอกเบี้ย/.test(t.category)) interest += Math.abs(t.flow);
      if (/เงินเดือน/.test(t.category)) payroll += Math.abs(t.flow);
      if (t.flow > 0) { inflowTotal += t.flow; inflowByCat[t.category] = (inflowByCat[t.category] || 0) + t.flow; }
    });
    let topInflow = { name: '', amt: 0 };
    Object.keys(inflowByCat).forEach(n => { if (inflowByCat[n] > topInflow.amt) topInflow = { name: n, amt: inflowByCat[n] }; });
    const accounts = {}; txns.forEach(t => { accounts[t.account] = true; });

    // ── สังเคราะห์ "งบกระแสเงินสด" (stmt rows) จากรายการ — POG ไม่ต้องอัปไฟล์งบแยกแบบ BIO ──
    //   leaf ผูก catName → กดแถวเปิดรายการของหมวดนั้นตรงๆ (ไม่ต้อง fuzzy-match/จัดหมวด).
    const ACT_STMT_NAME = { op: 'ดำเนินงาน', inv: 'ลงทุน', fin: 'จัดหาเงิน' };
    const monthFlow = (list, m) => list.reduce((s, t) => s + (t.month === m ? t.flow : 0), 0);
    // ★ โครงงบ 3 ชั้น: กิจกรรม → เงินสดรับ/เงินสดจ่าย (+ รวม) → รายการย่อย (เรียงตามรหัสค่าใช้จ่าย)
    //   รับ/จ่าย แยกด้วยเลขหน้าของรหัส: op 1xxxx=รับ/2xxxx=จ่าย · inv 3/4 · fin 5/6 (คี่=รับ คู่=จ่าย)
    //   เรียงตามรหัส = ลำดับเดียวกับไฟล์งบของเตย (ไม่ใช้ catList ที่เรียงตามยอด — นั่นไว้แท็บสรุปกิจกรรม)
    const codeCmp = (x, y) => String(x || '~').localeCompare(String(y || '~'), 'en', { numeric: true });
    const catSide = c => { const d = String(c.code || '').replace(/\D/g, '')[0]; if (d) return '135'.indexOf(d) >= 0 ? 'in' : 'out'; return c.net >= 0 ? 'in' : 'out'; };
    const minCode = cats => cats.map(c => c.code || '~').sort(codeCmp)[0];
    const codeDict = Object.assign({}, CFP_CODE_GROUPS, (codeGroups && typeof codeGroups === 'object') ? codeGroups : {});
    const groups = Array.isArray(catGroups) ? catGroups : [];
    const useGroups = groups.length > 0;
    const sideCodeOf = (k, sd) => String(k === 'op' ? (sd === 'in' ? 1 : 2) : k === 'inv' ? (sd === 'in' ? 3 : 4) : (sd === 'in' ? 5 : 6)) + '0000';
    const stmt = [];
    ['op', 'inv', 'fin'].forEach(k => {
      const a = acts[k]; if (!a.catList.length) return;
      const nm = ACT_STMT_NAME[k];
      const byName = {}; a.catList.forEach(c => { byName[c.name] = c; });
      stmt.push({ label: 'กระแสเงินสดจากกิจกรรม' + nm, code: '', vals: [], total: 0, type: 'section', actKey: k, indent: 6 });
      // รวม "items" (กลุ่มจัดเอง หรือ หมวดเดี่ยว) ของกิจกรรมนี้ก่อน แล้วแยกฝั่ง รับ/จ่าย
      let items;
      if (useGroups) {
        const assigned = {};
        items = groups.filter(g => g.actKey === k).map(g => {
          const cats = (g.cats || []).map(n => byName[n]).filter(Boolean);
          cats.forEach(c => { assigned[c.name] = true; });
          return cats.length ? { label: g.name || '(ไม่ตั้งชื่อ)', cats } : null;
        }).filter(Boolean);
        const rest = a.catList.filter(c => !assigned[c.name]);
        ['in', 'out'].forEach(sd => { const rc = rest.filter(c => catSide(c) === sd); if (rc.length) items.push({ label: 'อื่นๆ', cats: rc, side: sd }); });
      } else {
        items = a.catList.map(c => ({ label: c.name, cats: [c] }));
      }
      items.forEach(it => { if (!it.side) { const inN = it.cats.filter(c => catSide(c) === 'in').length; it.side = inN * 2 >= it.cats.length ? 'in' : 'out'; } it.code = minCode(it.cats); });
      // ฝั่งรับก่อน แล้วฝั่งจ่าย — แต่ละฝั่ง: หัว → [กลุ่มรหัส 5 หลัก → รายการย่อย] → รวม
      [['in', 'รับ'], ['out', 'จ่าย']].forEach(([sd, lab]) => {
        const si = items.filter(it => it.side === sd).sort((x, y) => codeCmp(x.code, y.code));
        if (!si.length) return;
        stmt.push({ label: 'เงินสด' + lab + 'จากกิจกรรม' + nm, code: sideCodeOf(k, sd), vals: [], total: 0, type: 'group', actKey: k, indent: 22, side: sd });
        let subTx = [];
        const emitLeaf = (it, lvl, pre) => {
          let tx = []; it.cats.forEach(c => { tx = tx.concat(c.txns); }); subTx = subTx.concat(tx);
          stmt.push({ label: it.label, code: it.code, vals: months.map(m => monthFlow(tx, m)), total: it.cats.reduce((s, c) => s + c.net, 0), type: 'leaf', actKey: k, catNames: it.cats.map(c => c.name), indent: lvl, prefix: pre, side: sd });
        };
        if (useGroups) {
          si.forEach(it => emitLeaf(it, 34, null));   // กลุ่มจัดเอง = leaf ตรงๆ ใต้รับ/จ่าย
        } else {
          // จัดกลุ่มรายการย่อยตามรหัส 5 หลัก: codegroup (ชื่อจาก chart of accounts) → leaf .01/.02/…
          const byPre = {}; si.forEach(it => { const p = cfpCodePrefix(it.code) || '~'; (byPre[p] = byPre[p] || []).push(it); });
          Object.keys(byPre).sort(codeCmp).forEach(p => {
            const gi = byPre[p]; let gtx = []; gi.forEach(it => it.cats.forEach(c => { gtx = gtx.concat(c.txns); }));
            stmt.push({ label: (codeDict[p] || ('รหัส ' + p)), code: p, vals: months.map(m => monthFlow(gtx, m)), total: gtx.reduce((s, t) => s + t.flow, 0), type: 'codegroup', actKey: k, catNames: gi.reduce((acc, it) => acc.concat(it.cats.map(c => c.name)), []), prefix: p, indent: 34, side: sd });
            gi.forEach(it => emitLeaf(it, 48, p));
          });
        }
        stmt.push({ label: 'รวมเงินสด' + lab + 'จากกิจกรรม' + nm, code: '', vals: months.map(m => monthFlow(subTx, m)), total: subTx.reduce((s, t) => s + t.flow, 0), type: 'subtotal', actKey: k, catNames: si.reduce((acc, it) => acc.concat(it.cats.map(c => c.name)), []), indent: 22, side: sd });
      });
      stmt.push({ label: 'เงินสดสุทธิจากกิจกรรม' + nm, code: '', vals: months.map(m => a.byMonth[m] || 0), total: a.net, type: 'net', actKey: k, indent: 22 });
    });
    if (months.length) {
      const mNet = monthly.map(d => d.net);
      const mOpen = []; let acc = opening; monthly.forEach(d => { mOpen.push(acc); acc += d.net; });
      const mEnd = mOpen.map((v, i) => v + monthly[i].net);
      stmt.push({ label: 'เงินสดสุทธิเพิ่มขึ้น (ลดลง)', code: '', vals: mNet, total: net, type: 'grand', actKey: null, indent: 22 });
      stmt.push({ label: 'เงินสดต้นงวด', code: '', vals: mOpen, total: opening, type: 'grand', actKey: null, indent: 22 });
      stmt.push({ label: 'เงินสดปลายงวด', code: '', vals: mEnd, total: ending, type: 'grand', actKey: null, indent: 22 });
    }
    const yr = (txns.find(t => t.iso) || {}).iso; const year = yr ? yr.slice(0, 4) : '';

    // ── ยอดรายบัญชี (per-account) = ยอดจริงจากไฟล์ (stm.acctBalances): ต้นงวด·ปลายงวด·Δรายเดือน
    //    ★ อ่านปลายงวดจากไฟล์ตรงๆ (ไม่คำนวณจาก flow — บัญชีดำเนินงาน/เงินโอนทำให้ยอดสะสมเพี้ยน).
    //    ★★ ไฟล์อาจมีชีตยอดเดือน "นอกงวด" ปนมา (เช่น มิ.ย.–ธ.ค. ที่เป็นข้อมูลคนละงวด/ปีก่อน) ทั้งที่
    //    รายการจริง (DATA/txns) มีถึงแค่เดือนล่าสุด → จำกัดเฉพาะเดือน ≤ เดือนสุดท้ายที่มี txns, และ
    //    ปลายงวด = ต้นงวด + Σ Δ เฉพาะเดือนในงวด (ไม่ใช่ ending ถึง ธ.ค. ที่ parser เก็บไว้).
    //    ต้องอัปไฟล์ใหม่ 1 ครั้งให้ stm มี acctBalances; ไม่มี = การ์ดโชว์ป้ายให้อัปใหม่. ──
    const last4of = name => (String(name).match(/(\d{3,4})\s*$/) || [])[1] || '';
    const txnMonthMax = txns.reduce((mx, t) => (t.month && t.month > mx) ? t.month : mx, 0);
    const balMonthsRaw = Array.isArray(stm.balMonths) ? stm.balMonths.slice().sort((a, b) => a - b) : [];
    const monthsAll = txnMonthMax > 0 ? balMonthsRaw.filter(m => m <= txnMonthMax) : balMonthsRaw;
    const fileAccts = Array.isArray(stm.acctBalances) ? stm.acctBalances : [];
    const accountInfo = fileAccts.map(a => {
      const opening = cfpNum(a.opening), bc = a.byClose, bm = a.byMonth || {}, out = {};
      let ending;
      if (bc && typeof bc === 'object') {
        // ★ มี byClose (ยอดปลายงวดรายเดือน) → Δ แบบ running (close−prevClose) ต่อเนื่อง, ปลายงวด = close เดือนสุดท้ายในงวด
        //   foots: opening + Σ Δ = close เดือนสุดท้าย; ตัดเดือนนอกงวดออกอัตโนมัติ (monthsAll)
        let prev = opening;
        monthsAll.forEach(m => { const c = (bc[m] != null ? cfpNum(bc[m]) : prev); out[m] = c - prev; prev = c; });
        ending = prev;
      } else {
        // ข้อมูลเก่า (ไม่มี byClose) — Δ within-month + ปลายงวดประมาณจาก opening+ΣΔ (อัปไฟล์ใหม่เพื่อให้แม่น)
        monthsAll.forEach(m => { out[m] = cfpNum(bm[m]); });
        ending = (monthsAll.length < balMonthsRaw.length) ? monthsAll.reduce((s, m) => s + cfpNum(bm[m]), opening) : cfpNum(a.ending);
      }
      return { name: a.name, last4: a.last4 || last4of(a.name), opening: opening, byMonth: out, ending: ending };
    }).sort((a, b) => b.ending - a.ending);
    const hasAcctBalances = accountInfo.length > 0;

    return {
      months, monthly, acts, opening, ending, net, transferNet, otherNet,
      accountInfo, monthsAll, hasAcctBalances,
      allTxns: txns, txnCount: txns.filter(t => t.actKey !== 'transfer' && t.actKey !== 'other').length,
      accounts: Object.keys(accounts), interest, payroll, inflowTotal, topInflow,
      summary: null, stmt: stmt.length ? stmt : null,
      monthLabels: months.map(m => CFP_MONTHS[m] || ('เดือน ' + m)),
      periodLabel: months.length ? (CFP_MONTHS[months[0]] + '–' + CFP_MONTHS[months[months.length - 1]] + (year ? ' ' + year : '')) : '',
    };
  }

  /* ---------- shared bits ---------- */
  function CfpTag({ k }) { return <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: ACT_TAGBG[k] || C.soft, color: ACT_TAGFG[k] || C.mut, whiteSpace: 'nowrap' }}>{CFP_ACT_SHORT[k] || k}</span>; }
  function CfpBankPill({ acct }) { const code = cfpBankCode(acct); const p = BANK_PILL[code] || { bg: C.soft, fg: C.primaryD }; return <span title={acct} style={{ fontWeight: 700, fontSize: 11, padding: '2px 8px', borderRadius: 6, background: p.bg, color: p.fg, whiteSpace: 'nowrap' }}>{code || 'บัญชี'}</span>; }
  function cfpTxnRows(txns) {
    return txns.map((t, i) => (
      <tr key={i}>
        <td style={{ padding: '6px 8px', color: C.mut, borderBottom: '1px solid ' + C.line, whiteSpace: 'nowrap' }}>{cfpThaiDate(t.iso)}</td>
        <td style={{ padding: '6px 8px', color: C.ink, borderBottom: '1px solid ' + C.line, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.note}>{t.note || t.category}</td>
        <td style={{ padding: '6px 8px', borderBottom: '1px solid ' + C.line }}><CfpBankPill acct={t.account} /></td>
        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: t.flow < 0 ? C.neg : C.pos, borderBottom: '1px solid ' + C.line, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{cfpFmtB(t.flow)}</td>
      </tr>
    ));
  }
  function CfpTxnTable({ txns }) {
    const totIn = txns.filter(t => t.flow > 0).reduce((s, t) => s + t.flow, 0);
    const totOut = txns.filter(t => t.flow < 0).reduce((s, t) => s + Math.abs(t.flow), 0);
    return (
      <div>
        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: C.mut, marginBottom: 6 }}>
          <span>รับ <b style={{ color: C.pos }}>{cfpFmtB(totIn)}</b></span>
          <span>จ่าย <b style={{ color: C.neg }}>{cfpFmtB(totOut)}</b></span>
          <span>สุทธิ <b style={{ color: (totIn - totOut) < 0 ? C.neg : C.pos }}>{cfpFmtB(totIn - totOut)}</b></span>
        </div>
        <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto', border: '1px solid ' + C.line, borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ color: C.mut, textAlign: 'left', fontSize: 12 }}>
              <th style={{ padding: '7px 8px', fontWeight: 700, position: 'sticky', top: 0, background: '#f6f9fe', width: 96 }}>วันที่</th>
              <th style={{ padding: '7px 8px', fontWeight: 700, position: 'sticky', top: 0, background: '#f6f9fe' }}>รายการ</th>
              <th style={{ padding: '7px 8px', fontWeight: 700, position: 'sticky', top: 0, background: '#f6f9fe', width: 70 }}>บัญชี</th>
              <th style={{ padding: '7px 8px', fontWeight: 700, position: 'sticky', top: 0, background: '#f6f9fe', width: 110, textAlign: 'right' }}>จำนวน</th>
            </tr></thead>
            <tbody>{cfpTxnRows(txns)}</tbody>
          </table>
        </div>
      </div>
    );
  }

  /* ---------- drill modal ---------- */
  function CfpModal({ title, subtitle, txns, breakdown, onClose }) {
    const hasBd = Array.isArray(breakdown) && breakdown.length > 0;
    const [sel, setSel] = useState(null);   // null=สรุปหมวด · -1=ทั้งหมด · >=0=หมวดที่เลือก
    useEffect(() => { const h = e => { if (e.key === 'Escape') { if (hasBd && sel !== null) setSel(null); else onClose(); } }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [hasBd, sel]);
    const allTxns = useMemo(() => { if (!hasBd) return []; let a = []; breakdown.forEach(b => { a = a.concat(b.txns); }); return a.slice().sort((x, y) => x.iso < y.iso ? 1 : -1); }, [breakdown, hasBd]);
    const cur = !hasBd ? null : (sel === -1 ? { name: title + ' · ทุกหมวด', txns: allTxns } : (sel >= 0 ? breakdown[sel] : null));
    const showList = hasBd && sel === null;
    const maxAbs = hasBd ? Math.max.apply(null, breakdown.map(b => Math.abs(b.net)).concat([1])) : 1;
    const tableTxns = cur ? cur.txns : (hasBd ? [] : (txns || []));
    const curNet = cur ? cur.txns.reduce((s, t) => s + t.flow, 0) : 0;
    return (
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,35,58,.42)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: 20 }}>
        <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 20, maxWidth: 900, width: '100%', maxHeight: '86vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 30px 80px rgba(20,35,58,.35)' }}>
          <div style={{ padding: '16px 22px', borderBottom: '1px solid ' + C.line, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              {cur && <button onClick={() => setSel(null)} title="กลับไปสรุปหมวด" style={{ cursor: 'pointer', border: '1px solid ' + C.line, background: '#fff', color: C.primaryD, borderRadius: 9, padding: '5px 10px', fontSize: 13, fontWeight: 700, flexShrink: 0, whiteSpace: 'nowrap' }}>← กลับ</button>}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cur ? cur.name : title}</div>
                <div style={{ fontSize: 12, color: C.mut, marginTop: 2 }}>{cur ? (cur.txns.length + ' รายการ · สุทธิ ' + cfpFmtB(curNet)) : (subtitle || '')}</div>
              </div>
            </div>
            <button onClick={onClose} style={{ cursor: 'pointer', border: 0, background: C.soft, width: 34, height: 34, borderRadius: 10, fontSize: 18, color: C.mut, flexShrink: 0 }}>×</button>
          </div>
          <div style={{ padding: '12px 22px 22px', overflow: 'auto' }}>
            {showList ? (
              <div>
                <button onClick={() => setSel(-1)} style={{ cursor: 'pointer', width: '100%', textAlign: 'left', border: '1px dashed ' + C.line, background: C.soft, color: C.primaryD, borderRadius: 10, padding: '9px 12px', fontSize: 13, fontWeight: 700, marginBottom: 10 }}>📋 ดูรายการทั้งหมดรวมกัน ({allTxns.length})</button>
                {breakdown.map((b, i) => (
                  <div key={i} onClick={() => setSel(i)} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) auto minmax(56px,1fr) auto 14px', gap: 10, alignItems: 'center', padding: '9px 8px', borderBottom: '1px solid ' + C.line, cursor: 'pointer' }}>
                    <span style={{ fontSize: 13, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={b.name}>{b.name}</span>
                    <span style={{ fontSize: 11, color: C.faint, whiteSpace: 'nowrap' }}>{b.count} รายการ</span>
                    <CfpBar amt={b.net} max={maxAbs} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: b.net < 0 ? C.neg : C.pos, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{cfpFmtB(b.net)}</span>
                    <span style={{ color: C.faint, fontSize: 14 }}>›</span>
                  </div>
                ))}
              </div>
            ) : (
              tableTxns.length ? <CfpTxnTable txns={tableTxns} /> : <div style={{ fontSize: 13, color: C.faint, padding: '10px 0' }}>ไม่พบรายการ</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ---------- Statement grouping editor (รวมหมวดย่อยเป็นกลุ่มงบ) ----------
   * POG: งบสังเคราะห์จาก 130 หมวดย่อย → ปุ่มนี้ให้ตั้ง "กลุ่มนำเสนอ" เอง แล้วโยน
   * หมวดเข้ากลุ่ม → งบแสดงเป็นกลุ่ม (หมวดที่ไม่จัด = "อื่นๆ"). เก็บใน stored.catGroups
   * (sync Supabase ทั้งทีม). โครงสร้าง: [{ id, name, actKey, cats:[catName,…] }]. */
  function CfpGroupModal({ model, groups: groupsIn, onClose, onSave }) {
    const ACTS = [['op', 'ดำเนินงาน'], ['inv', 'ลงทุน'], ['fin', 'จัดหาเงิน']];
    const [groups, setGroups] = useState(() => (groupsIn || []).map(g => ({ id: g.id, name: g.name, actKey: g.actKey, cats: (g.cats || []).slice() })));
    const [q, setQ] = useState('');
    useEffect(() => { const h = e => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);
    const nid = () => 'g' + Math.random().toString(36).slice(2, 9);
    const addGroup = act => { const name = (window.prompt('ชื่อกลุ่มใหม่ (' + ({ op: 'ดำเนินงาน', inv: 'ลงทุน', fin: 'จัดหาเงิน' }[act]) + ')') || '').trim(); if (!name) return; setGroups(gs => gs.concat([{ id: nid(), name: name, actKey: act, cats: [] }])); };
    const renameGroup = id => { const g = groups.find(x => x.id === id); const name = (window.prompt('เปลี่ยนชื่อกลุ่ม', g ? g.name : '') || '').trim(); if (!name) return; setGroups(gs => gs.map(x => x.id === id ? Object.assign({}, x, { name: name }) : x)); };
    const delGroup = id => setGroups(gs => gs.filter(x => x.id !== id));
    const assign = (catName, act, groupId) => setGroups(gs => gs.map(g => g.actKey !== act ? g : Object.assign({}, g, { cats: g.id === groupId ? (g.cats.indexOf(catName) >= 0 ? g.cats : g.cats.concat([catName])) : g.cats.filter(c => c !== catName) })));
    const groupOf = (catName, act) => { const g = groups.find(g => g.actKey === act && g.cats.indexOf(catName) >= 0); return g ? g.id : ''; };
    const grpTotal = g => { const a = model.acts[g.actKey]; if (!a) return 0; const m = {}; a.catList.forEach(c => { m[c.name] = c.net; }); return (g.cats || []).reduce((s, n) => s + (m[n] || 0), 0); };
    const selSty = { padding: '5px 8px', border: '1px solid ' + C.line, borderRadius: 8, fontSize: 12, fontFamily: 'inherit', background: '#fff', color: C.ink, cursor: 'pointer', maxWidth: 210 };
    return (
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,35,58,.42)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1300, padding: 20 }}>
        <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 20, maxWidth: 1000, width: '100%', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 30px 80px rgba(20,35,58,.35)' }}>
          <div style={{ padding: '16px 22px', borderBottom: '1px solid ' + C.line, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>⚙ จัดหมวด — รวมหมวดย่อยเป็นกลุ่มงบ</div>
              <div style={{ fontSize: 12, color: C.mut, marginTop: 2 }}>ตั้งกลุ่มนำเสนอ แล้วเลือกกลุ่มให้แต่ละหมวด · งบจะแสดงเป็นกลุ่ม (หมวดที่ไม่จัด = “อื่นๆ”) · ตั้งครั้งเดียว แชร์ทั้งทีม</div>
            </div>
            <button onClick={onClose} style={{ cursor: 'pointer', border: 0, background: C.soft, width: 34, height: 34, borderRadius: 10, fontSize: 18, color: C.mut, flexShrink: 0 }}>×</button>
          </div>
          <div style={{ padding: '10px 22px', borderBottom: '1px solid ' + C.line }}>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาหมวด…" style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', border: '1px solid ' + C.line, borderRadius: 10, fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
          </div>
          <div style={{ padding: '8px 22px 16px', overflow: 'auto' }}>
            {ACTS.map(([k, name]) => {
              const a = model.acts[k]; if (!a || !a.catList.length) return null;
              const gs = groups.filter(g => g.actKey === k);
              const cats = a.catList.filter(c => !q || c.name.toLowerCase().indexOf(q.toLowerCase()) >= 0);
              return (
                <div key={k} style={{ marginBottom: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: ACT_COLOR[k] }}>● {CFP_ACT_NAME[k]} <span style={{ color: C.faint, fontWeight: 500 }}>({a.catList.length} หมวด)</span></div>
                    <button onClick={() => addGroup(k)} style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, border: '1px dashed ' + C.primary, background: '#fff', color: C.primary, borderRadius: 8, padding: '4px 10px' }}>➕ เพิ่มกลุ่ม</button>
                  </div>
                  {gs.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                      {gs.map(g => (
                        <span key={g.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '4px 8px', borderRadius: 8, background: C.soft, border: '1px solid ' + C.line, color: C.ink }}>
                          <b>{g.name}</b> <span style={{ color: C.faint }}>{g.cats.length} · {cfpFmtPlain(grpTotal(g))}</span>
                          <span onClick={() => renameGroup(g.id)} title="เปลี่ยนชื่อ" style={{ cursor: 'pointer' }}>✏️</span>
                          <span onClick={() => delGroup(g.id)} title="ลบกลุ่ม" style={{ cursor: 'pointer' }}>🗑</span>
                        </span>
                      ))}
                    </div>
                  )}
                  <div style={{ border: '1px solid ' + C.line, borderRadius: 10, overflow: 'hidden' }}>
                    {cats.map((c, ci) => (
                      <div key={ci} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderTop: ci ? '1px solid ' + C.line : 0 }}>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.name}>{c.name} <span style={{ color: C.faint }}>({c.count})</span></span>
                        <span style={{ fontSize: 12, color: c.net < 0 ? C.neg : C.pos, fontWeight: 700, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{cfpFmtPlain(c.net)}</span>
                        <select value={groupOf(c.name, k)} onChange={e => assign(c.name, k, e.target.value)} style={selSty}>
                          <option value="">— ไม่จัด (อื่นๆ) —</option>
                          {gs.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </select>
                      </div>
                    ))}
                    {!cats.length && <div style={{ fontSize: 12, color: C.faint, padding: '10px' }}>ไม่พบหมวด</div>}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ padding: '12px 22px', borderTop: '1px solid ' + C.line, display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
            <button onClick={() => setGroups([])} style={{ cursor: 'pointer', border: '1px solid ' + C.line, background: '#fff', color: C.mut, borderRadius: 11, padding: '9px 14px', fontSize: 13 }}>ล้างทั้งหมด</button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onClose} style={{ cursor: 'pointer', border: '1px solid ' + C.line, background: '#fff', color: C.mut, borderRadius: 11, padding: '9px 16px', fontSize: 14 }}>ยกเลิก</button>
              <button onClick={() => onSave(groups)} style={{ cursor: 'pointer', border: 0, background: C.primary, color: '#fff', borderRadius: 11, padding: '9px 18px', fontSize: 14, fontWeight: 700, boxShadow: C.shadow }}>บันทึก</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ---------- KPI cards ---------- */
  function CfpKpiHero({ label, value, sub, color }) {
    return (
      <div className="cfp-card" style={{ background: C.card, backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,.6)', borderRadius: 18, padding: '16px 20px', boxShadow: C.shadow }}>
        <div style={{ fontSize: 13, color: C.mut, fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 26, fontWeight: 800, margin: '8px 0 4px', color: color || C.ink, letterSpacing: '-.5px' }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: C.mut }}>{sub}</div>}
      </div>
    );
  }
  function CfpKpiAct({ k, value, sub, onClick }) {
    const col = ACT_COLOR[k];
    return (
      <div onClick={onClick} className="cfp-card" style={{ background: C.card, backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,.6)', borderRadius: 18, padding: '16px 20px', boxShadow: C.shadow, cursor: 'pointer', position: 'relative', overflow: 'hidden' }}>
        <div style={{ height: 5, margin: '-16px -20px 12px', background: col }} />
        <div style={{ fontSize: 13, color: C.mut, fontWeight: 600 }}>{CFP_ACT_NAME[k]} <span style={{ color: C.faint, fontSize: 11 }}>กดดู ›</span></div>
        <div style={{ fontSize: 22, fontWeight: 800, margin: '7px 0 2px', color: value < 0 ? C.neg : C.pos, letterSpacing: '-.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cfpFmtM(value)}</div>
        {sub && <div style={{ fontSize: 11, color: C.mut }}>{sub}</div>}
      </div>
    );
  }

  /* ---------- "เงินสดนี้ใช้ได้จริงเท่าไร" — แยกตามบัญชี (5 ประเภท) + เพิ่ม-ลดรายเดือนรายบัญชี ----------
   *  จัดประเภทแต่ละบัญชี (สามารถใช้ได้/ค้ำประกัน/นักลงทุน/บัญชีร่วม/OD) → เก็บใน stored.acctTypes
   *  {accountName:typeKey} (เก็บเฉพาะที่ต่างจากค่าเริ่มต้น CFP_ACCT_TYPE_DEF). "ใช้ได้จริง"=usable เท่านั้น.
   *  ยอดรายบัญชี: ต้นงวด·ปลายงวด·Δรายเดือน = ยอดจริงจากไฟล์ (stm.acctBalances; ปลายงวดอ่านตรงจากคอลัมน์
   *  "ปลายงวด" ของชีตเดือน — ไม่คำนวณจาก flow เพราะบัญชีดำเนินงาน/เงินโอนทำให้ยอดเพี้ยน).
   *  sync ส่วนกลางผ่าน persist. การ์ดย่อ → กดยอด/ชิปประเภท → modal ที่มา (รายบัญชี+รายเดือน). viewer อ่านอย่างเดียว.
   *  ★ persist ไม่ merge ฟิลด์เก่าเอง → saveGroups/onUpload ต้องส่ง acctTypes มาด้วยทุกครั้ง.
   *  ★ ต้องอัปไฟล์ใหม่ 1 ครั้งหลัง deploy เพื่อให้ stm มี acctBalances (ยอดรายบัญชีจากไฟล์). */
  const cfpCard = { background: C.card, backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,.6)', borderRadius: 18, padding: '16px 20px', boxShadow: C.shadow, marginBottom: 16 };
  function cfpDeltaM(v) { if (!v) return '–'; return (v < 0 ? '-' : '+') + (Math.abs(v) / 1e6).toFixed(2) + 'M'; }   // ยอด Δ สั้นในตาราง
  // 5 ประเภทบัญชี — "ใช้ได้จริง" = 'usable' เท่านั้น; ที่เหลือ = เงินที่ติดเงื่อนไข/ใช้ไม่ได้อิสระ
  const CFP_ACCT_TYPES = [
    { key: 'usable', label: 'สามารถใช้ได้', short: 'ใช้ได้', icon: '✅', color: C.pos },
    { key: 'guarantee', label: 'วงเงินค้ำประกัน (ติดภาระ)', short: 'ค้ำประกัน', icon: '🔒', color: '#e08a3c' },
    { key: 'investor', label: 'เงินนักลงทุน', short: 'นักลงทุน', icon: '💼', color: '#9b7bff' },
    { key: 'joint', label: 'บัญชีร่วม', short: 'ร่วม', icon: '👥', color: '#1f6fb8' },
    { key: 'od', label: 'OD (เบิกเกินบัญชี)', short: 'OD', icon: '➖', color: '#e5484d' },
  ];
  function cfpTypeMeta(k) { for (let i = 0; i < CFP_ACCT_TYPES.length; i++) if (CFP_ACCT_TYPES[i].key === k) return CFP_ACCT_TYPES[i]; return CFP_ACCT_TYPES[0]; }
  // ค่าเริ่มต้น Water POG (จับด้วยเลขท้ายบัญชี 4 หลัก) — แก้ทับได้ผ่าน ✏️ จัดประเภทบัญชี (sync ทั้งทีม)
  const CFP_ACCT_TYPE_DEF = {
    '0669': 'investor', '4863': 'usable', '0093': 'usable', '1345': 'od', '3834': 'guarantee',
    '4999': 'joint', '5979': 'joint', '2441': 'usable', '1079': 'usable', '2477': 'guarantee',
    '2125': 'usable', '6816': 'guarantee', '0228': 'od', '6419': 'usable', '7120': 'guarantee', '1921': 'usable',
  };
  function CfpCashUsable({ model, acctTypes, canEdit, onSave }) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(null);
    const [drill, setDrill] = useState(null);   // null | 'all' | <typeKey> → เปิดโมดัล "ยอดนี้มาจากบัญชีไหน"
    const accts = (model.accountInfo && model.accountInfo.length) ? model.accountInfo : [];
    const typeMap = (acctTypes && typeof acctTypes === 'object') ? acctTypes : {};
    const active = (editing && draft) ? draft : typeMap;
    const defOf = a => CFP_ACCT_TYPE_DEF[a.last4] || 'usable';
    const typeOf = a => (active[a.name] != null ? active[a.name] : defOf(a));
    const modalOpen = editing || drill !== null;
    useEffect(() => {
      if (!modalOpen) return;
      const h = e => { if (e.key === 'Escape') { setEditing(false); setDrill(null); } };
      window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
    }, [modalOpen]);

    // ----- ยังไม่มียอดรายบัญชี (ไฟล์เก่า ยังไม่ได้อัปใหม่หลัง deploy) -----
    if (!model.hasAcctBalances || !accts.length) {
      if (!canEdit) return null;
      return (
        <div className="cfp-card no-print no-present" style={{ ...cfpCard, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: 'linear-gradient(135deg,rgba(42,111,219,.07),rgba(31,86,184,.10))' }}>
          <div style={{ fontSize: 13, color: C.ink, flex: 1 }}>💡 <b>แยกเงินตามประเภทบัญชี</b> — อัปโหลดไฟล์ Cash Flow <b>อีกครั้ง 1 รอบ</b> เพื่อดึงยอดต้นงวดรายบัญชี จากนั้นจะจัดประเภทแต่ละบัญชี (ใช้ได้/ค้ำประกัน/นักลงทุน/บัญชีร่วม/OD) + เห็นเพิ่ม-ลดรายเดือนรายบัญชีได้</div>
        </div>
      );
    }

    const total = accts.reduce((s, a) => s + a.ending, 0);
    const pct = v => total > 0 ? Math.round(v / total * 100) : 0;
    const months = model.monthsAll || [];
    // ยอดต่อประเภท (เรียงตาม CFP_ACCT_TYPES, เก็บเฉพาะที่มีบัญชี)
    const byType = CFP_ACCT_TYPES.map(t => {
      const list = accts.filter(a => typeOf(a) === t.key);
      return { ...t, amount: list.reduce((s, a) => s + a.ending, 0), count: list.length };
    }).filter(t => t.count > 0);
    const usableTotal = accts.filter(a => typeOf(a) === 'usable').reduce((s, a) => s + a.ending, 0);
    const restrictedTotal = total - usableTotal;
    const unclassified = byType.length <= 1 && byType[0] && byType[0].key === 'usable';

    function openDrill(scope) { setEditing(false); setDraft(null); setDrill(scope); }
    function startEdit() { const d = {}; accts.forEach(a => { d[a.name] = typeOf(a); }); setDraft(d); setDrill(null); setEditing(true); }
    function setType(name, t) { setDraft(d => ({ ...d, [name]: t })); }
    function commit() { const out = {}; accts.forEach(a => { const t = draft[a.name] || 'usable'; if (t !== defOf(a)) out[a.name] = t; }); onSave(out); setEditing(false); }
    function closeModal() { setEditing(false); setDrill(null); }

    // เรียง: usable ท้ายสุด · ที่เหลือ (ติดเงื่อนไข) ขึ้นก่อนตามลำดับประเภท แล้วยอดมากก่อน
    const typeRank = {}; CFP_ACCT_TYPES.forEach((t, i) => { typeRank[t.key] = t.key === 'usable' ? 99 : i; });
    const rankOf = a => { const r = typeRank[typeOf(a)]; return r != null ? r : 50; };
    const ordered = accts.slice().sort((a, b) => { const ra = rankOf(a), rb = rankOf(b); return ra !== rb ? ra - rb : b.ending - a.ending; });
    const cell = { padding: '6px 8px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };
    const th = { padding: '7px 8px', fontWeight: 700, fontSize: 11, color: C.mut, whiteSpace: 'nowrap', textAlign: 'right', position: 'sticky', top: 0, background: C.cardSolid, zIndex: 1 };
    const TypeBadge = ({ k }) => { const m = cfpTypeMeta(k); return <span title={m.label} style={{ background: m.color + '1f', color: m.color, borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{m.icon} {m.short}</span>; };
    const clk = { cursor: 'pointer', borderBottom: '1.5px dotted currentColor' };   // ยอดที่กดดูที่มาได้
    const selSty = { border: '1px solid ' + C.line, borderRadius: 8, padding: '3px 6px', fontSize: 11, fontFamily: 'inherit', background: '#fff', color: C.ink, cursor: 'pointer' };

    // บัญชีที่จะโชว์ในโมดัล: แก้ไข/รวม → ทุกบัญชี · ดูที่มา → เฉพาะประเภทที่กด
    const shown = (editing || drill === 'all' || drill == null) ? ordered : ordered.filter(a => typeOf(a) === drill);
    const shownTotal = shown.reduce((s, a) => s + a.ending, 0);
    const dMeta = (drill && drill !== 'all') ? cfpTypeMeta(drill) : null;
    const modalTitle = editing ? '🏷️ จัดประเภทบัญชี' : dMeta ? (dMeta.icon + ' ' + dMeta.label + ' — มาจากบัญชีไหนบ้าง') : '💰 ยอดเงินสด — ทุกบัญชี';

    return (
      <React.Fragment>
        {/* การ์ดสรุป (ย่อ) — กดที่ยอด/ชิปประเภท เพื่อดูว่ามาจากบัญชีไหน */}
        <div className="cfp-card" style={cfpCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>💰 เงินสดนี้ “ใช้ได้จริง” เท่าไร — แยกตามบัญชี</span>
            {canEdit && <button className="no-print no-present" onClick={startEdit} style={{ border: '1px solid ' + C.line, background: '#fff', color: C.primaryD, borderRadius: 9, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>✏️ จัดประเภทบัญชี</button>}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <span onClick={() => openDrill('all')} title="กดดูทุกบัญชี" style={{ fontSize: 28, fontWeight: 800, color: C.ink, letterSpacing: '-.5px', cursor: 'pointer' }}>{cfpFmtM(total)}</span>
            <span style={{ fontSize: 13, color: C.mut }}>เงินสดรวมทุกบัญชี — <b onClick={() => openDrill('usable')} title="กดดูว่ามาจากบัญชีไหน" style={{ color: C.pos, ...clk }}>ใช้ได้จริง {cfpFmtM(usableTotal)} ({pct(usableTotal)}%)</b>{restrictedTotal > 0 ? <span> · ติดเงื่อนไข {cfpFmtM(restrictedTotal)} ({pct(restrictedTotal)}%)</span> : null}</span>
          </div>
          {/* แถบ 100% แยกตามประเภท */}
          <div style={{ display: 'flex', height: 26, borderRadius: 8, overflow: 'hidden', background: C.soft, marginBottom: 10 }}>
            {byType.map(t => <div key={t.key} onClick={() => openDrill(t.key)} title={t.icon + ' ' + t.label + ' · ' + cfpFmtB(t.amount) + ' (กดดูที่มา)'} style={{ width: (total > 0 ? t.amount / total * 100 : 0) + '%', background: t.color, minWidth: 2, cursor: 'pointer' }} />)}
          </div>
          {/* ชิปประเภท (กดดูบัญชีในแต่ละประเภท) = "เงินก้อนนี้เป็นเงินอะไรบ้าง" */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {byType.map(t => (
              <button key={t.key} onClick={() => openDrill(t.key)} title="กดดูว่ามาจากบัญชีไหน + เพิ่ม-ลดรายเดือน" style={{ display: 'flex', alignItems: 'center', gap: 7, border: '1px solid ' + C.line, background: '#fff', borderRadius: 20, padding: '5px 12px', cursor: 'pointer', fontSize: 12 }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: t.color, flex: '0 0 auto' }} />
                <b style={{ color: C.ink }}>{t.icon} {t.label}</b>
                <span style={{ color: C.mut, fontVariantNumeric: 'tabular-nums' }}>{cfpFmtM(t.amount)} · {pct(t.amount)}% · {t.count} บัญชี</span>
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: C.faint, marginTop: 8 }}>กดที่ยอด หรือชิปประเภท เพื่อดูว่ามาจากบัญชีไหน + เพิ่ม-ลดรายเดือน · ทั้งหมด {accts.length} บัญชี</div>
          {unclassified && canEdit && <div className="no-print no-present" style={{ fontSize: 12, color: '#a8620a', background: '#fff7e6', borderRadius: 9, padding: '7px 12px', marginTop: 8 }}>ยังไม่ได้จัดประเภทบัญชี — กด ✏️ จัดประเภทบัญชี เพื่อระบุ ค้ำประกัน/นักลงทุน/บัญชีร่วม/OD (ตอนนี้นับเป็นใช้ได้ทั้งหมด)</div>}
        </div>

        {/* โมดัล: ที่มาของยอด (ราย​บัญชี + เพิ่ม-ลดรายเดือน) / โหมดจัดประเภท */}
        {modalOpen && (
          <div className="no-print no-present" onClick={closeModal} style={{ position: 'fixed', inset: 0, background: 'rgba(15,25,45,.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', zIndex: 1300, overflowY: 'auto' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,.3)', width: 'min(940px,100%)', padding: '18px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: C.ink }}>{modalTitle}</div>
                  <div style={{ fontSize: 12, color: C.mut, marginTop: 2 }}>{shown.length} บัญชี · รวม {cfpFmtM(shownTotal)}{(!editing && dMeta) ? ' (' + pct(shownTotal) + '% ของเงินสดทั้งหมด)' : ''}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {editing
                    ? <React.Fragment>
                        <button onClick={closeModal} style={{ border: '1px solid ' + C.line, background: '#fff', color: C.mut, borderRadius: 9, padding: '7px 14px', fontSize: 13, cursor: 'pointer' }}>ยกเลิก</button>
                        <button onClick={commit} style={{ border: 0, background: C.primary, color: '#fff', borderRadius: 9, padding: '7px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>บันทึก</button>
                      </React.Fragment>
                    : <React.Fragment>
                        {canEdit && <button onClick={startEdit} style={{ border: '1px solid ' + C.line, background: '#fff', color: C.primaryD, borderRadius: 9, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>✏️ จัดประเภท</button>}
                        <button onClick={closeModal} title="ปิด" style={{ border: '1px solid ' + C.line, background: '#fff', color: C.mut, borderRadius: 9, width: 32, height: 32, fontSize: 16, cursor: 'pointer' }}>✕</button>
                      </React.Fragment>}
                </div>
              </div>
              {editing && <div style={{ fontSize: 12, color: C.primaryD, background: C.soft, borderRadius: 9, padding: '7px 12px', marginBottom: 10 }}>เลือกประเภทของแต่ละบัญชีจากเมนู (สามารถใช้ได้ / ค้ำประกัน / นักลงทุน / บัญชีร่วม / OD) แล้วกดบันทึก</div>}

              <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '64vh', border: '1px solid ' + C.line, borderRadius: 12 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 540 + months.length * 80 }}>
                  <thead><tr>
                    <th style={{ ...th, textAlign: 'left' }}>บัญชี</th>
                    <th style={{ ...th, textAlign: 'center' }}>ประเภท</th>
                    <th style={th}>ต้นงวด</th>
                    {months.map(m => <th key={m} style={th}>{CFP_MONTHS[m] || m}</th>)}
                    <th style={{ ...th, color: C.primaryD }}>ปลายงวด</th>
                  </tr></thead>
                  <tbody>
                    {shown.map(a => {
                      const k = typeOf(a); const m = cfpTypeMeta(k);
                      return (
                        <tr key={a.name} style={{ borderTop: '1px solid ' + C.line, background: k === 'usable' ? 'transparent' : (m.color + '12') }}>
                          <td style={{ ...cell, textAlign: 'left' }}><CfpBankPill acct={a.name} /> <span style={{ color: C.mut, fontSize: 11 }}>···{a.last4 || '—'}</span></td>
                          <td style={{ ...cell, textAlign: 'center' }}>{editing
                            ? <select value={k} onChange={e => setType(a.name, e.target.value)} style={selSty}>{CFP_ACCT_TYPES.map(t => <option key={t.key} value={t.key}>{t.icon + ' ' + t.label}</option>)}</select>
                            : <TypeBadge k={k} />}</td>
                          <td style={{ ...cell, textAlign: 'right', color: C.mut }}>{cfpFmtM(a.opening)}</td>
                          {months.map(mn => { const v = a.byMonth[mn] || 0; return <td key={mn} style={{ ...cell, textAlign: 'right', color: v > 0 ? C.pos : (v < 0 ? C.neg : C.faint) }}>{cfpDeltaM(v)}</td>; })}
                          <td style={{ ...cell, textAlign: 'right', fontWeight: 800, color: a.ending < 0 ? C.neg : C.ink }}>{cfpFmtM(a.ending)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot><tr style={{ borderTop: '2px solid ' + C.line, fontWeight: 800, background: C.soft }}>
                    <td style={{ ...cell, textAlign: 'left', position: 'sticky', bottom: 0, background: C.soft }}>รวม</td>
                    <td style={{ position: 'sticky', bottom: 0, background: C.soft }} />
                    <td style={{ ...cell, textAlign: 'right', color: C.mut, position: 'sticky', bottom: 0, background: C.soft }}>{cfpFmtM(shown.reduce((s, a) => s + a.opening, 0))}</td>
                    {months.map(m => { const v = shown.reduce((s, a) => s + (a.byMonth[m] || 0), 0); return <td key={m} style={{ ...cell, textAlign: 'right', color: v > 0 ? C.pos : (v < 0 ? C.neg : C.faint), position: 'sticky', bottom: 0, background: C.soft }}>{cfpDeltaM(v)}</td>; })}
                    <td style={{ ...cell, textAlign: 'right', color: C.primaryD, position: 'sticky', bottom: 0, background: C.soft }}>{cfpFmtM(shownTotal)}</td>
                  </tr></tfoot>
                </table>
              </div>
              <div style={{ fontSize: 11, color: C.faint, marginTop: 8 }}>ต้นงวด = ยอดยกมารายบัญชี · ตัวเลขรายเดือน = เพิ่ม/ลดสุทธิของบัญชีนั้นในเดือนนั้น (รวมเงินโอนระหว่างบัญชี) · ปลายงวด = ยอดคงเหลือล่าสุด</div>
            </div>
          </div>
        )}
      </React.Fragment>
    );
  }

  /* ---------- SVG: waterfall ---------- */
  function CfpWaterfall({ model, onPick }) {
    const W = 720, H = 300, padX = 46, top = 30, baseY = 250;
    const cols = [
      { key: null, name: 'ต้นงวด', delta: model.opening, abs: true }, { key: 'op', name: 'ดำเนินงาน', delta: model.acts.op.net },
      { key: 'inv', name: 'ลงทุน', delta: model.acts.inv.net }, { key: 'fin', name: 'จัดหาเงิน', delta: model.acts.fin.net },
      { key: null, name: 'ปลายงวด', delta: model.ending, abs: true },
    ];
    const segs = [{ from: 0, to: model.opening }]; let cum = model.opening;
    [model.acts.op.net, model.acts.inv.net, model.acts.fin.net].forEach(d => { const from = cum; cum += d; segs.push({ from, to: cum }); });
    segs.push({ from: 0, to: model.ending });
    const peak = Math.max(model.opening, model.ending, ...segs.map(s => Math.max(s.from, s.to))) * 1.1 || 1;
    const y = v => baseY - (v / peak) * (baseY - top);
    const slot = (W - padX * 2) / cols.length, bw = Math.min(74, slot * 0.5);
    return (
      <svg viewBox={'0 0 ' + W + ' ' + H} width="100%" style={{ display: 'block' }} role="img" aria-label="waterfall กระแสเงินสด">
        <line x1={padX - 8} y1={baseY} x2={W - padX + 8} y2={baseY} stroke={C.line} />
        {cols.map((c, i) => {
          const cx = padX + slot * i + slot / 2, s = segs[i];
          const yTop = y(Math.max(s.from, s.to)), h = Math.max(2, y(Math.min(s.from, s.to)) - yTop);
          const fill = c.abs ? C.primary : (c.delta >= 0 ? C.pos : C.neg), clickable = !!c.key;
          return (
            <g key={i} style={{ cursor: clickable ? 'pointer' : 'default' }} onClick={() => clickable && onPick && onPick(c.key)}>
              {i > 0 && <line x1={padX + slot * (i - 1) + slot / 2 + bw / 2} y1={y(segs[i - 1].to)} x2={cx - bw / 2} y2={y(c.abs ? c.delta : s.from)} stroke={C.faint} strokeDasharray="3 3" />}
              <rect x={cx - bw / 2} y={yTop} width={bw} height={h} rx="5" fill={fill} opacity={c.abs ? 0.92 : 0.96} />
              <text x={cx} y={yTop - 7} textAnchor="middle" fontSize="12.5" fontWeight="700" fill={c.abs ? C.primaryD : fill}>{c.abs ? cfpFmtM(c.delta) : cfpFmtSigned(c.delta)}</text>
              <text x={cx} y={baseY + 18} textAnchor="middle" fontSize="12" fill={C.mut}>{c.name}</text>
              {clickable && <text x={cx} y={baseY + 33} textAnchor="middle" fontSize="10" fill={C.faint}>กดดู ›</text>}
            </g>
          );
        })}
      </svg>
    );
  }

  /* ---------- SVG: monthly grouped bars (up/down by activity) ---------- */
    function CfpMonthly({ model, onPick }) {
    const mo = model.monthly; if (!mo.length) return null;
    const acts = ['op', 'inv', 'fin'];
    // ★ แท่งกลุ่มตามกิจกรรม "ขึ้น/ลง" จากเส้นศูนย์ — บวกขึ้น (เข้ม) · ลบลง (จาง)
    //   ค่ากำกับ: บวกบนหัวแท่ง · ลบใต้แท่ง. จัดกลุ่มรายเดือน (พื้นสลับเฉดแยกเดือน).
    const W = 760, H = 320, padX = 20, padTop = 40, padBot = 56;
    const plotH = H - padTop - padBot, baseY = H - padBot, zeroY = padTop + plotH / 2, half = plotH / 2 - 12;
    const maxAbs = Math.max.apply(null, mo.map(d => Math.max(Math.abs(d.op), Math.abs(d.inv), Math.abs(d.fin))).concat([1]));
    const slot = (W - padX * 2) / mo.length, cx = i => padX + slot * i + slot / 2;
    const gb = Math.min(34, (slot * 0.66) / 3), gap = Math.min(9, gb * 0.3);
    const groupW = gb * 3 + gap * 2;
    const barH = v => Math.max(2, Math.abs(v) / maxAbs * half);
    const lbl = v => (v >= 0 ? '+' : '-') + (Math.abs(v) / 1e6).toFixed(1) + 'M';
    return (
      <svg viewBox={'0 0 ' + W + ' ' + H} width="100%" style={{ display: 'block' }} role="img" aria-label="กระแสเงินสดรายเดือน แยกตามกิจกรรม (แท่งขึ้น/ลง)">
        {mo.map((d, i) => {
          const gx = cx(i) - groupW / 2;
          return (
            <g key={'g' + i} style={{ cursor: 'pointer' }} onClick={() => onPick && onPick(d.m)}>
              <rect x={cx(i) - slot / 2 + 3} y={padTop - 8} width={slot - 6} height={plotH + 8} rx="9" fill={i % 2 ? 'rgba(42,111,219,0.05)' : 'transparent'} />
              {acts.map((k, j) => {
                const v = d[k] || 0; const h = barH(v); const bx = gx + j * (gb + gap); const neg = v < 0;
                const by = neg ? zeroY : zeroY - h, ty = neg ? zeroY + h + 12 : zeroY - h - 5;
                return (
                  <g key={k}>
                    <rect x={bx} y={by} width={gb} height={h} rx="3" fill={ACT_COLOR[k]} opacity={neg ? 0.55 : 0.95}><title>{CFP_ACT_SHORT[k] + ' ' + cfpFmtM(v)}</title></rect>
                    <text x={bx + gb / 2} y={ty} textAnchor="middle" fontSize="10" fontWeight="700" fill={neg ? C.neg : ACT_COLOR[k]}>{lbl(v)}</text>
                  </g>
                );
              })}
              <text x={cx(i)} y={baseY + 22} textAnchor="middle" fontSize="12" fontWeight="800" fill={C.ink}>{d.label}</text>
              <text x={cx(i)} y={baseY + 37} textAnchor="middle" fontSize="11" fontWeight="700" fill={d.net < 0 ? C.neg : C.pos}>สุทธิ {cfpFmtSigned(d.net)}</text>
            </g>
          );
        })}
        {/* เส้นศูนย์ (zero line) เต็มความกว้าง */}
        <line x1={padX} y1={zeroY} x2={W - padX} y2={zeroY} stroke={C.faint} strokeWidth="1.2" />
      </svg>
    );
  }

  function CfpBar({ amt, max }) { const w = Math.max(2, Math.round(Math.abs(amt) / (max || 1) * 100)); return <span style={{ display: 'inline-block', height: 7, width: w + '%', background: amt < 0 ? C.neg : C.pos, borderRadius: 2, verticalAlign: 'middle' }} />; }

  /* ---------- statement table ---------- */
  function CfpStatementTable({ model, onPick }) {
    const rows = model.stmt;
    const [collapsed, setCollapsed] = useState({});   // { prefix: true } = ย่อกลุ่มรหัสนั้น
    if (!rows || !rows.length) return <div style={{ fontSize: 13, color: C.faint, padding: '6px 0' }}>ยังไม่มีรายการในงบ</div>;
    const months = (model.monthLabels && model.monthLabels.length) ? model.monthLabels : model.months.map(m => CFP_MONTHS[m]);
    const monthNumByIdx = i => model.months[i] || (i + 1);
    const toggle = p => setCollapsed(c => Object.assign({}, c, { [p]: !c[p] }));
    const anyCode = rows.some(r => r.type === 'codegroup');
    const acct = v => { if (!v) return <span style={{ color: C.faint }}>-</span>; const neg = v < 0; return <span style={{ color: neg ? C.neg : C.ink }}>{neg ? '(' + cfpFmtPlain(v) + ')' : cfpFmtPlain(v)}</span>; };
    const th = { padding: '8px 8px', fontWeight: 700, color: C.mut, whiteSpace: 'nowrap', borderBottom: '2px solid ' + C.line, fontSize: 12, position: 'sticky', top: 0, background: '#f6f9fe' };
    return (
      <div className="cfp-stmt" style={{ overflowX: 'auto', maxHeight: '76vh', overflowY: 'auto', borderRadius: 12, border: '1px solid ' + C.line }}>
        {anyCode && <div className="no-print" style={{ display: 'flex', gap: 8, padding: '7px 10px', borderBottom: '1px solid ' + C.line, background: '#f6f9fe', position: 'sticky', top: 0, zIndex: 4 }}>
          <button onClick={() => { const c = {}; rows.forEach(r => { if (r.type === 'codegroup') c[r.prefix] = true; }); setCollapsed(c); }} style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600, border: '1px solid ' + C.line, background: '#fff', color: C.mut, borderRadius: 8, padding: '3px 10px' }}>▸ ย่อทุกกลุ่ม</button>
          <button onClick={() => setCollapsed({})} style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600, border: '1px solid ' + C.line, background: '#fff', color: C.mut, borderRadius: 8, padding: '3px 10px' }}>▾ กางทุกกลุ่ม</button>
        </div>}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 720 }}>
          <thead><tr>
            <th style={{ ...th, textAlign: 'left', left: 0, zIndex: 3, width: 64 }}>รหัส</th>
            <th style={{ ...th, textAlign: 'left', left: 64, zIndex: 3 }}>รายการ</th>
            {months.map((m, i) => <th key={i} style={{ ...th, textAlign: 'right' }}>{m}</th>)}
            <th style={{ ...th, textAlign: 'right' }}>รวม</th>
          </tr></thead>
          <tbody>
            {rows.map((r, ri) => {
              const isLeaf = r.type === 'leaf', isSection = r.type === 'section', isNet = r.type === 'net', isGrand = r.type === 'grand', isSub = r.type === 'subtotal', isGroup = r.type === 'group', isCode = r.type === 'codegroup';
              if (isLeaf && r.prefix && collapsed[r.prefix]) return null;   // ซ่อนรายการย่อยเมื่อกลุ่มถูกย่อ
              // สีไล่ระดับชั้นให้ดูกลุ่มง่าย: section (เข้มสุด) > หัวรับ-จ่าย > รวม > สุทธิ > กลุ่มรหัส > รายการย่อย(ขาว)
              const rowBg = isSection ? '#cdddf7' : isGrand ? '#c9dcf6' : isNet ? '#d8e6fb' : isGroup ? '#e8f0fb' : isSub ? '#e9f1fc' : isCode ? '#f4f8fe' : 'transparent';
              const fw = (isSection || isNet || isSub || isGrand) ? 800 : (isGroup || isCode) ? 700 : 400;
              const indent = (typeof r.indent === 'number') ? r.indent : (isSection ? 0 : isGroup ? 14 : (isSub || isNet || isGrand) ? 14 : 26);
              const emptyVals = isSection || isGroup;                       // หัวกิจกรรม / หัวรับ-จ่าย = ไม่มียอด
              const canDrill = isLeaf || isNet || isSub || isGrand || isCode;
              const sideAcc = r.side === 'in' ? C.pos : r.side === 'out' ? C.neg : null;   // เขียว=รับ · แดง=จ่าย
              const accent = sideAcc || C.primary;
              const col = (isSection || isNet || isGrand) ? C.primaryD : ((isGroup || isSub) && sideAcc) ? sideAcc : C.ink;
              const labelBg = rowBg === 'transparent' ? '#fff' : rowBg;
              // แถบสีซ้ายแยกรับ/จ่าย: หัวรับ-จ่าย/รวม/กลุ่มรหัส = เข้ม · รายการย่อย = จาง → เห็นบล็อกกลุ่มชัด
              const leftBar = (isGroup || isSub || isCode) ? ('4px solid ' + accent) : (isLeaf && sideAcc) ? ('4px solid ' + (r.side === 'in' ? 'rgba(21,164,95,.20)' : 'rgba(229,72,77,.18)')) : '4px solid transparent';
              const tdTop = isNet ? ('2px solid ' + C.primary) : isCode ? '1px solid #e2e9f4' : (isSub && sideAcc) ? ('1.5px solid ' + accent) : '0';
              return (
                <tr key={ri} style={{ background: rowBg }}>
                  <td style={{ padding: '6px 8px', color: isCode ? C.primaryD : C.faint, fontSize: 11, fontWeight: isCode ? 700 : 400, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', position: 'sticky', left: 0, zIndex: 1, background: labelBg, borderBottom: '1px solid ' + C.line, borderLeft: leftBar, borderTop: tdTop }}>{r.code || ''}</td>
                  <td onClick={() => { if (isCode) toggle(r.prefix); else if (canDrill && onPick) onPick(r, null); }} style={{ padding: '6px 8px', paddingLeft: 8 + indent, fontWeight: fw, color: col, cursor: (isCode || canDrill) ? 'pointer' : 'default', whiteSpace: 'nowrap', position: 'sticky', left: 64, zIndex: 1, background: labelBg, borderBottom: '1px solid ' + C.line, borderTop: tdTop }}>
                    {isCode && <span style={{ color: accent, marginRight: 5, display: 'inline-block', width: 10 }}>{collapsed[r.prefix] ? '▸' : '▾'}</span>}
                    {r.label}{(canDrill && !isCode) && <span style={{ color: C.faint, fontWeight: 400 }}> ›</span>}
                  </td>
                  {months.map((m, ci) => (
                    <td key={ci} onClick={() => { if (!emptyVals && canDrill && onPick) onPick(r, monthNumByIdx(ci)); }} style={{ padding: '6px 8px', textAlign: 'right', fontWeight: (isNet || isSub || isGrand) ? 800 : (isCode ? 700 : 400), cursor: (!emptyVals && canDrill) ? 'pointer' : 'default', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', borderBottom: '1px solid ' + C.line, borderTop: tdTop }}>{emptyVals ? '' : acct(r.vals[ci])}</td>
                  ))}
                  <td onClick={() => { if (!emptyVals && canDrill && onPick) onPick(r, null); }} style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 800, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', cursor: (!emptyVals && canDrill) ? 'pointer' : 'default', background: '#eaf1fb', borderBottom: '1px solid ' + C.line, borderTop: tdTop }}>{emptyVals ? '' : acct(r.total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  /* ---------- Transaction Explorer ---------- */
  function CfpExplorer({ model, toast }) {
    const [q, setQ] = useState('');
    const [fAct, setFAct] = useState(''); const [fBank, setFBank] = useState(''); const [fMonth, setFMonth] = useState(''); const [fType, setFType] = useState('');
    const [sortKey, setSortKey] = useState('iso'); const [sortDir, setSortDir] = useState(-1);
    const banks = useMemo(() => Array.from(new Set(model.allTxns.map(t => t.account))).sort(), [model]);
    const sel = { padding: '8px 11px', border: '1px solid ' + C.line, borderRadius: 11, fontSize: 13, fontFamily: 'inherit', background: '#fff', color: C.ink };
    const rows = useMemo(() => {
      const ql = q.trim().toLowerCase();
      let r = model.allTxns.filter(t => {
        if (fAct && t.actKey !== fAct) return false;
        if (fBank && t.account !== fBank) return false;
        if (fMonth && String(t.month) !== fMonth) return false;
        if (fType === 'in' && t.flow <= 0) return false;
        if (fType === 'out' && t.flow >= 0) return false;
        if (ql) { const s = (t.note + ' ' + t.category + ' ' + t.docNo + ' ' + t.account).toLowerCase(); if (s.indexOf(ql) < 0) return false; }
        return true;
      });
      r = r.slice().sort((a, b) => { let x = a[sortKey], y = b[sortKey]; if (x < y) return -sortDir; if (x > y) return sortDir; return 0; });
      return r;
    }, [model, q, fAct, fBank, fMonth, fType, sortKey, sortDir]);
    const totIn = rows.filter(t => t.flow > 0).reduce((s, t) => s + t.flow, 0);
    const totOut = rows.filter(t => t.flow < 0).reduce((s, t) => s + Math.abs(t.flow), 0);
    const shown = rows.slice(0, 500);
    function sortBy(k) { if (sortKey === k) setSortDir(d => -d); else { setSortKey(k); setSortDir(k === 'iso' ? -1 : 1); } }
    function arrow(k) { return sortKey === k ? (sortDir > 0 ? ' ▲' : ' ▼') : ''; }
    function exportCSV() {
      const head = ['วันที่', 'เลขที่', 'รายการ', 'บัญชี', 'หมวด', 'กิจกรรม', 'รับ', 'จ่าย', 'คงเหลือ'];
      const lines = [head.join(',')].concat(rows.map(t => [cfpThaiDate(t.iso), t.docNo, '"' + (t.note || '').replace(/"/g, '""') + '"', '"' + t.account + '"', '"' + t.category + '"', CFP_ACT_SHORT[t.actKey] || '', t.flow > 0 ? Math.round(t.flow) : '', t.flow < 0 ? Math.round(-t.flow) : '', t.balance || ''].join(',')));
      const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'transactions.csv'; a.click();
      toast && toast('ดาวน์โหลด CSV · ' + rows.length + ' รายการ');
    }
    const th = (label, k, align) => <th onClick={k ? () => sortBy(k) : undefined} style={{ padding: '8px 9px', fontWeight: 700, fontSize: 12, color: C.mut, cursor: k ? 'pointer' : 'default', whiteSpace: 'nowrap', textAlign: align || 'left', position: 'sticky', top: 0, background: '#f6f9fe', userSelect: 'none' }}>{label}{k ? arrow(k) : ''}</th>;
    return (
      <div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหา รายการ / หมวด / เลขที่…" style={{ ...sel, minWidth: 230, flex: '1 1 230px' }} />
          <select value={fAct} onChange={e => setFAct(e.target.value)} style={sel}><option value="">ทุกกิจกรรม</option><option value="op">ดำเนินงาน</option><option value="inv">ลงทุน</option><option value="fin">จัดหาเงิน</option><option value="transfer">โอนระหว่างบัญชี</option></select>
          <select value={fBank} onChange={e => setFBank(e.target.value)} style={sel}><option value="">ทุกบัญชี</option>{banks.map(b => <option key={b} value={b}>{b}</option>)}</select>
          <select value={fMonth} onChange={e => setFMonth(e.target.value)} style={sel}><option value="">ทุกเดือน</option>{model.months.map(m => <option key={m} value={String(m)}>{CFP_MONTHS[m]}</option>)}</select>
          <select value={fType} onChange={e => setFType(e.target.value)} style={sel}><option value="">รับ+จ่าย</option><option value="in">รับเข้า</option><option value="out">จ่ายออก</option></select>
          <button onClick={exportCSV} style={{ ...sel, cursor: 'pointer', fontWeight: 600 }}>⬇ CSV</button>
        </div>
        <div style={{ display: 'flex', gap: 18, fontSize: 12, color: C.mut, marginBottom: 10 }}>
          <span><b style={{ color: C.ink }}>{rows.length.toLocaleString('en-US')}</b> รายการ</span>
          <span>รับ <b style={{ color: C.pos }}>{cfpFmtB(totIn)}</b></span>
          <span>จ่าย <b style={{ color: C.neg }}>{cfpFmtB(totOut)}</b></span>
          <span>สุทธิ <b style={{ color: (totIn - totOut) < 0 ? C.neg : C.pos }}>{cfpFmtB(totIn - totOut)}</b></span>
        </div>
        <div className="cfp-grid" style={{ overflowX: 'auto', maxHeight: '70vh', overflowY: 'auto', border: '1px solid ' + C.line, borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 820 }}>
            <thead><tr>{th('วันที่', 'iso')}{th('เลขที่', 'docNo')}{th('รายการ', 'note')}{th('บัญชี', 'account')}{th('หมวด', 'category')}{th('กิจกรรม', 'actKey')}{th('รับ', 'flow', 'right')}{th('จ่าย', null, 'right')}{th('คงเหลือ', 'balance', 'right')}</tr></thead>
            <tbody>
              {shown.map((t, i) => (
                <tr key={i} style={{ borderBottom: '1px solid ' + C.line }}>
                  <td style={{ padding: '6px 9px', color: C.mut, whiteSpace: 'nowrap' }}>{cfpThaiDate(t.iso)}</td>
                  <td style={{ padding: '6px 9px', color: C.mut, whiteSpace: 'nowrap', fontSize: 12 }}>{t.docNo}</td>
                  <td style={{ padding: '6px 9px', color: C.ink, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.note}>{t.note || '-'}</td>
                  <td style={{ padding: '6px 9px' }}><CfpBankPill acct={t.account} /></td>
                  <td style={{ padding: '6px 9px', color: C.mut, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }} title={t.category}>{t.category}</td>
                  <td style={{ padding: '6px 9px' }}><CfpTag k={t.actKey} /></td>
                  <td style={{ padding: '6px 9px', textAlign: 'right', color: C.pos, fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{t.flow > 0 ? cfpFmtPlain(t.flow) : ''}</td>
                  <td style={{ padding: '6px 9px', textAlign: 'right', color: C.neg, fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{t.flow < 0 ? cfpFmtPlain(t.flow) : ''}</td>
                  <td style={{ padding: '6px 9px', textAlign: 'right', color: C.mut, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{t.balance ? cfpFmtPlain(t.balance) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > shown.length && <div style={{ fontSize: 11, color: C.faint, marginTop: 8 }}>แสดง {shown.length} จาก {rows.length.toLocaleString('en-US')} รายการ — ใช้ตัวกรอง/ค้นหาเพื่อแคบลง</div>}
      </div>
    );
  }

  /* ---------- activity detail (องค์ประกอบ + จุดเฝ้าระวัง รายกิจกรรม) ---------- */
  function CfpActivityDetail({ model, k, onCat, onAll }) {
    const [expanded, setExpanded] = useState(false);
    const a = model.acts[k]; if (!a) return null;
    const flags = cfpWatch(model, k);
    const cats = a.catList || [];
    const maxAbs = Math.max.apply(null, cats.map(c => Math.abs(c.net)).concat([1]));
    const inTot = cats.filter(c => c.net > 0).reduce((s, c) => s + c.net, 0);
    const outTot = cats.filter(c => c.net < 0).reduce((s, c) => s + Math.abs(c.net), 0);
    const top = expanded ? cats : cats.slice(0, 7);
    return (
      <div className="cfp-card" style={{ background: C.card, backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,.6)', borderRadius: 18, boxShadow: C.shadow, marginBottom: 16, overflow: 'hidden' }}>
        <div style={{ height: 5, background: ACT_COLOR[k] }} />
        <div style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>{CFP_ACT_NAME[k]}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: a.net < 0 ? C.neg : C.pos }}>{cfpFmtM(a.net)}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, fontSize: 12, flexWrap: 'wrap' }}>
            <span style={{ background: C.posBg, color: C.pos, padding: '3px 10px', borderRadius: 20, fontWeight: 700 }}>รับ {cfpFmtM(inTot)}</span>
            <span style={{ background: C.negBg, color: C.neg, padding: '3px 10px', borderRadius: 20, fontWeight: 700 }}>จ่าย {cfpFmtM(outTot)}</span>
            <span style={{ background: C.soft, color: C.mut, padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>{cats.length} หมวด</span>
          </div>
          <div className="cfp-act-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.25fr) minmax(0,1fr)', gap: 20 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.mut, marginBottom: 8 }}>องค์ประกอบหลัก (กดดูรายการ)</div>
              <div style={expanded ? { maxHeight: 420, overflowY: 'auto', paddingRight: 4 } : null}>
                {top.map((c, i) => (
                  <div key={i} onClick={() => onCat(c)} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2.4fr) minmax(0,0.8fr) 92px', gap: 10, alignItems: 'center', padding: '6px 6px', borderBottom: '1px solid ' + C.line, cursor: 'pointer', borderRadius: 6 }}>
                    <span style={{ fontSize: 13, color: C.ink, lineHeight: 1.35, wordBreak: 'break-word' }}>{c.name} <span style={{ color: C.faint }}>({c.count})</span></span>
                    <span><CfpBar amt={c.net} max={maxAbs} /></span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: c.net < 0 ? C.neg : C.pos, textAlign: 'right', whiteSpace: 'nowrap' }}>{cfpFmtB(c.net)}</span>
                  </div>
                ))}
              </div>
              {cats.length > 7 && (
                <div style={{ display: 'flex', gap: 16, marginTop: 9, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span onClick={() => setExpanded(e => !e)} style={{ fontSize: 12, color: C.primary, cursor: 'pointer', fontWeight: 700 }}>{expanded ? '▲ ย่อ' : '▼ ดูอีก ' + (cats.length - 7) + ' หมวด'}</span>
                  <span onClick={onAll} style={{ fontSize: 12, color: C.mut, cursor: 'pointer' }}>ดูรายการทั้งหมด →</span>
                </div>
              )}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.mut, marginBottom: 8 }}>🚩 จุดเฝ้าระวัง</div>
              {flags.map((f, i) => {
                const s = CFP_SEV[f.sev] || CFP_SEV.blue;
                return (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 11px', borderRadius: 10, background: s.bg, marginBottom: 7 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.c, marginTop: 5, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: s.c, lineHeight: 1.45, fontWeight: 500 }}>{f.t}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ---------- main page ---------- */
  function CashFlowPresentPage({ data, setData, toast }) {
    const [stored, setStored] = useState(() => { try { return JSON.parse(localStorage.getItem(CFP_LS) || 'null'); } catch (e) { return null; } });
    const [uploading, setUploading] = useState(false);
    const [tab, setTab] = useState('overview');
    const [topN, setTopN] = useState(10); const [era, setEra] = useState(() => { try { return localStorage.getItem('wtp-cfp-era') || 'auto'; } catch (e) { return 'auto'; } });
    const [modal, setModal] = useState(null);
    const [synced, setSynced] = useState(false);      // โหลด/แชร์ผ่านส่วนกลาง (Supabase) สำเร็จล่าสุด
    const [shareBusy, setShareBusy] = useState(false);
    const [orient, setOrient] = useState(() => { try { return localStorage.getItem('wtp-cfp-print-orient') || 'portrait'; } catch (e) { return 'portrait'; } });
    const [groupsOpen, setGroupsOpen] = useState(false);
    const fileRef = useRef(null);
    const fetchedRef = useRef(false);
    const canEdit = !(window._wtpRoleIsReadOnly && window._wtpRoleIsReadOnly());

    const model = useMemo(() => { if (!stored || !stored.stm) return null; try { return cfpBuildModel(stored.stm, stored.catGroups, stored.codeGroups); } catch (e) { console.error('[cfp] build', e); return null; } }, [stored]); useEffect(() => { try { localStorage.setItem('wtp-cfp-era', era); } catch (e) {} }, [era]);
    // บันทึกการจัดกลุ่มหมวด (catGroups) — เก็บลง stored + push ส่วนกลาง (เหมือน BIO saveCatMap)
    function saveGroups(newGroups) {
      persist({ stm: stored.stm, catGroups: newGroups, codeGroups: (stored && stored.codeGroups) || null, acctTypes: (stored && stored.acctTypes) || null }).then(r => { toast && toast('บันทึกการจัดกลุ่มแล้ว' + cfpShareSuffix(r), r.reason === 'error' ? 'error' : undefined); });
      setGroupsOpen(false);
    }
    // บันทึกการจัดประเภทบัญชี (ใช้ได้/ผูกพัน) → เก็บใน acctTypes + push ส่วนกลาง
    function saveAcctTypes(at) {
      persist({ stm: stored.stm, catGroups: (stored && stored.catGroups) || null, codeGroups: (stored && stored.codeGroups) || null, acctTypes: at }).then(r => { toast && toast('บันทึกการจัดประเภทบัญชีแล้ว' + cfpShareSuffix(r), r.reason === 'error' ? 'error' : undefined); });
    }

    // โหลดข้อมูล "ส่วนกลาง" จาก Supabase ตอนเข้าหน้า → ทุกคน/ผู้บริหารเห็นชุดเดียวกัน
    //   server = แหล่งจริง (ทับ local cache); ถ้า server ว่าง/ตารางยังไม่สร้าง → คง local เดิม
    useEffect(() => {
      if (fetchedRef.current || !cfpCanSync()) return;
      fetchedRef.current = true; let alive = true;
      window.WTPData.fetchSheetRows(CFP_TABLE).then(rows => {
        if (!alive) return;
        const row = (rows || []).find(r => r && r.stm);
        if (row && row.stm) { setStored(row); setSynced(true); try { localStorage.setItem(CFP_LS, JSON.stringify(row)); } catch (e) {} }
      }).catch(e => { console.warn('[cfp] โหลดส่วนกลางไม่สำเร็จ:', e && e.message); });
      return () => { alive = false; };
    }, []);

    function refreshShared() {
      if (!cfpCanSync()) return; setShareBusy(true);
      window.WTPData.fetchSheetRows(CFP_TABLE).then(rows => {
        const row = (rows || []).find(r => r && r.stm);
        if (row && row.stm) { setStored(row); setSynced(true); try { localStorage.setItem(CFP_LS, JSON.stringify(row)); } catch (e) {} toast && toast('โหลดข้อมูลส่วนกลางล่าสุดแล้ว'); }
        else { toast && toast('ยังไม่มีข้อมูลส่วนกลาง — ให้ผู้ดูแลอัปโหลด', 'error'); }
        setShareBusy(false);
      }).catch(e => { setShareBusy(false); toast && toast('โหลดไม่สำเร็จ: ' + (e && e.message || ''), 'error'); });
    }

    function openAct(k) { const a = model.acts[k]; if (!a) return; let txns = []; a.catList.forEach(c => { txns = txns.concat(c.txns); }); txns.sort((x, y) => x.iso < y.iso ? 1 : -1); setModal({ title: CFP_ACT_NAME[k], subtitle: 'รวม ' + model.periodLabel + ' · ' + txns.length + ' รายการ', txns }); }
    function openMonth(m) { const txns = model.allTxns.filter(t => t.month === m && t.actKey !== 'transfer' && t.actKey !== 'other').sort((x, y) => x.iso < y.iso ? 1 : -1); setModal({ title: 'เดือน ' + (CFP_MONTHS[m] || m), subtitle: txns.length + ' รายการ', txns }); }
    function openCat(c) { const txns = (c.txns || []).slice().sort((x, y) => x.iso < y.iso ? 1 : -1); setModal({ title: c.name, subtitle: c.count + ' รายการ · สุทธิ ' + cfpFmtB(c.net), txns }); }
    function watchSub(k) { const n = cfpWatch(model, k).filter(f => f.sev === 'red' || f.sev === 'amber').length; return n ? ('🚩 ' + n + ' จุดเฝ้าระวัง') : 'กดดูรายการ'; }
    function openStmt(row, monthNum) {
      const mlab = monthNum ? ' · เดือน ' + (CFP_MONTHS[monthNum] || monthNum) : '';
      // grand (สุทธิ/ต้นงวด/ปลายงวด) → รายการทั้งหมด (ของเดือนที่กด)
      if (row.type === 'grand') {
        const txns = model.allTxns.filter(t => t.actKey !== 'transfer' && t.actKey !== 'other' && (!monthNum || t.month === monthNum)).slice().sort((x, y) => x.iso < y.iso ? 1 : -1);
        setModal({ title: row.label, subtitle: txns.length + ' รายการ' + mlab, txns }); return;
      }
      if (!row.actKey) return;
      // สรุปรายหมวดของรายการชุดหนึ่ง (เรียงยอดมากก่อน, กรองเดือนถ้ามี) → ป้อน breakdown ให้ modal
      const mkBreakdown = catObjs => catObjs.map(c => {
        let tx = c.txns; if (monthNum) tx = tx.filter(t => t.month === monthNum);
        return { name: c.name, count: tx.length, net: tx.reduce((s, t) => s + t.flow, 0), txns: tx.slice().sort((x, y) => x.iso < y.iso ? 1 : -1) };
      }).filter(b => b.count > 0).sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
      // leaf / กลุ่มรหัส (codegroup) / รวมรับ-จ่าย (subtotal) → หลายหมวด = สรุปแยกหมวดก่อน · หมวดเดียว = รายการตรงๆ
      if ((row.type === 'leaf' || row.type === 'subtotal' || row.type === 'codegroup') && row.catNames && row.catNames.length) {
        const cats = cfpCatsByNames(model, row.catNames);
        if (cats.length > 1) {
          const bd = mkBreakdown(cats); const tot = bd.reduce((s, b) => s + b.net, 0);
          setModal({ title: row.label, subtitle: bd.length + ' หมวด · สุทธิ ' + cfpFmtB(tot) + mlab + ' · กดหมวดเพื่อดูรายการ', breakdown: bd }); return;
        }
        let txns = []; cats.forEach(c => { txns = txns.concat(c.txns); });
        if (monthNum) txns = txns.filter(t => t.month === monthNum);
        txns = txns.slice().sort((x, y) => x.iso < y.iso ? 1 : -1);
        setModal({ title: row.label, subtitle: txns.length + ' รายการ · สุทธิ ' + cfpFmtB(txns.reduce((s, t) => s + t.flow, 0)) + mlab, txns }); return;
      }
      // net (สุทธิรายกิจกรรม) → สรุปแยกหมวดทั้งกิจกรรม
      const a = model.acts[row.actKey]; if (!a) return;
      const bd = mkBreakdown(a.catList); const tot = bd.reduce((s, b) => s + b.net, 0);
      setModal({ title: row.label, subtitle: 'ทั้ง' + (CFP_ACT_NAME[row.actKey] || 'กิจกรรม') + ' · ' + bd.length + ' หมวด · สุทธิ ' + cfpFmtB(tot) + mlab, breakdown: bd });
    }

    // อ่านทั้ง workbook ครั้งเดียว → คืน AOA ของชีต DATA + เงินสดต้นงวด (Σ ต้นงวด ชีตเดือนแรก)
    async function readWorkbook(file) {
      return new Promise((resolve, reject) => {
        if (!window.XLSX) { reject(new Error('ไม่พบ SheetJS — รีเฟรชหน้า')); return; }
        const r = new FileReader();
        r.onload = e => {
          try {
            const wb = window.XLSX.read(e.target.result, { type: 'array', cellDates: false });
            const aoaOf = name => { const ws = wb.Sheets[name]; return ws ? window.XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' }) : null; };
            const names = wb.SheetNames || [];
            // 1) ชีต DATA (ไม่สนตัวพิมพ์/ช่องว่าง); ถ้าไม่เจอ → ชีตแรกที่มีหัว BANK+Amount+กิจกรรม
            let dataAoa = null; const dn = names.find(n => /^\s*DATA\s*$/i.test(n));
            if (dn) dataAoa = aoaOf(dn);
            if (!dataAoa) { for (const n of names) { const a = aoaOf(n); if (a && cfpFindHeaderRow(a) >= 0) { dataAoa = a; break; } } }
            // 2) เงินสดต้นงวด = Σ "ต้นงวด" ชีตเดือนแรกสุดที่มีตาราง (Jan./Feb./… ตามลำดับปฏิทิน)
            //    + openingAccts = ยอดต้นงวด "รายบัญชี" (ใช้แยก ใช้ได้/ผูกพัน ตามบัญชี)
            const MON = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May.', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            // ยอดรายบัญชี ต้น/ปลายงวด + Δ รายเดือน จากชีตเดือนทุกเดือน (ปลายงวด=ยอดจริงจากไฟล์ ไม่คำนวณจาก flow)
            const balRes = cfpBuildAcctBalances(aoaOf, MON);
            const opening = balRes.opening || 0, acctBalances = balRes.acctBalances, balMonths = balRes.balMonths;
            // 3) chart of accounts จากชีต "ค่าใช้จ่าย" (รหัส 5 หลัก → ชื่อกลุ่ม) — แก้ในไฟล์แล้ว re-upload ได้
            const cn = names.find(n => /ค่าใช้จ่าย/.test(n));
            const codeGroups = cn ? cfpParseCodeGroups(aoaOf(cn)) : {};
            resolve({ dataAoa, opening, acctBalances, balMonths, codeGroups });
          } catch (err) { reject(err); }
        };
        r.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ')); r.readAsArrayBuffer(file);
      });
    }
    async function onUpload(files) { cfpEraHint = era;
      setUploading(true);
      try {
        const { dataAoa, opening, acctBalances, balMonths, codeGroups } = await readWorkbook(files[0]);
        if (!dataAoa) { toast && toast('ไม่พบชีต "DATA" — ตรวจว่าเป็นไฟล์ WTP-Cash Flow', 'error'); setUploading(false); return; }
        const stm = cfpParseStm(dataAoa);
        if (!stm.txns.length) { toast && toast('อ่านชีต DATA ไม่พบรายการ — ตรวจหัวคอลัมน์ (BANK / Amount / ประเภทกิจกรรม)', 'error'); setUploading(false); return; }
        stm.opening = opening || 0;
        stm.acctBalances = acctBalances || [];   // ยอดรายบัญชี (ต้น/ปลายงวด+Δรายเดือน) จากไฟล์ → แยก ใช้ได้/ผูกพัน ตามบัญชี
        stm.balMonths = balMonths || [];
        const nCg = codeGroups ? Object.keys(codeGroups).length : 0;
        const r = await persist({ stm, catGroups: (stored && stored.catGroups) || null, codeGroups: codeGroups || null, acctTypes: (stored && stored.acctTypes) || null });
        toast && toast('อ่านข้อมูลสำเร็จ · ' + stm.txns.length + ' รายการ' + (opening ? ' · ต้นงวด ' + cfpFmtM(opening) : '') + (nCg ? ' · ' + nCg + ' กลุ่มรหัส' : '') + cfpShareSuffix(r), r.reason === 'error' ? 'error' : undefined);
      } catch (e) { console.error(e); toast && toast('อ่านไฟล์ไม่สำเร็จ: ' + (e.message || e), 'error'); }
      setUploading(false);
    }
    function cfpShareSuffix(r) { if (!r) return ''; if (r.shared) return ' · 🌐 แชร์ให้ทีมแล้ว'; if (r.reason === 'error') return ' · ⚠️ แชร์ส่วนกลางไม่สำเร็จ (บันทึกในเครื่อง · รัน SQL?)'; return ''; }
    // บันทึก local (cache/offline) + push ขึ้นส่วนกลาง (ทุกคนเห็น). คืน {shared, reason}.
    async function persist(obj) {
      const payload = Object.assign({ id: CFP_ROW_ID, uploadedAt: Date.now(), uploadedBy: cfpCurrentUser() }, obj);
      try { localStorage.setItem(CFP_LS, JSON.stringify(payload)); } catch (e) { console.error('[cfp] save', e); }
      setStored(payload);
      if (!cfpCanSync()) return { shared: false, reason: 'local' };
      setShareBusy(true);
      try { await window.WTPData.writeTable(CFP_TABLE, [payload], r => r.id); setSynced(true); setShareBusy(false); return { shared: true }; }
      catch (e) { setShareBusy(false); setSynced(false); console.warn('[cfp] แชร์ส่วนกลางไม่สำเร็จ:', e && e.message); return { shared: false, reason: 'error', message: e && e.message }; }
    }
    function clearData() {
      if (!confirm('ล้างข้อมูล Cash Flow ส่วนกลาง? (ทุกคนจะไม่เห็นจนกว่าจะอัปใหม่)')) return;
      localStorage.removeItem(CFP_LS); setStored(null); setSynced(false);
      if (cfpCanSync()) { setShareBusy(true); window.WTPData.writeTable(CFP_TABLE, [], r => r.id).then(() => { setShareBusy(false); toast && toast('ล้างข้อมูลส่วนกลางแล้ว'); }).catch(e => { setShareBusy(false); toast && toast('ล้างในเครื่องแล้ว แต่ส่วนกลางไม่สำเร็จ: ' + (e && e.message || ''), 'error'); }); }
    }
    // ปรินต์/บันทึก PDF ของแท็บที่กำลังเปิดอยู่ (ใช้ window.print เหมือนหน้า Investor; print CSS ใน styles.css
    //   ซ่อน sidebar/topbar/ปุ่ม/แท็บ + พิมพ์สีตรง). ตั้ง document.title ชั่วคราว → ใช้เป็นชื่อไฟล์ PDF.
    //   แนวกระดาษ (แนวตั้ง/แนวนอน): inject <style> @page size ชั่วคราว (override @page ใน styles.css).
    function printPdf(o) {
      var dir = o || orient;
      var prev = document.title, tabName = (tabs.filter(function (t) { return t[0] === tab; })[0] || ['', ''])[1].replace(/^[^ ]+ /, '');
      try { document.title = 'WaterPOG-CashFlow' + (model ? '-' + model.periodLabel : '') + (tabName ? '-' + tabName : ''); } catch (e) { }
      var st = document.getElementById('cfp-print-orient');
      if (!st) { st = document.createElement('style'); st.id = 'cfp-print-orient'; document.head.appendChild(st); }
      st.textContent = '@media print{@page{size:A4 ' + (dir === 'landscape' ? 'landscape' : 'portrait') + ';margin:10mm;}}';
      window.print();
      setTimeout(function () { try { document.title = prev; } catch (e) { } }, 1000);
    }
    function setOrientPersist(v) { setOrient(v); try { localStorage.setItem('wtp-cfp-print-orient', v); } catch (e) { } }

    const pageWrap = { background: 'transparent', borderRadius: 20, padding: '20px 22px 30px', minHeight: 400, color: C.ink };
    const card = { background: C.card, backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,.6)', borderRadius: 18, padding: '16px 20px', boxShadow: C.shadow, marginBottom: 16 };
    const secTitle = { fontSize: 15, fontWeight: 700, margin: '0 0 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' };
    const tabs = [['overview', '📊 ภาพรวม'], ['activity', '🔬 สรุปกิจกรรม'], ['statement', '📑 งบกระแสเงินสด'], ['explorer', '🔎 รายการ (Transaction Explorer)']];

    return (
      <div className="cfp-page present-page" style={pageWrap}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.4px' }}>Executive Cash Flow Dashboard</div>
            <div style={{ fontSize: 13, color: C.mut, marginTop: 3 }}>Water POG{model ? ' · งวด ' + model.periodLabel + ' · ' + model.txnCount + ' รายการ · ' + model.accounts.length + ' บัญชี' : ' · อัปโหลดไฟล์เพื่อเริ่ม'}</div>
            {model && (
              <div style={{ fontSize: 12, marginTop: 6, display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                {synced
                  ? <span style={{ background: '#e3edfb', color: C.primaryD, border: '1px solid #c2d9f7', borderRadius: 99, padding: '2px 10px', fontWeight: 700 }}>🌐 ข้อมูลส่วนกลาง · ทุกคนเห็นชุดนี้</span>
                  : <span style={{ background: '#fff5e6', color: '#a8620a', border: '1px solid #f0d6a8', borderRadius: 99, padding: '2px 10px', fontWeight: 700 }} title="ข้อมูลนี้ยังอยู่แค่ในเครื่องนี้ — อัปโหลด (หรือกดโหลดล่าสุด) เพื่อแชร์/ดึงชุดส่วนกลาง">📌 ข้อมูลในเครื่อง (ยังไม่แชร์)</span>}
                {stored && stored.uploadedBy && <span style={{ color: C.faint }}>อัปโดย {stored.uploadedBy}{stored.uploadedAt ? ' · ' + cfpWhen(stored.uploadedAt) : ''}</span>}
                {shareBusy && <span style={{ color: C.faint }}>⏳ กำลัง sync…</span>}
              </div>
            )}
          </div>
          <div className="no-print" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {cfpCanSync() && <button onClick={refreshShared} disabled={shareBusy} className="no-present" title="ดึงข้อมูลส่วนกลางล่าสุด (ที่คนอื่นอัปไว้)" style={{ background: '#fff', color: C.primaryD, border: '1px solid ' + C.line, borderRadius: 11, padding: '9px 12px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>{shareBusy ? '⏳' : '↻'} โหลดล่าสุด</button>}
            {model && (<span style={{ display: 'inline-flex', alignItems: 'stretch', border: '1px solid ' + C.line, borderRadius: 11, overflow: 'hidden', background: '#fff' }}>
              <select value={orient} onChange={e => setOrientPersist(e.target.value)} title="แนวกระดาษเมื่อปรินต์" style={{ border: 0, borderRight: '1px solid ' + C.line, padding: '0 8px', fontSize: 13, fontFamily: 'inherit', background: '#fff', color: C.ink, cursor: 'pointer' }}><option value="portrait">แนวตั้ง</option><option value="landscape">แนวนอน</option></select>
              <button onClick={() => printPdf()} title="ปรินต์ / บันทึกเป็น PDF (แท็บที่เปิดอยู่)" style={{ background: '#fff', color: C.primaryD, border: 0, padding: '9px 12px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>🖨️ ปรินต์ PDF</button>
            </span>)}
            {canEdit && (<React.Fragment>
              <select value={era} onChange={e => setEra(e.target.value)} className="no-present" title="ปีในไฟล์ข้อมูล (พ.ศ./ค.ศ.)" style={{ border: '1px solid ' + C.line, borderRadius: 11, padding: '0 10px', fontSize: 13, fontFamily: 'inherit', background: '#fff', color: C.ink, cursor: 'pointer' }}><option value="auto">ปี: อัตโนมัติ</option><option value="be">ไฟล์เป็น พ.ศ.</option><option value="ce">ไฟล์เป็น ค.ศ.</option></select><button onClick={() => fileRef.current && fileRef.current.click()} disabled={uploading} className="no-present" style={{ background: C.primary, color: '#fff', border: 0, borderRadius: 11, padding: '9px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: C.shadow }}>{uploading ? '⏳ กำลังอ่าน…' : (model ? '⬆️ อัปเดตไฟล์' : '⬆️ อัปโหลดไฟล์ Cash Flow')}</button>
              {model && <button onClick={clearData} className="no-present" style={{ background: '#fff', color: C.mut, border: '1px solid ' + C.line, borderRadius: 11, padding: '9px 12px', fontSize: 14, cursor: 'pointer' }}>ล้าง</button>}
              <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={e => { if (e.target.files.length) onUpload(Array.from(e.target.files)); e.target.value = ''; }} />
            </React.Fragment>)}
          </div>
        </div>

        {!model && (
          <div style={{ ...card, textAlign: 'center', padding: '48px 20px' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>📊</div>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>ยังไม่มีข้อมูล</div>
            <div style={{ fontSize: 14, color: C.mut, maxWidth: 520, margin: '0 auto 18px', lineHeight: 1.6 }}>อัปโหลดไฟล์ <b>WTP-Cash Flow 20XX.xlsx</b> (ไฟล์เดียว) — ระบบอ่านชีต <b>DATA</b> (รายการที่จัดหมวด/กิจกรรม/รับ-จ่ายแล้ว) แล้วสร้างแดชบอร์ด · เงินสดต้นงวดอ่านจากชีตเดือน</div>
            {canEdit ? <button onClick={() => fileRef.current && fileRef.current.click()} style={{ background: C.primary, color: '#fff', border: 0, borderRadius: 11, padding: '11px 22px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>เลือกไฟล์…</button> : <div style={{ fontSize: 13, color: C.faint }}>บัญชีนี้ดูได้อย่างเดียว — ให้ผู้ดูแลอัปโหลดไฟล์</div>}
          </div>
        )}

        {model && <React.Fragment>
          {/* tab nav */}
          <div className="no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
            {tabs.map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} style={{ border: '1px solid ' + (tab === k ? 'transparent' : C.line), background: tab === k ? 'linear-gradient(135deg,#2a6fdb,#1a4490)' : '#fff', color: tab === k ? '#fff' : C.mut, fontWeight: 700, fontSize: 14, padding: '9px 16px', borderRadius: 12, cursor: 'pointer', boxShadow: tab === k ? '0 6px 16px rgba(31,86,184,.3)' : 'none' }}>{label}</button>
            ))}
          </div>

          {tab === 'overview' && <React.Fragment>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14, marginBottom: 16 }}>
              <CfpKpiHero label="เงินสดต้นงวด" value={cfpFmtM(model.opening)} />
              <CfpKpiHero label="กระแสเงินสดสุทธิ" value={cfpFmtSigned(model.net)} color={model.net < 0 ? C.neg : C.pos} sub={model.net >= 0 ? 'เงินสดเพิ่มขึ้น' : 'เงินสดลดลง'} />
              <CfpKpiHero label="เงินสดปลายงวด" value={cfpFmtM(model.ending)} color={C.primaryD} sub={(model.net >= 0 ? '▲ ' : '▼ ') + cfpFmtSigned(model.net) + ' จากต้นงวด'} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 14, marginBottom: 16 }}>
              <CfpKpiAct k="op" value={model.acts.op.net} onClick={() => openAct('op')} sub={watchSub('op')} />
              <CfpKpiAct k="inv" value={model.acts.inv.net} onClick={() => openAct('inv')} sub={watchSub('inv')} />
              <CfpKpiAct k="fin" value={model.acts.fin.net} onClick={() => openAct('fin')} sub={watchSub('fin')} />
            </div>
            {model.summary && model.summary.net != null && (
              <div style={{ fontSize: 12, color: Math.abs(model.summary.net - model.net) < 1 ? C.pos : '#b8860b', marginBottom: 16, padding: '8px 14px', background: Math.abs(model.summary.net - model.net) < 1 ? C.posBg : '#fff7e6', borderRadius: 12, fontWeight: 600, display: 'inline-block' }}>{Math.abs(model.summary.net - model.net) < 1 ? '✓ STM ตรงกับงบสรุป — สุทธิ ' + cfpFmtB(model.net) : '⚠ STM ' + cfpFmtB(model.net) + ' · งบสรุป ' + cfpFmtB(model.summary.net)}</div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(370px,1fr))', gap: 14, marginBottom: 16, alignItems: 'start' }}>
              <div className="cfp-card" style={{ ...card, marginBottom: 0 }}><div style={secTitle}><span>💧 เงินสดเดินทางอย่างไร</span><span style={{ fontSize: 11, fontWeight: 500, color: C.mut, background: C.soft, padding: '3px 10px', borderRadius: 20 }}>กดแท่งกิจกรรมเพื่อดูรายการ</span></div><CfpWaterfall model={model} onPick={openAct} /></div>
              <div className="cfp-card" style={{ ...card, marginBottom: 0 }}><div style={secTitle}><span>📈 กระแสเงินสดรายเดือน (แยกตามกิจกรรม)</span><span style={{ display: 'flex', gap: 12, fontSize: 11, color: C.mut }}><span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: ACT_COLOR.op, marginRight: 4, verticalAlign: 'middle' }} />ดำเนินงาน</span><span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: ACT_COLOR.inv, marginRight: 4, verticalAlign: 'middle' }} />ลงทุน</span><span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: ACT_COLOR.fin, marginRight: 4, verticalAlign: 'middle' }} />จัดหาเงิน</span></span></div><CfpMonthly model={model} onPick={openMonth} /></div>
            </div>
            <CfpCashUsable model={model} acctTypes={stored && stored.acctTypes} canEdit={canEdit} onSave={saveAcctTypes} />
            <div style={secTitle}><span>🤖 Executive Insights</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: 14, marginBottom: 8 }}>
              {model.acts.fin.net > 0 && model.acts.op.net < 0 && (<div className="cfp-card" style={{ ...card, marginBottom: 0, background: 'linear-gradient(135deg,rgba(42,111,219,.12),rgba(31,86,184,.14))' }}><div style={{ fontSize: 12, fontWeight: 700, color: C.primaryD }}>🔁 อยู่ได้ด้วยการจัดหาเงิน</div><div style={{ fontSize: 15, fontWeight: 800, marginTop: 7 }}>ดำเนินงาน {cfpFmtM(model.acts.op.net)}</div><div style={{ fontSize: 11, color: C.mut, marginTop: 3 }}>จัดหาเงินหนุน {cfpFmtSigned(model.acts.fin.net)}</div></div>)}
              {model.interest > 0 && (<div className="cfp-card" style={{ ...card, marginBottom: 0, background: 'linear-gradient(135deg,rgba(42,111,219,.12),rgba(31,86,184,.14))' }}><div style={{ fontSize: 12, fontWeight: 700, color: C.primaryD }}>％ ดอกเบี้ยจ่าย</div><div style={{ fontSize: 15, fontWeight: 800, marginTop: 7 }}>{cfpFmtM(model.interest)}</div><div style={{ fontSize: 11, color: C.mut, marginTop: 3 }}>{model.payroll > 0 ? '≈ ' + Math.round(model.interest / model.payroll * 100) + '% ของเงินเดือน (' + cfpFmtM(model.payroll) + ')' : 'ภาระดอกเบี้ยรวมทั้งงวด'}</div></div>)}
              {model.topInflow.amt > 0 && model.inflowTotal > 0 && (<div className="cfp-card" style={{ ...card, marginBottom: 0, background: 'linear-gradient(135deg,rgba(42,111,219,.12),rgba(31,86,184,.14))' }}><div style={{ fontSize: 12, fontWeight: 700, color: C.primaryD }}>📦 รายได้กระจุกตัว</div><div style={{ fontSize: 15, fontWeight: 800, marginTop: 7 }}>{Math.round(model.topInflow.amt / model.inflowTotal * 100)}% จากสินค้าหลัก</div><div style={{ fontSize: 11, color: C.mut, marginTop: 3 }}>{model.topInflow.name.replace(/^เงินสดรับจากการขาย-?/, '')} ({cfpFmtM(model.topInflow.amt)})</div></div>)}
            </div>
            {(function () {
              const ranked = model.allTxns.filter(t => t.actKey !== 'transfer' && t.actKey !== 'other').slice().sort((a, b) => Math.abs(b.flow) - Math.abs(a.flow)).slice(0, topN);
              return (
                <div className="cfp-card" style={{ ...card, marginTop: 16 }}>
                  <div style={secTitle}><span>🏆 รายการเงินสดสูงสุด (Top {topN})</span>
                    <select value={topN} onChange={e => setTopN(+e.target.value)} style={{ padding: '7px 11px', border: '1px solid ' + C.line, borderRadius: 11, fontSize: 13, fontFamily: 'inherit', background: '#fff', color: C.ink }}>
                      <option value={10}>10 อันดับ</option><option value={20}>20 อันดับ</option><option value={50}>50 อันดับ</option>
                    </select>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
                      <thead><tr style={{ color: C.mut, textAlign: 'left', fontSize: 12 }}>
                        <th style={{ padding: '7px 8px', fontWeight: 700, width: 34 }}>#</th>
                        <th style={{ padding: '7px 8px', fontWeight: 700, width: 92 }}>วันที่</th>
                        <th style={{ padding: '7px 8px', fontWeight: 700 }}>รายการ</th>
                        <th style={{ padding: '7px 8px', fontWeight: 700, width: 64 }}>บัญชี</th>
                        <th style={{ padding: '7px 8px', fontWeight: 700, width: 78 }}>กิจกรรม</th>
                        <th style={{ padding: '7px 8px', fontWeight: 700, width: 120, textAlign: 'right' }}>จำนวน</th>
                      </tr></thead>
                      <tbody>
                        {ranked.map((t, i) => (
                          <tr key={i} style={{ borderTop: '1px solid ' + C.line }}>
                            <td style={{ padding: '6px 8px', color: C.faint, fontWeight: 700 }}>{i + 1}</td>
                            <td style={{ padding: '6px 8px', color: C.mut, whiteSpace: 'nowrap' }}>{cfpThaiDate(t.iso)}</td>
                            <td style={{ padding: '6px 8px', color: C.ink, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.note}>{t.note || t.category}</td>
                            <td style={{ padding: '6px 8px' }}><CfpBankPill acct={t.account} /></td>
                            <td style={{ padding: '6px 8px' }}><CfpTag k={t.actKey} /></td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: t.flow < 0 ? C.neg : C.pos, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{cfpFmtB(t.flow)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </React.Fragment>}

          {tab === 'activity' && <React.Fragment>
            <div style={{ ...secTitle, margin: '0 2px 12px' }}><span>🔬 สรุปกิจกรรม</span><span style={{ fontSize: 11, fontWeight: 500, color: C.mut, background: C.soft, padding: '3px 10px', borderRadius: 20 }}>แต่ละกิจกรรมมีอะไร + จุดเฝ้าระวัง · กดหมวด → รายการจริง</span></div>
            <CfpActivityDetail model={model} k="op" onCat={openCat} onAll={() => openAct('op')} />
            <CfpActivityDetail model={model} k="inv" onCat={openCat} onAll={() => openAct('inv')} />
            <CfpActivityDetail model={model} k="fin" onCat={openCat} onAll={() => openAct('fin')} />
          </React.Fragment>}

          {tab === 'statement' && (
            <div className="cfp-card" style={card}><div style={secTitle}><span>📑 งบกระแสเงินสด (รายเดือน)</span><span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{canEdit && <button onClick={() => setGroupsOpen(true)} className="no-print no-present" title="รวมหมวดย่อยเป็นกลุ่มงบให้กระชับ" style={{ cursor: 'pointer', border: '1px solid ' + C.line, background: '#fff', color: C.primaryD, borderRadius: 10, padding: '6px 12px', fontSize: 13, fontWeight: 700 }}>⚙ จัดหมวด{stored && stored.catGroups && stored.catGroups.length ? ' (' + stored.catGroups.length + ')' : ''}</button>}<span style={{ fontSize: 11, fontWeight: 500, color: C.mut, background: C.soft, padding: '3px 10px', borderRadius: 20 }}>{stored && stored.catGroups && stored.catGroups.length ? 'จัดเป็นกลุ่ม' : 'สังเคราะห์จากรายการ'} · กดแถว/ช่อง → รายการจริง</span></span></div><CfpStatementTable model={model} onPick={openStmt} /></div>
          )}

          {tab === 'explorer' && (
            <div className="cfp-card" style={card}><div style={secTitle}><span>🔎 Transaction Explorer — รายการจากชีต DATA</span></div><CfpExplorer model={model} toast={toast} /></div>
          )}

          <div style={{ fontSize: 11, color: C.faint, margin: '6px 2px 4px' }}>ข้อมูลจากชีต DATA (WTP-Cash Flow) · งบกระแสเงินสดสังเคราะห์จากรายการ · {synced ? 'ข้อมูลส่วนกลาง (ทุกคนเห็น)' : 'ข้อมูลในเครื่อง'} · วันที่แสดงเป็น ค.ศ. · อัปเดต {stored && stored.uploadedAt ? new Date(stored.uploadedAt).toLocaleString('th-TH-u-ca-gregory') : '-'}</div>
        </React.Fragment>}

        {modal && <CfpModal title={modal.title} subtitle={modal.subtitle} txns={modal.txns} breakdown={modal.breakdown} onClose={() => setModal(null)} />}
        {groupsOpen && model && <CfpGroupModal model={model} groups={(stored && stored.catGroups) || []} onClose={() => setGroupsOpen(false)} onSave={saveGroups} />}
      </div>
    );
  }

  window.CashFlowPresentPage = CashFlowPresentPage;
})();
