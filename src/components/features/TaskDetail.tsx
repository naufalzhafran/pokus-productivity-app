import { CalendarDays, Folder, Tag, TimerReset, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { RichTextContent } from "@/components/features/RichTextContent";
import { localDateKey, taskPriority } from "@/lib/workspace";
import type { Category, Project, Task } from "@/types/task";

interface Props { task: Task; project?: Project; category?: Category; canFocus: boolean; isPending?: boolean; onEdit: () => void; onFocus: () => void; onDelete: () => void }
const formatter = new Intl.DateTimeFormat(undefined, { dateStyle: "long" });

export function TaskDetail({ task, project, category, canFocus, isPending, onEdit, onFocus, onDelete }: Props) {
  const title = task.title.replace(/\s+/g, " ").trim().slice(0, 120);
  const priority = taskPriority(task);
  const today = localDateKey();
  const dueDate = project?.dueDate;
  const dueText = dueDate ? dueDate === today ? "Today" : dueDate < today ? `Overdue · ${dueDate}` : dueDate : "No project due date";

  return <div className="flex flex-col gap-5" aria-busy={isPending}><h3 className="whitespace-pre-wrap break-words text-lg font-medium">{task.title}</h3>{task.description ? <RichTextContent html={task.description} /> : <p className="text-sm text-muted-foreground">No description</p>}<Separator /><dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-4 text-sm"><dt className="text-muted-foreground">Status</dt><dd><Badge variant={task.isDone ? "secondary" : "outline"}>{task.isDone ? "Completed" : "Open"}</Badge></dd><dt className="text-muted-foreground">Priority</dt><dd className="capitalize">{priority === "none" ? "No priority" : priority}</dd><dt className="text-muted-foreground">Category</dt><dd className="flex gap-2"><Tag />{category?.name ?? "No category"}</dd><dt className="text-muted-foreground">Project</dt><dd className="flex gap-2"><Folder />{project?.title ?? "No project"}</dd><dt className="text-muted-foreground">Project due</dt><dd>{dueDate ? <time dateTime={dueDate}>{dueText}</time> : dueText}</dd><dt className="text-muted-foreground">Focused</dt><dd>{Math.floor(task.focusedSeconds / 60)} minutes</dd><dt className="text-muted-foreground">Created</dt><dd className="flex gap-2"><CalendarDays /><time dateTime={new Date(task.createdAt).toISOString()}>{formatter.format(task.createdAt)}</time></dd></dl><div className="grid gap-2 sm:grid-cols-2"><Button onClick={onEdit} disabled={isPending}>Edit</Button>{!task.isDone ? <Button variant="outline" onClick={onFocus} disabled={!canFocus || isPending} aria-label={`Focus on ${title}`}><TimerReset />Focus</Button> : null}<Button variant="destructive" className="sm:col-span-2" onClick={onDelete} disabled={isPending}><Trash2 />Delete task</Button></div></div>;
}
