import { Check, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { ResponsiveOverlay } from "@/components/features/ResponsiveOverlay";
import { habitComplete, habitTarget, parseHabitNumber, formatHabitDay } from "@/lib/habits";
import type { Habit } from "@/types/habit";

export function HabitDayList({ habits, day, disabled, canIncrement = true, onSet, onIncrement, onDetail }: {
  /** Adding 1 needs a connection; check-ins and totals can be saved offline. */
  habits: Habit[]; day: string; disabled: boolean; canIncrement?: boolean; onSet: (habit: Habit, value: number) => Promise<void>;
  onIncrement: (habit: Habit) => Promise<void>; onDetail: (habit: Habit) => void;
}) {
  const [editing, setEditing] = useState<Habit | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  return <>
    <ul className="divide-y rounded-xl border">
      {habits.filter((habit) => habit.startDay <= day).map((habit) => {
        const complete = habitComplete(habit, day); const amount = habit.entries[day] ?? 0;
        return <li key={habit.id} className="flex flex-wrap items-center gap-2 px-3 py-3 sm:px-5">
          <div className="min-w-0 flex-1"><Button variant="ghost" className="h-auto min-h-11 max-w-full justify-start whitespace-normal px-0 text-left" onClick={() => onDetail(habit)}>{habit.name}</Button>
            <p className="text-sm text-muted-foreground">{habit.kind === "check" ? complete ? "Done" : "Not done yet" : `${amount.toLocaleString()} / ${habitTarget(habit, day).toLocaleString()} ${habit.unit}`}</p>
          </div>
          {habit.kind === "check" ? <Button variant={complete ? "secondary" : "outline"} disabled={disabled} aria-label={`${complete ? "Uncheck" : "Complete"} ${habit.name}`} aria-pressed={complete} onClick={() => { void onSet(habit, complete ? 0 : 1).catch(() => {}); }}><Check data-icon="inline-start" />{complete ? "Done" : "Check in"}</Button>
            : <div className="flex gap-2"><Button variant="outline" disabled={disabled || !canIncrement} aria-label={`Add 1 to ${habit.name}`} onClick={() => { void onIncrement(habit).catch(() => {}); }}><Plus data-icon="inline-start" />1</Button><Button variant="outline" disabled={disabled} onClick={() => { setEditing(habit); setValue(String(amount)); setError(null); }} aria-label={`Set total for ${habit.name}`}>Set total</Button></div>}
        </li>;
      })}
    </ul>
    {editing && <ResponsiveOverlay open onOpenChange={(open) => { if (!open && !disabled) setEditing(null); }} title={`Total for ${editing.name}`} description={formatHabitDay(day)}>
      <form className="space-y-5" onSubmit={async (event) => {
        event.preventDefault(); const parsed = parseHabitNumber(value);
        if (parsed === null) { setError("Enter a number of zero or more."); return; }
        try { await onSet(editing, parsed); setEditing(null); } catch { setError("Could not save. Refresh to check the recorded total before trying again."); }
      }}><Field><FieldLabel htmlFor="habit-total">Daily total {editing.unit && `(${editing.unit})`}</FieldLabel><Input id="habit-total" autoFocus inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} disabled={disabled} /></Field>
        {error && <p role="alert" className="text-destructive">{error}</p>}<Button disabled={disabled} type="submit">{disabled ? "Saving…" : "Save total"}</Button></form>
    </ResponsiveOverlay>}
  </>;
}
