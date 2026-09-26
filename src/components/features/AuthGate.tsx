import { useEffect, useState, type ReactNode } from "react";
import { ClientResponseError, type RecordAuthResponse } from "pocketbase";
import { LoginForm } from "@/components/features/LoginForm";
import { AUTH_COLLECTION, pb } from "@/lib/pocketbase";

let authRefreshPromise: Promise<void> | null = null;
function refreshSavedSession() {
  if (!navigator.onLine || !pb.authStore.isValid) return Promise.resolve();
  const owner = pb.authStore.record?.id;
  const token = pb.authStore.token;
  authRefreshPromise ??= pb.send<RecordAuthResponse>(`/api/collections/${AUTH_COLLECTION}/auth-refresh`, { method: "POST" })
    .then((auth) => {
      // A refresh started before sign-out must not unlock the account again.
      if (pb.authStore.record?.id === owner && pb.authStore.token === token) pb.authStore.save(auth.token, auth.record);
    })
    .catch((error: unknown) => {
      if (error instanceof ClientResponseError && (error.status === 401 || error.status === 403) && pb.authStore.record?.id === owner) pb.authStore.clear();
    })
    .finally(() => { authRefreshPromise = null; });
  return authRefreshPromise;
}

interface AuthGateProps {
  children: ReactNode;
  preloadAuthenticatedApp?: () => Promise<unknown>;
}
export function AuthGate({ children, preloadAuthenticatedApp }: AuthGateProps) {
  const [record, setRecord] = useState(() => pb.authStore.record);
  useEffect(() => {
    const unsubscribe = pb.authStore.onChange((_token, record) => setRecord(record));
    if (pb.authStore.record) {
      void preloadAuthenticatedApp?.();
      void refreshSavedSession();
    }
    const refresh = () => { if (document.visibilityState !== "hidden") void refreshSavedSession(); };
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { unsubscribe(); window.removeEventListener("online", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [preloadAuthenticatedApp]);
  if (!record) return <LoginForm />;
  return <div key={record.id}>{children}</div>;
}
