import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Capture } from "@/types/capture";
import type { CaptureStore } from "@/hooks/useCaptures";
import { parseReminderLocalDateTime, reminderLocalDateTime } from "@/lib/calendar";

export function CaptureReminderEditor({ capture, store, readOnly = false, onClose }: {
  capture: Capture; store: Pick<CaptureStore, "setCaptureReminder" | "setCaptureReminderDone">;
  readOnly?: boolean; onClose: () => void;
}) {
  const [dateTime, setDateTime] = useState(() => reminderLocalDateTime(capture.reminderAt || Date.now() + 3_600_000));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const perform = async (action: () => Promise<unknown>) => {
    setSaving(true); setError(null);
    try { await action(); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The reminder could not be saved."); }
    finally { setSaving(false); }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const instant = parseReminderLocalDateTime(dateTime);
    if (instant === null || instant <= Date.now()) {
      setError("Choose a valid date and time in the future."); return;
    }
    void perform(() => store.setCaptureReminder(capture.id, instant));
  };
  return <form onSubmit={submit} className="flex flex-col gap-5" aria-busy={saving}>
    <FieldGroup>
      <Field data-invalid={Boolean(error)}><FieldLabel htmlFor="capture-reminder-time">Remind me on</FieldLabel>
        <Input id="capture-reminder-time" type="datetime-local" value={dateTime} onChange={(event) => setDateTime(event.target.value)} required disabled={readOnly || saving} aria-invalid={Boolean(error)} aria-describedby="capture-reminder-error" />
        <FieldError id="capture-reminder-error">{error}</FieldError>
      </Field>
      <p className="text-sm text-muted-foreground">{Intl.DateTimeFormat().resolvedOptions().timeZone}. Web reminders appear while Pokus is open. Open the native app to sync changes to this reminder’s phone alert.</p>
      {capture.reminderAt ? <p className="text-sm">{capture.reminderDone ? "Reminder completed" : "Reminder pending"} · {new Date(capture.reminderAt).toLocaleString()}</p> : null}
    </FieldGroup>
    {capture.reminderAt ? <div className="flex flex-wrap gap-2">
      <Button variant="outline" type="button" disabled={readOnly || saving} onClick={() => void perform(() => store.setCaptureReminderDone(capture.id, !capture.reminderDone))}>{capture.reminderDone ? "Reopen reminder" : "Complete reminder"}</Button>
      <Button variant="outline" type="button" disabled={readOnly || saving} onClick={() => void perform(() => store.setCaptureReminder(capture.id, null))}>Remove reminder</Button>
    </div> : null}
    <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" type="button" disabled={saving} onClick={onClose}>Close</Button><Button type="submit" disabled={readOnly || saving}>{saving ? "Saving…" : capture.reminderAt ? "Reschedule reminder" : "Add reminder"}</Button></div>
  </form>;
}
