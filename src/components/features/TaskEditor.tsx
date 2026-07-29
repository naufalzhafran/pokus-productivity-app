import { lazy, Suspense, useRef, useState, type FormEvent } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProjectCombobox } from "@/components/features/ProjectCombobox";
import { CategoryCombobox } from "@/components/features/CategoryCombobox";
import { CATEGORY_NAME_MAX_LENGTH, TASK_TITLE_MAX_LENGTH, validateTaskTitle } from "@/lib/workspace";
import type { Category, CategoryColor, CategoryInput, Project, Task, TaskInput, TaskPriority } from "@/types/task";

const RichTextEditor = lazy(() => import("@/components/features/RichTextEditor").then((module) => ({ default: module.RichTextEditor })));
const colors: CategoryColor[] = ["slate", "red", "orange", "amber", "green", "teal", "blue", "violet", "pink"];
const priorities: TaskPriority[] = ["none", "low", "medium", "high", "urgent"];
const priorityLabels: Record<TaskPriority, string> = { none: "No priority", low: "Low", medium: "Medium", high: "High", urgent: "Urgent" };
const colorLabels = Object.fromEntries(colors.map((color) => [color, color[0].toUpperCase() + color.slice(1)]));

interface TaskEditorProps {
  task?: Task;
  projects: Project[];
  categories?: Category[];
  initialProjectId: string | null;
  onCancel: () => void;
  onSave: (input: TaskInput) => Promise<unknown>;
  onCreateCategory?: (input: CategoryInput) => Promise<Category>;
}

export function TaskEditor({ task, projects, categories = [], initialProjectId, onCancel, onSave, onCreateCategory }: TaskEditorProps) {
  const [input, setInput] = useState<TaskInput>({
    title: task?.title ?? "", description: task?.description ?? "", projectId: task?.projectId ?? initialProjectId,
    priority: task?.priority ?? "none", categoryId: task?.categoryId ?? null,
  });
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [categoryColor, setCategoryColor] = useState<CategoryColor>("blue");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof TaskInput>(key: K, value: TaskInput[K]) => setInput((current) => ({ ...current, [key]: value }));
  const titleError = validateTaskTitle(input.title, task?.title);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (titleError) { setError(titleError); titleRef.current?.focus(); return; }
    setIsSaving(true); setError(null);
    try { await onSave(input); } catch (caught) { setError(caught instanceof Error ? caught.message : "This task could not be saved."); } finally { setIsSaving(false); }
  };

  const createCategory = async () => {
    if (!onCreateCategory) return;
    setIsSaving(true); setError(null);
    try { const category = await onCreateCategory({ name: categoryName, color: categoryColor }); set("categoryId", category.id); setCreatingCategory(false); setCategoryName(""); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Category could not be created."); }
    finally { setIsSaving(false); }
  };

  return <form onSubmit={submit} className="flex flex-col gap-5" aria-busy={isSaving}>
    <FieldGroup>
      <Field data-invalid={Boolean(error)}><FieldLabel htmlFor="task-editor-title">Task</FieldLabel>
        <Input ref={titleRef} id="task-editor-title" value={input.title} onChange={(event) => set("title", event.target.value)} placeholder="What needs to be done?" autoFocus required disabled={isSaving} aria-invalid={Boolean(error)} aria-describedby={error ? "task-editor-error" : undefined} />
        <div className="flex justify-between gap-3"><FieldError id="task-editor-error">{error}</FieldError><span className="text-xs text-muted-foreground">{input.title === task?.title ? "Legacy title preserved" : `${input.title.replace(/\s+/g, " ").trim().length} / ${TASK_TITLE_MAX_LENGTH}`}</span></div>
      </Field>
      <Field><FieldLabel>Task description</FieldLabel><Suspense fallback={<div className="h-48 animate-pulse rounded-2xl bg-muted" />}><RichTextEditor id="task-editor-description" label="Task description" placeholder="Add notes, links, or context…" value={input.description} onChange={(value) => set("description", value)} disabled={isSaving} /></Suspense></Field>
      <Field><FieldLabel htmlFor="task-editor-project">Project</FieldLabel><ProjectCombobox id="task-editor-project" projects={projects.filter((project) => !(project.isArchived ?? project.isDone) || project.id === task?.projectId)} value={input.projectId} onValueChange={(value) => set("projectId", value)} disabled={isSaving} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field><FieldLabel>Priority</FieldLabel><Select items={priorityLabels} value={input.priority} onValueChange={(value) => set("priority", value as TaskPriority)}><SelectTrigger aria-label="Task priority"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{priorities.map((value) => <SelectItem key={value} value={value}>{priorityLabels[value]}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
        <Field><FieldLabel htmlFor="task-editor-category">Category</FieldLabel><CategoryCombobox id="task-editor-category" categories={categories} value={input.categoryId} onValueChange={(value) => set("categoryId", value)} disabled={isSaving} /><Button type="button" variant="ghost" size="sm" onClick={() => setCreatingCategory((value) => !value)}><Plus data-icon="inline-start" />New category</Button></Field>
      </div>
      {creatingCategory ? <div className="grid gap-3 rounded-2xl border p-3 sm:grid-cols-[1fr_10rem_auto]"><Input aria-label="New category name" value={categoryName} maxLength={CATEGORY_NAME_MAX_LENGTH} onChange={(event) => setCategoryName(event.target.value)} placeholder="Category name" /><Select items={colorLabels} value={categoryColor} onValueChange={(value) => setCategoryColor(value as CategoryColor)}><SelectTrigger aria-label="Category color"><SelectValue /></SelectTrigger><SelectContent>{colors.map((color) => <SelectItem key={color} value={color}>{colorLabels[color]}</SelectItem>)}</SelectContent></Select><Button type="button" onClick={() => void createCategory()} disabled={!categoryName.trim() || isSaving}>Create</Button></div> : null}
    </FieldGroup>
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>Cancel</Button><Button type="submit" disabled={Boolean(titleError) || isSaving}>{isSaving ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}{isSaving ? "Saving…" : task ? "Save changes" : "Create task"}</Button></div>
  </form>;
}
