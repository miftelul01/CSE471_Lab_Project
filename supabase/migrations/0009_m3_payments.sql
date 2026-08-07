-- ============================================================================
-- 0009_m3_payments.sql — M3.2 Payment Integration (bKash / Stripe)
-- Owner: Miftelul Mehebub
--
-- Wires into M2.1's expense_shares: paying a share flips its ledger status to
-- PAID automatically (via trigger), which is exactly what the requirement
-- specifies. Provider callbacks are verified server-side and written with the
-- SERVICE ROLE client — a webhook has no logged-in user, so RLS is bypassed
-- there deliberately.
-- ============================================================================

create type public.payment_provider as enum ('BKASH', 'STRIPE', 'CASH', 'MANUAL');
create type public.payment_status as enum ('INITIATED', 'PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED');

create table public.payments (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles (id) on delete cascade,
  house_id            uuid references public.houses (id) on delete set null,
  expense_share_id    uuid references public.expense_shares (id) on delete set null,
  provider            public.payment_provider not null,
  status              public.payment_status not null default 'INITIATED',
  amount              numeric(12, 2) not null check (amount > 0),
  currency            text not null default 'BDT',
  provider_payment_id text,
  -- Raw gateway response, kept for debugging and reconciliation.
  provider_payload    jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index payments_user_idx on public.payments (user_id, created_at desc);
create index payments_share_idx on public.payments (expense_share_id);

-- Idempotency: a gateway that retries its webhook must not create a second
-- payment row for the same transaction.
create unique index payments_provider_txn_unique
  on public.payments (provider, provider_payment_id)
  where provider_payment_id is not null;

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

-- "Upon successful payment, the user's ledger status automatically updates to
-- paid." Implemented here so it holds no matter which code path confirms it.
create or replace function public.apply_successful_payment()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status = 'SUCCEEDED'
     and old.status is distinct from 'SUCCEEDED'
     and new.expense_share_id is not null then
    update public.expense_shares
    set status = 'PAID', settled_at = now()
    where id = new.expense_share_id;
  end if;
  return null;
end;
$$;

create trigger payments_apply_to_ledger
  after update on public.payments
  for each row execute function public.apply_successful_payment();

alter table public.payments enable row level security;

create policy "own payments visible"
  on public.payments for select
  to authenticated
  using (
    user_id = auth.uid()
    or (house_id is not null and public.is_house_admin(house_id))
    or public.is_platform_admin()
  );

create policy "users start own payments"
  on public.payments for insert
  to authenticated
  with check (user_id = auth.uid());

-- Note there is NO update policy for `authenticated` on purpose: a user must
-- not be able to set their own payment to SUCCEEDED from the browser. Only the
-- verified webhook (service role) may advance payment status.
