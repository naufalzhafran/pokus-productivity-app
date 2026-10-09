import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useHabitReminder } from "@/hooks/useHabitReminder";
import { createHabit, habitDay } from "@/lib/habits";

const toast = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast }));
const today = habitDay();
const walk = createHabit({ name: "Walk", kind: "check", unit: "", target: 1 }, today, "habit0000000001");

beforeEach(() => {
  localStorage.clear(); toast.mockClear();
  localStorage.setItem("pokus-habit-reminder:owner", JSON.stringify({ enabled: true, time: "00:00" }));
});

describe("habit reminder", () => {
  it("waits for habits to load", () => {
    renderHook(() => useHabitReminder("owner", null));
    expect(toast).not.toHaveBeenCalled();
  });
  it("stays quiet when every habit due today is done", () => {
    renderHook(() => useHabitReminder("owner", [{ ...walk, entries: { [today]: 1 } }]));
    expect(toast).not.toHaveBeenCalled();
  });
  it("reminds once a day while a habit is left", () => {
    const { rerender } = renderHook(() => useHabitReminder("owner", [walk]));
    rerender();
    document.dispatchEvent(new Event("visibilitychange"));
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast.mock.calls[0][0]).toBe("Time for your daily habits");
  });
});
