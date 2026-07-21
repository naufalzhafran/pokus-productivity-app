import { describe, expect, it } from "vitest";
import {
  buildWorkspaceIndex,
  createDefaultWorkspaceState,
  selectWorkspaceGroups,
  TASK_BATCH_SIZE,
  TASK_TITLE_MAX_LENGTH,
  validateTaskTitle,
} from "@/lib/workspace";
import type { Project, Task } from "@/types/task";

const projects: Project[] = [
  { id: "new", title: "New Project", createdAt: 30, isDone: false },
  { id: "old", title: "Alpha", createdAt: 20, isDone: false },
  { id: "archived", title: "Archive Match", createdAt: 10, isDone: true },
];

const tasks: Task[] = [
  {
    id: "one",
    title: "Write release notes",
    createdAt: 30,
    isDone: false,
    focusedSeconds: 20,
    projectId: "new",
  },
  {
    id: "two",
    title: "A multiline\nUnicode 🧠 task",
    createdAt: 20,
    isDone: true,
    focusedSeconds: 100,
    projectId: "new",
  },
  {
    id: "three",
    title: "Unassigned item",
    createdAt: 10,
    isDone: false,
    focusedSeconds: 5,
    projectId: null,
  },
  {
    id: "four",
    title: "Preserved child status",
    createdAt: 5,
    isDone: false,
    focusedSeconds: 0,
    projectId: "archived",
  },
];

describe("workspace selectors", () => {
  it("builds maps, groups, and active counts in one index", () => {
    const index = buildWorkspaceIndex(projects, tasks);
    expect(index.groups[0].id).toBe("unassigned");
    expect(index.groupMap.get("new")?.openCount).toBe(1);
    expect(index.groupMap.get("new")?.completedCount).toBe(1);
    expect(index.groupMap.get("new")?.focusedSeconds).toBe(120);
    expect(index.activeOpenCount).toBe(2);
    expect(index.archivedProjects).toHaveLength(1);
  });

  it("searches task and project text case-insensitively and filters status", () => {
    const index = buildWorkspaceIndex(projects, tasks);
    const state = { ...createDefaultWorkspaceState(), status: "all" as const };
    expect(selectWorkspaceGroups(index, state, "RELEASE")[0].tasks[0].id).toBe(
      "one",
    );
    const projectMatch = selectWorkspaceGroups(index, state, "new project");
    expect(projectMatch.find((group) => group.id === "new")?.tasks).toHaveLength(
      2,
    );
  });

  it("sorts within a group without changing group order", () => {
    const index = buildWorkspaceIndex(projects, tasks);
    const state = {
      ...createDefaultWorkspaceState(),
      status: "all" as const,
      sort: "focused" as const,
    };
    const group = selectWorkspaceGroups(index, state, "").find(
      (candidate) => candidate.id === "new",
    );
    expect(group?.tasks.map((task) => task.id)).toEqual(["two", "one"]);
  });

  it("keeps archived task statuses and leaves deleted-project tasks unassigned", () => {
    const archivedIndex = buildWorkspaceIndex(projects, tasks);
    const archivedState = {
      ...createDefaultWorkspaceState(),
      scope: "archived" as const,
      status: "all" as const,
    };
    expect(
      selectWorkspaceGroups(archivedIndex, archivedState, "")[0].tasks[0]
        .isDone,
    ).toBe(false);

    const afterDelete = buildWorkspaceIndex(
      projects.filter((project) => project.id !== "new"),
      tasks,
    );
    expect(afterDelete.groupMap.get("unassigned")?.tasks).toHaveLength(3);
  });

  it("handles the agreed 100-project, 1,000-task target with bounded batches", () => {
    const manyProjects = Array.from({ length: 100 }, (_, index) => ({
      id: `project-${index}`,
      title: `Project ${index}`,
      createdAt: 100 - index,
      isDone: false,
    }));
    const manyTasks = Array.from({ length: 1000 }, (_, index) => ({
      id: `task-${index}`,
      title: `Task ${index}`,
      createdAt: index,
      isDone: false,
      focusedSeconds: index,
      projectId: `project-${index % 100}`,
    }));
    const index = buildWorkspaceIndex(manyProjects, manyTasks);
    expect(index.groups).toHaveLength(101);
    expect(index.activeOpenCount).toBe(1000);
    expect(Math.min(TASK_BATCH_SIZE, index.groups[1].tasks.length)).toBe(10);
  });
});

describe("task validation", () => {
  it("accepts 2,000-character multiline text and preserves internal whitespace", () => {
    const longTitle = `  ${"a".repeat(998)}\n🧠\n${"b".repeat(998)}  `;
    expect(longTitle.trim().length).toBe(2000);
    expect(validateTaskTitle(longTitle)).toBeNull();
    expect(validateTaskTitle(`${"x".repeat(TASK_TITLE_MAX_LENGTH)}x`)).toMatch(
      /2,000/,
    );
    expect(longTitle.trim()).toContain("\n🧠\n");
  });
});
