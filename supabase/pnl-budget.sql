-- =====================================================================
-- Water POG — Phase 5: ตาราง P&L + Budget ใน Supabase (ย้ายจาก Google Sheet)
-- =====================================================================
-- รันใน Supabase SQL Editor (หลัง Phase 4 RLS เปิดแล้ว).
-- 2 ตารางนี้เก็บข้อมูลที่หน้า P&L / Budget เคยอ่านจาก Google Sheet:
--   pnlBase  = "ฐาน DATA" (P&L) — 1 แถว/รหัสบัญชี: {group,code,name,m1..m12,updatedAt}
--   budgetHo = "BUDGET HO" (Budget) — 1 แถว/dept|acct: {dept,deptName,acct,desc,cat,b1..b12,a1..a12}
-- โครงเดียวกับตารางอื่น (id text PK / data jsonb / updated_at) + RLS เปิดเหมือนกัน.
-- =====================================================================

create table if not exists "pnlBase"  ("id" text primary key, "data" jsonb not null default '{}', "updated_at" timestamptz not null default now());
create table if not exists "budgetHo" ("id" text primary key, "data" jsonb not null default '{}', "updated_at" timestamptz not null default now());

-- trigger updated_at (ใช้ฟังก์ชัน public.set_updated_at() ที่สร้างไว้ใน schema.sql แล้ว)
drop trigger if exists set_updated_at on "pnlBase";
drop trigger if exists set_updated_at on "budgetHo";
create trigger set_updated_at before update on "pnlBase"  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on "budgetHo" for each row execute function public.set_updated_at();

-- realtime
alter publication supabase_realtime add table "pnlBase";
alter publication supabase_realtime add table "budgetHo";

-- grant (RLS จะคุมจริงอีกชั้น)
grant all on "pnlBase", "budgetHo" to anon, authenticated, service_role;

-- ── RLS: อ่าน=ทุก authenticated · เขียน=staff/manager (เหมือน entity อื่น) ──
do $$
declare t text;
begin
  foreach t in array array['pnlBase','budgetHo'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists p_read  on %I', t);
    execute format('drop policy if exists p_write on %I', t);
    execute format('create policy p_read on %I for select to authenticated using (true)', t);
    execute format($f$create policy p_write on %I for all to authenticated
        using (public.auth_role() in ('staff','manager'))
        with check (public.auth_role() in ('staff','manager'))$f$, t);
  end loop;
end $$;
