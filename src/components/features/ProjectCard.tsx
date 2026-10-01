import { CalendarDays, Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { dueLabel, formatFocused, getProjectStatus, isProjectArchived, PROJECT_STATUS_LABELS, type ProjectStats } from "@/lib/workspace";
import { cn } from "@/lib/utils";
import type { Project } from "@/types/task";

const EMPTY_STATS: ProjectStats = { taskCount: 0, openCount: 0, completedCount: 0, focusedSeconds: 0 };

interface ProjectCardProps {
  /** `null` renders the card for tasks without a project. */
  project: Project | null;
  href: string;
  stats?: ProjectStats;
  today: string;
}

export function ProjectCard({ project, href, stats = EMPTY_STATS, today }: ProjectCardProps) {
  const title = project?.title ?? "No project";
  const progress = stats.taskCount ? Math.round((stats.completedCount / stats.taskCount) * 100) : 0;
  const due = dueLabel(project?.dueDate, today);
  const dueSoon = Boolean(project?.dueDate && project.dueDate <= today);
  return (
    <a href={href} className="group flex h-full min-w-0 flex-col gap-3 rounded-[min(var(--radius-4xl),24px)] border bg-card p-4 text-card-foreground transition-colors hover:border-primary/40 hover:bg-accent/40">
      <div className="flex items-start gap-2">
        {project ? null : <Inbox aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
        <h2 className="min-w-0 flex-1 font-semibold leading-snug [overflow-wrap:anywhere] group-hover:underline">{title}</h2>
        {project ? <Badge variant={isProjectArchived(project) ? "secondary" : "outline"} className="shrink-0">{isProjectArchived(project) ? "Archived" : PROJECT_STATUS_LABELS[getProjectStatus(project)]}</Badge> : null}
      </div>
      {project ? null : <p className="text-sm text-muted-foreground">Tasks that aren’t in a project yet.</p>}
      {due ? (
        <p className={cn("flex items-center gap-1.5 text-xs", dueSoon ? "font-medium text-destructive" : "text-muted-foreground")}>
          <CalendarDays aria-hidden="true" className="size-3.5" /><time dateTime={project?.dueDate ?? undefined}>{due}</time>
        </p>
      ) : null}
      <div className="mt-auto flex flex-col gap-1.5">
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
        </div>
        <p className="flex flex-wrap justify-between gap-x-3 text-xs text-muted-foreground">
          <span>{stats.taskCount ? `${stats.completedCount}/${stats.taskCount} ${stats.taskCount === 1 ? "task" : "tasks"} done` : "No tasks yet"}</span>
          {stats.focusedSeconds ? <span>{formatFocused(stats.focusedSeconds)}</span> : null}
        </p>
      </div>
    </a>
  );
}
