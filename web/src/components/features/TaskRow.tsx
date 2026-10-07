import { memo } from "react";
import { MoreHorizontal, Pencil, Tag, TimerReset, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatFocused, plainTextFromHtml, taskPriority, titlePreview } from "@/lib/workspace";
import type { Category, CategoryColor, Task } from "@/types/task";

const categoryPillStyles: Record<CategoryColor, string> = {
  slate: "bg-slate-100 text-slate-800 dark:bg-slate-950 dark:text-slate-200",
  red: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  orange: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  green: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
  teal: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200",
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  violet: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  pink: "bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-200",
};
const priorityLabels = { none: "No priority", low: "Low", medium: "Medium", high: "High", urgent: "Urgent" } as const;

interface TaskRowProps {
  readOnly: boolean;
  task: Task;
  category?: Category;
  pending: boolean;
  canFocus: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onFocus: () => void;
}

export const TaskRow = memo(function TaskRow({ readOnly, task, category, pending, canFocus, onToggle, onOpen, onEdit, onDelete, onFocus }: TaskRowProps) {
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
          <span aria-label={`Priority: ${priorityLabels[priority]}`} className="rounded-full bg-muted px-2 py-0.5 capitalize">
            {priority === "none" ? "No priority" : `${priority} priority`}
          </span>
          {category ? (
            <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 ${categoryPillStyles[category.color]}`}>
              <Tag className="size-3" aria-hidden="true" />
              {category.name}
            </span>
          ) : null}
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
