import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { supabase } from "@/lib/supabaseClient";
import { useCompany } from "@/lib/CompanyContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Check, X } from "lucide-react";

type LeaveRequest = {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  type: string;
  status: string;
  notes: string | null;
  employees: { full_name: string } | null;
};

const TYPE_COLORS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  holiday: "default",
  sick: "destructive",
  unpaid: "secondary",
  other: "outline",
};

const STATUS_COLORS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "secondary",
  approved: "default",
  denied: "destructive",
};

function calcDays(start: string, end: string) {
  if (!start || !end) return 0;
  const diff = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(1, Math.round(diff / 86400000) + 1);
}

function fmtDate(d: string) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function LeavePage() {
  const { toast } = useToast();
  const { activeCompany } = useCompany();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    employee_id: "",
    type: "holiday",
    start_date: "",
    end_date: "",
    notes: "",
  });

  const fetchAll = useCallback(async () => {
    if (!activeCompany) return;
    setIsLoading(true);
    const [reqRes, empRes] = await Promise.all([
      supabase
        .from("leave_requests")
        .select("*, employees!inner(full_name, company_id)")
        .eq("company_id", activeCompany.id)
        .order("created_at", { ascending: false }),
      supabase.from("employees").select("id, full_name").eq("status", "active").eq("company_id", activeCompany.id).order("full_name"),
    ]);
    if (reqRes.data) setRequests(reqRes.data as LeaveRequest[]);
    if (empRes.data) setEmployees(empRes.data);
    setIsLoading(false);
  }, [activeCompany]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const pending = requests.filter(r => r.status === "pending");

  const handleStatus = async (id: string, status: "approved" | "denied") => {
    if (!activeCompany) return;
    const { error } = await supabase.from("leave_requests").update({ status }).eq("id", id).eq("company_id", activeCompany.id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: status === "approved" ? "Request approved" : "Request denied" });
    fetchAll();
  };

  const handleCreate = async () => {
    if (!form.employee_id || !form.start_date || !form.end_date || !activeCompany) {
    if (!activeCompany) return;
    if (!form.employee_id || !form.start_date || !form.end_date) {
      toast({ title: "Missing fields", description: "Employee, start and end dates are required.", variant: "destructive" });
      return;
    }
    if (new Date(form.end_date) < new Date(form.start_date)) {
      toast({ title: "Invalid dates", description: "End date must be on or after start date.", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("leave_requests").insert([{
      ...form,
      company_id: activeCompany.id,
      status: "pending"
    }]);
    const { error } = await supabase.from("leave_requests").insert([{ ...form, company_id: activeCompany.id, status: "pending" }]);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Leave request created" });
    setDialogOpen(false);
    setForm({ employee_id: "", type: "holiday", start_date: "", end_date: "", notes: "" });
    fetchAll();
  };

  const RequestTable = ({ data }: { data: LeaveRequest[] }) => (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Employee</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Start</TableHead>
            <TableHead>End</TableHead>
            <TableHead>Days</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Notes</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow><TableCell colSpan={8} className="text-center py-8">Loading...</TableCell></TableRow>
          ) : data.length === 0 ? (
            <TableRow><TableCell colSpan={8} className="text-center py-8 text-slate-500">No requests found.</TableCell></TableRow>
          ) : (
            data.map(req => (
              <TableRow key={req.id} data-testid={`row-leave-${req.id}`}>
                <TableCell className="font-medium">{req.employees?.full_name ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={TYPE_COLORS[req.type] ?? "outline"} className="capitalize">{req.type}</Badge>
                </TableCell>
                <TableCell>{fmtDate(req.start_date)}</TableCell>
                <TableCell>{fmtDate(req.end_date)}</TableCell>
                <TableCell>{calcDays(req.start_date, req.end_date)}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_COLORS[req.status] ?? "outline"} className="capitalize">{req.status}</Badge>
                </TableCell>
                <TableCell className="max-w-[150px] truncate text-slate-500 text-xs">{req.notes || "—"}</TableCell>
                <TableCell className="text-right">
                  {req.status === "pending" && (
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-green-600 hover:text-green-700 hover:bg-green-50 gap-1"
                        onClick={() => handleStatus(req.id, "approved")}
                        data-testid={`button-approve-${req.id}`}
                      >
                        <Check size={14} /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 gap-1"
                        onClick={() => handleStatus(req.id, "denied")}
                        data-testid={`button-deny-${req.id}`}
                      >
                        <X size={14} /> Deny
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <DashboardLayout title="Leave">
      <div className="flex justify-between items-center mb-6">
        <div>
          {pending.length > 0 && (
            <p className="text-sm text-amber-600 font-medium">
              {pending.length} request{pending.length > 1 ? "s" : ""} awaiting approval
            </p>
          )}
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2" data-testid="button-new-leave">
          <Plus size={16} /> New Request
        </Button>
      </div>

      <Tabs defaultValue="pending">
        <TabsList className="mb-4">
          <TabsTrigger value="pending" data-testid="tab-pending">
            Pending {pending.length > 0 && <span className="ml-1.5 bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5 text-xs font-bold">{pending.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="all" data-testid="tab-all">All Requests</TabsTrigger>
        </TabsList>
        <TabsContent value="pending">
          <RequestTable data={pending} />
        </TabsContent>
        <TabsContent value="all">
          <RequestTable data={requests} />
        </TabsContent>
      </Tabs>

      {/* New Leave Request Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Leave Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Employee</Label>
              <Select value={form.employee_id} onValueChange={v => setForm(f => ({ ...f, employee_id: v }))}>
                <SelectTrigger data-testid="select-leave-employee"><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Leave Type</Label>
              <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                <SelectTrigger data-testid="select-leave-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="holiday">Holiday</SelectItem>
                  <SelectItem value="sick">Sick Leave</SelectItem>
                  <SelectItem value="unpaid">Unpaid Leave</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} data-testid="input-leave-start" />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} data-testid="input-leave-end" />
              </div>
            </div>
            {form.start_date && form.end_date && (
              <p className="text-xs text-slate-500">
                Duration: <strong>{calcDays(form.start_date, form.end_date)} day{calcDays(form.start_date, form.end_date) > 1 ? "s" : ""}</strong>
              </p>
            )}
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any additional information..." data-testid="input-leave-notes" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} data-testid="button-save-leave">Submit Request</Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
