import { describe, expect, it } from "vitest";
import { addLocalDays, buildProjectStats, countProjectsByFilter, createDefaultWorkspaceState, NO_PROJECT_ID, resetTaskFilters, selectProjects, selectProjectTasks, validateTaskTitle } from "@/lib/workspace";
import type { Category, Project, Task } from "@/types/task";

const today = "2026-07-29";
const categories = new Map<string, Category>([["work", { id: "work", name: "Work", color: "blue", createdAt: 1, updatedAt: 1 }]]);
const projects: Project[] = [
  { id: "overdue", title: "Launch", description: "<p>Beta release</p>", createdAt: 4, status: "active", isArchived: false, dueDate: "2026-07-28" },
  { id: "soon", title: "Review", description: "", createdAt: 3, status: "planned", isArchived: false, dueDate: addLocalDays(today, 7) },
  { id: "later", title: "Later", description: "", createdAt: 2, status: "active", isArchived: false, dueDate: addLocalDays(today, 8) },
  { id: "undated", title: "Someday", description: "", createdAt: 5, status: "on_hold", isArchived: false, dueDate: null },
  { id: "done", title: "Shipped", description: "", createdAt: 1, status: "completed", isArchived: false, dueDate: "2026-07-01" },
  { id: "archived", title: "Old", description: "", createdAt: 0, status: "active", isArchived: true, dueDate: today },
];
const task = (values: Partial<Task> & Pick<Task, "id" | "title">): Task => ({ isDone: false, createdAt: 1, focusedSeconds: 0, projectId: "overdue", description: "", priority: "none", categoryId: null, ...values });
const tasks = [
  task({ id: "low", title: "Draft", priority: "low", createdAt: 4 }),
  task({ id: "urgent", title: "Ship notes", description: "<p>Release context</p>", categoryId: "work", priority: "urgent", createdAt: 3 }),
  task({ id: "done", title: "Done", isDone: true, priority: "urgent", createdAt: 5, focusedSeconds: 900 }),
  task({ id: "loose", title: "Loose", projectId: null }),
];

describe("project list selectors", () => {
  it("orders projects by due date, then newest, and hides archived ones outside the archive", () => {
    expect(selectProjects(projects, "all", "", today).map((project) => project.id)).toEqual(["done", "overdue", "soon", "later", "undated"]);
    expect(selectProjects(projects, "archived", "", today).map((project) => project.id)).toEqual(["archived"]);
  });

  it("filters due-soon and status views and searches descriptions", () => {
    expect(selectProjects(projects, "due", "", today).map((project) => project.id)).toEqual(["overdue", "soon"]);
    expect(selectProjects(projects, "on_hold", "", today).map((project) => project.id)).toEqual(["undated"]);
    expect(selectProjects(projects, "all", "beta", today).map((project) => project.id)).toEqual(["overdue"]);
    expect(countProjectsByFilter(projects, today)).toMatchObject({ all: 5, active: 2, due: 2, archived: 1, completed: 1 });
  });

  it("summarizes tasks per project, including tasks without a project", () => {
    const stats = buildProjectStats(tasks);
    expect(stats.get("overdue")).toEqual({ taskCount: 3, openCount: 2, completedCount: 1, focusedSeconds: 900 });
    expect(stats.get(NO_PROJECT_ID)?.taskCount).toBe(1);
  });
});

describe("project task selector", () => {
  const state = { ...createDefaultWorkspaceState(), status: "all" as const };

  it("smart sorts open tasks first, then by priority and newest", () => {
    expect(selectProjectTasks(tasks, "overdue", state, "", categories).map((item) => item.id)).toEqual(["urgent", "low", "done"]);
    expect(selectProjectTasks(tasks, null, state, "", categories).map((item) => item.id)).toEqual(["loose"]);
  });

  it("searches descriptions and categories and applies filters", () => {
    expect(selectProjectTasks(tasks, "overdue", state, "release context", categories).map((item) => item.id)).toEqual(["urgent"]);
    expect(selectProjectTasks(tasks, "overdue", state, "work", categories).map((item) => item.id)).toEqual(["urgent"]);
    expect(selectProjectTasks(tasks, "overdue", { ...state, status: "open", priority: "low" }, "", categories).map((item) => item.id)).toEqual(["low"]);
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

describe("task filters per project", () => {
  it("resets status, priority, and category but keeps the sort", () => {
    const state = { ...createDefaultWorkspaceState(), status: "completed" as const, priority: "high" as const, categoryId: "c", sort: "newest" as const, lastDuration: 45 };
    expect(resetTaskFilters(state)).toEqual({ ...state, status: "open", priority: "all", categoryId: null });
    const defaults = createDefaultWorkspaceState();
    expect(resetTaskFilters(defaults)).toBe(defaults);
  });
});
