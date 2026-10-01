import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useProjects } from "@/hooks/useProjects";
import type { ProjectRecord } from "@/lib/pocketbase-records";

const records: ProjectRecord[] = [
  { id: "a", title: "A", description: "", isDone: false, captures: ["c1"], created: "2026-07-01T00:00:00Z" } as ProjectRecord,
  { id: "b", title: "B", description: "", isDone: false, captures: [] as string[], created: "2026-07-02T00:00:00Z" } as ProjectRecord,
];
const update = vi.fn();
vi.mock("@/lib/pocketbase", () => ({
  pb: {
    authStore: { record: { id: "user" }, isValid: true, onChange: () => () => undefined },
    collection: () => ({ getFullList: async () => records, update }),
  },
}));

beforeEach(() => {
  update.mockReset();
  // Echo the modifiers back as PocketBase would apply them.
  update.mockImplementation(async (id: string, body: Record<string, string[]>) => {
    const record = records.find((item) => item.id === id)!;
    const captures = [...(record.captures ?? []).filter((value) => !body["captures-"]?.includes(value)), ...(body["captures+"] ?? [])];
    return { ...record, captures };
  });
});

describe("useProjects capture links", () => {
  it("adds and removes captures with PocketBase modifiers", async () => {
    const { result } = renderHook(() => useProjects());
    await waitFor(() => expect(result.current.projects).toHaveLength(2));

    await act(() => result.current.changeProjectCaptures("b", ["c1", "c2"], []));
    expect(update).toHaveBeenCalledWith("b", { "captures+": ["c1", "c2"] }, { requestKey: null });
    expect(result.current.projects.find((project) => project.id === "b")?.captureIds).toEqual(["c1", "c2"]);
  });

  it("puts a capture in exactly the chosen projects", async () => {
    const { result } = renderHook(() => useProjects());
    await waitFor(() => expect(result.current.projects).toHaveLength(2));

    await act(() => result.current.setCaptureProjects("c1", ["b"]));
    expect(update).toHaveBeenCalledWith("a", { "captures-": ["c1"] }, { requestKey: null });
    expect(update).toHaveBeenCalledWith("b", { "captures+": ["c1"] }, { requestKey: null });
    expect(update).toHaveBeenCalledTimes(2);
  });

  it("restores the previous links when saving fails", async () => {
    update.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useProjects());
    await waitFor(() => expect(result.current.projects).toHaveLength(2));

    await expect(act(() => result.current.changeProjectCaptures("a", [], ["c1"]))).rejects.toThrow("offline");
    expect(result.current.projects.find((project) => project.id === "a")?.captureIds).toEqual(["c1"]);
  });
});
