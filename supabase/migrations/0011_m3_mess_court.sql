-- ============================================================================
-- 0011_m3_mess_court.sql — M3.5 Mess Court (Conflict-Resolution State Machine)
-- Owner: Md. Mahidul Alam Araf
--
-- The requirement is explicit that this must be a real state machine, not a
-- CRUD table. So the legal transitions are enforced IN THE DATABASE — an
-- illegal UPDATE raises an exception no matter which code path attempts it.
--
--   RAISED ──> VOTING ──> RESOLVED ──> ARCHIVED
--     │          │                        ^
--     │          └──> ESCALATED ──────────┘
--     │                   │
--     │                   └──> RESOLVED
--     └──────────────────────> ARCHIVED
--
-- The 48-hour auto-escalation timeout is a background job — see
-- app/api/disputes/escalate/route.ts.
-- ============================================================================

create type public.dispute_state as enum ('RAISED', 'VOTING', 'RESOLVED', 'ESCALATED', 'ARCHIVED');
create type public.dispute_vote_value as enum ('FOR', 'AGAINST', 'ABSTAIN');

create table public.disputes (
  id                uuid primary key default gen_random_uuid(),
  house_id          uuid not null references public.houses (id) on delete cascade,
  raised_by         uuid not null references public.profiles (id) on delete cascade,
  against_user_id   uuid references public.profiles (id) on delete set null,
  title             text not null,
  description       text not null default '',
  category          text,
  state             public.dispute_state not null default 'RAISED',
  voting_started_at timestamptz,
  voting_deadline   timestamptz,
  resolution        text,
  resolved_at       timestamptz,
  escalated_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index disputes_house_state_idx on public.disputes (house_id, state);
-- Used by the timeout job to find ballots that ran out of time.
create index disputes_voting_deadline_idx on public.disputes (voting_deadline)
  where state = 'VOTING';

create trigger disputes_set_updated_at
  before update on public.disputes
  for each row execute function public.set_updated_at();

create table public.dispute_votes (
  id         uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.disputes (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  vote       public.dispute_vote_value not null,
  comment    text,
  created_at timestamptz not null default now(),
  unique (dispute_id, user_id)
);

create table public.dispute_events (
  id         uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.disputes (id) on delete cascade,
  actor_id   uuid references public.profiles (id) on delete set null,
  from_state public.dispute_state,
  to_state   public.dispute_state not null,
  note       text,
  created_at timestamptz not null default now()
);

create index dispute_events_dispute_idx on public.dispute_events (dispute_id, created_at);

-- ── The state machine itself ────────────────────────────────────────────────
create or replace function public.dispute_transition_allowed(
  p_from public.dispute_state,
  p_to   public.dispute_state
)
returns boolean
language sql immutable
as $$
  select case p_from
    when 'RAISED'    then p_to in ('VOTING', 'ARCHIVED')
    when 'VOTING'    then p_to in ('RESOLVED', 'ESCALATED', 'ARCHIVED')
    when 'RESOLVED'  then p_to in ('ARCHIVED')
    when 'ESCALATED' then p_to in ('RESOLVED', 'ARCHIVED')
    when 'ARCHIVED'  then false          -- terminal
    else false
  end;
$$;

create or replace function public.enforce_dispute_transition()
returns trigger
language plpgsql
as $$
begin
  if new.state is distinct from old.state then
    if not public.dispute_transition_allowed(old.state, new.state) then
      raise exception
        'Illegal Mess Court transition: % -> %', old.state, new.state
        using errcode = '23514';
    end if;

    -- Timestamps that belong to the transition, not to the caller.
    if new.state = 'VOTING' then
      new.voting_started_at := coalesce(new.voting_started_at, now());
      new.voting_deadline   := coalesce(new.voting_deadline, now() + interval '48 hours');
    elsif new.state = 'RESOLVED' then
      new.resolved_at := coalesce(new.resolved_at, now());
    elsif new.state = 'ESCALATED' then
      new.escalated_at := coalesce(new.escalated_at, now());
    end if;
  end if;
  return new;
end;
$$;

create trigger disputes_enforce_transition
  before update on public.disputes
  for each row execute function public.enforce_dispute_transition();

-- Audit trail of every state change — the evidence that the machine ran.
create or replace function public.log_dispute_transition()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.dispute_events (dispute_id, actor_id, to_state, note)
    values (new.id, new.raised_by, new.state, 'Dispute raised');
  elsif new.state is distinct from old.state then
    insert into public.dispute_events (dispute_id, actor_id, from_state, to_state)
    values (new.id, auth.uid(), old.state, new.state);
  end if;
  return null;
end;
$$;

create trigger disputes_log_transition
  after insert or update on public.disputes
  for each row execute function public.log_dispute_transition();

alter table public.disputes       enable row level security;
alter table public.dispute_votes  enable row level security;
alter table public.dispute_events enable row level security;

create policy "disputes visible to house and landlord"
  on public.disputes for select
  to authenticated
  using (public.is_house_member(house_id) or public.is_house_admin(house_id) or public.is_platform_admin());

create policy "members raise disputes"
  on public.disputes for insert
  to authenticated
  with check (raised_by = auth.uid() and public.is_house_member(house_id) and state = 'RAISED');

-- Anyone in the house can drive the machine forward; the trigger above is what
-- stops them from driving it somewhere illegal. Escalated disputes are the
-- landlord's / platform admin's to settle.
create policy "house drives the state machine"
  on public.disputes for update
  to authenticated
  using (public.is_house_member(house_id) or public.is_house_admin(house_id) or public.is_platform_admin())
  with check (public.is_house_member(house_id) or public.is_house_admin(house_id) or public.is_platform_admin());

create policy "dispute votes visible to house"
  on public.dispute_votes for select
  to authenticated
  using (
    exists (
      select 1 from public.disputes d
      where d.id = dispute_id and public.is_house_member(d.house_id)
    )
  );

-- Votes only count while the dispute is actually in VOTING.
create policy "members vote once while voting is open"
  on public.dispute_votes for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.disputes d
      where d.id = dispute_id
        and public.is_house_member(d.house_id)
        and d.state = 'VOTING'
        and (d.voting_deadline is null or d.voting_deadline > now())
    )
  );

create policy "members change own dispute vote"
  on public.dispute_votes for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "dispute history visible to house"
  on public.dispute_events for select
  to authenticated
  using (
    exists (
      select 1 from public.disputes d
      where d.id = dispute_id
        and (public.is_house_member(d.house_id) or public.is_house_admin(d.house_id))
    )
  );
