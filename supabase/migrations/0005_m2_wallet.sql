-- ============================================================================
-- 0005_m2_wallet.sql — M2.1 Shared Wallet & Bill-Splitting Engine
-- Owner: Miftelul Mehebub
--
-- An expense is one purchase; expense_shares is the per-person ledger derived
-- from it. Splitting EQUAL vs CUSTOM is a decision the API makes when it
-- writes the shares — the DB only enforces that the shares add up.
-- ============================================================================

create type public.split_method as enum ('EQUAL', 'CUSTOM', 'SHARES');
create type public.expense_category as enum ('RENT', 'UTILITIES', 'GROCERIES', 'MAINTENANCE', 'OTHER');
create type public.share_status as enum ('PENDING', 'PAID', 'WAIVED');

create table public.expenses (
  id           uuid primary key default gen_random_uuid(),
  house_id     uuid not null references public.houses (id) on delete cascade,
  created_by   uuid not null references public.profiles (id) on delete cascade,
  title        text not null,
  description  text,
  amount       numeric(12, 2) not null check (amount > 0),
  category     public.expense_category not null default 'OTHER',
  split_method public.split_method not null default 'EQUAL',
  spent_on     date not null default current_date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index expenses_house_date_idx on public.expenses (house_id, spent_on desc);

create trigger expenses_set_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();

create table public.expense_shares (
  id         uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  amount     numeric(12, 2) not null check (amount >= 0),
  status     public.share_status not null default 'PENDING',
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (expense_id, user_id)
);

create index expense_shares_user_status_idx on public.expense_shares (user_id, status);

create trigger expense_shares_set_updated_at
  before update on public.expense_shares
  for each row execute function public.set_updated_at();

-- Keeps settled_at honest without the API having to remember it.
create or replace function public.sync_share_settled_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'PAID' and old.status is distinct from 'PAID' then
    new.settled_at = coalesce(new.settled_at, now());
  elsif new.status <> 'PAID' then
    new.settled_at = null;
  end if;
  return new;
end;
$$;

create trigger expense_shares_sync_settled_at
  before update on public.expense_shares
  for each row execute function public.sync_share_settled_at();

-- Running ledger per house: who owes what, who has paid. Read-only view, so
-- the wallet dashboard is one query instead of a pile of client-side maths.
create view public.house_balances
with (security_invoker = true)
as
select
  e.house_id,
  s.user_id,
  p.full_name,
  sum(s.amount)                                                     as total_owed,
  sum(s.amount) filter (where s.status = 'PAID')                    as total_paid,
  sum(s.amount) filter (where s.status = 'PENDING')                 as outstanding
from public.expense_shares s
join public.expenses e on e.id = s.expense_id
join public.profiles p on p.id = s.user_id
group by e.house_id, s.user_id, p.full_name;

alter table public.expenses       enable row level security;
alter table public.expense_shares enable row level security;

create policy "expenses visible to house"
  on public.expenses for select
  to authenticated
  using (public.is_house_member(house_id) or public.is_house_admin(house_id) or public.is_platform_admin());

-- "any resident can add shared expenses" — straight from the requirements.
create policy "members add expenses"
  on public.expenses for insert
  to authenticated
  with check (created_by = auth.uid() and public.is_house_member(house_id));

create policy "author or house admin edits expense"
  on public.expenses for update
  to authenticated
  using (created_by = auth.uid() or public.is_house_admin(house_id))
  with check (created_by = auth.uid() or public.is_house_admin(house_id));

create policy "author or house admin deletes expense"
  on public.expenses for delete
  to authenticated
  using (created_by = auth.uid() or public.is_house_admin(house_id));

create policy "shares visible to house"
  on public.expense_shares for select
  to authenticated
  using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.is_house_member(e.house_id)
    )
    or user_id = auth.uid()
    or public.is_platform_admin()
  );

create policy "expense author writes shares"
  on public.expense_shares for insert
  to authenticated
  with check (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and (e.created_by = auth.uid() or public.is_house_admin(e.house_id))
    )
  );

-- You may mark YOUR OWN share paid (cash settlement); the expense author or
-- house admin may adjust anyone's. Card/bKash payments go through M3.2 and
-- flip this via the service-role webhook instead.
create policy "settle own share or admin adjusts"
  on public.expense_shares for update
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.expenses e
      where e.id = expense_id and (e.created_by = auth.uid() or public.is_house_admin(e.house_id))
    )
  )
  with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.expenses e
      where e.id = expense_id and (e.created_by = auth.uid() or public.is_house_admin(e.house_id))
    )
  );

create policy "expense author deletes shares"
  on public.expense_shares for delete
  to authenticated
  using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and (e.created_by = auth.uid() or public.is_house_admin(e.house_id))
    )
  );
