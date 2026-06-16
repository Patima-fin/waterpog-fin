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
  // ── เลือก Backend ─────────────────────────────────────────────────
  //  'sheets'   = Google Sheets เดิม (อ่าน gviz CSV / เขียน Apps Script) — ค่าตั้งต้น
  //  'supabase' = Postgres + Realtime (อ่านหลังเขียนเห็นทันที, push, เขียนทีละแถว)
  //  ★ สลับได้ทันที: ตั้ง 'supabase' หลังทำตาม docs/supabase-setup-guide.md ครบ
  //    (สร้าง project → รัน supabase/schema.sql → กรอก URL/key ด้านล่าง → migrate)
  //    ถ้ามีปัญหา ตั้งกลับ 'sheets' + push = ถอยกลับทันที
  BACKEND: 'supabase',

  // Supabase (ใช้เมื่อ BACKEND === 'supabase') — เอาจาก Project Settings → API
  //  SUPABASE_URL      = Project URL (เช่น https://xxxx.supabase.co)
  //  SUPABASE_ANON_KEY = anon public key (อยู่ในเครื่อง client เหมือน Apps Script URL เดิม)
  SUPABASE_URL: 'https://kibxevldnzquwulcyegr.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpYnhldmxkbnpxdXd1bGN5ZWdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1ODk1MTQsImV4cCI6MjA5NzE2NTUxNH0.vJ36egIcryH0gN-DTj75i7LjTgh3zpLbC858y2LYQeU',

  // Phase 4 — Supabase Auth: login จับคู่ username → อีเมลภายใน "<username>@<domain>"
  //   (อีเมลปลอมใช้ภายในระบบ ไม่ส่งจริง · domain ต้องผ่าน format validator ของ Supabase)
  //   ★ ค่านี้ต้องตรงกันระหว่าง tools/supabase-auth-setup.html (สร้าง user) กับ login (app.jsx)
  AUTH_EMAIL_DOMAIN: 'waterpog.app',

  // เปิด login ผ่าน Supabase Auth (Phase 4) — false = ใช้ login เดิม (ตรวจกับ USERS/ชีต)
  //   ★ เปิดเป็น true เฉพาะหลังทำ docs/supabase-phase4-auth-guide.md ขั้น A–B เสร็จ
  //     (สร้าง Supabase Auth users + รหัสใหม่แล้ว) ไม่งั้นทุกคน login ไม่ได้
  //   เมื่อ true: login เรียก WTPData.authSignIn (signInWithPassword), role มาจาก app_metadata,
  //     และควรลบ password ออกจาก USERS ด้านล่าง (ไม่ใช้แล้ว + ไม่ให้รั่วใน repo)
  USE_SUPABASE_AUTH: true,

  // Sheet ID — ใช้สำหรับ READ ทาง CSV (เร็ว ไม่ใช้ Apps Script quota)
  SHEET_ID: '1Q0enboLihOYiYCn7otK9zXBlk6Yy8oHfoAXaFnGujwA',

  // Apps Script URL — ใช้สำหรับ WRITE กลับเข้า Sheet (CRUD)
  // Deploy จาก standalone script ของ Gmail ส่วนตัว (bypass Workspace policy)
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbwhTJTHy0jywsICM4W5BFpMkyV26Ha0_mm520W09FwtAybPgzZZd51NVkE14bfg7BH2pQ/exec',

  // ตั้งเวลา auto-refresh จากเซิร์ฟเวอร์ (มิลลิวินาที, 0 = ปิด)
  // 120 วินาที (ลดจาก 45 วิ · 2026-06-14) — ลดภาระ polling พื้นหลัง ~60%
  //   (เดิมอ่าน ~24 ชีตทุก 45 วิ = หนักเครื่อง/เน็ต) ข้อมูลทีมยังสดพอ (อัปเดตภายใน 2 นาที)
  // ถ้าเจอ 429 ติดกัน 2 รอบ data_sync จะ adaptive backoff x2-x4 อัตโนมัติ
  // และ tab idle (ไม่ได้มอง) จะหยุด sync ผ่าน Page Visibility API
  AUTO_REFRESH_MS: 120000,  // 2 นาที

  // ── Row-level sync ────────────────────────────────────────────────
  // true  = แก้เฉพาะแถว/ฟิลด์ที่เปลี่ยน ผ่าน applyDiff (กัน clobber ทั้งตาราง + read-your-writes)
  // false = กลับไปใช้ replaceAll เดิม (เขียนทั้งตาราง) — ใช้ถอยกลับทันทีถ้าพบปัญหา
  // ต้อง deploy Apps Script ที่มี serverVersion (>= 20260608c) ก่อน; ถ้าเซิร์ฟเวอร์ยังเก่า
  // client จะ fallback เป็น replaceAll ให้อัตโนมัติ (ปลอดภัย)
  ROW_LEVEL_SYNC: true,

  // ผู้ใช้ระบบ — ★ Phase 4: รหัสผ่านย้ายไป Supabase Auth แล้ว (hash ฝั่ง server)
  //   จึง "ลบ password ออกจากไฟล์นี้" (เป็น public repo) — login ตรวจกับ Supabase Auth แทน
  //   รายการนี้เหลือไว้เป็น directory (username/displayName/role) + ให้ tool สร้าง user อ่าน
  //   เพิ่ม/แก้คน/รหัส → แก้ที่นี่ (username/role/displayName) แล้วรัน tools/supabase-auth-setup.html
  // Roles: viewer (ดู dashboard) · staff (แก้ได้ ลบไม่ได้) · manager (ทุกอย่าง+users) · owner (ดูอย่างเดียว)
  USERS: [
    { username: 'admin',       displayName: 'ผู้ดูแลระบบ',     role: 'manager' },
    { username: 'viewer',      displayName: 'ผู้บริหาร (ดู)',  role: 'viewer'  },
    { username: 'owner',       displayName: 'เจ้าของบริษัท',   role: 'owner'   },
    { username: 'acc.manager', displayName: 'บัญชี',           role: 'staff'   },
    { username: 'nantawan',    displayName: 'Nantawan',        role: 'manager' },
    { username: 'patima',      displayName: 'Patima',          role: 'manager' },
    { username: 'itd',         displayName: 'ITD',             role: 'manager' },
  ],

  // อายุ session (มิลลิวินาที) — 0 = ไม่หมดอายุ
  SESSION_TTL_MS: 8 * 60 * 60 * 1000,  // 8 ชั่วโมง

  // เด้งออกจากระบบอัตโนมัติเมื่อ "ไม่ได้ใช้งาน" เกินกำหนด (มิลลิวินาที, 0 = ปิด)
  // 30 นาที — กันเครื่องที่เปิดเว็บค้างไว้เฉยๆ ไม่ให้ระบบ sync ดีดข้อมูลขึ้นชีต
  //   ในนามคนที่ไม่ได้ใช้งานจริง (ดูคู่กับ guard "ไม่ล็อกอิน = ไม่ push" ใน data_sync.js)
  //   วัดจากการขยับเมาส์/พิมพ์/คลิก/เลื่อนจอ — ครบกำหนดแล้วเด้งกลับหน้า LOGIN
  IDLE_LOGOUT_MS: 30 * 60 * 1000,  // 30 นาที

  // บังคับ logout ทุก session ที่ "สร้างก่อน" เวลานี้ (epoch ms, 0 = ปิด)
  //   ตั้งเป็นเวลา deploy → ทุกคนที่ล็อกอินไว้ก่อนหน้า พอ reload เข้าโค้ดใหม่จะถูก
  //   เด้งไปหน้า LOGIN ให้ล็อกอินใหม่ (ใช้รีเซ็ตทั้งทีมตอนปล่อยเวอร์ชันที่แก้เรื่อง session)
  //   ★ อัปเดตค่านี้ทุกครั้งที่อยาก "บังคับทุกคน re-login ตอน deploy" (ใส่ epoch ปัจจุบัน)
  //   นอกจากนี้ admin ยังกด "บังคับทุกคนออกจากระบบ" ระหว่างวันได้ผ่านหน้า Users
  //   (เขียน override `system.forceLogoutBefore` — เด้งเครื่องที่รันโค้ดใหม่ภายใน ~2 นาที)
  FORCE_LOGOUT_BEFORE: 1781616189511,  // 2026-06-16 13:23 (Phase 4 go-live: บังคับทุกคน re-login ด้วย Supabase Auth + รหัสใหม่)

  // Presence "ใครออนไลน์อยู่" — เครื่องที่ล็อกอิน+เปิดอยู่+ไม่ idle เขียน heartbeat
  //   ทุกช่วงนี้ (ms, 0 = ปิด) ไปที่ตาราง `presence` (ไม่ลง audit) → หน้า Users โชว์
  //   ★ ต้อง redeploy Apps Script (มี entity presence) ก่อนถึงจะทำงาน — ถ้ายังไม่ deploy
  //     จะเงียบ (degrade) ไม่พัง. ตั้ง 0 เพื่อปิดการ heartbeat
  PRESENCE_HEARTBEAT_MS: 5 * 60 * 1000,  // 5 นาที

  // ── Auto-push เฉพาะตอนผู้ใช้ "แก้จริง" (กันแท็บค้างดันข้อมูลหาย) ──────────────
  // true  = auto-push (ตัว debounced หลัง setData) จะยิงเฉพาะเมื่อผู้ใช้เพิ่งแตะ
  //         (พิมพ์/คลิก/แก้) ภายใน AUTO_PUSH_ACTIVITY_WINDOW_MS → แท็บเปิดค้างเฉยๆ
  //         (poll แล้ว normalize ต่าง = "diff หลอก") จะไม่ push ทับชีต = หยุดข้อมูลหาย
  // false = กลับไปพฤติกรรมเดิม (push ทุกครั้งที่ data เปลี่ยน แม้ poll) — ใช้ถอยกลับถ้าพบปัญหา
  // ★ ปุ่มบันทึกจริง (forceSyncNow) ข้าม gate นี้เสมอ → การแก้ผ่านปุ่มยังเซฟ 100%
  AUTO_PUSH_REQUIRES_ACTIVITY: true,
  AUTO_PUSH_ACTIVITY_WINDOW_MS: 2 * 60 * 1000,  // 2 นาที — แตะภายในช่วงนี้ถือว่า "กำลังแก้จริง"
};
