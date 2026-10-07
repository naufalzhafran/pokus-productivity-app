import { describe, expect, it } from "vitest";
import { captureFromRecord, captureToRecord, projectFromRecord, taskFromRecord, taskToRecord, type CaptureRecord, type ProjectRecord, type TaskRecord } from "@/lib/pocketbase-records";
import { pb } from "@/lib/pocketbase";

describe("PocketBase workspace adapters", () => {
  it("round-trips task metadata and project due dates", () => {
    const task = taskFromRecord({ id: "task", title: "Write", description: "<p>Notes</p>", priority: "urgent", category: "category", project: "project", isDone: false, focusedSeconds: 12, created: "2026-07-01T00:00:00Z" } as TaskRecord);
    const project = projectFromRecord({ id: "project", title: "Launch", description: "", status: "active", dueDate: "2026-07-29", isDone: false, created: "2026-07-01T00:00:00Z" } as ProjectRecord);
    expect(task).toMatchObject({ description: "<p>Notes</p>", priority: "urgent", categoryId: "category", projectId: "project" });
    expect(project.dueDate).toBe("2026-07-29");
    expect(projectFromRecord({ id: "project", title: "Launch", description: "", captures: ["c1", "c2"], isDone: false, created: "2026-07-01T00:00:00Z" } as ProjectRecord).captureIds).toEqual(["c1", "c2"]);
  });

  it("materializes safe defaults for rolling-deployment legacy records", () => {
    const task = taskFromRecord({ id: "task", title: "Legacy", project: "", isDone: false, focusedSeconds: 0, created: "2026-07-01T00:00:00Z" } as TaskRecord);
    const project = projectFromRecord({ id: "project", title: "Legacy", description: "", isDone: false, created: "2026-07-01T00:00:00Z" } as ProjectRecord);
    expect(task).toMatchObject({ description: "", priority: "none", categoryId: null, dueDate: null });
    expect(project).toMatchObject({ status: "active", isArchived: false, dueDate: null, captureIds: [] });
  });

  it("round-trips new dates and reminders while defaulting older captures", () => {
    pb.authStore.save("test", { id: "owner", collectionId: "users", collectionName: "users" });
    const record = { id: "capture", kind: "note", title: "Call", url: "", note: "", isProcessed: true, created: "2026-07-01T00:00:00Z", updated: "2026-07-01T00:00:00Z" } as CaptureRecord;
    expect(captureFromRecord(record)).toMatchObject({ reminderAt: null, reminderDone: false });
    const reminder = captureFromRecord({ ...record, reminderAt: 1_791_000_000_000, reminderDone: true });
    expect(captureToRecord(reminder)).toMatchObject({ reminderAt: 1_791_000_000_000, reminderDone: true, isProcessed: true });
    expect(captureToRecord({ ...reminder, reminderAt: null, reminderDone: false })).toMatchObject({ reminderAt: 0, reminderDone: false });
    const task = taskFromRecord({ id: "task", title: "Write", project: "", isDone: false, focusedSeconds: 0, dueDate: "2026-10-06", created: record.created } as TaskRecord);
    expect(taskToRecord(task).dueDate).toBe("2026-10-06");
    expect(taskToRecord({ ...task, dueDate: null }).dueDate).toBe("");
    pb.authStore.clear();
  });
});
