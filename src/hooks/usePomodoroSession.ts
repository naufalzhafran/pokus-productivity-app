import { useCallback, useEffect, useState, type SetStateAction } from "react";
import { pb } from "@/lib/pocketbase";
import { loadCurrentSession } from "@/lib/pocketbase-records";
import { persistTransition, readTimer, restoreTimer, type TimerSnapshot } from "@/lib/offline-store";
import { getSyncState, notifyTimer, subscribeTimer, syncTimers } from "@/lib/session-sync";
import type { PomodoroSession } from "@/types/task";

export function usePomodoroSession() {
  const owner = pb.authStore.record?.id ?? "anonymous";
  const [snapshot, setSnapshot] = useState<TimerSnapshot>({ current: null, operations: [], revision: 0 });
  const [isLoading, setLoading] = useState(true);
  const [isSaving, setSaving] = useState(false);
  const [loadError, setError] = useState<string | null>(null);
  const [syncState, setSyncState] = useState(() => getSyncState(owner));

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const value = await readTimer(owner);
        if (alive) { setSnapshot(value); setSyncState(getSyncState(owner)); }
      } catch { if (alive) setError("Device storage is unavailable. A timer cannot be saved safely. Free some space and retry."); }
      finally { if (alive) setLoading(false); }
    };
    const retry = () => { if (document.visibilityState !== "hidden") void syncTimers(owner); };
    const unsubscribe = subscribeTimer(() => { void refresh(); });
    void refresh().then(async () => {
      const local = await readTimer(owner);
      if (!local.current && !local.operations.length && navigator.onLine && pb.authStore.isValid) {
        try {
          const remote = await loadCurrentSession();
          if (remote && alive) { await restoreTimer(owner, remote); await refresh(); }
        } catch { /* The local timer remains usable when the server is unavailable. */ }
      }
      if (alive) retry();
    }).catch(() => undefined);
    window.addEventListener("online", retry);
    window.addEventListener("pageshow", retry);
    document.addEventListener("visibilitychange", retry);
    const interval = window.setInterval(retry, 30_000);
    return () => {
      alive = false; unsubscribe(); window.clearInterval(interval);
      window.removeEventListener("online", retry);
      window.removeEventListener("pageshow", retry);
      document.removeEventListener("visibilitychange", retry);
    };
  }, [owner]);

  const setSession = useCallback(async (action: SetStateAction<PomodoroSession | null>) => {
    setSaving(true);
    try {
      const saved = await persistTransition(owner, action);
      setSnapshot(saved); setError(null); notifyTimer();
      void syncTimers(owner);
      return true;
    } catch {
      setError("Your timer could not be saved on this device. Free some space and retry.");
      return false;
    } finally { setSaving(false); }
  }, [owner]);
  return {
    session: snapshot.current, setSession, isLoading, isSaving, loadError,
    pending: snapshot.operations, syncState,
    retrySync: () => { void syncTimers(owner, true); },
  };
}
