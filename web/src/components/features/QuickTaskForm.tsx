import { useId, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { TASK_TITLE_MAX_LENGTH, validateTaskTitle } from "@/lib/workspace";

interface QuickTaskFormProps {
  label: string;
  placeholder?: string;
  submitLabel?: string;
  disabled?: boolean;
  /** Creates a task without a project. */
  onCreate: (title: string) => Promise<unknown>;
}

/** One line to add a task without a project, for the task picker and first run. */
export function QuickTaskForm({ label, placeholder = "What are you working on?", submitLabel = "Add task", disabled = false, onCreate }: QuickTaskFormProps) {
  const id = useId();
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const invalid = validateTaskTitle(title);
    if (invalid) { setError(invalid); return; }
    setSaving(true); setError(null);
    try { await onCreate(title); setTitle(""); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "The task could not be added."); }
    finally { setSaving(false); }
  };
  return <form onSubmit={submit} className="flex flex-col gap-1.5" aria-busy={saving}>
    <label htmlFor={id} className="text-sm font-medium">{label}</label>
    <div className="flex gap-2">
      <Input id={id} value={title} maxLength={TASK_TITLE_MAX_LENGTH} placeholder={placeholder} disabled={disabled || saving} onChange={(event) => { setTitle(event.target.value); setError(null); }}
        aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} />
      <Button type="submit" variant="outline" disabled={disabled || saving || !title.trim()}><Plus data-icon="inline-start" />{saving ? "Adding…" : submitLabel}</Button>
    </div>
    <FieldError id={`${id}-error`}>{error}</FieldError>
  </form>;
}
