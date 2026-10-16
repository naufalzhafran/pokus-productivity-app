import { lazy, Suspense, useRef, useState, type FormEvent } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProjectCombobox } from "@/components/features/ProjectCombobox";
import { CategoryCombobox } from "@/components/features/CategoryCombobox";
import { CATEGORY_NAME_MAX_LENGTH, EFFORT_LABELS, PRIORITY_LABELS, TASK_EFFORTS, TASK_PRIORITIES, TASK_TITLE_MAX_LENGTH, validateTaskTitle } from "@/lib/workspace";
import type { Category, CategoryColor, CategoryInput, Project, Task, TaskEffort, TaskInput, TaskPriority } from "@/types/task";

const RichTextEditor = lazy(() => import("@/components/features/RichTextEditor").then((module) => ({ default: module.RichTextEditor })));
const colors: CategoryColor[] = ["slate", "red", "orange", "amber", "green", "teal", "blue", "violet", "pink"];
const colorLabels = Object.fromEntries(colors.map((color) => [color, color[0].toUpperCase() + color.slice(1)]));

interface TaskEditorProps {
  task?: Task;
  projects: Project[];
  categories?: Category[];
  initialProjectId: string | null;
  /** The due date a new task starts with, such as the selected calendar day. */
  initialDueDate?: string | null;
  /** The priority and category a new task starts with, such as its project's. */
  initialPriority?: TaskPriority;
  initialCategoryId?: string | null;
  onCancel: () => void;
  onSave: (input: TaskInput) => Promise<unknown>;
  onCreateCategory?: (input: CategoryInput) => Promise<Category>;
}

export function TaskEditor({ task, projects, categories = [], initialProjectId, initialDueDate = null, initialPriority = "none", initialCategoryId = null, onCancel, onSave, onCreateCategory }: TaskEditorProps) {
  const [input, setInput] = useState<TaskInput>({
    title: task?.title ?? "", description: task?.description ?? "", projectId: task ? task.projectId : initialProjectId,
    priority: task ? task.priority ?? "none" : initialPriority, categoryId: task ? task.categoryId ?? null : initialCategoryId,
    dueDate: task ? task.dueDate ?? null : initialDueDate,
    effort: task?.effort ?? null,
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
        <div className="flex justify-between gap-3"><FieldError id="task-editor-error">{error}</FieldError><span className="text-xs text-muted-foreground">{input.title === task?.title && input.title.replace(/\s+/g, " ").trim().length > TASK_TITLE_MAX_LENGTH ? "You can keep this title or shorten it." : `${input.title.replace(/\s+/g, " ").trim().length} / ${TASK_TITLE_MAX_LENGTH}`}</span></div>
      </Field>
      <Field><FieldLabel>Task description</FieldLabel><Suspense fallback={<div className="h-48 animate-pulse rounded-2xl bg-muted" />}><RichTextEditor id="task-editor-description" label="Task description" placeholder="Add notes, links, or context…" value={input.description} onChange={(value) => set("description", value)} disabled={isSaving} /></Suspense></Field>
      <Field><FieldLabel htmlFor="task-editor-project">Project</FieldLabel><ProjectCombobox id="task-editor-project" projects={projects.filter((project) => !(project.isArchived ?? project.isDone) || project.id === task?.projectId)} value={input.projectId} onValueChange={(value) => set("projectId", value)} disabled={isSaving} /></Field>
      <Field><FieldLabel htmlFor="task-editor-due">Task due date</FieldLabel><Input id="task-editor-due" type="date" value={input.dueDate ?? ""} onChange={(event) => set("dueDate", event.target.value || null)} disabled={isSaving} /><p className="text-sm text-muted-foreground">{input.dueDate ? "This date overrides the project deadline." : projects.find((project) => project.id === input.projectId)?.dueDate ? `From project: ${projects.find((project) => project.id === input.projectId)?.dueDate}. Leave empty to use the project deadline.` : "Leave empty to keep this task unscheduled."}</p></Field>
      <Field><FieldLabel>Effort</FieldLabel><Select disabled={isSaving} items={{ unset: "Not set", ...EFFORT_LABELS }} value={input.effort ?? "unset"} onValueChange={(value) => set("effort", value === "unset" ? null : value as TaskEffort)}><SelectTrigger aria-label="Task effort"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="unset">Not set</SelectItem>{TASK_EFFORTS.map((value) => <SelectItem key={value} value={value}>{EFFORT_LABELS[value]}</SelectItem>)}</SelectGroup></SelectContent></Select><p className="text-sm text-muted-foreground">About 1, 2, or 4 Pokus. Bigger tasks show up on Today a few days before they’re due.</p></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field><FieldLabel>Priority</FieldLabel><Select disabled={isSaving} items={PRIORITY_LABELS} value={input.priority} onValueChange={(value) => set("priority", value as TaskPriority)}><SelectTrigger aria-label="Task priority"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{TASK_PRIORITIES.map((value) => <SelectItem key={value} value={value}>{PRIORITY_LABELS[value]}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
        <Field><FieldLabel htmlFor="task-editor-category">Category</FieldLabel><CategoryCombobox id="task-editor-category" categories={categories} value={input.categoryId} onValueChange={(value) => set("categoryId", value)} disabled={isSaving} />{onCreateCategory ? <Button type="button" variant="ghost" size="sm" disabled={isSaving} aria-expanded={creatingCategory} onClick={() => setCreatingCategory((value) => !value)}><Plus data-icon="inline-start" />{creatingCategory ? "Cancel new category" : "New category"}</Button> : null}</Field>
      </div>
      {creatingCategory ? <div className="grid gap-3 rounded-2xl border p-3 sm:grid-cols-[1fr_10rem_auto]"><Input disabled={isSaving} aria-label="New category name" value={categoryName} maxLength={CATEGORY_NAME_MAX_LENGTH} onChange={(event) => setCategoryName(event.target.value)} placeholder="Category name" /><Select disabled={isSaving} items={colorLabels} value={categoryColor} onValueChange={(value) => setCategoryColor(value as CategoryColor)}><SelectTrigger aria-label="Category color"><SelectValue /></SelectTrigger><SelectContent>{colors.map((color) => <SelectItem key={color} value={color}>{colorLabels[color]}</SelectItem>)}</SelectContent></Select><Button type="button" onClick={() => void createCategory()} disabled={!categoryName.trim() || isSaving}>Create</Button></div> : null}
    </FieldGroup>
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>Cancel</Button><Button type="submit" disabled={Boolean(titleError) || isSaving}>{isSaving ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}{isSaving ? "Saving…" : task ? "Save changes" : "Create task"}</Button></div>
  </form>;
}
