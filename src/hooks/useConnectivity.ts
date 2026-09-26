import { useSyncExternalStore } from "react";
import { pb } from "@/lib/pocketbase";

function subscribe(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  const unsubscribe = pb.authStore.onChange(listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
    unsubscribe();
  };
}
export function useConnectivity() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  const authenticated = useSyncExternalStore(subscribe, () => pb.authStore.isValid, () => false);
  return { online, canEdit: online && authenticated };
}
export function requireConnection() {
  if (!navigator.onLine) throw new Error("Connect to the internet to edit your workspace.");
  if (!pb.authStore.isValid) throw new Error("Sign in again to save workspace changes.");
}
