import Stripe from "stripe";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Shared clients for the /api/stripe/* serverless functions.
// All secrets are read from process.env — never hardcoded.
//   STRIPE_SECRET_KEY          – sk_test_... / sk_live_...
//   STRIPE_WEBHOOK_SECRET      – whsec_...   (webhook signature verification)
//   SUPABASE_URL               – https://<ref>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY  – service_role key (bypasses RLS, server only)
// ---------------------------------------------------------------------------

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("Server misconfigured: STRIPE_SECRET_KEY is not set in Vercel.");
  }
  // No explicit apiVersion → the SDK's pinned default is used.
  _stripe = new Stripe(key, { appInfo: { name: "LEHR" } });
  return _stripe;
}

let _supabaseAdmin: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (_supabaseAdmin) return _supabaseAdmin;
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Server misconfigured: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in Vercel.",
    );
  }
  _supabaseAdmin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _supabaseAdmin;
}

export function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("Server misconfigured: STRIPE_WEBHOOK_SECRET is not set in Vercel.");
  }
  return secret;
}
