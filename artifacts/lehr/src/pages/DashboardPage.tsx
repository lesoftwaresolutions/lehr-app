import React from "react";
import { supabase } from "@/lib/supabaseClient";
import { useCompany } from "@/lib/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Clock, Users, Building } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";

export default function DashboardPage() {
  const { activeCompany } = useCompany();
  const [stats, setStats] = React.useState({ staff: 0, shifts: 0, clockedIn: 0, leave: 0 });

  React.useEffect(() => {
    if (!activeCompany) return;
    const companyId = activeCompany.id;
    async function fetchStats() {
      const today = new Date().toISOString().split('T')[0];

      const [staffRes, shiftsRes, leaveRes, clockRes] = await Promise.all([
        supabase.from('employees').select('*', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'active'),
        supabase.from('shifts').select('*', { count: 'exact', head: true }).eq('date', today),
        supabase.from('leave_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('time_logs').select('employee_id, action').gte('timestamp', `${today}T00:00:00`).order('timestamp', { ascending: false }),
      ]);

      // Determine who is currently clocked in by finding last action per employee
      const logData = clockRes.data ?? [];
      const lastAction: Record<string, string> = {};
      for (const log of logData) {
        if (!lastAction[log.employee_id]) lastAction[log.employee_id] = log.action;
      }
      const clockedIn = Object.values(lastAction).filter(a => a === 'clock_in').length;

      setStats({
        staff: staffRes.count || 0,
        shifts: shiftsRes.count || 0,
        clockedIn,
        leave: leaveRes.count || 0,
      });
    }
    fetchStats();
  }, [activeCompany]);

  return (
    <DashboardLayout title="Dashboard">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Welcome back</h2>
        <p className="text-slate-600">Here's what's happening in your business today.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
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
    </DashboardLayout>
  );
}
