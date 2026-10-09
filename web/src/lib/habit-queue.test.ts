import { describe, expect, it } from "vitest";
import { applyQueuedEntries, queueHabitEntry, readQueuedHabitEntries, removeQueuedHabitEntry } from "@/lib/habit-queue";
import { createHabit } from "@/lib/habits";
import { clearAccountCache } from "@/lib/offline-store";

describe("offline habit entries", () => {
  it("keeps the latest value per habit and day and survives clearing the cache", async () => {
    await queueHabitEntry("habit-queue", { habitId: "h", day: "2026-10-08", value: 1 });
    await queueHabitEntry("habit-queue", { habitId: "h", day: "2026-10-08", value: 0 });
    await queueHabitEntry("habit-queue", { habitId: "h", day: "2026-10-09", value: 1 });
    await clearAccountCache("habit-queue");
    expect(await readQueuedHabitEntries("habit-queue")).toEqual([{ habitId: "h", day: "2026-10-08", value: 0 }, { habitId: "h", day: "2026-10-09", value: 1 }]);
  });

  it("doesn't drop a newer value when an older send finishes", async () => {
    await queueHabitEntry("habit-race", { habitId: "h", day: "2026-10-08", value: 3 });
    await queueHabitEntry("habit-race", { habitId: "h", day: "2026-10-08", value: 5 });
    await removeQueuedHabitEntry("habit-race", { habitId: "h", day: "2026-10-08", value: 3 });
    expect(await readQueuedHabitEntries("habit-race")).toEqual([{ habitId: "h", day: "2026-10-08", value: 5 }]);
  });

  it("shows queued values over saved ones", () => {
    const habit = { ...createHabit({ name: "Read", kind: "number", unit: "pages", target: 10 }, "2026-10-01", "habit0000000001"), entries: { "2026-10-02": 4 } };
    const [applied] = applyQueuedEntries([habit], [{ habitId: habit.id, day: "2026-10-02", value: 7 }, { habitId: "other", day: "2026-10-02", value: 1 }]);
    expect(applied.entries).toEqual({ "2026-10-02": 7 });
    expect(applyQueuedEntries([habit], [])[0]).toBe(habit);
  });
});
