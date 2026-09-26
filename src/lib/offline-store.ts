import { openDB, type DBSchema } from "idb";
import type { PomodoroSession } from "@/types/task";

export type StoredSession = Omit<PomodoroSession, "mode"> & {
  mode: PomodoroSession["mode"] | "discarded";
};
export interface SessionOperation {
  revision: number;
  session: StoredSession;
}
export interface TimerSnapshot {
  current: PomodoroSession | null;
  revision: number;
  operations: SessionOperation[];
  terminalIds?: string[];
}
interface PokusDatabase extends DBSchema {
  timers: { key: string; value: TimerSnapshot };
  cache: { key: string; value: unknown };
}

const emptySnapshot = (): TimerSnapshot => ({ current: null, revision: 0, operations: [] });
let database: ReturnType<typeof openDB<PokusDatabase>> | undefined;
function db() {
  database ??= openDB<PokusDatabase>("pokus-offline", 1, {
    upgrade(database) {
      database.createObjectStore("timers");
      database.createObjectStore("cache");
    },
    blocking() { void database?.then((connection) => connection.close()); database = undefined; },
    terminated() { database = undefined; },
  }).catch((error: unknown) => { database = undefined; throw error; });
  return database;
}

export async function readCache<T>(owner: string, key: string): Promise<T | undefined> {
  return (await db()).get("cache", `${owner}:${key}`) as Promise<T | undefined>;
}
export async function writeCache<T>(owner: string, key: string, value: T) {
  await (await db()).put("cache", value, `${owner}:${key}`);
}
export async function readTimer(owner: string) {
  return (await (await db()).get("timers", owner)) ?? emptySnapshot();
}
export async function restoreTimer(owner: string, current: PomodoroSession) {
  const tx = (await db()).transaction("timers", "readwrite");
  const saved = (await tx.store.get(owner)) ?? emptySnapshot();
  if (!saved.current && !saved.operations.length) {
    await tx.store.put({ ...saved, current }, owner);
  }
  await tx.done;
}

export async function persistTransition(
  owner: string,
  action: PomodoroSession | null | ((current: PomodoroSession | null) => PomodoroSession | null),
) {
  const tx = (await db()).transaction("timers", "readwrite");
  const saved = (await tx.store.get(owner)) ?? emptySnapshot();
  const next = typeof action === "function" ? action(saved.current) : action;
  // Terminal state is durable, including when another tab still holds a running snapshot.
  if (next?.mode === "running" && (saved.terminalIds?.includes(next.id) || saved.operations.some((operation) => operation.session.id === next.id && operation.session.mode !== "running"))) {
    await tx.done;
    return saved;
  }
  const revision = saved.revision + 1;
  const session: StoredSession | null = next ?? (saved.current?.mode === "running"
    ? { ...saved.current, mode: "discarded", isActive: false, lastTick: Date.now() }
    : null);
  const operations = session
    ? [...saved.operations.filter((operation) => operation.session.id !== session.id), { session, revision }]
    : saved.operations;
  const terminalIds = session && session.mode !== "running" ? [...new Set([...(saved.terminalIds ?? []), session.id])] : saved.terminalIds;
  const snapshot = { current: next, operations, revision, terminalIds };
  await tx.store.put(snapshot, owner);
  await tx.done;
  return snapshot;
}

export async function acknowledgeOperation(owner: string, operation: SessionOperation, authoritative: StoredSession) {
  const tx = (await db()).transaction("timers", "readwrite");
  const saved = (await tx.store.get(owner)) ?? emptySnapshot();
  const terminal = authoritative.mode !== "running";
  const operations = saved.operations.filter((pending) => pending.session.id !== operation.session.id || (!terminal && pending.revision !== operation.revision));
  let current = saved.current;
  if (current?.id === authoritative.id && terminal) {
    current = authoritative.mode === "discarded" ? null : { ...authoritative, mode: "complete" };
  }
  const terminalIds = terminal ? [...new Set([...(saved.terminalIds ?? []), authoritative.id])] : saved.terminalIds;
  await tx.store.put({ ...saved, current, operations, terminalIds }, owner);
  await tx.done;
}
