import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { supabase } from "@/lib/supabaseClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExternalLink, Filter } from "lucide-react";
import { useLocation } from "wouter";

type LogEntry = {
  id: string;
  action: string;
  timestamp: string;
  employees: { full_name: string } | null;
};

function fmtDateTime(ts: string) {
  return new Date(ts).toLocaleString("en-GB", {
    weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit",
  });
}

function actionLabel(a: string) {
  if (a === "clock_in") return "Clock In";
  if (a === "clock_out") return "Clock Out";
  if (a === "break_in") return "Break Start";
  if (a === "break_out") return "Break End";
  return a;
}

const actionColor = (a: string): "default" | "secondary" | "outline" | "destructive" =>
  a === "clock_in" ? "default" : a === "clock_out" ? "secondary" : "outline";

export default function TimePage() {
  const [, setLocation] = useLocation();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<string>(new Date().toISOString().split("T")[0]);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from("time_logs")
      .select("id, action, timestamp, employees(full_name)")
      .gte("timestamp", `${dateFilter}T00:00:00`)
      .lte("timestamp", `${dateFilter}T23:59:59`)
      .order("timestamp", { ascending: false });
    if (data) setLogs(data as unknown as LogEntry[]);
    setIsLoading(false);
  }, [dateFilter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const openKiosk = () => {
    const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    window.open(`${base}/clock`, "_blank", "noopener");
  };

  return (
    <DashboardLayout title="Time Logs">
      {/* Header row */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center mb-6">
        <div className="flex items-center gap-3">
          <Filter size={16} className="text-slate-400" />
          <Input
            type="date"
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
            className="w-44"
            data-testid="input-date-filter"
          />
          <span className="text-sm text-slate-500">{logs.length} record{logs.length !== 1 ? "s" : ""}</span>
        </div>

        <Button
          variant="outline"
          className="gap-2 border-primary/30 text-primary hover:bg-primary/5"
          onClick={openKiosk}
          data-testid="button-open-kiosk"
        >
          <ExternalLink size={15} />
          Open Kiosk View
        </Button>
      </div>

      {/* Info banner */}
      <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 mb-6 flex items-start gap-3">
        <div className="mt-0.5 text-blue-500">
          <ExternalLink size={15} />
        </div>
        <div>
          <p className="text-sm font-medium text-blue-800">Store Kiosk</p>
          <p className="text-xs text-blue-600 mt-0.5">
            The clock in/out kiosk is a separate full-screen page designed to stay open on a device in your store.
            Staff enter their 4-digit PIN to clock in or out — no manager login needed.
          </p>
        </div>
      </div>

      {/* Log table */}
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
                <TableRow key={log.id} data-testid={`row-log-${log.id}`}>
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
    </DashboardLayout>
  );
}
