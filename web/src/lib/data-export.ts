import type { Capture } from "@/types/capture";
import type { Habit } from "@/types/habit";
import type { Knowledge } from "@/types/knowledge";
import type { Category, PomodoroHistoryEntry, Project, Task } from "@/types/task";

export interface DataExportInput {
  account: { id: string; email: string };
  projects: Project[];
  tasks: Task[];
  categories: Category[];
  captures: Capture[];
  knowledge: Knowledge[];
  habits: Habit[];
  focusHistory: PomodoroHistoryEntry[];
}

const iso = (time: number) => Number.isFinite(time) ? new Date(time).toISOString() : null;

/** One JSON document with everything this browser has loaded for the account. Times are ISO strings. */
export function buildDataExport(data: DataExportInput, now = new Date()) {
  return {
    format: "pokus-export", version: 1, exportedAt: now.toISOString(), account: data.account,
    projects: data.projects.map((project) => ({ ...project, createdAt: iso(project.createdAt) })),
    tasks: data.tasks.map((task) => ({ ...task, createdAt: iso(task.createdAt) })),
    categories: data.categories.map((category) => ({ ...category, createdAt: iso(category.createdAt), updatedAt: iso(category.updatedAt) })),
    // Captures saved offline are included and marked by `syncState`.
    captures: data.captures.map((capture) => ({ ...capture, createdAt: iso(capture.createdAt), updatedAt: iso(capture.updatedAt), reminderAt: capture.reminderAt ? iso(capture.reminderAt) : null })),
    knowledge: data.knowledge.map((note) => ({ ...note, createdAt: iso(note.createdAt), updatedAt: iso(note.updatedAt), nextReviewAt: note.nextReviewAt ? iso(note.nextReviewAt) : null })),
    habits: data.habits.map((habit) => ({ ...habit, createdAt: iso(habit.createdAt) })),
    focusHistory: data.focusHistory.map((entry) => ({ ...entry, completedAt: iso(entry.completedAt) })),
  };
}

export function downloadDataExport(data: DataExportInput, now = new Date()) {
  const blob = new Blob([JSON.stringify(buildDataExport(data, now), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `pokus-export-${now.toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
