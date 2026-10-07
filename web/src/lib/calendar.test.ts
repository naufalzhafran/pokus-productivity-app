import { describe, expect, it } from "vitest";
import { buildCalendarItems, calendarMonthDays, effectiveTaskDueDate, parseReminderLocalDateTime, reminderLocalDateTime } from "@/lib/calendar";
import type { Capture } from "@/types/capture";
import type { Habit } from "@/types/habit";
import type { Project, Task } from "@/types/task";

const project: Project = { id: "project", title: "Launch", description: "", createdAt: 1, dueDate: "2026-10-10" };
const task: Task = { id: "task", title: "Write", isDone: false, createdAt: 1, focusedSeconds: 0, projectId: project.id };
const habit: Habit = { id: "habit", name: "Water", kind: "number", unit: "cups", startDay: "2026-10-05", createdAt: 1, targets: [{ day: "2026-10-05", target: 4 }, { day: "2026-10-07", target: 5 }], entries: { "2026-10-06": 4, "2026-10-07": 4 } };
const capture: Capture = { id: "capture", kind: "note", url: null, title: "Call", note: "", preview: null, isProcessed: true, createdAt: 1, updatedAt: 1, reminderAt: new Date(2026, 9, 6, 9).getTime() };
const input = { projects: [project], tasks: [task], habits: [habit], captures: [capture], startDay: "2026-10-01", endDay: "2026-10-31", today: "2026-10-08" };

describe("calendar projection", () => {
  it("derives task inheritance live, preserving explicit dates and orphaned tasks", () => {
    expect(effectiveTaskDueDate(task, project)).toBe("2026-10-10");
    expect(effectiveTaskDueDate(task, { ...project, dueDate: "2026-10-11" })).toBe("2026-10-11");
    expect(effectiveTaskDueDate({ ...task, dueDate: "2026-10-09" }, project)).toBe("2026-10-09");
    expect(buildCalendarItems(input).items.find((item) => item.type === "task")).toMatchObject({ day: "2026-10-10", inheritedDate: true });
    const orphaned = buildCalendarItems({ ...input, projects: [] });
    expect(orphaned.unscheduled).toMatchObject([{ id: "task", day: null }]);
  });

  it("keeps completed records on their dates, hides archived project trees, and limits overdue to open dated work", () => {
    const done = { ...task, id: "done", dueDate: "2026-09-01", isDone: true };
    const overdue = { ...task, id: "overdue", dueDate: "2026-09-01" };
    const result = buildCalendarItems({ ...input, tasks: [task, done, overdue] });
    expect(result.overdue.map((item) => item.id)).toEqual(["overdue", "capture"]);
    expect(result.items.some((item) => item.id === "overdue")).toBe(false);
    expect(buildCalendarItems({ ...input, tasks: [{ ...task, isDone: true }] }).items.find((item) => item.type === "task")?.completed).toBe(true);
    const archived = buildCalendarItems({ ...input, projects: [{ ...project, isArchived: true }] });
    expect(archived.items.some((item) => item.type === "task" || item.type === "project")).toBe(false);
    expect(archived.unscheduled).toEqual([]);
  });

  it("uses historical habit targets and only generates occurrences from the start day", () => {
    const result = buildCalendarItems(input).items.filter((item) => item.type === "habit");
    expect(result).toHaveLength(27);
    expect(result[0].day).toBe("2026-10-05");
    expect(result.find((item) => item.day === "2026-10-06")?.completed).toBe(true);
    expect(result.find((item) => item.day === "2026-10-07")?.completed).toBe(false);
  });

  it("includes processed capture reminders but never unscheduled captures", () => {
    const result = buildCalendarItems({ ...input, captures: [capture, { ...capture, id: "plain", reminderAt: null }] });
    expect(result.items.find((item) => item.type === "capture")).toMatchObject({ id: "capture", day: "2026-10-06", completed: false });
    expect(result.unscheduled).toEqual([]);
    expect(buildCalendarItems({ ...input, captures: [{ ...capture, reminderDone: true }] }).overdue).toEqual([]);
  });
});

describe("calendar date and time helpers", () => {
  it("builds a Monday-first grid across year and leap-day boundaries", () => {
    const days = calendarMonthDays("2024-02-20");
    expect(days).toHaveLength(42);
    expect(days[0]).toBe("2024-01-29");
    expect(days).toContain("2024-02-29");
    expect(calendarMonthDays("2026-01-10")[0]).toBe("2025-12-29");
    expect(calendarMonthDays("2026-02-30")).toEqual([]);
  });

  it("round-trips local wall times instead of using UTC input strings", () => {
    const timestamp = new Date(2026, 9, 6, 0, 5).getTime();
    expect(reminderLocalDateTime(timestamp)).toBe("2026-10-06T00:05");
    expect(parseReminderLocalDateTime("2026-10-06T00:05")).toBe(timestamp);
    expect(parseReminderLocalDateTime("2026-02-30T12:00")).toBeNull();
    expect(parseReminderLocalDateTime("2026-10-06T25:00")).toBeNull();
    expect(reminderLocalDateTime(null)).toBe("");
  });
});
