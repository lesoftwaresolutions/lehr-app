import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Delete, CheckCircle, XCircle } from "lucide-react";

type LogEntry = {
  id: string;
  action: string;
  timestamp: string;
  employees: { full_name: string } | null;
};

type FeedbackState = {
  name: string;
  action: "clock_in" | "clock_out";
  time: string;
} | null;

function fmtTime(ts: string) {
  return new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function actionLabel(a: string) {
  if (a === "clock_in") return "Clocked In";
  if (a === "clock_out") return "Clocked Out";
  return a;
}

export default function KioskPage() {
  const [pin, setPin] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [recentLogs, setRecentLogs] = useState<LogEntry[]>([]);
  const [clock, setClock] = useState(new Date());

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const fetchLogs = useCallback(async () => {
    const today = new Date().toISOString().split("T")[0];
    const { data } = await supabase
      .from("time_logs")
      .select("id, action, timestamp, employees(full_name)")
      .gte("timestamp", `${today}T00:00:00`)
      .order("timestamp", { ascending: false })
      .limit(8);
    if (data) setRecentLogs(data as unknown as LogEntry[]);
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const handleKey = (key: string) => {
    if (isProcessing || feedback) return;
    if (key === "clear") {
      setPin("");
      setError(null);
      return;
    }
    if (key === "submit") {
      handleSubmit();
      return;
    }
    if (pin.length < 4) {
      const next = pin + key;
      setPin(next);
      setError(null);
      if (next.length === 4) {
        // Auto-submit when 4 digits entered
        setTimeout(() => handleSubmitWithPin(next), 120);
      }
    }
  };

  const handleSubmitWithPin = async (enteredPin: string) => {
    if (isProcessing) return;
    setIsProcessing(true);

    const { data: employees } = await supabase
      .from("employees")
      .select("id, full_name")
      .eq("pin_code", enteredPin)
      .eq("status", "active")
      .limit(1);

    if (!employees || employees.length === 0) {
      setError("PIN not recognised. Please try again.");
      setPin("");
      setIsProcessing(false);
      setTimeout(() => setError(null), 3000);
      return;
    }

    const employee = employees[0];

    const { data: lastLogs } = await supabase
      .from("time_logs")
      .select("action")
      .eq("employee_id", employee.id)
      .order("timestamp", { ascending: false })
      .limit(1);

    const lastAction = lastLogs?.[0]?.action;
    const action: "clock_in" | "clock_out" = lastAction === "clock_in" ? "clock_out" : "clock_in";
    const now = new Date();

    await supabase.from("time_logs").insert([{
      employee_id: employee.id,
      action,
      timestamp: now.toISOString(),
    }]);

    const timeStr = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    setFeedback({ name: employee.full_name, action, time: timeStr });
    setPin("");
    fetchLogs();
    setIsProcessing(false);

    setTimeout(() => setFeedback(null), 4000);
  };

  const handleSubmit = () => {
    if (pin.length === 0) return;
    handleSubmitWithPin(pin);
  };

  const keys = ["1","2","3","4","5","6","7","8","9","clear","0","submit"];

  const isClockIn = feedback?.action === "clock_in";

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 select-none">
      {/* Header — Clock */}
      <div className="text-center mb-8">
        <p className="text-7xl font-bold text-white tabular-nums tracking-tight">
          {clock.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
        </p>
        <p className="text-slate-400 text-lg mt-2">
          {clock.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </p>
        <p className="text-slate-600 text-xs mt-4 uppercase tracking-widest font-semibold">LEHR — Staff Clock In / Out</p>
      </div>

      {/* Feedback overlay */}
      {feedback ? (
        <div className={`flex flex-col items-center gap-4 py-10 px-16 rounded-2xl border-2 ${
          isClockIn
            ? "bg-green-900/40 border-green-500/40 text-green-300"
            : "bg-amber-900/40 border-amber-500/40 text-amber-300"
        }`} data-testid="kiosk-feedback">
          {isClockIn
            ? <CheckCircle size={56} className="text-green-400" />
            : <CheckCircle size={56} className="text-amber-400" />
          }
          <div className="text-center">
            <p className="text-2xl font-bold text-white">{feedback.name}</p>
            <p className="text-lg mt-1">
              {isClockIn ? "Clocked IN" : "Clocked OUT"} at <span className="font-semibold">{feedback.time}</span>
            </p>
          </div>
        </div>
      ) : (
        <div className="w-full max-w-xs">
          {/* PIN dots */}
          <div className="flex gap-4 justify-center mb-6">
            {Array.from({ length: 4 }, (_, i) => (
              <div
                key={i}
                className={`w-14 h-14 rounded-xl border-2 flex items-center justify-center text-3xl font-bold transition-all duration-100 ${
                  i < pin.length
                    ? "border-primary bg-primary/20 text-primary"
                    : "border-slate-700 bg-slate-800 text-transparent"
                }`}
                data-testid={`pin-dot-${i}`}
              >
                {i < pin.length ? "•" : ""}
              </div>
            ))}
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 justify-center mb-4 text-red-400 text-sm font-medium" data-testid="kiosk-error">
              <XCircle size={16} />
              {error}
            </div>
          )}

          {/* Instruction text */}
          {!error && (
            <p className="text-center text-slate-500 text-sm mb-6">
              Enter your 4-digit PIN
            </p>
          )}

          {/* Numpad */}
          <div className="grid grid-cols-3 gap-3">
            {keys.map(key => {
              const isSubmit = key === "submit";
              const isClear = key === "clear";
              return (
                <button
                  key={key}
                  onClick={() => handleKey(key)}
                  data-testid={`kiosk-key-${key}`}
                  disabled={isProcessing}
                  className={`h-16 rounded-xl font-bold text-xl transition-all duration-75 active:scale-95 disabled:opacity-40 ${
                    isSubmit
                      ? "bg-primary text-white hover:bg-primary/90 shadow-lg shadow-primary/20"
                      : isClear
                      ? "bg-slate-700 text-slate-300 hover:bg-slate-600"
                      : "bg-slate-800 border border-slate-700 text-white hover:bg-slate-700 hover:border-primary/40"
                  }`}
                >
                  {isClear ? <Delete size={22} className="mx-auto" /> : isSubmit ? "OK" : key}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      {recentLogs.length > 0 && !feedback && (
        <div className="mt-10 w-full max-w-sm">
          <p className="text-slate-600 text-xs uppercase tracking-widest font-semibold text-center mb-3">Recent Activity</p>
          <div className="space-y-1.5">
            {recentLogs.slice(0, 5).map(log => (
              <div key={log.id} className="flex items-center justify-between bg-slate-800/50 rounded-lg px-4 py-2.5" data-testid={`kiosk-log-${log.id}`}>
                <span className="text-slate-300 text-sm font-medium">{log.employees?.full_name ?? "—"}</span>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    log.action === "clock_in"
                      ? "bg-green-900/60 text-green-400"
                      : "bg-amber-900/60 text-amber-400"
                  }`}>
                    {actionLabel(log.action)}
                  </span>
                  <span className="text-slate-500 text-xs">{fmtTime(log.timestamp)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
