import { createClient } from "@/lib/supabase/client";
import { clearAllData, saveLocalSession } from "@/lib/sync";

const supabase = createClient();

/**
 * Fetch user's sessions from Supabase and populate IndexedDB
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

    const { data, error } = await supabase
      .from("pokus_sessions")
      .select("*")
      .eq("user_id", userId)
      .gte("created_at", startOfWeek.toISOString())
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching user sessions:", error);
      return;
    }

    if (data) {
      for (const session of data) {
        await saveLocalSession({
          ...session,
          syncStatus: "SYNCED",
          lastSyncedAt: new Date().toISOString(),
        });
      }
      console.log(`Populated ${data.length} sessions from current week`);
    }
  } catch (error) {
    console.error("Error populating user sessions:", error);
  }
}

export async function loginWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;

  // Clear any guest data and populate with logged-in user's data
  await clearAllData();
  if (data.user) {
    await populateUserSessions(data.user.id);
  }

  return data;
}

export async function signUpWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) throw error;

  // Clear any guest data (new user won't have any sessions yet)
  await clearAllData();

  return data;
}

export async function logout() {
  // Clear local IndexedDB data to prevent data leakage between users
  await clearAllData();

  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
