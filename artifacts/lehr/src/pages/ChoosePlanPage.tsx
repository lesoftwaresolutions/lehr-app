import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useCompany } from "@/lib/CompanyContext";
import { startCheckout } from "@/lib/api";
import { StaffBillingNotice } from "@/components/StaffBillingNotice";
import {
  PLANS,
  PLAN_ORDER,
  TRIAL_HEADLINE,
  hasDashboardAccess,
  isPlanId,
  isStaffOnly,
  trialTerms,
  type PlanId,
} from "@/lib/plans";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Loader2, LogOut } from "lucide-react";

const FEATURES = [
  "Digital Rota Builder",
  "Real-time Clock-in/out",
  "Staff Profiles & Records",
  "Leave & Absence Tracking",
  "WhatsApp Rota Export",
  "Manager Dashboard",
  "Email Support",
];

export default function ChoosePlanPage() {
  const [, setLocation] = useLocation();
  const { session } = useAuth();
  const { activeCompany, companies, refreshCompanies } = useCompany();
  const { toast } = useToast();
  const [busyPlan, setBusyPlan] = useState<PlanId | null>(null);
  const staffOnly = isStaffOnly(companies, session?.user?.id ?? null);
  // Owners who already have access (including the developer account) never need Checkout.
  const alreadyHasAccess = hasDashboardAccess(activeCompany?.subscription_status);

  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const preselected = params.get("plan");
  const wasCancelled = params.get("cancelled") === "1";

  useEffect(() => {
    if (wasCancelled) {
      toast({
        title: "Checkout cancelled",
        description: "No charge was made. Pick a plan whenever you're ready.",
      });
    }
  }, [wasCancelled, toast]);

  useEffect(() => {
    if (alreadyHasAccess && !staffOnly) setLocation("/dashboard");
  }, [alreadyHasAccess, staffOnly, setLocation]);

  const handleChoose = async (plan: PlanId) => {
    setBusyPlan(plan);
    try {
      const { url } = await startCheckout(plan);
      window.location.href = url; // hand off to Stripe Checkout
    } catch (err: any) {
      // The account already has access (e.g. the subscription was just confirmed).
      if (err?.code === "ALREADY_SUBSCRIBED" || err?.code === "DEVELOPER_ACCOUNT") {
        await refreshCompanies();
        setLocation("/dashboard");
        return;
      }
      toast({
        title: "Could not start checkout",
        description: err?.message ?? "Please try again.",
        variant: "destructive",
      });
      setBusyPlan(null);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setLocation("/");
  };

  if (staffOnly) return <StaffBillingNotice />;

  return (
    <div className="min-h-screen bg-slate-50 py-16 px-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <img src="/logo.jpeg" alt="LEHR" className="h-8 object-contain rounded" />
            <span className="font-bold text-xl text-primary">LEHR</span>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-slate-500">
            <LogOut size={16} className="mr-2" /> Sign out
          </Button>
        </div>

        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold text-slate-900 mb-3">Choose your plan</h1>
          <p className="text-slate-600">
            {session?.user?.email ? <><span className="font-medium">{session.user.email}</span> — </> : null}
            one plan covers all your companies.
          </p>
          <p className="text-slate-700 font-medium mt-3 max-w-2xl mx-auto" data-testid="trial-headline">
            {TRIAL_HEADLINE}
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 items-start">
          {PLAN_ORDER.map((id) => {
            const plan = PLANS[id];
            const highlight = id === "growth";
            const isPre = isPlanId(preselected) && preselected === id;
            return (
              <Card
                key={id}
                className={
                  highlight || isPre
                    ? "border-primary shadow-xl relative bg-white"
                    : "border-slate-200 shadow-sm"
                }
              >
                {highlight && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-primary text-primary-foreground px-4 py-1 rounded-full text-sm font-semibold shadow-sm">
                    Recommended
                  </div>
                )}
                <CardHeader className={highlight ? "pt-8" : undefined}>
                  <CardTitle className="text-2xl">{plan.name}</CardTitle>
                  <CardDescription className="text-base">{plan.blurb}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-6">
                    <span className="text-4xl font-bold text-slate-900">{plan.priceLabel.split("/")[0]}</span>
                    <span className="text-slate-500">/month</span>
                  </div>
                  <ul className="space-y-3 mb-8">
                    {FEATURES.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-slate-700">
                        <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="w-full font-semibold"
                    variant={highlight || isPre ? "default" : "outline"}
                    disabled={busyPlan !== null}
                    onClick={() => handleChoose(id)}
                    data-testid={`choose-plan-${id}`}
                  >
                    {busyPlan === id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Start 14-day free trial
                  </Button>
                  <p className="text-xs text-slate-500 text-center mt-3" data-testid={`trial-terms-${id}`}>
                    {trialTerms(plan)}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <p className="text-center text-xs text-slate-400 mt-10">
          Secure payments via Stripe. You can change or cancel your plan any time from the Billing page.
        </p>
      </div>
    </div>
  );
}
