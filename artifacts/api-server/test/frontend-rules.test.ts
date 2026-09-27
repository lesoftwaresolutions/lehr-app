import { test } from "node:test";
import assert from "node:assert/strict";
// The frontend's billing rules live in a pure module, so they can be tested here.
import { isStaffOnly, trialTerms, TRIAL_HEADLINE, hasDashboardAccess, isUnlimited, PLANS, STAFF_BILLING_MESSAGE } from "../../lehr/src/lib/plans";

test("staff-only = belongs to companies but owns none", () => {
  const owned = [{ owner_id: "me" }, { owner_id: "boss" }];
  assert.equal(isStaffOnly(owned, "me"), false);                          // owns one -> owner
  assert.equal(isStaffOnly([{ owner_id: "boss" }], "me"), true);          // only employed -> staff
  assert.equal(isStaffOnly([], "me"), false);                             // new sign-up, no company yet
  assert.equal(isStaffOnly([{ owner_id: "boss" }], null), false);
});

test("staff message is the agreed wording", () => {
  assert.equal(STAFF_BILLING_MESSAGE, "Your account is managed by your company owner. Please contact your account administrator.");
});

test("trial wording states the real terms (card required, £0 today, charged after 14 days)", () => {
  for (const id of ["micro", "growth", "professional"] as const) {
    const t = trialTerms(PLANS[id]);
    assert.match(t, /^14-day free trial\. Your card is required today\. You will pay £0 today and be charged £\d+\/month after 14 days unless you cancel\.$/);
  }
  assert.match(trialTerms(PLANS.micro), /£15\/month/);
  assert.match(trialTerms(PLANS.growth), /£29\/month/);
  assert.match(trialTerms(PLANS.professional), /£59\/month/);
  assert.match(TRIAL_HEADLINE, /card is required today/i);
  assert.doesNotMatch(TRIAL_HEADLINE + trialTerms(PLANS.micro), /no credit card|no card required|free forever/i);
});

test("plan catalogue: prices and employee limits", () => {
  assert.deepEqual([PLANS.micro.priceLabel, PLANS.growth.priceLabel, PLANS.professional.priceLabel], ["£15/month", "£29/month", "£59/month"]);
  assert.deepEqual([PLANS.micro.employeeLimit, PLANS.growth.employeeLimit, PLANS.professional.employeeLimit], [5, 15, 30]);
});

test("dashboard access statuses and the developer 'unlimited' marker", () => {
  assert.ok(hasDashboardAccess("trialing") && hasDashboardAccess("active") && hasDashboardAccess("past_due"));
  assert.ok(!hasDashboardAccess("trial") && !hasDashboardAccess("cancelled") && !hasDashboardAccess(null) && !hasDashboardAccess("unpaid"));
  assert.ok(isUnlimited(100000) && !isUnlimited(30));
});
