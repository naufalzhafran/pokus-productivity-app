import { ClientResponseError } from "pocketbase";
import { pb } from "@/lib/pocketbase";
import { COLLECTIONS, sessionFromRecord, type PomodoroSessionRecord } from "@/lib/pocketbase-records";
import { acknowledgeOperation, readTimer, type SessionOperation, type StoredSession } from "@/lib/offline-store";

export interface SyncState { syncing: boolean; error: string | null }
const statuses = new Map<string, SyncState>();
const activeSyncs = new Map<string, Promise<void>>();
const failures = new Map<string, { attempts: number; retryAt: number }>();
let channel: BroadcastChannel | undefined;

export function getSyncState(owner: string): SyncState {
  return statuses.get(owner) ?? { syncing: false, error: null };
}
function broadcast() {
  if (typeof BroadcastChannel !== "undefined" && !channel) {
    channel = new BroadcastChannel("pokus-timer");
    channel.onmessage = () => window.dispatchEvent(new Event("pokus-timer-change"));
  }
  return channel;
}
export function notifyTimer() {
  window.dispatchEvent(new Event("pokus-timer-change"));
  broadcast()?.postMessage("changed");
}
export function subscribeTimer(listener: () => void) {
  broadcast();
  window.addEventListener("pokus-timer-change", listener);
  return () => window.removeEventListener("pokus-timer-change", listener);
}
function setStatus(owner: string, status: SyncState) {
  statuses.set(owner, status);
  notifyTimer();
}
const isMissing = (error: unknown) => error instanceof ClientResponseError && error.status === 404;
async function remoteSession(id: string): Promise<StoredSession | null> {
  try {
    const record = await pb.collection(COLLECTIONS.sessions).getOne<PomodoroSessionRecord>(id, { requestKey: null });
    return record.mode === "discarded" ? { ...record, taskId: record.task || null, mode: "discarded" } : sessionFromRecord(record);
  } catch (error) { if (isMissing(error)) return null; throw error; }
}
async function taskExists(id: string) {
  try { await pb.collection(COLLECTIONS.tasks).getOne(id, { requestKey: null, fields: "id" }); return true; }
  catch (error) { if (isMissing(error)) return false; throw error; }
}

export async function sendSessionOperation(owner: string, operation: SessionOperation): Promise<StoredSession> {
  if (pb.authStore.record?.id !== owner || !pb.authStore.isValid) throw new Error("Sign in again to sync your saved sessions.");
  const session = operation.session;
  const existing = await remoteSession(session.id);
  // Historical completions without receipts must never be credited a second time.
  if (existing && existing.mode !== "running") return existing;
  let taskId = session.taskId;
  if (taskId && !(await taskExists(taskId))) taskId = null;
  const makeRecord = () => ({
    id: session.id, owner, task: taskId ?? "", durationMinutes: session.durationMinutes,
    mode: session.mode, remainingSeconds: session.remainingSeconds,
    isActive: session.isActive, lastTick: session.lastTick,
  });
  const send = async () => {
    const batch = pb.createBatch();
    batch.collection(COLLECTIONS.sessions).upsert(makeRecord());
    if (session.mode === "complete") {
      const seconds = Math.max(0, Math.floor(session.durationMinutes * 60 - session.remainingSeconds));
      batch.collection("pomodoro_completion_receipts").create({
        id: session.id, owner, session: session.id,
        creditedTaskId: taskId ?? "", creditedSeconds: taskId ? seconds : 0,
      });
      if (taskId && seconds) batch.collection(COLLECTIONS.tasks).update(taskId, { "focusedSeconds+": seconds });
    }
    await batch.send({ requestKey: null });
  };
  try { await send(); }
  catch (error) {
    // A committed response may have been lost, or another client may have finished first.
    const committed = await remoteSession(session.id);
    if (committed && committed.mode !== "running") return committed;
    if (taskId && !(await taskExists(taskId))) { taskId = null; await send(); }
    else throw error;
  }
  return { ...session, taskId };
}

function explainSyncError(error: unknown) {
  if (error instanceof ClientResponseError) {
    if (error.status === 401) return "Sign in again to sync your saved sessions.";
    if (error.status === 403 || error.status === 400 || error.status === 404) return "Sync needs attention. Check the PocketBase schema and batch settings, then retry. Your sessions are saved on this device.";
  }
  return error instanceof Error && !(error instanceof ClientResponseError) ? error.message : "Could not connect. Your sessions are saved on this device and will sync when connected.";
}

export function syncTimers(owner: string, force = false): Promise<void> {
  const current = activeSyncs.get(owner);
  if (current) return current;
  if (!force && (failures.get(owner)?.retryAt ?? 0) > Date.now()) return Promise.resolve();
  const run = async () => {
    if (!navigator.onLine || pb.authStore.record?.id !== owner) return;
    if (!(await readTimer(owner)).operations.length) return;
    if (!pb.authStore.isValid) {
      setStatus(owner, { syncing: false, error: "Sign in again to sync your saved sessions." }); return;
    }
    setStatus(owner, { syncing: true, error: null });
    try {
      while (navigator.onLine && pb.authStore.record?.id === owner && pb.authStore.isValid) {
        const operation = (await readTimer(owner)).operations[0];
        if (!operation) break;
        const authoritative = await sendSessionOperation(owner, operation);
        await acknowledgeOperation(owner, operation, authoritative);
        notifyTimer();
        window.dispatchEvent(new Event("pokus-workspace-refresh"));
      }
      setStatus(owner, { syncing: false, error: null });
      failures.delete(owner);
    } catch (error) {
      const attempts = (failures.get(owner)?.attempts ?? 0) + 1;
      failures.set(owner, { attempts, retryAt: Date.now() + Math.min(300_000, 15_000 * 2 ** Math.min(attempts, 5)) });
      setStatus(owner, { syncing: false, error: explainSyncError(error) });
    }
  };
  const promise = Promise.resolve(navigator.locks
    ? navigator.locks.request(`pokus-sync:${owner}`, run)
    : run()).then(() => undefined).catch((error: unknown) => setStatus(owner, { syncing: false, error: explainSyncError(error) })).finally(() => activeSyncs.delete(owner));
  activeSyncs.set(owner, promise);
  return promise;
}
