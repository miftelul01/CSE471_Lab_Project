-- ============================================================================
-- 0003_m1_matching.sql — M1.2 Smart Roommate & House Matching
-- Owner: Mahia Tanzin
--
-- Lifestyle preference profile, computed compatibility matches, saved
-- favourites, and formal join requests. The scoring/stable-matching logic
-- itself lives in lib/matching.ts.
-- ============================================================================

create type public.join_request_status as enum ('PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');

-- One preference profile per user — hence user_id IS the primary key.
create table public.preferences (
  user_id        uuid primary key references public.profiles (id) on delete cascade,
  budget_min     numeric(10, 2) not null check (budget_min >= 0),
  budget_max     numeric(10, 2) not null check (budget_max >= 0),
  sleep_schedule public.sleep_schedule not null,
  cleanliness    public.cleanliness_level not null,
  smoking_ok     boolean not null default false,
  pets_ok        boolean not null default false,
  preferred_area text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint preferences_budget_range check (budget_min <= budget_max)
);

create trigger preferences_set_updated_at
  before update on public.preferences
  for each row execute function public.set_updated_at();

-- Cached output of the matching run. Rewritten each time matching re-runs.
create table public.matches (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles (id) on delete cascade,
  listing_id          uuid not null references public.listings (id) on delete cascade,
  compatibility_score numeric(4, 3) not null check (compatibility_score between 0 and 1),
  rank                integer not null,
  created_at          timestamptz not null default now(),
  unique (user_id, listing_id)
);

create index matches_user_rank_idx on public.matches (user_id, rank);

create table public.favorites (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, listing_id)
);

create table public.join_requests (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  status     public.join_request_status not null default 'PENDING',
  message    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index join_requests_listing_idx on public.join_requests (listing_id);
-- A user may re-apply after being rejected, but only one live request at a time.
create unique index join_requests_one_open_per_listing
  on public.join_requests (user_id, listing_id)
  where status = 'PENDING';

create trigger join_requests_set_updated_at
  before update on public.join_requests
  for each row execute function public.set_updated_at();

alter table public.preferences   enable row level security;
alter table public.matches       enable row level security;
alter table public.favorites     enable row level security;
alter table public.join_requests enable row level security;

-- preferences / matches / favorites are strictly private to their owner.
create policy "own preferences" on public.preferences for all
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own matches" on public.matches for all
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own favorites" on public.favorites for all
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Join requests are two-sided: the applicant AND the listing's landlord.
create policy "join requests visible to applicant and landlord"
  on public.join_requests for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.listings l
      where l.id = listing_id and l.landlord_id = auth.uid()
    )
    or public.is_platform_admin()
  );

create policy "applicants create join requests"
  on public.join_requests for insert
  to authenticated
  with check (user_id = auth.uid());

-- Applicant can WITHDRAW; landlord can ACCEPT/REJECT.
create policy "applicant or landlord updates join request"
  on public.join_requests for update
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.listings l
      where l.id = listing_id and l.landlord_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.listings l
      where l.id = listing_id and l.landlord_id = auth.uid()
    )
  );
