// Where Stripe sends customers back to (Checkout success/cancel, Customer Portal
// return). These are built from SERVER configuration only — never from the
// browser's Origin/Host headers, which a caller could forge.
//
//   production (VERCEL_ENV=production, or NODE_ENV=production off Vercel)
//       -> PUBLIC_BASE_URL is REQUIRED and must be https and not local
//          (set it to https://lehrs.co.uk)
//   Vercel preview
//       -> PUBLIC_BASE_URL if set, otherwise https://$VERCEL_URL
//   local development (no VERCEL_ENV, NODE_ENV != production)
//       -> PUBLIC_BASE_URL if set, otherwise http://localhost:23921
//
// localhost / loopback / private addresses are only ever allowed in local
// development, so a production or preview Checkout session can never point at them.

type Env = Record<string, string | undefined>;

export const LOCAL_DEV_BASE_URL = "http://localhost:23921";

function isLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h === "127.0.0.1" ||
    h === "::1" ||
    h === "[::1]" ||
    h === "0.0.0.0" ||
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h)
  );
}

export function isLocalDevelopment(env: Env = process.env): boolean {
  return !env.VERCEL_ENV && env.NODE_ENV !== "production";
}

export function publicBaseUrl(env: Env = process.env): string {
  const local = isLocalDevelopment(env);
  const isProduction = env.VERCEL_ENV === "production" || (!env.VERCEL_ENV && env.NODE_ENV === "production");

  let raw = env.PUBLIC_BASE_URL?.trim();
  if (!raw && env.VERCEL_ENV === "preview" && env.VERCEL_URL) raw = `https://${env.VERCEL_URL.trim()}`;
  if (!raw && local) raw = LOCAL_DEV_BASE_URL;

  if (!raw) {
    throw new Error(
      isProduction
        ? "Server misconfigured: PUBLIC_BASE_URL must be set in production (https://lehrs.co.uk)."
        : "Server misconfigured: PUBLIC_BASE_URL is not set.",
    );
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Server misconfigured: PUBLIC_BASE_URL is not a valid URL.");
  }

  if (!local) {
    if (url.protocol !== "https:") {
      throw new Error("Server misconfigured: PUBLIC_BASE_URL must use https outside local development.");
    }
    if (isLocalHost(url.hostname)) {
      throw new Error("Server misconfigured: PUBLIC_BASE_URL must not be localhost outside local development.");
    }
  } else if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Server misconfigured: PUBLIC_BASE_URL must be an http(s) URL.");
  }

  // Origin only — no path, query or trailing slash.
  return url.origin;
}
