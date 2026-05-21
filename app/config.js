/* =====================================================================
 * Water POG Financial Dashboard — Configuration
 * =====================================================================
 * วิธีตั้งค่า:
 *  1) Deploy Google Apps Script เป็น Web App (ดูขั้นตอนใน SETUP.md)
 *  2) วาง URL ที่ได้ในช่อง APPS_SCRIPT_URL ด้านล่าง
 *  3) บันทึกไฟล์ → รีเฟรชหน้าเว็บ
 *
 * ถ้า APPS_SCRIPT_URL ว่าง → ระบบใช้ข้อมูล Mock ใน localStorage แทน
 * ===================================================================== */

window.WTP_CONFIG = {
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycby8Q3NmRRYb7_rjhKagAPsxKVOgctvluHuYxme_kEIxKgYLFIjso2JzP88vCPT8-s16fg/exec',   // ← วาง URL จาก Apps Script ตรงนี้

  // ตั้งเวลา auto-refresh จากเซิร์ฟเวอร์ (มิลลิวินาที, 0 = ปิด)
  AUTO_REFRESH_MS: 300000,  // 5 นาที
};
