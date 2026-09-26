import { describe, expect, it } from "vitest";
import { acknowledgeOperation, persistTransition, readCache, readTimer, writeCache } from "@/lib/offline-store";
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
  it("keeps cached workspace and pending work isolated by account", async () => {
    await writeCache("alice", "tasks", [{ id: "private-task" }]);
    await persistTransition("alice", running());
    expect(await readCache("bob", "tasks")).toBeUndefined();
    expect((await readTimer("bob")).operations).toHaveLength(0);
    expect((await readTimer("alice")).operations).toHaveLength(1);
  });
});
