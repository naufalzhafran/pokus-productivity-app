import { useDeferredValue, useMemo, useState } from "react";
import { Inbox, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CaptureGrid } from "@/components/features/CaptureGrid";
import { QuickCapture } from "@/components/features/QuickCapture";
import type { CaptureStore } from "@/hooks/useCaptures";
import { CAPTURE_KINDS, captureMatches } from "@/lib/capture";
import { captureStage, type CaptureStage } from "@/lib/knowledge";
import { isProjectArchived } from "@/lib/workspace";
import type { Capture, CaptureKind } from "@/types/capture";
import type { Knowledge } from "@/types/knowledge";
import type { Project } from "@/types/task";

const kindFilterLabels: Record<CaptureKind, string> = { note: "Notes", article: "Articles", social: "Social", video: "Videos", drive: "Drive", book: "Books" };
const stageLabels: Record<CaptureStage, string> = { inbox: "Inbox captures", in_progress: "Captures in progress", processed: "Processed captures" };
const ANY_PROJECT = "all";
const NO_PROJECT = "none";

type KindFilter = "all" | CaptureKind;

interface CapturePageProps {
  readOnly?: boolean;
  store: CaptureStore;
  projects: Project[];
  onOrganize: (captureId: string, projectIds: string[], markProcessed: boolean) => Promise<unknown>;
  knowledgeBySource?: ReadonlyMap<string, Knowledge[]>;
  onDistill?: (capture: Capture) => void;
  onStartProject?: (capture: Capture) => Promise<unknown>;
  /** Text shared to Pokus, prefilled in Quick capture. */
  sharedText?: string | null;
}

export function CapturePage({ readOnly = false, store, projects, onOrganize, knowledgeBySource, onDistill, onStartProject, sharedText }: CapturePageProps) {
  const { captures, loadError, createCapture } = store;
  const [status, setStatus] = useState<CaptureStage>("inbox");
  const [kind, setKind] = useState<KindFilter>("all");
  const [projectFilter, setProjectFilter] = useState(ANY_PROJECT);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const filedIds = useMemo(() => new Set(projects.flatMap((project) => project.captureIds ?? [])), [projects]);
  const filterProject = projects.find((project) => project.id === projectFilter);
  const projectLabels = useMemo<Record<string, string>>(() => Object.fromEntries([[ANY_PROJECT, "All projects"], [NO_PROJECT, "Not in a project"], ...projects.filter((project) => !isProjectArchived(project)).map((project) => [project.id, project.title])]), [projects]);

  const sourcedIds = useMemo<ReadonlySet<string>>(() => new Set(knowledgeBySource?.keys()), [knowledgeBySource]);
  const stageOf = useMemo(() => (capture: Capture) => captureStage(capture, filedIds, sourcedIds), [filedIds, sourcedIds]);
  const inboxCount = useMemo(() => captures.filter((capture) => stageOf(capture) === "inbox").length, [captures, stageOf]);
  const visible = useMemo(() => captures.filter((capture) =>
    stageOf(capture) === status &&
    (kind === "all" || capture.kind === kind) &&
    (projectFilter === ANY_PROJECT || (projectFilter === NO_PROJECT ? !filedIds.has(capture.id) : Boolean(filterProject?.captureIds?.includes(capture.id)))) &&
    captureMatches(capture, deferredSearch),
  ), [captures, deferredSearch, filedIds, filterProject, kind, projectFilter, stageOf, status]);

  const filtered = Boolean(deferredSearch.trim()) || kind !== "all" || projectFilter !== ANY_PROJECT;
  const clearFilters = () => { setSearch(""); setKind("all"); setProjectFilter(ANY_PROJECT); };
  return <div className="grid gap-5 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start">
    <div className="lg:sticky lg:top-6"><QuickCapture readOnly={false} previews={!readOnly} initialText={sharedText ?? ""} onCapture={createCapture}
      description={readOnly ? "You’re offline or signed out. Captures are saved on this device and sync automatically later." : undefined} /></div>
    <section aria-label="Captures" className="flex min-w-0 flex-col gap-4">
      {loadError ? <p role="alert" className="text-sm text-destructive">{loadError}</p> : null}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <ToggleGroup variant="outline" className="grid w-full shrink-0 grid-cols-3 sm:w-80" value={[status]} onValueChange={(values) => values[0] && setStatus(values[0] as CaptureStage)} aria-label="Capture status">
            <ToggleGroupItem value="inbox">Inbox{inboxCount ? ` (${inboxCount})` : ""}</ToggleGroupItem>
            <ToggleGroupItem value="in_progress">In progress</ToggleGroupItem>
            <ToggleGroupItem value="processed">Processed</ToggleGroupItem>
          </ToggleGroup>
          <label className="relative flex-1">
            <span className="sr-only">Search captures</span>
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input type="search" enterKeyHint="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search captures" className="pl-9" />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="-mx-1 min-w-0 flex-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
            <ToggleGroup variant="outline" size="sm" className="w-max" value={[kind]} onValueChange={(values) => values[0] && setKind(values[0] as KindFilter)} aria-label="Filter by type">
              <ToggleGroupItem value="all">All</ToggleGroupItem>
              {CAPTURE_KINDS.map((value) => <ToggleGroupItem key={value} value={value}>{kindFilterLabels[value]}</ToggleGroupItem>)}
            </ToggleGroup>
          </div>
          <Select items={projectLabels} value={projectFilter} onValueChange={(value) => setProjectFilter(value as string)}>
            <SelectTrigger aria-label="Filter by project" className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>{Object.entries(projectLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        </div>
      </div>
      <CaptureGrid label={stageLabels[status]} captures={visible} store={store} projects={projects} readOnly={readOnly} onOrganize={onOrganize}
        knowledgeBySource={knowledgeBySource} onDistill={onDistill} onStartProject={onStartProject}
        empty={<Empty className="min-h-72 border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><Inbox /></EmptyMedia>
            <EmptyTitle>{filtered ? "No matching captures" : status === "inbox" ? "Your inbox is clear" : status === "in_progress" ? "Nothing in progress" : "Nothing processed yet"}</EmptyTitle>
            <EmptyDescription>{filtered ? "Try a different search or filter." : status === "inbox" ? "Anything you capture lands here until you add it to a project, distill it, or mark it processed." : status === "in_progress" ? "Captures in a project or distilled into knowledge stay here until you mark them processed." : "Captures you mark as processed will appear here."}</EmptyDescription>
          </EmptyHeader>
          {filtered ? <Button variant="outline" onClick={clearFilters}>Clear filters</Button> : null}
        </Empty>} />
    </section>
  </div>;
}
