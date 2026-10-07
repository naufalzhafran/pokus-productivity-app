import { lazy, Suspense, useCallback, useDeferredValue, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { ListTodo, Plus, Search, Settings2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveOverlay } from "@/components/features/ResponsiveOverlay";
import { TaskRow } from "@/components/features/TaskRow";
import { selectProjectTasks, TASK_BATCH_SIZE, titlePreview, type PriorityFilter, type TaskSort, type TaskStatusFilter, type WorkspaceViewState } from "@/lib/workspace";
import type { Category, CategoryInput, Project, Task, TaskInput } from "@/types/task";

const TaskEditor = lazy(() => import("@/components/features/TaskEditor").then((module) => ({ default: module.TaskEditor })));
const TaskDetail = lazy(() => import("@/components/features/TaskDetail").then((module) => ({ default: module.TaskDetail })));

const taskStatusLabels = { open: "Open", completed: "Completed", all: "All statuses" };
const priorityFilterLabels = { all: "All priorities", none: "No priority", low: "Low", medium: "Medium", high: "High", urgent: "Urgent" };
const sortLabels: Record<TaskSort, string> = { smart: "Smart", priority: "Priority", newest: "Newest", oldest: "Oldest", alphabetical: "A–Z", focused: "Most focused" };
const defaultFilters = { status: "open", sort: "smart", priority: "all", categoryId: null } as const;

export interface ProjectTasksProps {
  readOnly: boolean;
  /** The project whose tasks are shown, or `null` for tasks without a project. */
  project: Project | null;
  tasks: Task[];
  projects: Project[];
  categories: Category[];
  viewState: WorkspaceViewState;
  setViewState: Dispatch<SetStateAction<WorkspaceViewState>>;
  canStartPomodoro: boolean;
  onCreateTask: (input: TaskInput) => Promise<unknown>;
  onEditTask: (id: string, input: TaskInput) => Promise<unknown>;
  onDeleteTask: (id: string) => Promise<unknown>;
  onStatusChange: (id: string, done: boolean) => Promise<unknown>;
  onStartPomodoro: (id: string) => void;
  onCreateCategory?: (input: CategoryInput) => Promise<Category>;
}

export function ProjectTasks({ readOnly, project, tasks, projects, categories, viewState, setViewState, canStartPomodoro, onCreateTask, onEditTask, onDeleteTask, onStatusChange, onStartPomodoro, onCreateCategory }: ProjectTasksProps) {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [visible, setVisible] = useState(TASK_BATCH_SIZE);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [editorTask, setEditorTask] = useState<Task | "new" | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [pending, setPending] = useState(new Set<string>());
  const pendingRef = useRef(new Set<string>());
  const [announcement, setAnnouncement] = useState("");
  const categoryMap = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const projectId = project?.id ?? null;
  const selected = useMemo(() => selectProjectTasks(tasks, projectId, viewState, deferredSearch, categoryMap), [categoryMap, deferredSearch, projectId, tasks, viewState]);
  const projectTaskCount = useMemo(() => tasks.filter((task) => task.projectId === projectId).length, [projectId, tasks]);
  const detailTask = tasks.find((task) => task.id === detailId);
  const categoryFilterLabels = useMemo(() => Object.fromEntries([["all", "All categories"], ...categories.map((category) => [category.id, category.name])]), [categories]);
  const activeFilterCount = [viewState.status !== "open", viewState.sort !== "smart", (viewState.priority ?? "all") !== "all", Boolean(viewState.categoryId)].filter(Boolean).length;
  const hasFilters = Boolean(search) || activeFilterCount > 0;

  const update = <K extends keyof WorkspaceViewState>(key: K, value: WorkspaceViewState[K]) => {
    setVisible(TASK_BATCH_SIZE);
    setViewState((current) => ({ ...current, [key]: value }));
  };
  const clearFilters = () => { setSearch(""); setViewState((current) => ({ ...current, ...defaultFilters })); };
  const mutate = useCallback(async (id: string, action: () => Promise<unknown>, message: string) => {
    if (pendingRef.current.has(id)) return;
    pendingRef.current = new Set(pendingRef.current).add(id);
    setPending(new Set(pendingRef.current));
    try {
      await action();
      setAnnouncement(message);
    } catch (error) {
      setAnnouncement(error instanceof Error ? error.message : "The change could not be saved. Try again.");
    } finally {
      const next = new Set(pendingRef.current);
      next.delete(id);
      pendingRef.current = next;
      setPending(next);
    }
  }, []);
  const confirmDelete = (task: Task) => {
    if (!window.confirm(`Delete ${titlePreview(task.title)}?`)) return;
    setDetailId(null);
    void mutate(task.id, () => onDeleteTask(task.id), "Task deleted.");
  };

  const filterSelects = ([
    { key: "status", label: "Task status", value: viewState.status, items: taskStatusLabels, width: "w-32" },
    { key: "priority", label: "Priority filter", value: viewState.priority ?? "all", items: priorityFilterLabels, width: "w-36" },
    { key: "categoryId", label: "Category filter", value: viewState.categoryId ?? "all", items: categoryFilterLabels, width: "w-36" },
    { key: "sort", label: "Sort tasks", value: viewState.sort, items: sortLabels, width: "w-32" },
  ] as const).map((filter) => ({
    ...filter,
    onChange: (value: string) => {
      if (filter.key === "status") update("status", value as TaskStatusFilter);
      if (filter.key === "priority") update("priority", value as PriorityFilter);
      if (filter.key === "sort") update("sort", value as TaskSort);
      if (filter.key === "categoryId") update("categoryId", value === "all" ? null : value);
    },
  }));
  const [emptyTitle, emptyDescription] = hasFilters && projectTaskCount
    ? ["No matching tasks", "Try a different search or clear your filters."]
    : projectTaskCount
      ? ["No open tasks", "Switch to All statuses to see completed tasks, or add a new task."]
      : ["No tasks yet", project ? "Add the first task to this project." : "Tasks without a project appear here."];

  return (
    <div className="flex flex-col gap-3">
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-48 flex-1">
          <span className="sr-only">Search tasks</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" enterKeyHint="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tasks" className="pl-9" />
        </label>
        <Button variant="outline" className="sm:hidden" onClick={() => setFiltersOpen(true)}><Settings2 />Filters ({activeFilterCount})</Button>
        <Button disabled={readOnly} onClick={() => setEditorTask("new")}><Plus />New task</Button>
      </div>
      <div className="hidden flex-wrap gap-2 sm:flex">
        {filterSelects.map((filter) => (
          <Select key={filter.key} items={filter.items} value={filter.value} onValueChange={(value) => filter.onChange(value as string)}>
            <SelectTrigger aria-label={filter.label} className={filter.width}><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>{Object.entries(filter.items as Record<string, string>).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        ))}
        {hasFilters ? <Button variant="ghost" onClick={clearFilters}><X />Clear</Button> : null}
      </div>
      <Card size="sm" className="gap-0 py-0">
        <CardContent className="p-0">
          {selected.length ? (
            <>
              <ul aria-label={`${project?.title ?? "No project"} tasks`}>
                {selected.slice(0, visible).map((task) => (
                  <TaskRow key={task.id} readOnly={readOnly} task={task} category={task.categoryId ? categoryMap.get(task.categoryId) : undefined}
                    pending={pending.has(task.id)} canFocus={canStartPomodoro}
                    onToggle={() => void mutate(task.id, () => onStatusChange(task.id, !task.isDone), task.isDone ? "Task reopened." : "Task completed.")}
                    onOpen={() => setDetailId(task.id)} onEdit={() => setEditorTask(task)} onDelete={() => confirmDelete(task)} onFocus={() => onStartPomodoro(task.id)} />
                ))}
              </ul>
              {visible < selected.length ? (
                <Button variant="ghost" className="m-3 w-[calc(100%-1.5rem)]" onClick={() => setVisible((value) => value + TASK_BATCH_SIZE)}>
                  Show {Math.min(TASK_BATCH_SIZE, selected.length - visible)} more
                </Button>
              ) : null}
            </>
          ) : (
            <Empty className="min-h-64">
              <EmptyHeader>
                <EmptyMedia variant="icon"><ListTodo /></EmptyMedia>
                <EmptyTitle>{emptyTitle}</EmptyTitle>
                <EmptyDescription>{emptyDescription}</EmptyDescription>
              </EmptyHeader>
              {hasFilters ? <Button variant="outline" onClick={clearFilters}>Clear filters</Button> : null}
            </Empty>
          )}
        </CardContent>
      </Card>
      <ResponsiveOverlay open={Boolean(editorTask)} onOpenChange={(open) => { if (!open) setEditorTask(null); }} title={editorTask === "new" ? "New task" : "Edit task"}>
        <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-muted" />}>
          <TaskEditor task={editorTask && editorTask !== "new" ? editorTask : undefined} projects={projects} categories={categories} initialProjectId={projectId}
            onCreateCategory={onCreateCategory} onCancel={() => setEditorTask(null)}
            onSave={async (input) => {
              if (editorTask === "new") await onCreateTask(input);
              else if (editorTask) await onEditTask(editorTask.id, input);
              setEditorTask(null);
              setAnnouncement(editorTask === "new" ? "Task created." : "Task saved.");
            }} />
        </Suspense>
      </ResponsiveOverlay>
      <ResponsiveOverlay open={Boolean(detailTask)} onOpenChange={(open) => { if (!open) setDetailId(null); }} title="Task details">
        <Suspense fallback={<p role="status">Loading task…</p>}>
          {detailTask ? (
            <TaskDetail readOnly={readOnly} task={detailTask} project={project ?? undefined} category={detailTask.categoryId ? categoryMap.get(detailTask.categoryId) : undefined}
              canFocus={canStartPomodoro} isPending={pending.has(detailTask.id)}
              onEdit={() => { setDetailId(null); setEditorTask(detailTask); }} onFocus={() => onStartPomodoro(detailTask.id)} onDelete={() => confirmDelete(detailTask)} />
          ) : null}
        </Suspense>
      </ResponsiveOverlay>
      <ResponsiveOverlay open={filtersOpen} onOpenChange={setFiltersOpen} title="Filter tasks">
        <div className="flex flex-col gap-4">
          {filterSelects.map((filter) => (
            <Field key={filter.key}>
              <FieldLabel>{filter.label}</FieldLabel>
              <Select items={filter.items} value={filter.value} onValueChange={(value) => filter.onChange(value as string)}>
                <SelectTrigger aria-label={filter.label} className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>{Object.entries(filter.items as Record<string, string>).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
            </Field>
          ))}
          <Button onClick={() => setFiltersOpen(false)}>Show tasks</Button>
          <Button variant="ghost" onClick={clearFilters}>Clear filters</Button>
        </div>
      </ResponsiveOverlay>
    </div>
  );
}
