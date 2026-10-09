import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCaptures } from "@/hooks/useCaptures";
import { claimCaptureReminder, updatePending, writeCache } from "@/lib/offline-store";
import type { CaptureRecord } from "@/lib/pocketbase-records";

let record: CaptureRecord;
const update = vi.fn();
const remove = vi.fn();
const create = vi.fn();
const preview = vi.fn();
const futureReminderAt = Date.now() + 3_600_000;
vi.mock("@/lib/pocketbase", () => ({
  pb: {
    authStore: { record: { id: "capture-calendar-owner" }, isValid: true, onChange: () => () => undefined },
    collection: () => ({ getFullList: async () => [{ ...record }], update, delete: remove, create }),
  },
}));
vi.mock("@/lib/link-preview", async (importOriginal) => ({ ...await importOriginal<typeof import("@/lib/link-preview")>(), fetchLinkPreview: (...args: unknown[]) => preview(...args) }));

beforeEach(async () => {
  vi.restoreAllMocks();
  record = { id: "capture", kind: "article", title: "Read", url: "https://example.com", note: "", author: "", preview: null, isProcessed: false, reminderAt: 0, reminderDone: false, created: "2026-10-01T00:00:00Z", updated: "2026-10-01T00:00:00Z" } as CaptureRecord;
  await writeCache("capture-calendar-owner", "captures", []);
  await updatePending("capture-calendar-owner", "captures", () => []);
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  update.mockReset(); remove.mockReset(); preview.mockReset(); create.mockReset();
  update.mockImplementation(async (_id: string, changes: object) => {
    record = { ...record, ...changes };
    return { ...record };
  });
});

describe("capture reminder mutations", () => {
  it("preserves reminders through content, processed state, and preview edits", async () => {
    const { result } = renderHook(useCaptures);
    await waitFor(() => expect(result.current.captures).toHaveLength(1));
    await act(() => result.current.setCaptureReminder("capture", futureReminderAt));
    await act(() => result.current.setCaptureReminderDone("capture", true));
    await act(() => result.current.updateCapture("capture", { kind: "article", title: "Read again", url: "https://example.com", note: "Updated" }));
    await act(() => result.current.setCaptureProcessed("capture", true));
    preview.mockResolvedValue({ title: "Preview" });
    await act(() => result.current.refreshPreview("capture", "https://example.com"));
    expect(result.current.captures[0]).toMatchObject({ title: "Read again", isProcessed: true, reminderAt: futureReminderAt, reminderDone: true, preview: { title: "Preview" } });
    await act(() => result.current.setCaptureReminder("capture", null));
    expect(update).toHaveBeenLastCalledWith("capture", { reminderAt: 0, reminderDone: false }, { requestKey: null });
    expect(result.current.captures[0]).toMatchObject({ reminderAt: null, reminderDone: false, isProcessed: true });
  });

  it("serializes overlapping writes to preserve their latest server values", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    update.mockImplementationOnce(async (_id: string, changes: object) => {
      await gate;
      record = { ...record, ...changes };
      return { ...record };
    });
    const { result } = renderHook(useCaptures);
    await waitFor(() => expect(result.current.captures).toHaveLength(1));
    let first!: Promise<unknown>;
    let second!: Promise<unknown>;
    await act(async () => {
      first = result.current.setCaptureReminder("capture", futureReminderAt);
      second = result.current.setCaptureProcessed("capture", true);
      await Promise.resolve();
    });
    expect(update).toHaveBeenCalledTimes(1);
    await act(async () => { release(); await Promise.all([first, second]); });
    expect(result.current.captures[0]).toMatchObject({ reminderAt: futureReminderAt, isProcessed: true });
  });

  it("restores failed changes and lets the next queued change proceed", async () => {
    const { result } = renderHook(useCaptures);
    await waitFor(() => expect(result.current.captures).toHaveLength(1));
    update.mockRejectedValueOnce(new Error("save failed"));
    await expect(act(() => result.current.setCaptureReminder("capture", futureReminderAt))).rejects.toThrow("save failed");
    expect(result.current.captures[0].reminderAt).toBeNull();
    await act(() => result.current.setCaptureProcessed("capture", true));
    expect(result.current.captures[0]).toMatchObject({ reminderAt: null, isProcessed: true });
  });

  it("ignores stale preview results after a capture URL changes", async () => {
    let resolvePreview!: (value: object) => void;
    preview.mockImplementationOnce(() => new Promise((resolve) => { resolvePreview = resolve; }));
    const { result } = renderHook(useCaptures);
    await waitFor(() => expect(result.current.captures).toHaveLength(1));
    let pending!: Promise<boolean>;
    await act(async () => { pending = result.current.refreshPreview("capture", "https://example.com"); });
    preview.mockResolvedValue(null);
    await act(() => result.current.updateCapture("capture", { kind: "article", title: "New URL", url: "https://example.org", note: "" }));
    await act(async () => { resolvePreview({ title: "Stale" }); await pending; });
    expect(result.current.captures[0]).toMatchObject({ url: "https://example.org", preview: null });
  });

  it("claims an old completed occurrence before reopening it without a surprise alert", async () => {
    const past = Date.now() - 86_400_000;
    record = { ...record, reminderAt: past, reminderDone: true };
    const { result } = renderHook(useCaptures);
    await waitFor(() => expect(result.current.captures).toHaveLength(1));
    await act(() => result.current.setCaptureReminderDone("capture", false));
    expect(result.current.captures[0]).toMatchObject({ reminderAt: past, reminderDone: false });
    expect(await claimCaptureReminder("capture-calendar-owner", "capture", past)).toBe(false);
  });

  it("rejects a reminder that becomes past-due while waiting for an earlier write", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    update.mockImplementationOnce(async (_id: string, changes: object) => {
      await gate;
      record = { ...record, ...changes };
      return { ...record };
    });
    const { result } = renderHook(useCaptures);
    await waitFor(() => expect(result.current.captures).toHaveLength(1));
    const now = Date.now();
    let writes!: Promise<PromiseSettledResult<unknown>[]>;
    await act(async () => {
      writes = Promise.allSettled([result.current.setCaptureProcessed("capture", true), result.current.setCaptureReminder("capture", now + 1000)]);
      await Promise.resolve();
    });
    vi.spyOn(Date, "now").mockReturnValue(now + 2000);
    await act(async () => { release(); });
    const results = await writes;
    expect(results[1]).toMatchObject({ status: "rejected", reason: expect.objectContaining({ message: expect.stringContaining("future") }) });
    expect(update).toHaveBeenCalledTimes(1);
    expect(result.current.captures[0].reminderAt).toBeNull();
  });
});

describe("offline capture", () => {
  it("queues a capture offline, shows it as waiting, and syncs it with a preview once online", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    let created: CaptureRecord | undefined;
    create.mockImplementation(async (data: Partial<CaptureRecord>) => { created = { ...data, created: "2026-10-09T00:00:00Z", updated: "2026-10-09T00:00:00Z" } as CaptureRecord; return { ...created }; });
    update.mockImplementation(async (_id: string, changes: object) => ({ ...created, ...changes }));
    const { result } = renderHook(useCaptures);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    let queued!: Awaited<ReturnType<typeof result.current.createCapture>>;
    await act(async () => { queued = await result.current.createCapture({ kind: "article", url: "https://example.com/post", title: "", note: "" }); });
    expect(queued.syncState).toBe("pending");
    expect(create).not.toHaveBeenCalled();
    expect(result.current.captures.find((item) => item.id === queued.id)).toMatchObject({ syncState: "pending", url: "https://example.com/post" });

    preview.mockResolvedValue({ title: "Post" });
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    await act(async () => { window.dispatchEvent(new Event("online")); });
    await waitFor(() => expect(result.current.captures.find((item) => item.id === queued.id)).toMatchObject({ preview: { title: "Post" } }));
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toMatchObject({ id: queued.id, url: "https://example.com/post" });
    expect(result.current.captures.find((item) => item.id === queued.id)?.syncState).toBeUndefined();
  });

  it("deletes an unsynced capture locally, even offline", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    const { result } = renderHook(useCaptures);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    let queued!: Awaited<ReturnType<typeof result.current.createCapture>>;
    await act(async () => { queued = await result.current.createCapture({ kind: "note", url: null, title: "", note: "On the train" }); });
    await act(async () => { await result.current.deleteCapture(queued.id); });
    expect(result.current.captures.some((item) => item.id === queued.id)).toBe(false);
    expect(remove).not.toHaveBeenCalled();
  });
});
