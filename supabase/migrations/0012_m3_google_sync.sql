-- ============================================================================
-- 0012_m3_google_sync.sql — M3.4 Google Tasks + M3.6 Google Calendar
-- Owners: Mahia Tanzin (Tasks) / Md. Mahidul Alam Araf (Calendar)
--
-- Google SSO alone does not give you a refresh token for the Tasks/Calendar
-- scopes, so tokens are stored here after a separate consent step.
-- ============================================================================

create table public.google_credentials (
  user_id       uuid primary key references public.profiles (id) on delete cascade,
  access_token  text,
  refresh_token text,
  expires_at    timestamptz,
  scopes        text[] not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger google_credentials_set_updated_at
  before update on public.google_credentials
  for each row execute function public.set_updated_at();

-- Mirror of what has been pushed to the shared house Google Calendar, so a
-- re-sync updates the existing event instead of creating duplicates.
create table public.calendar_events (
  id              uuid primary key default gen_random_uuid(),
  house_id        uuid not null references public.houses (id) on delete cascade,
  -- Which feature produced this event: 'RENT_DUE' | 'GUEST' | 'DISPUTE' | 'CHORE' | 'MEAL'
  source_type     text not null,
  source_id       uuid,
  title           text not null,
  description     text,
  starts_at       timestamptz not null,
  ends_at         timestamptz,
  google_event_id text,
  synced_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index calendar_events_house_idx on public.calendar_events (house_id, starts_at);
create unique index calendar_events_source_unique
  on public.calendar_events (source_type, source_id)
  where source_id is not null;

create trigger calendar_events_set_updated_at
  before update on public.calendar_events
  for each row execute function public.set_updated_at();

alter table public.google_credentials enable row level security;
alter table public.calendar_events    enable row level security;

-- google_credentials intentionally has NO policies for `authenticated`. RLS is
-- on and nothing is granted, so the table is unreadable from the browser even
-- with a valid session. Only the service-role client (lib/supabase/admin.ts)
-- can touch OAuth tokens. Do not "fix" this by adding a select policy.

create policy "calendar events visible to house"
  on public.calendar_events for select
  to authenticated
  using (public.is_house_member(house_id) or public.is_house_admin(house_id));

create policy "house admin manages calendar events"
  on public.calendar_events for all
  to authenticated
  using (public.is_house_admin(house_id))
  with check (public.is_house_admin(house_id));
