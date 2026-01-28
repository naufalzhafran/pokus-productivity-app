import { getClient } from "@/lib/pocketbase/client";
import { clearAllData, saveLocalSession } from "@/lib/sync";

const pb = getClient();

/**
 * Fetch user's sessions from PocketBase and populate IndexedDB
 * Only fetches current week's data to reduce initial load
 */
async function populateUserSessions(userId: string): Promise<void> {
  try {
    // Calculate start of current week (Monday)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - diffToMonday);
    startOfWeek.setHours(0, 0, 0, 0);

    const records = await pb.collection("pokus_sessions").getFullList({
      filter: `user_id.id = "${userId}" && created >= "${startOfWeek.toISOString()}"`,
      sort: "-created",
      expand: "user_id",
    });

    for (const record of records) {
      await saveLocalSession({
        id: record.id,
        user_id: record.user_id,
        title: record.title,
        duration_planned: record.duration_planned,
        duration_actual: record.duration_actual,
        status: record.status,
        tags: record.tags || [],
        started_at: record.started_at,
        ended_at: record.ended_at,
        created_at: record.created,
        syncStatus: "SYNCED",
        lastSyncedAt: new Date().toISOString(),
      });
    }
    console.log(`Populated ${records.length} sessions from current week`);
  } catch (error) {
    console.error("Error populating user sessions:", error);
  }
}

export async function loginWithEmail(email: string, password: string) {
  const authData = await pb
    .collection("users")
    .authWithPassword(email, password);

  // Clear any guest data and populate with logged-in user's data
  await clearAllData();
  if (authData.record) {
    await populateUserSessions(authData.record.id);
  }

  return authData;
}

export async function signUpWithEmail(email: string, password: string) {
  // Create the user
  await pb.collection("users").create({
    email,
    password,
    passwordConfirm: password,
  });

  // Auto-login after signup
  const authData = await pb
    .collection("users")
    .authWithPassword(email, password);

  // Clear any guest data (new user won't have any sessions yet)
  await clearAllData();

  return authData;
}

export async function logout() {
  // Clear local IndexedDB data to prevent data leakage between users
  await clearAllData();

  pb.authStore.clear();
}
