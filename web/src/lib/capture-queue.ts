import { ClientResponseError } from "pocketbase";
import { pb } from "@/lib/pocketbase";
import { captureFromRecord, captureToRecord, COLLECTIONS, type CaptureRecord } from "@/lib/pocketbase-records";
import { readPending, updatePending } from "@/lib/offline-store";
import type { Capture } from "@/types/capture";

/** A capture saved on this device while offline. `previewPending` means its link preview was never looked up. */
export type QueuedCapture = Capture & { previewPending: boolean; syncError?: string };

const QUEUE = "captures";
export const readQueuedCaptures = (owner: string) => readPending<QueuedCapture>(owner, QUEUE);
export const queueCapture = (owner: string, capture: QueuedCapture) =>
  updatePending<QueuedCapture>(owner, QUEUE, (items) => [...items.filter((item) => item.id !== capture.id), capture]);
export const removeQueuedCapture = (owner: string, id: string) =>
  updatePending<QueuedCapture>(owner, QUEUE, (items) => items.filter((item) => item.id !== id));

/** True when a failed request never reached the server, so the change should stay queued. */
export function isNetworkError(error: unknown) {
  return error instanceof ClientResponseError ? error.status === 0 : error instanceof TypeError;
}

/** Creates the queued capture with its local id. A retry after a lost response finds the record instead of duplicating it. */
export async function uploadQueuedCapture(capture: QueuedCapture): Promise<Capture> {
  try {
    // The record mapper sends only stored fields, never the queue's own flags.
    return captureFromRecord(await pb.collection(COLLECTIONS.captures).create<CaptureRecord>(captureToRecord(capture), { requestKey: null }));
  } catch (error) {
    if (isNetworkError(error)) throw error;
    try { return captureFromRecord(await pb.collection(COLLECTIONS.captures).getOne<CaptureRecord>(capture.id, { requestKey: null })); }
    catch { throw error; }
  }
}

/**
 * Sends queued captures oldest first. A network or sign-in failure stops the run and keeps the rest queued;
 * a capture the server rejects stays queued with its error so later captures still sync.
 */
export async function syncQueuedCaptures(owner: string, upload: (capture: QueuedCapture) => Promise<Capture>, onSynced: (saved: Capture, queued: QueuedCapture) => void) {
  const queued = [...await readQueuedCaptures(owner)].sort((a, b) => a.createdAt - b.createdAt);
  for (const capture of queued) {
    if (capture.syncError) continue;
    try {
      const saved = await upload(capture);
      await removeQueuedCapture(owner, capture.id);
      onSynced(saved, capture);
    } catch (error) {
      if (isNetworkError(error) || (error instanceof ClientResponseError && error.status === 401)) return;
      const message = error instanceof Error ? error.message : "The server rejected this capture.";
      await updatePending<QueuedCapture>(owner, QUEUE, (items) => items.map((item) => item.id === capture.id ? { ...item, syncError: message } : item));
    }
  }
}
