import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useHabits } from "@/hooks/useHabits";
import { createHabit } from "@/lib/habits";
import { updatePending } from "@/lib/offline-store";

const api = vi.hoisted(() => ({ listHabits: vi.fn(), saveHabitEntry: vi.fn(), saveNewHabit: vi.fn(), saveHabitDetails: vi.fn(), removeHabit: vi.fn() }));
vi.mock("@/lib/habit-records", () => api);
vi.mock("@/lib/pocketbase", () => ({ pb: { authStore: { record: { id: "habit-test-user" }, isValid: true } } }));
const initial = createHabit({ name: "Read", kind: "number", unit: "pages", target: 10 }, "2026-01-01", "habit0000000001");

beforeEach(async () => {
  await updatePending("habit-test-user", "habit-entries", () => []);
  vi.clearAllMocks(); api.listHabits.mockResolvedValue([initial]); api.saveHabitEntry.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});
describe("habit save confirmation", () => {
  it("does not retry a committed increment when refreshing fails", async () => {
    const { result } = renderHook(useHabits);
    await waitFor(() => expect(result.current.habits).toHaveLength(1));
    api.listHabits.mockRejectedValue(new Error("refresh failed"));
    await act(() => result.current.increment(initial, "2026-01-02"));
    expect(api.saveHabitEntry).toHaveBeenCalledTimes(1);
    expect(result.current.loadError).toMatch(/saved|refresh/i);
    expect(result.current.saving).toBe(false);
  });
  it("reconciles a lost response without repeating the increment", async () => {
    const { result } = renderHook(useHabits);
    await waitFor(() => expect(result.current.habits).toHaveLength(1));
    api.saveHabitEntry.mockRejectedValueOnce(new Error("response lost"));
    api.listHabits.mockResolvedValue([{ ...initial, entries: { "2026-01-02": 1 } }]);
    await act(async () => { await expect(result.current.increment(initial, "2026-01-02")).rejects.toThrow("Could not confirm"); });
    expect(result.current.habits[0].entries["2026-01-02"]).toBe(1);
    expect(api.saveHabitEntry).toHaveBeenCalledTimes(1);
  });
  it("blocks offline edits without touching the backend", async () => {
    const { result } = renderHook(useHabits);
    await waitFor(() => expect(result.current.habits).toHaveLength(1));
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    await expect(result.current.increment(initial, "2026-01-02")).rejects.toThrow("Connect");
    expect(api.saveHabitEntry).not.toHaveBeenCalled();
  });
  it("saves check-ins offline and replays the absolute value once online", async () => {
    const { result } = renderHook(useHabits);
    await waitFor(() => expect(result.current.habits).toHaveLength(1));
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    await act(() => result.current.setValue(initial, "2026-01-02", 7));
    expect(api.saveHabitEntry).not.toHaveBeenCalled();
    expect(result.current.habits[0].entries["2026-01-02"]).toBe(7);
    expect(result.current.pendingCount).toBe(1);
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    api.listHabits.mockResolvedValue([{ ...initial, entries: { "2026-01-02": 7 } }]);
    await act(async () => { window.dispatchEvent(new Event("online")); });
    await waitFor(() => expect(result.current.pendingCount).toBe(0));
    expect(api.saveHabitEntry).toHaveBeenCalledWith(expect.objectContaining({ id: initial.id }), "2026-01-02", 7);
    expect(result.current.habits[0].entries["2026-01-02"]).toBe(7);
  });
});
