import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ResponsiveOverlay } from "@/components/features/ResponsiveOverlay";
import { habitDay, habitTarget, parseHabitNumber, validateHabitInput } from "@/lib/habits";
import type { Habit, HabitInput, HabitKind } from "@/types/habit";

export function HabitEditor({ habit, saving, onSave, onClose }: {
  habit: Habit | null; saving: boolean; onSave: (input: HabitInput) => Promise<void>; onClose: () => void;
}) {
  const [name, setName] = useState(habit?.name ?? "");
  const [kind, setKind] = useState<HabitKind>(habit?.kind ?? "check");
  const [unit, setUnit] = useState(habit?.unit ?? "");
  const [target, setTarget] = useState(String(habit ? habitTarget(habit, habitDay()) : 1));
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(null);
    const value = kind === "check" ? 1 : parseHabitNumber(target);
    if (value === null || value <= 0) { setError("Enter a daily target greater than zero."); return; }
    try { const input = { name, kind, unit, target: value }; validateHabitInput(input); await onSave(input); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save this habit. Refresh and try again."); }
  }
  return <ResponsiveOverlay open onOpenChange={(open) => { if (!open && !saving) onClose(); }} title={habit ? "Edit habit" : "New habit"} description={habit ? "Target changes apply from today. Earlier days keep their original targets." : "Choose something you want to do every day."}>
    <form onSubmit={submit} className="space-y-6">
      <FieldGroup>
        <Field><FieldLabel htmlFor="habit-name">Name</FieldLabel><Input id="habit-name" autoFocus required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} disabled={saving} /></Field>
        {!habit && <Field><FieldLabel>Track as</FieldLabel><ToggleGroup value={[kind]} onValueChange={(values) => { if (values[0]) setKind(values[0] as HabitKind); }} disabled={saving} aria-label="Habit type" variant="outline"><ToggleGroupItem value="check">Check-in</ToggleGroupItem><ToggleGroupItem value="number">Daily total</ToggleGroupItem></ToggleGroup><FieldDescription>A check-in is done or not done. A daily total measures an amount.</FieldDescription></Field>}
        {kind === "number" && <>
          <Field><FieldLabel htmlFor="habit-target">Daily target</FieldLabel><Input id="habit-target" inputMode="decimal" required value={target} onChange={(event) => setTarget(event.target.value)} disabled={saving} /></Field>
          <Field><FieldLabel htmlFor="habit-unit">Unit (optional)</FieldLabel><Input id="habit-unit" maxLength={40} value={unit} onChange={(event) => setUnit(event.target.value)} disabled={!!habit || saving} placeholder="pages, minutes, glasses…" /><FieldDescription>The type and unit stay the same after creation.</FieldDescription></Field>
        </>}
      </FieldGroup>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save habit"}</Button></div>
    </form>
  </ResponsiveOverlay>;
}
