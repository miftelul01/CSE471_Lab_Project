-- ============================================================================
-- 0010_m3_chores.sql — M3.4 Automated Chore Rotation (Google Tasks API)
-- Owner: Mahia Tanzin
--
-- rotation_order is an ordered array of user ids; last_assigned_index is the
-- cursor into it. Rotating = advance the cursor, insert the next assignment,
-- push it to that resident's Google Tasks and store the returned task id.
-- ============================================================================

create type public.chore_frequency as enum ('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY');
create type public.chore_assignment_status as enum ('PENDING', 'COMPLETED', 'MISSED');

create table public.chores (
  id                  uuid primary key default gen_random_uuid(),
  house_id            uuid not null references public.houses (id) on delete cascade,
  name                text not null,
  description         text,
  frequency           public.chore_frequency not null default 'WEEKLY',
  -- Ordered rotation ring of profile ids.
  rotation_order      uuid[] not null default '{}',
  -- Cursor into rotation_order; -1 means "nobody assigned yet".
  last_assigned_index integer not null default -1,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index chores_house_idx on public.chores (house_id) where is_active;

create trigger chores_set_updated_at
  before update on public.chores
  for each row execute function public.set_updated_at();

create table public.chore_assignments (
  id             uuid primary key default gen_random_uuid(),
  chore_id       uuid not null references public.chores (id) on delete cascade,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  due_date       date not null,
  status         public.chore_assignment_status not null default 'PENDING',
  completed_at   timestamptz,
  -- id returned by the Google Tasks API, so we can update/delete the task later
  google_task_id text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- Running the rotation job twice for the same period must not double-assign.
  unique (chore_id, due_date)
);

create index chore_assignments_user_idx on public.chore_assignments (user_id, due_date desc);

create trigger chore_assignments_set_updated_at
  before update on public.chore_assignments
  for each row execute function public.set_updated_at();

alter table public.chores            enable row level security;
alter table public.chore_assignments enable row level security;

create policy "chores visible to house"
  on public.chores for select
  to authenticated
  using (public.is_house_member(house_id) or public.is_platform_admin());

create policy "house admin manages chores"
  on public.chores for all
  to authenticated
  using (public.is_house_admin(house_id))
  with check (public.is_house_admin(house_id));

create policy "assignments visible to house"
  on public.chore_assignments for select
  to authenticated
  using (
    exists (
      select 1 from public.chores c
      where c.id = chore_id and public.is_house_member(c.house_id)
    )
  );

create policy "house admin creates assignments"
  on public.chore_assignments for insert
  to authenticated
  with check (
    exists (
      select 1 from public.chores c
      where c.id = chore_id and public.is_house_admin(c.house_id)
    )
  );

-- You mark your own chore done; the house admin can override anyone's.
create policy "assignee or admin updates assignment"
  on public.chore_assignments for update
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.chores c
      where c.id = chore_id and public.is_house_admin(c.house_id)
    )
  )
  with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.chores c
      where c.id = chore_id and public.is_house_admin(c.house_id)
    )
  );
