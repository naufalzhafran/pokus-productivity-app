import { describe, expect, it } from "vitest";
import { addLocalDays, buildFlatWorkspaceIndex, createDefaultWorkspaceState, selectWorkspaceTasks, TASK_BATCH_SIZE, validateTaskTitle } from "@/lib/workspace";
import type { Category, Project, Task } from "@/types/task";

const today = "2026-07-29";
const categories: Category[] = [{ id: "work", name: "Work", color: "blue", createdAt: 1, updatedAt: 1 }];
const projects: Project[] = [
  { id: "active", title: "Launch", description: "", createdAt: 4, status: "active", isArchived: false, dueDate: "2026-07-28" },
  { id: "today-project", title: "Today", description: "", createdAt: 3, status: "active", isArchived: false, dueDate: today },
  { id: "upcoming-project", title: "Upcoming", description: "", createdAt: 2, status: "planned", isArchived: false, dueDate: addLocalDays(today, 7) },
  { id: "archived", title: "Old", description: "", createdAt: 1, status: "completed", isArchived: true, dueDate: today },
];
const task = (values: Partial<Task> & Pick<Task, "id" | "title">): Task => ({ isDone: false, createdAt: 1, focusedSeconds: 0, projectId: null, description: "", priority: "none", categoryId: null, ...values });
const tasks = [
  task({ id: "overdue", title: "Ship notes", description: "<p>Release context</p>", projectId: "active", categoryId: "work", priority: "urgent", createdAt: 4 }),
  task({ id: "today", title: "Review", projectId: "today-project", priority: "low", createdAt: 3 }),
  task({ id: "upcoming", title: "Plan", projectId: "upcoming-project", createdAt: 2 }),
  task({ id: "archived-task", title: "Hidden", projectId: "archived" }),
  task({ id: "completed", title: "Done", projectId: "today-project", isDone: true }),
];

describe("workspace smart selectors", () => {
  it("counts and selects local-calendar smart views while excluding archived and completed tasks", () => {
    const index = buildFlatWorkspaceIndex(projects, tasks, categories, today);
    expect([index.overdueCount, index.todayCount, index.upcomingCount]).toEqual([1, 1, 1]);
    for (const [scope, expected] of [["overdue", "overdue"], ["today", "today"], ["upcoming", "upcoming"]] as const) {
      expect(selectWorkspaceTasks(index, tasks, { ...createDefaultWorkspaceState(), scope }, "", today).map((item) => item.id)).toEqual([expected]);
    }
  });

  it("searches description, project, and category metadata and applies filters", () => {
    const index = buildFlatWorkspaceIndex(projects, tasks, categories, today);
    const state = { ...createDefaultWorkspaceState(), status: "all" as const };
    expect(selectWorkspaceTasks(index, tasks, state, "release context", today)[0].id).toBe("overdue");
    expect(selectWorkspaceTasks(index, tasks, state, "launch", today).map((item) => item.id)).toContain("overdue");
    expect(selectWorkspaceTasks(index, tasks, { ...state, categoryId: "work", priority: "urgent" }, "", today).map((item) => item.id)).toEqual(["overdue"]);
  });

  it("smart sorts dated tasks first, then priority and newest", () => {
    const index = buildFlatWorkspaceIndex(projects, tasks, categories, today);
    expect(selectWorkspaceTasks(index, tasks, { ...createDefaultWorkspaceState(), status: "all" }, "", today).slice(0, 3).map((item) => item.id)).toEqual(["overdue", "today", "completed"]);
  });

  it("handles the 1,000-task target with bounded progressive batches", () => {
    const many = Array.from({ length: 1000 }, (_, index) => task({ id: `t${index}`, title: `Task ${index}`, createdAt: index }));
    const workspace = buildFlatWorkspaceIndex([], many, [], today);
    expect(selectWorkspaceTasks(workspace, many, createDefaultWorkspaceState(), "", today)).toHaveLength(1000);
    expect(TASK_BATCH_SIZE).toBe(25);
  });
});

describe("task validation", () => {
  it("normalizes new titles to one line and preserves unchanged legacy titles", () => {
    expect(validateTaskTitle("A\nnew task")).toBeNull();
    const legacy = "x".repeat(500);
    expect(validateTaskTitle(legacy, legacy)).toBeNull();
    expect(validateTaskTitle(`${legacy} changed`, legacy)).toMatch(/160/);
  });
});
