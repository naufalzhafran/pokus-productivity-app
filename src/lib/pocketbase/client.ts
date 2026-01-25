import PocketBase from "pocketbase";

// Singleton instance - created lazily on first access
let pbClient: PocketBase | null = null;

/**
 * Get the singleton PocketBase client instance.
 * Creates the client lazily on first access and reuses it thereafter.
 * This prevents unnecessary client creation and ensures consistent auth state.
 */
export function getClient(): PocketBase {
  if (!pbClient) {
    pbClient = new PocketBase(import.meta.env.VITE_POCKETBASE_URL);
  }
  return pbClient;
}
