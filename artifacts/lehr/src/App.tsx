import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CompanyProvider } from "@/lib/CompanyContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Lazy-load every page so the initial JS bundle stays small.
// Only the current route's chunk is downloaded on first visit.
const LandingPage          = lazy(() => import("@/pages/LandingPage"));
const AuthPage             = lazy(() => import("@/pages/AuthPage"));
const DashboardPage        = lazy(() => import("@/pages/DashboardPage"));
const StaffPage            = lazy(() => import("@/pages/StaffPage"));
const RotaPage             = lazy(() => import("@/pages/RotaPage"));
const TimePage             = lazy(() => import("@/pages/TimePage"));
const LeavePage            = lazy(() => import("@/pages/LeavePage"));
const KioskPage            = lazy(() => import("@/pages/KioskPage"));
const CompanyPickerPage    = lazy(() => import("@/pages/CompanyPickerPage"));
const ResetPasswordPage    = lazy(() => import("@/pages/ResetPasswordPage"));
const EmployeeLoginPage    = lazy(() => import("@/pages/EmployeeLoginPage"));
const EmployeePortalPage   = lazy(() => import("@/pages/EmployeePortalPage"));
const CompanyKioskPage     = lazy(() => import("@/pages/CompanyKioskPage"));
const NotFound             = lazy(() => import("@/pages/not-found"));

// Minimal full-page spinner shown while a lazy chunk loads
function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/"                  component={LandingPage} />
        <Route path="/auth"              component={AuthPage} />
        <Route path="/reset-password"    component={ResetPasswordPage} />
        <Route path="/employee-login"    component={EmployeeLoginPage} />
        <Route path="/employee-portal"   component={EmployeePortalPage} />
        <Route path="/clock"             component={KioskPage} />
        <Route path="/clock/:companyId">
          {(params: { companyId: string }) => <CompanyKioskPage companyId={params.companyId} />}
        </Route>
        <Route path="/pick-company"      component={CompanyPickerPage} />
        <Route path="/dashboard"         component={DashboardPage} />
        <Route path="/dashboard/staff"   component={StaffPage} />
        <Route path="/dashboard/rota"    component={RotaPage} />
        <Route path="/dashboard/time"    component={TimePage} />
        <Route path="/dashboard/leave"   component={LeavePage} />
        <Route                           component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
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

export default App;
