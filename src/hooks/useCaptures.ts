import { useCallback, useState } from "react";
import { useCachedResource } from "@/hooks/useCachedResource";
import { requireConnection } from "@/hooks/useConnectivity";
import { validateCaptureInput } from "@/lib/capture";
import { fetchLinkPreview } from "@/lib/link-preview";
import { pb } from "@/lib/pocketbase";
import { captureFromRecord, captureToRecord, COLLECTIONS, createPocketBaseId, listCaptures, type CaptureRecord } from "@/lib/pocketbase-records";
import type { Capture, CaptureInput } from "@/types/capture";

function normalize(input: CaptureInput) {
  const error = validateCaptureInput(input);
  if (error) throw new Error(error);
  return { kind: input.kind, url: input.url?.trim() || null, title: input.title.trim(), note: input.note.trim() };
}

export type CaptureStore = ReturnType<typeof useCaptures>;

export function useCaptures() {
  const { items: captures, itemsRef: ref, replace, isLoading, loadError } = useCachedResource<Capture>("captures", listCaptures);
  const [previewing, setPreviewing] = useState<ReadonlySet<string>>(() => new Set());

  const mutate = useCallback(async (id: string, changes: Partial<Capture>) => {
    requireConnection();
    const previous = ref.current.find((item) => item.id === id);
    if (!previous) return false;
    replace(ref.current.map((item) => item.id === id ? { ...item, ...changes } : item));
    try {
      const { url, ...rest } = changes;
      const record = await pb.collection(COLLECTIONS.captures).update<CaptureRecord>(id, url === undefined ? rest : { ...rest, url: url ?? "" }, { requestKey: null });
      const saved = captureFromRecord(record);
      replace(ref.current.map((item) => item.id === id ? saved : item));
      return saved;
    } catch (error) {
      replace(ref.current.map((item) => item.id === id ? previous : item));
      throw error;
    }
  }, [replace, ref]);

  const refreshPreview = useCallback(async (id: string, url: string) => {
    setPreviewing((current) => new Set(current).add(id));
    try {
      const preview = await fetchLinkPreview(url);
      if (preview && ref.current.find((item) => item.id === id)?.url === url) await mutate(id, { preview });
      return Boolean(preview);
    } finally {
      setPreviewing((current) => { const next = new Set(current); next.delete(id); return next; });
    }
  }, [mutate, ref]);

  const createCapture = useCallback(async (input: CaptureInput, { isProcessed = false } = {}) => {
    requireConnection();
    const capture: Capture = { id: createPocketBaseId(), ...normalize(input), preview: input.preview ?? null, isProcessed, createdAt: Date.now(), updatedAt: Date.now() };
    const record = await pb.collection(COLLECTIONS.captures).create<CaptureRecord>(captureToRecord(capture), { requestKey: null });
    const saved = captureFromRecord(record);
    replace([saved, ...ref.current]);
    // `undefined` means the preview was never looked up, so fetch it in the background.
    if (saved.url && input.preview === undefined) void refreshPreview(saved.id, saved.url).catch(() => undefined);
    return saved;
  }, [refreshPreview, replace, ref]);

  const updateCapture = useCallback(async (id: string, input: CaptureInput) => {
    const changes = normalize(input);
    const urlChanged = ref.current.find((item) => item.id === id)?.url !== changes.url;
    const saved = await mutate(id, urlChanged ? { ...changes, preview: null } : changes);
    if (saved && urlChanged && saved.url) void refreshPreview(id, saved.url).catch(() => undefined);
    return saved;
  }, [mutate, refreshPreview, ref]);

  const setCaptureProcessed = useCallback((id: string, isProcessed: boolean) => mutate(id, { isProcessed }), [mutate]);

  const deleteCapture = useCallback(async (id: string) => {
    requireConnection();
    const previous = ref.current.find((item) => item.id === id);
    if (!previous) return false;
    replace(ref.current.filter((item) => item.id !== id));
    try { await pb.collection(COLLECTIONS.captures).delete(id); return true; }
    catch (error) { replace([...ref.current, previous].sort((a, b) => b.createdAt - a.createdAt)); throw error; }
  }, [replace, ref]);

  return { captures, previewing, isLoading, loadError, createCapture, updateCapture, refreshPreview, setCaptureProcessed, deleteCapture };
}
