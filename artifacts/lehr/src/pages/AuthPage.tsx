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

  // Check if already logged in
  React.useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setLocation("/dashboard");
      }
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
      toast({ 
        title: "Authentication failed", 
        description: error.message || "An unexpected error occurred.",
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
