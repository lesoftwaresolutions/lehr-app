import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { supabase } from "@/lib/supabaseClient";

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
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompany, setActiveCompanyState] = useState<Company | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshCompanies = useCallback(async (): Promise<Company[]> => {
    const { data } = await supabase
      .from("companies")
      .select("id, name, owner_id, created_at")
      .order("name");
    const list = (data as Company[]) ?? [];
    setCompanies(list);

    // Restore or pick active company
    const stored = localStorage.getItem(STORAGE_KEY);
    const restored = list.find(c => c.id === stored) ?? list[0] ?? null;
    setActiveCompanyState(restored);
    if (restored) localStorage.setItem(STORAGE_KEY, restored.id);

    return list;
  }, []);

  // Re-load whenever auth state changes.
  // A 5-second failsafe ensures isLoading never stays true if Supabase is slow/unresponsive.
  useEffect(() => {
    setIsLoading(true);

    const timeout = setTimeout(() => {
      setIsLoading(false); // unblock the UI even if auth never responds
    }, 5000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      clearTimeout(timeout);
      if (session) {
        await refreshCompanies();
      } else {
        setCompanies([]);
        setActiveCompanyState(null);
      }
      setIsLoading(false);
    });

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [refreshCompanies]);

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
