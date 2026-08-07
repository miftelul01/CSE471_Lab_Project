-- ============================================================================
-- 0006_m2_menu_voting.sql — M2.2 Weekly Menu Proposal & Voting System
-- Owner: Mahia Tanzin
--
-- Residents propose a week's meal plan; housemates vote; the winner becomes
-- the official menu. A partial unique index enforces the real business rule:
-- at most ONE approved proposal per house per week.
-- ============================================================================

create type public.proposal_status as enum ('DRAFT', 'OPEN', 'APPROVED', 'REJECTED');
create type public.meal_type as enum ('BREAKFAST', 'LUNCH', 'DINNER');

create table public.menu_proposals (
  id               uuid primary key default gen_random_uuid(),
  house_id         uuid not null references public.houses (id) on delete cascade,
  proposed_by      uuid not null references public.profiles (id) on delete cascade,
  title            text not null,
  week_start_date  date not null,          -- always the Monday of that week
  status           public.proposal_status not null default 'OPEN',
  voting_closes_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index menu_proposals_house_week_idx on public.menu_proposals (house_id, week_start_date desc);

-- Only one winning menu per house per week.
create unique index menu_proposals_one_approved_per_week
  on public.menu_proposals (house_id, week_start_date)
  where status = 'APPROVED';

create trigger menu_proposals_set_updated_at
  before update on public.menu_proposals
  for each row execute function public.set_updated_at();

create table public.menu_proposal_items (
  id          uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.menu_proposals (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),  -- 0 = Monday
  meal_type   public.meal_type not null,
  description text not null,
  unique (proposal_id, day_of_week, meal_type)
);

create table public.menu_votes (
  id          uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.menu_proposals (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  vote        smallint not null check (vote in (-1, 1)),  -- -1 against, +1 for
  created_at  timestamptz not null default now(),
  unique (proposal_id, user_id)   -- one vote per person, no ballot stuffing
);

alter table public.menu_proposals      enable row level security;
alter table public.menu_proposal_items enable row level security;
alter table public.menu_votes          enable row level security;

create policy "proposals visible to house"
  on public.menu_proposals for select
  to authenticated
  using (public.is_house_member(house_id) or public.is_platform_admin());

create policy "members propose menus"
  on public.menu_proposals for insert
  to authenticated
  with check (proposed_by = auth.uid() and public.is_house_member(house_id));

create policy "proposer or house admin edits proposal"
  on public.menu_proposals for update
  to authenticated
  using (proposed_by = auth.uid() or public.is_house_admin(house_id))
  with check (proposed_by = auth.uid() or public.is_house_admin(house_id));

create policy "proposer deletes own proposal"
  on public.menu_proposals for delete
  to authenticated
  using (proposed_by = auth.uid() or public.is_house_admin(house_id));

create policy "proposal items follow proposal"
  on public.menu_proposal_items for select
  to authenticated
  using (
    exists (
      select 1 from public.menu_proposals p
      where p.id = proposal_id and public.is_house_member(p.house_id)
    )
  );

create policy "proposer writes items"
  on public.menu_proposal_items for all
  to authenticated
  using (
    exists (
      select 1 from public.menu_proposals p
      where p.id = proposal_id and p.proposed_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.menu_proposals p
      where p.id = proposal_id and p.proposed_by = auth.uid()
    )
  );

-- Votes are visible house-wide (the tally is the whole point) but you can only
-- cast and change your own.
create policy "votes visible to house"
  on public.menu_votes for select
  to authenticated
  using (
    exists (
      select 1 from public.menu_proposals p
      where p.id = proposal_id and public.is_house_member(p.house_id)
    )
  );

create policy "members cast own vote"
  on public.menu_votes for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.menu_proposals p
      where p.id = proposal_id and public.is_house_member(p.house_id) and p.status = 'OPEN'
    )
  );

create policy "members change own vote"
  on public.menu_votes for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "members retract own vote"
  on public.menu_votes for delete
  to authenticated
  using (user_id = auth.uid());
