import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useMemo,
  useRef,
} from "react";
import { User, Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";
import { setCachedUserId } from "@/lib/authCache";
import { syncAllUserData } from "@/api/auth";

interface AuthContextType {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = getSupabaseClient();
  const previousUserId = useRef<string | null>(null);

  useEffect(() => {
    const initAuth = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setCachedUserId(user?.id ?? null);
      setUser(user);
      setLoading(false);

      if (user?.id) {
        previousUserId.current = user.id;
      }
    };

    initAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event: string, session: Session | null) => {
        const newUserId = session?.user?.id ?? null;
        setCachedUserId(newUserId);
        setUser(session?.user ?? null);
        setLoading(false);

        if (newUserId && newUserId !== previousUserId.current) {
          previousUserId.current = newUserId;
          syncAllUserData(newUserId);
        }
      },
    );

    return () => subscription.unsubscribe();
  }, [supabase]);

  const value = useMemo(() => ({ user, loading }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuthContext must be used within an AuthProvider");
  }
  return context;
}
