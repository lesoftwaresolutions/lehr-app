import React from "react";
import { useLocation, Link } from "wouter";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, Users, Building, Settings, LogOut, LayoutDashboard, Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export default function DashboardPage() {
  const [, setLocation] = useLocation();
  const [userEmail, setUserEmail] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        setLocation("/auth");
      } else {
        setUserEmail(session.user.email ?? null);
        setIsLoading(false);
      }
    });
  }, [setLocation]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setLocation("/");
  };

  const navItems = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard", active: true },
    { icon: Calendar, label: "Rota", href: "/dashboard/rota", active: false },
    { icon: Clock, label: "Clock In/Out", href: "/dashboard/time", active: false },
    { icon: Users, label: "Staff", href: "/dashboard/staff", active: false },
    { icon: Building, label: "Leave", href: "/dashboard/leave", active: false },
    { icon: Settings, label: "Settings", href: "/dashboard/settings", active: false },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <img src="/lehr-logo.png" alt="LEHR Logo" className="h-10 opacity-50" />
          <p className="text-slate-500 font-medium">Loading workspace...</p>
        </div>
      </div>
    );
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-slate-900 text-slate-300">
      <div className="p-6 flex items-center gap-3 bg-slate-950 border-b border-slate-800">
        <img src="/lehr-logo.png" alt="LEHR Logo" className="h-8 brightness-200 grayscale" />
        <span className="font-bold text-xl text-white tracking-tight">LEHR</span>
      </div>
      
      <div className="px-4 py-6 flex-1">
        <nav className="space-y-1">
          {navItems.map((item, i) => (
            <Link key={i} href={item.href} className="block w-full">
              <Button 
                variant={item.active ? "secondary" : "ghost"} 
                className={`w-full justify-start gap-3 ${item.active ? 'bg-primary text-white hover:bg-primary/90' : 'hover:bg-slate-800 hover:text-white text-slate-400'}`}
              >
                <item.icon size={18} />
                {item.label}
              </Button>
            </Link>
          ))}
        </nav>
      </div>

      <div className="p-4 bg-slate-950 border-t border-slate-800">
        <div className="flex items-center gap-3 px-2 py-3 mb-2 rounded-lg bg-slate-900 border border-slate-800">
          <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-white font-medium shrink-0">
            {userEmail?.charAt(0).toUpperCase()}
          </div>
          <div className="overflow-hidden">
            <p className="text-xs font-medium text-white truncate" data-testid="text-user-email">{userEmail}</p>
            <p className="text-[10px] text-slate-500">Manager</p>
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
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col fixed inset-y-0 z-10">
        <SidebarContent />
      </aside>

      {/* Main Content */}
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
            <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
          </div>
          <div className="text-sm font-medium text-slate-500 hidden sm:block">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </header>

        <div className="p-4 md:p-8 flex-1">
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
                <div className="text-3xl font-bold text-slate-900">12</div>
                <p className="text-xs text-slate-500 mt-1">Active team members</p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium text-slate-600">Today's Shifts</CardTitle>
                <Calendar className="h-4 w-4 text-slate-400" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-slate-900">5</div>
                <p className="text-xs text-slate-500 mt-1">Scheduled for today</p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium text-slate-600">Clocked In</CardTitle>
                <Clock className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-slate-900">3</div>
                <p className="text-xs text-primary mt-1 font-medium">Currently working</p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium text-slate-600">Pending Leave</CardTitle>
                <Building className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-slate-900">2</div>
                <p className="text-xs text-amber-600 mt-1 font-medium">Require approval</p>
              </CardContent>
            </Card>
          </div>

          <div className="mt-8 grid lg:grid-cols-2 gap-6">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                  No activity to show yet.
                </div>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button variant="outline" className="w-full justify-start text-left h-auto py-3">
                  <Calendar className="mr-3 h-5 w-5 text-slate-400" />
                  <div>
                    <div className="font-medium text-slate-900">Create Rota</div>
                    <div className="text-xs text-slate-500 font-normal">Plan next week's schedule</div>
                  </div>
                </Button>
                <Button variant="outline" className="w-full justify-start text-left h-auto py-3">
                  <Users className="mr-3 h-5 w-5 text-slate-400" />
                  <div>
                    <div className="font-medium text-slate-900">Add Staff Member</div>
                    <div className="text-xs text-slate-500 font-normal">Invite someone to your team</div>
                  </div>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
