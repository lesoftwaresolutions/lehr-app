import { getStripe, getSupabaseAdmin } from "../_lib/stripe";
import {
  handlePreflight,
  applyCors,
  requireUser,
  requireCompanyOwner,
  siteOrigin,
  sendError,
} from "../_lib/http";
import { isPlanId, priceIdForPlan } from "../_lib/plans";

// POST /api/stripe/create-checkout-session
// Body: { company_id: string, plan: "micro" | "growth" | "professional" }
// Auth: Bearer <supabase access token>
// Returns: { url: string }  -> client redirects the browser to Stripe Checkout.

export default async function handler(req: any, res: any) {
  if (handlePreflight(req, res)) return;
  applyCors(res);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await requireUser(req);
    const { company_id, plan } = req.body ?? {};

    if (!isPlanId(plan)) {
      throw { status: 400, message: "Invalid plan. Expected micro, growth or professional." };
    }

    const company = await requireCompanyOwner(user.id, company_id);
    const stripe = getStripe();
    const supabaseAdmin = getSupabaseAdmin();

    // Already subscribed? Send them to the portal instead of a second checkout.
    if (["trialing", "active", "past_due"].includes(company.subscription_status)) {
      throw {
        status: 409,
        message: "This company already has an active subscription. Manage it from the Billing page.",
      };
    }

    // Re-use an existing Stripe customer if we created one before.
    const { data: existingSub } = await supabaseAdmin
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("company_id", company.id)
      .maybeSingle();

    let customerId = existingSub?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        name: company.name,
        metadata: { company_id: company.id, supabase_user_id: user.id },
      });
      customerId = customer.id;
      // Seed the subscriptions row so we can find the customer next time.
      await supabaseAdmin.from("subscriptions").upsert(
        {
          company_id: company.id,
          stripe_customer_id: customerId,
          status: "incomplete",
        },
        { onConflict: "company_id" },
      );
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

    if (!session.url) {
      throw { status: 502, message: "Stripe did not return a Checkout URL." };
    }
    return res.status(200).json({ url: session.url });
  } catch (err) {
    return sendError(res, err);
  }
}
