import React from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { supabase } from "@/lib/supabaseClient";
import { useCompany } from "@/lib/CompanyContext";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";

// ─── API client ────────────────────────────────────────────────────────────────
// Always call /api/create-employee relative to the current origin.
// vercel.json rewrites /api/* → the API server, so no hardcoded URL is needed.
// This works in dev (Vite proxy), staging, and production without any env var.
async function createEmployee(payload: {
  full_name: string;
  email: string;
  pin_code: string;
  role: string;
  company_id: string;
  access_token: string;
}): Promise<void> {
  const { access_token, ...body } = payload;

  const res = await fetch("/api/create-employee", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${access_token}`,
    },
    body: JSON.stringify(body),
  });

  // Guard: Vercel sometimes returns an HTML error page instead of JSON
  // (e.g. when the rewrite target is misconfigured). Detect this early.
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const text = await res.text();
    throw new Error(
      `API server returned an unexpected response (${res.status}). ` +
      `This usually means the /api rewrite in vercel.json is pointing ` +
      `to the wrong URL. Response: ${text.slice(0, 120)}`
    );
  }

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error ?? `Request failed with status ${res.status}`);
  }
}

// ─── Types ─────────────────────────────────────────────────────────────────────
interface StaffMember {
  id: string;
  full_name: string;
  email: string;
  pin_code: string;
  role: string;
  status: string;
  company_id: string;
}

interface FormData {
  full_name: string;
  email: string;
  pin_code: string;
  role: string;
  status: string;
}

const EMPTY_FORM: FormData = {
  full_name: "",
  email: "",
  pin_code: "",
  role: "staff",
  status: "active",
};

// ─── Component ─────────────────────────────────────────────────────────────────
export default function StaffPage() {
  const { activeCompany } = useCompany();
  const { toast } = useToast();

  const [staff, setStaff] = React.useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [editingStaff, setEditingStaff] = React.useState<StaffMember | null>(null);
  const [formData, setFormData] = React.useState<FormData>(EMPTY_FORM);
  const [formError, setFormError] = React.useState<string | null>(null);

  // ── Data fetching ─────────────────────────────────────────────────────────
  const fetchStaff = React.useCallback(async () => {
    if (!activeCompany) return;
    setIsLoading(true);
    if (localStorage.getItem("mock_mode") === "true") {
      setStaff([
        {
          id: "1",
          full_name: "john",
          email: "john@example.com",
          pin_code: "2222",
          role: "staff",
          status: "active",
          company_id: "mock-company-id"
        }
      ]);
      setIsLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from("employees")
        .select("id, full_name, email, role, status, pin_code, company_id")
        .eq("company_id", activeCompany.id)
        .order("full_name");

      if (error) throw error;
      setStaff(data ?? []);
    } catch (err: any) {
      toast({ title: "Error loading staff", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [activeCompany, toast]);

  React.useEffect(() => { fetchStaff(); }, [fetchStaff]);

  // ── Dialog helpers ────────────────────────────────────────────────────────
  const openAdd = () => {
    setEditingStaff(null);
    setFormData(EMPTY_FORM);
    setFormError(null);
    setIsDialogOpen(true);
  };

  const openEdit = (s: StaffMember) => {
    setEditingStaff(s);
    setFormData({
      full_name: s.full_name,
      email: s.email,
      pin_code: s.pin_code,
      role: s.role,
      status: s.status,
    });
    setFormError(null);
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setFormError(null);
  };

  const setField = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    setFormError(null);
  };

  // ── Validation ────────────────────────────────────────────────────────────
  const validate = (): string | null => {
    if (!formData.full_name.trim()) return "Full name is required.";
    if (!formData.email.trim()) return "Email is required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) return "Enter a valid email address.";
    if (!formData.pin_code) return "PIN is required.";
    if (!/^\d{4}$/.test(formData.pin_code)) return "PIN must be exactly 4 digits.";

    // Check for duplicate PIN within the company (client-side fast check)
    const duplicate = staff.find(
      s => s.pin_code === formData.pin_code && s.id !== editingStaff?.id
    );
    if (duplicate) return `PIN ${formData.pin_code} is already used by ${duplicate.full_name}.`;

    return null;
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    const validationError = validate();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    if (!activeCompany) return;
    setIsSaving(true);
    setFormError(null);

    try {
      if (editingStaff) {
        // Edit: direct Supabase update (no auth server needed)
        const { error } = await supabase
          .from("employees")
          .update({
            full_name: formData.full_name.trim(),
            email: formData.email.trim(),
            pin_code: formData.pin_code,
            role: formData.role,
            status: formData.status,
          })
          .eq("id", editingStaff.id)
          .eq("company_id", activeCompany.id);

        if (error) throw error;
      } else {
        // Create: goes via API server so a Supabase Auth account is also created
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.access_token) {
          throw new Error("Your session has expired. Please sign in again.");
        }

        await createEmployee({
          full_name: formData.full_name.trim(),
          email: formData.email.trim(),
          pin_code: formData.pin_code,
          role: formData.role,
          company_id: activeCompany.id,
          access_token: session.access_token,
        });
      }

      toast({
        title: editingStaff ? "Staff member updated" : "Staff member added",
        description: `${formData.full_name} has been ${editingStaff ? "updated" : "added"} successfully.`,
      });
      closeDialog();
      fetchStaff();
    } catch (err: any) {
      setFormError(err.message ?? "Something went wrong. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async (id: string, name: string) => {
    try {
      const { error } = await supabase
        .from("employees")
        .delete()
        .eq("id", id)
        .eq("company_id", activeCompany?.id);

      if (error) throw error;

      toast({ title: "Staff member removed", description: `${name} has been deleted.` });
      fetchStaff();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout title="Staff">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-semibold">Team Members</h2>
          <p className="text-sm text-slate-500 mt-0.5">{activeCompany?.name}</p>
        </div>
        <Button data-testid="button-add-staff" onClick={openAdd}>
          Add Staff
        </Button>
      </div>

      {/* ── Add / Edit dialog ─────────────────────────────────────────────── */}
      <Dialog open={isDialogOpen} onOpenChange={open => { if (!open) closeDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingStaff ? "Edit Staff Member" : "Add Staff Member"}</DialogTitle>
            <DialogDescription>
              {editingStaff
                ? "Update this team member's details."
                : "Enter the new team member's details to add them to your staff."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="sf-name">Full Name</Label>
              <Input
                id="sf-name"
                data-testid="input-name"
                value={formData.full_name}
                onChange={e => setField("full_name", e.target.value)}
                placeholder="Jane Smith"
                disabled={isSaving}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sf-email">Email</Label>
              <Input
                id="sf-email"
                data-testid="input-email"
                type="email"
                value={formData.email}
                onChange={e => setField("email", e.target.value)}
                placeholder="jane@example.com"
                disabled={isSaving}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sf-pin">
                PIN Code
                <span className="text-slate-400 font-normal ml-1">(4 digits, used at the kiosk)</span>
              </Label>
              <Input
                id="sf-pin"
                data-testid="input-pin"
                maxLength={4}
                inputMode="numeric"
                value={formData.pin_code}
                onChange={e => setField("pin_code", e.target.value.replace(/\D/g, ""))}
                placeholder="1234"
                disabled={isSaving}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select
                value={formData.role}
                onValueChange={val => setField("role", val)}
                disabled={isSaving}
              >
                <SelectTrigger data-testid="select-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={formData.status}
                onValueChange={val => setField("status", val)}
                disabled={isSaving}
              >
                <SelectTrigger data-testid="select-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Inline error — no toast needed, error lives next to the form */}
            {formError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {formError}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={closeDialog} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving} data-testid="button-save-staff">
              {isSaving && <Loader2 size={14} className="animate-spin mr-2" />}
              {isSaving ? "Saving…" : editingStaff ? "Save Changes" : "Add Staff"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Staff table ───────────────────────────────────────────────────── */}
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
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10">
                  <Loader2 className="animate-spin mx-auto text-slate-400" size={20} />
                </TableCell>
              </TableRow>
            ) : staff.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-slate-400">
                  No staff yet. Click <strong>Add Staff</strong> to get started.
                </TableCell>
              </TableRow>
            ) : (
              staff.map(s => (
                <TableRow key={s.id} data-testid={`row-staff-${s.id}`}>
                  <TableCell className="font-medium">{s.full_name}</TableCell>
                  <TableCell className="text-slate-600">{s.email}</TableCell>
                  <TableCell className="text-slate-400 tracking-widest text-xs">••••</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize">{s.role}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={s.status === "active" ? "default" : "outline"} className="capitalize">
                      {s.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(s)}
                      data-testid={`button-edit-${s.id}`}
                    >
                      Edit
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          data-testid={`button-delete-${s.id}`}
                        >
                          Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete {s.full_name}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently remove {s.full_name} and all their associated records.
                            This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-red-600 hover:bg-red-700"
                            onClick={() => handleDelete(s.id, s.full_name)}
                          >
                            Delete
                          </AlertDialogAction>
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
