import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabaseClient";
import { useCompany } from "@/lib/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { refreshCompanies, setActiveCompany } = useCompany();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [connStatus, setConnStatus] = useState<"checking" | "ok" | "error">("checking");
  const [connError, setConnError] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        setConnStatus("error");
        setConnError(error.message || String(error));
      } else {
        setConnStatus("ok");
        if (session) setLocation("/dashboard");
      }
    }).catch((err: any) => {
      setConnStatus("error");
      setConnError(err?.message || "Cannot reach Supabase — check project URL and key.");
    });
  }, [setLocation]);

  const handleSignIn = async () => {
    try {
      setIsLoading(true);
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      // Load companies for this user
      const companies = await refreshCompanies();
      if (companies.length === 0) {
        // Signed in but no companies — go to dashboard anyway
        toast({ title: "Welcome back!" });
        setLocation("/dashboard");
      } else if (companies.length === 1) {
        setActiveCompany(companies[0]);
        toast({ title: "Welcome back!", description: companies[0].name });
        setLocation("/dashboard");
      } else {
        // Multiple companies — let them pick
        setLocation("/pick-company");
      }
    } catch (error: any) {
      toast({
        title: "Sign in failed",
        description: error?.message || "An unexpected error occurred.",
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
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;

      const user = data.user;
      if (!user) throw new Error("Sign up succeeded but no user returned.");

      // Create the company record immediately (session is available since email confirmation is off)
      const { data: company, error: companyError } = await supabase
        .from("companies")
        .insert([{ name: companyName.trim(), owner_id: user.id }])
        .select()
        .single();

      if (companyError) {
        // Company creation failed — still let them in, they can add later
        toast({
          title: "Account created",
          description: "Your account is ready. You can add your company from the dashboard.",
        });
      } else {
        setActiveCompany(company);
        toast({ title: "Account created!", description: `Welcome to LEHR — ${company.name} is ready.` });
      }

      setLocation("/dashboard");
    } catch (error: any) {
      toast({
        title: "Sign up failed",
        description: error?.message || "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
      <div className="mb-8 flex items-center justify-center gap-3">
        <img src="/lehr-logo.png" alt="LEHR Logo" className="h-10" />
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
        <Tabs defaultValue="login" className="w-full">
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
              <Button
                className="w-full mt-4"
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
              <CardDescription>Get your business organised in minutes. No credit card required.</CardDescription>
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
