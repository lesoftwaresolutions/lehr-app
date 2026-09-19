import { getStripe, getSupabaseAdmin } from "../_lib/stripe";
import {
  handlePreflight,
  applyCors,
  requireUser,
  requireCompanyOwner,
  siteOrigin,
  sendError,
} from "../_lib/http";

// POST /api/stripe/create-portal-session
// Body: { company_id: string }
// Auth: Bearer <supabase access token>
// Returns: { url: string }  -> client redirects to the Stripe Customer Portal.

export default async function handler(req: any, res: any) {
  if (handlePreflight(req, res)) return;
  applyCors(res);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await requireUser(req);
    const { company_id } = req.body ?? {};
    const company = await requireCompanyOwner(user.id, company_id);

    const supabaseAdmin = getSupabaseAdmin();
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("company_id", company.id)
      .maybeSingle();

    if (!sub?.stripe_customer_id) {
      throw {
        status: 409,
        message: "No billing account yet. Choose a plan first.",
      };
    }

    const stripe = getStripe();
    const portal = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${siteOrigin(req)}/dashboard/billing`,
    });

    return res.status(200).json({ url: portal.url });
  } catch (err) {
    return sendError(res, err);
  }
}
