import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCaptureReminders } from "@/hooks/useCaptureReminders";
import type { Capture } from "@/types/capture";

const mocks = vi.hoisted(() => ({ toast: vi.fn(), claim: vi.fn(), account: { id: "owner" } }));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/lib/pocketbase", () => ({ pb: { authStore: { record: mocks.account } } }));
vi.mock("@/lib/offline-store", () => ({ claimCaptureReminder: mocks.claim }));
const makeCapture = (id: string, reminderAt = Date.now() - 60_000): Capture => ({ id, kind: "note", url: null, title: id, note: "", preview: null, isProcessed: false, createdAt: 1, updatedAt: 1, reminderAt, reminderDone: false });

beforeEach(() => {
  mocks.toast.mockReset(); mocks.claim.mockReset(); mocks.account.id = "owner";
  const claims = new Set<string>();
  mocks.claim.mockImplementation(async (owner, id, timestamp) => {
    const key = `${owner}:${id}:${timestamp}`;
    if (claims.has(key)) return false;
    claims.add(key); return true;
  });
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
});

describe("in-app capture reminders", () => {
  it("groups missed reminders into one catch-up toast and never redelivers the same schedule", async () => {
    const captures = [makeCapture("one"), makeCapture("two"), { ...makeCapture("done"), reminderDone: true }, makeCapture("future", Date.now() + 60_000)];
    const { rerender } = renderHook(({ values }) => useCaptureReminders("owner", values), { initialProps: { values: captures } });
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledTimes(1));
    expect(mocks.toast).toHaveBeenCalledWith("2 capture reminders are due", expect.objectContaining({ action: expect.objectContaining({ label: "Open calendar" }) }));
    expect(mocks.claim).toHaveBeenCalledTimes(2);
    await act(async () => { rerender({ values: [...captures] }); });
    expect(mocks.toast).toHaveBeenCalledTimes(1);
    await act(async () => { rerender({ values: [{ ...captures[0], reminderAt: captures[0].reminderAt! - 10_000 }] }); });
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledTimes(2));
    expect(mocks.toast).toHaveBeenLastCalledWith("one", expect.anything());
  });

  it("waits for visible, loaded data belonging to the signed-in account", async () => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    const captures = [makeCapture("one")];
    const { rerender } = renderHook(({ owner, loading }) => useCaptureReminders(owner, captures, loading), { initialProps: { owner: "owner", loading: true } });
    await act(async () => { rerender({ owner: "owner", loading: false }); });
    expect(mocks.claim).not.toHaveBeenCalled();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    await act(async () => { rerender({ owner: "other", loading: false }); });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(mocks.claim).not.toHaveBeenCalled();
    await act(async () => { rerender({ owner: "owner", loading: false }); });
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledTimes(1));
    const options = mocks.toast.mock.calls[0][1];
    options.action.onClick();
    expect(window.location.hash).toMatch(/^#calendar\/\d{4}-\d{2}-\d{2}\/one$/);
  });

  it("does not show a reminder if its completion or account changes while claiming", async () => {
    let resolve!: (claimed: boolean) => void;
    mocks.claim.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const capture = makeCapture("one");
    const { rerender } = renderHook(({ values }) => useCaptureReminders("owner", values), { initialProps: { values: [capture] } });
    await waitFor(() => expect(mocks.claim).toHaveBeenCalledOnce());
    await act(async () => { rerender({ values: [{ ...capture, reminderDone: true }] }); });
    await act(async () => { resolve(true); });
    expect(mocks.toast).not.toHaveBeenCalled();
  });
});
