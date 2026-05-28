import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CompanyProvider } from "@/lib/CompanyContext";
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
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/"               component={LandingPage} />
        <Route path="/auth"           component={AuthPage} />
        <Route path="/reset-password" component={ResetPasswordPage} />

        {/* Company kiosk — the single entry point for all staff clock-in/out */}
        <Route path="/clock/:companyId">
          {(params: { companyId: string }) => (
            <CompanyKioskPage companyId={params.companyId} />
          )}
        </Route>

        <Route path="/pick-company"     component={CompanyPickerPage} />
        <Route path="/dashboard"        component={DashboardPage} />
        <Route path="/dashboard/staff"  component={StaffPage} />
        <Route path="/dashboard/rota"   component={RotaPage} />
        <Route path="/dashboard/time"   component={TimePage} />
        <Route path="/dashboard/leave"  component={LeavePage} />
        <Route                          component={NotFound} />
      </Switch>
    </Suspense>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <CompanyProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </CompanyProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
