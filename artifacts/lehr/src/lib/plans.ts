// Client-side plan catalogue — display + limits only.
// Stripe Price ids live ONLY on the server (Vercel env vars). The browser sends
// a plan id string; the serverless function maps it to a Price id.

export type PlanId = "micro" | "growth" | "professional";

export interface PlanInfo {
  id: PlanId;
  name: string;
  priceLabel: string;
  employeeLimit: number;
  blurb: string;
}

export const PLANS: Record<PlanId, PlanInfo> = {
  micro: {
    id: "micro",
    name: "Micro",
    priceLabel: "£15/month",
    employeeLimit: 5,
    blurb: "Up to 5 employees",
  },
  growth: {
    id: "growth",
    name: "Growth",
    priceLabel: "£29/month",
    employeeLimit: 15,
    blurb: "Up to 15 employees",
  },
  professional: {
    id: "professional",
    name: "Professional",
    priceLabel: "£59/month",
    employeeLimit: 30,
    blurb: "Up to 30 employees",
  },
};

export const PLAN_ORDER: PlanId[] = ["micro", "growth", "professional"];

export function isPlanId(v: unknown): v is PlanId {
  return typeof v === "string" && v in PLANS;
}

// Statuses that grant access to the dashboard. Keep in sync with
// api/_lib/plans.ts ACCESS_STATUSES. `past_due` keeps access (with a banner).
export const ACCESS_STATUSES: ReadonlySet<string> = new Set([
  "trialing",
  "active",
  "past_due",
]);

export function hasDashboardAccess(status: string | null | undefined): boolean {
  return !!status && ACCESS_STATUSES.has(status);
}

// The developer account is stored with a very large employee limit.
export const UNLIMITED_EMPLOYEES = 100000;
export const isUnlimited = (limit: number) => limit >= UNLIMITED_EMPLOYEES;

// ── Trial wording. Must match the Stripe Checkout configuration exactly:
// 14 days free, card required up front, £0 due today, charged after the trial.
export const TRIAL_HEADLINE =
  "14-day free trial. Your card is required today. You will pay £0 today and be charged after 14 days unless you cancel.";

export function trialTerms(plan: { priceLabel: string }): string {
  return `14-day free trial. Your card is required today. You will pay £0 today and be charged ${plan.priceLabel} after 14 days unless you cancel.`;
}

export const STAFF_BILLING_MESSAGE =
  "Your account is managed by your company owner. Please contact your account administrator.";

/** True for an employee login: it belongs to companies but owns none. */
export function isStaffOnly(companies: { owner_id: string }[], userId: string | null): boolean {
  return !!userId && companies.length > 0 && !companies.some((c) => c.owner_id === userId);
}
