import { describe, expect, it } from "vitest";
import { projectFromRecord, taskFromRecord, type ProjectRecord, type TaskRecord } from "@/lib/pocketbase-records";

describe("PocketBase workspace adapters", () => {
  it("round-trips task metadata and project due dates", () => {
    const task = taskFromRecord({ id: "task", title: "Write", description: "<p>Notes</p>", priority: "urgent", category: "category", project: "project", isDone: false, focusedSeconds: 12, created: "2026-07-01T00:00:00Z" } as TaskRecord);
    const project = projectFromRecord({ id: "project", title: "Launch", description: "", status: "active", dueDate: "2026-07-29", isDone: false, created: "2026-07-01T00:00:00Z" } as ProjectRecord);
    expect(task).toMatchObject({ description: "<p>Notes</p>", priority: "urgent", categoryId: "category", projectId: "project" });
    expect(project.dueDate).toBe("2026-07-29");
  });

  it("materializes safe defaults for rolling-deployment legacy records", () => {
    const task = taskFromRecord({ id: "task", title: "Legacy", project: "", isDone: false, focusedSeconds: 0, created: "2026-07-01T00:00:00Z" } as TaskRecord);
    const project = projectFromRecord({ id: "project", title: "Legacy", description: "", isDone: false, created: "2026-07-01T00:00:00Z" } as ProjectRecord);
    expect(task).toMatchObject({ description: "", priority: "none", categoryId: null });
    expect(project).toMatchObject({ status: "active", isArchived: false, dueDate: null });
  });
});
