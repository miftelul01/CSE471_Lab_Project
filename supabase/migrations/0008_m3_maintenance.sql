-- ============================================================================
-- 0008_m3_maintenance.sql — M3.1 Maintenance Ticket System
-- Owner: Miftelul Mehebub
--
-- Residents report issues; the landlord moves them OPEN -> IN_PROGRESS ->
-- RESOLVED. Every status change is appended to maintenance_ticket_events by a
-- trigger, which is the "full history log per house" the requirement asks for.
-- ============================================================================

create type public.ticket_status as enum ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');
create type public.ticket_priority as enum ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

create table public.maintenance_tickets (
  id          uuid primary key default gen_random_uuid(),
  house_id    uuid not null references public.houses (id) on delete cascade,
  reported_by uuid not null references public.profiles (id) on delete cascade,
  assigned_to uuid references public.profiles (id) on delete set null,
  title       text not null,
  description text not null default '',
  category    text,
  status      public.ticket_status not null default 'OPEN',
  priority    public.ticket_priority not null default 'MEDIUM',
  photo_url   text,
  resolved_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index maintenance_tickets_house_idx on public.maintenance_tickets (house_id, created_at desc);
create index maintenance_tickets_open_idx on public.maintenance_tickets (house_id)
  where status in ('OPEN', 'IN_PROGRESS');

create trigger maintenance_tickets_set_updated_at
  before update on public.maintenance_tickets
  for each row execute function public.set_updated_at();

create table public.maintenance_ticket_events (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.maintenance_tickets (id) on delete cascade,
  actor_id    uuid references public.profiles (id) on delete set null,
  from_status public.ticket_status,
  to_status   public.ticket_status not null,
  note        text,
  created_at  timestamptz not null default now()
);

create index maintenance_ticket_events_ticket_idx
  on public.maintenance_ticket_events (ticket_id, created_at);

-- Append to the history automatically. Doing it in a trigger means the log
-- cannot be bypassed by forgetting to write it in one code path.
create or replace function public.log_ticket_status_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.maintenance_ticket_events (ticket_id, actor_id, to_status, note)
    values (new.id, new.reported_by, new.status, 'Ticket created');
  elsif new.status is distinct from old.status then
    insert into public.maintenance_ticket_events (ticket_id, actor_id, from_status, to_status)
    values (new.id, auth.uid(), old.status, new.status);
  end if;
  return null;
end;
$$;

create trigger maintenance_tickets_log_status
  after insert or update on public.maintenance_tickets
  for each row execute function public.log_ticket_status_change();

-- Stamp resolved_at whenever a ticket reaches RESOLVED.
create or replace function public.sync_ticket_resolved_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'RESOLVED' and old.status is distinct from 'RESOLVED' then
    new.resolved_at = coalesce(new.resolved_at, now());
  elsif new.status in ('OPEN', 'IN_PROGRESS') then
    new.resolved_at = null;
  end if;
  return new;
end;
$$;

create trigger maintenance_tickets_sync_resolved_at
  before update on public.maintenance_tickets
  for each row execute function public.sync_ticket_resolved_at();

alter table public.maintenance_tickets       enable row level security;
alter table public.maintenance_ticket_events enable row level security;

create policy "tickets visible to house and landlord"
  on public.maintenance_tickets for select
  to authenticated
  using (public.is_house_member(house_id) or public.is_house_admin(house_id) or public.is_platform_admin());

create policy "residents report tickets"
  on public.maintenance_tickets for insert
  to authenticated
  with check (reported_by = auth.uid() and public.is_house_member(house_id));

-- Landlord/house admin drives the status; the reporter can still edit details.
create policy "landlord or reporter updates ticket"
  on public.maintenance_tickets for update
  to authenticated
  using (public.is_house_admin(house_id) or reported_by = auth.uid())
  with check (public.is_house_admin(house_id) or reported_by = auth.uid());

-- History is read-only from the app; only the trigger writes it.
create policy "ticket history visible to house"
  on public.maintenance_ticket_events for select
  to authenticated
  using (
    exists (
      select 1 from public.maintenance_tickets t
      where t.id = ticket_id
        and (public.is_house_member(t.house_id) or public.is_house_admin(t.house_id))
    )
  );
