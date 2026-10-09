import { readPending, updatePending } from "@/lib/offline-store";
import type { Habit } from "@/types/habit";

/** An absolute daily value saved offline. Replaying it is idempotent, unlike an increment. */
export interface QueuedHabitEntry { habitId: string; day: string; value: number }

const QUEUE = "habit-entries";
export const readQueuedHabitEntries = (owner: string) => readPending<QueuedHabitEntry>(owner, QUEUE);
/** The latest value for a habit and day replaces any earlier queued one. */
export const queueHabitEntry = (owner: string, entry: QueuedHabitEntry) => updatePending<QueuedHabitEntry>(owner, QUEUE,
  (items) => [...items.filter((item) => item.habitId !== entry.habitId || item.day !== entry.day), entry]);
/** Removes an entry once sent, unless a newer value for the same day was queued meanwhile. */
export const removeQueuedHabitEntry = (owner: string, entry: QueuedHabitEntry) => updatePending<QueuedHabitEntry>(owner, QUEUE,
  (items) => items.filter((item) => item.habitId !== entry.habitId || item.day !== entry.day || item.value !== entry.value));

/** Habits as they'll be once queued values sync. */
export function applyQueuedEntries(habits: Habit[], queued: QueuedHabitEntry[]): Habit[] {
  if (!queued.length) return habits;
  return habits.map((habit) => {
    const mine = queued.filter((entry) => entry.habitId === habit.id);
    return mine.length ? { ...habit, entries: { ...habit.entries, ...Object.fromEntries(mine.map((entry) => [entry.day, entry.value])) } } : habit;
  });
}
