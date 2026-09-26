import { useCallback, useEffect, useRef, useState } from "react";
import { pb } from "@/lib/pocketbase";
import { readCache, writeCache } from "@/lib/offline-store";

export function useCachedResource<T>(key: string, loader: () => Promise<T[]>) {
  const owner = pb.authStore.record?.id ?? "anonymous";
  const [items, setItems] = useState<T[]>([]);
  const itemsRef = useRef<T[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [loadError, setError] = useState<string | null>(null);
  const revision = useRef(0);
  const replace = useCallback((next: T[]) => {
    revision.current += 1;
    itemsRef.current = next;
    setItems(next);
    void writeCache(owner, key, next).catch(() => setError("Device storage is unavailable. Offline viewing may be incomplete."));
  }, [key, owner]);

  useEffect(() => {
    let alive = true;
    let refreshing = false;
    const refresh = async () => {
      if (refreshing || !navigator.onLine || !pb.authStore.isValid || pb.authStore.record?.id !== owner) return;
      refreshing = true;
      const startedAt = revision.current;
      try {
        const value = await loader();
        if (alive && startedAt === revision.current) { replace(value); setError(null); }
      } catch {
        if (alive) setError(`Could not refresh ${key}. Showing saved data.`);
      } finally {
        refreshing = false;
        if (alive) setLoading(false);
      }
    };
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    void readCache<T[]>(owner, key).then((cached) => {
      if (!alive) return;
      if (cached) { itemsRef.current = cached; setItems(cached); }
      else if (!navigator.onLine) setError(`No saved ${key} on this device yet.`);
    }).catch(() => { if (alive) setError("Device storage is unavailable."); }).finally(() => {
      if (alive) { setLoading(false); void refresh(); }
    });
    window.addEventListener("online", refresh);
    window.addEventListener("pokus-workspace-refresh", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      alive = false;
      window.removeEventListener("online", refresh);
      window.removeEventListener("pokus-workspace-refresh", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [key, loader, owner, replace]);
  return { items, itemsRef, replace, isLoading, loadError };
}
