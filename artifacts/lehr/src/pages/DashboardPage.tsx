import React from "react";
import { supabase } from "@/lib/supabaseClient";
import { useCompany } from "@/lib/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Clock, Users, Building, Link2, Copy, Check, Coffee, AlertTriangle } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

type ActionType = "clock_in" | "clock_out" | "break_in" | "break_out";

interface BreakEntry { id: string; name: string; breakMs: number; workMs: number; }

// Normalise action names — supports both old (clock_in/out/break_in/break_out)
// and new (login/logout/break-out/break-in) kiosk action values.
function isLoginAct (a: string) { return a === "login"     || a === "clock_in"; }
function isLogoutAct(a: string) { return a === "logout"    || a === "clock_out"; }
function isBreakStart(a: string){ return a === "break-out" || a === "break_in"; }
function isBreakEnd  (a: string){ return a === "break-in"  || a === "break_out"; }
function isClockedIn (a: string){ return isLoginAct(a) || isBreakEnd(a); }
function isOnBreakAct(a: string){ return isBreakStart(a); }

function computeLiveStatus(logs: { employee_id: string; action: string; timestamp: string }[]) {
  const byEmp: Record<string, { events: { action: string; ts: number }[] }> = {};
  logs.forEach(l => {
    if (!byEmp[l.employee_id]) byEmp[l.employee_id] = { events: [] };
    byEmp[l.employee_id].events.push({ action: l.action, ts: new Date(l.timestamp).getTime() });
  });

  const lastActions: Record<string, string> = {};
  const breakMsMap: Record<string, number> = {};

  Object.entries(byEmp).forEach(([id, { events }]) => {
    let breakMs = 0, lastBreak: number | null = null;
    events.forEach(({ action, ts }) => {
      if (isBreakStart(action)) lastBreak = ts;
      if ((isBreakEnd(action) || isLogoutAct(action)) && lastBreak !== null) {
        breakMs += ts - lastBreak; lastBreak = null;
      }
    });
    if (lastBreak !== null) breakMs += Date.now() - lastBreak;
    lastActions[id] = events[events.length - 1]?.action ?? "";
    breakMsMap[id] = breakMs;
  });

  return { lastActions, breakMsMap };
}

export default function DashboardPage() {
  const { activeCompany } = useCompany();
  const { toast } = useToast();
  const [stats, setStats] = React.useState({ staff: 0, shifts: 0, clockedIn: 0, leave: 0, onBreak: 0 });
  const [breakAllowance, setBreakAllowance] = React.useState<number>(30);
  const [breakAllowanceInput, setBreakAllowanceInput] = React.useState("30");
  const [savingBreak, setSavingBreak] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [onBreakStaff, setOnBreakStaff] = React.useState<BreakEntry[]>([]);

  const kioskUrl = React.useMemo(() => {
    if (!activeCompany) return "";
    const base = window.location.origin + (import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "");
    return `${base}/clock/${activeCompany.id}`;
  }, [activeCompany]);

  React.useEffect(() => {
    if (!activeCompany) return;
    const companyId = activeCompany.id;

    async function fetchAll() {
      const today = new Date().toISOString().split("T")[0];

      const [staffRes, shiftsRes, leaveRes, clockRes, companyRes] = await Promise.all([
        supabase.from("employees").select("id", { count: "exact", head: false }).eq("company_id", companyId).eq("status", "active"),
        supabase.from("shifts").select("*", { count: "exact", head: true }).eq("company_id", companyId).eq("date", today),
        supabase.from("leave_requests").select("*", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "pending"),
        supabase.from("time_logs").select("employee_id, action, timestamp").gte("timestamp", `${today}T00:00:00`).order("timestamp", { ascending: true }),
        supabase.from("companies").select("*").eq("id", companyId).maybeSingle(),
      ]);

      const allowance = (companyRes.data as any)?.break_allowance_minutes ?? 30;
      setBreakAllowance(allowance);
      setBreakAllowanceInput(String(allowance));

      // Filter logs to this company's employees
      const empIds = new Set((staffRes.data ?? []).map((e: any) => e.id));
      const logs = (clockRes.data ?? []).filter(l => empIds.has(l.employee_id));

      const { lastActions, breakMsMap } = computeLiveStatus(logs);

      const clockedIn = Object.values(lastActions).filter(isClockedIn).length;
      const onBreakCount = Object.values(lastActions).filter(isOnBreakAct).length;

      // Build on-break staff details
      const empList = staffRes.data ?? [];
      const breakStaff: BreakEntry[] = Object.entries(lastActions)
        .filter(([, a]) => isOnBreakAct(a))
        .map(([id]) => {
          const emp = (empList as any[]).find(e => e.id === id);
          return { id, name: emp?.full_name ?? id, breakMs: breakMsMap[id] ?? 0, workMs: 0 };
        });

      setOnBreakStaff(breakStaff);
      setStats({ staff: staffRes.count || 0, shifts: shiftsRes.count || 0, clockedIn, leave: leaveRes.count || 0, onBreak: onBreakCount });
    }

    fetchAll();
  }, [activeCompany]);

  const copyKioskUrl = () => {
    navigator.clipboard.writeText(kioskUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      toast({ title: "Kiosk URL copied!", description: "Share this link with your staff." });
    });
  };

  const saveBreakAllowance = async () => {
    if (!activeCompany) return;
    const mins = parseInt(breakAllowanceInput, 10);
    if (isNaN(mins) || mins < 1 || mins > 480) {
      toast({ title: "Invalid value", description: "Enter a number between 1 and 480 minutes.", variant: "destructive" });
      return;
    }
    setSavingBreak(true);
    const { error } = await supabase.from("companies").update({ break_allowance_minutes: mins }).eq("id", activeCompany.id);
    setSavingBreak(false);
    if (error) {
      toast({ title: "Could not save", description: "Run the required SQL migration first (see below).", variant: "destructive" });
    } else {
      setBreakAllowance(mins);
      toast({ title: "Break allowance saved", description: `Set to ${mins} minutes.` });
    }
  };

  return (
    <DashboardLayout title="Dashboard">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Welcome back</h2>
        <p className="text-slate-600">Here's what's happening in your business today.</p>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-8">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-slate-600">Total Staff</CardTitle>
            <Users className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900">{stats.staff}</div>
            <p className="text-xs text-slate-500 mt-1">Active team members</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-slate-600">Today's Shifts</CardTitle>
            <Calendar className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900">{stats.shifts}</div>
            <p className="text-xs text-slate-500 mt-1">Scheduled for today</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-slate-600">Clocked In</CardTitle>
            <Clock className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900">{stats.clockedIn}</div>
            <p className="text-xs text-primary mt-1 font-medium">Currently working</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-slate-600">Pending Leave</CardTitle>
            <Building className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900">{stats.leave}</div>
            <p className="text-xs text-amber-600 mt-1 font-medium">Require approval</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Kiosk + Break settings row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">

        {/* Kiosk URL */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary" />
              <CardTitle className="text-base font-semibold text-slate-900">Staff Kiosk Link</CardTitle>
            </div>
            <p className="text-xs text-slate-500 mt-1">Share this URL with your staff. They open it on any device to clock in and out.</p>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                readOnly
                value={kioskUrl}
                className="text-xs text-slate-600 bg-slate-50 font-mono"
                onClick={e => (e.target as HTMLInputElement).select()}
              />
              <Button variant="outline" size="icon" onClick={copyKioskUrl} className="shrink-0" title="Copy link">
                {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              This link is unique to your company — only your staff's PINs will work here.
            </p>
          </CardContent>
        </Card>

        {/* Break Allowance */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Coffee className="h-4 w-4 text-amber-500" />
              <CardTitle className="text-base font-semibold text-slate-900">Break Allowance</CardTitle>
            </div>
            <p className="text-xs text-slate-500 mt-1">Maximum break time per shift. Staff exceeding this will be highlighted on the kiosk.</p>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 items-center">
              <Input
                type="number"
                min={1}
                max={480}
                value={breakAllowanceInput}
                onChange={e => setBreakAllowanceInput(e.target.value)}
                className="w-28"
                placeholder="30"
              />
              <span className="text-slate-500 text-sm">minutes</span>
              <Button
                size="sm"
                className="ml-auto"
                onClick={saveBreakAllowance}
                disabled={savingBreak || breakAllowanceInput === String(breakAllowance)}
              >
                {savingBreak ? "Saving…" : "Save"}
              </Button>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Current: <strong>{breakAllowance} mins</strong>. Requires the break_allowance_minutes column in the companies table.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── On Break Monitor ── */}
      {onBreakStaff.length > 0 && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Coffee className="h-4 w-4 text-amber-500" />
              <CardTitle className="text-base font-semibold text-slate-900">Currently on Break</CardTitle>
              <span className="ml-auto text-xs bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded-full">{onBreakStaff.length}</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-slate-100">
              {onBreakStaff.map(e => {
                const mins = Math.round(e.breakMs / 60_000);
                const over = mins > breakAllowance;
                return (
                  <div key={e.id} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-2.5">
                      {over
                        ? <AlertTriangle size={15} className="text-rose-500 shrink-0" />
                        : <Coffee size={15} className="text-amber-400 shrink-0" />
                      }
                      <span className="text-sm font-medium text-slate-800">{e.name}</span>
                    </div>
                    <div className="text-right">
                      <span className={`text-sm font-bold ${over ? "text-rose-600" : "text-amber-600"}`}>{mins}m</span>
                      <span className="text-slate-400 text-xs ml-1">/ {breakAllowance}m</span>
                      {over && <span className="ml-2 text-[11px] text-rose-500 font-semibold">OVER LIMIT</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </DashboardLayout>
  );
}
