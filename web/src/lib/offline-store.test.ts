import { describe, expect, it } from "vitest";
import { acknowledgeOperation, claimCaptureReminder, clearAccountCache, persistTransition, readCache, readTimer, writeCache } from "@/lib/offline-store";
import type { PomodoroSession } from "@/types/task";

const running = (id = "session00000001"): PomodoroSession => ({ id, taskId: "task00000000001", mode: "running", durationMinutes: 25, remainingSeconds: 1500, isActive: true, lastTick: 1000 });
describe("durable timer storage", () => {
  it("restores the timer and its pending operation together", async () => {
    await persistTransition("restore", running());
    const restored = await readTimer("restore");
    expect(restored.current).toEqual(running());
    expect(restored.operations[0].session).toEqual(running());
  });
  it("coalesces pause and resume while retaining other sessions", async () => {
    await persistTransition("coalesce", running());
    await persistTransition("coalesce", { ...running(), isActive: false, remainingSeconds: 300 });
    const paused = await readTimer("coalesce");
    expect(paused.operations).toHaveLength(1);
    expect(paused.current?.remainingSeconds).toBe(300);
    await persistTransition("coalesce", { ...running(), mode: "complete", isActive: false, remainingSeconds: 0 });
    await persistTransition("coalesce", null);
    await persistTransition("coalesce", running("session00000002"));
    expect((await readTimer("coalesce")).operations).toHaveLength(2);
  });
  it("does not delete a newer pause when an older running write is acknowledged", async () => {
    const first = await persistTransition("race", running());
    await persistTransition("race", { ...running(), isActive: false });
    await acknowledgeOperation("race", first.operations[0], running());
    expect((await readTimer("race")).operations[0].session.isActive).toBe(false);
  });
  it("cannot resurrect a discarded session from a stale tab", async () => {
    await persistTransition("discard", running());
    const discarded = await persistTransition("discard", null);
    await acknowledgeOperation("discard", discarded.operations[0], discarded.operations[0].session);
    await persistTransition("discard", running());
    expect((await readTimer("discard")).current).toBeNull();
    expect((await readTimer("discard")).operations).toHaveLength(0);
  });
  it("accepts the first server terminal state over a conflicting local result", async () => {
    const local = await persistTransition("conflict", running());
    await persistTransition("conflict", null);
    await acknowledgeOperation("conflict", local.operations[0], { ...running(), mode: "complete", remainingSeconds: 0, isActive: false });
    expect((await readTimer("conflict")).operations).toHaveLength(0);
  });
  it("keeps a queued completion's task credit when the finished session is changed later", async () => {
    await persistTransition("credit", running());
    await persistTransition("credit", { ...running(), mode: "complete", isActive: false, remainingSeconds: 0 });
    await persistTransition("credit", (current) => (current ? { ...current, taskId: null } : null));
    const saved = await readTimer("credit");
    expect(saved.operations).toHaveLength(1);
    expect(saved.operations[0].session.taskId).toBe("task00000000001");
    expect(saved.operations[0].session.mode).toBe("complete");
  });
  it("keeps only recent terminal session ids", async () => {
    for (let index = 0; index < 105; index += 1) {
      const id = `prune${String(index).padStart(10, "0")}`;
      await persistTransition("prune", running(id));
      await persistTransition("prune", null);
    }
    const saved = await readTimer("prune");
    expect(saved.terminalIds).toHaveLength(100);
    expect(saved.terminalIds).not.toContain("prune0000000000");
  });
  it("clears only the signed-out account's cached workspace", async () => {
    await writeCache("leaving", "tasks", [{ id: "task" }]);
    await writeCache("leaving", "capture-reminder:capture:1000", Date.now());
    await writeCache("staying", "tasks", [{ id: "other" }]);
    await persistTransition("leaving", running());
    await clearAccountCache("leaving");
    expect(await readCache("leaving", "tasks")).toBeUndefined();
    expect(await readCache("leaving", "capture-reminder:capture:1000")).toBeDefined();
    expect(await readCache("staying", "tasks")).toEqual([{ id: "other" }]);
    expect((await readTimer("leaving")).operations).toHaveLength(1);
  });
  it("keeps cached workspace and pending work isolated by account", async () => {
    await writeCache("alice", "tasks", [{ id: "private-task" }]);
    await persistTransition("alice", running());
    expect(await readCache("bob", "tasks")).toBeUndefined();
    expect((await readTimer("bob")).operations).toHaveLength(0);
    expect((await readTimer("alice")).operations).toHaveLength(1);
  });
});

describe("durable reminder claims", () => {
  it("allows only one concurrent claim for an account, capture, and timestamp", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => claimCaptureReminder("reminders-race", "capture", 1000)));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await claimCaptureReminder("reminders-race", "capture", 1000)).toBe(false);
  });

  it("prunes claims made more than 90 days ago", async () => {
    await writeCache("reminders-prune", "capture-reminder:old:1000", Date.now() - 91 * 86_400_000);
    await writeCache("reminders-prune", "capture-reminder:recent:1000", Date.now() - 86_400_000);
    expect(await claimCaptureReminder("reminders-prune", "new", 1000)).toBe(true);
    expect(await readCache("reminders-prune", "capture-reminder:old:1000")).toBeUndefined();
    expect(await readCache("reminders-prune", "capture-reminder:recent:1000")).toBeDefined();
  });

  it("isolates accounts and permits a new timestamp after rescheduling", async () => {
    expect(await claimCaptureReminder("reminders-alice", "capture", 1000)).toBe(true);
    expect(await claimCaptureReminder("reminders-bob", "capture", 1000)).toBe(true);
    expect(await claimCaptureReminder("reminders-alice", "capture", 2000)).toBe(true);
    expect(await claimCaptureReminder("reminders-alice", "capture", 1000)).toBe(false);
  });
});
