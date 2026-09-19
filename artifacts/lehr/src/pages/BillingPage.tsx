import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayout } from "@/components/DashboardLayout";
import { supabase } from "@/lib/supabaseClient";
import { useCompany } from "@/lib/CompanyContext";
import { openBillingPortal } from "@/lib/api";
import { PLANS, type PlanId } from "@/lib/plans";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ExternalLink, Users } from "lucide-react";

interface SubRow {
  plan: PlanId | null;
  status: string;
  current_period_end: string | null;
  trial_end: string | null;
  cancel_at_period_end: boolean;
}

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  trialing: { label: "Trial", variant: "secondary" },
  active: { label: "Active", variant: "default" },
  past_due: { label: "Past due", variant: "destructive" },
  unpaid: { label: "Unpaid", variant: "destructive" },
  cancelled: { label: "Cancelled", variant: "outline" },
  incomplete: { label: "Incomplete", variant: "outline" },
  incomplete_expired: { label: "Expired", variant: "outline" },
  paused: { label: "Paused", variant: "outline" },
  trial: { label: "No plan", variant: "outline" },
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export default function BillingPage() {
  const [, setLocation] = useLocation();
  const { activeCompany } = useCompany();
  const { toast } = useToast();
  const [sub, setSub] = useState<SubRow | null>(null);
  const [activeStaff, setActiveStaff] = useState(0);
  const [loading, setLoading] = useState(true);
  const [portalBusy, setPortalBusy] = useState(false);

  const load = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    const [subRes, staffRes] = await Promise.all([
      supabase
        .from("subscriptions")
        .select("plan, status, current_period_end, trial_end, cancel_at_period_end")
        .eq("company_id", activeCompany.id)
        .maybeSingle(),
      supabase
        .from("employees")
        .select("id", { count: "exact", head: true })
        .eq("company_id", activeCompany.id)
        .eq("status", "active"),
    ]);
    setSub((subRes.data as SubRow) ?? null);
    setActiveStaff(staffRes.count ?? 0);
    setLoading(false);
  }, [activeCompany]);

  useEffect(() => {
    load();
  }, [load]);

  const handlePortal = async () => {
    if (!activeCompany) return;
    setPortalBusy(true);
    try {
      const { url } = await openBillingPortal(activeCompany.id);
      window.location.href = url;
    } catch (err: any) {
      toast({
        title: "Could not open billing portal",
        description: err?.message ?? "Please try again.",
        variant: "destructive",
      });
      setPortalBusy(false);
    }
  };

  const status = activeCompany?.subscription_status ?? "trial";
  const planId = (sub?.plan ?? activeCompany?.plan ?? null) as PlanId | null;
  const plan = planId ? PLANS[planId] : null;
  const limit = activeCompany?.employee_limit ?? 0;
  const statusMeta = STATUS_LABEL[status] ?? { label: status, variant: "outline" as const };
  const hasStripeCustomer = !!sub; // a subscriptions row means a Stripe customer exists

  return (
    <DashboardLayout title="Billing">
      <div className="max-w-3xl space-y-6">
        {loading ? (
          <div className="py-16 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400 mx-auto" />
          </div>
        ) : (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle>Current plan</CardTitle>
                <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-slate-900">
                    {plan ? plan.name : "No active plan"}
                  </span>
                  {plan && <span className="text-slate-500">{plan.priceLabel}</span>}
                </div>

                {sub?.cancel_at_period_end && (
                  <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                    Your subscription is set to cancel on {fmtDate(sub.current_period_end)}.
                  </p>
                )}
                {status === "past_due" && (
                  <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                    Your last payment failed. Update your payment method to keep your account active.
                  </p>
                )}

                <dl className="grid grid-cols-2 gap-4 text-sm">
                  {status === "trialing" && (
                    <div>
                      <dt className="text-slate-500">Trial ends</dt>
                      <dd className="font-medium text-slate-900">{fmtDate(sub?.trial_end ?? null)}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-slate-500">
                      {sub?.cancel_at_period_end ? "Access until" : "Renews on"}
                    </dt>
                    <dd className="font-medium text-slate-900">{fmtDate(sub?.current_period_end ?? null)}</dd>
                  </div>
                </dl>

                <div className="flex flex-wrap gap-3 pt-2">
                  {hasStripeCustomer ? (
                    <Button onClick={handlePortal} disabled={portalBusy} data-testid="button-billing-portal">
                      {portalBusy ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <ExternalLink className="mr-2 h-4 w-4" />
                      )}
                      Manage billing &amp; payment method
                    </Button>
                  ) : (
                    <Button onClick={() => setLocation("/choose-plan")}>Choose a plan</Button>
                  )}
                  {hasStripeCustomer && (
                    <Button variant="outline" onClick={handlePortal} disabled={portalBusy}>
                      Change plan
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-slate-400" /> Employee usage
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-slate-900">{activeStaff}</span>
                  <span className="text-slate-500">/ {limit || "—"} active employees</span>
                </div>
                {limit > 0 && activeStaff >= limit && (
                  <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mt-3">
                    You've reached your plan limit. Upgrade to add more team members.
                  </p>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
