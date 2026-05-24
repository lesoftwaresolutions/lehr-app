import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CompanyProvider } from "@/lib/CompanyContext";
import NotFound from "@/pages/not-found";
import LandingPage from "@/pages/LandingPage";
import AuthPage from "@/pages/AuthPage";
import DashboardPage from "@/pages/DashboardPage";
import StaffPage from "@/pages/StaffPage";
import RotaPage from "@/pages/RotaPage";
import TimePage from "@/pages/TimePage";
import LeavePage from "@/pages/LeavePage";
import KioskPage from "@/pages/KioskPage";
import CompanyPickerPage from "@/pages/CompanyPickerPage";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/clock" component={KioskPage} />
      <Route path="/pick-company" component={CompanyPickerPage} />
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/dashboard/staff" component={StaffPage} />
      <Route path="/dashboard/rota" component={RotaPage} />
      <Route path="/dashboard/time" component={TimePage} />
      <Route path="/dashboard/leave" component={LeavePage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
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
  );
}

export default App;
