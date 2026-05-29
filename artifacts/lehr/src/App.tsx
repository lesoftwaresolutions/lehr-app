import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/AuthContext";
import { CompanyProvider } from "@/lib/CompanyContext";
import { AuthGuard } from "@/components/AuthGuard";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Lazy-load every page — only the visited route's chunk is downloaded.
const LandingPage       = lazy(() => import("@/pages/LandingPage"));
const AuthPage          = lazy(() => import("@/pages/AuthPage"));
const ResetPasswordPage = lazy(() => import("@/pages/ResetPasswordPage"));
const CompanyKioskPage  = lazy(() => import("@/pages/CompanyKioskPage"));
const CompanyPickerPage = lazy(() => import("@/pages/CompanyPickerPage"));
const DashboardPage     = lazy(() => import("@/pages/DashboardPage"));
const StaffPage         = lazy(() => import("@/pages/StaffPage"));
const RotaPage          = lazy(() => import("@/pages/RotaPage"));
const TimePage          = lazy(() => import("@/pages/TimePage"));
const LeavePage         = lazy(() => import("@/pages/LeavePage"));
const NotFound          = lazy(() => import("@/pages/not-found"));

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <p className="text-slate-400 text-sm">Loading...</p>
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

// All routes that require a valid session + active company.
// CompanyProvider lives here — the kiosk never touches it.
function ProtectedApp() {
  return (
    <CompanyProvider>
      <AuthGuard>
        <Suspense fallback={<PageLoader />}>
          <Switch>
            <Route path="/pick-company"    component={CompanyPickerPage} />
            <Route path="/dashboard"       component={DashboardPage} />
            <Route path="/dashboard/staff" component={StaffPage} />
            <Route path="/dashboard/rota"  component={RotaPage} />
            <Route path="/dashboard/time"  component={TimePage} />
            <Route path="/dashboard/leave" component={LeavePage} />
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      </AuthGuard>
    </CompanyProvider>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        {/* Public — no auth required */}
        <Route path="/"               component={LandingPage} />
        <Route path="/auth"           component={AuthPage} />
        <Route path="/reset-password" component={ResetPasswordPage} />

        {/* Kiosk — completely public, no CompanyProvider, no AuthGuard */}
        <Route path="/clock/:companyId">
          {(params: { companyId: string }) => (
            <CompanyKioskPage companyId={params.companyId} />
          )}
        </Route>

        {/* Everything else requires auth */}
        <Route component={ProtectedApp} />
      </Switch>
    </Suspense>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
