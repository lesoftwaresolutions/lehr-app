-- ============================================================================
-- LEHR — Stripe subscription billing
-- ============================================================================
-- Applied to project drhseqszhnnbeifvpfmx on 2026-09-06 (version 20260906140828).
--
-- This is the EXACT SQL that was applied. The original draft also contained a
-- "grandfather" data UPDATE that flipped every existing `trial` company to
-- active / professional / employee_limit 30. That was intentionally OMITTED:
-- by the time of apply the DB held 7 trial companies (test data), and all of
-- them should go through the normal /choose-plan -> Stripe Checkout flow.
--
-- If you ever need to grandfather ONE specific company manually, run:
--   update public.companies
--   set subscription_status='active', plan='professional', employee_limit=30
--   where id = '<company-uuid>';
--
-- Design notes:
--   * Stripe identifiers (customer id, subscription id) live ONLY in the new
--     `public.subscriptions` table, which is readable by the company owner and
--     nobody else. They are deliberately kept OFF `public.companies` because the
--     "Kiosk Company Read" policy exposes every `companies` row to `anon`.
--   * `companies` carries only the coarse, non-sensitive fields the UI gate and
--     the employee-limit check need: `subscription_status`, `plan`,
--     `employee_limit`. The Stripe webhook (service role) is the sole writer.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. companies: widen status check + add plan / employee_limit
-- ---------------------------------------------------------------------------
alter table public.companies
  drop constraint if exists companies_subscription_status_check;

alter table public.companies
  add constraint companies_subscription_status_check
  check (subscription_status in (
    'trial',              -- registered, has NOT completed Checkout yet
    'trialing',           -- inside the 14-day Stripe trial
    'active',             -- paying
    'past_due',           -- payment failed, Stripe still retrying (grace access)
    'unpaid',             -- retries exhausted
    'cancelled',          -- subscription ended
    'incomplete',         -- first payment not finalised
    'incomplete_expired', -- first payment never finalised
    'paused'              -- Stripe pause collection
  ));

alter table public.companies
  add column if not exists plan text
    check (plan in ('micro', 'growth', 'professional'));

alter table public.companies
  add column if not exists employee_limit integer not null default 0;

comment on column public.companies.plan is
  'Denormalised current plan tier. Written only by the Stripe webhook.';
comment on column public.companies.employee_limit is
  'Max active employees allowed by the current plan. 0 = no active subscription. Written only by the Stripe webhook.';

-- ---------------------------------------------------------------------------
-- 2. subscriptions: full Stripe state, owner-readable only
-- ---------------------------------------------------------------------------
create table if not exists public.subscriptions (
  company_id             uuid primary key
                           references public.companies(id) on delete cascade,
  stripe_customer_id     text not null,
  stripe_subscription_id text unique,
  stripe_price_id        text,
  plan                   text check (plan in ('micro', 'growth', 'professional')),
  status                 text not null,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  trial_end              timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists subscriptions_stripe_customer_id_idx
  on public.subscriptions (stripe_customer_id);
create index if not exists subscriptions_stripe_subscription_id_idx
  on public.subscriptions (stripe_subscription_id);

alter table public.subscriptions enable row level security;

-- Owner can read their own company's subscription. No INSERT/UPDATE/DELETE
-- policies -> only the service-role key (Stripe webhook) can write.
drop policy if exists "Owner reads own subscription" on public.subscriptions;
create policy "Owner reads own subscription"
  on public.subscriptions for select
  to authenticated
  using (
    company_id in (
      select id from public.companies where owner_id = auth.uid()
    )
  );

-- keep updated_at fresh
create or replace function public.touch_subscriptions_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_subscriptions_updated_at on public.subscriptions;
create trigger trg_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.touch_subscriptions_updated_at();

commit;
