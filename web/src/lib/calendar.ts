import { captureDisplayTitle } from "@/lib/capture";
import { addHabitDays, habitComplete, validHabitDay } from "@/lib/habits";
import { getProjectStatus, isProjectArchived, localDateKey } from "@/lib/workspace";
import type { CalendarItems, CalendarSourceItem } from "@/types/calendar";
import type { Capture } from "@/types/capture";
import type { Habit } from "@/types/habit";
import type { Project, Task } from "@/types/task";

export function effectiveTaskDueDate(task: Task, project?: Project | null) {
  return task.dueDate || project?.dueDate || null;
}

/** Six Monday-first weeks, including the neighboring month's days. */
export function calendarMonthDays(day: string): string[] {
  if (!validHabitDay(day)) return [];
  const first = `${day.slice(0, 7)}-01`;
  const weekday = new Date(`${first}T12:00:00Z`).getUTCDay();
  const start = addHabitDays(first, -((weekday + 6) % 7));
  return Array.from({ length: 42 }, (_, index) => addHabitDays(start, index));
}

export function validReminderAt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 253_402_300_799_000;
}

export function reminderLocalDateTime(reminderAt: number | null | undefined): string {
  if (!validReminderAt(reminderAt)) return "";
  const date = new Date(reminderAt);
  return `${localDateKey(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** A nonexistent DST wall time is invalid instead of silently moving the reminder. */
export function parseReminderLocalDateTime(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) || !validHabitDay(value.slice(0, 10))) return null;
  const timestamp = new Date(value).getTime();
  return validReminderAt(timestamp) && reminderLocalDateTime(timestamp) === value ? timestamp : null;
}

function compareItems(a: CalendarSourceItem, b: CalendarSourceItem) {
  return (a.day ?? "").localeCompare(b.day ?? "") || Number(a.completed) - Number(b.completed) || (a.time ?? 0) - (b.time ?? 0) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
}

/** Whole days from `from` to `to`, both `YYYY-MM-DD`. */
export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

/** "Rolled over from Oct 7 · 3 days late" for a task carried to today. */
export function rolledOverLabel(from: string, today: string) {
  const late = daysBetween(from, today);
  const date = new Date(`${from}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
  return `Rolled over from ${date} · ${late} ${late === 1 ? "day" : "days"} late`;
}

/** Open tasks past their due date are placed on `today` with `rolledOverFrom` set; `overdue` holds the rest of the open past-due items. */
export function buildCalendarItems({ projects, tasks, habits, captures, startDay, endDay, today = localDateKey() }: {
  projects: Project[];
  tasks: Task[];
  habits: Habit[];
  captures: Capture[];
  startDay: string;
  endDay: string;
  today?: string;
}): CalendarItems {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const dated: CalendarSourceItem[] = [];
  const unscheduled: CalendarSourceItem[] = [];
  const add = (item: CalendarSourceItem) => {
    if (item.day && validHabitDay(item.day)) dated.push(item);
    else if (!item.completed) unscheduled.push({ ...item, day: null });
  };
  for (const project of projects) {
    if (isProjectArchived(project)) continue;
    add({ type: "project", id: project.id, source: project, project, title: project.title, day: project.dueDate || null, completed: getProjectStatus(project) === "completed" });
  }
  for (const task of tasks) {
    const project = task.projectId ? projectById.get(task.projectId) : undefined;
    if (isProjectArchived(project)) continue;
    const due = effectiveTaskDueDate(task, project);
    // Open past-due tasks roll over to today on screen; the saved due date stays as it is.
    const rolledOverFrom = !task.isDone && due && validHabitDay(due) && due < today ? due : undefined;
    add({ type: "task", id: task.id, source: task, project, title: task.title, day: rolledOverFrom ? today : due, inheritedDate: !task.dueDate && Boolean(project?.dueDate), rolledOverFrom, completed: task.isDone });
  }
  for (const capture of captures) {
    if (!validReminderAt(capture.reminderAt)) continue;
    dated.push({ type: "capture", id: capture.id, source: capture, title: captureDisplayTitle(capture), day: localDateKey(new Date(capture.reminderAt)), time: capture.reminderAt, completed: capture.reminderDone === true });
  }
  const items = dated.filter((item) => item.day! >= startDay && item.day! <= endDay);
  if (validHabitDay(startDay) && validHabitDay(endDay) && startDay <= endDay) {
    for (let day = startDay; day <= endDay; day = addHabitDays(day, 1)) {
      for (const habit of habits) {
        if (habit.startDay <= day) items.push({ type: "habit", id: habit.id, source: habit, title: habit.name, day, completed: habitComplete(habit, day) });
      }
    }
  }
  return {
    items: items.sort(compareItems),
    unscheduled: unscheduled.sort(compareItems),
    overdue: dated.filter((item) => !item.completed && item.day! < today).sort(compareItems),
  };
}
