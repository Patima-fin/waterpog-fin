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
  AUTO_REFRESH_MS: 300000,  // 5 นาที

  // ผู้ใช้ระบบ — แก้ไข username/password ได้ตามต้องการ
  USERS: [
    { username: 'admin',    password: 'waterpog2025', displayName: 'ผู้ดูแลระบบ' },
    { username: 'finance1', password: 'fin1234',      displayName: 'การเงิน 1' },
    { username: 'finance2', password: 'fin1234',      displayName: 'การเงิน 2' },
  ],

  // อายุ session (มิลลิวินาที) — 0 = ไม่หมดอายุ
  SESSION_TTL_MS: 8 * 60 * 60 * 1000,  // 8 ชั่วโมง
};
