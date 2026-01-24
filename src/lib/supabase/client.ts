import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// Singleton instance - created lazily on first access
let supabaseClient: SupabaseClient | null = null;

/**
 * Get the singleton Supabase client instance.
 * Creates the client lazily on first access and reuses it thereafter.
 * This prevents unnecessary client creation and ensures consistent auth state.
 */
export function getClient(): SupabaseClient {
  if (!supabaseClient) {
    supabaseClient = createBrowserClient(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_ANON_KEY,
    );
  }
  return supabaseClient;
}

/**
 * @deprecated Use getClient() instead for singleton pattern
 */
export function createClient(): SupabaseClient {
  return getClient();
}
