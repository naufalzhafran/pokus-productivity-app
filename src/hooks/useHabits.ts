import { useRef, useState } from "react";
import { useCachedResource } from "@/hooks/useCachedResource";
import { requireConnection } from "@/hooks/useConnectivity";
import { listHabits, removeHabit, saveHabitDetails, saveHabitEntry, saveNewHabit } from "@/lib/habit-records";
import type { Habit, HabitInput } from "@/types/habit";

export function useHabits() {
  const resource = useCachedResource("habits", listHabits);
  const locked = useRef(false);
  const [saving, setSaving] = useState(false);
  const [syncError, setSyncError] = useState<{ message: string; snapshot: Habit[] } | null>(null);
  async function mutate(write: () => Promise<unknown>) {
    requireConnection();
    if (locked.current) throw new Error("Wait for the current habit change to finish.");
    locked.current = true; setSaving(true); setSyncError(null);
    try {
      await write();
      // Once a write succeeds, never report a refresh failure as a failed save:
      // retrying a numeric increment could otherwise credit it twice.
      try { resource.replace(await listHabits()); }
      catch { setSyncError({ message: "Your change was saved, but the latest totals couldn't be loaded. Refresh before recording another change.", snapshot: resource.itemsRef.current }); window.dispatchEvent(new Event("pokus-workspace-refresh")); }
    } catch {
      // A lost response can follow a committed write. Reload before another
      // increment and make the uncertainty visible instead of silently retrying.
      try { resource.replace(await listHabits()); } catch { /* Cached browsing remains available. */ }
      const message = "Could not confirm the change. Check the refreshed totals before trying again.";
      setSyncError({ message, snapshot: resource.itemsRef.current });
      throw new Error(message);
    } finally { locked.current = false; setSaving(false); }
  }
  return {
    habits: resource.items, isLoading: resource.isLoading, loadError: resource.loadError ?? (syncError?.snapshot === resource.items ? syncError.message : null), saving,
    create: (input: HabitInput) => mutate(() => saveNewHabit(input)),
    edit: (habit: Habit, name: string, target: number) => mutate(() => saveHabitDetails(habit, name, target)),
    setValue: (habit: Habit, day: string, value: number) => mutate(() => saveHabitEntry(habit, day, value)),
    increment: (habit: Habit, day: string) => mutate(() => saveHabitEntry(habit, day, 1, true)),
    remove: (id: string) => mutate(() => removeHabit(id)),
  };
}
