import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

type AuthContextValue = {
  session: Session | null;
  authReady: boolean;
};

const AuthContext = createContext<AuthContextValue>({ session: null, authReady: false });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("mock_mode") === "true") {
      setSession({
        access_token: "mock-token",
        token_type: "bearer",
        expires_in: 3600,
        refresh_token: "mock-refresh",
        user: {
          id: "mock-user-id",
          aud: "authenticated",
          role: "authenticated",
          email: "manager@example.com",
          user_metadata: { full_name: "Mock Manager" },
          app_metadata: {},
          identities: [],
          created_at: new Date().toISOString(),
        }
      } as any);
      setAuthReady(true);
      return;
    }

    // getSession() reads from localStorage — synchronous-ish, no network needed.
    // This sets authReady to true almost instantly on page load.
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });

    // onAuthStateChange keeps session in sync after sign-in / sign-out / token refresh.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setAuthReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ session, authReady }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
