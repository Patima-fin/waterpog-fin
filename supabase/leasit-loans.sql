-- =====================================================================
-- Water POG — ตารางสำหรับ "ตารางคำนวณดอกเบี้ยลีซอิท" (แท็บใหม่ในหน้า #debt)
-- =====================================================================
-- รันใน Supabase SQL Editor "ครั้งเดียว" (โปรเจกต์ Water POG).
-- เพิ่ม 3 ตารางใหม่ (master Leasit ใช้ `debtMaster` เดิม + ฟิลด์ leasitLoanId/leasitSource
-- ใน data jsonb — ไม่ต้องสร้างตารางใหม่สำหรับ master):
--   interestSchedulePrepaid — ดอกเบี้ยจ่ายเช็คล่วงหน้า รายงวด ต่อสัญญา
--   interestScheduleActual  — ดอกเบี้ยเกิดจริงถึงวันปิดหนี้ ต่อสัญญา
--   interestRefund          — ขารับคืน (หลายรอบต่อสัญญา) — RV หักกลบ / โอนคืน
-- โครงเดียวกับตารางอื่น (id text PK / data jsonb / updated_at).
-- key ของ child row → `data.leasitLoanId` (= ลำดับที่/ชื่อชีตในไฟล์ลีซอิท) ผูกกับ
-- `debtMaster.data.leasitLoanId` (ไม่ใช้ debtMaster.id เพราะ id อาจเปลี่ยน rebrand ได้).
-- =====================================================================

-- ── 1. interestSchedulePrepaid ─────────────────────────────────────────
create table if not exists "interestSchedulePrepaid" (
  "id" text primary key,
  "data" jsonb not null default '{}',
  "updated_at" timestamptz not null default now()
);
drop trigger if exists set_updated_at on "interestSchedulePrepaid";
create trigger set_updated_at before update on "interestSchedulePrepaid"
  for each row execute function public.set_updated_at();
-- idempotent: ถ้าตารางอยู่ใน publication แล้วก็ข้าม (กัน error 42710 ตอนรันซ้ำ)
do $$ begin
  alter publication supabase_realtime add table "interestSchedulePrepaid";
exception when duplicate_object then null;
end $$;
grant all on "interestSchedulePrepaid" to anon, authenticated, service_role;

alter table "interestSchedulePrepaid" enable row level security;
drop policy if exists "interestSchedulePrepaid_read" on "interestSchedulePrepaid";
create policy "interestSchedulePrepaid_read" on "interestSchedulePrepaid"
  for select to authenticated using (true);
drop policy if exists "interestSchedulePrepaid_write" on "interestSchedulePrepaid";
create policy "interestSchedulePrepaid_write" on "interestSchedulePrepaid"
  for all to authenticated
  using (public.auth_role() in ('staff', 'manager'))
  with check (public.auth_role() in ('staff', 'manager'));

-- ── 2. interestScheduleActual ─────────────────────────────────────────
create table if not exists "interestScheduleActual" (
  "id" text primary key,
  "data" jsonb not null default '{}',
  "updated_at" timestamptz not null default now()
);
drop trigger if exists set_updated_at on "interestScheduleActual";
create trigger set_updated_at before update on "interestScheduleActual"
  for each row execute function public.set_updated_at();
do $$ begin
  alter publication supabase_realtime add table "interestScheduleActual";
exception when duplicate_object then null;
end $$;
grant all on "interestScheduleActual" to anon, authenticated, service_role;

alter table "interestScheduleActual" enable row level security;
drop policy if exists "interestScheduleActual_read" on "interestScheduleActual";
create policy "interestScheduleActual_read" on "interestScheduleActual"
  for select to authenticated using (true);
drop policy if exists "interestScheduleActual_write" on "interestScheduleActual";
create policy "interestScheduleActual_write" on "interestScheduleActual"
  for all to authenticated
  using (public.auth_role() in ('staff', 'manager'))
  with check (public.auth_role() in ('staff', 'manager'));

-- ── 3. interestRefund ─────────────────────────────────────────────────
create table if not exists "interestRefund" (
  "id" text primary key,
  "data" jsonb not null default '{}',
  "updated_at" timestamptz not null default now()
);
drop trigger if exists set_updated_at on "interestRefund";
create trigger set_updated_at before update on "interestRefund"
  for each row execute function public.set_updated_at();
do $$ begin
  alter publication supabase_realtime add table "interestRefund";
exception when duplicate_object then null;
end $$;
grant all on "interestRefund" to anon, authenticated, service_role;

alter table "interestRefund" enable row level security;
drop policy if exists "interestRefund_read" on "interestRefund";
create policy "interestRefund_read" on "interestRefund"
  for select to authenticated using (true);
drop policy if exists "interestRefund_write" on "interestRefund";
create policy "interestRefund_write" on "interestRefund"
  for all to authenticated
  using (public.auth_role() in ('staff', 'manager'))
  with check (public.auth_role() in ('staff', 'manager'));

-- =====================================================================
-- ROLLBACK (รันถ้าต้องการลบทิ้ง — ระวัง: ลบข้อมูลถาวร)
-- =====================================================================
-- alter publication supabase_realtime drop table "interestSchedulePrepaid";
-- alter publication supabase_realtime drop table "interestScheduleActual";
-- alter publication supabase_realtime drop table "interestRefund";
-- drop table if exists "interestSchedulePrepaid";
-- drop table if exists "interestScheduleActual";
-- drop table if exists "interestRefund";
