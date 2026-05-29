import { ReactNode, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/AuthContext";
import { useCompany } from "@/lib/CompanyContext";

function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <p className="text-slate-400 text-sm">Loading...</p>
    </div>
  );
}

export function AuthGuard({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const { session, authReady } = useAuth();
  const { activeCompany, isLoading: companyLoading } = useCompany();

  useEffect(() => {
    if (!authReady) return;

    // No session → send to login (never redirect if already there)
    if (!session) {
      if (location !== "/auth") setLocation("/auth");
      return;
    }

    // Session exists but no company once loading is done → send to company picker
    if (!companyLoading && !activeCompany && location !== "/pick-company") {
      setLocation("/pick-company");
    }
  }, [authReady, session, companyLoading, activeCompany, location, setLocation]);

  // Auth check not done yet — localStorage read takes <100ms normally
  if (!authReady) return <Loading />;

  // No session — redirect is being dispatched by the useEffect above
  if (!session) return null;

  // Session confirmed, companies still loading from DB
  if (companyLoading) return <Loading />;

  // No active company, but already on the picker — let it render
  if (!activeCompany && location === "/pick-company") return <>{children}</>;

  // No active company elsewhere — redirect is being dispatched
  if (!activeCompany) return null;

  // All checks passed — render the protected page
  return <>{children}</>;
}
