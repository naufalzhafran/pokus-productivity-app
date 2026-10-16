import { daysBetween, effectiveTaskDueDate } from "@/lib/calendar";
import { addHabitDays, validHabitDay } from "@/lib/habits";
import { isProjectArchived } from "@/lib/workspace";
import type { Project, Task, TaskEffort, TaskPriority } from "@/types/task";

/** Pokus a task is expected to take; unset effort counts as small. */
export const EFFORT_COST: Record<TaskEffort, number> = { small: 1, medium: 2, large: 4 };
/** Days before the due date a task starts showing up in the plan. */
const EFFORT_LEAD_DAYS: Record<TaskEffort, number> = { small: 0, medium: 1, large: 3 };
const PRIORITY_LEAD_DAYS: Record<TaskPriority, number> = { none: 0, low: 0, medium: 0, high: 1, urgent: 2 };
const PRIORITY_RANK: Record<TaskPriority, number> = { none: 0, low: 1, medium: 2, high: 3, urgent: 4 };
const EFFORT_RANK: Record<TaskEffort, number> = { small: 0, medium: 1, large: 2 };

export const DEFAULT_DAILY_CAPACITY = 6;
export const PLAN_DAYS = 14;

/** `overdue` and `due` are must-do work; `early` starts ahead of its due date; `filler` is undated high-priority work. */
export type PlanReason = "overdue" | "due" | "early" | "filler";

export interface PlanEntry {
  task: Task;
  project?: Project;
  /** Effective due date, or null for filler. */
  due: string | null;
  reason: PlanReason;
  cost: number;
}

export interface PlanDay {
  day: string;
  entries: PlanEntry[];
  /** Pokus planned; above `capacity` only when must-do work overflows. */
  used: number;
  capacity: number;
}

interface Candidate { task: Task; project?: Project; due: string | null; start: string | null; cost: number }

function compareCandidates(a: Candidate, b: Candidate) {
  return (a.due ?? "9999-99-99").localeCompare(b.due ?? "9999-99-99")
    || PRIORITY_RANK[b.task.priority ?? "none"] - PRIORITY_RANK[a.task.priority ?? "none"]
    || EFFORT_RANK[b.task.effort ?? "small"] - EFFORT_RANK[a.task.effort ?? "small"]
    || a.task.title.localeCompare(b.task.title) || a.task.id.localeCompare(b.task.id);
}

/**
 * Spreads open tasks over `days` days from `today`. Work due on or before a day is always placed on it;
 * other tasks start once their lead window opens (bigger and higher-priority work opens earlier) and fill the
 * day up to `capacity` Pokus, otherwise carrying over. Today alone also takes undated high and urgent tasks.
 */
export function planDays({ tasks, projects, today, days = PLAN_DAYS, capacity = DEFAULT_DAILY_CAPACITY }: {
  tasks: Task[];
  projects: Project[];
  today: string;
  days?: number;
  capacity?: number;
}): PlanDay[] {
  if (!validHabitDay(today)) return [];
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const pending: Candidate[] = [];
  for (const task of tasks) {
    const project = task.projectId ? projectById.get(task.projectId) : undefined;
    if (task.isDone || isProjectArchived(project)) continue;
    const effort = task.effort ?? "small";
    const dueValue = effectiveTaskDueDate(task, project);
    const due = dueValue && validHabitDay(dueValue) ? dueValue : null;
    const start = due ? addHabitDays(due, -(EFFORT_LEAD_DAYS[effort] + PRIORITY_LEAD_DAYS[task.priority ?? "none"])) : null;
    pending.push({ task, project, due, start, cost: EFFORT_COST[effort] });
  }
  pending.sort(compareCandidates);

  const plan: PlanDay[] = [];
  const placed = new Set<string>();
  for (let index = 0; index < days; index += 1) {
    const day = addHabitDays(today, index);
    const entries: PlanEntry[] = [];
    let used = 0;
    const place = (candidate: Candidate, reason: PlanReason) => {
      placed.add(candidate.task.id);
      entries.push({ task: candidate.task, project: candidate.project, due: candidate.due, reason, cost: candidate.cost });
      used += candidate.cost;
    };
    const open = pending.filter((candidate) => !placed.has(candidate.task.id));
    for (const candidate of open) {
      if (candidate.due && candidate.due <= day) place(candidate, candidate.due < today ? "overdue" : "due");
    }
    for (const candidate of open) {
      if (!placed.has(candidate.task.id) && candidate.start && candidate.start <= day && used + candidate.cost <= capacity) place(candidate, "early");
    }
    if (index === 0) {
      for (const candidate of open) {
        const priority = candidate.task.priority ?? "none";
        if (!candidate.due && (priority === "high" || priority === "urgent") && used + candidate.cost <= capacity) place(candidate, "filler");
      }
    }
    plan.push({ day, entries, used, capacity });
  }
  return plan;
}

function shortDate(day: string, options: Intl.DateTimeFormatOptions) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { ...options, timeZone: "UTC" });
}

/** Why a task is on `day`'s plan, such as "Due Fri · start early". */
export function planReasonLabel(entry: PlanEntry, day: string) {
  if (entry.reason === "filler") return entry.task.priority === "urgent" ? "Urgent, no date" : "High priority, no date";
  if (!entry.due) return "";
  if (entry.reason === "overdue") {
    const late = daysBetween(entry.due, day);
    return `${late} ${late === 1 ? "day" : "days"} late`;
  }
  if (entry.reason === "due") return entry.due === day ? "Due today" : `Due ${shortDate(entry.due, { month: "short", day: "numeric" })}`;
  const ahead = daysBetween(day, entry.due);
  const when = ahead === 1 ? "tomorrow" : ahead <= 6 ? shortDate(entry.due, { weekday: "short" }) : shortDate(entry.due, { month: "short", day: "numeric" });
  return `Due ${when} · start early`;
}
