import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTasks } from "@/hooks/useTasks";
import { writeCache } from "@/lib/offline-store";
import type { TaskRecord } from "@/lib/pocketbase-records";

let record: TaskRecord;
const update = vi.fn();
vi.mock("@/lib/pocketbase", () => ({ pb: {
  authStore: { record: { id: "tasks-calendar-owner" }, isValid: true, onChange: () => () => undefined },
  collection: () => ({ getFullList: async () => [{ ...record }], update }),
} }));

beforeEach(async () => {
  record = { id: "task", title: "Write", project: "", isDone: false, focusedSeconds: 0, dueDate: "2026-10-06", created: "2026-10-01T00:00:00Z" } as TaskRecord;
  await writeCache("tasks-calendar-owner", "tasks", []);
  update.mockReset();
  update.mockImplementation(async (_id: string, changes: object) => { record = { ...record, ...changes }; return { ...record }; });
});

describe("task dates", () => {
  it("retains an existing date in legacy edits and explicitly clears it to inherit", async () => {
    const { result } = renderHook(useTasks);
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));
    const input = { title: "Edited", description: "", projectId: null, priority: "none" as const, categoryId: null };
    await act(() => result.current.editTask("task", input));
    expect(result.current.tasks[0].dueDate).toBe("2026-10-06");
    await act(() => result.current.editTask("task", { ...input, dueDate: null }));
    expect(record.dueDate).toBe("");
    expect(result.current.tasks[0].dueDate).toBeNull();
  });

  it("rejects impossible dates before changing cached or server records", async () => {
    const { result } = renderHook(useTasks);
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));
    await expect(act(() => result.current.editTask("task", { title: "Write", description: "", projectId: null, priority: "none", categoryId: null, dueDate: "2026-02-30" }))).rejects.toThrow("valid task date");
    expect(update).not.toHaveBeenCalled();
    expect(result.current.tasks[0].dueDate).toBe("2026-10-06");
  });
});
