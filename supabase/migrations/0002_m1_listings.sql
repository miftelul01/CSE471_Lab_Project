-- ============================================================================
-- 0002_m1_listings.sql — M1.1 Property & Room Listing Engine
-- Owner: Miftelul Mehebub
--
-- Landlords/house admins post rooms; prospective residents search and filter
-- them. Also defines the lifestyle enums that the matching engine (0003) and
-- the Google Maps view (M3.3) reuse.
-- ============================================================================

create type public.sleep_schedule as enum ('EARLY_BIRD', 'NIGHT_OWL', 'FLEXIBLE');
create type public.cleanliness_level as enum ('VERY_TIDY', 'MODERATE', 'RELAXED');
create type public.room_type as enum ('SINGLE', 'SHARED', 'MASTER', 'SEAT', 'ENTIRE_FLAT');

create table public.listings (
  id             uuid primary key default gen_random_uuid(),
  landlord_id    uuid not null references public.profiles (id) on delete cascade,
  house_id       uuid references public.houses (id) on delete set null,
  title          text not null,
  description    text not null default '',
  rent           numeric(10, 2) not null check (rent >= 0),
  area           text not null,
  address        text,
  room_type      public.room_type not null default 'SINGLE',
  capacity       integer not null default 1 check (capacity > 0),
  amenities      text[] not null default '{}',
  -- Populated by the Google Maps integration (M3.3, Mahia).
  latitude       double precision,
  longitude      double precision,
  is_active      boolean not null default true,
  -- Aggregate lifestyle signal for the house, used by the matching engine.
  sleep_schedule public.sleep_schedule,
  cleanliness    public.cleanliness_level,
  allows_smoking boolean,
  allows_pets    boolean,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index listings_landlord_id_idx on public.listings (landlord_id);
create index listings_area_idx on public.listings (lower(area));
create index listings_rent_idx on public.listings (rent) where is_active;

create trigger listings_set_updated_at
  before update on public.listings
  for each row execute function public.set_updated_at();

alter table public.listings enable row level security;

-- Listings are the public shopfront: anyone signed in can browse active ones.
create policy "active listings are browsable"
  on public.listings for select
  to authenticated
  using (is_active or landlord_id = auth.uid() or public.is_platform_admin());

create policy "landlords create own listings"
  on public.listings for insert
  to authenticated
  with check (landlord_id = auth.uid());

create policy "landlords update own listings"
  on public.listings for update
  to authenticated
  using (landlord_id = auth.uid() or public.is_platform_admin())
  with check (landlord_id = auth.uid() or public.is_platform_admin());

create policy "landlords delete own listings"
  on public.listings for delete
  to authenticated
  using (landlord_id = auth.uid() or public.is_platform_admin());
