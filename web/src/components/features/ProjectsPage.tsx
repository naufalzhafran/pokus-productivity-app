import { useDeferredValue, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { FolderPlus, FolderSearch, Search, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CategoryManager } from "@/components/features/CategoryManager";
import { ProjectCard } from "@/components/features/ProjectCard";
import { ProjectEditor } from "@/components/features/ProjectEditor";
import { ResponsiveOverlay } from "@/components/features/ResponsiveOverlay";
import { projectHash } from "@/lib/routes";
import { buildProjectStats, countProjectsByFilter, localDateKey, NO_PROJECT_ID, PROJECT_LIST_FILTERS, selectProjects, type ProjectListFilter, type WorkspaceViewState } from "@/lib/workspace";
import type { Category, CategoryInput, Project, ProjectInput, Task } from "@/types/task";

const filterLabels: Record<ProjectListFilter, string> = { all: "All", active: "Active", planned: "Planned", on_hold: "On hold", completed: "Completed", due: "Due soon", archived: "Archived" };

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
}

export function ProjectsPage({ readOnly, projects, tasks, categories, viewState, setViewState, onCreateProject, onOpenProject, onUpdateCategory, onDeleteCategory, captureIds }: ProjectsPageProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [creating, setCreating] = useState(false);
  const [managingCategories, setManagingCategories] = useState(false);
  const today = localDateKey();
  const filter = viewState.projectFilter;
  const stats = useMemo(() => buildProjectStats(tasks), [tasks]);
  const counts = useMemo(() => countProjectsByFilter(projects, today), [projects, today]);
  const visible = useMemo(() => selectProjects(projects, filter, deferredSearch, today), [deferredSearch, filter, projects, today]);
  const noProjectStats = stats.get(NO_PROJECT_ID);
  const showNoProject = filter === "all" && !deferredSearch.trim() && Boolean(noProjectStats?.taskCount);

  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); }, []);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 ref={headingRef} tabIndex={-1} className="font-heading text-2xl font-semibold outline-none md:text-3xl">Projects</h1>
        <div className="flex gap-2">
          <Button variant="outline" disabled={readOnly} onClick={() => setManagingCategories(true)} aria-label="Manage categories" title="Manage categories">
            <Settings2 /><span className="hidden sm:inline">Categories</span>
          </Button>
          <Button disabled={readOnly} onClick={() => setCreating(true)}><FolderPlus />New project</Button>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <label className="relative">
          <span className="sr-only">Search projects</span>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" enterKeyHint="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search projects" className="pl-9" />
        </label>
        <div className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          <ToggleGroup variant="outline" size="sm" className="w-max" value={[filter]} onValueChange={(values) => values[0] && setViewState((current) => ({ ...current, projectFilter: values[0] as ProjectListFilter }))} aria-label="Filter projects">
            {PROJECT_LIST_FILTERS.map((value) => <ToggleGroupItem key={value} value={value}>{filterLabels[value]}{counts[value] ? ` ${counts[value]}` : ""}</ToggleGroupItem>)}
          </ToggleGroup>
        </div>
      </div>
      {visible.length || showNoProject ? (
        <ul aria-label={`${filterLabels[filter]} projects`} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((project) => <li key={project.id} className="min-w-0"><ProjectCard project={project} href={projectHash(project.id)} stats={stats.get(project.id)} captureCount={(project.captureIds ?? []).filter((id) => !captureIds || captureIds.has(id)).length} today={today} /></li>)}
          {showNoProject ? <li className="min-w-0"><ProjectCard project={null} href={projectHash(NO_PROJECT_ID)} stats={noProjectStats} today={today} /></li> : null}
        </ul>
      ) : (
        <Empty className="min-h-72 border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><FolderSearch /></EmptyMedia>
            <EmptyTitle>{deferredSearch.trim() ? "No matching projects" : projects.length ? `No ${filterLabels[filter].toLocaleLowerCase()} projects` : "No projects yet"}</EmptyTitle>
            <EmptyDescription>{deferredSearch.trim() ? "Try a different name." : projects.length ? "Try another filter." : "Create a project to group tasks and the things you capture for it."}</EmptyDescription>
          </EmptyHeader>
          {deferredSearch.trim() ? <Button variant="outline" onClick={() => setSearch("")}>Clear search</Button> : !projects.length ? <Button disabled={readOnly} onClick={() => setCreating(true)}><FolderPlus />New project</Button> : null}
        </Empty>
      )}
      <ResponsiveOverlay open={creating} onOpenChange={setCreating} title="New project">
        {creating ? <ProjectEditor onCancel={() => setCreating(false)} onSave={async (input) => {
          const saved = await onCreateProject(input);
          setCreating(false);
          if (saved) onOpenProject(saved.id);
        }} /> : null}
      </ResponsiveOverlay>
      <ResponsiveOverlay open={managingCategories} onOpenChange={setManagingCategories} title="Manage categories">
        <CategoryManager categories={categories} tasks={tasks} onUpdate={onUpdateCategory} onDelete={onDeleteCategory} />
      </ResponsiveOverlay>
    </div>
  );
}
