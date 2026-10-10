import type { Capture } from "@/types/capture";
import type { Habit } from "@/types/habit";
import type { Project, Task } from "@/types/task";

interface CalendarItemBase {
  id: string;
  title: string;
  day: string | null;
  completed: boolean;
  project?: Project;
  inheritedDate?: boolean;
  /** The original due day of an open task shown on today because it is past due. */
  rolledOverFrom?: string;
  time?: number;
}

export type CalendarSourceItem = CalendarItemBase & (
  | { type: "project"; source: Project }
  | { type: "task"; source: Task }
  | { type: "habit"; source: Habit }
  | { type: "capture"; source: Capture }
);
export type CalendarItem = CalendarSourceItem;

export interface CalendarItems {
  items: CalendarSourceItem[];
  unscheduled: CalendarSourceItem[];
  overdue: CalendarSourceItem[];
}
