# LEHR — Manage Staff

A lean HR SaaS system for UK SMEs — Digital Rota, Real-time Clock-in/out (PIN-based), Staff Records, Leave Tracking, and WhatsApp Rota Export. Built by LeSoftware Solutions.

## Run & Operate

- `pnpm --filter @workspace/lehr run dev` — run the frontend (port auto-assigned)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- Required env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS + wouter (routing)
- Auth & DB: Supabase (auth.users + custom tables)
- UI: shadcn/ui components, lucide-react icons
- API: Express 5 (shared api-server, not used heavily in Phase 1)
- Build: Vite (frontend), esbuild (API)

## Where things live

- `artifacts/lehr/` — Main frontend app
- `artifacts/lehr/src/lib/supabaseClient.ts` — Supabase client (source of truth)
- `artifacts/lehr/src/pages/LandingPage.tsx` — Marketing landing page
- `artifacts/lehr/src/pages/AuthPage.tsx` — Sign up / Sign in (Supabase Auth)
- `artifacts/lehr/src/pages/DashboardPage.tsx` — Protected dashboard shell
- `artifacts/lehr/src/App.tsx` — Router and route definitions
- `artifacts/api-server/src/routes/` — Express API routes (future phases)
- `lib/db/src/schema/` — Drizzle schema (Replit DB, future phases)

## Supabase Database Schema

Run in Supabase SQL Editor (Dashboard → SQL Editor → New Query):

Tables: `companies`, `employees`, `shifts`, `time_logs`, `leave_requests`

All tables have RLS enabled. Auth is via Supabase's built-in `auth.users`.

## Architecture decisions

- Supabase is used directly from the frontend for Phase 1 (auth + DB). No custom backend needed.
- Supabase anon key is safe for frontend use with RLS policies enforced.
- `VITE_` prefix required for env vars to be accessible in Vite frontend.
- PIN-based clock-in/out will use the `employees.pin_code` field (Phase 2).
- WhatsApp export will format shift data as a shareable text string (Phase 2).

## Product

LEHR Phase 1 includes:
- Professional landing page with pricing (Micro £15, Growth £29, Professional £59)
- Supabase Auth — sign up and log in with email/password
- Protected dashboard shell with sidebar navigation
- Supabase DB schema for all core entities

## User preferences

- UK-focused product (GBP pricing, British English)
- Built by LeSoftware Solutions
- Zero maintenance: React + Supabase only, no custom backend for core features
- Vercel deploy target for production

## Gotchas

- Always use `VITE_` prefix for env vars in the frontend
- Supabase anon key is safe for client-side — never use service_role key in frontend
- RLS must be enabled on all Supabase tables before going to production
- Run SQL schema in Supabase SQL Editor before testing auth-protected features

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- Supabase docs: https://supabase.com/docs
