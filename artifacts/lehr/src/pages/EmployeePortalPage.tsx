import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabaseClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Clock, LogOut, User } from "lucide-react";

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}
function fmtTime(t: string) {
  return t?.slice(0, 5) ?? "";
}
function fmtDateTime(ts: string) {
  return new Date(ts).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function EmployeePortalPage() {
  const [, setLocation] = useLocation();
  const [employee, setEmployee] = useState<any>(null);
  const [shifts, setShifts] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [leave, setLeave] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = sessionStorage.getItem("employee_session");
    if (!stored) { setLocation("/employee-login"); return; }
    const emp = JSON.parse(stored);
    setEmployee(emp);
    fetchData(emp.id);
  }, []);

  const fetchData = async (empId: string) => {
    setIsLoading(true);
    const today = new Date().toISOString().split("T")[0];
    const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];

    const [shiftRes, logRes, leaveRes] = await Promise.all([
      supabase.from("shifts").select("*").eq("employee_id", empId).gte("date", today).lte("date", nextMonth).order("date"),
      supabase.from("time_logs").select("*").eq("employee_id", empId).order("timestamp", { ascending: false }).limit(10),
      supabase.from("leave_requests").select("*").eq("employee_id", empId).order("created_at", { ascending: false }).limit(5),
    ]);
    if (shiftRes.data) setShifts(shiftRes.data);
    if (logRes.data) setLogs(logRes.data);
    if (leaveRes.data) setLeave(leaveRes.data);
    setIsLoading(false);
  };

  const handleSignOut = () => {
    sessionStorage.removeItem("employee_session");
    setLocation("/employee-login");
  };

  const openKiosk = () => {
    const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    window.open(`${base}/clock`, "_blank", "noopener");
  };

  if (!employee) return null;

  const initials = employee.full_name?.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* Header */}
      <header className="bg-slate-900 text-white px-4 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <img src="/logo.jpeg" alt="LEHR" className="h-8 object-contain rounded" />
          <span className="font-bold text-lg">LEHR</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            <div className="w-8 h-8 rounded-full bg-primary/30 flex items-center justify-center font-bold text-xs">
              {initials}
            </div>
            <span className="hidden sm:block">{employee.full_name}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-slate-300 hover:text-white gap-1">
            <LogOut size={15} /> Sign out
          </Button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Welcome + Clock In */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center justify-between shadow-sm">
          <div>
            <p className="text-sm text-slate-500">Welcome back</p>
            <h2 className="text-xl font-bold text-slate-800">{employee.full_name}</h2>
            <p className="text-xs text-slate-400 mt-0.5 capitalize">{employee.role} · {employee.companies?.name}</p>
          </div>
          <Button onClick={openKiosk} className="gap-2 shrink-0">
            <Clock size={16} />
            Clock In / Out
          </Button>
        </div>

        {/* Upcoming Shifts */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar size={16} className="text-primary" />
              Upcoming Shifts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-slate-400 py-4 text-center">Loading...</p>
            ) : shifts.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">No shifts scheduled in the next 30 days.</p>
            ) : (
              <div className="space-y-2">
                {shifts.map(s => (
                  <div key={s.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-primary/5 border border-primary/10">
                    <span className="text-sm font-medium text-slate-700">{fmtDate(s.date)}</span>
                    <span className="text-sm text-primary font-semibold">{fmtTime(s.start_time)} – {fmtTime(s.end_time)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Clock-ins */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock size={16} className="text-primary" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-slate-400 py-4 text-center">Loading...</p>
            ) : logs.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">No clock-in records yet.</p>
            ) : (
              <div className="space-y-1.5">
                {logs.map(log => (
                  <div key={log.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-50">
                    <Badge variant={log.action === "clock_in" ? "default" : "secondary"} className="text-xs capitalize">
                      {log.action.replace("_", " ")}
                    </Badge>
                    <span className="text-xs text-slate-500">{fmtDateTime(log.timestamp)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Leave Requests */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <User size={16} className="text-primary" />
              Leave Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-slate-400 py-4 text-center">Loading...</p>
            ) : leave.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">No leave requests on record.</p>
            ) : (
              <div className="space-y-2">
                {leave.map(l => (
                  <div key={l.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-slate-50 border border-slate-100">
                    <div>
                      <p className="text-sm font-medium text-slate-700">{fmtDate(l.start_date)} – {fmtDate(l.end_date)}</p>
                      <p className="text-xs text-slate-400 capitalize">{l.leave_type?.replace("_", " ")}</p>
                    </div>
                    <Badge variant={l.status === "approved" ? "default" : l.status === "rejected" ? "destructive" : "secondary"} className="capitalize text-xs">
                      {l.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
