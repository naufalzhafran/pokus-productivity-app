import { getSupabaseClient } from "@/lib/supabase/client";
import { clearAllData, saveLocalSession, saveLocalProject, saveLocalTask, getLocalProject } from "@/lib/sync";

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

async function populateUserProjects(userId: string): Promise<void> {
  try {
    const { data: records, error } = await supabase
      .from("projects")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching projects:", error);
      return;
    }

    for (const record of records || []) {
      const localProject = await getLocalProject(record.id);
      if (!localProject) {
        await saveLocalProject({
          ...record,
          syncStatus: "SYNCED",
          lastSyncedAt: new Date().toISOString(),
        });
      }
    }
    console.log(`Populated ${records?.length || 0} projects`);
  } catch (error) {
    console.error("Error populating user projects:", error);
  }
}

async function populateUserTasks(userId: string): Promise<void> {
  try {
    const { data: records, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching tasks:", error);
      return;
    }

    for (const record of records || []) {
      await saveLocalTask({
        id: record.id,
        user_id: record.user_id,
        project_id: record.project_id,
        title: record.title,
        description: record.description,
        duration_minutes: record.duration_minutes,
        is_completed: record.is_completed,
        completed_at: record.completed_at,
        created_at: record.created_at,
        updated_at: record.updated_at,
        syncStatus: "SYNCED",
        lastSyncedAt: new Date().toISOString(),
      });
    }
    console.log(`Populated ${records?.length || 0} tasks`);
  } catch (error) {
    console.error("Error populating user tasks:", error);
  }
}

async function syncAllUserData(userId: string): Promise<void> {
  await Promise.all([
    populateUserSessions(userId),
    populateUserProjects(userId),
    populateUserTasks(userId),
  ]);
}

export { syncAllUserData };

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
    await syncAllUserData(data.user.id);
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
