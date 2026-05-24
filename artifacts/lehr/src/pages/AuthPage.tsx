import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [connStatus, setConnStatus] = useState<"checking" | "ok" | "error">("checking");
  const [connError, setConnError] = useState("");

  // Check if already logged in
  React.useEffect(() => {
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

  const handleAuth = async (mode: "login" | "signup") => {
    try {
      setIsLoading(true);
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast({ title: "Welcome back!", description: "Successfully logged in." });
        setLocation("/dashboard");
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        toast({ title: "Account created!", description: "Please check your email to verify your account." });
      }
    } catch (error: any) {
      const message = error?.message || error?.error_description || String(error) || "An unexpected error occurred.";
      toast({ 
        title: "Authentication failed", 
        description: message,
        variant: "destructive"
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
                  onChange={(e) => setEmail(e.target.value)}
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
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  data-testid="input-login-password"
                />
              </div>
              <Button 
                className="w-full mt-4" 
                onClick={() => handleAuth("login")}
                disabled={isLoading || !email || !password}
                data-testid="button-submit-login"
              >
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Sign In
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="signup" className="p-6 m-0">
            <CardHeader className="p-0 mb-6">
              <CardTitle>Start your free trial</CardTitle>
              <CardDescription>Get your business organised in minutes. No credit card required.</CardDescription>
            </CardHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signup-email">Email address</Label>
                <Input 
                  id="signup-email" 
                  type="email" 
                  placeholder="manager@example.com" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  data-testid="input-signup-password"
                />
              </div>
              <Button 
                className="w-full mt-4" 
                onClick={() => handleAuth("signup")}
                disabled={isLoading || !email || !password}
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
