import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Clock, Calendar, Users, Building, MessageSquare } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col font-sans bg-slate-50">
      {/* Header */}
      <header className="px-6 py-4 bg-white border-b sticky top-0 z-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/lehr-logo.png" alt="LEHR Logo" className="h-8 object-contain" />
          <span className="font-bold text-xl text-primary tracking-tight">LEHR</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/auth" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors" data-testid="link-login">
            Log In
          </Link>
          <Link href="/auth" data-testid="link-signup">
            <Button>Get Started</Button>
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-24 px-6 text-center max-w-4xl mx-auto">
          <h1 className="text-5xl md:text-6xl font-extrabold text-slate-900 tracking-tight leading-tight mb-6">
            The lean, no-nonsense HR system for <span className="text-primary">UK small businesses.</span>
          </h1>
          <p className="text-xl text-slate-600 mb-10 max-w-2xl mx-auto leading-relaxed">
            Manage your staff, rotas, and leave without the enterprise bloat. Perfect for pubs, salons, and retail shops. Professional, precise, and distinctly British.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/auth" data-testid="button-hero-get-started">
              <Button size="lg" className="text-lg px-8 py-6 rounded-full w-full sm:w-auto shadow-lg hover:shadow-xl transition-all">
                Get Started for Free
              </Button>
            </Link>
            <p className="text-sm text-slate-500 sm:hidden">No credit card required</p>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-24 px-6 bg-white border-y">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold text-slate-900 mb-4">Everything you need to run your team</h2>
              <p className="text-lg text-slate-600">Built for managers who need to get things done, not fiddle with settings.</p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-8">
              {[
                { icon: Calendar, title: "Digital Rota Builder", desc: "Create and publish shifts in minutes, not hours." },
                { icon: Clock, title: "Real-time Clock-in/out", desc: "Accurate timesheets directly from staff phones." },
                { icon: Users, title: "Staff Records", desc: "Securely store emergency contacts and documents." },
                { icon: Building, title: "Leave Tracking", desc: "Manage holidays and sickness without the spreadsheet." },
                { icon: MessageSquare, title: "WhatsApp Rota Export", desc: "Send shifts where your team actually looks." },
                { icon: CheckCircle2, title: "Manager Dashboard", desc: "A bird's-eye view of who's in and what's pending." }
              ].map((feature, i) => (
                <div key={i} className="bg-slate-50 p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                  <div className="bg-primary/10 w-12 h-12 rounded-lg flex items-center justify-center mb-4 text-primary">
                    <feature.icon size={24} />
                  </div>
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">{feature.title}</h3>
                  <p className="text-slate-600 leading-relaxed">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section className="py-24 px-6 max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">Simple, straightforward pricing</h2>
            <p className="text-lg text-slate-600">No hidden fees. No long-term contracts. Cancel anytime.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 items-start">
            {/* Micro Tier */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-2xl">Micro</CardTitle>
                <CardDescription className="text-base">Up to 5 Employees</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-6">
                  <span className="text-4xl font-bold text-slate-900">£15</span>
                  <span className="text-slate-500">/month</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {["Digital Rota Builder", "Real-time Clock-in/out", "Staff Profiles & Records", "Leave & Absence Tracking", "WhatsApp Rota Export", "Manager Dashboard", "Email Support"].map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                      <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Link href="/auth" className="w-full" data-testid="button-pricing-micro">
                  <Button variant="outline" className="w-full font-semibold">Get Started</Button>
                </Link>
              </CardFooter>
            </Card>

            {/* Growth Tier */}
            <Card className="border-primary shadow-xl md:-mt-4 relative bg-white">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-primary text-primary-foreground px-4 py-1 rounded-full text-sm font-semibold shadow-sm">
                Recommended
              </div>
              <CardHeader className="pt-8">
                <CardTitle className="text-2xl text-primary">Growth</CardTitle>
                <CardDescription className="text-base">Up to 15 Employees</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-6">
                  <span className="text-4xl font-bold text-slate-900">£29</span>
                  <span className="text-slate-500">/month</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {["Digital Rota Builder", "Real-time Clock-in/out", "Staff Profiles & Records", "Leave & Absence Tracking", "WhatsApp Rota Export", "Manager Dashboard", "Email Support"].map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                      <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Link href="/auth" className="w-full" data-testid="button-pricing-growth">
                  <Button className="w-full font-semibold">Get Started</Button>
                </Link>
              </CardFooter>
            </Card>

            {/* Professional Tier */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-2xl">Professional</CardTitle>
                <CardDescription className="text-base">Up to 30 Employees</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-6">
                  <span className="text-4xl font-bold text-slate-900">£59</span>
                  <span className="text-slate-500">/month</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {["Digital Rota Builder", "Real-time Clock-in/out", "Staff Profiles & Records", "Leave & Absence Tracking", "WhatsApp Rota Export", "Manager Dashboard", "Email Support"].map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                      <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Link href="/auth" className="w-full" data-testid="button-pricing-pro">
                  <Button variant="outline" className="w-full font-semibold">Get Started</Button>
                </Link>
              </CardFooter>
            </Card>
          </div>

          <div className="mt-12 text-center text-sm text-slate-500 space-y-1">
            <p>Secure payments via Stripe.</p>
            <p>Cancel anytime from your account dashboard. No long-term commitment required.</p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-12 px-6 border-t border-slate-800 mt-auto">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <img src="/lehr-logo.png" alt="LEHR Logo" className="h-8 grayscale brightness-200 opacity-80" />
            <span className="font-bold text-xl text-white tracking-tight">LEHR</span>
          </div>
          <div className="text-sm">
            &copy; {new Date().getFullYear()} LeSoftware Solutions. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
