-- ============================================================================
-- 0007_m2_meal_attendance.sql — M2.3 Meal Attendance & Auto-Quantity Adjustment
-- Owner: Md. Mahidul Alam Araf
--
-- Residents toggle attend/skip per meal. headcount is maintained by a trigger
-- so the cook's quantity figure can never drift from the actual toggles — that
-- recalculation is the core of this feature, so the DB owns it.
--
-- The cost side (deducting a skipped meal from the absent resident's share)
-- lives in the API, because it has to write into M2.1's expense_shares.
-- ============================================================================

create type public.attendance_status as enum ('ATTENDING', 'SKIPPING');

create table public.meals (
  id               uuid primary key default gen_random_uuid(),
  house_id         uuid not null references public.houses (id) on delete cascade,
  meal_date        date not null,
  meal_type        public.meal_type not null,
  menu_proposal_id uuid references public.menu_proposals (id) on delete set null,
  cost_per_head    numeric(10, 2) check (cost_per_head >= 0),
  headcount        integer not null default 0,
  -- After this moment attendance is frozen (the cook has already shopped).
  locks_at         timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (house_id, meal_date, meal_type)
);

create index meals_house_date_idx on public.meals (house_id, meal_date desc);

create trigger meals_set_updated_at
  before update on public.meals
  for each row execute function public.set_updated_at();

create table public.meal_attendance (
  id         uuid primary key default gen_random_uuid(),
  meal_id    uuid not null references public.meals (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  status     public.attendance_status not null default 'ATTENDING',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (meal_id, user_id)
);

create trigger meal_attendance_set_updated_at
  before update on public.meal_attendance
  for each row execute function public.set_updated_at();

-- Auto-recalculate the required quantity for the cook on every toggle.
create or replace function public.recalc_meal_headcount()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_meal_id uuid := coalesce(new.meal_id, old.meal_id);
begin
  update public.meals
  set headcount = (
    select count(*) from public.meal_attendance
    where meal_id = v_meal_id and status = 'ATTENDING'
  )
  where id = v_meal_id;
  return null;
end;
$$;

create trigger meal_attendance_recalc_headcount
  after insert or update or delete on public.meal_attendance
  for each row execute function public.recalc_meal_headcount();

alter table public.meals           enable row level security;
alter table public.meal_attendance enable row level security;

create policy "meals visible to house"
  on public.meals for select
  to authenticated
  using (public.is_house_member(house_id) or public.is_platform_admin());

create policy "members manage meals"
  on public.meals for insert
  to authenticated
  with check (public.is_house_member(house_id));

create policy "house admin updates meals"
  on public.meals for update
  to authenticated
  using (public.is_house_member(house_id))
  with check (public.is_house_member(house_id));

create policy "attendance visible to house"
  on public.meal_attendance for select
  to authenticated
  using (
    exists (
      select 1 from public.meals m
      where m.id = meal_id and public.is_house_member(m.house_id)
    )
  );

-- You toggle only your own attendance, and only before the meal locks.
create policy "toggle own attendance"
  on public.meal_attendance for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.meals m
      where m.id = meal_id
        and public.is_house_member(m.house_id)
        and (m.locks_at is null or m.locks_at > now())
    )
  );

create policy "change own attendance before lock"
  on public.meal_attendance for update
  to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.meals m
      where m.id = meal_id and (m.locks_at is null or m.locks_at > now())
    )
  )
  with check (user_id = auth.uid());
