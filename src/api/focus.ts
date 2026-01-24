import { createClient } from "@/lib/supabase/client";
import {
  saveLocalSession,
  updateLocalSession,
  getLocalSession,
  getLocalSessionsByDateRange,
  LocalSession,
  addToSyncQueue,
} from "@/lib/sync";

const supabase = createClient();

/**
 * Create a session locally first, then sync to Supabase in background
 * Returns immediately with local session data - no loading state needed
 */
export async function createSession(
  title: string,
  duration: number,
): Promise<LocalSession> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  // Generate UUID client-side for consistent ID between local and remote
  const sessionId = crypto.randomUUID();
  const now = new Date().toISOString();

  const localSession: LocalSession = {
    id: sessionId,
    user_id: user.id,
    title: title,
    duration_planned: duration,
    status: "PLANNED",
    created_at: now,
    syncStatus: "PENDING",
  };

  // Save to local storage immediately
  await saveLocalSession(localSession);

  // Queue background sync to Supabase (fire and forget)
  addToSyncQueue({
    type: "CREATE",
    table: "pokus_sessions",
    data: {
      id: sessionId,
      user_id: user.id,
      title: title,
      duration_planned: duration,
      status: "PLANNED",
      created_at: now,
    },
  });

  return localSession;
}

/**
 * Update session status locally first, then sync to Supabase in background
 */
export async function updateSessionStatus(
  sessionId: string,
  status: "COMPLETED" | "ABANDONED",
  actualDuration?: number,
): Promise<void> {
  const endedAt = new Date().toISOString();

  // Update local storage immediately
  await updateLocalSession(sessionId, {
    status,
    duration_actual: actualDuration,
    ended_at: endedAt,
  });

  // Queue background sync to Supabase (fire and forget)
  addToSyncQueue({
    type: "UPDATE",
    table: "pokus_sessions",
    data: {
      id: sessionId,
      status,
      duration_actual: actualDuration,
      ended_at: endedAt,
    },
  });
}

/**
 * Get sessions - returns local data first, syncs with remote in background
 */
export async function getSessions(
  startDate: Date,
  endDate: Date,
): Promise<LocalSession[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  // Get local sessions first (instant)
  const localSessions = await getLocalSessionsByDateRange(startDate, endDate);

  // If online, fetch remote and merge in background
  if (navigator.onLine) {
    fetchAndMergeRemoteSessions(user.id, startDate, endDate);
  }

  return localSessions.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

/**
 * Fetch remote sessions and merge with local (background operation)
 */
async function fetchAndMergeRemoteSessions(
  userId: string,
  startDate: Date,
  endDate: Date,
): Promise<void> {
  try {
    const { data, error } = await supabase
      .from("pokus_sessions")
      .select("*")
      .eq("user_id", userId)
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString());

    if (error) {
      console.error("Error fetching remote sessions:", error);
      return;
    }

    if (data) {
      for (const remoteSession of data) {
        const localSession = await getLocalSession(remoteSession.id);

        // If local doesn't exist or remote is more recent, update local
        if (!localSession) {
          await saveLocalSession({
            ...remoteSession,
            syncStatus: "SYNCED",
            lastSyncedAt: new Date().toISOString(),
          });
        } else if (localSession.syncStatus === "SYNCED") {
          // Only update from remote if local is already synced (not pending changes)
          await saveLocalSession({
            ...remoteSession,
            syncStatus: "SYNCED",
            lastSyncedAt: new Date().toISOString(),
          });
        }
      }
    }
  } catch (error) {
    console.error("Error merging remote sessions:", error);
  }
}
