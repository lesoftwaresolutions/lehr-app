import type Stripe from "stripe";
import { getStripe, getSupabaseAdmin } from "./stripe";
import { EMPLOYEE_LIMITS, mapStripeStatus, planForPriceId, type PlanId } from "./plans";

/**
 * The single source of truth. Given a Stripe subscription id (or object), pull
 * the current state from Stripe and write it into Supabase:
 *   - upsert public.subscriptions
 *   - update public.companies (subscription_status, plan, employee_limit)
 *
 * Idempotent: safe to call repeatedly for the same subscription / event.
 */
export async function syncSubscriptionToDb(
  subscriptionOrId: string | Stripe.Subscription,
): Promise<void> {
  const stripe = getStripe();
  const supabase = getSupabaseAdmin();

  const subscription: Stripe.Subscription =
    typeof subscriptionOrId === "string"
      ? await stripe.subscriptions.retrieve(subscriptionOrId)
      : subscriptionOrId;

  // Resolve the company this subscription belongs to.
  let companyId = subscription.metadata?.company_id ?? null;

  if (!companyId) {
    // Fall back to an existing row keyed by the subscription id.
    const { data: existing } = await supabase
      .from("subscriptions")
      .select("company_id")
      .eq("stripe_subscription_id", subscription.id)
      .maybeSingle();
    companyId = existing?.company_id ?? null;
  }

  if (!companyId) {
    console.error(
      `[stripe sync] No company_id for subscription ${subscription.id}; skipping.`,
    );
    return;
  }

  const priceId = subscription.items.data[0]?.price?.id ?? null;
  const plan: PlanId | null = planForPriceId(priceId);
  const appStatus = mapStripeStatus(subscription.status);

  const isActive = subscription.status === "active" || subscription.status === "trialing";
  const employeeLimit = isActive && plan ? EMPLOYEE_LIMITS[plan] : 0;

  // `current_period_end` is top-level on older API versions and per-item on
  // newer ones (Basil+). Check both.
  const rawPeriodEnd =
    (subscription as any).current_period_end ??
    (subscription.items.data[0] as any)?.current_period_end ??
    null;
  const periodEnd = rawPeriodEnd ? new Date(rawPeriodEnd * 1000).toISOString() : null;
  const trialEnd = subscription.trial_end
    ? new Date(subscription.trial_end * 1000).toISOString()
    : null;

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  // 1. subscriptions table (full detail, owner-readable only)
  const { error: subErr } = await supabase.from("subscriptions").upsert(
    {
      company_id: companyId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      stripe_price_id: priceId,
      plan,
      status: subscription.status,
      current_period_end: periodEnd,
      cancel_at_period_end: subscription.cancel_at_period_end,
      trial_end: trialEnd,
    },
    { onConflict: "company_id" },
  );
  if (subErr) throw new Error(`subscriptions upsert failed: ${subErr.message}`);

  // 2. companies table (coarse gate fields only)
  const { error: coErr } = await supabase
    .from("companies")
    .update({
      subscription_status: appStatus,
      plan, // keep last known plan even when lapsed, for the Billing page
      employee_limit: employeeLimit,
    })
    .eq("id", companyId);
  if (coErr) throw new Error(`companies update failed: ${coErr.message}`);

  console.log(
    `[stripe sync] company=${companyId} sub=${subscription.id} status=${subscription.status} plan=${plan} limit=${employeeLimit}`,
  );
}

/**
 * Handle a fully-deleted subscription (customer.subscription.deleted).
 */
export async function markSubscriptionCancelled(
  subscription: Stripe.Subscription,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  let companyId = subscription.metadata?.company_id ?? null;
  if (!companyId) {
    const { data: existing } = await supabase
      .from("subscriptions")
      .select("company_id")
      .eq("stripe_subscription_id", subscription.id)
      .maybeSingle();
    companyId = existing?.company_id ?? null;
  }
  if (!companyId) return;

  await supabase
    .from("subscriptions")
    .update({
      status: "canceled",
      cancel_at_period_end: false,
    })
    .eq("company_id", companyId);

  await supabase
    .from("companies")
    .update({ subscription_status: "cancelled", employee_limit: 0 })
    .eq("id", companyId);

  console.log(`[stripe sync] company=${companyId} sub=${subscription.id} CANCELLED`);
}
