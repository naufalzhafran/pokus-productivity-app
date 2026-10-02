import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useHabitReminderSettings } from "@/hooks/useHabitReminder";
import { pb } from "@/lib/pocketbase";

export function HabitReminder() {
  const { reminder, update } = useHabitReminderSettings(pb.authStore.record?.id ?? "anonymous");
  return <section className="space-y-3 border-t pt-5" aria-labelledby="habit-reminder-title"><div><h2 id="habit-reminder-title" className="text-sm font-semibold">Daily reminder</h2><p className="mt-1 text-sm text-muted-foreground">An in-app reminder while Pokus is open on this browser. Background and Lock Screen reminders require the native app.</p></div><div className="flex flex-wrap items-end gap-3"><Field className="w-36"><FieldLabel htmlFor="habit-reminder-time">Local time</FieldLabel><Input id="habit-reminder-time" type="time" value={reminder.time} onChange={(event) => { if (event.target.value) update({ ...reminder, time: event.target.value }); }} /></Field><Button variant="outline" aria-pressed={reminder.enabled} onClick={() => update({ ...reminder, enabled: !reminder.enabled })}>{reminder.enabled ? "Reminder on" : "Enable reminder"}</Button></div></section>;
}
