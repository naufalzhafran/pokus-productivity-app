"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function createSession(formData: FormData) {
  const supabase = await createClient();

  const title = formData.get("title") as string;
  const duration = parseInt(formData.get("duration") as string) || 25;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
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
    // Handle error (could redirect to error page or return state if using useFormState)
    return;
  }

  revalidatePath("/dashboard");
  redirect(`/focus/${data.id}`);
}
