// Server-side plan catalogue. The client only ever sends a plan id
// ("micro" | "growth" | "professional"); the mapping to a Stripe Price id and
// to an employee limit is resolved HERE so the browser can never influence
// pricing or limits.
//
// Price ids come from server-only env vars:
//   STRIPE_PRICE_MICRO, STRIPE_PRICE_GROWTH, STRIPE_PRICE_PROFESSIONAL

export type PlanId = "micro" | "growth" | "professional";

export const PLAN_IDS: PlanId[] = ["micro", "growth", "professional"];

export const EMPLOYEE_LIMITS: Record<PlanId, number> = {
  micro: 5,
  growth: 15,
  professional: 30,
};

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && (PLAN_IDS as string[]).includes(value);
}

export function priceIdForPlan(plan: PlanId): string {
  const env: Record<PlanId, string | undefined> = {
    micro: process.env.STRIPE_PRICE_MICRO,
    growth: process.env.STRIPE_PRICE_GROWTH,
    professional: process.env.STRIPE_PRICE_PROFESSIONAL,
  };
  const priceId = env[plan]?.trim();
  if (!priceId) {
    throw new Error(
      `Missing Stripe price env var for plan "${plan}". Set STRIPE_PRICE_${plan.toUpperCase()}.`,
    );
  }
  return priceId;
}

export function planForPriceId(priceId: string | null | undefined): PlanId | null {
  if (!priceId) return null;
  const pairs: [PlanId, string | undefined][] = [
    ["micro", process.env.STRIPE_PRICE_MICRO?.trim()],
    ["growth", process.env.STRIPE_PRICE_GROWTH?.trim()],
    ["professional", process.env.STRIPE_PRICE_PROFESSIONAL?.trim()],
  ];
  for (const [plan, id] of pairs) {
    if (id && id === priceId) return plan;
  }
  return null;
}

// Stripe subscription.status -> companies.subscription_status
// (constrained by companies_subscription_status_check in the migration).
export function mapStripeStatus(stripeStatus: string): string {
  switch (stripeStatus) {
    case "trialing":
    case "active":
    case "past_due":
    case "unpaid":
    case "incomplete":
    case "incomplete_expired":
    case "paused":
      return stripeStatus;
    case "canceled":
      return "cancelled";
    default:
      return "cancelled";
  }
}

// Statuses that may use the product / add staff. Keep in sync with the
// client-side gate in artifacts/lehr/src/lib/plans.ts.
export const ACCESS_STATUSES = new Set(["trialing", "active", "past_due"]);
