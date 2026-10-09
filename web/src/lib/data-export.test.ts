import { describe, expect, it } from "vitest";
import { buildDataExport } from "@/lib/data-export";
import { createHabit } from "@/lib/habits";

describe("data export", () => {
  it("includes every collection with readable dates", () => {
    const habit = { ...createHabit({ name: "Read", kind: "number", unit: "pages", target: 10 }, "2026-10-01", "habit0000000001", 0), entries: { "2026-10-02": 12 } };
    const result = buildDataExport({
      account: { id: "user", email: "person@example.com" },
      projects: [{ id: "p", title: "Launch", description: "", createdAt: 0, status: "active" }],
      tasks: [{ id: "t", title: "Write", isDone: false, createdAt: 0, focusedSeconds: 60, projectId: "p" }],
      categories: [], knowledge: [],
      captures: [{ id: "c", kind: "note", url: null, title: "", note: "Idea", preview: null, isProcessed: false, createdAt: 0, updatedAt: 0, reminderAt: null, syncState: "pending" }],
      habits: [habit],
      focusHistory: [{ id: "s", taskId: "t", durationMinutes: 25, focusedSeconds: 1500, completedAt: 0 }],
    }, new Date("2026-10-09T00:00:00Z"));
    expect(result).toMatchObject({ format: "pokus-export", version: 1, exportedAt: "2026-10-09T00:00:00.000Z", account: { email: "person@example.com" } });
    expect(result.tasks[0]).toMatchObject({ title: "Write", createdAt: "1970-01-01T00:00:00.000Z", focusedSeconds: 60 });
    expect(result.captures[0]).toMatchObject({ note: "Idea", syncState: "pending", reminderAt: null });
    expect(result.habits[0]).toMatchObject({ entries: { "2026-10-02": 12 }, targets: [{ day: "2026-10-01", target: 10 }] });
    expect(result.focusHistory[0]).toMatchObject({ focusedSeconds: 1500, completedAt: "1970-01-01T00:00:00.000Z" });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});
