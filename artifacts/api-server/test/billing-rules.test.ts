import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPLOYEE_LIMITS, ACCESS_STATUSES, mapStripeStatus, planForPriceId, priceIdForPlan, isPlanId } from "../src/lib/plans";
import { pickSubscriptionToKeep, LIVE_STATUSES, maskId } from "../src/lib/billingSync";

test("employee limits per plan", () => {
  assert.deepEqual(EMPLOYEE_LIMITS, { micro: 5, growth: 15, professional: 30 });
});

test("plan ids are validated", () => {
  assert.ok(isPlanId("micro") && isPlanId("growth") && isPlanId("professional"));
  assert.ok(!isPlanId("enterprise") && !isPlanId(undefined) && !isPlanId(""));
});

test("Stripe status -> app status", () => {
  assert.equal(mapStripeStatus("trialing"), "trialing");
  assert.equal(mapStripeStatus("active"), "active");
  assert.equal(mapStripeStatus("past_due"), "past_due");
  assert.equal(mapStripeStatus("canceled"), "cancelled");
  assert.equal(mapStripeStatus("unpaid"), "unpaid");
  assert.equal(mapStripeStatus("incomplete_expired"), "incomplete_expired");
  assert.equal(mapStripeStatus("something_new"), "cancelled");
});

test("only trialing / active / past_due grant access (past_due = grace period)", () => {
  assert.deepEqual([...ACCESS_STATUSES].sort(), ["active", "past_due", "trialing"]);
  assert.deepEqual([...LIVE_STATUSES].sort(), ["active", "past_due", "trialing"]);
});

test("price ids come from server env and map back to the plan", () => {
  const saved = { ...process.env };
  process.env.STRIPE_PRICE_MICRO = "price_m";
  process.env.STRIPE_PRICE_GROWTH = "price_g";
  process.env.STRIPE_PRICE_PROFESSIONAL = "price_p";
  try {
    assert.equal(priceIdForPlan("growth"), "price_g");
    assert.equal(planForPriceId("price_p"), "professional");
    assert.equal(planForPriceId("price_unknown"), null);
    delete process.env.STRIPE_PRICE_MICRO;
    assert.throws(() => priceIdForPlan("micro"), /STRIPE_PRICE_MICRO/);
  } finally {
    process.env = saved;
  }
});

test("duplicate subscriptions: keep the recorded one, otherwise the oldest", () => {
  const subs = [{ id: "sub_b", created: 200 }, { id: "sub_a", created: 100 }, { id: "sub_c", created: 300 }];
  assert.equal(pickSubscriptionToKeep(subs, "sub_c"), "sub_c");        // recorded wins
  assert.equal(pickSubscriptionToKeep(subs, "sub_missing"), "sub_a");  // else oldest
  assert.equal(pickSubscriptionToKeep(subs, null), "sub_a");
  assert.equal(pickSubscriptionToKeep([{ id: "sub_y", created: 5 }, { id: "sub_x", created: 5 }], undefined), "sub_x"); // tie -> stable
});

test("conflict rule: the recorded live subscription always wins, a newer one never takes over", () => {
  const subs = [{ id: "sub_new", created: 200 }, { id: "sub_old", created: 100 }];
  assert.equal(pickSubscriptionToKeep(subs, "sub_new"), "sub_new");
  assert.equal(pickSubscriptionToKeep(subs, "sub_old"), "sub_old");
});

test("conflict rule: with no recorded live subscription the OLDEST wins (ties broken by id)", () => {
  assert.equal(pickSubscriptionToKeep([{ id: "sub_b", created: 5 }, { id: "sub_a", created: 5 }, { id: "sub_c", created: 9 }], null), "sub_a");
  assert.equal(pickSubscriptionToKeep([{ id: "sub_x", created: 1 }], "sub_gone"), "sub_x");
});

test("ids are masked in reports", () => {
  assert.equal(maskId("sub_1UIZs0abcdef"), "sub_1UIZ…");
  assert.equal(maskId(null), "none");
});

test("application code never cancels a Stripe subscription", async () => {
  const { readdirSync, readFileSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
  for (const f of walk(new URL("../src", import.meta.url).pathname).filter((f) => f.endsWith(".ts"))) {
    assert.ok(!/subscriptions\.(cancel|del)\b/.test(readFileSync(f, "utf8")), `${f} cancels a subscription`);
  }
});

test("Stripe key mode must match the environment (Sandbox and Live never mix)", async () => {
  const { stripeModeProblem } = await import("../src/lib/clients");
  const t = "sk_test_x", l = "sk_live_x";
  assert.equal(stripeModeProblem({ STRIPE_SECRET_KEY: l, VERCEL_ENV: "production" } as any), null);
  assert.equal(stripeModeProblem({ STRIPE_SECRET_KEY: t, VERCEL_ENV: "preview" } as any), null);
  assert.equal(stripeModeProblem({ STRIPE_SECRET_KEY: t, NODE_ENV: "development" } as any), null);
  assert.match(stripeModeProblem({ STRIPE_SECRET_KEY: t, VERCEL_ENV: "production" } as any)!, /LIVE/);
  assert.match(stripeModeProblem({ STRIPE_SECRET_KEY: t, NODE_ENV: "production" } as any)!, /LIVE/);
  assert.match(stripeModeProblem({ STRIPE_SECRET_KEY: l, VERCEL_ENV: "preview" } as any)!, /only allowed in the production/);
  assert.match(stripeModeProblem({ STRIPE_SECRET_KEY: l, NODE_ENV: "development" } as any)!, /only allowed in the production/);
  assert.match(stripeModeProblem({ STRIPE_SECRET_KEY: "whsec_x", VERCEL_ENV: "production" } as any)!, /not a recognised/);
});
