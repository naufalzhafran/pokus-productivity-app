import { getSupabaseClient } from "@/lib/supabase/client";
import { clearAllData, saveLocalSession } from "@/lib/sync";

const supabase = getSupabaseClient();

async function populateUserSessions(userId: string): Promise<void> {
  try {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - diffToMonday);
    startOfWeek.setHours(0, 0, 0, 0);

    const { data: records, error } = await supabase
      .from("pokus_sessions")
      .select("*")
      .eq("user_id", userId)
      .gte("created_at", startOfWeek.toISOString())
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching sessions:", error);
      return;
    }

    for (const record of records || []) {
      await saveLocalSession({
        id: record.id,
        user_id: record.user_id,
        title: record.title,
        duration: record.duration,
        status: record.status,
        tags: record.tag ? [record.tag] : [],
        task_id: record.task_id,
        started_at: record.started_at,
        ended_at: record.ended_at,
        created_at: record.created_at,
        syncStatus: "SYNCED",
        lastSyncedAt: new Date().toISOString(),
      });
    }
    console.log(`Populated ${records?.length || 0} sessions from current week`);
  } catch (error) {
    console.error("Error populating user sessions:", error);
  }
}

export async function loginWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw error;
  }

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

  if (error) {
    throw error;
  }

  await clearAllData();

  return data;
}

export async function logout() {
  await clearAllData();
  await supabase.auth.signOut();
}
