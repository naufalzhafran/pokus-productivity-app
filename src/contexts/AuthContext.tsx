import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useMemo,
} from "react";
import { User, Session, AuthChangeEvent } from "@supabase/supabase-js";
import { getClient } from "@/lib/supabase/client";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getClient();

    // Get initial session
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, currentSession: Session | null) => {
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
        setLoading(false);
      },
    );

    return () => subscription.unsubscribe();
  }, []);

  const value = useMemo(
    () => ({ user, session, loading }),
    [user, session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuthContext must be used within an AuthProvider");
  }
  return context;
}
