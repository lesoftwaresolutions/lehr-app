import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";

export type Company = {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
  subscription_status: string;
  plan: "micro" | "growth" | "professional" | null;
  employee_limit: number;
};

const COMPANY_COLUMNS =
  "id, name, owner_id, created_at, subscription_status, plan, employee_limit";

type CompanyContextValue = {
  companies: Company[];
  activeCompany: Company | null;
  setActiveCompany: (c: Company) => void;
  refreshCompanies: () => Promise<Company[]>;
  isLoading: boolean;
};

const CompanyContext = createContext<CompanyContextValue>({
  companies: [],
  activeCompany: null,
  setActiveCompany: () => {},
  refreshCompanies: async () => [],
  isLoading: true,
});

const STORAGE_KEY = "lehr_active_company_id";

// With email confirmation ON, signUp() returns no session, so the company can't
// be created at registration. The company name is stored in the user's metadata
// instead, and created here on their first confirmed sign-in (when they own no
// company yet). Returns null when there is nothing pending.
async function createCompanyFromSignupMetadata(userId: string): Promise<Company | null> {
  const { data: { session } } = await supabase.auth.getSession();
  const pendingName = session?.user?.user_metadata?.company_name;
  if (typeof pendingName !== "string" || !pendingName.trim()) return null;

  const { data, error } = await supabase
    .from("companies")
    .insert([{ name: pendingName.trim(), owner_id: userId }])
    .select(COMPANY_COLUMNS)
    .single();

  if (error || !data) {
    console.error("Could not create company from signup details:", error);
    return null;
  }

  // Clear the pending name so it can never create a second company.
  const { error: clearErr } = await supabase.auth.updateUser({ data: { company_name: null } });
  if (clearErr) console.error("Could not clear pending company name:", clearErr);

  return data as unknown as Company;
}

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { session, authReady } = useAuth();
  // Use a stable primitive (userId string or null) as the effect dependency.
  // This prevents the infinite loop caused by depending on the session object reference.
  const userId = session?.user?.id ?? null;

  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompany, setActiveCompanyState] = useState<Company | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Shared so overlapping refreshes (e.g. React StrictMode) await one creation.
  const createPromise = useRef<Promise<Company | null> | null>(null);

  const refreshCompanies = useCallback(async (): Promise<Company[]> => {
    if (localStorage.getItem("mock_mode") === "true") {
      const mockList: Company[] = [{
        id: "mock-company-id",
        name: "Mock Company",
        owner_id: "mock-user-id",
        created_at: new Date().toISOString(),
        subscription_status: "active",
        plan: "professional",
        employee_limit: 30,
      }];
      setCompanies(mockList);
      setActiveCompanyState(mockList[0]);
      setIsLoading(false);
      return mockList;
    }

    if (!userId) return [];

    // Step 1: Get companies owned by the user
    const { data: owned, error: ownedErr } = await supabase
      .from("companies")
      .select(COMPANY_COLUMNS)
      .eq("owner_id", userId);

    if (ownedErr) console.error("Error fetching owned companies:", ownedErr);

    // Step 2: Get companies where the user is an employee
    const { data: employed, error: empErr } = await supabase
      .from("employees")
      .select(`company_id, companies(${COMPANY_COLUMNS})`)
      .eq("user_id", userId);

    if (empErr) console.error("Error fetching employed companies:", empErr);

    const ownedList = (owned as Company[]) ?? [];
    const employedList = (employed?.map(e => Array.isArray(e.companies) ? e.companies[0] : e.companies) as Company[]) ?? [];

    // Merge and deduplicate
    const combined = [...ownedList, ...employedList];
    const unique = Array.from(new Map(combined.filter(c => !!c).map(c => [c.id, c])).values());

    let list = unique.sort((a, b) => a.name.localeCompare(b.name));

    if (list.length === 0) {
      if (!createPromise.current) {
        createPromise.current = createCompanyFromSignupMetadata(userId).finally(() => {
          createPromise.current = null;
        });
      }
      const created = await createPromise.current;
      if (created) list = [created];
    }

    setCompanies(list);

    const stored = localStorage.getItem(STORAGE_KEY);
    const restored = list.find(c => c.id === stored) ?? list[0] ?? null;
    setActiveCompanyState(restored);
    if (restored) localStorage.setItem(STORAGE_KEY, restored.id);

    return list;
  // Depends on userId: with [] the callback kept the userId from the first render
  // (null on a full page load, before the session is restored) and never fetched
  // any companies, so reloads and the return from Stripe showed an empty picker.
  }, [userId]);

  // Re-fetch only when the logged-in user actually changes.
  // No onAuthStateChange subscription here — AuthContext owns auth state.
  useEffect(() => {
    // Until auth has resolved, stay in the initial loading state. Otherwise this
    // provider reports "not loading, no company" for a moment and AuthGuard
    // redirects every full page load (e.g. Stripe's return to /billing/success)
    // to /pick-company before the company list has been fetched.
    if (!authReady) return;
    if (userId) {
      setIsLoading(true);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      refreshCompanies().finally(() => setIsLoading(false));
    } else {
      setCompanies([]);
      setActiveCompanyState(null);
      setIsLoading(false);
    }
  // refreshCompanies only changes with userId, so it is safe to omit from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, authReady]);

  const setActiveCompany = (c: Company) => {
    setActiveCompanyState(c);
    localStorage.setItem(STORAGE_KEY, c.id);
  };

  return (
    <CompanyContext.Provider value={{ companies, activeCompany, setActiveCompany, refreshCompanies, isLoading }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  return useContext(CompanyContext);
}
