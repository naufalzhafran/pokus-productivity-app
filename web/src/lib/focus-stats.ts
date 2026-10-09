import { addHabitDays } from "@/lib/habits";
import { localDateKey } from "@/lib/workspace";
import type { SessionOperation } from "@/lib/offline-store";
import type { PomodoroHistoryEntry } from "@/types/task";

export interface FocusStatistics {
  today: number;
  week: number;
  /** Consecutive days with focus, counted back from yesterday until today has focus. */
  streak: number;
  total: number;
  /** Oldest first, ending today. */
  lastSevenDays: { day: string; seconds: number }[];
}

/** Synced history plus completed sessions still waiting to sync, newest first, each session once. */
export function mergeFocusHistory(saved: PomodoroHistoryEntry[], pending: SessionOperation[] = []): PomodoroHistoryEntry[] {
  const entries = new Map(saved.map((entry) => [entry.id, entry]));
  for (const { session } of pending) {
    if (session.mode === "complete" && !entries.has(session.id)) entries.set(session.id, {
      id: session.id, taskId: session.taskId, durationMinutes: session.durationMinutes,
      focusedSeconds: Math.max(0, session.durationMinutes * 60 - session.remainingSeconds), completedAt: session.lastTick,
    });
  }
  return [...entries.values()].sort((a, b) => b.completedAt - a.completedAt);
}

/** Focus totals by the local day each session ended on. Weeks start on Monday, like the calendar. */
export function focusStatistics(history: PomodoroHistoryEntry[], now = new Date()): FocusStatistics {
  const today = localDateKey(now);
  const byDay = new Map<string, number>();
  let total = 0;
  for (const entry of history) {
    const seconds = Math.max(0, entry.focusedSeconds);
    total += seconds;
    const day = localDateKey(new Date(entry.completedAt));
    byDay.set(day, (byDay.get(day) ?? 0) + seconds);
  }
  const weekStart = addHabitDays(today, -((now.getDay() + 6) % 7));
  let week = 0;
  for (const [day, seconds] of byDay) if (day >= weekStart && day <= today) week += seconds;
  let streak = 0;
  for (let cursor = byDay.get(today) ? today : addHabitDays(today, -1); byDay.get(cursor); cursor = addHabitDays(cursor, -1)) streak++;
  const lastSevenDays = Array.from({ length: 7 }, (_, index) => {
    const day = addHabitDays(today, index - 6);
    return { day, seconds: byDay.get(day) ?? 0 };
  });
  return { today: byDay.get(today) ?? 0, week, streak, total, lastSevenDays };
}

export function formatFocusDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours) return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  if (minutes) return `${minutes}m`;
  return seconds > 0 ? `${Math.floor(seconds)}s` : "0m";
}
