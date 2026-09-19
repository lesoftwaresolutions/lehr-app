import type Stripe from "stripe";
import { getStripe, getWebhookSecret } from "../_lib/stripe";
import { syncSubscriptionToDb, markSubscriptionCancelled } from "../_lib/sync";

// POST /api/stripe/webhook
// Stripe -> LEHR. This is the SOURCE OF TRUTH for subscription state.
// Signature-verified with STRIPE_WEBHOOK_SECRET. No Supabase auth.
//
// Vercel note: bodyParser must be OFF so we can verify the raw payload.
export const config = { api: { bodyParser: false } };

async function readRawBody(req: any): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const stripe = getStripe();
  const sig = req.headers["stripe-signature"];
  let event: Stripe.Event;

  try {
    const raw = await readRawBody(req);
    event = stripe.webhooks.constructEvent(raw, sig, getWebhookSecret());
  } catch (err: any) {
    console.error("[stripe webhook] signature verification failed:", err?.message);
    return res.status(400).json({ error: `Webhook signature verification failed.` });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.subscription) {
          const subId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription.id;
          await syncSubscriptionToDb(subId);
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.trial_will_end": {
        await syncSubscriptionToDb(event.data.object as Stripe.Subscription);
        break;
      }

      case "customer.subscription.deleted": {
        await markSubscriptionCancelled(event.data.object as Stripe.Subscription);
        break;
      }

      case "invoice.paid":
      case "invoice.payment_failed": {
        const invoice = event.data.object as any;
        // `subscription` is top-level on older API versions, nested under
        // `parent.subscription_details` on Basil+.
        const subRef =
          invoice.subscription ??
          invoice.parent?.subscription_details?.subscription ??
          null;
        if (subRef) {
          await syncSubscriptionToDb(typeof subRef === "string" ? subRef : subRef.id);
        }
        break;
      }

      default:
        // Unhandled event types are acknowledged so Stripe stops retrying.
        break;
    }
  } catch (err: any) {
    // Return 500 so Stripe retries — the DB write is the important part.
    console.error(`[stripe webhook] handler error for ${event.type}:`, err?.message);
    return res.status(500).json({ error: "Webhook handler failed." });
  }

  return res.status(200).json({ received: true });
}
