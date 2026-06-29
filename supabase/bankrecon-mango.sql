-- =====================================================================
-- Water POG — ตารางกระทบยอด Mango ERP ↔ Bank Statement (#bank_recon → แท็บ "เทียบ Mango")
-- =====================================================================
-- รันใน Supabase SQL Editor "ครั้งเดียว" (โปรเจกต์ Water POG).
-- อัปเกรดแท็บ "เทียบ Mango" จาก diagnostic อ่านอย่างเดียว → workflow เต็ม
--   (overview → นำเข้างบกระทบยอด + statement → จับคู่อัตโนมัติ → ยืนยัน → จับคู่เอง M-to-N).
--
--   bankReconBook  = สมุดบัญชี (movements/outstanding/meta จากไฟล์ "งบกระทบยอด Mango")
--                    1 แถว/รายการ · id = accountNo|ym|bkDate|vno|amount#n (deterministic)
--   bankReconMatch = การจับคู่ที่ "ยืนยันแล้ว/จับคู่เอง" เท่านั้น (suggestion คำนวณสดไม่เก็บ)
--                    1 แถว/การจับคู่ · M-to-N = bookIds[]/stmIds[] หลายตัวในแถวเดียว
--
-- โครงเดียวกับตารางอื่น (id text PK / data jsonb / updated_at). อ่าน/เขียนผ่าน sync ปกติ
--   (อยู่ใน CRUD_ENTITIES ของ data_supabase.js + CRUD_KEYS ของ data.js แล้ว).
-- statement lines ใช้ตาราง bankReconLines เดิม (ไม่ต้องสร้างใหม่).
-- =====================================================================

create table if not exists "bankReconBook"  ("id" text primary key, "data" jsonb not null default '{}', "updated_at" timestamptz not null default now());
create table if not exists "bankReconMatch" ("id" text primary key, "data" jsonb not null default '{}', "updated_at" timestamptz not null default now());

-- trigger updated_at (ใช้ฟังก์ชัน public.set_updated_at() ที่สร้างไว้ใน schema.sql แล้ว)
drop trigger if exists set_updated_at on "bankReconBook";
create trigger set_updated_at before update on "bankReconBook"  for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on "bankReconMatch";
create trigger set_updated_at before update on "bankReconMatch" for each row execute function public.set_updated_at();

-- realtime (push อัปเดตข้ามแท็บ/ข้ามผู้ใช้)
do $$ begin alter publication supabase_realtime add table "bankReconBook";  exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table "bankReconMatch"; exception when duplicate_object then null; end $$;

-- grant (RLS คุมจริงอีกชั้นด้านล่าง)
grant all on "bankReconBook"  to anon, authenticated, service_role;
grant all on "bankReconMatch" to anon, authenticated, service_role;

-- ── RLS: read=ทุก authenticated · write=staff/manager (เหมือนตารางอื่นใน rls-phase4.sql) ──
alter table "bankReconBook"  enable row level security;
alter table "bankReconMatch" enable row level security;

drop policy if exists "bankReconBook_read" on "bankReconBook";
create policy "bankReconBook_read" on "bankReconBook" for select to authenticated using (true);
drop policy if exists "bankReconBook_write" on "bankReconBook";
create policy "bankReconBook_write" on "bankReconBook" for all to authenticated
  using (public.auth_role() in ('staff', 'manager')) with check (public.auth_role() in ('staff', 'manager'));

drop policy if exists "bankReconMatch_read" on "bankReconMatch";
create policy "bankReconMatch_read" on "bankReconMatch" for select to authenticated using (true);
drop policy if exists "bankReconMatch_write" on "bankReconMatch";
create policy "bankReconMatch_write" on "bankReconMatch" for all to authenticated
  using (public.auth_role() in ('staff', 'manager')) with check (public.auth_role() in ('staff', 'manager'));

-- บอก PostgREST ให้ reload schema cache (กันหา table ใหม่ไม่เจอ)
notify pgrst, 'reload schema';
