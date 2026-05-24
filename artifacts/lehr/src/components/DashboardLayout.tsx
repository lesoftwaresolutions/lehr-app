import { useState, useEffect, ReactNode } from "react";
import { useLocation, Link } from "wouter";
import { supabase } from "@/lib/supabaseClient";
import { useCompany } from "@/lib/CompanyContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Calendar, Clock, Users, FileText, LogOut, LayoutDashboard, Menu, ChevronDown, Building2, Plus, Check } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export function DashboardLayout({ children, title }: { children: ReactNode; title: string }) {
  const [location, setLocation] = useLocation();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const { companies, activeCompany, setActiveCompany, refreshCompanies } = useCompany();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        setLocation("/auth");
      } else {
        setUserEmail(session.user.email ?? null);
        refreshCompanies();
      }
    });
  }, [setLocation, refreshCompanies]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setLocation("/");
  };

  const navItems = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
    { icon: Calendar, label: "Rota", href: "/dashboard/rota" },
    { icon: Clock, label: "Time Logs", href: "/dashboard/time" },
    { icon: Users, label: "Staff", href: "/dashboard/staff" },
    { icon: FileText, label: "Leave", href: "/dashboard/leave" },
  ];

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-slate-900 text-slate-300">
      {/* Logo */}
      <div className="p-5 flex items-center gap-3 bg-slate-950 border-b border-slate-800">
        <img src="/lehr-logo.png" alt="LEHR Logo" className="h-8 brightness-200 grayscale" />
        <span className="font-bold text-xl text-white tracking-tight">LEHR</span>
      </div>

      {/* Company switcher */}
      <div className="px-3 py-3 border-b border-slate-800">
        {activeCompany ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors text-left"
                data-testid="company-switcher"
              >
                <div className="w-7 h-7 rounded-md bg-primary/20 flex items-center justify-center shrink-0">
                  <Building2 size={14} className="text-primary" />
                </div>
                <span className="text-sm font-semibold text-white truncate flex-1">{activeCompany.name}</span>
                <ChevronDown size={14} className="text-slate-400 shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 ml-1" align="start">
              {companies.map(c => (
                <DropdownMenuItem
                  key={c.id}
                  onClick={() => setActiveCompany(c)}
                  className="gap-2 cursor-pointer"
                  data-testid={`switch-company-${c.id}`}
                >
                  <Building2 size={14} className="text-slate-400" />
                  <span className="flex-1">{c.name}</span>
                  {c.id === activeCompany?.id && <Check size={14} className="text-primary" />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="gap-2 cursor-pointer text-slate-500"
                onClick={() => setLocation("/pick-company")}
                data-testid="add-company-menu"
              >
                <Plus size={14} />
                Add another company
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <button
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors text-left"
            onClick={() => setLocation("/pick-company")}
          >
            <Building2 size={14} className="text-primary" />
            <span className="text-sm text-slate-400">Select company</span>
          </button>
        )}
      </div>

      {/* Nav */}
      <div className="px-3 py-4 flex-1">
        <nav className="space-y-1">
          {navItems.map((item, i) => {
            const active = location === item.href;
            return (
              <Link key={i} href={item.href} className="block w-full">
                <Button
                  variant={active ? "secondary" : "ghost"}
                  className={`w-full justify-start gap-3 ${
                    active
                      ? "bg-primary text-white hover:bg-primary/90"
                      : "hover:bg-slate-800 hover:text-white text-slate-400"
                  }`}
                >
                  <item.icon size={18} />
                  {item.label}
                </Button>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* User footer */}
      <div className="p-3 bg-slate-950 border-t border-slate-800">
        <div className="flex items-center gap-3 px-2 py-2.5 mb-2 rounded-lg bg-slate-900 border border-slate-800">
          <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-white font-medium shrink-0 text-sm">
            {userEmail?.charAt(0).toUpperCase()}
          </div>
          <div className="overflow-hidden">
            <p className="text-xs font-medium text-white truncate" data-testid="text-user-email">{userEmail}</p>
            <p className="text-[10px] text-slate-500">{activeCompany?.name ?? "No company"}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-slate-400 hover:text-white hover:bg-slate-800"
          onClick={handleSignOut}
          data-testid="button-signout"
        >
          <LogOut size={18} />
          Sign Out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-slate-50 font-sans">
      <aside className="hidden md:flex w-64 flex-col fixed inset-y-0 z-10">
        <SidebarContent />
      </aside>

      <main className="flex-1 md:ml-64 flex flex-col min-h-screen">
        <header className="h-16 bg-white border-b flex items-center justify-between px-4 md:px-8 sticky top-0 z-20">
          <div className="flex items-center gap-4">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden">
                  <Menu size={20} />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-72 border-r-0">
                <SidebarContent />
              </SheetContent>
            </Sheet>
            <div>
              <h1 className="text-xl font-semibold text-slate-900 leading-tight">{title}</h1>
              {activeCompany && (
                <p className="text-xs text-slate-400 leading-tight hidden sm:block">{activeCompany.name}</p>
              )}
            </div>
          </div>
          <div className="text-sm font-medium text-slate-500 hidden sm:block">
            {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
          </div>
        </header>

        <div className="p-4 md:p-8 flex-1">
          {children}
        </div>
      </main>
    </div>
  );
}
