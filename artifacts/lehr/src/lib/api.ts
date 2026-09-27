import { supabase } from "@/lib/supabaseClient";

/**
 * POST JSON to one of the project's Vercel serverless functions with the
 * current Supabase access token attached. Throws Error(message) on failure,
 * carrying `.code` and `.status` when the server provides them.
 */
export async function apiPost<T = any>(path: string, body: unknown): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Your session has expired. Please sign in again.");
  }

  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const text = await res.text();
    throw new Error(
      `Unexpected response (${res.status}) from ${path}: ${text.slice(0, 140)}`,
    );
  }

  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error ?? `Request failed (${res.status})`) as Error & {
      code?: string;
      status?: number;
    };
    err.code = data.code;
    err.status = res.status;
    throw err;
  }
  return data as T;
}

// Billing is per ACCOUNT (the logged-in owner): one plan covers all their companies.
export function startCheckout(plan: string) {
  return apiPost<{ url: string }>("/api/stripe/create-checkout-session", { plan });
}

export function openBillingPortal() {
  return apiPost<{ url: string }>("/api/stripe/create-portal-session", {});
}

// Asks Stripe directly for the account's subscription. Used as a fallback when the
// webhook is late or was missed.
export function syncSubscription() {
  return apiPost<{ status: string; synced: boolean }>("/api/stripe/sync-subscription", {});
}
