import { describe, expect, it } from "vitest";
import { calculateRemainingSeconds } from "@/hooks/useTimerClock";
import type { PomodoroSession } from "@/types/task";

const session: PomodoroSession = {
  id: "session",
  taskId: null,
  durationMinutes: 25,
  mode: "running",
  remainingSeconds: 120,
  isActive: true,
  lastTick: 10_000,
};

describe("timer wall clock", () => {
  it("subtracts background wall-clock time", () => {
    expect(calculateRemainingSeconds(session, 40_500)).toBe(90);
  });

  it("does not advance a paused timer and clamps completion", () => {
    expect(
      calculateRemainingSeconds({ ...session, isActive: false }, 999_999),
    ).toBe(120);
    expect(calculateRemainingSeconds(session, 999_999)).toBe(0);
  });
});
