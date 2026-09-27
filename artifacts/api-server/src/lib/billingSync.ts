import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getStripe, getBillingSupabaseAdmin, stripeKeyIsLive } from "./clients";
import { EMPLOYEE_LIMITS, mapStripeStatus, planForPriceId, type PlanId } from "./plans";

// Billing is per ACCOUNT: one subscription per user (the company owner) covers
// every company that user owns. public.subscriptions is keyed by user_id and is
// the source of truth; the owner's companies get a read-only copy of the status,
// plan and employee limit so the UI gate keeps working.
//
// Webhook safety rules implemented here:
//   1. Every event is only a HINT to look at a subscription. The state that is
//      written is always re-read from Stripe, so duplicated, delayed or
//      out-of-order events all converge on the current truth and an old event can
//      never overwrite newer billing information.
//   2. Processing is idempotent: running it twice for the same subscription writes
//      the same values.
//   3. An account has ONE current subscription. If a second live one appears (e.g.
//      two Checkout sessions were both paid) it is REPORTED, never cancelled: it may
//      belong to a real customer. A deterministic rule picks the current one and the
//      account's row can never silently switch to the other.
//   4. Events from the other Stripe mode (test vs live) are ignored.

export const LIVE_STATUSES = ["trialing", "active", "past_due"];

/** Retrieve a subscription; null if it no longer exists (e.g. its customer was deleted). */
async function retrieveSubscriptionOrNull(stripe: Stripe, id: string): Promise<Stripe.Subscription | null> {
  try {
    return await stripe.subscriptions.retrieve(id);
  } catch (e: any) {
    if (e?.code === "resource_missing") return null;
    throw e;
  }
}

function customerIdOf(subscription: Stripe.Subscription): string {
  return typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
}

/** Which of an account's live subscriptions to keep: the one already recorded, else the oldest. */
export function pickSubscriptionToKeep(
  liveSubs: { id: string; created: number }[],
  recordedId: string | null | undefined,
): string {
  if (recordedId && liveSubs.some((s) => s.id === recordedId)) return recordedId;
  return [...liveSubs].sort((a, b) => a.created - b.created || a.id.localeCompare(b.id))[0].id;
}

/** Which user owns this subscription? Tries the newest tagging first, then legacy ones. */
async function resolveUserId(
  supabase: SupabaseClient,
  subscription: Stripe.Subscription,
): Promise<string | null> {
  const md = subscription.metadata ?? {};
  if (md.user_id) return md.user_id;

  const { data: bySub } = await supabase
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle();
  if (bySub?.user_id) return bySub.user_id;

  const { data: byCustomer } = await supabase
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", customerIdOf(subscription))
    .maybeSingle();
  if (byCustomer?.user_id) return byCustomer.user_id;

  // Subscriptions created before billing moved to accounts were tagged with a company.
  if (md.company_id) {
    const { data: company } = await supabase
      .from("companies")
      .select("owner_id")
      .eq("id", md.company_id)
      .maybeSingle();
    if (company?.owner_id) return company.owner_id;
  }
  return null;
}

/** Copy the account's billing state onto every company the user owns. */
async function fanOutToCompanies(
  supabase: SupabaseClient,
  userId: string,
  state: { subscription_status: string; plan: PlanId | null; employee_limit: number },
) {
  const { error } = await supabase.from("companies").update(state).eq("owner_id", userId);
  if (error) throw new Error(`companies update failed: ${error.message}`);
}

/** Mask a Stripe id for logs and reports: "sub_1UIZ…". */
export function maskId(id: string | null | undefined): string {
  return id ? `${id.slice(0, 8)}…` : "none";
}

/**
 * Decide which live subscription the application treats as CURRENT when a customer
 * has more than one (trialing / active / past_due). This NEVER cancels or changes
 * anything in Stripe: an extra subscription may be a real customer's, so it is only
 * reported (masked ids, in the log) and left for a human to resolve.
 *
 * Deterministic rule (pickSubscriptionToKeep): the subscription already recorded for
 * the account wins while it is still live; otherwise the OLDEST live one (created,
 * then id). Because the recorded one always wins, a newer subscription can never
 * silently take over the account's row.
 */
async function resolveCurrentSubscription(
  stripe: Stripe,
  customerId: string,
  recordedId: string | null | undefined,
): Promise<string | null> {
  let live: Stripe.Subscription[];
  try {
    const list = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 20 });
    live = list.data.filter((s) => LIVE_STATUSES.includes(s.status));
  } catch (e: any) {
    if (e?.code === "resource_missing") return null; // customer no longer exists
    throw e;
  }
  if (live.length === 0) return null;
  const keepId = pickSubscriptionToKeep(live, recordedId);
  const others = live.filter((s) => s.id !== keepId);
  if (others.length > 0) {
    console.error(
      `[billing sync] CONFLICT: customer ${maskId(customerId)} has ${live.length} live subscriptions. ` +
        `Treating ${maskId(keepId)} as current; NOT cancelling ${others.map((s) => maskId(s.id)).join(", ")} — needs manual review.`,
    );
  }
  return keepId;
}

/** Expire any still-open Checkout sessions for a customer (so a second one can't be paid later). */
export async function expireOpenCheckoutSessions(
  customerId: string,
  exceptSessionId?: string,
): Promise<number> {
  const stripe = getStripe();
  let open: Stripe.ApiList<Stripe.Checkout.Session>;
  try {
    open = await stripe.checkout.sessions.list({ customer: customerId, status: "open", limit: 20 });
  } catch (e: any) {
    if (e?.code === "resource_missing") return 0;
    throw e;
  }
  let expired = 0;
  for (const s of open.data) {
    if (s.id === exceptSessionId) continue;
    try {
      await stripe.checkout.sessions.expire(s.id);
      expired++;
    } catch (e: any) {
      console.warn(`[billing sync] could not expire session ${s.id}: ${e?.message}`);
    }
  }
  return expired;
}

/**
 * The single writer of billing state. Given a Stripe subscription id (an event's
 * object is only used for its id), read the CURRENT subscription from Stripe and
 * write it to the owner's subscription row, then fan it out to their companies.
 */
export async function syncSubscriptionToDb(
  subscriptionOrId: string | Stripe.Subscription,
): Promise<void> {
  const stripe = getStripe();
  const supabase = getBillingSupabaseAdmin();
  const subId = typeof subscriptionOrId === "string" ? subscriptionOrId : subscriptionOrId.id;

  let subscription = await retrieveSubscriptionOrNull(stripe, subId);
  if (!subscription) {
    console.warn(`[billing sync] subscription ${subId} not found in this Stripe mode; ignoring`);
    return;
  }

  // A test-mode object must never change live data (or the reverse).
  if (subscription.livemode !== stripeKeyIsLive()) {
    console.warn(`[billing sync] ignoring ${subId}: livemode mismatch`);
    return;
  }

  const userId = await resolveUserId(supabase, subscription);
  if (!userId) {
    console.error(`[billing sync] No owner found for subscription ${subscription.id}; skipping.`);
    return;
  }

  const { data: existing } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id, app_status, plan, employee_limit, billing_exempt")
    .eq("user_id", userId)
    .maybeSingle();

  // One CURRENT subscription per account. If a second live one exists, keep syncing the
  // current one (deterministic rule) and report the other; never cancel it.
  if (!existing?.billing_exempt && LIVE_STATUSES.includes(subscription.status)) {
    const keepId = await resolveCurrentSubscription(stripe, customerIdOf(subscription), existing?.stripe_subscription_id);
    if (keepId && keepId !== subscription.id) {
      const kept = await retrieveSubscriptionOrNull(stripe, keepId);
      if (!kept) return;
      subscription = kept;
    }
  }

  // Ignore a stale, non-live event for an OLD subscription when the account has
  // already moved on to a different one (e.g. a late "canceled" after resubscribing).
  if (
    !existing?.billing_exempt &&
    existing?.stripe_subscription_id &&
    existing.stripe_subscription_id !== subscription.id &&
    LIVE_STATUSES.includes(existing.app_status) &&
    !LIVE_STATUSES.includes(subscription.status)
  ) {
    console.log(`[billing sync] ignoring stale ${subscription.status} state for old sub ${subscription.id}`);
    return;
  }

  const priceId = subscription.items.data[0]?.price?.id ?? null;
  const plan: PlanId | null = planForPriceId(priceId);
  const appStatus = mapStripeStatus(subscription.status);
  // past_due keeps the plan's limit: it is a grace period while Stripe retries payment.
  const employeeLimit = LIVE_STATUSES.includes(subscription.status) && plan ? EMPLOYEE_LIMITS[plan] : 0;

  // `current_period_end` is top-level on older API versions and per-item on newer ones.
  const rawPeriodEnd =
    (subscription as any).current_period_end ??
    (subscription.items.data[0] as any)?.current_period_end ??
    null;
  const periodEnd = rawPeriodEnd ? new Date(rawPeriodEnd * 1000).toISOString() : null;
  const trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null;

  // The developer account (billing_exempt) keeps full access whatever Stripe says:
  // record the Stripe details but never touch its status, plan or limit.
  if (existing?.billing_exempt) {
    const { error: exErr } = await supabase
      .from("subscriptions")
      .update({
        stripe_customer_id: customerIdOf(subscription),
        stripe_subscription_id: subscription.id,
        stripe_price_id: priceId,
        status: subscription.status,
        current_period_end: periodEnd,
        cancel_at_period_end: subscription.cancel_at_period_end,
        trial_end: trialEnd,
      })
      .eq("user_id", userId);
    if (exErr) throw new Error(`subscriptions update failed: ${exErr.message}`);
    await fanOutToCompanies(supabase, userId, {
      subscription_status: existing.app_status,
      plan: existing.plan,
      employee_limit: existing.employee_limit,
    });
    console.log(`[billing sync] user=${userId} is billing-exempt (developer); Stripe status ${subscription.status} recorded only`);
    return;
  }

  const { error: subErr } = await supabase.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: customerIdOf(subscription),
      stripe_subscription_id: subscription.id,
      stripe_price_id: priceId,
      plan,
      status: subscription.status,
      app_status: appStatus,
      employee_limit: employeeLimit,
      current_period_end: periodEnd,
      cancel_at_period_end: subscription.cancel_at_period_end,
      trial_end: trialEnd,
    },
    { onConflict: "user_id" },
  );
  if (subErr) throw new Error(`subscriptions upsert failed: ${subErr.message}`);

  // `plan` stays as the last known plan even when lapsed, for the Billing page.
  await fanOutToCompanies(supabase, userId, {
    subscription_status: appStatus,
    plan,
    employee_limit: employeeLimit,
  });

  console.log(
    `[billing sync] user=${userId} sub=${subscription.id} status=${subscription.status} plan=${plan} limit=${employeeLimit}`,
  );
}

/**
 * "customer" when the account's recorded Stripe customer, or "subscription" when only its
 * recorded live subscription (and no other live one), does not exist in the CURRENT Stripe mode: Sandbox ids left over when Live is
 * switched on, or an object deleted in the dashboard. READ-ONLY: it never writes.
 * Callers treat such an account as "not subscribed" for Checkout, so a stale id can
 * neither block a new subscription nor fail with "No such customer". Only a definite
 * Stripe "resource_missing" counts; any other error is rethrown (an outage is not
 * proof of staleness). The developer account is never reported as stale.
 */
export async function hasStaleStripeRefs(userId: string): Promise<false | "customer" | "subscription"> {
  const stripe = getStripe();
  const { data: row } = await getBillingSupabaseAdmin()
    .from("subscriptions")
    .select("stripe_customer_id, stripe_subscription_id, app_status, billing_exempt")
    .eq("user_id", userId)
    .maybeSingle();
  if (!row || row.billing_exempt || !row.stripe_customer_id) return false;

  try {
    const c = await stripe.customers.retrieve(row.stripe_customer_id);
    if ((c as any).deleted) return "customer";
  } catch (e: any) {
    if (e?.code === "resource_missing") {
      console.warn(`[billing sync] user=${userId}: customer ${maskId(row.stripe_customer_id)} does not exist in this Stripe mode (stale reference)`);
      return "customer";
    }
    throw e;
  }
  if (row.stripe_subscription_id && LIVE_STATUSES.includes(row.app_status)) {
    if (!(await retrieveSubscriptionOrNull(stripe, row.stripe_subscription_id))) {
      const list = await stripe.subscriptions.list({ customer: row.stripe_customer_id, status: "all", limit: 20 });
      if (!list.data.some((s) => LIVE_STATUSES.includes(s.status))) return "subscription";
    }
  }
  return false;
}

/**
 * Fallback for a missed or delayed webhook: look at the customer's subscriptions in
 * Stripe and sync the most relevant one (a live one first, otherwise the newest).
 * Returns the account's resulting status, or null if the customer has no subscription.
 */
export async function syncCustomerFromStripe(customerId: string): Promise<string | null> {
  const stripe = getStripe();
  const list = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 10 });
  if (list.data.length === 0) return null;
  const best =
    list.data.find((s) => LIVE_STATUSES.includes(s.status)) ??
    [...list.data].sort((a, b) => b.created - a.created)[0];
  await syncSubscriptionToDb(best.id);
  return mapStripeStatus(best.status);
}
