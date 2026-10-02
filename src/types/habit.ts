export type HabitKind = "check" | "number";
export interface Habit {
  id: string;
  name: string;
  kind: HabitKind;
  unit: string;
  startDay: string;
  createdAt: number;
  targets: { day: string; target: number }[];
  entries: Record<string, number>;
}
export interface HabitInput { name: string; kind: HabitKind; unit: string; target: number }
