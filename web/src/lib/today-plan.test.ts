import { describe, expect, it } from "vitest";
import { planDays, planReasonLabel } from "@/lib/today-plan";
import type { Project, Task } from "@/types/task";

const today = "2026-10-16"; // Friday
const base: Task = { id: "base", title: "Task", isDone: false, createdAt: 1, focusedSeconds: 0, projectId: null };
const task = (id: string, fields: Partial<Task>): Task => ({ ...base, id, title: id, ...fields });
const plan = (tasks: Task[], options: { projects?: Project[]; capacity?: number } = {}) => planDays({ tasks, projects: options.projects ?? [], today, capacity: options.capacity });
const idsOn = (result: ReturnType<typeof planDays>, index: number) => result[index].entries.map((entry) => entry.task.id);

describe("daily plan", () => {
  it("starts large work days before its due date and leaves small work for its day", () => {
    const result = plan([task("large", { effort: "large", dueDate: "2026-10-19" }), task("small", { dueDate: "2026-10-17" })]);
    expect(idsOn(result, 0)).toEqual(["large"]);
    expect(result[0].entries[0].reason).toBe("early");
    expect(idsOn(result, 1)).toEqual(["small"]);
    expect(result[1].entries[0].reason).toBe("due");
  });

  it("treats unset effort as small and widens the window for urgent work", () => {
    const result = plan([task("unset", { dueDate: "2026-10-17" }), task("urgent", { priority: "urgent", dueDate: "2026-10-18" })]);
    expect(idsOn(result, 0)).toEqual(["urgent"]);
    expect(result[0].used).toBe(1);
  });

  it("spills optional work to later days without moving it past its due date", () => {
    const tasks = [task("a", { effort: "large", dueDate: "2026-10-19" }), task("b", { effort: "large", dueDate: "2026-10-19" })];
    const result = plan(tasks, { capacity: 6 });
    expect(idsOn(result, 0)).toEqual(["a"]);
    expect(idsOn(result, 1)).toEqual(["b"]);
    const tight = plan([task("a", { effort: "large", dueDate: "2026-10-17" }), task("b", { effort: "large", dueDate: "2026-10-17" })], { capacity: 2 });
    expect(idsOn(tight, 0)).toEqual([]);
    expect(idsOn(tight, 1)).toEqual(["a", "b"]);
    expect(tight[1].used).toBeGreaterThan(tight[1].capacity);
  });

  it("always places overdue and due-today work, even past capacity", () => {
    const result = plan([task("late", { effort: "large", dueDate: "2026-10-10" }), task("today", { effort: "large", dueDate: today })], { capacity: 2 });
    expect(result[0].entries.map((entry) => [entry.task.id, entry.reason])).toEqual([["late", "overdue"], ["today", "due"]]);
    expect(result[0].used).toBe(8);
  });

  it("fills only today with undated high and urgent tasks", () => {
    const result = plan([task("urgent", { priority: "urgent" }), task("low", { priority: "low" })]);
    expect(idsOn(result, 0)).toEqual(["urgent"]);
    expect(result.slice(1).every((day) => day.entries.length === 0)).toBe(true);
  });

  it("skips done tasks and tasks in archived projects, and follows project deadlines", () => {
    const projects: Project[] = [{ id: "archived", title: "Old", description: "", createdAt: 1, isArchived: true, dueDate: today }, { id: "live", title: "Live", description: "", createdAt: 1, dueDate: today }];
    const result = plan([task("done", { isDone: true, dueDate: today }), task("old", { projectId: "archived" }), task("inherits", { projectId: "live" })], { projects });
    expect(idsOn(result, 0)).toEqual(["inherits"]);
  });

  it("labels why each task is planned", () => {
    const [day] = plan([task("late", { dueDate: "2026-10-13" }), task("soon", { effort: "large", dueDate: "2026-10-19" }), task("tomorrow", { effort: "medium", dueDate: "2026-10-17" }), task("urgent", { priority: "urgent" })], { capacity: 10 });
    expect(day.entries.map((entry) => planReasonLabel(entry, day.day))).toEqual(["3 days late", "Due tomorrow · start early", "Due Mon · start early", "Urgent, no date"]);
  });
});
