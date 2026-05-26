import { useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Delete } from "lucide-react";

export default function EmployeeLoginPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handlePinKey = (digit: string) => {
    if (pin.length < 4) setPin(p => p + digit);
  };

  const handleLogin = async () => {
    if (!email.trim() || pin.length !== 4) {
      toast({ title: "Enter your email and 4-digit PIN", variant: "destructive" });
      return;
    }
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("employees")
        .select("*, companies(name)")
        .eq("email", email.trim().toLowerCase())
        .eq("pin_code", pin)
        .eq("status", "active")
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        toast({ title: "Invalid email or PIN", description: "Please check your details and try again.", variant: "destructive" });
        setPin("");
        return;
      }
      sessionStorage.setItem("employee_session", JSON.stringify(data));
      setLocation("/employee-portal");
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Something went wrong.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
      <div className="mb-8 flex items-center gap-3">
        <img src="/logo.jpeg" alt="LEHR Logo" className="h-10 object-contain rounded" />
        <span className="font-bold text-2xl text-primary">LEHR</span>
      </div>

      <Card className="w-full max-w-sm shadow-xl border-slate-200 p-6">
        <CardHeader className="p-0 mb-6">
          <CardTitle>Employee Login</CardTitle>
          <CardDescription>Enter your email and 4-digit PIN to access your portal.</CardDescription>
        </CardHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="emp-email">Email address</Label>
            <Input
              id="emp-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label>PIN</Label>
            <div className="flex gap-2 justify-center my-2">
              {[0, 1, 2, 3].map(i => (
                <div
                  key={i}
                  className={`w-12 h-12 rounded-lg border-2 flex items-center justify-center text-2xl font-bold transition-colors ${
                    pin.length > i ? "border-primary bg-primary/10 text-primary" : "border-slate-200 bg-white text-transparent"
                  }`}
                >
                  {pin.length > i ? "•" : ""}
                </div>
              ))}
            </div>

            {/* Numpad */}
            <div className="grid grid-cols-3 gap-2 mt-3">
              {["1","2","3","4","5","6","7","8","9"].map(d => (
                <button
                  key={d}
                  onClick={() => handlePinKey(d)}
                  disabled={isLoading || pin.length === 4}
                  className="h-12 rounded-lg border border-slate-200 bg-white text-slate-800 font-semibold text-lg hover:bg-slate-50 hover:border-primary/50 active:scale-95 transition-all disabled:opacity-40"
                >
                  {d}
                </button>
              ))}
              <button
                onClick={() => setPin("")}
                disabled={isLoading || pin.length === 0}
                className="h-12 rounded-lg border border-slate-200 bg-white text-slate-500 flex items-center justify-center hover:bg-slate-50 active:scale-95 transition-all disabled:opacity-40"
              >
                <Delete size={18} />
              </button>
              <button
                onClick={() => handlePinKey("0")}
                disabled={isLoading || pin.length === 4}
                className="h-12 rounded-lg border border-slate-200 bg-white text-slate-800 font-semibold text-lg hover:bg-slate-50 hover:border-primary/50 active:scale-95 transition-all disabled:opacity-40"
              >
                0
              </button>
              <button
                onClick={() => setPin(p => p.slice(0, -1))}
                disabled={isLoading || pin.length === 0}
                className="h-12 rounded-lg border border-slate-200 bg-white text-slate-500 flex items-center justify-center hover:bg-slate-50 active:scale-95 transition-all disabled:opacity-40"
              >
                ⌫
              </button>
            </div>
          </div>

          <Button
            className="w-full mt-2"
            onClick={handleLogin}
            disabled={isLoading || !email.trim() || pin.length !== 4}
          >
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Sign In
          </Button>

          <p className="text-center text-xs text-slate-400 pt-2">
            Manager?{" "}
            <a href="/auth" className="text-primary hover:underline">Sign in here</a>
          </p>
        </div>
      </Card>
    </div>
  );
}
