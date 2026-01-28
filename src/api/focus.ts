import { getClient } from "@/lib/pocketbase/client";
import {
  saveLocalSession,
  updateLocalSession,
  getLocalSession,
  getLocalSessionsByDateRange,
  LocalSession,
  addToSyncQueue,
} from "@/lib/sync";

const pb = getClient();

// Special user ID for guest (non-logged-in) users
const GUEST_USER_ID = "guest";

/**
 * Create a session locally first, then sync to PocketBase in background
 * For guest users, only saves locally (no sync)
 */
export async function createSession(
  title: string,
  duration: number,
  tags: string[] = [],
): Promise<LocalSession> {
  const user = pb.authStore.record;

  // Generate UUID client-side for consistent ID between local and remote
  const sessionId = crypto.randomUUID();
  const now = new Date().toISOString();
  const userId = user?.id ?? GUEST_USER_ID;
  const isGuest = !user;

  const localSession: LocalSession = {
    id: sessionId,
    user_id: userId,
    title: title,
    duration_planned: duration,
    status: "PLANNED",
    tags: tags,
    created_at: now,
    // Guest sessions are marked as "SYNCED" since they won't sync
    syncStatus: isGuest ? "SYNCED" : "PENDING",
  };

  // Save to local storage immediately
  await saveLocalSession(localSession);

  // Only queue sync for authenticated users
  if (!isGuest) {
    addToSyncQueue({
      type: "CREATE",
      table: "pokus_sessions",
      data: {
        id: sessionId,
        user_id: userId,
        title: title,
        duration_planned: duration,
        status: "PLANNED",
        tags: tags,
      },
    });
  }

  return localSession;
}

/**
 * Update session status locally first, then sync to PocketBase in background
 * For guest users, only updates locally (no sync)
 */
export async function updateSessionStatus(
  sessionId: string,
  status: "COMPLETED" | "ABANDONED",
  actualDuration?: number,
): Promise<void> {
  const endedAt = new Date().toISOString();

  // Check if this is a guest session
  const session = await getLocalSession(sessionId);
  const isGuest = session?.user_id === GUEST_USER_ID;

  // Update local storage immediately
  await updateLocalSession(sessionId, {
    status,
    duration_actual: actualDuration,
    ended_at: endedAt,
  });

  // Only queue sync for authenticated users' sessions
  if (!isGuest) {
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
}

/**
 * Get sessions - returns local data first
 * For authenticated users, also syncs with remote in background
 */
export async function getSessions(
  startDate: Date,
  endDate: Date,
): Promise<LocalSession[]> {
  const user = pb.authStore.record;

  // Get local sessions first (instant)
  const localSessions = await getLocalSessionsByDateRange(startDate, endDate);

  // Filter by current user (or guest)
  const userId = user?.id ?? GUEST_USER_ID;
  const userSessions = localSessions.filter((s) => s.user_id === userId);

  // If authenticated and online, fetch remote and merge in background
  if (user && navigator.onLine) {
    fetchAndMergeRemoteSessions(user.id, startDate, endDate);
  }

  return userSessions.sort(
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
    const records = await pb.collection("pokus_sessions").getFullList({
      filter: `user_id.id = "${userId}" && created >= "${startDate.toISOString()}" && created <= "${endDate.toISOString()}"`,
      expand: "user_id",
    });

    for (const remoteSession of records) {
      const localSession = await getLocalSession(remoteSession.id);

      // If local doesn't exist or remote is more recent, update local
      if (!localSession) {
        await saveLocalSession({
          id: remoteSession.id,
          user_id: remoteSession.user_id,
          title: remoteSession.title,
          duration_planned: remoteSession.duration_planned,
          duration_actual: remoteSession.duration_actual,
          status: remoteSession.status,
          tags: remoteSession.tags || [],
          started_at: remoteSession.started_at,
          ended_at: remoteSession.ended_at,
          created_at: remoteSession.created,
          syncStatus: "SYNCED",
          lastSyncedAt: new Date().toISOString(),
        });
      } else if (localSession.syncStatus === "SYNCED") {
        // Only update from remote if local is already synced (not pending changes)
        await saveLocalSession({
          id: remoteSession.id,
          user_id: remoteSession.user_id,
          title: remoteSession.title,
          duration_planned: remoteSession.duration_planned,
          duration_actual: remoteSession.duration_actual,
          status: remoteSession.status,
          tags: remoteSession.tags || [],
          started_at: remoteSession.started_at,
          ended_at: remoteSession.ended_at,
          created_at: remoteSession.created,
          syncStatus: "SYNCED",
          lastSyncedAt: new Date().toISOString(),
        });
      }
    }
  } catch (error) {
    console.error("Error merging remote sessions:", error);
  }
}
