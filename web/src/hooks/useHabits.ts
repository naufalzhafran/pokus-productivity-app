import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClientResponseError } from "pocketbase";
import { useCachedResource } from "@/hooks/useCachedResource";
import { requireConnection } from "@/hooks/useConnectivity";
import { listHabits, removeHabit, saveHabitDetails, saveHabitEntry, saveNewHabit } from "@/lib/habit-records";
import { applyQueuedEntries, queueHabitEntry, readQueuedHabitEntries, removeQueuedHabitEntry, type QueuedHabitEntry } from "@/lib/habit-queue";
import { habitDay, setHabitValue } from "@/lib/habits";
import { pb } from "@/lib/pocketbase";
import type { Habit, HabitInput } from "@/types/habit";

const canSync = (owner: string) => navigator.onLine && pb.authStore.isValid && pb.authStore.record?.id === owner;
/** Failures that never reached the server, or need a new sign-in, keep queued values for later. */
const isRetryable = (error: unknown) => error instanceof TypeError || (error instanceof ClientResponseError && (error.status === 0 || error.status === 401));

export function useHabits() {
  const owner = pb.authStore.record?.id ?? "anonymous";
  const resource = useCachedResource("habits", listHabits);
  const { replace, itemsRef } = resource;
  const locked = useRef(false);
  const flushing = useRef<Promise<void> | null>(null);
  const [saving, setSaving] = useState(false);
  const [queued, setQueued] = useState<QueuedHabitEntry[]>([]);
  const [syncError, setSyncError] = useState<{ message: string; snapshot: Habit[] } | null>(null);

  /** Replays absolute values saved offline, oldest first. Each is an idempotent upsert, so a retry can't double count. */
  const flush = useCallback(() => {
    flushing.current ??= (async () => {
      try {
        const entries = await readQueuedHabitEntries(owner);
        if (!entries.length || !canSync(owner)) return;
        for (const entry of entries) {
          const habit = itemsRef.current.find((item) => item.id === entry.habitId);
          try { if (habit) await saveHabitEntry(habit, entry.day, entry.value); }
          catch (error) { if (isRetryable(error)) return; /* A deleted habit or an invalid day can't be saved; drop it. */ }
          await removeQueuedHabitEntry(owner, entry);
        }
        try { replace(await listHabits()); } catch { /* The next refresh shows the saved totals. */ }
      } catch { /* Device storage is unavailable; the next trigger retries. */ }
      finally {
        flushing.current = null;
        setQueued(await readQueuedHabitEntries(owner).catch(() => []));
      }
    })();
    return flushing.current;
  }, [itemsRef, owner, replace]);

  useEffect(() => {
    let alive = true;
    void readQueuedHabitEntries(owner).then((items) => { if (alive) setQueued(items); }).catch(() => undefined).finally(() => { if (alive) void flush(); });
    const retry = () => { if (document.visibilityState !== "hidden") void flush(); };
    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", retry);
    return () => { alive = false; window.removeEventListener("online", retry); document.removeEventListener("visibilitychange", retry); };
  }, [flush, owner]);

  async function mutate(write: () => Promise<unknown>) {
    requireConnection();
    if (locked.current) throw new Error("Wait for the current habit change to finish.");
    locked.current = true; setSaving(true); setSyncError(null);
    try {
      // Offline values land first, so a later increment builds on them instead of being overwritten.
      await flush();
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

  /** Check-ins and totals are absolute values: online they save now, offline they wait on this device. */
  async function setValue(habit: Habit, day: string, value: number) {
    if (canSync(owner)) return mutate(() => saveHabitEntry(habit, day, value));
    setHabitValue(habit, day, value, habitDay());
    if (!pb.authStore.record) throw new Error("Sign in to record habits.");
    setQueued(await queueHabitEntry(pb.authStore.record.id, { habitId: habit.id, day, value }));
  }

  const habits = useMemo(() => applyQueuedEntries(resource.items, queued), [queued, resource.items]);
  return {
    habits, isLoading: resource.isLoading, loadError: resource.loadError ?? (syncError?.snapshot === resource.items ? syncError.message : null), saving,
    /** Values saved on this device and waiting to sync. */
    pendingCount: queued.length,
    create: (input: HabitInput) => mutate(() => saveNewHabit(input)),
    edit: (habit: Habit, name: string, target: number) => mutate(() => saveHabitDetails(habit, name, target)),
    setValue,
    increment: (habit: Habit, day: string) => mutate(() => saveHabitEntry(habit, day, 1, true)),
    remove: (id: string) => mutate(() => removeHabit(id)),
  };
}
