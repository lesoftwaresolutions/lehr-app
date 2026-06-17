import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";

export type Company = {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
};

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

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  // Use a stable primitive (userId string or null) as the effect dependency.
  // This prevents the infinite loop caused by depending on the session object reference.
  const userId = session?.user?.id ?? null;

  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompany, setActiveCompanyState] = useState<Company | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshCompanies = useCallback(async (): Promise<Company[]> => {
    if (!userId) return [];

    // Step 1: Get companies owned by the user
    const { data: owned, error: ownedErr } = await supabase
      .from("companies")
      .select("id, name, owner_id, created_at")
      .eq("owner_id", userId);

    if (ownedErr) console.error("Error fetching owned companies:", ownedErr);

    // Step 2: Get companies where the user is an employee
    const { data: employed, error: empErr } = await supabase
      .from("employees")
      .select("company_id, companies(id, name, owner_id, created_at)")
      .eq("user_id", userId);

    if (empErr) console.error("Error fetching employed companies:", empErr);

    const ownedList = (owned as Company[]) ?? [];
    const employedList = (employed?.map(e => Array.isArray(e.companies) ? e.companies[0] : e.companies) as Company[]) ?? [];

    // Merge and deduplicate
    const combined = [...ownedList, ...employedList];
    const unique = Array.from(new Map(combined.filter(c => !!c).map(c => [c.id, c])).values());

    const list = unique.sort((a, b) => a.name.localeCompare(b.name));
    setCompanies(list);

    const stored = localStorage.getItem(STORAGE_KEY);
    const restored = list.find(c => c.id === stored) ?? list[0] ?? null;
    setActiveCompanyState(restored);
    if (restored) localStorage.setItem(STORAGE_KEY, restored.id);

    return list;
  }, []); // stable — no external deps

  // Re-fetch only when the logged-in user actually changes.
  // No onAuthStateChange subscription here — AuthContext owns auth state.
  useEffect(() => {
    if (userId) {
      setIsLoading(true);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      refreshCompanies().finally(() => setIsLoading(false));
    } else {
      setCompanies([]);
      setActiveCompanyState(null);
      setIsLoading(false);
    }
  // refreshCompanies is a stable useCallback — safe to omit from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

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
