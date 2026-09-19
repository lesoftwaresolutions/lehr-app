import Stripe from "stripe";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Lazily-created shared clients for the billing routes. Lazy so a missing env
// var returns a clean JSON error per request instead of crashing the Vercel
// function on cold start.
//   STRIPE_SECRET_KEY          sk_test_... / sk_live_...
//   STRIPE_WEBHOOK_SECRET      whsec_...
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY

let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe {
  if (stripeInstance) return stripeInstance;
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error("Server misconfigured: STRIPE_SECRET_KEY is not set.");
  }
  stripeInstance = new Stripe(key, { appInfo: { name: "LEHR" } });
  return stripeInstance;
}

export function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new Error("Server misconfigured: STRIPE_WEBHOOK_SECRET is not set.");
  }
  return secret;
}

let supabaseAdminInstance: SupabaseClient | null = null;

export function getBillingSupabaseAdmin(): SupabaseClient {
  if (supabaseAdminInstance) return supabaseAdminInstance;
  const url = process.env.SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !url.startsWith("https://")) {
    throw new Error("Server misconfigured: SUPABASE_URL is missing or invalid.");
  }
  if (!serviceKey || serviceKey.length < 100) {
    throw new Error("Server misconfigured: SUPABASE_SERVICE_ROLE_KEY is missing or invalid.");
  }
  supabaseAdminInstance = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return supabaseAdminInstance;
}
