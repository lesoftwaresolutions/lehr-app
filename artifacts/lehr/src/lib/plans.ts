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
