import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://drhseqszhnnbeifvpfmx.supabase.co";

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRyaHNlcXN6aG5uYmVpZnZwZm14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1MzkwODgsImV4cCI6MjA5NTExNTA4OH0.p1LN_eZFEdq67G5REtzYtykIYz3R5VH__BviZKsTGhM";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
