import { useAuthContext } from "@/contexts/AuthContext";

/**
 * Hook to access auth state from AuthContext.
 * This is a convenience wrapper around useAuthContext.
 */
export function useAuth() {
  return useAuthContext();
}
