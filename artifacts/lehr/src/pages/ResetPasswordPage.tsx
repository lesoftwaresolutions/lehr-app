import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2 } from "lucide-react";

export default function ResetPasswordPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [validSession, setValidSession] = useState(false);

  useEffect(() => {
    // Supabase puts the recovery token in the URL hash — it auto-exchanges it
    // into a session when the page loads. We just need to wait for the session.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setValidSession(true);
      } else {
        // No session — the link may be expired or already used
        toast({
          title: "Link expired",
          description: "This password reset link is no longer valid. Please request a new one.",
          variant: "destructive",
        });
      }
    });
  }, []);

  const handleReset = async () => {
    if (password !== confirm) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    if (password.length < 6) {
      toast({ title: "Password too short", description: "Please use at least 6 characters.", variant: "destructive" });
      return;
    }
    try {
      setIsLoading(true);
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      setTimeout(() => setLocation("/auth"), 3000);
    } catch (error: any) {
      toast({
        title: "Failed to update password",
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
        <img src="/logo.jpeg" alt="LEHR Logo" className="h-10 object-contain rounded" />
        <span className="font-bold text-2xl text-primary">LEHR</span>
      </div>

      <Card className="w-full max-w-md shadow-xl border-slate-200 p-6">
        {done ? (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <h2 className="text-xl font-semibold text-slate-800">Password updated</h2>
            <p className="text-slate-500 text-sm">Your password has been changed. Redirecting you to sign in…</p>
          </div>
        ) : (
          <>
            <CardHeader className="p-0 mb-6">
              <CardTitle>Set a new password</CardTitle>
              <CardDescription>Enter and confirm your new password below.</CardDescription>
            </CardHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  disabled={isLoading || !validSession}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  disabled={isLoading || !validSession}
                  onKeyDown={e => e.key === "Enter" && handleReset()}
                />
              </div>
              <Button
                className="w-full mt-2"
                onClick={handleReset}
                disabled={isLoading || !password || !confirm || !validSession}
              >
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Update Password
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
