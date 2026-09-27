import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("too many") || m.includes("rate") || m.includes("429")) {
    return "Too many attempts — please wait a few minutes and try again.";
  }
  if (m.includes("email not confirmed")) {
    return "Please confirm your email first — check your inbox for the confirmation link.";
  }
  if (m.includes("invalid login") || m.includes("invalid credentials")) {
    return "Incorrect email or password. Please check and try again.";
  }
  if (m.includes("user already registered") || m.includes("already exists")) {
    return "An account with this email already exists. Try signing in instead.";
  }
  if (m.includes("password") && m.includes("characters")) {
    return "Password must be at least 6 characters.";
  }
  if (m.includes("network") || m.includes("fetch")) {
    return "Network error — check your connection and try again.";
  }
  return message;
}

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { session, authReady } = useAuth();

  // A ?plan=... query (from the landing-page pricing buttons) preselects the
  // signup tab and is carried through to /choose-plan after registration.
  const planParam = new URLSearchParams(window.location.search).get("plan");
  const planQuery = planParam ? `?plan=${encodeURIComponent(planParam)}` : "";
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [awaitingConfirmation, setAwaitingConfirmation] = useState<string | null>(null);
  const [connStatus, setConnStatus] = useState<"checking" | "ok" | "error">("checking");
  const [connError, setConnError] = useState("");

  // Redirect to dashboard if already logged in
  useEffect(() => {
    if (authReady && session) {
      setLocation(planParam ? `/choose-plan${planQuery}` : "/dashboard");
    }
  }, [authReady, session, setLocation, planParam, planQuery]);

  useEffect(() => {
    supabase.auth.getSession().then(({ error }) => {
      if (error) {
        setConnStatus("error");
        setConnError(error.message || String(error));
      } else {
        setConnStatus("ok");
      }
    }).catch((err: any) => {
      setConnStatus("error");
      setConnError(err?.message || "Cannot reach Supabase — check project URL and key.");
    });
  }, []);

  const handleForgotPassword = async () => {
    if (!email) {
      toast({ title: "Enter your email first", description: "Type your email address above, then click Forgot password.", variant: "destructive" });
      return;
    }
    try {
      setIsLoading(true);
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast({ title: "Reset email sent", description: `Check ${email} for a password reset link.` });
    } catch (error: any) {
      toast({
        title: "Could not send reset email",
        description: friendlyAuthError(error?.message || "An unexpected error occurred."),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignIn = async () => {
    try {
      setIsLoading(true);
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // AuthGuard + CompanyProvider in ProtectedApp handle company loading after redirect
      setLocation("/dashboard");
    } catch (error: any) {
      toast({
        title: "Sign in failed",
        description: friendlyAuthError(error?.message || "An unexpected error occurred."),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!companyName.trim()) {
      toast({ title: "Company name required", description: "Please enter your company or shop name.", variant: "destructive" });
      return;
    }
    try {
      setIsLoading(true);
      // The company name travels in the user's metadata; CompanyProvider creates
      // the company on the first signed-in session. That works whether or not
      // Supabase requires email confirmation (which returns no session here).
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { company_name: companyName.trim() },
          emailRedirectTo: `${window.location.origin}/choose-plan${planQuery}`,
        },
      });
      if (error) throw error;

      if (!data.user) throw new Error("Sign up succeeded but no user returned.");

      if (!data.session) {
        // Email confirmation is required: wait for the user to click the link.
        setAwaitingConfirmation(email);
        return;
      }

      // New companies start unsubscribed — send them to plan selection.
      // SubscriptionGate would bounce them here anyway; this keeps the ?plan hint.
      toast({ title: "Account created!", description: "Now choose a plan to get started." });
      setLocation(`/choose-plan${planQuery}`);
    } catch (error: any) {
      toast({
        title: "Sign up failed",
        description: friendlyAuthError(error?.message || "An unexpected error occurred."),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendConfirmation = async () => {
    if (!awaitingConfirmation) return;
    try {
      setIsLoading(true);
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: awaitingConfirmation,
        options: { emailRedirectTo: `${window.location.origin}/choose-plan${planQuery}` },
      });
      if (error) throw error;
      toast({ title: "Email sent", description: `We've sent another confirmation link to ${awaitingConfirmation}.` });
    } catch (error: any) {
      toast({
        title: "Could not resend email",
        description: friendlyAuthError(error?.message || "An unexpected error occurred."),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (awaitingConfirmation) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md shadow-xl border-slate-200 p-8 text-center" data-testid="confirm-email-card">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Check your email</h1>
          <p className="text-slate-600 mb-6">
            We've sent a confirmation link to <span className="font-medium">{awaitingConfirmation}</span>.
            Click it to verify your address, then you'll choose your plan to get started.
          </p>
          <div className="space-y-3">
            <Button variant="outline" className="w-full" onClick={handleResendConfirmation} disabled={isLoading}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Resend email
            </Button>
            <Button variant="ghost" className="w-full text-slate-500" onClick={() => setAwaitingConfirmation(null)}>
              Back to sign in
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
      <div className="mb-8 flex items-center justify-center gap-3">
        <img src="/logo.jpeg" alt="LEHR Logo" className="h-10 object-contain rounded" />
        <span className="font-bold text-2xl text-primary">LEHR</span>
      </div>

      {connStatus === "error" && (
        <div className="w-full max-w-md mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800" data-testid="conn-error-banner">
          <p className="font-semibold mb-1">Cannot connect to Supabase</p>
          <p className="font-mono text-xs break-all">{connError || "Failed to fetch — project may be paused or URL is wrong."}</p>
          <p className="mt-2 text-xs text-red-600">Check: Settings → API in your Supabase dashboard and confirm the project is not paused.</p>
        </div>
      )}
      {connStatus === "checking" && (
        <div className="w-full max-w-md mb-4 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-500 flex items-center gap-2" data-testid="conn-checking-banner">
          <Loader2 className="h-4 w-4 animate-spin" /> Connecting to Supabase...
        </div>
      )}

      <Card className="w-full max-w-md shadow-xl border-slate-200">
        <Tabs defaultValue={planParam ? "signup" : "login"} className="w-full">
          <TabsList className="grid w-full grid-cols-2 rounded-none rounded-t-lg border-b bg-slate-50 p-0 h-14">
            <TabsTrigger
              value="login"
              className="data-[state=active]:bg-white data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full font-medium"
              data-testid="tab-login"
            >
              Sign In
            </TabsTrigger>
            <TabsTrigger
              value="signup"
              className="data-[state=active]:bg-white data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full font-medium"
              data-testid="tab-signup"
            >
              Create Account
            </TabsTrigger>
          </TabsList>

          {/* ── Sign In ── */}
          <TabsContent value="login" className="p-6 m-0">
            <CardHeader className="p-0 mb-6">
              <CardTitle>Sign in to your account</CardTitle>
              <CardDescription>Enter your email and password to access your dashboard.</CardDescription>
            </CardHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">Email</Label>
                <Input
                  id="login-email"
                  type="email"
                  placeholder="manager@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  disabled={isLoading}
                  data-testid="input-login-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password">Password</Label>
                <Input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  disabled={isLoading}
                  onKeyDown={e => e.key === "Enter" && handleSignIn()}
                  data-testid="input-login-password"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={isLoading}
                  className="text-xs text-slate-500 hover:text-primary transition-colors"
                >
                  Forgot password?
                </button>
              </div>
              <Button
                className="w-full mt-2"
                onClick={handleSignIn}
                disabled={isLoading || !email || !password}
                data-testid="button-submit-login"
              >
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Sign In
              </Button>
            </div>
          </TabsContent>

          {/* ── Sign Up ── */}
          <TabsContent value="signup" className="p-6 m-0">
            <CardHeader className="p-0 mb-6">
              <CardTitle>Start your free trial</CardTitle>
              <CardDescription>Get your business organised in minutes. After sign-up you'll choose a plan: 14-day free trial, card required, £0 today — charged monthly after 14 days unless you cancel.</CardDescription>
            </CardHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signup-company">Company / Shop Name</Label>
                <Input
                  id="signup-company"
                  type="text"
                  placeholder="e.g. MB Hastings"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  disabled={isLoading}
                  data-testid="input-signup-company"
                />
                <p className="text-xs text-slate-400">You can add more locations after signing up.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-email">Email address</Label>
                <Input
                  id="signup-email"
                  type="email"
                  placeholder="manager@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  disabled={isLoading}
                  data-testid="input-signup-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-password">Create password</Label>
                <Input
                  id="signup-password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  disabled={isLoading}
                  onKeyDown={e => e.key === "Enter" && handleSignUp()}
                  data-testid="input-signup-password"
                />
              </div>
              <Button
                className="w-full mt-4"
                onClick={handleSignUp}
                disabled={isLoading || !email || !password || !companyName.trim()}
                data-testid="button-submit-signup"
              >
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Create Account
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}
