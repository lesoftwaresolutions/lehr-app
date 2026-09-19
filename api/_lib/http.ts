import { getSupabaseAdmin } from "./stripe";

// Small helpers shared by the Stripe serverless functions. Mirrors the style of
// api/create-employee.ts (plain (req, res) handlers, no @vercel/node types).

export function applyCors(res: any, methods = "POST,OPTIONS") {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export function handlePreflight(req: any, res: any, methods = "POST,OPTIONS"): boolean {
  if (req.method === "OPTIONS") {
    applyCors(res, methods);
    res.status(204).end();
    return true;
  }
  return false;
}

/** The site origin to build absolute redirect URLs from. */
export function siteOrigin(req: any): string {
  const fromEnv = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  const origin = req.headers.origin;
  if (origin) return String(origin).replace(/\/$/, "");
  const host = req.headers.host;
  return host ? `https://${host}` : "https://lehr.app";
}

/**
 * Verifies the Supabase access token in the Authorization header and returns
 * the authenticated user. Throws { status, message } on failure.
 */
export async function requireUser(req: any): Promise<{ id: string; email: string | null }> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    throw { status: 401, message: "Missing or malformed Authorization header." };
  }
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin.auth.getUser(authHeader.slice(7));
  if (error || !data.user) {
    throw { status: 401, message: "Invalid or expired session. Please sign in again." };
  }
  return { id: data.user.id, email: data.user.email ?? null };
}

/**
 * Confirms the given user owns the given company. Returns the company row
 * (id, name, subscription_status, plan, employee_limit). Throws on failure.
 */
export async function requireCompanyOwner(userId: string, companyId: string) {
  if (!companyId || typeof companyId !== "string") {
    throw { status: 400, message: "company_id is required." };
  }
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("companies")
    .select("id, name, subscription_status, plan, employee_limit")
    .eq("id", companyId)
    .eq("owner_id", userId)
    .single();
  if (error || !data) {
    throw { status: 403, message: "You do not have permission to manage billing for this company." };
  }
  return data as {
    id: string;
    name: string;
    subscription_status: string;
    plan: string | null;
    employee_limit: number;
  };
}

export function sendError(res: any, err: any) {
  const status = typeof err?.status === "number" ? err.status : 500;
  const message = err?.message || "Internal Server Error";
  if (status >= 500) console.error("[api/stripe] error:", err);
  return res.status(status).json({ error: message });
}
