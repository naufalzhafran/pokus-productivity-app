import { useEffect, useRef } from "react";
import { addHabitDays, formatHabitDay, habitDay, habitYearDays } from "@/lib/habits";
import { cn } from "@/lib/utils";

export function HabitActivity({ year, selected, firstDay, fraction, onSelect }: {
  year: number; selected: string; firstDay: string; fraction: (day: string) => number; onSelect: (day: string) => void;
}) {
  const grid = useRef<HTMLDivElement>(null);
  const today = habitDay();
  const days = habitYearDays(year);
  const focusDay = selected.slice(0, 4) === String(year) ? selected : days.find((day) => day >= firstDay && day.slice(0, 4) === String(year) && day <= today);
  useEffect(() => {
    const button = grid.current?.querySelector<HTMLButtonElement>(`[data-day="${focusDay}"]`);
    const scroller = grid.current?.parentElement;
    if (button && scroller) scroller.scrollLeft = button.offsetLeft - grid.current!.offsetLeft - scroller.clientWidth / 2;
  }, [focusDay]);
  return <div className="space-y-2">
    <p className="text-xs text-muted-foreground">Each column is a week, Monday to Sunday. Select a day to edit its entries.</p>
    <div className="overflow-x-auto rounded-lg border p-3">
      <div ref={grid} className="grid w-max grid-flow-col grid-rows-7 gap-1" aria-label={`${year} habit activity`}>
        {days.map((day) => {
          const value = fraction(day); const disabled = day < firstDay || day > today || day.slice(0, 4) !== String(year);
          return <button type="button" key={day} data-day={day} disabled={disabled} tabIndex={day === focusDay ? 0 : -1}
            className={cn("size-6 rounded-sm border border-transparent bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-30", value > 0 && "bg-primary/30", value >= 0.5 && "bg-primary/60", value >= 1 && "bg-primary", selected === day && "border-foreground")}
            aria-label={`${formatHabitDay(day)}, ${Math.round(value * 100)}% complete`} aria-pressed={selected === day} title={`${formatHabitDay(day)} · ${Math.round(value * 100)}%`}
            onClick={() => onSelect(day)} onKeyDown={(event) => {
              const offset = ({ ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 } as Record<string, number>)[event.key];
              if (offset === undefined) return;
              event.preventDefault(); const next = addHabitDays(day, offset);
              const button = grid.current?.querySelector<HTMLButtonElement>(`[data-day="${next}"]`);
              if (button && !button.disabled) button.focus();
            }} />;
        })}
      </div>
    </div>
    <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground"><span>Less</span>{["bg-muted", "bg-primary/30", "bg-primary/60", "bg-primary"].map((color) => <span key={color} className={cn("size-3 rounded-sm", color)} aria-hidden="true" />)}<span>More</span></div>
  </div>;
}
