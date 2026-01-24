import { createClient } from "@/lib/supabase/client";
import { clearAllData } from "@/lib/sync";

const supabase = createClient();

export async function loginWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;
  return data;
}

export async function signUpWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) throw error;
  return data;
}

export async function logout() {
  // Clear local IndexedDB data to prevent data leakage between users
  await clearAllData();

  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
