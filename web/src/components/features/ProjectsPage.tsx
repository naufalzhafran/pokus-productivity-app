import { lazy, Suspense, useDeferredValue, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { FolderPlus, FolderSearch, ListChecks, Plus, Search, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CategoryManager } from "@/components/features/CategoryManager";
import { ProjectCard } from "@/components/features/ProjectCard";
import { ResponsiveOverlay } from "@/components/features/ResponsiveOverlay";
import { projectHash } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { buildProjectStats, countProjectsByFilter, localDateKey, PROJECT_LIST_FILTERS, selectProjects, type ProjectListFilter, type WorkspaceViewState } from "@/lib/workspace";
import type { Category, CategoryInput, Project, ProjectInput, Task, TaskInput } from "@/types/task";

const ProjectEditor = lazy(() => import("@/components/features/ProjectEditor").then((module) => ({ default: module.ProjectEditor })));
const TaskEditor = lazy(() => import("@/components/features/TaskEditor").then((module) => ({ default: module.TaskEditor })));

const filterLabels: Record<ProjectListFilter, string> = { open: "Open", active: "Active", planned: "Planned", on_hold: "On hold", completed: "Completed", due: "Due soon", archived: "Archived" };

interface ProjectsPageProps {
  readOnly: boolean;
  projects: Project[];
  tasks: Task[];
  categories: Category[];
  viewState: WorkspaceViewState;
  setViewState: Dispatch<SetStateAction<WorkspaceViewState>>;
  onCreateProject: (input: ProjectInput) => Promise<Project | null>;
  onOpenProject: (id: string) => void;
  onUpdateCategory: (id: string, input: CategoryInput) => Promise<unknown>;
  onDeleteCategory: (id: string) => Promise<unknown>;
  /** Ids of captures that still exist, so deleted captures aren't counted. */
  captureIds?: ReadonlySet<string>;
  /** Adds a task; the project is optional. */
  onCreateTask?: (input: TaskInput) => Promise<unknown>;
  onCreateCategory?: (input: CategoryInput) => Promise<Category>;
}

export function ProjectsPage({ readOnly, projects, tasks, categories, viewState, setViewState, onCreateProject, onOpenProject, onUpdateCategory, onDeleteCategory, captureIds, onCreateTask, onCreateCategory }: ProjectsPageProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [creating, setCreating] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const [managingCategories, setManagingCategories] = useState(false);
  const today = localDateKey();
  const filter = viewState.projectFilter;
  // A category that no longer exists falls back to every category.
  const category = viewState.projectCategory && (viewState.projectCategory === "none" || categories.some((item) => item.id === viewState.projectCategory)) ? viewState.projectCategory : "all";
  const categoryMap = useMemo(() => new Map(categories.map((item) => [item.id, item])), [categories]);
  const categoryLabels = useMemo<Record<string, string>>(() => Object.fromEntries([["all", "All categories"], ...categories.map((item) => [item.id, item.name]), ["none", "No category"]]), [categories]);
  const stats = useMemo(() => buildProjectStats(tasks), [tasks]);
  const counts = useMemo(() => countProjectsByFilter(projects, today, category), [category, projects, today]);
  const visible = useMemo(() => selectProjects(projects, filter, deferredSearch, today, category), [category, deferredSearch, filter, projects, today]);

  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); }, []);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 ref={headingRef} tabIndex={-1} className="font-heading text-2xl font-semibold outline-none md:text-3xl">Projects</h1>
        <div className="flex gap-2">
          <Button variant="outline" disabled={readOnly} onClick={() => setManagingCategories(true)} aria-label="Manage categories" title="Manage categories">
            <Settings2 /><span className="hidden sm:inline">Categories</span>
          </Button>
          <a href="#tasks" className={buttonVariants({ variant: "outline" })} aria-label="All tasks" title="All tasks"><ListChecks /><span className="hidden sm:inline">All tasks</span></a>
          {onCreateTask ? <Button variant="outline" disabled={readOnly} onClick={() => setCreatingTask(true)}><Plus />New task</Button> : null}
          <Button disabled={readOnly} onClick={() => setCreating(true)}><FolderPlus />New project</Button>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <label className="relative">
          <span className="sr-only">Search projects</span>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" enterKeyHint="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search projects" className="pl-9" />
        </label>
        <div className="flex flex-wrap items-center gap-2">
        <Select items={categoryLabels} value={category} onValueChange={(value) => setViewState((current) => ({ ...current, projectCategory: (value as string) || "all" }))}>
          <SelectTrigger size="sm" aria-label="Filter projects by category" className={cn("w-44", category !== "all" && "border-primary/50 text-primary")}><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup>{Object.entries(categoryLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
        <div className="-mx-1 min-w-0 max-w-full overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          <ToggleGroup variant="outline" size="sm" className="w-max" value={[filter]} onValueChange={(values) => values[0] && setViewState((current) => ({ ...current, projectFilter: values[0] as ProjectListFilter }))} aria-label="Filter projects">
            {PROJECT_LIST_FILTERS.map((value) => <ToggleGroupItem key={value} value={value}>{filterLabels[value]}{counts[value] ? ` ${counts[value]}` : ""}</ToggleGroupItem>)}
          </ToggleGroup>
        </div>
        </div>
      </div>
      {visible.length ? (
        <ul aria-label={`${filterLabels[filter]} projects`} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((project) => <li key={project.id} className="min-w-0"><ProjectCard project={project} category={project.categoryId ? categoryMap.get(project.categoryId) : undefined} href={projectHash(project.id)} stats={stats.get(project.id)} captureCount={(project.captureIds ?? []).filter((id) => !captureIds || captureIds.has(id)).length} today={today} /></li>)}
        </ul>
      ) : (
        <Empty className="min-h-72 border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><FolderSearch /></EmptyMedia>
            <EmptyTitle>{deferredSearch.trim() ? "No matching projects" : projects.length ? `No ${filterLabels[filter].toLocaleLowerCase()} projects` : "No projects yet"}</EmptyTitle>
            <EmptyDescription>{deferredSearch.trim() ? "Try a different name." : projects.length ? "Try another filter or category." : "Create a project to group tasks and the things you capture for it."}</EmptyDescription>
          </EmptyHeader>
          {deferredSearch.trim() ? <Button variant="outline" onClick={() => setSearch("")}>Clear search</Button> : !projects.length ? <Button disabled={readOnly} onClick={() => setCreating(true)}><FolderPlus />New project</Button> : null}
        </Empty>
      )}
      <ResponsiveOverlay open={creating} onOpenChange={setCreating} title="New project">
        {creating ? <Suspense fallback={<Skeleton className="h-96 w-full" />}><ProjectEditor categories={categories} onCancel={() => setCreating(false)} onSave={async (input) => {
          const saved = await onCreateProject(input);
          setCreating(false);
          if (saved) onOpenProject(saved.id);
        }} /></Suspense> : null}
      </ResponsiveOverlay>
      <ResponsiveOverlay open={creatingTask} onOpenChange={setCreatingTask} title="New task">
        {creatingTask && onCreateTask ? <Suspense fallback={<Skeleton className="h-96 w-full" />}><TaskEditor initialProjectId={null} projects={projects} categories={categories} onCreateCategory={onCreateCategory} onCancel={() => setCreatingTask(false)}
          onSave={async (input) => {
            await onCreateTask(input);
            setCreatingTask(false);
            const project = projects.find((item) => item.id === input.projectId);
            toast.success(project ? `Task added to ${project.title}.` : "Task added. Find it in All tasks.", { action: { label: "View", onClick: () => { if (input.projectId) onOpenProject(input.projectId); else window.location.hash = "#tasks"; } } });
          }} /></Suspense> : null}
      </ResponsiveOverlay>
      <ResponsiveOverlay open={managingCategories} onOpenChange={setManagingCategories} title="Manage categories">
        <CategoryManager categories={categories} tasks={tasks} onUpdate={onUpdateCategory} onDelete={onDeleteCategory} />
      </ResponsiveOverlay>
    </div>
  );
}
