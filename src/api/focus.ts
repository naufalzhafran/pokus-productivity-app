import { getSupabaseClient } from "@/lib/supabase/client";
import {
  saveLocalSession,
  updateLocalSession,
  getLocalSession,
  getLocalSessionsByUserAndDateRange,
  LocalSession,
  addToSyncQueue,
} from "@/lib/sync";

const supabase = getSupabaseClient();

const GUEST_USER_ID = "guest";

export async function getCurrentUserId(): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function createSession(
  title: string,
  duration: number,
  tags: string[] = [],
  taskId?: string,
): Promise<LocalSession> {
  const userId = await getCurrentUserId();

  const sessionId = crypto.randomUUID();
  const now = new Date().toISOString();
  const finalUserId = userId ?? GUEST_USER_ID;
  const isGuest = !userId;

  const localSession: LocalSession = {
    id: sessionId,
    user_id: finalUserId,
    title: title,
    duration: duration,
    status: "PLANNED",
    tags: tags,
    task_id: taskId,
    created_at: now,
    syncStatus: isGuest ? "SYNCED" : "PENDING",
  };

  await saveLocalSession(localSession);

  if (!isGuest) {
    addToSyncQueue({
      type: "CREATE",
      table: "pokus_sessions",
      data: {
        id: sessionId,
        user_id: finalUserId,
        title: title,
        duration: duration,
        status: "PLANNED",
        tag: tags[0] || null,
        task_id: taskId || null,
      },
    });
  }

  return localSession;
}

export async function updateSessionStatus(
  sessionId: string,
  status: "COMPLETED" | "ABANDONED",
  actualDuration?: number,
): Promise<void> {
  const endedAt = new Date().toISOString();

  const session = await getLocalSession(sessionId);
  const isGuest = session?.user_id === GUEST_USER_ID;

  await updateLocalSession(sessionId, {
    status,
    duration: actualDuration,
    ended_at: endedAt,
  });

  if (!isGuest) {
    addToSyncQueue({
      type: "UPDATE",
      table: "pokus_sessions",
      data: {
        id: sessionId,
        status,
        duration: actualDuration,
        ended_at: endedAt,
      },
    });
  }
}

export async function getSessions(
  startDate: Date,
  endDate: Date,
): Promise<LocalSession[]> {
  const userId = await getCurrentUserId();
  const userIdToUse = userId ?? GUEST_USER_ID;

  const localSessions = await getLocalSessionsByUserAndDateRange(
    userIdToUse,
    startDate,
    endDate,
  );

  if (userId && navigator.onLine) {
    fetchAndMergeRemoteSessions(userId, startDate, endDate);
  }

  return localSessions.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

export async function fetchSessionsFromRemote(
  userId: string,
  startDate: Date,
  endDate: Date,
): Promise<LocalSession[]> {
  try {
    const { data: records, error } = await supabase
      .from("pokus_sessions")
      .select("*")
      .eq("user_id", userId)
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString())
      .abortSignal(AbortSignal.timeout(5000));

    if (error) {
      console.error("Error fetching remote sessions:", error);
      return [];
    }

    const sessions: LocalSession[] = [];
    for (const remoteSession of records || []) {
      const localSession = await getLocalSession(remoteSession.id);

      if (!localSession) {
        await saveLocalSession({
          id: remoteSession.id,
          user_id: remoteSession.user_id,
          title: remoteSession.title,
          duration: remoteSession.duration,
          status: remoteSession.status,
          tags: remoteSession.tag ? [remoteSession.tag] : [],
          task_id: remoteSession.task_id,
          started_at: remoteSession.started_at,
          ended_at: remoteSession.ended_at,
          created_at: remoteSession.created_at,
          syncStatus: "SYNCED",
          lastSyncedAt: new Date().toISOString(),
        });
        sessions.push(remoteSession as LocalSession);
      } else if (localSession.syncStatus === "SYNCED") {
        await saveLocalSession({
          id: remoteSession.id,
          user_id: remoteSession.user_id,
          title: remoteSession.title,
          duration: remoteSession.duration,
          status: remoteSession.status,
          tags: remoteSession.tag ? [remoteSession.tag] : [],
          task_id: remoteSession.task_id,
          started_at: remoteSession.started_at,
          ended_at: remoteSession.ended_at,
          created_at: remoteSession.created_at,
          syncStatus: "SYNCED",
          lastSyncedAt: new Date().toISOString(),
        });
        sessions.push(remoteSession as LocalSession);
      }
    }
    return sessions;
  } catch (error) {
    console.error("Error merging remote sessions:", error);
    return [];
  }
}

async function fetchAndMergeRemoteSessions(
  userId: string,
  startDate: Date,
  endDate: Date,
): Promise<void> {
  await fetchSessionsFromRemote(userId, startDate, endDate);
}
