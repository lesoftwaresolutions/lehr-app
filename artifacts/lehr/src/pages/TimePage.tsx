import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { supabase } from "@/lib/supabaseClient";
import { Badge } from "@/components/ui/badge";
import { Delete } from "lucide-react";

type LogEntry = {
  id: string;
  action: string;
  timestamp: string;
  employees: { full_name: string } | null;
};

export default function TimePage() {
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [todayLogs, setTodayLogs] = useState<LogEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const fetchTodayLogs = async () => {
    const today = new Date().toISOString().split("T")[0];
    const { data } = await supabase
      .from("time_logs")
      .select("id, action, timestamp, employees(full_name)")
      .gte("timestamp", `${today}T00:00:00`)
      .lte("timestamp", `${today}T23:59:59`)
      .order("timestamp", { ascending: false });
    if (data) setTodayLogs(data as unknown as LogEntry[]);
  };

  useEffect(() => { fetchTodayLogs(); }, []);

  const handleKey = (key: string) => {
    if (isProcessing) return;
    if (key === "clear") { setPin(""); return; }
    if (key === "submit") { handleSubmit(); return; }
    if (pin.length < 4) setPin(p => p + key);
  };

  const handleSubmit = async () => {
    if (pin.length === 0) return;
    setIsProcessing(true);

    const { data: employees, error } = await supabase
      .from("employees")
      .select("id, full_name")
      .eq("pin_code", pin)
      .eq("status", "active")
      .limit(1);

    if (error || !employees || employees.length === 0) {
      setMessage({ text: "PIN not recognised. Please try again.", type: "error" });
      setPin("");
      setIsProcessing(false);
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    const employee = employees[0];

    // Check last log to determine action
    const { data: lastLogs } = await supabase
      .from("time_logs")
      .select("action")
      .eq("employee_id", employee.id)
      .order("timestamp", { ascending: false })
      .limit(1);

    const lastAction = lastLogs?.[0]?.action;
    const action = lastAction === "clock_in" ? "clock_out" : "clock_in";

    await supabase.from("time_logs").insert([{
      employee_id: employee.id,
      action,
      timestamp: new Date().toISOString(),
    }]);

    const timeStr = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    const actionLabel = action === "clock_in" ? "Clocked IN" : "Clocked OUT";
    const greeting = action === "clock_in" ? `Good to see you, ${employee.full_name}!` : `See you later, ${employee.full_name}!`;

    setMessage({ text: `${greeting} ${actionLabel} at ${timeStr}`, type: "success" });
    setPin("");
    fetchTodayLogs();
    setIsProcessing(false);
    setTimeout(() => setMessage(null), 4000);
  };

  const keys = ["1","2","3","4","5","6","7","8","9","clear","0","submit"];

  const fmtTime = (ts: string) =>
    new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  const actionLabel = (a: string) => {
    if (a === "clock_in") return "Clock In";
    if (a === "clock_out") return "Clock Out";
    if (a === "break_in") return "Break Start";
    if (a === "break_out") return "Break End";
    return a;
  };

  const actionColor = (a: string) =>
    a === "clock_in" ? "default" : a === "clock_out" ? "secondary" : "outline";

  return (
    <DashboardLayout title="Clock In / Out">
      <div className="grid lg:grid-cols-2 gap-8 items-start">
        {/* PIN Terminal */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col items-center">
          <p className="text-sm font-medium text-slate-500 mb-4">Enter your PIN to clock in or out</p>

          {/* PIN display */}
          <div className="flex gap-3 mb-6">
            {Array.from({ length: 4 }, (_, i) => (
              <div
                key={i}
                className={`w-12 h-12 rounded-lg border-2 flex items-center justify-center text-2xl font-bold transition-all ${
                  i < pin.length ? "border-primary bg-primary/10 text-primary" : "border-slate-200 bg-slate-50 text-transparent"
                }`}
                data-testid={`pin-dot-${i}`}
              >
                {i < pin.length ? "•" : ""}
              </div>
            ))}
          </div>

          {/* Message banner */}
          {message && (
            <div className={`w-full rounded-lg p-3 mb-4 text-sm text-center font-medium ${
              message.type === "success" ? "bg-green-50 border border-green-200 text-green-800" : "bg-red-50 border border-red-200 text-red-800"
            }`} data-testid="pin-message">
              {message.text}
            </div>
          )}

          {/* Numpad */}
          <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
            {keys.map(key => {
              const isSubmit = key === "submit";
              const isClear = key === "clear";
              return (
                <button
                  key={key}
                  onClick={() => handleKey(key)}
                  data-testid={`pin-key-${key}`}
                  disabled={isProcessing}
                  className={`h-14 rounded-xl font-semibold text-lg transition-all active:scale-95 disabled:opacity-50 ${
                    isSubmit
                      ? "bg-primary text-white hover:bg-primary/90 shadow-sm"
                      : isClear
                      ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      : "bg-slate-50 border border-slate-200 text-slate-800 hover:bg-slate-100 hover:border-primary/30"
                  }`}
                >
                  {isClear ? <Delete size={20} className="mx-auto" /> : isSubmit ? "OK" : key}
                </button>
              );
            })}
          </div>
        </div>

        {/* Today's Log */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-800">Today's Activity</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
            </p>
          </div>
          <div className="divide-y divide-slate-50 max-h-[480px] overflow-y-auto">
            {todayLogs.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">No activity recorded today yet.</div>
            ) : (
              todayLogs.map(log => (
                <div key={log.id} className="flex items-center justify-between px-5 py-3" data-testid={`log-entry-${log.id}`}>
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      {log.employees?.full_name ?? "Unknown"}
                    </p>
                    <p className="text-xs text-slate-400">{fmtTime(log.timestamp)}</p>
                  </div>
                  <Badge variant={actionColor(log.action)} className="text-xs">
                    {actionLabel(log.action)}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
