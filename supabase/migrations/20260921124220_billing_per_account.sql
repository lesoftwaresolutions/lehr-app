-- ============================================================================
-- LEHR — billing per ACCOUNT (owner), not per company
-- ============================================================================
-- One subscription per login (the company owner) covers every company that
-- login owns. Employee limits are counted in total across those companies.
--
-- Design:
--   * public.subscriptions is keyed by user_id (auth.users). It is the source
--     of truth and is written only by the Stripe webhook (service role).
--   * companies.subscription_status / plan / employee_limit stay as READ-ONLY
--     copies of the owner's subscription so the UI gate keeps working. The
--     webhook fans a change out to every company the owner has, and a trigger
--     gives newly created companies the same values.
--   * ks.cheran94@gmail.com is the DEVELOPER account: billing_exempt = true gives it
--     full access with no payment and no employee limit. The webhook never
--     overwrites an exempt account's status, plan or limit.
--   * A BEFORE trigger stops API users (anon / authenticated) from writing those
--     three columns directly, so nobody can unlock the app by editing their own
--     company row from the browser. service_role and SQL-editor sessions are
--     unaffected.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. subscriptions: key by user instead of company
-- ---------------------------------------------------------------------------
alter table public.subscriptions
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.subscriptions
  add column if not exists app_status text not null default 'trial';
alter table public.subscriptions
  add column if not exists employee_limit integer not null default 0;
alter table public.subscriptions
  add column if not exists billing_exempt boolean not null default false;

-- Carry the owner and the current denormalised values over from each row's company.
update public.subscriptions s
set user_id        = c.owner_id,
    app_status     = c.subscription_status,
    employee_limit = c.employee_limit
from public.companies c
where c.id = s.company_id;

-- An account can only have one subscription row. If an owner has several
-- (e.g. a placeholder created by clicking a plan from a second company), keep the
-- one that has a real Stripe subscription, otherwise the most recent.
delete from public.subscriptions s
where exists (
  select 1 from public.subscriptions o
  where o.user_id = s.user_id
    and o.company_id <> s.company_id
    and (
      (o.stripe_subscription_id is not null and s.stripe_subscription_id is null)
      or (
        (o.stripe_subscription_id is not null) = (s.stripe_subscription_id is not null)
        and o.updated_at > s.updated_at
      )
    )
);

-- Safety net: abort (nothing is changed) if rows still can't be made one-per-user.
do $$
begin
  if exists (select 1 from public.subscriptions where user_id is null) then
    raise exception 'billing_per_account: subscriptions rows without an owner';
  end if;
  if exists (select 1 from public.subscriptions group by user_id having count(*) > 1) then
    raise exception 'billing_per_account: an owner still has more than one subscription row';
  end if;
end $$;

drop policy if exists "Owner reads own subscription" on public.subscriptions;
alter table public.subscriptions drop constraint subscriptions_pkey;
alter table public.subscriptions drop column company_id;
alter table public.subscriptions alter column user_id set not null;
alter table public.subscriptions add primary key (user_id);

alter table public.subscriptions
  add constraint subscriptions_app_status_check
  check (app_status in (
    'trial', 'trialing', 'active', 'past_due', 'unpaid',
    'cancelled', 'incomplete', 'incomplete_expired', 'paused'
  ));

-- The owner can read their own subscription. No write policies: webhook only.
create policy "Owner reads own subscription"
  on public.subscriptions for select
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. companies: billing columns are read-only copies for API users
-- ---------------------------------------------------------------------------
create or replace function public.companies_protect_billing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  s record;
begin
  if v_role in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      -- a new company inherits its owner's subscription (or starts as 'trial')
      select app_status, plan, employee_limit into s
      from public.subscriptions where user_id = new.owner_id;
      if found then
        new.subscription_status := s.app_status;
        new.plan                := s.plan;
        new.employee_limit      := s.employee_limit;
      else
        new.subscription_status := 'trial';
        new.plan                := null;
        new.employee_limit      := 0;
      end if;
    else
      -- API users cannot change these columns on an existing company
      new.subscription_status := old.subscription_status;
      new.plan                := old.plan;
      new.employee_limit      := old.employee_limit;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists companies_protect_billing on public.companies;
create trigger companies_protect_billing
  before insert or update on public.companies
  for each row execute function public.companies_protect_billing();

-- ---------------------------------------------------------------------------
-- 3. Developer account: full access, no payment, no employee limit
-- ---------------------------------------------------------------------------
do $$
declare v_rows integer;
begin
  update public.subscriptions s
  set billing_exempt = true,
      app_status     = 'active',
      plan           = 'professional',
      employee_limit = 100000
  from auth.users u
  where u.id = s.user_id
    and lower(u.email) = 'ks.cheran94@gmail.com';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'billing_per_account: developer account subscription row not found (updated % rows)', v_rows;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Fan the existing subscription out to every company its owner has
-- ---------------------------------------------------------------------------
update public.companies c
set subscription_status = s.app_status,
    plan                = s.plan,
    employee_limit      = s.employee_limit
from public.subscriptions s
where s.user_id = c.owner_id;

commit;
