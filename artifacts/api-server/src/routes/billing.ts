import { createHash } from "node:crypto";
import { Router } from "express";
import type Stripe from "stripe";
import { getStripe, getBillingSupabaseAdmin } from "../lib/clients";
import { isPlanId, priceIdForPlan } from "../lib/plans";
import { LIVE_STATUSES, expireOpenCheckoutSessions, hasStaleStripeRefs, syncCustomerFromStripe } from "../lib/billingSync";
import { publicBaseUrl } from "../lib/urls";

// Mounted at /api/stripe (see routes/index.ts). Billing is per ACCOUNT: one
// subscription per account OWNER covers all of their companies.
//   POST /api/stripe/create-checkout-session  { plan }
//   POST /api/stripe/create-portal-session
//   POST /api/stripe/sync-subscription        (fallback if a webhook was missed)
// All require a Supabase Bearer token from the account owner.

const router = Router() as any;

export const STAFF_BILLING_MESSAGE =
  "Your account is managed by your company owner. Please contact your account administrator.";

class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

async function requireUser(req: any): Promise<{ id: string; email: string | null }> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    throw new HttpError(401, "Missing or malformed Authorization header.");
  }
  const { data, error } = await getBillingSupabaseAdmin().auth.getUser(authHeader.slice(7));
  if (error || !data.user) {
    throw new HttpError(401, "Invalid or expired session. Please sign in again.");
  }
  return { id: data.user.id, email: data.user.email ?? null };
}

/**
 * Only an account owner may start or manage the subscription. A user who owns no
 * company but works for one (an employee login) is refused. A brand-new sign-up
 * that has no company yet is allowed: they are about to become an owner.
 */
async function requireAccountOwner(userId: string): Promise<void> {
  const supabase = getBillingSupabaseAdmin();
  const { count: owned } = await supabase
    .from("companies")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", userId);
  if ((owned ?? 0) > 0) return;

  const { count: staff } = await supabase
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if ((staff ?? 0) > 0) {
    throw new HttpError(403, STAFF_BILLING_MESSAGE, "NOT_ACCOUNT_OWNER");
  }
}

function sendError(res: any, err: any) {
  const status = err instanceof HttpError ? err.status : 500;
  if (status >= 500) console.error("[lehr-api] billing error:", err);
  return res
    .status(status)
    .json({ error: status >= 500 ? err?.message || "Internal Server Error" : err.message, code: err?.code });
}

async function accountSubscription(userId: string) {
  const { data } = await getBillingSupabaseAdmin()
    .from("subscriptions")
    .select("stripe_customer_id, app_status, billing_exempt")
    .eq("user_id", userId)
    .maybeSingle();
  return data as { stripe_customer_id: string; app_status: string; billing_exempt: boolean } | null;
}

function checkoutKeyHash(parts: string[]): string {
  const minute = Math.floor(Date.now() / 60000);
  return createHash("sha256").update([...parts, String(minute)].join("|")).digest("hex").slice(0, 40);
}

const DEVELOPER_MESSAGE = "This is a developer account with full access — no plan or payment is needed.";

router.post("/create-checkout-session", async (req: any, res: any) => {
  try {
    const user = await requireUser(req);
    await requireAccountOwner(user.id);

    const { plan } = req.body ?? {};
    if (!isPlanId(plan)) {
      throw new HttpError(400, "Invalid plan. Expected micro, growth or professional.");
    }

    const baseUrl = publicBaseUrl(); // server config only — never the browser's Origin
    const stripe = getStripe();
    const supabase = getBillingSupabaseAdmin();
    const recorded = await accountSubscription(user.id);

    if (recorded?.billing_exempt) throw new HttpError(409, DEVELOPER_MESSAGE, "DEVELOPER_ACCOUNT");
    // A row pointing at Stripe objects that do not exist in THIS Stripe mode (e.g. left-over
    // Sandbox ids after switching to Live) counts as "not subscribed": read-only check.
    const stale = recorded ? await hasStaleStripeRefs(user.id) : false;
    // Customer gone -> start from scratch; only the subscription gone -> keep the customer, not live.
    const existing = stale === "customer" ? null : stale === "subscription" && recorded ? { ...recorded, app_status: "trial" } : recorded;
    if (existing && LIVE_STATUSES.includes(existing.app_status)) {
      if (existing.stripe_customer_id) await expireOpenCheckoutSessions(existing.stripe_customer_id);
      throw new HttpError(409, "Your account already has an active subscription. Manage it from the Billing page.", "ALREADY_SUBSCRIBED");
    }

    // The database may be behind Stripe (e.g. a missed webhook). If Stripe already
    // has a live subscription for this customer, sync it instead of charging twice.
    if (existing?.stripe_customer_id) {
      const status = await syncCustomerFromStripe(existing.stripe_customer_id);
      if (status && LIVE_STATUSES.includes(status)) {
        throw new HttpError(409, "Your account already has an active subscription. It has been refreshed — reload the page.", "ALREADY_SUBSCRIBED");
      }
    }

    // One Stripe customer per account. The idempotency key makes two simultaneous
    // requests share a single customer instead of creating two.
    let customerId: string | null = existing?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create(
        { email: user.email ?? undefined, name: user.email ?? undefined, metadata: { user_id: user.id } },
        { idempotencyKey: `lehr-customer-${user.id}` },
      );
      customerId = customer.id;
      const { error: seedErr } = await supabase.from("subscriptions").upsert(
        { user_id: user.id, stripe_customer_id: customerId, stripe_subscription_id: null, status: "incomplete" },
        { onConflict: "user_id" },
      );
      if (seedErr) throw new Error(`Could not save billing customer: ${seedErr.message}`);
    }

    // At most ONE open Checkout session per customer: reuse an identical one
    // (double click / refresh), close any other (e.g. a different plan).
    const open = await stripe.checkout.sessions.list({ customer: customerId, status: "open", limit: 10 });
    const reusable = open.data.find(
      (s) => s.url && s.metadata?.plan === plan && s.success_url?.startsWith(`${baseUrl}/`),
    );
    for (const s of open.data) {
      if (s.id === reusable?.id) continue;
      await stripe.checkout.sessions.expire(s.id).catch(() => undefined);
    }
    if (reusable?.url) return res.status(200).json({ url: reusable.url, reused: true });

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceIdForPlan(plan), quantity: 1 }],
      client_reference_id: user.id,
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      // A card is REQUIRED up front so Stripe can charge it when the trial ends.
      payment_method_types: ["card"],
      payment_method_collection: "always",
      subscription_data: {
        // 14 days free: £0 is due today, then Stripe charges the saved card.
        trial_period_days: 14,
        // Never let a subscription continue past the trial without a payment method.
        trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
        metadata: { user_id: user.id, plan },
      },
      metadata: { user_id: user.id, plan },
      success_url: `${baseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/choose-plan?cancelled=1`,
    };

    // Identical concurrent requests (same account, plan and redirect base, within the
    // same minute) share ONE session through an idempotency key. A replay returns the
    // ORIGINAL response, which may be a session that has since been closed (switch plan
    // and straight back), so check the real status. If it is closed, retry with a key
    // salted by that closed session's id: still deterministic, so concurrent identical
    // requests keep converging on a single new session.
    const stableKey = `lehr-checkout-${checkoutKeyHash([user.id, plan, baseUrl])}`;
    let key = stableKey;
    let session: Stripe.Checkout.Session | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const created = await stripe.checkout.sessions.create(sessionParams, { idempotencyKey: key });
      const current = await stripe.checkout.sessions.retrieve(created.id);
      if (current.status === "open") {
        session = current;
        break;
      }
      key = `${stableKey}-${created.id}`;
    }
    if (!session) throw new HttpError(502, "Could not create a Checkout session. Please try again.");

    if (!session.url) throw new HttpError(502, "Stripe did not return a Checkout URL.");
    return res.status(200).json({ url: session.url });
  } catch (err) {
    return sendError(res, err);
  }
});

router.post("/create-portal-session", async (req: any, res: any) => {
  try {
    const user = await requireUser(req);
    await requireAccountOwner(user.id);
    const existing = await accountSubscription(user.id);
    if (existing?.billing_exempt) throw new HttpError(409, DEVELOPER_MESSAGE, "DEVELOPER_ACCOUNT");
    if (!existing?.stripe_customer_id || (await hasStaleStripeRefs(user.id))) {
      throw new HttpError(409, "No billing account yet. Choose a plan first.");
    }
    const portal = await getStripe().billingPortal.sessions.create({
      customer: existing.stripe_customer_id,
      return_url: `${publicBaseUrl()}/dashboard/billing`,
    });
    return res.status(200).json({ url: portal.url });
  } catch (err) {
    return sendError(res, err);
  }
});

router.post("/sync-subscription", async (req: any, res: any) => {
  try {
    const user = await requireUser(req);
    await requireAccountOwner(user.id);
    const existing = await accountSubscription(user.id);
    // The developer account never depends on Stripe.
    if (existing?.billing_exempt) return res.status(200).json({ status: existing.app_status, synced: false, developer: true });
    if (!existing?.stripe_customer_id) {
      return res.status(200).json({ status: existing?.app_status ?? "trial", synced: false });
    }
    // Stale (other-mode) ids: nothing to sync; report it instead of failing.
    if (await hasStaleStripeRefs(user.id)) {
      return res.status(200).json({ status: existing.app_status, synced: false, stale: true });
    }
    const status = await syncCustomerFromStripe(existing.stripe_customer_id);
    const after = await accountSubscription(user.id);
    return res.status(200).json({ status: after?.app_status ?? status ?? "trial", synced: status !== null });
  } catch (err) {
    return sendError(res, err);
  }
});

export default router;
