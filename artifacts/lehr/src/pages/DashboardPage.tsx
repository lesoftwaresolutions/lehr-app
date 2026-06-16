import React from "react";
import { supabase } from "@/lib/supabaseClient";
import { useCompany } from "@/lib/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Clock, Users, Building, Link2, Copy, Check, Coffee, AlertTriangle } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface BreakEntry {
  id: string;
  name: string;
  breakMs: number;
  workMs: number;
  startTime?: string; // HH:MM of login
  breakStartTime?: string; // HH:MM of break start
}

// Helper for elapsed time (HH:MM)
function fmtHHMM(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function fmtTimeOnly(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}

// Standardized actions
function isLoginAct (a: string) { return a === "clock_in" || a === "login"; }
function isLogoutAct(a: string) { return a === "clock_out" || a === "logout"; }
function isBreakStart(a: string){ return a === "break_start" || a === "break-out"; }
function isBreakEnd  (a: string){ return a === "break_end" || a === "break-in"; }
function isClockedIn (a: string){ return isLoginAct(a) || isBreakEnd(a); }
function isOnBreakAct(a: string){ return isBreakStart(a); }

function computeLiveStatus(logs: { employee_id: string; action: string; timestamp: string }[], tick: number) {
  const byEmp: Record<string, { events: { action: string; ts: number; iso: string }[] }> = {};
  logs.forEach(l => {
    if (!byEmp[l.employee_id]) byEmp[l.employee_id] = { events: [] };
    byEmp[l.employee_id].events.push({ action: l.action, ts: new Date(l.timestamp).getTime(), iso: l.timestamp });
  });

  const lastActions: Record<string, string> = {};
  const breakMsMap: Record<string, number> = {};
  const workMsMap: Record<string, number> = {};
  const loginTimeMap: Record<string, string> = {};
  const lastBreakStartMap: Record<string, string> = {};

  Object.entries(byEmp).forEach(([id, { events }]) => {
    let workMs = 0, breakMs = 0;
    let lastWork: number | null = null, lastBreak: number | null = null;
    let firstLogin: string | null = null;
    let currentBreakStart: string | null = null;

    events.forEach(({ action, ts, iso }) => {
      if (isLoginAct(action)) {
        if (!firstLogin) firstLogin = iso;
      }

      if (isLoginAct(action) || isBreakEnd(action)) {
        if (lastBreak !== null) { breakMs += ts - lastBreak; lastBreak = null; }
        lastWork = ts;
      }
      if (isBreakStart(action)) {
        currentBreakStart = iso;
        if (lastWork !== null) { workMs += ts - lastWork; lastWork = null; }
        lastBreak = ts;
      }
      if (isLogoutAct(action)) {
        if (lastWork !== null) { workMs += ts - lastWork; lastWork = null; }
        if (lastBreak !== null) { breakMs += ts - lastBreak; lastBreak = null; }
      }
    });

    if (lastWork !== null)  workMs  += tick - lastWork;
    if (lastBreak !== null) breakMs += tick - lastBreak;

    lastActions[id] = events[events.length - 1]?.action ?? "";
    breakMsMap[id] = breakMs;
    workMsMap[id] = workMs;
    loginTimeMap[id] = firstLogin || "";
    lastBreakStartMap[id] = currentBreakStart || "";
  });

  return { lastActions, breakMsMap, workMsMap, loginTimeMap, lastBreakStartMap };
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
  const [activeStaff, setActiveStaff] = React.useState<BreakEntry[]>([]);
  const [rawLogs, setRawLogs] = React.useState<any[]>([]);
  const [staffList, setStaffList] = React.useState<any[]>([]);
  const [tick, setTick] = React.useState(Date.now());

  const kioskUrl = React.useMemo(() => {
    if (!activeCompany) return "";
    const base = window.location.origin + (import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "");
    return `${base}/clock/${activeCompany.id}`;
  }, [activeCompany]);

  // Tick for timers
  React.useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 10000); // update every 10s
    return () => clearInterval(t);
  }, []);

  const fetchAll = React.useCallback(async () => {
    if (!activeCompany) return;
    const companyId = activeCompany.id;
    const today = new Date().toISOString().split("T")[0];

    const [staffRes, shiftsRes, leaveRes, clockRes, companyRes] = await Promise.all([
      supabase.from("employees").select("*").eq("company_id", companyId).eq("status", "active"),
      supabase.from("shifts").select("*", { count: "exact", head: true }).eq("company_id", companyId).eq("date", today),
      supabase.from("leave_requests").select("*", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "pending"),
      supabase.from("time_logs").select("employee_id, action, timestamp").eq("company_id", companyId).gte("timestamp", `${today}T00:00:00`).order("timestamp", { ascending: true }),
      supabase.from("companies").select("*").eq("id", companyId).maybeSingle(),
    ]);

    const allowance = (companyRes.data as any)?.break_allowance_minutes ?? 30;
    setBreakAllowance(allowance);
    setBreakAllowanceInput(String(allowance));
    setStaffList(staffRes.data ?? []);
    setRawLogs(clockRes.data ?? []);
    setStats(s => ({ ...s, staff: staffRes.data?.length || 0, shifts: shiftsRes.count || 0, leave: leaveRes.count || 0 }));
  }, [activeCompany]);

  React.useEffect(() => { fetchAll(); }, [fetchAll]);

  // REALTIME SUBSCRIPTION
  React.useEffect(() => {
    if (!activeCompany) return;
    const channel = supabase.channel('dashboard-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'time_logs',
        filter: `company_id=eq.${activeCompany.id}`
      }, () => {
        fetchAll(); // Refresh on new log
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeCompany, fetchAll]);

  // Compute status on logs/tick change
  React.useEffect(() => {
    const { lastActions, breakMsMap, workMsMap, loginTimeMap, lastBreakStartMap } = computeLiveStatus(rawLogs, tick);

    const breakStaff: BreakEntry[] = [];
    const workingStaff: BreakEntry[] = [];

    Object.entries(lastActions).forEach(([id, action]) => {
      const emp = staffList.find(e => e.id === id);
      const entry: BreakEntry = {
        id,
        name: emp?.full_name ?? id,
        breakMs: breakMsMap[id] || 0,
        workMs: workMsMap[id] || 0,
        startTime: loginTimeMap[id],
        breakStartTime: lastBreakStartMap[id]
      };

      if (isOnBreakAct(action)) breakStaff.push(entry);
      else if (isClockedIn(action)) workingStaff.push(entry);
    });

    setOnBreakStaff(breakStaff);
    setActiveStaff(workingStaff);
    setStats(s => ({ ...s, clockedIn: workingStaff.length, onBreak: breakStaff.length }));
  }, [rawLogs, staffList, tick]);

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
      toast({ title: "Could not save", description: error.message, variant: "destructive" });
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary" />
              <CardTitle className="text-base font-semibold text-slate-900">Staff Kiosk Link</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                readOnly
                value={kioskUrl}
                className="text-xs text-slate-600 bg-slate-50 font-mono"
              />
              <Button variant="outline" size="icon" onClick={copyKioskUrl}>
                {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Coffee className="h-4 w-4 text-amber-500" />
              <CardTitle className="text-base font-semibold text-slate-900">Break Allowance</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 items-center">
              <Input
                type="number"
                value={breakAllowanceInput}
                onChange={e => setBreakAllowanceInput(e.target.value)}
                className="w-28"
              />
              <span className="text-slate-500 text-sm">minutes</span>
              <Button size="sm" className="ml-auto" onClick={saveBreakAllowance} disabled={savingBreak}>
                {savingBreak ? "Saving…" : "Save"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Now Monitor */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-emerald-500" />
              <CardTitle className="text-base font-semibold text-slate-900">Active Now</CardTitle>
              <span className="ml-auto text-xs bg-emerald-100 text-emerald-700 font-semibold px-2 py-0.5 rounded-full">{activeStaff.length}</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-slate-100">
              {activeStaff.length === 0 ? <p className="text-sm text-slate-400 py-2">No one working currently.</p> : activeStaff.map(e => (
                <div key={e.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <span className="text-sm font-medium text-slate-800 block">{e.name}</span>
                    <span className="text-[10px] text-slate-500">Started at {fmtTimeOnly(e.startTime || "")}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-emerald-600 tabular-nums">{fmtHHMM(e.workMs)}</span>
                    <div className="text-[10px] text-slate-400 uppercase">Total Work</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* On Break Monitor */}
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
              {onBreakStaff.length === 0 ? <p className="text-sm text-slate-400 py-2">No one on break currently.</p> : onBreakStaff.map(e => {
                const mins = Math.round(e.breakMs / 60_000);
                const over = mins > breakAllowance;
                return (
                  <div key={e.id} className="flex items-center justify-between py-2.5">
                    <div className="flex items-center gap-2.5">
                      {over ? <AlertTriangle size={15} className="text-rose-500 shrink-0" /> : <Coffee size={15} className="text-amber-400 shrink-0" />}
                      <div>
                        <span className="text-sm font-medium text-slate-800 block">{e.name}</span>
                        <span className="text-[10px] text-slate-500">Break at {fmtTimeOnly(e.breakStartTime || "")}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`text-sm font-bold tabular-nums ${over ? "text-rose-600" : "text-amber-600"}`}>{fmtHHMM(e.breakMs)}</span>
                      <span className="text-slate-400 text-xs ml-1">/ {breakAllowance}m</span>
                      {over && <div className="text-[10px] text-rose-500 font-bold uppercase">{mins - breakAllowance}m over limit</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
