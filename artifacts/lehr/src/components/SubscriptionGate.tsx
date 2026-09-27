import { ReactNode, useEffect } from "react";
import { useLocation } from "wouter";
import { useCompany } from "@/lib/CompanyContext";
import { useAuth } from "@/lib/AuthContext";
import { StaffBillingNotice } from "@/components/StaffBillingNotice";
import { hasDashboardAccess, isStaffOnly } from "@/lib/plans";

function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <p className="text-slate-400 text-sm">Loading…</p>
    </div>
  );
}

/**
 * Wraps the paid area of the app. Runs AFTER AuthGuard (session + activeCompany
 * are guaranteed). Redirects to /choose-plan when the active company has no
 * access-granting subscription status.
 *
 * Access statuses (source of truth = Stripe, mirrored onto companies by the
 * webhook): trialing, active, past_due. Everything else -> /choose-plan.
 */
export function SubscriptionGate({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const { activeCompany, companies, isLoading } = useCompany();
  const { session } = useAuth();
  // An employee of a company whose owner has not subscribed must not be sent to
  // Checkout: only the owner can subscribe.
  const staffOnly = isStaffOnly(companies, session?.user?.id ?? null);

  const status = activeCompany?.subscription_status ?? null;
  const allowed = hasDashboardAccess(status);

  useEffect(() => {
    if (isLoading || !activeCompany) return;
    if (!allowed && !staffOnly && location !== "/choose-plan") {
      setLocation("/choose-plan");
    }
  }, [isLoading, activeCompany, allowed, staffOnly, location, setLocation]);

  if (isLoading) return <Loading />;
  if (!allowed && staffOnly) return <StaffBillingNotice />;
  if (!allowed) return null; // redirect dispatched above

  return <>{children}</>;
}
