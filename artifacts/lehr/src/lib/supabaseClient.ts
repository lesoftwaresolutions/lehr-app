import { createClient } from "@supabase/supabase-js";

// These values are baked in at Vite build time via VITE_ env vars.
// The hardcoded fallbacks allow the app to run without any .env file,
// but Vercel env vars (if set) will always take precedence.
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL?.trim() ||
  "https://drhseqszhnnbeifvpfmx.supabase.co";

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRyaHNlcXN6aG5uYmVpZnZwZm14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1MzkwODgsImV4cCI6MjA5NTExNTA4OH0.p1LN_eZFEdq67G5REtzYtykIYz3R5VH__BviZKsTGhM";

// Validate early so the error message is clear, not a cryptic Supabase SDK error.
// This catches the case where Vercel env vars are set to an empty string,
// which overrides the fallback above and reaches Supabase as "".
if (!supabaseUrl.startsWith("https://")) {
  throw new Error(
    `[LEHR] Invalid VITE_SUPABASE_URL: "${supabaseUrl}". ` +
    `It must start with https://. ` +
    `Check your Vercel environment variables — an empty string overrides the fallback.`
  );
}

if (!supabaseAnonKey || supabaseAnonKey.length < 100) {
  throw new Error(
    `[LEHR] Invalid VITE_SUPABASE_ANON_KEY. ` +
    `Check your Vercel environment variables.`
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
