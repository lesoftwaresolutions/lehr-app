import { useLocation } from "wouter";
import { supabase } from "@/lib/supabaseClient";
import { STAFF_BILLING_MESSAGE } from "@/lib/plans";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// Shown to employee logins instead of any Checkout / billing controls: only the
// account owner can subscribe or manage billing.
export function StaffBillingNotice({ fullPage = true }: { fullPage?: boolean }) {
  const [, setLocation] = useLocation();
  const signOut = async () => {
    await supabase.auth.signOut();
    setLocation("/");
  };
  const card = (
    <Card className="max-w-md w-full p-8 text-center shadow-sm" data-testid="staff-billing-notice">
      <h1 className="text-xl font-bold text-slate-900 mb-2">Billing is managed by your company owner</h1>
      <p className="text-slate-600 mb-6">{STAFF_BILLING_MESSAGE}</p>
      {fullPage && (
        <Button variant="outline" onClick={signOut}>
          Sign out
        </Button>
      )}
    </Card>
  );
  return fullPage ? (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">{card}</div>
  ) : (
    card
  );
}
