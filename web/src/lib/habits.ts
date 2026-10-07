import type { Habit, HabitInput } from "@/types/habit";

export function habitDay(date = new Date()) {
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function dayDate(day: string) { return new Date(`${day}T12:00:00Z`); }
export function validHabitDay(day: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number(day.slice(0, 4)) >= 1 && !Number.isNaN(dayDate(day).valueOf()) && dayDate(day).toISOString().slice(0, 10) === day;
}
export function addHabitDays(day: string, count: number) {
  const date = dayDate(day); date.setUTCDate(date.getUTCDate() + count); return date.toISOString().slice(0, 10);
}
export function formatHabitDay(day: string) {
  return dayDate(day).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
export function habitTarget(habit: Habit, day: string) {
  return habit.kind === "check" ? 1 : [...habit.targets].reverse().find((revision) => revision.day <= day)?.target ?? 1;
}
export function habitFraction(habit: Habit, day: string) {
  return day < habit.startDay ? 0 : Math.min(1, Math.max(0, (habit.entries[day] ?? 0) / habitTarget(habit, day)));
}
export function habitComplete(habit: Habit, day: string) { return day >= habit.startDay && (habit.entries[day] ?? 0) >= habitTarget(habit, day); }
export function overallHabitProgress(habits: Habit[], day: string) {
  const eligible = habits.filter((habit) => habit.startDay <= day);
  const completed = eligible.filter((habit) => habitComplete(habit, day)).length;
  return { completed, total: eligible.length, fraction: eligible.length ? completed / eligible.length : 0 };
}
export function habitStreaks(habits: Habit[], today: string) {
  const days = new Set(habits.flatMap((habit) => Object.keys(habit.entries).filter((day) => day <= today && habitComplete(habit, day))));
  let current = 0; let longest = 0; let run = 0; let previous = "";
  for (const day of [...days].sort()) { run = previous && addHabitDays(previous, 1) === day ? run + 1 : 1; longest = Math.max(longest, run); previous = day; }
  let cursor = days.has(today) ? today : addHabitDays(today, -1);
  while (days.has(cursor)) { current++; cursor = addHabitDays(cursor, -1); }
  return { current, longest, completedDays: days.size };
}
export function habitYearDays(year: number) {
  const first = `${year}-01-01`; const last = `${year}-12-31`;
  const start = addHabitDays(first, -((dayDate(first).getUTCDay() + 6) % 7));
  const end = addHabitDays(last, 6 - ((dayDate(last).getUTCDay() + 6) % 7));
  const days: string[] = [];
  for (let day = start; day <= end; day = addHabitDays(day, 1)) days.push(day);
  return days;
}
export function parseHabitNumber(text: string, locale?: string) {
  const decimal = new Intl.NumberFormat(locale).formatToParts(1.1).find((part) => part.type === "decimal")?.value ?? ".";
  const normalized = text.trim().replace(decimal, ".");
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized); return Number.isFinite(value) && value >= 0 ? value : null;
}
export function validateHabitInput(input: HabitInput) {
  if (!input.name.trim()) throw new Error("Enter a habit name.");
  if (input.name.trim().length > 120 || input.unit.trim().length > 40) throw new Error("Use up to 120 characters for the name and 40 for the unit.");
  if (!["check", "number"].includes(input.kind)) throw new Error("Choose a habit type.");
  if (!Number.isFinite(input.target) || input.target <= 0) throw new Error("Enter a daily target greater than zero.");
}
export function createHabit(input: HabitInput, today: string, id: string, now = Date.now()): Habit {
  validateHabitInput(input);
  if (!validHabitDay(today)) throw new Error("Check your device date.");
  return { id, name: input.name.trim(), kind: input.kind, unit: input.kind === "number" ? input.unit.trim() : "", startDay: today, createdAt: now, entries: {}, targets: input.kind === "number" ? [{ day: today, target: input.target }] : [] };
}
export function editHabit(habit: Habit, name: string, target: number, today: string): Habit {
  validateHabitInput({ name, target, kind: habit.kind, unit: habit.unit });
  if (today < habit.startDay) throw new Error("This habit starts after today. Check your device date.");
  const targets = habit.kind === "number" && target !== habitTarget(habit, today)
    ? [...habit.targets.filter((revision) => revision.day !== today), { day: today, target }].sort((a, b) => a.day.localeCompare(b.day)) : habit.targets;
  return { ...habit, name: name.trim(), targets };
}
export function setHabitValue(habit: Habit, day: string, value: number, today: string): Habit {
  if (!validHabitDay(day) || day < habit.startDay || day > today) throw new Error("Choose a date between this habit's creation and today.");
  if (!Number.isFinite(value) || value < 0 || habit.kind === "check" && ![0, 1].includes(value)) throw new Error("Enter a valid daily total of zero or more.");
  return { ...habit, entries: { ...habit.entries, [day]: value } };
}
export function validateStoredHabits(value: unknown): Habit[] {
  if (!Array.isArray(value)) throw new Error("Your saved habit data couldn't be read. It has not been changed.");
  for (const habit of value) {
    if (!habit || typeof habit.id !== "string" || typeof habit.name !== "string" || typeof habit.unit !== "string" || !validHabitDay(habit.startDay) || !Number.isFinite(habit.createdAt) || !Array.isArray(habit.targets) || !habit.entries || typeof habit.entries !== "object" || Array.isArray(habit.entries)) throw new Error("Your saved habit data couldn't be read. It has not been changed.");
    validateHabitInput({ name: habit.name, kind: habit.kind, unit: habit.unit, target: 1 });
    if (habit.kind === "number" && !habit.targets.some((r: {day: string}) => r.day === habit.startDay)) throw new Error("The habit's starting target is missing.");
    for (const r of habit.targets) if (!r || !validHabitDay(r.day) || !Number.isFinite(r.target) || r.target <= 0) throw new Error("Your saved targets couldn't be read.");
    for (const [day, v] of Object.entries(habit.entries)) if (!validHabitDay(day) || day < habit.startDay || typeof v !== "number" || !Number.isFinite(v) || v < 0 || habit.kind === "check" && ![0,1].includes(v)) throw new Error("Your saved entries couldn't be read.");
  }
  if (new Set(value.map((habit) => habit.id)).size !== value.length) throw new Error("Duplicate habit identifiers in saved data.");
  return value as Habit[];
}
