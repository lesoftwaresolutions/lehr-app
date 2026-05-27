import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Delete, AlertTriangle, Coffee, UserCheck, Clock } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────
type ActionType = "clock_in" | "clock_out" | "break_in" | "break_out";
type Phase = "idle" | "lookup" | "action" | "processing" | "feedback";

interface Company { id: string; name: string; break_allowance_minutes: number | null; }
interface FoundEmployee { id: string; full_name: string; lastAction: ActionType | null; }
interface StaffEntry { id: string; name: string; workMs: number; breakMs: number; }
interface FeedbackData { name: string; action: ActionType; totalHours: number; breakMins: number; }

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtElapsed(ms: number) {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

function availableActions(last: ActionType | null): ActionType[] {
  if (!last || last === "clock_out") return ["clock_in"];
  if (last === "clock_in" || last === "break_out") return ["break_in", "clock_out"];
  if (last === "break_in") return ["break_out"];
  return ["clock_in"];
}

type RawLog = { employee_id: string; action: string; timestamp: string; employees: { full_name: string } | null };

function computeStatus(logs: RawLog[], now: number) {
  const byEmp: Record<string, { name: string; events: { action: string; ts: number }[] }> = {};
  logs.forEach(l => {
    if (!byEmp[l.employee_id]) byEmp[l.employee_id] = { name: l.employees?.full_name ?? "?", events: [] };
    byEmp[l.employee_id].events.push({ action: l.action, ts: new Date(l.timestamp).getTime() });
  });

  const working: StaffEntry[] = [];
  const onBreak: StaffEntry[] = [];

  Object.entries(byEmp).forEach(([id, { name, events }]) => {
    let workMs = 0, breakMs = 0;
    let lastWork: number | null = null, lastBreak: number | null = null;
    events.forEach(({ action, ts }) => {
      if (action === "clock_in" || action === "break_out") {
        if (lastBreak !== null) { breakMs += ts - lastBreak; lastBreak = null; }
        lastWork = ts;
      }
      if (action === "break_in") {
        if (lastWork !== null) { workMs += ts - lastWork; lastWork = null; }
        lastBreak = ts;
      }
      if (action === "clock_out") {
        if (lastWork !== null) { workMs += ts - lastWork; lastWork = null; }
        if (lastBreak !== null) { breakMs += ts - lastBreak; lastBreak = null; }
      }
    });
    if (lastWork !== null) workMs += now - lastWork;
    if (lastBreak !== null) breakMs += now - lastBreak;

    const last = events[events.length - 1]?.action;
    if (last === "clock_in" || last === "break_out") working.push({ id, name, workMs, breakMs });
    else if (last === "break_in") onBreak.push({ id, name, workMs, breakMs });
  });

  return { working, onBreak };
}

function computeTotalWork(logs: { action: string; ts: number }[]) {
  let workMs = 0, lastWork: number | null = null;
  logs.forEach(({ action, ts }) => {
    if (action === "clock_in" || action === "break_out") lastWork = ts;
    if ((action === "break_in" || action === "clock_out") && lastWork !== null) {
      workMs += ts - lastWork; lastWork = null;
    }
  });
  return workMs / 3_600_000;
}

// ── Labels / styles ──────────────────────────────────────────────────────────
const ACTION_CONFIG: Record<ActionType, { label: string; style: string; description: string }> = {
  clock_in:  { label: "Login",     style: "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/40", description: "Start your shift" },
  break_in:  { label: "Break In",  style: "bg-amber-500 hover:bg-amber-400 text-slate-900 shadow-amber-900/40",  description: "Start your break" },
  break_out: { label: "Break Out", style: "bg-sky-500 hover:bg-sky-400 text-white shadow-sky-900/40",            description: "End your break" },
  clock_out: { label: "Logout",    style: "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/40",          description: "End your shift" },
};

// ── Component ────────────────────────────────────────────────────────────────
export default function CompanyKioskPage({ companyId = "" }: { companyId?: string }) {

  const [company, setCompany] = useState<Company | null>(null);
  const [companyError, setCompanyError] = useState(false);
  const [pin, setPin] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [foundEmp, setFoundEmp] = useState<FoundEmployee | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackData | null>(null);
  const [rawLogs, setRawLogs] = useState<RawLog[]>([]);
  const [tick, setTick] = useState(Date.now());
  const [clock, setClock] = useState(new Date());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const breakAllowance = company?.break_allowance_minutes ?? 30;

  // Live clock every second
  useEffect(() => {
    const t = setInterval(() => { setClock(new Date()); setTick(Date.now()); }, 1000);
    return () => clearInterval(t);
  }, []);

  // Fetch company
  useEffect(() => {
    if (!companyId) return;
    supabase.from("companies").select("*").eq("id", companyId).maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) { setCompanyError(true); return; }
        setCompany({
          id: data.id,
          name: data.name,
          break_allowance_minutes: data.break_allowance_minutes ?? null,
        });
      });
  }, [companyId]);

  // Fetch today's logs for live panel
  const fetchLogs = useCallback(async () => {
    if (!companyId) return;
    const today = new Date().toISOString().split("T")[0];
    const { data } = await supabase
      .from("time_logs")
      .select("employee_id, action, timestamp, employees!inner(full_name, company_id)")
      .gte("timestamp", `${today}T00:00:00`)
      .order("timestamp", { ascending: true });
    if (data) {
      // Filter to only this company's employees
      const filtered = (data as any[]).filter(l => l.employees?.company_id === companyId);
      setRawLogs(filtered);
    }
  }, [companyId]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // Poll every 30s
  useEffect(() => {
    pollRef.current = setInterval(fetchLogs, 30_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchLogs]);

  const reset = (delay = 0) => {
    setTimeout(() => {
      setPin(""); setPhase("idle"); setFoundEmp(null); setError(null); setFeedback(null);
    }, delay);
  };

  const handleKey = (key: string) => {
    if (phase === "lookup" || phase === "processing" || phase === "feedback") return;
    if (phase === "action") { if (key === "clear" || key === "⌫") { setFoundEmp(null); setPin(""); setPhase("idle"); } return; }
    if (key === "clear") { setPin(""); setError(null); return; }
    if (key === "⌫") { setPin(p => p.slice(0, -1)); setError(null); return; }
    if (pin.length < 4) {
      const next = pin + key;
      setPin(next);
      setError(null);
      if (next.length === 4) setTimeout(() => lookupPin(next), 150);
    }
  };

  const lookupPin = async (enteredPin: string) => {
    setPhase("lookup");
    const { data: emps } = await supabase
      .from("employees")
      .select("id, full_name")
      .eq("pin_code", enteredPin)
      .eq("company_id", companyId)
      .eq("status", "active")
      .limit(1);

    if (!emps || emps.length === 0) {
      setError("PIN not recognised. Please try again.");
      setPin(""); setPhase("idle");
      setTimeout(() => setError(null), 3000);
      return;
    }

    const emp = emps[0];
    const today = new Date().toISOString().split("T")[0];
    const { data: lastLogs } = await supabase
      .from("time_logs")
      .select("action")
      .eq("employee_id", emp.id)
      .gte("timestamp", `${today}T00:00:00`)
      .order("timestamp", { ascending: false })
      .limit(1);

    setFoundEmp({ id: emp.id, full_name: emp.full_name, lastAction: (lastLogs?.[0]?.action as ActionType) ?? null });
    setPhase("action");
  };

  const handleAction = async (action: ActionType) => {
    if (!foundEmp) return;
    setPhase("processing");
    const now = new Date();

    await supabase.from("time_logs").insert([{ employee_id: foundEmp.id, action, timestamp: now.toISOString() }]);

    // Compute totals for feedback
    const today = now.toISOString().split("T")[0];
    const { data: todayLogs } = await supabase
      .from("time_logs")
      .select("action, timestamp")
      .eq("employee_id", foundEmp.id)
      .gte("timestamp", `${today}T00:00:00`)
      .order("timestamp", { ascending: true });

    const events = (todayLogs ?? []).map(l => ({ action: l.action, ts: new Date(l.timestamp).getTime() }));
    const totalHours = computeTotalWork(events);
    const breakMs = events.reduce((acc, { action, ts }, i, arr) => {
      if (action === "break_in") {
        const nextOut = arr.slice(i + 1).find(e => e.action === "break_out" || e.action === "clock_out");
        return acc + ((nextOut?.ts ?? Date.now()) - ts);
      }
      return acc;
    }, 0);

    setFeedback({ name: foundEmp.full_name, action, totalHours, breakMins: Math.round(breakMs / 60_000) });
    setPhase("feedback");
    fetchLogs();

    feedbackTimer.current = setTimeout(() => reset(), 5000);
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const { working, onBreak } = computeStatus(rawLogs, tick);
  const actions = foundEmp ? availableActions(foundEmp.lastAction) : [];

  // Current employee's status from live panel
  const empStatus = foundEmp
    ? [...working, ...onBreak].find(e => e.id === foundEmp.id)
    : null;

  if (!companyId || companyError) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white text-center p-8">
        <div>
          <p className="text-slate-400 text-sm mb-2">Kiosk not found</p>
          <p className="text-xl font-semibold">Invalid company link.</p>
          <p className="text-slate-500 text-sm mt-2">Please ask your manager for the correct kiosk URL.</p>
        </div>
      </div>
    );
  }

  if (!company) {
    return <div className="min-h-screen bg-slate-900 flex items-center justify-center"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="min-h-screen bg-slate-900 flex select-none overflow-hidden">

      {/* ── LEFT PANEL: PIN Entry ─────────────────────────────────────────── */}
      <div className="flex flex-col items-center justify-center w-full md:w-[45%] p-6 md:p-10 border-r border-slate-800">
        {/* Logo + Clock */}
        <div className="text-center mb-8 w-full">
          <div className="flex items-center justify-center gap-3 mb-6">
            <img src="/logo.jpeg" alt="LEHR" className="h-8 object-contain rounded" />
            <span className="font-bold text-white text-lg">LEHR</span>
          </div>
          <p className="text-6xl font-bold text-white tabular-nums tracking-tight">
            {clock.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
          </p>
          <p className="text-slate-400 mt-2 text-sm">
            {clock.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>

        {/* ── Feedback overlay ── */}
        {phase === "feedback" && feedback && (
          <div className={`w-full max-w-xs rounded-2xl border-2 p-6 text-center ${
            feedback.action === "clock_in"  ? "bg-emerald-900/40 border-emerald-500/40" :
            feedback.action === "break_in"  ? "bg-amber-900/40 border-amber-500/40" :
            feedback.action === "break_out" ? "bg-sky-900/40 border-sky-500/40" :
            "bg-rose-900/40 border-rose-500/40"
          }`}>
            <p className="text-2xl font-bold text-white mb-1">{feedback.name}</p>
            {feedback.action === "clock_in" && <p className="text-emerald-300 text-lg">Welcome! Shift started.</p>}
            {feedback.action === "break_in" && (
              <>
                <p className="text-amber-300 text-lg">Break started.</p>
                <p className="text-amber-400/70 text-sm mt-1">{breakAllowance} min allowance</p>
              </>
            )}
            {feedback.action === "break_out" && <p className="text-sky-300 text-lg">Break ended. Back to work!</p>}
            {feedback.action === "clock_out" && (
              <>
                <p className="text-rose-300 text-lg">Shift ended.</p>
                <p className="text-white font-bold text-2xl mt-2">{feedback.totalHours.toFixed(2)} hrs</p>
                <p className="text-slate-400 text-sm">worked today</p>
                {feedback.breakMins > 0 && <p className="text-slate-500 text-xs mt-1">{feedback.breakMins}m break taken</p>}
              </>
            )}
            <p className="text-slate-500 text-xs mt-4">Closing in a moment…</p>
          </div>
        )}

        {/* ── PIN + action area ── */}
        {phase !== "feedback" && (
          <div className="w-full max-w-xs">
            {/* Employee found card */}
            {phase === "action" && foundEmp && (
              <div className="mb-5 bg-slate-800 rounded-xl p-4 text-center border border-slate-700">
                <p className="text-white font-bold text-lg">{foundEmp.full_name}</p>
                {empStatus ? (
                  <p className="text-slate-400 text-sm mt-1">
                    {onBreak.find(e => e.id === foundEmp.id)
                      ? `On break · ${fmtElapsed(empStatus.breakMs)}`
                      : `Working · ${fmtElapsed(empStatus.workMs)}`}
                  </p>
                ) : (
                  <p className="text-slate-500 text-sm mt-1">
                    {foundEmp.lastAction ? `Last: ${ACTION_CONFIG[foundEmp.lastAction]?.label}` : "Not clocked in today"}
                  </p>
                )}
              </div>
            )}

            {/* PIN dots (hidden during action phase) */}
            {phase !== "action" && (
              <>
                <div className="flex gap-3 justify-center mb-5">
                  {Array.from({ length: 4 }, (_, i) => (
                    <div key={i} className={`w-14 h-14 rounded-xl border-2 flex items-center justify-center text-3xl font-bold transition-all ${
                      i < pin.length ? "border-primary bg-primary/20 text-primary" : "border-slate-700 bg-slate-800 text-transparent"
                    }`}>
                      {i < pin.length ? "•" : ""}
                    </div>
                  ))}
                </div>
                {error && <p className="text-center text-red-400 text-sm mb-3 font-medium">{error}</p>}
                {!error && phase === "idle" && <p className="text-center text-slate-500 text-sm mb-5">Enter your 4-digit PIN</p>}
                {phase === "lookup" && <p className="text-center text-slate-400 text-sm mb-5 animate-pulse">Looking up…</p>}
              </>
            )}

            {/* Action buttons */}
            {phase === "action" && foundEmp && (
              <div className="space-y-2.5 mb-4">
                {actions.map(action => (
                  <button
                    key={action}
                    onClick={() => handleAction(action)}
                    className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg transition-all active:scale-95 ${ACTION_CONFIG[action].style}`}
                  >
                    {ACTION_CONFIG[action].label}
                    <span className="block text-xs font-normal opacity-75 mt-0.5">{ACTION_CONFIG[action].description}</span>
                  </button>
                ))}
                <button
                  onClick={() => { setFoundEmp(null); setPin(""); setPhase("idle"); }}
                  className="w-full py-2 text-slate-500 text-xs hover:text-slate-400 transition-colors"
                >
                  Not you? Clear PIN
                </button>
              </div>
            )}

            {/* Numpad */}
            {(phase === "idle" || phase === "lookup") && (
              <div className="grid grid-cols-3 gap-3">
                {["1","2","3","4","5","6","7","8","9","clear","0","⌫"].map(key => (
                  <button
                    key={key}
                    onClick={() => handleKey(key)}
                    disabled={phase === "lookup"}
                    className={`h-16 rounded-xl font-bold text-xl transition-all active:scale-95 disabled:opacity-30 ${
                      key === "clear"
                        ? "bg-slate-700 text-slate-300 hover:bg-slate-600"
                        : key === "⌫"
                        ? "bg-slate-700 text-slate-300 hover:bg-slate-600 flex items-center justify-center"
                        : "bg-slate-800 border border-slate-700 text-white hover:bg-slate-700 hover:border-primary/40"
                    }`}
                  >
                    {key === "clear" ? <Delete size={20} className="mx-auto" /> : key}
                  </button>
                ))}
              </div>
            )}

            {phase === "processing" && (
              <div className="flex justify-center py-8">
                <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── RIGHT PANEL: Company Status ───────────────────────────────────── */}
      <div className="hidden md:flex flex-col w-[55%] p-10 overflow-y-auto">
        {/* Company name */}
        <div className="mb-8">
          <p className="text-slate-500 text-xs uppercase tracking-widest font-semibold mb-1">Workplace</p>
          <h1 className="text-4xl font-bold text-white leading-tight">{company.name}</h1>
          <p className="text-slate-400 text-sm mt-1">
            {clock.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>

        {/* Active Now */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <UserCheck size={16} className="text-emerald-400" />
            <p className="text-slate-300 text-sm font-semibold uppercase tracking-wider">Active Now</p>
            <span className="ml-auto bg-emerald-900/50 text-emerald-400 text-xs font-bold px-2 py-0.5 rounded-full">{working.length}</span>
          </div>
          {working.length === 0 ? (
            <p className="text-slate-600 text-sm pl-6">Nobody clocked in yet</p>
          ) : (
            <div className="space-y-2">
              {working.map(e => (
                <div key={e.id} className="flex items-center justify-between bg-slate-800/60 rounded-lg px-4 py-2.5 border border-slate-700/50">
                  <div className="flex items-center gap-2.5">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-slate-200 text-sm font-medium">{e.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-emerald-400 text-sm font-bold">{fmtElapsed(e.workMs)}</span>
                    {e.breakMs > 0 && <p className="text-slate-500 text-[10px]">{Math.round(e.breakMs / 60_000)}m break taken</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* On Break */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Coffee size={16} className="text-amber-400" />
            <p className="text-slate-300 text-sm font-semibold uppercase tracking-wider">On Break</p>
            <span className="ml-auto bg-amber-900/50 text-amber-400 text-xs font-bold px-2 py-0.5 rounded-full">{onBreak.length}</span>
          </div>
          {onBreak.length === 0 ? (
            <p className="text-slate-600 text-sm pl-6">Nobody on break</p>
          ) : (
            <div className="space-y-2">
              {onBreak.map(e => {
                const breakMins = Math.round(e.breakMs / 60_000);
                const overLimit = breakMins > breakAllowance;
                return (
                  <div key={e.id} className={`flex items-center justify-between rounded-lg px-4 py-2.5 border ${
                    overLimit ? "bg-rose-900/20 border-rose-700/50" : "bg-slate-800/60 border-slate-700/50"
                  }`}>
                    <div className="flex items-center gap-2.5">
                      <div className={`w-2 h-2 rounded-full ${overLimit ? "bg-rose-400 animate-pulse" : "bg-amber-400"}`} />
                      <span className="text-slate-200 text-sm font-medium">{e.name}</span>
                      {overLimit && <AlertTriangle size={13} className="text-rose-400" />}
                    </div>
                    <div className="text-right">
                      <span className={`text-sm font-bold ${overLimit ? "text-rose-400" : "text-amber-400"}`}>
                        {breakMins}m
                      </span>
                      <p className={`text-[10px] ${overLimit ? "text-rose-500" : "text-slate-500"}`}>
                        / {breakAllowance}m allowed{overLimit ? " ⚠ Over" : ""}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Break allowance note */}
        <div className="mt-auto pt-8 flex items-center gap-2 text-slate-600 text-xs">
          <Clock size={12} />
          <span>Break allowance: {breakAllowance} mins per shift</span>
        </div>
      </div>
    </div>
  );
}
