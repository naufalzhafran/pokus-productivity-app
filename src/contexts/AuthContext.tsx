import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useMemo,
} from "react";
import { RecordModel } from "pocketbase";
import { getClient } from "@/lib/pocketbase/client";

interface AuthContextType {
  user: RecordModel | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<RecordModel | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const pb = getClient();

    // Get initial auth state
    setUser(pb.authStore.record);
    setLoading(false);

    // Listen for auth changes
    const unsubscribe = pb.authStore.onChange((_token, record) => {
      setUser(record);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

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
