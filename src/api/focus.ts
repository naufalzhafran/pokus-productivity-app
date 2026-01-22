import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

export async function createSession(title: string, duration: number) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  const { data, error } = await supabase
    .from("pokus_sessions")
    .insert({
      user_id: user.id,
      title: title,
      duration_planned: duration,
      status: "PLANNED",
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating session:", error);
    throw error;
  }

  return data;
}

export async function updateSessionStatus(
  sessionId: string,
  status: "COMPLETED" | "ABANDONED",
  actualDuration?: number,
) {
  const { error } = await supabase
    .from("pokus_sessions")
    .update({
      status,
      duration_actual: actualDuration,
      ended_at: new Date().toISOString(),
    })
    .eq("id", sessionId);

  if (error) {
    console.error("Error updating session:", error);
    throw new Error("Failed to update session");
  }
}

export async function getSessions(startDate: Date, endDate: Date) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  const { data, error } = await supabase
    .from("pokus_sessions")
    .select("*")
    .eq("user_id", user.id)
    .gte("created_at", startDate.toISOString())
    .lte("created_at", endDate.toISOString())
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching sessions:", error);
    throw error;
  }

  return data;
}
