import { useMemo, useState } from "react";
import { Archive, CalendarClock, CalendarDays, CircleAlert, Folder, ListTodo, Menu, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getProjectStatus, type FlatWorkspaceIndex, type WorkspaceIndex, type WorkspaceScope } from "@/lib/workspace";
import type { ProjectStatus } from "@/types/task";

interface Props { index: FlatWorkspaceIndex | WorkspaceIndex; scope: WorkspaceScope; onScopeChange: (scope: WorkspaceScope) => void }
const groups: { value: ProjectStatus; label: string }[] = [{ value: "planned", label: "Planned" }, { value: "active", label: "Active" }, { value: "on_hold", label: "On hold" }, { value: "completed", label: "Completed" }];

function Items({ index, scope, onScopeChange, onChosen }: Props & { onChosen?: () => void }) {
  const [query, setQuery] = useState("");
  const projects = useMemo(() => index.activeProjects.filter((project) => project.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [index.activeProjects, query]);
  const choose = (value: WorkspaceScope) => { onScopeChange(value); onChosen?.(); };
  const item = (value: WorkspaceScope, label: string, count: number, icon: React.ReactNode) => <Button key={value} type="button" title={label} variant={scope === value ? "secondary" : "ghost"} className="h-auto min-h-9 w-full items-start justify-start gap-2 px-2.5 py-2" onClick={() => choose(value)} aria-current={scope === value ? "page" : undefined}>{icon}<span className="min-w-0 flex-1 whitespace-pre-wrap text-left leading-5 [overflow-wrap:anywhere]">{label}</span><Badge variant="outline" className="mt-0.5 shrink-0">{count}</Badge></Button>;
  return <div className="flex min-h-0 flex-1 flex-col gap-2.5"><label className="relative"><span className="sr-only">Search projects</span><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a project" className="pl-9" /></label><ScrollArea className="min-h-0 flex-1"><nav aria-label="Task scopes" className="flex flex-col gap-0.5 pr-2">
    {item("all", "All tasks", index.activeOpenCount, <ListTodo />)}{item("today", "Today", "todayCount" in index ? index.todayCount : 0, <CalendarDays />)}{item("upcoming", "Upcoming 7 days", "upcomingCount" in index ? index.upcomingCount : 0, <CalendarClock />)}{item("overdue", "Overdue", "overdueCount" in index ? index.overdueCount : 0, <CircleAlert />)}
    {groups.map((group) => { const values = projects.filter((project) => getProjectStatus(project) === group.value); return <div key={group.value}><p className="px-2.5 pb-1 pt-3 text-xs font-medium text-muted-foreground">{group.label}</p>{values.length ? values.map((project) => item(`project:${project.id}`, project.title, index.groupMap.get(project.id)?.openCount ?? 0, <Folder />)) : <p className="px-2.5 py-1 text-xs text-muted-foreground">No projects</p>}</div>; })}
    <p className="px-2.5 pb-1 pt-3 text-xs font-medium text-muted-foreground">Archived</p>{item("archived", "All archived", index.archivedProjects.length, <Archive />)}{index.archivedProjects.map((project) => item(`project:${project.id}`, project.title, index.groupMap.get(project.id)?.openCount ?? 0, <Folder />))}
  </nav></ScrollArea></div>;
}
export function DesktopProjectNavigation(props: Props) { return <aside className="sticky top-24 hidden max-h-[calc(100dvh-7rem)] flex-col overflow-hidden rounded-2xl border bg-card p-4 lg:flex"><h2 className="mb-2.5 px-0.5 font-heading font-medium">Workspace</h2><Items {...props} /></aside>; }
export function MobileProjectNavigation(props: Props) { const [open, setOpen] = useState(false); return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger render={<Button type="button" variant="outline" className="lg:hidden" />}><Menu data-icon="inline-start" />Projects</DialogTrigger><DialogContent className="grid max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)]"><DialogHeader><DialogTitle>Task views</DialogTitle></DialogHeader><Items {...props} onChosen={() => setOpen(false)} /></DialogContent></Dialog>; }
