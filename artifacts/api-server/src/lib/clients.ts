import Stripe from "stripe";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Lazily-created shared clients for the billing routes. Lazy so a missing env
// var returns a clean JSON error per request instead of crashing the Vercel
// function on cold start.
//   STRIPE_SECRET_KEY          sk_test_... / sk_live_...
//   STRIPE_WEBHOOK_SECRET      whsec_...
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY

let stripeInstance: Stripe | null = null;

/**
 * Sandbox and Live must never mix: the Vercel PRODUCTION deployment may only use a
 * live key, and every other environment (preview, local) may only use a test key.
 * Returns a problem description when the key does not fit the environment.
 */
export function stripeModeProblem(env: NodeJS.ProcessEnv = process.env): string | null {
  const key = env.STRIPE_SECRET_KEY?.trim() ?? "";
  const isLive = key.startsWith("sk_live_") || key.startsWith("rk_live_");
  const isTest = key.startsWith("sk_test_") || key.startsWith("rk_test_");
  if (!isLive && !isTest) return "STRIPE_SECRET_KEY is not a recognised Stripe secret key.";
  const production = env.VERCEL_ENV ? env.VERCEL_ENV === "production" : env.NODE_ENV === "production";
  if (production && !isLive) return "Production must use a LIVE Stripe key, not a test key.";
  if (!production && isLive) return "A LIVE Stripe key is only allowed in the production environment.";
  return null;
}

export function getStripe(): Stripe {
  if (stripeInstance) return stripeInstance;
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error("Server misconfigured: STRIPE_SECRET_KEY is not set.");
  }
  const problem = stripeModeProblem();
  if (problem) throw new Error(`Server misconfigured: ${problem}`);
  stripeInstance = new Stripe(key, { appInfo: { name: "LEHR" } });
  return stripeInstance;
}

/** True when the configured secret key is a LIVE-mode key (sk_live_ / rk_live_). */
export function stripeKeyIsLive(): boolean {
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  return key.startsWith("sk_live_") || key.startsWith("rk_live_");
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
