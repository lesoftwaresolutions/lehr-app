import { useState } from "react";
import { useLocation } from "wouter";
import { useCompany } from "@/lib/CompanyContext";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Building2, Plus, ChevronRight, Loader2 } from "lucide-react";

export default function CompanyPickerPage() {
  const [, setLocation] = useLocation();
  const { companies, setActiveCompany, refreshCompanies } = useCompany();
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleSelect = (company: import("@/lib/CompanyContext").Company) => {
    setActiveCompany(company);
    setLocation("/dashboard");
  };

  const handleAddCompany = async () => {
    if (!newName.trim()) return;
    setIsSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setIsSaving(false); return; }

    const { data, error } = await supabase
      .from("companies")
      .insert([{ name: newName.trim(), owner_id: user.id }])
      .select()
      .single();

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setIsSaving(false);
      return;
    }
    toast({ title: "Company added", description: `${newName} is ready.` });
    const updated = await refreshCompanies();
    const created = updated.find(c => c.id === data.id);
    if (created) {
      setActiveCompany(created);
      setLocation("/dashboard");
    }
    setIsSaving(false);
    setAddOpen(false);
    setNewName("");
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
      <div className="mb-8 flex items-center gap-3">
        <img src="/lehr-logo.png" alt="LEHR Logo" className="h-10" />
        <span className="font-bold text-2xl text-primary">LEHR</span>
      </div>

      <div className="w-full max-w-sm">
        <h2 className="text-xl font-bold text-slate-900 mb-1">Select a company</h2>
        <p className="text-sm text-slate-500 mb-6">Which location would you like to manage today?</p>

        <div className="space-y-3 mb-4">
          {companies.map(company => (
            <Card
              key={company.id}
              className="cursor-pointer hover:border-primary/50 hover:shadow-md transition-all p-4 flex items-center justify-between group"
              onClick={() => handleSelect(company)}
              data-testid={`company-card-${company.id}`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Building2 size={20} className="text-primary" />
                </div>
                <span className="font-semibold text-slate-800">{company.name}</span>
              </div>
              <ChevronRight size={18} className="text-slate-300 group-hover:text-primary transition-colors" />
            </Card>
          ))}
        </div>

        <Button
          variant="outline"
          className="w-full gap-2 border-dashed"
          onClick={() => setAddOpen(true)}
          data-testid="button-add-company"
        >
          <Plus size={16} /> Add another company
        </Button>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a new company</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Company Name</Label>
              <Input
                placeholder="e.g. MB Eastbourne"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAddCompany()}
                data-testid="input-new-company-name"
                autoFocus
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAddCompany} disabled={isSaving || !newName.trim()} data-testid="button-save-new-company">
              {isSaving ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
              Add Company
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
