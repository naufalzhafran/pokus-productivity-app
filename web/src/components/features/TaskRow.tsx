import { memo } from "react";
import { CalendarDays, FolderKanban, MoreHorizontal, Pencil, TimerReset, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CategoryPill } from "@/components/features/CategoryPill";
import { formatFocused, plainTextFromHtml, PRIORITY_LABELS, taskPriority, titlePreview } from "@/lib/workspace";
import type { Category, Task } from "@/types/task";


interface TaskRowProps {
  readOnly: boolean;
  task: Task;
  category?: Category;
  /** Shown in the All tasks list, where rows come from every project. */
  projectTitle?: string;
  /** The effective due date, shown in the All tasks list. */
  dueDate?: string | null;
  pending: boolean;
  canFocus: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onFocus: () => void;
}

export const TaskRow = memo(function TaskRow({ readOnly, task, category, projectTitle, dueDate, pending, canFocus, onToggle, onOpen, onEdit, onDelete, onFocus }: TaskRowProps) {
  const title = titlePreview(task.title);
  const priority = taskPriority(task);
  const excerpt = plainTextFromHtml(task.description ?? "").slice(0, 140);
  return (
    <li className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 border-b px-4 py-3.5 last:border-b-0 sm:px-5 [content-visibility:auto]" aria-busy={pending} data-task-id={task.id}>
      <Checkbox className="mt-0.5" checked={task.isDone} onCheckedChange={onToggle} disabled={pending || readOnly} aria-label={task.isDone ? `Reopen ${title}` : `Mark ${title} complete`} />
      <div className="min-w-0">
        <button type="button" className="w-full rounded text-left leading-5" onClick={onOpen} disabled={pending} aria-label={`Open details for ${title}`}>
          <span className={task.isDone ? "font-medium text-muted-foreground line-through" : "font-medium"}>{title}</span>
          {excerpt ? <span className="mt-0.5 block truncate text-sm text-muted-foreground">{excerpt}</span> : null}
        </button>
        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
          <span aria-label={`Priority: ${PRIORITY_LABELS[priority]}`} className="rounded-full bg-muted px-2 py-0.5 capitalize">
            {priority === "none" ? "No priority" : `${priority} priority`}
          </span>
          {category ? <CategoryPill category={category} /> : null}
          {projectTitle !== undefined ? (
            <span className="flex min-w-0 items-center gap-1"><FolderKanban className="size-3 shrink-0" aria-hidden="true" /><span className="truncate">{projectTitle || "No project"}</span></span>
          ) : null}
          {dueDate ? <span className="flex items-center gap-1 whitespace-nowrap"><CalendarDays className="size-3" aria-hidden="true" /><time dateTime={dueDate}>Due {dueDate}</time></span> : null}
          <span className="whitespace-nowrap">{formatFocused(task.focusedSeconds)}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 self-center">
        {!task.isDone ? (
          <Button type="button" size="sm" className="hidden sm:inline-flex" onClick={onFocus} disabled={!canFocus || pending} aria-label={`Focus on ${title}`}>
            <TimerReset />
            <span className="hidden sm:inline">Focus</span>
          </Button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label={`Actions for ${title}`} disabled={pending} />}>
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              {!task.isDone ? <DropdownMenuItem onClick={onFocus} disabled={!canFocus || pending}><TimerReset />Focus</DropdownMenuItem> : null}
              <DropdownMenuItem onClick={onEdit} disabled={readOnly}><Pencil />Edit</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={onDelete} disabled={readOnly}><Trash2 />Delete</DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
});
