import { useAuthContext } from "@/contexts/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";

const GUEST_USER_ID = "guest";

let cachedUserId: string | null = null;

export function getCachedUserId(): string | null {
  return cachedUserId;
}

export function setCachedUserId(userId: string | null): void {
  cachedUserId = userId;
}
let isVerifyingAuth = false;
let authResolveQueue: Array<(userId: string | null) => void> = [];

export function useUserId(): { userId: string | null; isAuthVerified: boolean } {
  const { user, loading } = useAuthContext();

  if (user) {
    cachedUserId = user.id;
  }

  return {
    userId: cachedUserId,
    isAuthVerified: !loading && !isVerifyingAuth,
  };
}

export async function getUserIdFromCache(): Promise<string | null> {
  if (cachedUserId) {
    return cachedUserId;
  }

  if (isVerifyingAuth) {
    return new Promise((resolve) => {
      authResolveQueue.push(resolve);
    });
  }

  isVerifyingAuth = true;

  try {
    const supabase = getSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    cachedUserId = user?.id ?? null;

    authResolveQueue.forEach((resolve) => resolve(cachedUserId));
    authResolveQueue = [];

    return cachedUserId;
  } catch {
    return cachedUserId;
  } finally {
    isVerifyingAuth = false;
  }
}

export function getCurrentUserIdSync(): string | null {
  return cachedUserId;
}

export { GUEST_USER_ID };
