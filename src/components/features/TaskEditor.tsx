import { useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { ProjectCombobox } from "@/components/features/ProjectCombobox";
import {
  TASK_TITLE_MAX_LENGTH,
  validateTaskTitle,
} from "@/lib/workspace";
import type { Project, Task } from "@/types/task";

interface TaskEditorProps {
  task?: Task;
  projects: Project[];
  initialProjectId: string | null;
  onCancel: () => void;
  onSave: (title: string, projectId: string | null) => Promise<unknown>;
}

export function TaskEditor({
  task,
  projects,
  initialProjectId,
  onCancel,
  onSave,
}: TaskEditorProps) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [projectId, setProjectId] = useState(task?.projectId ?? initialProjectId);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 360)}px`;
  }, [title]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const validationError = validateTaskTitle(title);
    if (validationError) {
      setError(validationError);
      textareaRef.current?.focus();
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await onSave(title.trim(), projectId);
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : "This task could not be saved.",
      );
      textareaRef.current?.focus();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-5"
      aria-busy={isSaving}
    >
      <FieldGroup>
        <Field data-invalid={Boolean(error)}>
          <FieldLabel htmlFor="task-editor-title">Task</FieldLabel>
          <Textarea
            ref={textareaRef}
            id="task-editor-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="What needs to be done?"
            maxLength={TASK_TITLE_MAX_LENGTH}
            rows={4}
            autoFocus
            required
            disabled={isSaving}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "task-editor-error task-editor-count" : "task-editor-count"}
            className="max-h-[45dvh] overflow-y-auto whitespace-pre-wrap break-words"
          />
          <div className="flex items-start justify-between gap-3">
            <FieldError id="task-editor-error">{error}</FieldError>
            <span
              id="task-editor-count"
              className="ml-auto text-xs tabular-nums text-muted-foreground"
              aria-live="polite"
            >
              {title.length.toLocaleString()} /{" "}
              {TASK_TITLE_MAX_LENGTH.toLocaleString()}
            </span>
          </div>
        </Field>
        <Field>
          <FieldLabel htmlFor="task-editor-project">Project</FieldLabel>
          <ProjectCombobox
            id="task-editor-project"
            projects={projects}
            value={projectId}
            onValueChange={setProjectId}
            disabled={isSaving}
          />
        </Field>
      </FieldGroup>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSaving}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={Boolean(validateTaskTitle(title)) || isSaving}>
          {isSaving ? (
            <Loader2 data-icon="inline-start" className="animate-spin" />
          ) : null}
          {isSaving ? "Saving…" : task ? "Save changes" : "Create task"}
        </Button>
      </div>
    </form>
  );
}
