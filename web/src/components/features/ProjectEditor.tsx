import { lazy, Suspense, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmPrompt, type ConfirmRequest } from "@/components/features/ConfirmPrompt";
import { getProjectStatus, PROJECT_STATUS_LABELS, PROJECT_TITLE_MAX_LENGTH } from "@/lib/workspace";
import type { Project, ProjectInput, ProjectStatus } from "@/types/task";

const RichTextEditor = lazy(() => import("@/components/features/RichTextEditor").then((module) => ({ default: module.RichTextEditor })));

interface ProjectEditorProps {
  project?: Project;
  /** Open tasks in the project, used to confirm completing it. */
  openTaskCount?: number;
  onCancel: () => void;
  onSave: (input: ProjectInput) => Promise<unknown>;
}

export function ProjectEditor({ project, openTaskCount = 0, onCancel, onSave }: ProjectEditorProps) {
  const [input, setInput] = useState<ProjectInput>({
    title: project?.title ?? "",
    description: project?.description ?? "",
    status: project ? getProjectStatus(project) : "active",
    dueDate: project?.dueDate ?? null,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

  const submit = async (event?: FormEvent, confirmed = false) => {
    event?.preventDefault();
    const title = input.title.trim();
    if (!title || title.length > PROJECT_TITLE_MAX_LENGTH) {
      setError("Enter a project name up to 120 characters.");
      return;
    }
    const completing = input.status === "completed" && (!project || getProjectStatus(project) !== "completed");
    if (completing && openTaskCount && !confirmed) {
      setConfirm({ title: "Complete this project?", description: `It still has ${openTaskCount} open ${openTaskCount === 1 ? "task" : "tasks"}. They stay open and keep their dates.`, confirmLabel: "Mark completed", destructive: false, onConfirm: () => void submit(undefined, true) });
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ ...input, title });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Project could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <Field>
        <FieldLabel htmlFor="project-title">Project name</FieldLabel>
        <Input id="project-title" value={input.title} onChange={(event) => setInput((value) => ({ ...value, title: event.target.value }))} autoFocus />
        <FieldError>{error}</FieldError>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel>Lifecycle status</FieldLabel>
          <Select items={PROJECT_STATUS_LABELS} value={input.status} onValueChange={(value) => setInput((current) => ({ ...current, status: value as ProjectStatus }))}>
            <SelectTrigger aria-label="Project lifecycle status" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(PROJECT_STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="project-due-date">Due date</FieldLabel>
          <Input id="project-due-date" type="date" value={input.dueDate ?? ""} onChange={(event) => setInput((current) => ({ ...current, dueDate: event.target.value || null }))} />
        </Field>
      </div>
      <Field>
        <FieldLabel>Description</FieldLabel>
        <Suspense fallback={<div className="h-48 animate-pulse rounded-2xl bg-muted" />}>
          <RichTextEditor id="project-description" value={input.description} onChange={(description) => setInput((value) => ({ ...value, description }))} disabled={saving} />
        </Suspense>
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={saving}>{saving ? "Saving…" : project ? "Save changes" : "Create project"}</Button>
      </div>
      <ConfirmPrompt request={confirm} onClose={() => setConfirm(null)} />
    </form>
  );
}
