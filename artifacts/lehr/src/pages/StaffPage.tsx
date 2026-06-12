import React from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { supabase } from "@/lib/supabaseClient";
import { useCompany } from "@/lib/CompanyContext";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export default function StaffPage() {
  const { activeCompany } = useCompany();
  const [staff, setStaff] = React.useState<any[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [editingStaff, setEditingStaff] = React.useState<any>(null);
  const { toast } = useToast();

  const [formData, setFormData] = React.useState({
    full_name: '', email: '', pin_code: '', role: 'staff', status: 'active'
  });

  const fetchStaff = React.useCallback(async () => {
    if (!activeCompany) return;
    setIsLoading(true);
    const { data, error } = await supabase.from('employees').select('id, full_name, email, role, status, pin_code, company_id').eq('company_id', activeCompany.id).order('full_name');
    if (!error && data) setStaff(data);
    setIsLoading(false);
  }, [activeCompany]);

  React.useEffect(() => { fetchStaff(); }, [fetchStaff]);

  const handleOpenDialog = (s?: any) => {
    if (s) {
      setEditingStaff(s);
      setFormData({ full_name: s.full_name, email: s.email, pin_code: s.pin_code, role: s.role, status: s.status });
    } else {
      setEditingStaff(null);
      setFormData({ full_name: '', email: '', pin_code: '', role: 'staff', status: 'active' });
    }
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.full_name || !formData.pin_code || !formData.email) {
      toast({ title: "Error", description: "Name, Email, and PIN are required.", variant: "destructive" });
      return;
    }
    
    try {
      if (editingStaff) {
        const { error } = await supabase.from('employees').update({
          ...formData,
          company_id: activeCompany?.id,
        }).eq('id', editingStaff.id);
        if (error) throw error;
      } else {
        // 🚀 SECURE API CALL
        const { data: { session } } = await supabase.auth.getSession();

        // In production, the API server would be at a known URL (e.g. api.domain.com or /api subpath)
        // For this demo/setup, we assume the API is reachable at /api
        const response = await fetch(`${window.location.origin}/api/create-employee`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`
          },
          body: JSON.stringify({
            ...formData,
            company_id: activeCompany?.id,
          }),
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Failed to create staff member");
      }

      toast({ title: "Success", description: `Staff member ${editingStaff ? 'updated' : 'added'}.` });
      setIsDialogOpen(false);
      fetchStaff();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };


  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('employees').delete().eq('id', id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Staff member deleted." });
      fetchStaff();
    }
  };

  return (
    <DashboardLayout title="Staff">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">Team Members</h2>
        <Button data-testid="button-add-staff" onClick={() => handleOpenDialog()}>Add Staff</Button>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingStaff ? "Edit Staff Member" : "Add Staff Member"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input data-testid="input-name" value={formData.full_name} onChange={e => setFormData({...formData, full_name: e.target.value})} placeholder="John Doe" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input data-testid="input-email" type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} placeholder="john@example.com" />
            </div>
            <div className="space-y-2">
              <Label>PIN Code</Label>
              <Input data-testid="input-pin" maxLength={4} value={formData.pin_code} onChange={e => setFormData({...formData, pin_code: e.target.value.replace(/[^0-9]/g, '')})} placeholder="1234" />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={formData.role} onValueChange={(val) => setFormData({...formData, role: val})}>
                <SelectTrigger data-testid="select-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={(val) => setFormData({...formData, status: val})}>
                <SelectTrigger data-testid="select-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} data-testid="button-save-staff">Save</Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="bg-white rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>PIN</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-6">Loading...</TableCell></TableRow>
            ) : staff.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-6 text-slate-500">No staff found.</TableCell></TableRow>
            ) : (
              staff.map(s => (
                <TableRow key={s.id} data-testid={`row-staff-${s.id}`}>
                  <TableCell className="font-medium">{s.full_name}</TableCell>
                  <TableCell>{s.email}</TableCell>
                  <TableCell>****</TableCell>
                  <TableCell><Badge variant="secondary">{s.role}</Badge></TableCell>
                  <TableCell><Badge variant={s.status === 'active' ? "default" : "outline"}>{s.status}</Badge></TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="ghost" size="sm" onClick={() => handleOpenDialog(s)} data-testid={`button-edit-${s.id}`}>Edit</Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" data-testid={`button-delete-${s.id}`}>Delete</Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                          <AlertDialogDescription>This action cannot be undone. This will permanently delete {s.full_name}.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => handleDelete(s.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </DashboardLayout>
  );
}
