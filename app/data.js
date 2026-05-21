// Water POG Financial Dashboard – mock data store with localStorage persistence.
// v6: expanded schema for projects (periods, dates, allocBudget, signedValue, assignee),
//     invoices (jobNo mapping, follow-up log, contact info, actual receive),
//     and renamed psNotes → pvVouchers (Payment Voucher).

(function () {
  const STORAGE_KEY = 'wtp-fin-data-v6';

  const id = (() => { let n = 1000; return () => 'id_' + (++n).toString(36); })();

  // Helper: days between two ISO dates
  const daysBetween = (a, b) => {
    if (!a || !b) return null;
    return Math.round((new Date(b) - new Date(a)) / (1000 * 60 * 60 * 24));
  };

  const seed = () => ({
    meta: {
      companyName: 'บริษัท วอเทอร์ป๊อก จำกัด',
      shortName: 'Water POG',
      asOf: '2026-05-18',
      year: 2026,
      currency: 'THB',
    },

    // ── 02. Pipeline summary (War Room) ─────────────────────────────────────
    pipeline: {
      waitingSign:    { count: 10, gross: 35118000.00,  debt: 16649500.00,  net: 18468500.00 },
      signedWip:      { count: 23, gross: 42952000.00,  debt: 8818806.05,   net: 34133193.95 },
      invoicedOutstanding: { count: 4, gross: 10154200.00, debt: 2809200.00, net: 7345000.00 },
      totalProjectValue: 247453578.76,
      invoiceBroughtForward: 10154200.00,
      signedNotDelivered:    35118000.00,
      notSigned:             47900000.00,
      totalDebt:             84498100.00,
      usableNet:             162955478.76,
    },

    // ── War Room P1 / P2 (unchanged) ────────────────────────────────────────
    warroomP1: {
      topKpis: { totalInvoices: 10, estimatedCashInflow: 35118000.00, estimatedDebt: 16649500.00, netProjection: 18468500.00 },
      thisMonthNetProjection: 20968200.00,
      nextMonthNetProjection: 18468500.00,
      outstandingSummary: {
        systemTotal:        { count: 14, gross: 45272200.00, debt: -19458700.00, net: 25813500.00 },
        thisMonthTracked:   { count: 4,  gross: 10154200.00, debt: -2809200.00,  net: 7345000.00 },
        nextMonthRollover:  { count: 10, gross: 35118000.00, debt: -16649500.00, net: 18468500.00 },
      },
      outstandingThisMonthByTransfer: [
        { type: 'ไม่โอนสิทธิรับเงิน', count: 1, gross: 2154200.00, debt: 0,           net: 2154200.00 },
        { type: 'โอนสิทธิรับเงิน',    count: 3, gross: 8000000.00, debt: -2809200.00, net: 5190800.00 },
      ],
      outstandingThisMonthTotal: { count: 4, gross: 10154200.00, debt: -2809200.00, net: 7345000.00 },
      outstandingByTransfer: [
        { type: 'ไม่โอนสิทธิรับเงิน', count: 3,  gross: 5000000.00,  debt: -2000000.00,  net: 3000000.00 },
        { type: 'โอนสิทธิรับเงิน',    count: 7,  gross: 30118000.00, debt: -14649500.00, net: 15468500.00 },
      ],
      outstandingTotal: { count: 10, gross: 35118000.00, debt: -16649500.00, net: 18468500.00 },
      wipByTransfer: [
        { type: 'ไม่โอนสิทธิรับเงิน', count: 12, gross: 21839603.76,  debt: 0,            net: 21839603.76 },
        { type: 'โอนสิทธิรับเงิน',    count: 71, gross: 182265900.00, debt: -65039400.00, net: 117226500.00 },
      ],
      wipTotal: { count: 83, gross: 204105503.76, debt: -65039400.00, net: 139066103.76 },
    },
    warroomP2: {
      totalProjectValue:      247453578.76,
      invoiceForwardTotal:    45272200.00,
      wipValue:               154281378.76,
      unsignedTotal: { count: 10, value: 47900000.00 },
      signedTotal:   { count: 0,  value: 199553578.76 },
    },

    // ── YTD / weekly / monthly ──────────────────────────────────────────────
    ytdRevenue: [
      { month: 'มกราคม',   en: 'Jan', count: 13, gross: 35644984.34, debt: 0,           net: 35644984.34 },
      { month: 'กุมภาพันธ์', en: 'Feb', count: 16, gross: 26170400.00, debt: -8898400.00, net: 17272000.00 },
      { month: 'มีนาคม',   en: 'Mar', count: 15, gross: 32846184.32, debt: -13363100.00,net: 19483084.32 },
      { month: 'เมษายน',   en: 'Apr', count: 23, gross: 42952000.00, debt: -8818806.05, net: 34133193.95 },
      { month: 'พฤษภาคม', en: 'May', count: 4,  gross: 10814000.00, debt: -5963196.05, net: 4850803.95  },
    ],
    weeklyExpectedReceipt: [
      { week: 1, count: 2, gross: 7554200.00,  debt: -2159200.00, net: 5395000.00 },
      { week: 2, count: 2, gross: 2600000.00,  debt: -650000.00,  net: 1950000.00 },
      { week: 3, count: 12, gross: 21839603.76, debt: 0,          net: 21839603.76 },
      { week: 4, count: 0, gross: 0, debt: 0, net: 0 },
      { week: 5, count: 0, gross: 0, debt: 0, net: 0 },
    ],
    monthlyForecast: [
      { month: 'พฤษภาคม', en: 'May',  pctOfRemaining: 14, invIssued: 10154200.00, signed: 0, unsigned: 0, debt: -2809200.00,   netUsable: 7345000.00 },
      { month: 'มิถุนายน', en: 'Jun', pctOfRemaining: 11, invIssued: 35118000.00, signed: 0, unsigned: 0, debt: -16649500.00,  netUsable: 18468500.00 },
      { month: 'กรกฎาคม', en: 'Jul', pctOfRemaining: 13, invIssued: 0,           signed: 23450300.00, unsigned: 0,         debt: -11366800.00, netUsable: 20524900.00 },
      { month: 'สิงหาคม', en: 'Aug', pctOfRemaining: 16, invIssued: 0,           signed: 41105000.00, unsigned: 0,         debt: -17654700.00, netUsable: 23450300.00 },
      { month: 'กันยายน', en: 'Sep', pctOfRemaining: 24, invIssued: 0,           signed: 48739478.76, unsigned: 0,         debt: -23057900.00, netUsable: 25681578.76 },
      { month: 'ตุลาคม',  en: 'Oct', pctOfRemaining: 5,  invIssued: 0,           signed: 13105200.00, unsigned: 28740000,  debt: -3240000.00,  netUsable: 38605200.00 },
      { month: 'พฤศจิกายน',en: 'Nov',pctOfRemaining: 18, invIssued: 0,           signed: 19440000.00, unsigned: 19160000, debt: -9720000.00,  netUsable: 28880000.00 },
      { month: 'ธันวาคม',  en: 'Dec', pctOfRemaining: 0,  invIssued: 0,           signed: 0,           unsigned: 0,         debt: 0,            netUsable: 0 },
    ],

    daily: {
      asOfDate: '2026-05-15',
      ytdAccum:   { count: 77, value: 149332093.66 },
      mtdAccum:   { count: 5,  value: 11045525.00 },
      todayAccum: { count: 1,  value: 231525.00 },
      invoicesToday: [
        { id: id(), no: 1, code: 'PP064-STIIS', name: 'บ้านพรุกง ม.2 ต.วังใหญ่ อ.เทพา จ.สงขลา', period: 1, amount: 231525.00, receivedAt: '2026-05-15' },
      ],
    },

    cashFlow: {
      month: 'May 2026',
      bf: 2924226.17, planTotal: 28300000.00, actualPaid: 7597582.34, paidPct: 26.85,
      revInflow: 4805469, loanReceived: 1473275, loanLine: 3757661, loanRemain: 4600000, finalNet: -8504440,
      inflow: [
        { key: 'bf',      label: 'เงินสดคงเหลือยกมา',          actual:[2924226.17, 0,0,0,0], plan:[0,0,0,0,0] },
        { key: 'project', label: 'รับเงินโครงการ',              actual:[2924226.17, 0,0,0,0], plan:[0, 8500523.50, 0, 0, 0] },
        { key: 'loan',    label: 'เงินกู้/สินเชื่อหมุนเวียน',     actual:[0,0,0,0,0],            plan:[0, 3200000, 0, 0, 0] },
      ],
      outflow: [
        { key: 'op',   label: '1. ค่าใช้จ่ายดำเนินงานรายสัปดาห์', plan:[1500000,1500000,1500000,1800000,1500000], actual:[1808097.83, 251317.48, 0, 0, 0] },
        { key: 'proj', label: '2. ค่าใช้จ่ายโครงการ/ติดตั้ง',     plan:[3000000,3000000,3000000,3000000,3000000], actual:[2478115.64, 0, 0, 0, 0] },
        { key: 'fin',  label: '3. ต้นทุนทางการเงินและดอกเบี้ย',  plan:[1320000,1160000,160000,1000000,3060000],  actual:[38393.86, 0, 3021657.53, 0, 0] },
        { key: 'misc', label: '4. ค่าใช้จ่ายเบ็ดเตล็ดและเงินเดือน',plan:[0,0,3300000,0,0],                          actual:[0,0,0,0,0] },
      ],
      closing: [-1331906.41, -6279476.50, -3584977.04, -6599615.67, -3300000.00],
      nowWeek: 2,
    },

    // ────────────────────────────────────────────────────────────────────────
    // RAW_PROJECT — โครงการทั้งหมด (ข้อมูลฝั่งโครงการ)
    // ────────────────────────────────────────────────────────────────────────
    projects: [
      {
        id: id(),
        code: 'PP064-STIIS',                                  // 1 รหัสโครงการ (= jobNo)
        name: 'บ้านพรุกง ม.2 ต.วังใหญ่ อ.เทพา จ.สงขลา',         // 2 ชื่อโครงการ
        startDate:  '2025-11-25',                              // 3 Start
        finishDate: '2026-05-15',                              // 4 Finish
        allocBudget:  4800000,                                 // 6 เงินตามใบจัดสรร
        signedValue:  4630500,                                 // 7 มูลค่าสัญญาที่เซ็น (รวม VAT)
        status: 'invoiced', delivery: 'received',
        value: 4630500, debt: 0, net: 4630500, expectedReceive: '2026-05-15', signedAt: '2025-11-20',
        startNotice: '2025-12-01',                             // แจ้งเข้าดำเนินการ
        timeStop: 0,                                           // หยุดเวลา (วัน)
        periods: [
          { period: 1, pctPogStank: 100, pctPogDrink: 0, value: 231525, deliveryDate: '2026-05-12', inspectionDoc: 'IS-PP064-01', payment: 231525, summaryPayment: 231525, paymentStatus: 'paid', receiveDate: '2026-05-15' },
        ],
      },
      {
        id: id(), code: 'PP073-AYT', name: 'อาคารสำนักงาน เทศบาลตำบลอ่าวยาง จ.พังงา',
        startDate: '2025-10-10', finishDate: '2026-08-30',
        allocBudget: 19200000, signedValue: 18900000,
        status: 'invoiced', delivery: 'pending',
        value: 18900000, debt: 4200000, net: 14700000, expectedReceive: '2026-05-22', signedAt: '2025-10-05',
        startNotice: '2025-10-20', timeStop: 0,
        periods: [
          { period: 1, pctPogStank: 60, pctPogDrink: 0, value: 9450000, deliveryDate: '2026-03-15', inspectionDoc: 'IS-PP073-01', payment: 9450000, summaryPayment: 9450000, paymentStatus: 'paid', receiveDate: '2026-04-02' },
          { period: 2, pctPogStank: 100, pctPogDrink: 0, value: 9450000, deliveryDate: '2026-05-05', inspectionDoc: '—', payment: 4200000, summaryPayment: 4200000, paymentStatus: 'pending_inspection', receiveDate: null },
        ],
      },
      {
        id: id(), code: 'PP081-NKM', name: 'ระบบประปา ต.นาคำ อ.เมือง จ.หนองคาย',
        startDate: '2025-09-15', finishDate: '2026-06-30',
        allocBudget: 12800000, signedValue: 12500000,
        status: 'invoiced', delivery: 'delivered',
        value: 12500000, debt: 3500000, net: 9000000, expectedReceive: '2026-05-28', signedAt: '2025-09-12',
        startNotice: '2025-09-25', timeStop: 0,
        periods: [
          { period: 1, pctPogStank: 30, pctPogDrink: 70, value: 3750000, deliveryDate: '2025-12-20', inspectionDoc: 'IS-PP081-01', payment: 3750000, summaryPayment: 3750000, paymentStatus: 'paid', receiveDate: '2026-01-15' },
          { period: 2, pctPogStank: 30, pctPogDrink: 70, value: 5250000, deliveryDate: '2026-03-10', inspectionDoc: 'IS-PP081-02', payment: 5250000, summaryPayment: 5250000, paymentStatus: 'paid', receiveDate: '2026-03-28' },
          { period: 3, pctPogStank: 40, pctPogDrink: 0, value: 3500000, deliveryDate: '2026-05-05', inspectionDoc: 'IS-PP081-03', payment: 3500000, summaryPayment: 3500000, paymentStatus: 'tracking', receiveDate: null },
        ],
      },
      {
        id: id(), code: 'PP084-SKN', name: 'ปรับปรุงท่อจ่ายน้ำ ม.7 ต.สำโรง จ.อุบลฯ',
        startDate: '2026-02-01', finishDate: '2026-07-30',
        allocBudget: 8800000, signedValue: 8550000,
        status: 'signed_wip', delivery: 'in_progress',
        value: 8550000, debt: 1800000, net: 6750000, expectedReceive: '2026-07-10', signedAt: '2026-01-22',
        startNotice: '2026-02-05', timeStop: 0,
        periods: [
          { period: 1, pctPogStank: 100, pctPogDrink: 0, value: 4275000, deliveryDate: null, inspectionDoc: null, payment: 0, summaryPayment: 0, paymentStatus: 'in_progress', receiveDate: null },
          { period: 2, pctPogStank: 100, pctPogDrink: 0, value: 4275000, deliveryDate: null, inspectionDoc: null, payment: 0, summaryPayment: 0, paymentStatus: 'in_progress', receiveDate: null },
        ],
      },
      {
        id: id(), code: 'PP088-MTK', name: 'ระบบส่งน้ำ ต.มะตูม อ.พรหมพิราม จ.พิษณุโลก',
        startDate: '2026-02-10', finishDate: '2026-09-30',
        allocBudget: 24000000, signedValue: 23450300,
        status: 'signed_wip', delivery: 'in_progress',
        value: 23450300, debt: 11366800, net: 12083500, expectedReceive: '2026-07-25', signedAt: '2026-02-04',
        startNotice: '2026-02-15', timeStop: 15,
        periods: [
          { period: 1, pctPogStank: 50, pctPogDrink: 50, value: 11725150, deliveryDate: null, inspectionDoc: null, payment: 0, summaryPayment: 0, paymentStatus: 'in_progress', receiveDate: null },
          { period: 2, pctPogStank: 50, pctPogDrink: 50, value: 11725150, deliveryDate: null, inspectionDoc: null, payment: 0, summaryPayment: 0, paymentStatus: 'in_progress', receiveDate: null },
        ],
      },
      {
        id: id(), code: 'PP091-CRI', name: 'ก่อสร้างประปา ม.4 ต.ป่าก่อดำ อ.แม่ลาว จ.เชียงราย',
        startDate: '2026-03-01', finishDate: '2026-10-30',
        allocBudget: 19200000, signedValue: 18900000,
        status: 'signed_wip', delivery: 'in_progress',
        value: 18900000, debt: 6500000, net: 12400000, expectedReceive: '2026-08-18', signedAt: '2026-02-28',
        startNotice: '2026-03-08', timeStop: 0,
        periods: [
          { period: 1, pctPogStank: 100, pctPogDrink: 0, value: 9450000, deliveryDate: null, inspectionDoc: null, payment: 0, summaryPayment: 0, paymentStatus: 'in_progress', receiveDate: null },
          { period: 2, pctPogStank: 100, pctPogDrink: 0, value: 9450000, deliveryDate: null, inspectionDoc: null, payment: 0, summaryPayment: 0, paymentStatus: 'in_progress', receiveDate: null },
        ],
      },
      {
        id: id(), code: 'PP094-PYO', name: 'ระบบประปาหมู่บ้าน ต.ดอกคำใต้ จ.พะเยา',
        startDate: '2026-03-15', finishDate: '2026-11-15',
        allocBudget: 13400000, signedValue: 13105200,
        status: 'signed_wip', delivery: 'pending',
        value: 13105200, debt: 3240000, net: 9865200, expectedReceive: '2026-10-12', signedAt: '2026-03-08',
        startNotice: '2026-03-20', timeStop: 0,
        periods: [
          { period: 1, pctPogStank: 100, pctPogDrink: 0, value: 6552600, deliveryDate: null, inspectionDoc: null, payment: 0, summaryPayment: 0, paymentStatus: 'in_progress', receiveDate: null },
          { period: 2, pctPogStank: 100, pctPogDrink: 0, value: 6552600, deliveryDate: null, inspectionDoc: null, payment: 0, summaryPayment: 0, paymentStatus: 'in_progress', receiveDate: null },
        ],
      },
      {
        id: id(), code: 'PP097-SKW', name: 'ระบบส่งน้ำดิบ ต.บางพระ อ.ศรีราชา จ.ชลบุรี',
        startDate: '2026-04-01', finishDate: '2026-12-15',
        allocBudget: 19800000, signedValue: 19440000,
        status: 'signed_wip', delivery: 'in_progress',
        value: 19440000, debt: 9720000, net: 9720000, expectedReceive: '2026-11-05', signedAt: '2026-03-25',
        startNotice: '2026-04-05', timeStop: 0,
        periods: [
          { period: 1, pctPogStank: 50, pctPogDrink: 50, value: 9720000, deliveryDate: null, inspectionDoc: null, payment: 0, summaryPayment: 0, paymentStatus: 'in_progress', receiveDate: null },
          { period: 2, pctPogStank: 50, pctPogDrink: 50, value: 9720000, deliveryDate: null, inspectionDoc: null, payment: 0, summaryPayment: 0, paymentStatus: 'in_progress', receiveDate: null },
        ],
      },
      {
        id: id(), code: 'PP101-PTL', name: 'ปรับปรุงระบบประปา ต.เพชรเมืองทอง อ.เมือง จ.ปัตตานี',
        startDate: null, finishDate: null,
        allocBudget: 29000000, signedValue: 28740000,
        status: 'waiting_sign', delivery: 'awaiting',
        value: 28740000, debt: 13420000, net: 15320000, expectedReceive: '2026-10-30', signedAt: null,
        startNotice: null, timeStop: 0,
        periods: [],
      },
      {
        id: id(), code: 'PP103-NSN', name: 'ระบบประปาหมู่บ้าน ต.หนองสองห้อง จ.ขอนแก่น',
        startDate: null, finishDate: null,
        allocBudget: 19500000, signedValue: 19160000,
        status: 'waiting_sign', delivery: 'awaiting',
        value: 19160000, debt: 3229500, net: 15930500, expectedReceive: '2026-11-22', signedAt: null,
        startNotice: null, timeStop: 0,
        periods: [],
      },
    ],

    // ────────────────────────────────────────────────────────────────────────
    // RAW_PROJECT_FINANCE — ข้อมูลฝั่งการเงิน (โอนสิทธิ + ภาระหนี้)
    //   key = code (jobNo). อ้างจาก projects.code
    // ────────────────────────────────────────────────────────────────────────
    projectFinance: [
      { id: id(), code: 'PP064-STIIS', assignee: '—',                              transferRights: false, debt: 0,        debtNote: '' },
      { id: id(), code: 'PP073-AYT',   assignee: 'ธ.กสิกรไทย',                       transferRights: true,  debt: 4200000,  debtNote: 'โอนสิทธิเข้า OD' },
      { id: id(), code: 'PP081-NKM',   assignee: 'ธ.กรุงเทพ',                        transferRights: true,  debt: 3500000,  debtNote: 'PN PS2026-014' },
      { id: id(), code: 'PP084-SKN',   assignee: '—',                              transferRights: false, debt: 1800000,  debtNote: 'สินเชื่อภายใน' },
      { id: id(), code: 'PP088-MTK',   assignee: 'ธ.ไทยพาณิชย์',                     transferRights: true,  debt: 11366800, debtNote: 'PN PS2026-016' },
      { id: id(), code: 'PP091-CRI',   assignee: 'ธ.กสิกรไทย',                       transferRights: true,  debt: 6500000,  debtNote: '' },
      { id: id(), code: 'PP094-PYO',   assignee: 'ธ.กรุงไทย',                        transferRights: true,  debt: 3240000,  debtNote: '' },
      { id: id(), code: 'PP097-SKW',   assignee: 'ธ.กรุงเทพ',                        transferRights: true,  debt: 9720000,  debtNote: 'L/C ค้ำ' },
      { id: id(), code: 'PP101-PTL',   assignee: 'ธ.กสิกรไทย (รอตรวจ)',              transferRights: true,  debt: 13420000, debtNote: 'รออนุมัติ' },
      { id: id(), code: 'PP103-NSN',   assignee: '—',                              transferRights: false, debt: 3229500,  debtNote: '' },
    ],

    // ────────────────────────────────────────────────────────────────────────
    // RAW_IV_OUTSTANDING — ใบแจ้งหนี้คงค้าง (ราคามาจากระบบ)
    //   จะแมพ assignee/debt จาก projectFinance ผ่าน jobNo
    // ────────────────────────────────────────────────────────────────────────
    invoices: [
      { id: id(), ivNo: 'IV2026-077', jobNo: 'PP064-STIIS', period: 1, invoiceDate: '2026-05-10', balance: 231525.00,
        status: 'paid', expectedReceive: '2026-05-15',
        contactName: 'คุณสมหญิง', contactPhone: '02-555-1234',
        followUps: [
          { date: '2026-05-12', note: 'ส่งเอกสารใบตรวจรับ', by: 'พี่นก' },
          { date: '2026-05-14', note: 'แจ้งโอนเงิน', by: 'พี่นก' },
        ],
        actualReceive: { date: '2026-05-15', amount: 231525, bankAccount: 'กรุงเทพ 123-4-56789-0', feeNote: '' },
      },
      { id: id(), ivNo: 'IV2026-076', jobNo: 'PP073-AYT', period: 2, invoiceDate: '2026-05-05', balance: 4200000.00,
        status: 'pending_inspection', expectedReceive: '2026-05-22',
        contactName: 'คุณสมชาย', contactPhone: '076-555-1100',
        followUps: [
          { date: '2026-05-12', note: 'ติดต่อขอใบตรวจรับ — ยังรอช่างประเมิน', by: 'พี่นก' },
        ],
        actualReceive: null,
      },
      { id: id(), ivNo: 'IV2026-075', jobNo: 'PP081-NKM', period: 3, invoiceDate: '2026-05-03', balance: 3500000.00,
        status: 'tracking', expectedReceive: '2026-05-28',
        contactName: 'คุณวีระ', contactPhone: '042-555-2200',
        followUps: [
          { date: '2026-05-10', note: 'เอกสารตรวจรับเรียบร้อย', by: 'พี่นก' },
          { date: '2026-05-15', note: 'รอเจ้าหน้าที่คลังตั้งจ่าย', by: 'พี่นก' },
        ],
        actualReceive: null,
      },
      { id: id(), ivNo: 'IV2026-074', jobNo: 'PP084-SKN', period: 1, invoiceDate: '2026-04-29', balance: 1850000.00,
        status: 'tracking', expectedReceive: '2026-06-04',
        contactName: 'คุณอมรา', contactPhone: '045-555-3300',
        followUps: [
          { date: '2026-05-05', note: 'ส่งใบตรวจรับ', by: 'พี่นก' },
          { date: '2026-05-13', note: 'ติดตามรอบที่ 1 — รอเซ็นเสนอ', by: 'พี่นก' },
        ],
        actualReceive: null,
      },
      { id: id(), ivNo: 'IV2026-073', jobNo: 'PP088-MTK', period: 2, invoiceDate: '2026-04-22', balance: 5400000.00,
        status: 'issue', expectedReceive: '2026-06-10',
        contactName: 'คุณสิงห์', contactPhone: '055-555-4400',
        followUps: [
          { date: '2026-04-30', note: 'ส่งเอกสารตรวจรับ', by: 'พี่นก' },
          { date: '2026-05-12', note: 'เอกสารคืน — ขอใบรับรองอุปกรณ์เพิ่ม', by: 'พี่นก' },
          { date: '2026-05-16', note: 'รอ Eng. ส่งใบรับรอง', by: 'พี่นก' },
        ],
        actualReceive: null,
      },
      { id: id(), ivNo: 'IV2026-072', jobNo: 'PP091-CRI', period: 1, invoiceDate: '2026-04-15', balance: 2380000.00,
        status: 'tracking', expectedReceive: '2026-06-18',
        contactName: 'คุณพิม', contactPhone: '053-555-5500',
        followUps: [],
        actualReceive: null,
      },
      { id: id(), ivNo: 'IV2026-071', jobNo: 'PP097-SKW', period: 4, invoiceDate: '2026-04-08', balance: 1900000.00,
        status: 'pending_inspection', expectedReceive: '2026-06-25',
        contactName: 'คุณสุดารัตน์', contactPhone: '038-555-6600',
        followUps: [],
        actualReceive: null,
      },
    ],

    // ── Forecast entries ────────────────────────────────────────────────────
    forecastEntries: [
      { id: id(), date: '2026-05-22', category: 'inflow_project', label: 'รับเงินงวด 2 — PP073-AYT', amount: 4200000.00, note: 'รอตรวจรับงาน' },
      { id: id(), date: '2026-05-26', category: 'outflow_proj',   label: 'จ่ายค่าวัสดุ Project PP088',  amount: -1800000.00, note: 'รอบโอน' },
      { id: id(), date: '2026-05-28', category: 'inflow_project', label: 'รับเงินงวด 3 — PP081-NKM',   amount: 3500000.00, note: 'ติดตามจาก อบต.' },
      { id: id(), date: '2026-05-30', category: 'inflow_loan',    label: 'เบิกสินเชื่อหมุนเวียน',         amount: 3200000.00, note: 'ทำเรื่องแล้ว' },
      { id: id(), date: '2026-05-31', category: 'outflow_fin',    label: 'ชำระดอกเบี้ยเงินกู้ประจำเดือน', amount: -3060000.00, note: '' },
      { id: id(), date: '2026-06-02', category: 'outflow_misc',   label: 'เงินเดือนพนักงาน + โบนัส',     amount: -3300000.00, note: '' },
    ],

    bankAccounts: [
      { id: id(), bankName: 'กรุงเทพ',     accountNo: '123-4-56789-0', accountName: 'WaterPOG Co., Ltd. (Main)',  type: 'ออมทรัพย์',   balance: 2454226.17,  asOf: '2026-05-18', note: 'บัญชีหลักเก็บเงินรับ' },
      { id: id(), bankName: 'กสิกรไทย',    accountNo: '987-6-54321-0', accountName: 'WaterPOG Co., Ltd. (OD)',    type: 'เดินสะพัด/OD',balance: -1200000.00, asOf: '2026-05-18', note: 'OD Limit 3,000,000' },
      { id: id(), bankName: 'ไทยพาณิชย์',  accountNo: '456-7-89012-3', accountName: 'WaterPOG Co., Ltd. (Payroll)', type: 'ออมทรัพย์',   balance: 470000.00,   asOf: '2026-05-18', note: 'เงินเดือน + ค่าใช้จ่ายเบ็ดเตล็ด' },
      { id: id(), bankName: 'กรุงไทย',     accountNo: '321-0-98765-4', accountName: 'WaterPOG Co., Ltd. (LC)',    type: 'L/C',         balance: 1200000.00,  asOf: '2026-05-18', note: 'ค้ำประกันโครงการ' },
    ],

    // ────────────────────────────────────────────────────────────────────────
    // DATA PV — Payment Voucher (รายการที่จ่ายเงินจริงแล้ว)
    //   เปลี่ยนจาก psNotes เดิม
    // ────────────────────────────────────────────────────────────────────────
    pvVouchers: [
      { id: id(), voucherNo: 'PV2026-101', paidDate: '2026-05-02', payee: 'บริษัท ท่อพีวีซีไทย จำกัด', amount: 850000,  category: 'วัสดุ',    paymentMethod: 'เช็ค',  bankAccount: 'กรุงเทพ 123-4-56789-0', reference: 'PO-2026-088 / PP088', note: '' },
      { id: id(), voucherNo: 'PV2026-102', paidDate: '2026-05-04', payee: 'หจก. รับเหมา ก.วิศวกรรม', amount: 1200000, category: 'รับเหมา',  paymentMethod: 'โอน',   bankAccount: 'กสิกรไทย 987-6-54321-0', reference: 'PP091 งวด 2', note: 'งานก่อสร้าง' },
      { id: id(), voucherNo: 'PV2026-103', paidDate: '2026-05-06', payee: 'การไฟฟ้าส่วนภูมิภาค',     amount: 48000,   category: 'สาธารณูปโภค', paymentMethod: 'โอน',   bankAccount: 'ไทยพาณิชย์ 456-7-89012-3', reference: 'PEA 05/2026', note: '' },
      { id: id(), voucherNo: 'PV2026-104', paidDate: '2026-05-08', payee: 'ธ.กรุงเทพ (ดอกเบี้ย PS2026-014)', amount: 22500, category: 'การเงิน', paymentMethod: 'หักบัญชี', bankAccount: 'กรุงเทพ 123-4-56789-0', reference: 'PS2026-014', note: 'ดอกเบี้ยเดือน พ.ค.' },
      { id: id(), voucherNo: 'PV2026-105', paidDate: '2026-05-10', payee: 'สำนักงานบัญชี เอกชน จำกัด', amount: 35000, category: 'บริการ', paymentMethod: 'โอน', bankAccount: 'กรุงเทพ 123-4-56789-0', reference: '', note: 'ค่าบัญชี' },
      { id: id(), voucherNo: 'PV2026-106', paidDate: '2026-05-13', payee: 'บริษัท ขนส่งยูไนเต็ด จำกัด', amount: 95000, category: 'ขนส่ง', paymentMethod: 'เช็ค', bankAccount: 'กรุงเทพ 123-4-56789-0', reference: '', note: '' },
      { id: id(), voucherNo: 'PV2026-107', paidDate: '2026-05-15', payee: 'เงินเดือนพนักงาน', amount: 2850000, category: 'เงินเดือน', paymentMethod: 'โอน', bankAccount: 'ไทยพาณิชย์ 456-7-89012-3', reference: 'Payroll 05/2026', note: '' },
    ],

    payables: [
      { id: id(), creditorName: 'บริษัท ท่อพีวีซีไทย จำกัด',    invoiceNo: 'PV2026-1024', amount: 850000.00,  dueDate: '2026-05-25', category: 'วัสดุ',       status: 'pending',  note: 'ค่าท่อ PP088' },
      { id: id(), creditorName: 'หจก. รับเหมา ก.วิศวกรรม',     invoiceNo: 'KW2026-088',  amount: 1200000.00, dueDate: '2026-05-30', category: 'รับเหมา',     status: 'pending',  note: 'งานก่อสร้าง PP091' },
      { id: id(), creditorName: 'บริษัท ขนส่งยูไนเต็ด จำกัด',   invoiceNo: 'UC2026-512',  amount: 95000.00,   dueDate: '2026-05-22', category: 'ขนส่ง',      status: 'overdue',  note: 'ค่าขนส่งสะสม' },
      { id: id(), creditorName: 'การไฟฟ้าส่วนภูมิภาค',         invoiceNo: 'PEA2026-05', amount: 48000.00,   dueDate: '2026-05-31', category: 'สาธารณูปโภค', status: 'pending',  note: '' },
      { id: id(), creditorName: 'บริษัท นาคา ปั๊มน้ำ จำกัด',      invoiceNo: 'NK2026-302',  amount: 540000.00,  dueDate: '2026-06-10', category: 'วัสดุ',       status: 'pending',  note: 'ปั๊มน้ำ + อะไหล่' },
      { id: id(), creditorName: 'สำนักงานบัญชี เอกชน จำกัด',   invoiceNo: 'AC2026-05',  amount: 35000.00,   dueDate: '2026-05-20', category: 'บริการ',      status: 'paid',     note: 'ค่าบัญชีเดือน พ.ค.' },
    ],
  });

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return seed();
      return JSON.parse(raw);
    } catch (_) { return seed(); }
  }
  function save(data) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (_) {} }
  function reset() { localStorage.removeItem(STORAGE_KEY); return seed(); }

  // Project status meta
  const STATUS_META = {
    waiting_sign: { label: 'รอลงนามสัญญา',         badge: 'b-amber',  short: 'รอลงนาม' },
    signed_wip:   { label: 'ลงนามแล้ว / ก่อสร้าง',  badge: 'b-violet', short: 'ก่อสร้าง' },
    invoiced:     { label: 'ออกใบแจ้งหนี้แล้ว',      badge: 'b-blue',   short: 'IV แล้ว' },
    paid:         { label: 'รับเงินแล้ว',             badge: 'b-green',  short: 'รับชำระ' },
  };
  const DELIVERY_META = {
    awaiting:    { label: 'รอเริ่มงาน',         badge: 'b-gray' },
    in_progress: { label: 'อยู่ระหว่างก่อสร้าง', badge: 'b-violet' },
    pending:     { label: 'รอส่งมอบงาน',       badge: 'b-amber' },
    delivered:   { label: 'ส่งมอบงานแล้ว',     badge: 'b-blue' },
    received:    { label: 'รับชำระแล้ว',        badge: 'b-green' },
  };
  // NEW: 4 IV statuses
  const IV_STATUS_META = {
    pending_inspection: { label: 'รอใบตรวจรับ',         badge: 'b-amber',  short: 'รอตรวจรับ' },
    tracking:           { label: 'อยู่ระหว่างติดตามเงิน', badge: 'b-blue',   short: 'ติดตาม' },
    issue:              { label: 'ติดปัญหา',              badge: 'b-red',    short: 'ติดปัญหา' },
    paid:               { label: 'รับชำระแล้ว',           badge: 'b-green',  short: 'รับชำระ' },
  };
  // Period payment status
  const PAY_STATUS_META = {
    in_progress:        { label: 'อยู่ระหว่างก่อสร้าง',   badge: 'b-gray' },
    pending_inspection: { label: 'รอใบตรวจรับ',          badge: 'b-amber' },
    tracking:           { label: 'อยู่ระหว่างติดตามเงิน', badge: 'b-blue' },
    issue:              { label: 'ติดปัญหา',              badge: 'b-red' },
    paid:               { label: 'รับชำระแล้ว',           badge: 'b-green' },
  };

  // Helpers for cross-source lookups
  const buildLookups = (data) => ({
    projectByCode: Object.fromEntries((data.projects || []).map(p => [p.code, p])),
    financeByCode: Object.fromEntries((data.projectFinance || []).map(f => [f.code, f])),
  });

  window.WTPData = {
    load, save, reset, seed,
    STATUS_META, DELIVERY_META, IV_STATUS_META, PAY_STATUS_META,
    newId: id,
    daysBetween,
    buildLookups,
  };
})();
