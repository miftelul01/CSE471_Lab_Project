-- ============================================================================
-- 0004_m1_guest_log.sql — M1.3 Guest Registration & Accountability Log
-- Owner: Md. Mahidul Alam Araf
--
-- Residents log guest check-in/check-out; the house admin is notified; the log
-- is permanent per house. Note there is deliberately NO delete policy — an
-- accountability log you can erase is not an accountability log.
-- ============================================================================

create type public.guest_status as enum ('CHECKED_IN', 'CHECKED_OUT', 'CANCELLED');

create table public.guest_logs (
  id                 uuid primary key default gen_random_uuid(),
  house_id           uuid not null references public.houses (id) on delete cascade,
  host_user_id       uuid not null references public.profiles (id) on delete cascade,
  guest_name         text not null,
  guest_phone        text,
  purpose            text,
  expected_check_out timestamptz,
  checked_in_at      timestamptz not null default now(),
  checked_out_at     timestamptz,
  status             public.guest_status not null default 'CHECKED_IN',
  -- Set once the landlord/house admin notification has gone out.
  notified_admin_at  timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint guest_logs_checkout_after_checkin
    check (checked_out_at is null or checked_out_at >= checked_in_at)
);

create index guest_logs_house_idx on public.guest_logs (house_id, checked_in_at desc);
create index guest_logs_open_idx on public.guest_logs (house_id) where status = 'CHECKED_IN';

create trigger guest_logs_set_updated_at
  before update on public.guest_logs
  for each row execute function public.set_updated_at();

alter table public.guest_logs enable row level security;

create policy "guest log visible to house"
  on public.guest_logs for select
  to authenticated
  using (public.is_house_member(house_id) or public.is_house_admin(house_id) or public.is_platform_admin());

create policy "residents log their own guests"
  on public.guest_logs for insert
  to authenticated
  with check (host_user_id = auth.uid() and public.is_house_member(house_id));

-- Host checks their guest out; house admin can correct any entry.
create policy "host or house admin updates guest log"
  on public.guest_logs for update
  to authenticated
  using (host_user_id = auth.uid() or public.is_house_admin(house_id))
  with check (host_user_id = auth.uid() or public.is_house_admin(house_id));
