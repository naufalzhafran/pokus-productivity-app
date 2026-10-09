import { describe, expect, it } from "vitest";
import { focusStatistics, formatFocusDuration, mergeFocusHistory } from "@/lib/focus-stats";
import type { PomodoroHistoryEntry } from "@/types/task";

// 2026-10-08 is a Thursday.
const now = new Date(2026, 9, 8, 18, 0);
const entry = (id: string, day: number, minutes = 25, hour = 12): PomodoroHistoryEntry => ({
  id, taskId: null, durationMinutes: minutes, focusedSeconds: minutes * 60, completedAt: new Date(2026, 9, day, hour).getTime(),
});

describe("focus statistics", () => {
  it("totals today, this Monday-first week, and the last seven local days", () => {
    const stats = focusStatistics([entry("a", 8), entry("b", 8, 5), entry("c", 5), entry("d", 4), entry("e", 1)], now);
    expect(stats.today).toBe(30 * 60);
    expect(stats.week).toBe(55 * 60);
    expect(stats.total).toBe(105 * 60);
    expect(stats.lastSevenDays.map((day) => day.day)).toEqual(["2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"]);
    expect(stats.lastSevenDays.map((day) => day.seconds)).toEqual([0, 0, 1500, 1500, 0, 0, 1800]);
  });

  it("counts a streak back from yesterday until today has focus", () => {
    const history = [entry("1", 7), entry("2", 6), entry("3", 4)];
    expect(focusStatistics(history, now).streak).toBe(2);
    expect(focusStatistics([...history, entry("4", 8)], now).streak).toBe(3);
    expect(focusStatistics([entry("5", 5)], now).streak).toBe(0);
    expect(focusStatistics([], now).streak).toBe(0);
    expect(focusStatistics([{ ...entry("6", 7), focusedSeconds: 0 }], now).streak).toBe(0);
  });

  it("adds pending completed sessions once and ignores running or discarded ones", () => {
    const saved = [entry("synced", 8)];
    const merged = mergeFocusHistory(saved, [
      { revision: 1, session: { id: "synced", taskId: null, durationMinutes: 25, mode: "complete", remainingSeconds: 0, isActive: false, lastTick: 1 } },
      { revision: 2, session: { id: "local", taskId: null, durationMinutes: 25, mode: "complete", remainingSeconds: 600, isActive: false, lastTick: now.getTime() } },
      { revision: 3, session: { id: "running", taskId: null, durationMinutes: 25, mode: "running", remainingSeconds: 600, isActive: true, lastTick: now.getTime() } },
      { revision: 4, session: { id: "gone", taskId: null, durationMinutes: 25, mode: "discarded", remainingSeconds: 600, isActive: false, lastTick: now.getTime() } },
    ]);
    expect(merged.map((item) => item.id)).toEqual(["local", "synced"]);
    expect(merged[0].focusedSeconds).toBe(900);
    expect(focusStatistics(merged, now).today).toBe(2400);
  });

  it("formats durations compactly", () => {
    expect(formatFocusDuration(7800)).toBe("2h 10m");
    expect(formatFocusDuration(7200)).toBe("2h");
    expect(formatFocusDuration(1500)).toBe("25m");
    expect(formatFocusDuration(42)).toBe("42s");
    expect(formatFocusDuration(0)).toBe("0m");
  });
});
