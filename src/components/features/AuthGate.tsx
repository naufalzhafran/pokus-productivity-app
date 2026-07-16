import { useEffect, useState, type ReactNode } from "react";
import type { RecordModel } from "pocketbase";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { LoginForm } from "@/components/features/LoginForm";
import { AUTH_COLLECTION, pb } from "@/lib/pocketbase";

let authRefreshPromise: Promise<void> | null = null;

function refreshSavedSession() {
  if (!pb.authStore.isValid) {
    pb.authStore.clear();
    return Promise.resolve();
  }

  if (!authRefreshPromise) {
    authRefreshPromise = pb
      .collection(AUTH_COLLECTION)
      .authRefresh()
      .then(() => undefined)
      .catch(() => {
        pb.authStore.clear();
      })
      .finally(() => {
        authRefreshPromise = null;
      });
  }

  return authRefreshPromise;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [authRecord, setAuthRecord] = useState<RecordModel | null>(() =>
    pb.authStore.isValid ? pb.authStore.record : null,
  );
  const [isRestoring, setIsRestoring] = useState(pb.authStore.isValid);

  useEffect(() => {
    let isMounted = true;
    const unsubscribe = pb.authStore.onChange((_token, record) => {
      if (isMounted) {
        setAuthRecord(pb.authStore.isValid ? record : null);
      }
    });

    if (pb.authStore.isValid) {
      void refreshSavedSession().finally(() => {
        if (isMounted) setIsRestoring(false);
      });
    }

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  if (isRestoring) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-5 text-foreground">
        <div className="flex w-full max-w-sm flex-col items-center gap-3 text-center" role="status">
          <Badge>Pokus</Badge>
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-40 w-full" />
          <span className="sr-only">Restoring your session…</span>
        </div>
      </main>
    );
  }

  if (!authRecord) return <LoginForm />;

  return children;
}
