-- =====================================================================
-- Water POG — ตาราง cashflowPresent (หน้า "พรีเซนต์ Cash Flow" #cashflow_present)
-- =====================================================================
-- รันใน Supabase SQL Editor "ครั้งเดียว" (โปรเจกต์ Water POG).
-- เก็บข้อมูลที่อัปโหลดในหน้าพรีเซนต์แคชโฟลว์ "ส่วนกลาง" ให้ทั้งทีม/ผู้บริหารเห็นชุดเดียวกัน
-- (เดิมถ้าไม่มีตารางนี้ = เก็บ localStorage `wtp-cfpresent-v1` ต่อเครื่อง → เห็นแค่คนอัป).
--   1 แถว id='current': data = { id, stm:{txns,opening,…}, uploadedAt, uploadedBy }
-- โครงเดียวกับตารางอื่น (id text PK / data jsonb / updated_at). อ่าน/เขียนผ่าน
--   WTPData.fetchSheetRows('cashflowPresent') / WTPData.writeTable('cashflowPresent', …)
--   (cashflowPresent อยู่ใน SHEET_TABLES ของ app/data_supabase.js แล้ว).
-- =====================================================================

create table if not exists "cashflowPresent" ("id" text primary key, "data" jsonb not null default '{}', "updated_at" timestamptz not null default now());

-- trigger updated_at (ใช้ฟังก์ชัน public.set_updated_at() ที่สร้างไว้ใน schema.sql แล้ว)
drop trigger if exists set_updated_at on "cashflowPresent";
create trigger set_updated_at before update on "cashflowPresent" for each row execute function public.set_updated_at();

-- realtime (เผื่อแท็บที่เปิดค้างอัปเดตเอง — optional)
alter publication supabase_realtime add table "cashflowPresent";

-- grant (RLS คุมจริงอีกชั้นด้านล่าง)
grant all on "cashflowPresent" to anon, authenticated, service_role;

-- ── RLS: read=ทุก authenticated · write=staff/manager (เหมือนตารางอื่นใน rls-phase4.sql) ──
alter table "cashflowPresent" enable row level security;

drop policy if exists "cashflowPresent_read" on "cashflowPresent";
create policy "cashflowPresent_read" on "cashflowPresent"
  for select to authenticated using (true);

drop policy if exists "cashflowPresent_write" on "cashflowPresent";
create policy "cashflowPresent_write" on "cashflowPresent"
  for all to authenticated
  using (public.auth_role() in ('staff', 'manager'))
  with check (public.auth_role() in ('staff', 'manager'));
