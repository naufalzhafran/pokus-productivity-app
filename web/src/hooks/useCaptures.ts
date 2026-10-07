import { useCallback, useRef, useState } from "react";
import { useCachedResource } from "@/hooks/useCachedResource";
import { requireConnection } from "@/hooks/useConnectivity";
import { validateCaptureInput } from "@/lib/capture";
import { fetchLinkPreview } from "@/lib/link-preview";
import { pb } from "@/lib/pocketbase";
import { captureFromRecord, captureToRecord, COLLECTIONS, createPocketBaseId, listCaptures, type CaptureRecord } from "@/lib/pocketbase-records";
import type { Capture, CaptureInput } from "@/types/capture";
import { validReminderAt } from "@/lib/calendar";
import { claimCaptureReminder } from "@/lib/offline-store";

function normalize(input: CaptureInput) {
  const error = validateCaptureInput(input);
  if (error) throw new Error(error);
  return { kind: input.kind, url: input.url?.trim() || null, title: input.title.trim(), note: input.note.trim(), author: input.kind === "book" ? input.author?.trim() ?? "" : "" };
}

export type CaptureStore = ReturnType<typeof useCaptures>;

export function useCaptures() {
  const { items: captures, itemsRef: ref, replace, isLoading, loadError } = useCachedResource<Capture>("captures", listCaptures);
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

  const createCapture = useCallback(async (input: CaptureInput, { isProcessed = false } = {}) => {
    requireConnection();
    const capture: Capture = { id: createPocketBaseId(), ...normalize(input), preview: input.preview ?? null, isProcessed, reminderAt: null, reminderDone: false, createdAt: Date.now(), updatedAt: Date.now() };
    const record = await pb.collection(COLLECTIONS.captures).create<CaptureRecord>(captureToRecord(capture), { requestKey: null });
    const saved = captureFromRecord(record);
    replace([saved, ...ref.current]);
    // `undefined` means the preview was never looked up, so fetch it in the background.
    if (saved.url && input.preview === undefined) void refreshPreview(saved.id, saved.url).catch(() => undefined);
    return saved;
  }, [refreshPreview, replace, ref]);

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

  const deleteCapture = useCallback((id: string) => enqueue(id, async () => {
    const previous = ref.current.find((item) => item.id === id);
    if (!previous) return false;
    replace(ref.current.filter((item) => item.id !== id));
    try { await pb.collection(COLLECTIONS.captures).delete(id); return true; }
    catch (error) { replace([...ref.current, previous].sort((a, b) => b.createdAt - a.createdAt)); throw error; }
  }), [enqueue, replace, ref]);

  return { captures, previewing, isLoading, loadError, createCapture, updateCapture, refreshPreview, setCaptureProcessed, setCaptureReminder, setCaptureReminderDone, deleteCapture };
}
