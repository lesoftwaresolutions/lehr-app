import { useState, useEffect, useCallback, useMemo } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { supabase } from "@/lib/supabaseClient";
import { useCompany } from "@/lib/CompanyContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExternalLink, Filter, BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type LogEntry = {
  id: string;
  employee_id: string;
  action: string;
  timestamp: string;
  employees: { full_name: string; company_id: string } | null;
};

function fmtDateTime(ts: string) {
  return new Date(ts).toLocaleString("en-GB", {
    weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

function actionLabel(a: string) {
  if (a === "login"     || a === "clock_in")  return "Login";
  if (a === "logout"    || a === "clock_out") return "Logout";
  if (a === "break-out" || a === "break_in")  return "Break Out";
  if (a === "break-in"  || a === "break_out") return "Break In";
  return a;
}

const actionColor = (a: string): "default" | "secondary" | "outline" | "destructive" => {
  if (a === "login"  || a === "clock_in")  return "default";
  if (a === "logout" || a === "clock_out") return "secondary";
  return "outline";
};

// UK Financial Year Helper (April 6th to April 5th)
function getFinancialYearRange(year: number) {
  return {
    start: new Date(year, 3, 6), // April 6
    end: new Date(year + 1, 3, 5, 23, 59, 59) // April 5 next year
  };
}

export default function TimePage() {
  const { activeCompany } = useCompany();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [allLogsForStats, setAllLogsForStats] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<string>(new Date().toISOString().split("T")[0]);

  const companyId = activeCompany?.id;

  const fetchLogs = useCallback(async () => {
    if (!companyId) return;
    setIsLoading(true);

    // Fetch logs for the filtered date
    const { data } = await supabase
      .from("time_logs")
      .select("id, employee_id, action, timestamp, employees!inner(full_name, company_id)")
      .eq("company_id", companyId)
      .gte("timestamp", `${dateFilter}T00:00:00`)
      .lte("timestamp", `${dateFilter}T23:59:59`)
      .order("timestamp", { ascending: false });

    setLogs(data as unknown as LogEntry[]);
    setIsLoading(false);

    // Fetch more logs for summary stats
    const { data: statsData } = await supabase
      .from("time_logs")
      .select("id, employee_id, action, timestamp, employees!inner(full_name, company_id)")
      .eq("company_id", companyId)
      .order("timestamp", { ascending: true });

    setAllLogsForStats(statsData as unknown as LogEntry[]);
  }, [dateFilter, companyId]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // Aggregate stats
  const stats = useMemo(() => {
    const report: Record<string, { name: string; day: number; week: number; month: number; fy: number }> = {};
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0,0,0,0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const currentFY = now.getMonth() < 3 || (now.getMonth() === 3 && now.getDate() < 6)
      ? now.getFullYear() - 1
      : now.getFullYear();
    const fyRange = getFinancialYearRange(currentFY);

    const isLoginAct  = (a: string) => a === "login"     || a === "clock_in";
    const isLogoutAct = (a: string) => a === "logout"    || a === "clock_out";
    const isBreakStart = (a: string) => a === "break-out" || a === "break_in";
    const isBreakEnd  = (a: string) => a === "break-in"  || a === "break_out";

    const byEmp: Record<string, { name: string; events: { action: string; ts: number }[] }> = {};
    allLogsForStats.forEach(l => {
      if (!byEmp[l.employee_id]) byEmp[l.employee_id] = { name: l.employees?.full_name ?? "Unknown", events: [] };
      byEmp[l.employee_id].events.push({ action: l.action, ts: new Date(l.timestamp).getTime() });
    });

    Object.entries(byEmp).forEach(([id, data]) => {
      let lastIn: number | null = null;
      report[id] = { name: data.name, day: 0, week: 0, month: 0, fy: 0 };

      data.events.forEach(e => {
        if (isLoginAct(e.action) || isBreakEnd(e.action)) {
          lastIn = e.ts;
        } else if ((isLogoutAct(e.action) || isBreakStart(e.action)) && lastIn) {
          const duration = e.ts - lastIn;
          const edate = new Date(e.ts);
          const edateStr = edate.toISOString().split('T')[0];

          if (edateStr === todayStr) report[id].day += duration;
          if (edate >= startOfWeek) report[id].week += duration;
          if (edate >= startOfMonth) report[id].month += duration;
          if (edate >= fyRange.start && edate <= fyRange.end) report[id].fy += duration;

          lastIn = null;
        }
      });
    });

    return Object.values(report);
  }, [allLogsForStats]);

  const openKiosk = () => {
    if (!activeCompany) return;
    const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    window.open(`${base}/clock/${activeCompany.id}`, "_blank", "noopener");
  };

  const msToHrs = (ms: number) => (ms / 3600000).toFixed(1);

  return (
    <DashboardLayout title="Time Logs & Reports">
      <div className="grid grid-cols-1 gap-8">

        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg font-semibold">Staff Hours Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead className="text-right">Today</TableHead>
                  <TableHead className="text-right">This Week</TableHead>
                  <TableHead className="text-right">This Month</TableHead>
                  <TableHead className="text-right font-bold text-primary">Financial Year (UK)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-4 text-slate-400">No data available for reports.</TableCell></TableRow>
                ) : stats.map(s => (
                  <TableRow key={s.name}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-right">{msToHrs(s.day)}h</TableCell>
                    <TableCell className="text-right">{msToHrs(s.week)}h</TableCell>
                    <TableCell className="text-right">{msToHrs(s.month)}h</TableCell>
                    <TableCell className="text-right font-bold text-primary">{msToHrs(s.fy)}h</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div>
          <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center mb-4">
            <div className="flex items-center gap-3">
              <Filter size={16} className="text-slate-400" />
              <Input
                type="date"
                value={dateFilter}
                onChange={e => setDateFilter(e.target.value)}
                className="w-44"
              />
              <span className="text-sm text-slate-500">{logs.length} record{logs.length !== 1 ? "s" : ""}</span>
            </div>

            <Button
              variant="outline"
              className="gap-2 border-primary/30 text-primary hover:bg-primary/5"
              onClick={openKiosk}
            >
              <ExternalLink size={15} />
              Open Kiosk View
            </Button>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Date &amp; Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={3} className="text-center py-10">Loading...</TableCell></TableRow>
                ) : logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-10 text-slate-400">
                      No activity recorded for this date.
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map(log => (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium">{log.employees?.full_name ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={actionColor(log.action)}>{actionLabel(log.action)}</Badge>
                      </TableCell>
                      <TableCell className="text-slate-600">{fmtDateTime(log.timestamp)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
