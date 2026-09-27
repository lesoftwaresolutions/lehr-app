import type Stripe from "stripe";
import { getStripe, getWebhookSecret, stripeKeyIsLive } from "../lib/clients";
import { expireOpenCheckoutSessions, syncSubscriptionToDb } from "../lib/billingSync";

// POST /api/stripe/webhook — Stripe -> LEHR. Signature-verified with
// STRIPE_WEBHOOK_SECRET; no Supabase auth.
//
// An event is only a HINT that a subscription changed: syncSubscriptionToDb
// re-reads the current subscription from Stripe, so repeated, delayed and
// out-of-order deliveries are all safe (see lib/billingSync.ts).
//
// MUST be mounted with express.raw() BEFORE express.json() (see app.ts):
// signature verification needs the exact raw bytes Stripe sent.
export async function stripeWebhookHandler(req: any, res: any) {
  const sig = req.headers["stripe-signature"];

  if (!Buffer.isBuffer(req.body)) {
    console.error("[stripe webhook] raw body unavailable (body already parsed?)");
    return res.status(400).json({ error: "Raw request body unavailable." });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(req.body, sig, getWebhookSecret());
  } catch (err: any) {
    console.error("[stripe webhook] signature verification failed:", err?.message);
    return res.status(400).json({ error: "Webhook signature verification failed." });
  }

  // A test-mode event must never touch live data (or the reverse).
  if (event.livemode !== stripeKeyIsLive()) {
    console.warn(`[stripe webhook] ignoring ${event.type} ${event.id}: livemode mismatch`);
    return res.status(200).json({ received: true, ignored: "livemode mismatch" });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.subscription) {
          const subId =
            typeof session.subscription === "string" ? session.subscription : session.subscription.id;
          await syncSubscriptionToDb(subId);
          // The purchase is done: close any other open Checkout session for this
          // customer so it can't be paid later and create a second subscription.
          const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
          if (customerId) await expireOpenCheckoutSessions(customerId, session.id);
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.trial_will_end":
        await syncSubscriptionToDb((event.data.object as Stripe.Subscription).id);
        break;

      case "invoice.paid":
      case "invoice.payment_failed": {
        const invoice = event.data.object as any;
        // `subscription` is top-level on older API versions, nested under
        // `parent.subscription_details` on Basil+.
        const subRef =
          invoice.subscription ?? invoice.parent?.subscription_details?.subscription ?? null;
        if (subRef) {
          await syncSubscriptionToDb(typeof subRef === "string" ? subRef : subRef.id);
        }
        break;
      }

      default:
        break; // acknowledged so Stripe stops retrying
    }
  } catch (err: any) {
    // 500 so Stripe retries — re-running is safe because processing is idempotent.
    console.error(`[stripe webhook] handler error for ${event.type}:`, err?.message);
    return res.status(500).json({ error: "Webhook handler failed." });
  }

  return res.status(200).json({ received: true });
}
