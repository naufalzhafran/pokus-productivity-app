import { ClientResponseError, type RecordModel } from "pocketbase";
import { pb } from "@/lib/pocketbase";
import { createPocketBaseId, getAuthenticatedUserId } from "@/lib/pocketbase-records";
import { createHabit, editHabit, habitDay, setHabitValue, validateStoredHabits } from "@/lib/habits";
import type { Habit, HabitInput, HabitKind } from "@/types/habit";

interface HabitRecord extends RecordModel { name: string; kind: HabitKind; unit: string; startDay: string; created: string }
interface EntryRecord extends RecordModel { habit: string; day: string; value: number }
interface TargetRecord extends RecordModel { habit: string; day: string; target: number }

// The same habit/day has the same record id on every browser. A batch upsert
// prevents duplicate daily records, including simultaneous first check-ins.
async function dailyId(collection: string, habit: string, day: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${collection}:${habit}:${day}`));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 15);
}

async function existingOrDailyId(collection: string, habit: string, day: string) {
  try {
    const existing = await pb.collection(collection).getFirstListItem(pb.filter("habit = {:habit} && day = {:day}", { habit, day }), { requestKey: null });
    return existing.id;
  } catch (error) {
    if (!(error instanceof ClientResponseError) || error.status !== 404) throw error;
    return dailyId(collection, habit, day);
  }
}

export async function listHabits(): Promise<Habit[]> {
  const [habits, entries, targets] = await Promise.all([
    pb.collection("habits").getFullList<HabitRecord>({ sort: "created,id", requestKey: null }),
    pb.collection("habit_entries").getFullList<EntryRecord>({ requestKey: null }),
    pb.collection("habit_targets").getFullList<TargetRecord>({ sort: "day", requestKey: null }),
  ]);
  return validateStoredHabits(habits.map((habit) => ({
    id: habit.id, name: habit.name, kind: habit.kind, unit: habit.unit ?? "", startDay: habit.startDay,
    createdAt: Date.parse(habit.created),
    entries: Object.fromEntries(entries.filter((entry) => entry.habit === habit.id).map((entry) => [entry.day, entry.value])),
    targets: targets.filter((target) => target.habit === habit.id).map(({ day, target }) => ({ day, target })),
  })));
}

export async function saveNewHabit(input: HabitInput) {
  const owner = getAuthenticatedUserId();
  const habit = createHabit(input, habitDay(), createPocketBaseId());
  const batch = pb.createBatch();
  batch.collection("habits").create({ id: habit.id, owner, name: habit.name, kind: habit.kind, unit: habit.unit, startDay: habit.startDay });
  if (habit.kind === "number") batch.collection("habit_targets").create({
    id: await dailyId("habit_targets", habit.id, habit.startDay), owner, habit: habit.id, day: habit.startDay, target: input.target,
  });
  await batch.send({ requestKey: null });
  return habit;
}

export async function saveHabitDetails(habit: Habit, name: string, target: number) {
  const owner = getAuthenticatedUserId();
  const today = habitDay();
  const next = editHabit(habit, name, target, today);
  const batch = pb.createBatch();
  batch.collection("habits").update(habit.id, { name: next.name });
  // Always write today's intended target: another browser may have edited it.
  if (habit.kind === "number") batch.collection("habit_targets").upsert({
    id: await existingOrDailyId("habit_targets", habit.id, today), owner, habit: habit.id, day: today, target,
  });
  await batch.send({ requestKey: null });
}

export async function saveHabitEntry(habit: Habit, day: string, value: number, increment = false) {
  setHabitValue(habit, day, value, habitDay());
  if (increment && (habit.kind !== "number" || value !== 1)) throw new Error("Only numeric habits can be incremented.");
  const owner = getAuthenticatedUserId();
  const batch = pb.createBatch();
  batch.collection("habit_entries").upsert({
    id: await existingOrDailyId("habit_entries", habit.id, day), owner, habit: habit.id, day,
    ...(increment ? { "value+": 1 } : { value }),
  });
  await batch.send({ requestKey: null });
}

export async function removeHabit(id: string) {
  await pb.collection("habits").delete(id, { requestKey: null });
}
