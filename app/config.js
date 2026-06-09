/* =====================================================================
 * Water POG Financial Dashboard — Configuration
 * =====================================================================
 * วิธีตั้งค่า:
 *  1) แชร์ Google Sheet เป็น "Anyone with the link can view"
 *  2) วาง Sheet ID (ส่วน "/d/XXXXX/" ใน URL) ลงในช่อง SHEET_ID ด้านล่าง
 *  3) บันทึกไฟล์ → รีเฟรชหน้าเว็บ
 *
 * ถ้า SHEET_ID ว่าง → ระบบใช้ข้อมูล Mock ใน localStorage แทน
 * ===================================================================== */

window.WTP_CONFIG = {
  // Sheet ID — ใช้สำหรับ READ ทาง CSV (เร็ว ไม่ใช้ Apps Script quota)
  SHEET_ID: '1Q0enboLihOYiYCn7otK9zXBlk6Yy8oHfoAXaFnGujwA',

  // Apps Script URL — ใช้สำหรับ WRITE กลับเข้า Sheet (CRUD)
  // Deploy จาก standalone script ของ Gmail ส่วนตัว (bypass Workspace policy)
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbwhTJTHy0jywsICM4W5BFpMkyV26Ha0_mm520W09FwtAybPgzZZd51NVkE14bfg7BH2pQ/exec',

  // ตั้งเวลา auto-refresh จากเซิร์ฟเวอร์ (มิลลิวินาที, 0 = ปิด)
  // 45 วินาที — เน้น near-real-time สำหรับ ~3 active writer พร้อมกัน
  // ถ้าเจอ 429 ติดกัน 2 รอบ data_sync จะ adaptive backoff x2-x4 อัตโนมัติ
  // และ tab idle (ไม่ได้มอง) จะหยุด sync ผ่าน Page Visibility API
  AUTO_REFRESH_MS: 45000,  // 45 วินาที

  // ── Row-level sync ────────────────────────────────────────────────
  // true  = แก้เฉพาะแถว/ฟิลด์ที่เปลี่ยน ผ่าน applyDiff (กัน clobber ทั้งตาราง + read-your-writes)
  // false = กลับไปใช้ replaceAll เดิม (เขียนทั้งตาราง) — ใช้ถอยกลับทันทีถ้าพบปัญหา
  // ต้อง deploy Apps Script ที่มี serverVersion (>= 20260608c) ก่อน; ถ้าเซิร์ฟเวอร์ยังเก่า
  // client จะ fallback เป็น replaceAll ให้อัตโนมัติ (ปลอดภัย)
  ROW_LEVEL_SYNC: true,

  // ผู้ใช้ระบบ — แก้ไข username/password/role ได้ตามต้องการ
  //
  // Roles (เลือก 1 ใน 4):
  //  - viewer  : ดูเฉพาะ dashboard (Daily, War Room) — ห้ามดูประมาณการ + จัดการข้อมูล
  //  - staff   : ทำงานปกติ ดูทุกหน้า + เพิ่ม/แก้ไข ได้ แต่ลบไม่ได้
  //  - manager : ทำได้ทุกอย่าง รวมจัดการ users
  //  - owner   : ดูทุกหน้า แต่แก้/ลบไม่ได้ — มองไม่เห็นหน้าจัดการ users
  USERS: [
    { username: 'admin',       password: 'waterpog2025', displayName: 'ผู้ดูแลระบบ',     role: 'manager' },
    { username: 'finance1',    password: 'fin1234',      displayName: 'การเงิน 1',       role: 'staff'   },
    { username: 'finance2',    password: 'fin1234',      displayName: 'การเงิน 2',       role: 'staff'   },
    { username: 'viewer',      password: 'view2025',     displayName: 'ผู้บริหาร (ดู)',  role: 'viewer'  },
    { username: 'owner',       password: 'own2025',      displayName: 'เจ้าของบริษัท',   role: 'owner'   },
    { username: 'acc.manager', password: 'waterpog2026', displayName: 'บัญชี',           role: 'staff'   },
    { username: 'nantawan',    password: 'nan2026',      displayName: 'Nantawan',        role: 'manager' },
    { username: 'patima',      password: 'toey2026',     displayName: 'Patima',          role: 'manager' },
  ],

  // อายุ session (มิลลิวินาที) — 0 = ไม่หมดอายุ
  SESSION_TTL_MS: 8 * 60 * 60 * 1000,  // 8 ชั่วโมง
};
