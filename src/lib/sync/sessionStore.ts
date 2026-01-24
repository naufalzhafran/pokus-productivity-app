import { getDB, LocalSession } from "./db";

/**
 * Get all sessions from local storage
 */
export async function getAllLocalSessions(): Promise<LocalSession[]> {
  const db = await getDB();
  return db.getAll("sessions");
}

/**
 * Get a single session by ID
 */
export async function getLocalSession(
  id: string,
): Promise<LocalSession | undefined> {
  const db = await getDB();
  return db.get("sessions", id);
}

/**
 * Save a session to local storage
 */
export async function saveLocalSession(session: LocalSession): Promise<void> {
  const db = await getDB();
  await db.put("sessions", session);
}

/**
 * Update a session in local storage
 */
export async function updateLocalSession(
  id: string,
  updates: Partial<LocalSession>,
): Promise<LocalSession | undefined> {
  const db = await getDB();
  const existing = await db.get("sessions", id);

  if (!existing) {
    return undefined;
  }

  const updated: LocalSession = {
    ...existing,
    ...updates,
    syncStatus: "PENDING", // Mark as pending sync
  };

  await db.put("sessions", updated);
  return updated;
}

/**
 * Delete a session from local storage
 */
export async function deleteLocalSession(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("sessions", id);
}

/**
 * Get all sessions that need syncing
 */
export async function getPendingSessions(): Promise<LocalSession[]> {
  const db = await getDB();
  return db.getAllFromIndex("sessions", "by-sync-status", "PENDING");
}

/**
 * Mark a session as synced
 */
export async function markSessionSynced(id: string): Promise<void> {
  const db = await getDB();
  const session = await db.get("sessions", id);

  if (session) {
    session.syncStatus = "SYNCED";
    session.lastSyncedAt = new Date().toISOString();
    await db.put("sessions", session);
  }
}

/**
 * Mark a session sync as failed
 */
export async function markSessionFailed(id: string): Promise<void> {
  const db = await getDB();
  const session = await db.get("sessions", id);

  if (session) {
    session.syncStatus = "FAILED";
    await db.put("sessions", session);
  }
}

/**
 * Get sessions within a date range from local storage
 */
export async function getLocalSessionsByDateRange(
  startDate: Date,
  endDate: Date,
): Promise<LocalSession[]> {
  const db = await getDB();
  const allSessions = await db.getAll("sessions");

  return allSessions.filter((session) => {
    const createdAt = new Date(session.created_at);
    return createdAt >= startDate && createdAt <= endDate;
  });
}
