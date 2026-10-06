import { useRef, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addHabitDays, formatHabitDay } from "@/lib/habits";
import { cn } from "@/lib/utils";
import { calendarMonthDays } from "@/lib/calendar";

function shiftMonth(day: string, offset: number) {
  const date = new Date(`${day.slice(0, 7)}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 10);
}

export function CalendarMonth({ day, today, markers, onSelect }: {
  day: string; today: string; markers: ReadonlyMap<string, string[]>; onSelect: (day: string) => void;
}) {
  const grid = useRef<HTMLDivElement>(null);
  const days = calendarMonthDays(day);
  const title = new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
  const keyDown = (event: KeyboardEvent<HTMLButtonElement>, value: string) => {
    let next: string;
    const weekday = (new Date(`${value}T12:00:00Z`).getUTCDay() + 6) % 7;
    switch (event.key) {
      case "ArrowLeft": next = addHabitDays(value, -1); break;
      case "ArrowRight": next = addHabitDays(value, 1); break;
      case "ArrowUp": next = addHabitDays(value, -7); break;
      case "ArrowDown": next = addHabitDays(value, 7); break;
      case "Home": next = addHabitDays(value, -weekday); break;
      case "End": next = addHabitDays(value, 6 - weekday); break;
      case "PageUp": next = shiftMonth(value, -1); break;
      case "PageDown": next = shiftMonth(value, 1); break;
      default: return;
    }
    event.preventDefault(); onSelect(next);
    requestAnimationFrame(() => grid.current?.querySelector<HTMLButtonElement>(`[data-day="${next}"]`)?.focus());
  };
  return <section aria-label="Choose a calendar date" className="min-w-0">
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="font-semibold" aria-live="polite">{title}</h2>
      <div className="flex gap-1"><Button size="icon" variant="ghost" aria-label="Previous month" onClick={() => onSelect(shiftMonth(day, -1))}><ChevronLeft /></Button><Button size="icon" variant="ghost" aria-label="Next month" onClick={() => onSelect(shiftMonth(day, 1))}><ChevronRight /></Button></div>
    </div>
    <div ref={grid} role="grid" aria-label={title} className="flex flex-col">
      <div role="row" className="grid grid-cols-7">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((name) => <div role="columnheader" key={name} className="py-2 text-center text-xs text-muted-foreground">{name}</div>)}</div>
      {Array.from({ length: 6 }, (_, week) => <div role="row" key={week} className="grid grid-cols-7">{days.slice(week * 7, week * 7 + 7).map((value) => {
        const sources = markers.get(value) ?? [];
        return <div key={value} role="gridcell" aria-selected={value === day}>
          <Button variant={value === day ? "default" : "ghost"} data-day={value} tabIndex={value === day ? 0 : -1} aria-current={value === today ? "date" : undefined} aria-label={`${formatHabitDay(value)}${value === today ? ", today" : ""}${sources.length ? `, ${sources.join(", ")}` : ", no scheduled items"}`} onKeyDown={(event) => keyDown(event, value)} onClick={() => onSelect(value)}
            className={cn("min-h-12 w-full min-w-0 flex-col gap-0.5 px-0 tabular-nums", value.slice(0, 7) !== day.slice(0, 7) && value !== day && "text-muted-foreground", value === today && value !== day && "ring-1 ring-inset ring-primary")}>
            {Number(value.slice(-2))}<span aria-hidden="true" className="flex h-1.5 gap-0.5">{sources.map((source) => <span key={source} className="size-1 rounded-full bg-current" />)}</span>
          </Button>
        </div>;
      })}</div>)}
    </div>
    <p className="mt-3 text-xs text-muted-foreground">Dots show the types of items scheduled that day.</p>
  </section>;
}
