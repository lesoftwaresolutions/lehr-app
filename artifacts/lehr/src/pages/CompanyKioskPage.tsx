import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Delete, AlertTriangle, Coffee, UserCheck, Clock, CheckCircle, XCircle } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────
// Standardized actions: clock_in, clock_out, break_start, break_end
type KioskAction = "clock_in" | "clock_out" | "break_start" | "break_end";
type Phase = "idle" | "lookup" | "action" | "processing" | "success" | "fail";

interface Company { id: string; name: string; break_allowance_minutes: number | null; }
interface FoundEmployee { id: string; full_name: string; }
interface StaffEntry { id: string; name: string; workMs: number; breakMs: number; }

// ── 24-hour time helper ───────────────────────────────────────────────────────
function fmt24(date: Date): string {
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function fmtElapsed(ms: number) {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m`;
  const s = Math.floor((ms % 60_000) / 1_000);
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

// ── Action status helpers ───────────────────────────────────────────────────
function isLoginAction(a: string)     { return a === "clock_in"; }
function isLogoutAction(a: string)    { return a === "clock_out"; }
function isBreakStartAction(a: string){ return a === "break_start"; }
function isBreakEndAction(a: string)  { return a === "break_end"; }

// ── Status computation ────────────────────────────────────────────────────────
type RawLog = {
  employee_id: string;
  action: string;
  timestamp: string;
  employees: { full_name: string; company_id: string } | null;
};

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
      // Legacy support: handle old action names if they exist in DB
      const standardAction = (action === 'login') ? 'clock_in' :
                             (action === 'logout') ? 'clock_out' :
                             (action === 'break-out' || action === 'break_in' && !isBreakEndAction(action)) ? 'break_start' :
                             (action === 'break-in' || action === 'break_out' && !isBreakStartAction(action)) ? 'break_end' : action;

      if (isLoginAction(standardAction) || isBreakEndAction(standardAction)) {
        if (lastBreak !== null) { breakMs += ts - lastBreak; lastBreak = null; }
        lastWork = ts;
      }
      if (isBreakStartAction(standardAction)) {
        if (lastWork !== null) { workMs += ts - lastWork; lastWork = null; }
        lastBreak = ts;
      }
      if (isLogoutAction(standardAction)) {
        if (lastWork !== null) { workMs += ts - lastWork; lastWork = null; }
        if (lastBreak !== null) { breakMs += ts - lastBreak; lastBreak = null; }
      }
    });

    if (lastWork !== null)  workMs  += now - lastWork;
    if (lastBreak !== null) breakMs += now - lastBreak;

    const last = events[events.length - 1]?.action ?? "";
    const lastStandard = (last === 'login') ? 'clock_in' :
                         (last === 'logout') ? 'clock_out' :
                         (last === 'break-out' || last === 'break_in' && !isBreakEndAction(last)) ? 'break_start' :
                         (last === 'break-in' || last === 'break_out' && !isBreakStartAction(last)) ? 'break_end' : last;

    if (isLoginAction(lastStandard) || isBreakEndAction(lastStandard)) working.push({ id, name, workMs, breakMs });
    else if (isBreakStartAction(lastStandard))                         onBreak.push({ id, name, workMs, breakMs });
  });

  return { working, onBreak };
}

function computeTotalWork(logs: { action: string; ts: number }[]) {
  let workMs = 0, lastWork: number | null = null;
  logs.forEach(({ action, ts }) => {
    const standardAction = (action === 'login') ? 'clock_in' :
                           (action === 'logout') ? 'clock_out' :
                           (action === 'break-out') ? 'break_start' :
                           (action === 'break-in') ? 'break_end' : action;

    if (isLoginAction(standardAction) || isBreakEndAction(standardAction)) lastWork = ts;
    if ((isBreakStartAction(standardAction) || isLogoutAction(standardAction)) && lastWork !== null) {
      workMs += ts - lastWork; lastWork = null;
    }
  });
  return workMs / 3_600_000;
}

// ── Button config ─────────────────────────────────────────────────────────────
const BUTTONS: { action: KioskAction; label: string; bg: string; text: string; ring: string }[] = [
  { action: "clock_in",    label: "Clock In",    bg: "bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600", text: "text-white", ring: "ring-emerald-300" },
  { action: "clock_out",   label: "Clock Out",   bg: "bg-rose-600    hover:bg-rose-500    active:bg-rose-700",    text: "text-white", ring: "ring-rose-300" },
  { action: "break_start", label: "Break Out",   bg: "bg-amber-400   hover:bg-amber-300   active:bg-amber-500",   text: "text-slate-900", ring: "ring-amber-200" },
  { action: "break_end",   label: "Break In",    bg: "bg-blue-500    hover:bg-blue-400    active:bg-blue-600",    text: "text-white", ring: "ring-blue-300" },
];

const ACTION_LABELS: Record<KioskAction, string> = {
  "clock_in":    "Clocked in",
  "clock_out":   "Clocked out",
  "break_start": "Break started",
  "break_end":   "Break ended",
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function CompanyKioskPage({ companyId = "" }: { companyId?: string }) {
  const [company, setCompany]           = useState<Company | null>(null);
  const [companyError, setCompanyError] = useState(false);
  const [companyLoading, setCompanyLoading] = useState(true);
  const [pin, setPin]                   = useState("");
  const [phase, setPhase]               = useState<Phase>("idle");
  const [foundEmp, setFoundEmp]         = useState<FoundEmployee | null>(null);
  const [error, setError]               = useState<string | null>(null);
  const [successMsg, setSuccessMsg]     = useState("");
  const [successSub, setSuccessSub]     = useState("");
  const [rawLogs, setRawLogs]           = useState<RawLog[]>([]);
  const [tick, setTick]                 = useState(Date.now());
  const [clock, setClock]               = useState(new Date());
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const breakAllowance = company?.break_allowance_minutes ?? 30;

  // Live clock + tick every second
  useEffect(() => {
    const t = setInterval(() => { setClock(new Date()); setTick(Date.now()); }, 1000);
    return () => clearInterval(t);
  }, []);

  // Fetch kiosk data via secure RPC
  const fetchKioskData = useCallback(async () => {
    if (!companyId) {
      setCompanyLoading(false);
      setCompanyError(true);
      return;
    }

    try {
      const { data, error } = await supabase.rpc('get_kiosk_data', {
        p_company_id: companyId
      });

      if (error || !data) {
        console.error("Kiosk: Error fetching data:", error);
        setCompanyError(true);
        return;
      }

      setCompany(data.company);
      setRawLogs(data.logs || []);
    } catch (err) {
      console.error("Kiosk: Unexpected error:", err);
      setCompanyError(true);
    } finally {
      setCompanyLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    setCompanyLoading(true);
    fetchKioskData();
  }, [fetchKioskData]);

  // Real-time subscription
  useEffect(() => {
    if (!companyId) return;
    // Use a per-company channel name so multiple kiosks (different companies)
    // don't share a channel and interfere with each other.
    const channel = supabase.channel(`kiosk-realtime-${companyId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'time_logs',
        filter: `company_id=eq.${companyId}`
      }, () => {
        fetchKioskData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [companyId, fetchKioskData]);

  // ── PIN handlers ─────────────────────────────────────────────────────────
  const resetToIdle = () => {
    setPin(""); setPhase("idle"); setFoundEmp(null); setError(null);
    setSuccessMsg(""); setSuccessSub("");
  };

  const scheduleReset = (delayMs: number) => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(resetToIdle, delayMs);
  };

  const handleKey = (key: string) => {
    if (phase === "lookup" || phase === "processing" || phase === "success") return;
    if (phase === "action" || phase === "fail") {
      if (key === "clear" || key === "⌫") resetToIdle();
      return;
    }
    if (key === "clear") { setPin(""); setError(null); return; }
    if (key === "⌫")    { setPin(p => p.slice(0, -1)); setError(null); return; }
    if (pin.length < 4) {
      const next = pin + key;
      setPin(next);
      setError(null);
      if (next.length === 4) setTimeout(() => lookupPin(next), 150);
    }
  };

  const lookupPin = async (enteredPin: string) => {
    setPhase("lookup");
    // 🚀 SECURE PIN VERIFICATION VIA RPC
    const { data, error: rpcError } = await supabase.rpc('verify_employee_pin', {
      p_company_id: companyId,
      p_pin_code: enteredPin
    });

    if (rpcError || !data || data.length === 0) {
      console.error("Kiosk: PIN verification error:", rpcError);
      setError(rpcError?.message || "PIN not recognised. Please try again.");
      setPin(""); setPhase("idle");
      setTimeout(() => setError(null), 3000);
      return;
    }
    setFoundEmp({ id: data[0].id, full_name: data[0].full_name });
    setPhase("action");
  };

  const handleAction = async (action: KioskAction) => {
    if (!foundEmp || !companyId) return;
    setPhase("processing");
    const now = new Date();

    const { error: insertError } = await supabase
      .from("time_logs")
      .insert([{
        employee_id: foundEmp.id,
        company_id: companyId,
        action,
        timestamp: now.toISOString()
      }]);

    if (insertError) {
      console.error("Kiosk: Error inserting time log:", insertError);
      setPhase("fail");
      return;
    }

    // Compute total hours for logout message
    let totalHoursStr = "";
    if (action === "clock_out") {
      const today = now.toISOString().split("T")[0];
      const { data: todayLogs } = await supabase
        .from("time_logs")
        .select("action, timestamp")
        .eq("employee_id", foundEmp.id)
        .gte("timestamp", `${today}T00:00:00`)
        .order("timestamp", { ascending: true });
      const events = (todayLogs ?? []).map(l => ({ action: l.action, ts: new Date(l.timestamp).getTime() }));
      const hrs = computeTotalWork(events);
      totalHoursStr = ` · ${hrs.toFixed(2)} hrs worked`;
    }

    const timeStr = fmt24(now);
    setSuccessMsg(`${ACTION_LABELS[action]} at ${timeStr}`);
    setSuccessSub(
      action === "break_start" ? `${breakAllowance} min break allowance` :
      action === "clock_out"    ? totalHoursStr.replace(" · ", "") :
      ""
    );
    setPhase("success");
    scheduleReset(3000); // 3-second auto-reset
  };

  // ── Derived state ─────────────────────────────────────────────────────────
  const { working, onBreak } = computeStatus(rawLogs, tick);

  const empLive = foundEmp ? [...working, ...onBreak].find(e => e.id === foundEmp.id) : null;
  const empOnBreak = foundEmp ? onBreak.some(e => e.id === foundEmp.id) : false;

  if (companyLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (companyError || !company) {
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

  return (
    <div className="min-h-screen bg-slate-900 flex select-none overflow-hidden">
      <div className="flex flex-col items-center justify-center w-full md:w-[45%] p-6 md:p-10 border-r border-slate-800">
        <div className="text-center mb-8 w-full">
          <div className="flex items-center justify-center gap-3 mb-5">
            <img src="/logo.jpeg" alt="LEHR" className="h-8 object-contain rounded" />
            <span className="font-bold text-white text-lg tracking-tight">LEHR</span>
          </div>
          <p className="text-6xl font-bold text-white tabular-nums tracking-tight">
            {fmt24(clock)}
          </p>
          <p className="text-slate-400 mt-2 text-sm">
            {clock.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>

        {phase === "success" && (
          <div className="w-full max-w-sm text-center bg-slate-800 rounded-2xl border border-slate-700 p-8">
            <CheckCircle size={52} className="text-emerald-400 mx-auto mb-4" />
            <p className="text-white font-bold text-xl mb-1">{foundEmp?.full_name}</p>
            <p className="text-emerald-300 text-lg font-semibold">{successMsg}</p>
            {successSub && <p className="text-slate-400 text-sm mt-1">{successSub}</p>}
            <p className="text-slate-600 text-xs mt-5">Resetting in a moment…</p>
          </div>
        )}

        {phase === "fail" && (
          <div className="w-full max-w-sm text-center bg-rose-900/30 rounded-2xl border border-rose-700/50 p-8">
            <XCircle size={52} className="text-rose-400 mx-auto mb-4" />
            <p className="text-rose-300 text-lg font-semibold">Error recording time.</p>
            <p className="text-rose-400/70 text-sm mt-1">Please try again.</p>
            <button
              onClick={resetToIdle}
              className="mt-5 px-6 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-semibold text-sm transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {phase !== "success" && phase !== "fail" && (
          <div className="w-full max-w-sm">
            {(phase === "action" || phase === "processing") && foundEmp && (
              <div className="mb-6 bg-slate-800 rounded-xl p-4 text-center border border-slate-700">
                <p className="text-white font-bold text-xl">{foundEmp.full_name}</p>
                {empLive ? (
                  <p className="text-slate-400 text-sm mt-1">
                    {empOnBreak
                      ? `On break · ${fmtElapsed(empLive.breakMs)}`
                      : `Working · ${fmtElapsed(empLive.workMs)}`}
                  </p>
                ) : (
                  <p className="text-slate-500 text-sm mt-1">Ready to record</p>
                )}
              </div>
            )}

            {(phase === "idle" || phase === "lookup") && (
              <>
                <div className="flex gap-3 justify-center mb-5">
                  {Array.from({ length: 4 }, (_, i) => (
                    <div key={i} className={`w-14 h-14 rounded-xl border-2 flex items-center justify-center text-3xl font-bold transition-all ${
                      i < pin.length
                        ? "border-primary bg-primary/20 text-primary"
                        : "border-slate-700 bg-slate-800 text-transparent"
                    }`}>
                      {i < pin.length ? "•" : ""}
                    </div>
                  ))}
                </div>

                {error
                  ? <p className="text-center text-red-400 text-sm mb-4 font-medium">{error}</p>
                  : phase === "lookup"
                    ? <p className="text-center text-slate-400 text-sm mb-4 animate-pulse">Looking up…</p>
                    : <p className="text-center text-slate-500 text-sm mb-5">Enter your 4-digit PIN</p>
                }
              </>
            )}

            {phase === "action" && (
              <>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {BUTTONS.map(({ action, label, bg, text, ring }) => (
                    <button
                      key={action}
                      onClick={() => handleAction(action)}
                      className={`${bg} ${text} rounded-xl font-bold text-xl py-7 shadow-lg ring-0 hover:ring-4 ${ring} transition-all active:scale-95`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={resetToIdle}
                  className="w-full text-slate-500 text-xs py-2 hover:text-slate-400 transition-colors"
                >
                  Not you? Cancel
                </button>
              </>
            )}

            {phase === "processing" && (
              <div className="flex justify-center py-8">
                <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {(phase === "idle" || phase === "lookup") && (
              <div className="grid grid-cols-3 gap-3">
                {["1","2","3","4","5","6","7","8","9","clear","0","⌫"].map(key => (
                  <button
                    key={key}
                    onClick={() => handleKey(key)}
                    disabled={phase === "lookup"}
                    className={`h-16 rounded-xl font-bold text-xl transition-all active:scale-95 disabled:opacity-30 ${
                      key === "clear" || key === "⌫"
                        ? "bg-slate-700 text-slate-300 hover:bg-slate-600"
                        : "bg-slate-800 border border-slate-700 text-white hover:bg-slate-700 hover:border-primary/40"
                    }`}
                  >
                    {key === "clear" ? <Delete size={20} className="mx-auto" /> : key}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="hidden md:flex flex-col w-[55%] p-10 overflow-y-auto">
        <div className="mb-8">
          <p className="text-slate-500 text-xs uppercase tracking-widest font-semibold mb-1">Workplace</p>
          <h1 className="text-4xl font-bold text-white leading-tight">{company.name}</h1>
          <p className="text-slate-400 text-sm mt-1">
            {clock.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>

        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <UserCheck size={16} className="text-emerald-400" />
            <p className="text-slate-300 text-sm font-semibold uppercase tracking-wider">Active Now</p>
            <span className="ml-auto bg-emerald-900/50 text-emerald-400 text-xs font-bold px-2 py-0.5 rounded-full">
              {working.length}
            </span>
          </div>
          {working.length === 0
            ? <p className="text-slate-600 text-sm pl-6">Nobody clocked in yet</p>
            : (
              <div className="space-y-2">
                {working.map(e => (
                  <div key={e.id} className="flex items-center justify-between bg-slate-800/60 rounded-lg px-4 py-2.5 border border-slate-700/50">
                    <div className="flex items-center gap-2.5">
                      <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-slate-200 text-sm font-medium">{e.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-emerald-400 text-sm font-bold">{fmtElapsed(e.workMs)}</span>
                      {e.breakMs > 0 && <p className="text-slate-500 text-[10px]">{Math.round(e.breakMs / 60_000)}m break</p>}
                    </div>
                  </div>
                ))}
              </div>
            )
          }
        </div>

        <div>
          <div className="flex items-center gap-2 mb-3">
            <Coffee size={16} className="text-amber-400" />
            <p className="text-slate-300 text-sm font-semibold uppercase tracking-wider">On Break</p>
            <span className="ml-auto bg-amber-900/50 text-amber-400 text-xs font-bold px-2 py-0.5 rounded-full">
              {onBreak.length}
            </span>
          </div>
          {onBreak.length === 0
            ? <p className="text-slate-600 text-sm pl-6">Nobody on break</p>
            : (
              <div className="space-y-2">
                {onBreak.map(e => {
                  const breakMins = Math.round(e.breakMs / 60_000);
                  const over = breakMins > breakAllowance;
                  return (
                    <div key={e.id} className={`flex items-center justify-between rounded-lg px-4 py-2.5 border ${
                      over ? "bg-rose-900/20 border-rose-700/50" : "bg-slate-800/60 border-slate-700/50"
                    }`}>
                      <div className="flex items-center gap-2.5">
                        <div className={`w-2 h-2 rounded-full ${over ? "bg-rose-400 animate-pulse" : "bg-amber-400"}`} />
                        <span className="text-slate-200 text-sm font-medium">{e.name}</span>
                        {over && <AlertTriangle size={13} className="text-rose-400" />}
                      </div>
                      <div className="text-right">
                        <span className={`text-sm font-bold ${over ? "text-rose-400" : "text-amber-400"}`}>{breakMins}m</span>
                        <p className={`text-[10px] ${over ? "text-rose-500" : "text-slate-500"}`}>
                          / {breakAllowance}m{over ? " ⚠ Over" : ""}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          }
        </div>

        <div className="mt-auto pt-8 flex items-center gap-2 text-slate-600 text-xs">
          <Clock size={12} />
          <span>Break allowance: {breakAllowance} mins per shift</span>
        </div>
      </div>
    </div>
  );
}
