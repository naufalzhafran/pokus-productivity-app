import { useDeferredValue, useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ResponsiveOverlay } from "@/components/features/ResponsiveOverlay";
import { isProjectArchived, titlePreview } from "@/lib/workspace";
import { cn } from "@/lib/utils";
import type { Project, Task } from "@/types/task";

interface TaskPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tasks: Task[];
  projects: Project[];
  selectedTaskId: string | null;
  onSelect: (taskId: string | null) => void;
}

function Option({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return <li>
    <button type="button" aria-pressed={selected} onClick={onClick} className={cn("flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-muted", selected && "bg-secondary font-medium")}>
      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{label}</span>
      {selected ? <Check aria-hidden="true" className="size-4 shrink-0 text-primary" /> : null}
    </button>
  </li>;
}

/** Lets the Timer pick an open task, grouped by active project. */
export function TaskPickerDialog({ open, onOpenChange, tasks, projects, selectedTaskId, onSelect }: TaskPickerDialogProps) {
  const [search, setSearch] = useState("");
  const needle = useDeferredValue(search).trim().toLocaleLowerCase();
  const groups = useMemo(() => {
    const projectMap = new Map(projects.map((project) => [project.id, project]));
    const byProject = new Map<string, { title: string; tasks: Task[] }>();
    for (const task of tasks) {
      const project = task.projectId ? projectMap.get(task.projectId) : undefined;
      if (task.isDone || isProjectArchived(project)) continue;
      const title = project?.title ?? "No project";
      if (needle && ![task.title, title].some((value) => value.toLocaleLowerCase().includes(needle))) continue;
      const key = project?.id ?? "";
      const group = byProject.get(key) ?? { title, tasks: [] };
      group.tasks.push(task);
      byProject.set(key, group);
    }
    return [...byProject.entries()].sort(([a], [b]) => Number(!a) - Number(!b)).map(([, group]) => group);
  }, [needle, projects, tasks]);
  const choose = (taskId: string | null) => { onSelect(taskId); onOpenChange(false); };

  return (
    <ResponsiveOverlay open={open} onOpenChange={onOpenChange} title="Choose a task" description="Focus on one open task, or start without one.">
      <div className="flex flex-col gap-3">
        <label className="relative">
          <span className="sr-only">Search tasks and projects</span>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tasks and projects" className="pl-9" />
        </label>
        <ul aria-label="No task"><Option label="No task, just focus" selected={!selectedTaskId} onClick={() => choose(null)} /></ul>
        {groups.map((group) => (
          <section key={group.title} aria-label={group.title} className="flex flex-col gap-1">
            <h3 className="px-3 pt-2 text-xs font-medium text-muted-foreground">{group.title}</h3>
            <ul className="flex flex-col gap-0.5">
              {group.tasks.map((task) => <Option key={task.id} label={titlePreview(task.title)} selected={task.id === selectedTaskId} onClick={() => choose(task.id)} />)}
            </ul>
          </section>
        ))}
        {!groups.length ? <p className="px-3 py-6 text-center text-sm text-muted-foreground">{needle ? "No matching open tasks." : "No open tasks. Add tasks from a project."}</p> : null}
      </div>
    </ResponsiveOverlay>
  );
}
