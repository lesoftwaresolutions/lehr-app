import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { supabase } from "@/lib/supabaseClient";
import { useCompany } from "@/lib/CompanyContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, ChevronRight, Share2, Plus, Trash2 } from "lucide-react";

function getWeekDates(offset: number) {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7) + offset * 7);
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function fmtDate(d: Date) {
  return d.toISOString().split("T")[0];
}

function fmtDay(d: Date) {
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function fmtTime(t: string) {
  return t?.slice(0, 5) ?? "";
}

export default function RotaPage() {
  const { toast } = useToast();
  const { activeCompany } = useCompany();
  const [weekOffset, setWeekOffset] = useState(0);
  const [employees, setEmployees] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<any>(null);
  const [form, setForm] = useState({ employee_id: "", date: "", start_time: "09:00", end_time: "17:00" });

  const weekDates = getWeekDates(weekOffset);
  const weekStart = weekDates[0];
  const weekEnd = weekDates[6];

  const weekLabel = `${weekStart.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${weekEnd.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;

  const fetchData = useCallback(async () => {
    if (!activeCompany) return;
    setIsLoading(true);
    const [empRes, shiftRes] = await Promise.all([
      supabase.from("employees").select("*").eq("status", "active").eq("company_id", activeCompany.id).order("full_name"),
      supabase.from("shifts").select("*, employees(full_name)").gte("date", fmtDate(weekStart)).lte("date", fmtDate(weekEnd)),
    ]);
    if (empRes.data) setEmployees(empRes.data);
    if (shiftRes.data) setShifts(shiftRes.data);
    setIsLoading(false);
  }, [weekOffset, activeCompany]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getShift = (employeeId: string, date: Date) =>
    shifts.find(s => s.employee_id === employeeId && s.date === fmtDate(date));

  const openAdd = (employeeId: string, date: Date) => {
    setEditingShift(null);
    setForm({ employee_id: employeeId, date: fmtDate(date), start_time: "09:00", end_time: "17:00" });
    setDialogOpen(true);
  };

  const openEdit = (shift: any) => {
    setEditingShift(shift);
    setForm({ employee_id: shift.employee_id, date: shift.date, start_time: shift.start_time.slice(0,5), end_time: shift.end_time.slice(0,5) });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.employee_id || !form.date || !form.start_time || !form.end_time) {
      toast({ title: "Missing fields", description: "Please fill all fields.", variant: "destructive" });
      return;
    }
    const payload = { employee_id: form.employee_id, date: form.date, start_time: form.start_time, end_time: form.end_time, status: "scheduled" };
    const { error } = editingShift
      ? await supabase.from("shifts").update(payload).eq("id", editingShift.id)
      : await supabase.from("shifts").insert([payload]);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Shift saved" });
    setDialogOpen(false);
    fetchData();
  };

  const handleDelete = async () => {
    if (!editingShift) return;
    const { error } = await supabase.from("shifts").delete().eq("id", editingShift.id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Shift deleted" });
    setDialogOpen(false);
    fetchData();
  };

  const handleWhatsApp = () => {
    let text = `LEHR Rota: ${weekLabel}\n\n`;
    employees.forEach(emp => {
      const empShifts = weekDates.map(d => ({ day: d, shift: getShift(emp.id, d) })).filter(x => x.shift);
      if (empShifts.length === 0) return;
      text += `${emp.full_name}\n`;
      empShifts.forEach(({ day, shift }) => {
        text += `${day.toLocaleDateString("en-GB", { weekday: "short" })}: ${fmtTime(shift.start_time)} - ${fmtTime(shift.end_time)}\n`;
      });
      text += "\n";
    });
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  return (
    <DashboardLayout title="Rota">
      {/* Week Navigator */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setWeekOffset(w => w - 1)} data-testid="button-prev-week">
            <ChevronLeft size={16} />
          </Button>
          <span className="text-sm font-semibold text-slate-700 min-w-[200px] text-center">{weekLabel}</span>
          <Button variant="outline" size="icon" onClick={() => setWeekOffset(w => w + 1)} data-testid="button-next-week">
            <ChevronRight size={16} />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setWeekOffset(0)} className="text-slate-500 text-xs" data-testid="button-this-week">This week</Button>
        </div>
        <Button onClick={handleWhatsApp} variant="outline" className="gap-2 text-green-700 border-green-300 hover:bg-green-50" data-testid="button-whatsapp-export">
          <Share2 size={16} />
          WhatsApp Export
        </Button>
      </div>

      {/* Rota Grid */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto shadow-sm">
        {isLoading ? (
          <div className="py-16 text-center text-slate-500">Loading rota...</div>
        ) : employees.length === 0 ? (
          <div className="py-16 text-center text-slate-500">
            <p className="font-medium">No active staff found.</p>
            <p className="text-sm mt-1">Add staff members first to build the rota.</p>
          </div>
        ) : (
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left p-3 text-xs font-semibold text-slate-500 w-36">Employee</th>
                {weekDates.map((d, i) => (
                  <th key={i} className={`text-center p-3 text-xs font-semibold w-28 ${fmtDate(d) === fmtDate(new Date()) ? "text-primary" : "text-slate-500"}`}>
                    {fmtDay(d)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.map(emp => (
                <tr key={emp.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                  <td className="p-3 text-sm font-medium text-slate-800">{emp.full_name}</td>
                  {weekDates.map((d, i) => {
                    const shift = getShift(emp.id, d);
                    return (
                      <td key={i} className="p-2 text-center">
                        {shift ? (
                          <button
                            onClick={() => openEdit(shift)}
                            data-testid={`shift-${emp.id}-${fmtDate(d)}`}
                            className="w-full rounded-md bg-primary/10 border border-primary/20 text-primary text-xs font-medium px-1 py-2 hover:bg-primary/20 transition-colors"
                          >
                            {fmtTime(shift.start_time)}<br />{fmtTime(shift.end_time)}
                          </button>
                        ) : (
                          <button
                            onClick={() => openAdd(emp.id, d)}
                            data-testid={`add-shift-${emp.id}-${fmtDate(d)}`}
                            className="w-full rounded-md border border-dashed border-slate-200 text-slate-300 text-xs py-2 hover:border-primary hover:text-primary transition-colors"
                          >
                            <Plus size={12} className="mx-auto" />
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add / Edit Shift Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingShift ? "Edit Shift" : "Add Shift"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {!editingShift && (
              <div className="space-y-2">
                <Label>Employee</Label>
                <Select value={form.employee_id} onValueChange={v => setForm(f => ({ ...f, employee_id: v }))}>
                  <SelectTrigger data-testid="select-employee"><SelectValue placeholder="Select employee" /></SelectTrigger>
                  <SelectContent>
                    {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} data-testid="input-shift-date" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Time</Label>
                <Input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} data-testid="input-start-time" />
              </div>
              <div className="space-y-2">
                <Label>End Time</Label>
                <Input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} data-testid="input-end-time" />
              </div>
            </div>
          </div>
          <div className="flex justify-between items-center pt-2">
            <div>
              {editingShift && (
                <Button variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50 gap-2" onClick={handleDelete} data-testid="button-delete-shift">
                  <Trash2 size={15} /> Delete
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} data-testid="button-save-shift">Save Shift</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
