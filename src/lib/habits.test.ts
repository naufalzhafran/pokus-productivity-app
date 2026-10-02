import { describe, expect, it } from "vitest";
import { addHabitDays, createHabit, editHabit, habitComplete, habitFraction, habitStreaks, habitTarget, habitYearDays, overallHabitProgress, parseHabitNumber, setHabitValue, validHabitDay } from "@/lib/habits";

const number = () => createHabit({ name: "Read", kind: "number", unit: "pages", target: 10 }, "2026-01-01", "habit0000000001");
describe("Centaur habit semantics", () => {
  it("keeps dated targets and replaces edits made on the same day", () => {
    let habit = setHabitValue(number(), "2026-01-01", 10, "2026-01-03");
    habit = editHabit(habit, "Read books", 20, "2026-01-02");
    habit = editHabit(habit, "Read books", 15, "2026-01-02");
    expect(habit.targets).toEqual([{ day: "2026-01-01", target: 10 }, { day: "2026-01-02", target: 15 }]);
    expect(habitTarget(habit, "2026-01-01")).toBe(10);
    expect(habitTarget(habit, "2026-01-03")).toBe(15);
    expect(habitComplete(habit, "2026-01-01")).toBe(true);
  });
  it("uses decimal totals, caps progress, and excludes habits before creation", () => {
    const habit = setHabitValue(number(), "2026-01-02", 4.5, "2026-01-02");
    expect(habitFraction(habit, "2026-01-02")).toBe(.45);
    expect(habitFraction(setHabitValue(habit, "2026-01-02", 30, "2026-01-02"), "2026-01-02")).toBe(1);
    expect(overallHabitProgress([habit], "2025-12-31")).toEqual({ completed: 0, total: 0, fraction: 0 });
  });
  it("retains yesterday's streak when today is incomplete, with any completed habit counting", () => {
    let habit = number();
    for (const day of ["2026-01-01", "2026-01-02", "2026-01-04"]) habit = setHabitValue(habit, day, 10, "2026-01-06");
    expect(habitStreaks([habit], "2026-01-05")).toEqual({ current: 1, longest: 2, completedDays: 3 });
    expect(habitStreaks([habit], "2026-01-06").current).toBe(0);
  });
  it("validates real dates and rejects future, pre-creation, negative, and nonfinite totals", () => {
    expect(validHabitDay("2026-02-30")).toBe(false);
    expect(addHabitDays("2024-02-28", 1)).toBe("2024-02-29");
    const habit = number();
    for (const [day, value] of [["2025-12-31", 1], ["2026-01-04", 1], ["2026-01-02", -1], ["2026-01-02", Infinity]] as const) expect(() => setHabitValue(habit, day, value, "2026-01-03")).toThrow();
    const check = createHabit({ name: "Walk", kind: "check", unit: "", target: 1 }, "2026-01-01", "habit0000000002");
    expect(() => setHabitValue(check, "2026-01-01", .5, "2026-01-01")).toThrow();
  });
  it("parses local decimal input without accepting exponents or separators", () => {
    expect(parseHabitNumber("1,5", "de-DE")).toBe(1.5);
    expect(parseHabitNumber("1.5", "en-US")).toBe(1.5);
    for (const text of ["-1", "1e3", "", "1,000", "Infinity"]) expect(parseHabitNumber(text, "en-US")).toBeNull();
  });
  it("builds full Monday-based weeks across year boundaries", () => {
    const days = habitYearDays(2024);
    expect(days.length % 7).toBe(0);
    expect(days).toContain("2024-02-29");
    expect(new Date(`${days[0]}T12:00:00Z`).getUTCDay()).toBe(1);
  });
});
