import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabaseClient";
import { useCompany } from "@/lib/CompanyContext";
import { hasDashboardAccess } from "@/lib/plans";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2 } from "lucide-react";

// Landing page after Stripe Checkout. The webhook is the source of truth, so we
// poll companies.subscription_status until it flips to an access status, then
// refresh the CompanyContext and go to the dashboard.
export default function CheckoutSuccessPage() {
  const [, setLocation] = useLocation();
  const { activeCompany, refreshCompanies } = useCompany();
  const [state, setState] = useState<"waiting" | "ready" | "slow">("waiting");
  const tries = useRef(0);

  useEffect(() => {
    if (!activeCompany) return;
    let cancelled = false;

    const poll = async () => {
      tries.current += 1;
      const { data } = await supabase
        .from("companies")
        .select("subscription_status")
        .eq("id", activeCompany.id)
        .maybeSingle();

      if (cancelled) return;

      if (data && hasDashboardAccess(data.subscription_status)) {
        setState("ready");
        await refreshCompanies();
        if (!cancelled) setTimeout(() => setLocation("/dashboard"), 900);
        return;
      }

      if (tries.current >= 15) {
        setState("slow");
        return;
      }
      setTimeout(poll, 2000);
    };

    poll();
    return () => {
      cancelled = true;
    };
  }, [activeCompany, refreshCompanies, setLocation]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
      {state === "ready" ? (
        <>
          <CheckCircle2 className="h-12 w-12 text-emerald-500 mb-4" />
          <h1 className="text-2xl font-bold text-slate-900 mb-2">You're all set!</h1>
          <p className="text-slate-600">Taking you to your dashboard…</p>
        </>
      ) : state === "slow" ? (
        <>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Almost there</h1>
          <p className="text-slate-600 max-w-md mb-6">
            Your payment went through. Stripe is still confirming your subscription —
            this usually takes under a minute.
          </p>
          <Button onClick={() => window.location.reload()}>Check again</Button>
        </>
      ) : (
        <>
          <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Activating your subscription</h1>
          <p className="text-slate-600">One moment while we confirm your plan…</p>
        </>
      )}
    </div>
  );
}
