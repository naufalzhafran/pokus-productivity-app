import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Download, Lightbulb, MoreHorizontal, Plus, Repeat, Search } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { KnowledgeCard } from "@/components/features/KnowledgeCard";
import type { KnowledgeStore } from "@/hooks/useKnowledge";
import { knowledgeMatches } from "@/lib/knowledge";
import { dueKnowledge } from "@/lib/review";
import { knowledgeHash, KNOWLEDGE_REVIEW_ID } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { Capture } from "@/types/capture";
import type { KnowledgeStatus } from "@/types/knowledge";
import type { Category, Project } from "@/types/task";

const ANY_PROJECT = "all";
const NO_PROJECT = "none";
type StatusFilter = "all" | KnowledgeStatus;

interface KnowledgePageProps {
  readOnly: boolean;
  store: KnowledgeStore;
  projects: Project[];
  captures: Capture[];
  categories: Category[];
  onCompose: () => void;
}

export function KnowledgePage({ readOnly, store, projects, captures, categories, onCompose }: KnowledgePageProps) {
  const { knowledge, isLoading, loadError } = store;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [projectFilter, setProjectFilter] = useState(ANY_PROJECT);
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);
  const deferredSearch = useDeferredValue(search);
  const projectMap = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const projectLabels = useMemo<Record<string, string>>(() => Object.fromEntries([[ANY_PROJECT, "All projects"], [NO_PROJECT, "Standalone"], ...projects.map((project) => [project.id, project.title])]), [projects]);
  const dueCount = dueKnowledge(knowledge).length;

  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); }, []);

  const visible = useMemo(() => knowledge.filter((note) =>
    (status === "all" || note.status === status) &&
    (projectFilter === ANY_PROJECT || (projectFilter === NO_PROJECT ? !note.projectId : note.projectId === projectFilter || note.linkedProjectIds.includes(projectFilter))) &&
    knowledgeMatches(note, deferredSearch),
  ), [deferredSearch, knowledge, projectFilter, status]);
  const filtered = Boolean(deferredSearch.trim()) || status !== "all" || projectFilter !== ANY_PROJECT;

  const exportMarkdown = async () => {
    setExporting(true);
    try {
      const { downloadKnowledgeArchive } = await import("@/lib/knowledge-export");
      downloadKnowledgeArchive(knowledge, { projects, captures, categories });
      toast.success(`Exported ${knowledge.length} ${knowledge.length === 1 ? "note" : "notes"}.`);
    } catch {
      toast.error("Your knowledge could not be exported.");
    } finally {
      setExporting(false);
    }
  };

  return <div className="flex flex-col gap-5">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 ref={headingRef} tabIndex={-1} className="font-heading text-2xl font-semibold outline-none md:text-3xl">Knowledge</h1>
        <p className="mt-1 text-sm text-muted-foreground">What you’ve learned, in your own words.</p>
      </div>
      <div className="flex items-center gap-1.5">
        <a href={knowledgeHash(KNOWLEDGE_REVIEW_ID)} className={cn(buttonVariants({ variant: dueCount ? "secondary" : "outline" }))}><Repeat />Review{dueCount ? ` (${dueCount})` : ""}</a>
        <Button disabled={readOnly} onClick={onCompose}><Plus />New</Button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="More knowledge actions" />}><MoreHorizontal /></DropdownMenuTrigger>
          <DropdownMenuContent align="end"><DropdownMenuGroup>
            <DropdownMenuItem disabled={!knowledge.length || exporting} onClick={() => void exportMarkdown()}><Download />Export as Markdown</DropdownMenuItem>
          </DropdownMenuGroup></DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
    {loadError ? <p role="alert" className="text-sm text-destructive">{loadError}</p> : null}
    <div className="flex flex-col gap-3 sm:flex-row">
      <label className="relative flex-1">
        <span className="sr-only">Search knowledge</span>
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input type="search" enterKeyHint="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search knowledge" className="pl-9" />
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <ToggleGroup variant="outline" className="grid w-full grid-cols-3 sm:w-72" value={[status]} onValueChange={(values) => values[0] && setStatus(values[0] as StatusFilter)} aria-label="Filter by status">
          <ToggleGroupItem value="all">All</ToggleGroupItem>
          <ToggleGroupItem value="draft">Drafts</ToggleGroupItem>
          <ToggleGroupItem value="evergreen">Evergreen</ToggleGroupItem>
        </ToggleGroup>
        <Select items={projectLabels} value={projectFilter} onValueChange={(value) => setProjectFilter(value as string)}>
          <SelectTrigger aria-label="Filter by project" className="w-full sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup>{Object.entries(projectLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
      </div>
    </div>
    {isLoading ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Skeleton className="h-40 w-full" /><Skeleton className="h-40 w-full" /></div>
      : visible.length ? <ul aria-label="Knowledge notes" className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((note) => <li key={note.id} className="min-w-0"><KnowledgeCard note={note} projectTitle={note.projectId ? projectMap.get(note.projectId)?.title : undefined} /></li>)}
      </ul>
      : <Empty className="min-h-72 border">
        <EmptyHeader>
          <EmptyMedia variant="icon"><Lightbulb /></EmptyMedia>
          <EmptyTitle>{filtered ? "No matching knowledge" : "No knowledge yet"}</EmptyTitle>
          <EmptyDescription>{filtered ? "Try a different search or filter." : "Distill a capture, or write what you learned when a project is done."}</EmptyDescription>
        </EmptyHeader>
        {filtered ? <Button variant="outline" onClick={() => { setSearch(""); setStatus("all"); setProjectFilter(ANY_PROJECT); }}>Clear filters</Button>
          : <Button disabled={readOnly} onClick={onCompose}><Plus />Write knowledge</Button>}
      </Empty>}
  </div>;
}
