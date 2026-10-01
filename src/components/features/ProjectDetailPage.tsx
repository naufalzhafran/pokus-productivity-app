import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Archive, ArrowLeft, CalendarDays, FolderSearch, Inbox, Lightbulb, ListTodo, MoreHorizontal, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProjectEditor } from "@/components/features/ProjectEditor";
import { ProjectTasks, type ProjectTasksProps } from "@/components/features/ProjectTasks";
import { ResponsiveOverlay } from "@/components/features/ResponsiveOverlay";
import { buildProjectStats, dueLabel, formatFocused, getProjectStatus, isProjectArchived, localDateKey, NO_PROJECT_ID, PROJECT_STATUS_LABELS } from "@/lib/workspace";
import { cn } from "@/lib/utils";
import type { ProjectInput } from "@/types/task";

const RichTextContent = lazy(() => import("@/components/features/RichTextContent").then((module) => ({ default: module.RichTextContent })));

type TaskProps = Omit<ProjectTasksProps, "project">;

interface ProjectDetailPageProps extends TaskProps {
  /** Route id: a project id or `NO_PROJECT_ID`. */
  projectId: string;
  onUpdateProject: (id: string, input: ProjectInput) => Promise<unknown>;
  onArchiveProject: (id: string, archived: boolean) => Promise<unknown>;
  onDeleteProject: (id: string) => Promise<unknown>;
  /** The project's Captures tab; omitted for tasks without a project. */
  capturesPanel?: ReactNode;
  captureCount?: number;
  /** The project's Knowledge tab; omitted for tasks without a project. */
  knowledgePanel?: ReactNode;
  knowledgeCount?: number;
}

const backLink = <a href="#projects" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2 self-start")}><ArrowLeft />Projects</a>;

export function ProjectDetailPage({ projectId, onUpdateProject, onArchiveProject, onDeleteProject, capturesPanel, captureCount = 0, knowledgePanel, knowledgeCount = 0, ...taskProps }: ProjectDetailPageProps) {
  const { readOnly, projects, tasks, canStartPomodoro } = taskProps;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isNoProject = projectId === NO_PROJECT_ID;
  const project = isNoProject ? null : projects.find((item) => item.id === projectId);
  const stats = useMemo(() => buildProjectStats(tasks).get(isNoProject ? NO_PROJECT_ID : projectId), [isNoProject, projectId, tasks]);
  const today = localDateKey();
  const archived = isProjectArchived(project);

  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); }, [projectId]);

  if (project === undefined) {
    return <div className="flex flex-col gap-4">
      {backLink}
      <Empty className="min-h-72 border">
        <EmptyHeader>
          <EmptyMedia variant="icon"><FolderSearch /></EmptyMedia>
          <EmptyTitle><h1 ref={headingRef} tabIndex={-1} className="outline-none">Project not found</h1></EmptyTitle>
          <EmptyDescription>It may have been deleted. Go back to your projects to pick another one.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>;
  }

  const run = async (action: () => Promise<unknown>) => {
    setPending(true);
    setError(null);
    try { await action(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "The project could not be updated."); }
    finally { setPending(false); }
  };
  const taskCount = stats?.taskCount ?? 0;
  const progress = taskCount ? Math.round(((stats?.completedCount ?? 0) / taskCount) * 100) : 0;
  const due = dueLabel(project?.dueDate, today);

  return (
    <div className="flex flex-col gap-5">
      {backLink}
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 ref={headingRef} tabIndex={-1} className="min-w-0 flex-1 font-heading text-2xl font-semibold leading-tight outline-none [overflow-wrap:anywhere] md:text-3xl">{project?.title ?? "No project"}</h1>
          {project ? (
            <div className="flex shrink-0 items-center gap-1.5">
              <Button variant="outline" disabled={readOnly || pending} onClick={() => setEditing(true)}><Pencil />Edit</Button>
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`More actions for ${project.title}`} disabled={pending} />}><MoreHorizontal /></DropdownMenuTrigger>
                <DropdownMenuContent align="end"><DropdownMenuGroup>
                  <DropdownMenuItem disabled={readOnly} onClick={() => void run(() => onArchiveProject(project.id, !archived))}>{archived ? <RotateCcw /> : <Archive />}{archived ? "Restore project" : "Archive project"}</DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" disabled={readOnly} onClick={() => {
                    if (window.confirm(`Delete ${project.title}? Its tasks will move to No project.`)) void run(() => onDeleteProject(project.id));
                  }}><Trash2 />Delete project</DropdownMenuItem>
                </DropdownMenuGroup></DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
          {project ? <Badge variant={archived ? "secondary" : "outline"}>{archived ? "Archived" : PROJECT_STATUS_LABELS[getProjectStatus(project)]}</Badge> : <span>Tasks that aren’t in a project yet.</span>}
          {due ? <span className={cn("flex items-center gap-1.5", project?.dueDate && project.dueDate <= today && "font-medium text-destructive")}><CalendarDays aria-hidden="true" className="size-4" /><time dateTime={project?.dueDate ?? undefined}>{due}</time></span> : null}
          <span>{stats?.completedCount ?? 0}/{taskCount} {taskCount === 1 ? "task" : "tasks"} done</span>
          {stats?.focusedSeconds ? <span>{formatFocused(stats.focusedSeconds)}</span> : null}
        </div>
        {taskCount ? <div className="h-1.5 max-w-md overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Project progress" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} /></div> : null}
        {project?.description ? <div className="max-w-3xl"><Suspense fallback={null}><RichTextContent html={project.description} /></Suspense></div> : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        {archived ? <p className="text-sm text-muted-foreground">This project is archived. Restore it to focus on its tasks again.</p> : null}
      </header>
      {capturesPanel || knowledgePanel ? (
        <Tabs defaultValue="tasks">
          <TabsList aria-label="Project content">
            <TabsTrigger value="tasks"><ListTodo />Tasks <span className="text-xs font-normal text-muted-foreground">{stats?.openCount ?? 0}</span></TabsTrigger>
            {capturesPanel ? <TabsTrigger value="captures"><Inbox />Captures <span className="text-xs font-normal text-muted-foreground">{captureCount}</span></TabsTrigger> : null}
            {knowledgePanel ? <TabsTrigger value="knowledge"><Lightbulb />Knowledge <span className="text-xs font-normal text-muted-foreground">{knowledgeCount}</span></TabsTrigger> : null}
          </TabsList>
          <TabsContent value="tasks">
            <ProjectTasks {...taskProps} project={project} canStartPomodoro={canStartPomodoro && !archived} />
          </TabsContent>
          {capturesPanel ? <TabsContent value="captures">{capturesPanel}</TabsContent> : null}
          {knowledgePanel ? <TabsContent value="knowledge">{knowledgePanel}</TabsContent> : null}
        </Tabs>
      ) : (
        <section aria-label="Project tasks">
          <ProjectTasks {...taskProps} project={project} canStartPomodoro={canStartPomodoro && !archived} />
        </section>
      )}
      <ResponsiveOverlay open={editing} onOpenChange={setEditing} title="Edit project">
        {editing && project ? <ProjectEditor project={project} openTaskCount={stats?.openCount ?? 0} onCancel={() => setEditing(false)} onSave={async (input) => { await onUpdateProject(project.id, input); setEditing(false); }} /> : null}
      </ResponsiveOverlay>
    </div>
  );
}
