import { Router } from "express";
import { getStripe, getBillingSupabaseAdmin } from "../lib/clients";
import { isPlanId, priceIdForPlan } from "../lib/plans";

// Mounted at /api/stripe (see routes/index.ts):
//   POST /api/stripe/create-checkout-session  { company_id, plan }
//   POST /api/stripe/create-portal-session    { company_id }
// Both require a Supabase Bearer token and company ownership.

const router = Router() as any;

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function siteOrigin(req: any): string {
  const fromEnv = process.env.PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  const origin = req.headers.origin;
  if (origin) return String(origin).replace(/\/$/, "");
  const host = req.headers["x-forwarded-host"] ?? req.headers.host;
  const proto = req.headers["x-forwarded-proto"] ?? "https";
  return host ? `${proto}://${host}` : "https://lehrs.co.uk";
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

async function requireCompanyOwner(userId: string, companyId: unknown) {
  if (!companyId || typeof companyId !== "string") {
    throw new HttpError(400, "company_id is required.");
  }
  const { data, error } = await getBillingSupabaseAdmin()
    .from("companies")
    .select("id, name, subscription_status")
    .eq("id", companyId)
    .eq("owner_id", userId)
    .single();
  if (error || !data) {
    throw new HttpError(403, "You do not have permission to manage billing for this company.");
  }
  return data as { id: string; name: string; subscription_status: string };
}

function sendError(res: any, err: any) {
  const status = err instanceof HttpError ? err.status : 500;
  if (status >= 500) console.error("[lehr-api] billing error:", err);
  return res.status(status).json({ error: status >= 500 ? err?.message || "Internal Server Error" : err.message });
}

router.post("/create-checkout-session", async (req: any, res: any) => {
  try {
    const user = await requireUser(req);
    const { company_id, plan } = req.body ?? {};

    if (!isPlanId(plan)) {
      throw new HttpError(400, "Invalid plan. Expected micro, growth or professional.");
    }

    const company = await requireCompanyOwner(user.id, company_id);
    const stripe = getStripe();
    const supabase = getBillingSupabaseAdmin();

    if (["trialing", "active", "past_due"].includes(company.subscription_status)) {
      throw new HttpError(
        409,
        "This company already has an active subscription. Manage it from the Billing page.",
      );
    }

    const { data: existingSub } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("company_id", company.id)
      .maybeSingle();

    let customerId: string | null = existingSub?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        name: company.name,
        metadata: { company_id: company.id, supabase_user_id: user.id },
      });
      customerId = customer.id;
      const { error: seedErr } = await supabase.from("subscriptions").upsert(
        { company_id: company.id, stripe_customer_id: customerId, status: "incomplete" },
        { onConflict: "company_id" },
      );
      if (seedErr) throw new Error(`Could not save billing customer: ${seedErr.message}`);
    }

    const origin = siteOrigin(req);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceIdForPlan(plan), quantity: 1 }],
      client_reference_id: company.id,
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      subscription_data: {
        trial_period_days: 14,
        metadata: { company_id: company.id, plan },
      },
      metadata: { company_id: company.id, plan },
      success_url: `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/choose-plan?cancelled=1`,
    });

    if (!session.url) throw new HttpError(502, "Stripe did not return a Checkout URL.");
    return res.status(200).json({ url: session.url });
  } catch (err) {
    return sendError(res, err);
  }
});

router.post("/create-portal-session", async (req: any, res: any) => {
  try {
    const user = await requireUser(req);
    const company = await requireCompanyOwner(user.id, req.body?.company_id);

    const { data: sub } = await getBillingSupabaseAdmin()
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("company_id", company.id)
      .maybeSingle();

    if (!sub?.stripe_customer_id) {
      throw new HttpError(409, "No billing account yet. Choose a plan first.");
    }

    const portal = await getStripe().billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${siteOrigin(req)}/dashboard/billing`,
    });
    return res.status(200).json({ url: portal.url });
  } catch (err) {
    return sendError(res, err);
  }
});

export default router;
