import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCachedResource } from "@/hooks/useCachedResource";
import { requireConnection } from "@/hooks/useConnectivity";
import { validateCaptureInput } from "@/lib/capture";
import { fetchLinkPreview } from "@/lib/link-preview";
import { pb } from "@/lib/pocketbase";
import { captureFromRecord, captureToRecord, COLLECTIONS, createPocketBaseId, listCaptures, type CaptureRecord } from "@/lib/pocketbase-records";
import type { Capture, CaptureInput } from "@/types/capture";
import { validReminderAt } from "@/lib/calendar";
import { claimCaptureReminder } from "@/lib/offline-store";
import { isNetworkError, queueCapture, readQueuedCaptures, removeQueuedCapture, syncQueuedCaptures, uploadQueuedCapture, type QueuedCapture } from "@/lib/capture-queue";

function normalize(input: CaptureInput) {
  const error = validateCaptureInput(input);
  if (error) throw new Error(error);
  return { kind: input.kind, url: input.url?.trim() || null, title: input.title.trim(), note: input.note.trim(), author: input.kind === "book" ? input.author?.trim() ?? "" : "" };
}

export type CaptureStore = ReturnType<typeof useCaptures>;

export function useCaptures() {
  const owner = pb.authStore.record?.id ?? "anonymous";
  const { items: saved, itemsRef: ref, replace, isLoading, loadError } = useCachedResource<Capture>("captures", listCaptures);
  const [queued, setQueued] = useState<QueuedCapture[]>([]);
  const syncing = useRef(false);
  const [previewing, setPreviewing] = useState<ReadonlySet<string>>(() => new Set());
  const writes = useRef(new Map<string, Promise<unknown>>());

  const enqueue = useCallback(<T,>(id: string, write: () => Promise<T>): Promise<T> => {
    const owner = pb.authStore.record?.id;
    const pending = (writes.current.get(id) ?? Promise.resolve()).catch(() => undefined).then(() => {
      requireConnection();
      if (pb.authStore.record?.id !== owner) throw new Error("Your account changed. Try again from the current account.");
      return write();
    });
    writes.current.set(id, pending);
    const cleanup = () => { if (writes.current.get(id) === pending) writes.current.delete(id); };
    void pending.then(cleanup, cleanup);
    return pending;
  }, []);

  const mutate = useCallback((id: string, change: Partial<Capture> | ((current: Capture) => Partial<Capture> | null | Promise<Partial<Capture> | null>)) => enqueue(id, async () => {
    const owner = pb.authStore.record?.id;
    const previous = ref.current.find((item) => item.id === id);
    if (!previous) return false;
    const changes = typeof change === "function" ? await change(previous) : change;
    if (!changes) return previous;
    requireConnection();
    if (pb.authStore.record?.id !== owner) throw new Error("Your account changed. Try again from the current account.");
    replace(ref.current.map((item) => item.id === id ? { ...item, ...changes } : item));
    try {
      const { url, reminderAt, ...rest } = changes;
      const record = await pb.collection(COLLECTIONS.captures).update<CaptureRecord>(id, {
        ...rest,
        ...(url === undefined ? {} : { url: url ?? "" }),
        ...(reminderAt === undefined ? {} : { reminderAt: reminderAt ?? 0 }),
      }, { requestKey: null });
      const saved = captureFromRecord(record);
      replace(ref.current.map((item) => item.id === id ? saved : item));
      return saved;
    } catch (error) {
      replace(ref.current.map((item) => item.id === id ? previous : item));
      throw error;
    }
  }), [enqueue, replace, ref]);

  const refreshPreview = useCallback(async (id: string, url: string) => {
    setPreviewing((current) => new Set(current).add(id));
    try {
      const preview = await fetchLinkPreview(url);
      if (preview) await mutate(id, (current) => current.url === url ? { preview } : null);
      return Boolean(preview);
    } finally {
      setPreviewing((current) => { const next = new Set(current); next.delete(id); return next; });
    }
  }, [mutate]);

  const addSaved = useCallback((capture: Capture, previewPending: boolean) => {
    replace([capture, ...ref.current.filter((item) => item.id !== capture.id)].sort((a, b) => b.createdAt - a.createdAt));
    // A preview that was never looked up is fetched in the background.
    if (capture.url && previewPending) void refreshPreview(capture.id, capture.url).catch(() => undefined);
  }, [refreshPreview, replace, ref]);

  /** Sends captures saved offline once this account can reach the server again. */
  const syncQueue = useCallback(async () => {
    if (syncing.current || !navigator.onLine || !pb.authStore.isValid || pb.authStore.record?.id !== owner) return;
    syncing.current = true;
    try { await syncQueuedCaptures(owner, uploadQueuedCapture, (capture, item) => addSaved(capture, item.previewPending)); }
    catch { /* Device storage is unavailable; the next trigger retries. */ }
    finally {
      syncing.current = false;
      setQueued(await readQueuedCaptures(owner).catch(() => []));
    }
  }, [addSaved, owner]);

  useEffect(() => {
    let alive = true;
    void readQueuedCaptures(owner).then((items) => { if (alive) setQueued(items); }).catch(() => undefined).finally(() => { if (alive) void syncQueue(); });
    const retry = () => { if (document.visibilityState !== "hidden") void syncQueue(); };
    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", retry);
    const unsubscribe = pb.authStore.onChange(retry);
    return () => { alive = false; window.removeEventListener("online", retry); document.removeEventListener("visibilitychange", retry); unsubscribe(); };
  }, [owner, syncQueue]);

  /** Online captures save right away; offline (or signed-out) captures are queued on this device. */
  const createCapture = useCallback(async (input: CaptureInput, { isProcessed = false } = {}): Promise<Capture> => {
    const capture: Capture = { id: createPocketBaseId(), ...normalize(input), preview: input.preview ?? null, isProcessed, reminderAt: null, reminderDone: false, createdAt: Date.now(), updatedAt: Date.now() };
    const previewPending = input.preview === undefined;
    if (navigator.onLine && pb.authStore.isValid) {
      try {
        const record = await pb.collection(COLLECTIONS.captures).create<CaptureRecord>(captureToRecord(capture), { requestKey: null });
        const created = captureFromRecord(record);
        addSaved(created, previewPending);
        return created;
      } catch (error) { if (!isNetworkError(error)) throw error; }
    }
    if (!pb.authStore.record) throw new Error("Sign in to capture.");
    setQueued(await queueCapture(pb.authStore.record.id, { ...capture, previewPending }));
    return { ...capture, syncState: "pending" };
  }, [addSaved]);

  const updateCapture = useCallback(async (id: string, input: CaptureInput) => {
    const changes = normalize(input);
    let urlChanged = false;
    const saved = await mutate(id, (current) => {
      urlChanged = current.url !== changes.url;
      return urlChanged ? { ...changes, preview: null } : changes;
    });
    if (saved && urlChanged && saved.url) void refreshPreview(id, saved.url).catch(() => undefined);
    return saved;
  }, [mutate, refreshPreview]);

  const setCaptureProcessed = useCallback((id: string, isProcessed: boolean) => mutate(id, { isProcessed }), [mutate]);

  const setCaptureReminder = useCallback(async (id: string, reminderAt: number | null) => {
    return mutate(id, () => {
      if (reminderAt !== null && (!validReminderAt(reminderAt) || reminderAt <= Date.now())) throw new Error("Choose a valid reminder date and time in the future.");
      return { reminderAt, reminderDone: false };
    });
  }, [mutate]);

  const setCaptureReminderDone = useCallback((id: string, reminderDone: boolean) => mutate(id, async (capture) => {
    if (!validReminderAt(capture.reminderAt)) return null;
    if (!reminderDone && capture.reminderDone && capture.reminderAt <= Date.now()) {
      // Reopening old work is a status change, not a new alert schedule.
      await claimCaptureReminder(pb.authStore.record!.id, capture.id, capture.reminderAt);
    }
    return { reminderDone };
  }), [mutate]);

  const deleteSaved = useCallback((id: string) => enqueue(id, async () => {
    const previous = ref.current.find((item) => item.id === id);
    if (!previous) return false;
    replace(ref.current.filter((item) => item.id !== id));
    try { await pb.collection(COLLECTIONS.captures).delete(id); return true; }
    catch (error) { replace([...ref.current, previous].sort((a, b) => b.createdAt - a.createdAt)); throw error; }
  }), [enqueue, replace, ref]);

  const deleteCapture = useCallback(async (id: string) => {
    // A capture that never left this device is removed locally, even offline.
    if (queued.some((item) => item.id === id)) { setQueued(await removeQueuedCapture(owner, id)); return true; }
    return deleteSaved(id);
  }, [deleteSaved, owner, queued]);

  const captures = useMemo<Capture[]>(() => {
    if (!queued.length) return saved;
    const savedIds = new Set(saved.map((item) => item.id));
    return [...queued.filter((item) => !savedIds.has(item.id)).sort((a, b) => b.createdAt - a.createdAt).map((item) => ({ ...item, syncState: item.syncError ? "failed" as const : "pending" as const })), ...saved];
  }, [queued, saved]);

  return { captures, previewing, isLoading, loadError, createCapture, updateCapture, refreshPreview, setCaptureProcessed, setCaptureReminder, setCaptureReminderDone, deleteCapture };
}
