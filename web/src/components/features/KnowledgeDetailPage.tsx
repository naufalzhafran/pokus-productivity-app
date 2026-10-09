import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ExternalLink, FileQuestion, Folder, MoreHorizontal, Pencil, Sprout, Tag, Trash2, TreeDeciduous } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ConfirmPrompt, type ConfirmRequest } from "@/components/features/ConfirmPrompt";
import { KnowledgeReview } from "@/components/features/KnowledgeReview";
import type { KnowledgeStore } from "@/hooks/useKnowledge";
import { CAPTURE_KIND_LABELS, captureDisplayTitle } from "@/lib/capture";
import { KNOWLEDGE_STATUS_LABELS } from "@/lib/knowledge";
import { isDue } from "@/lib/review";
import { projectHash } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { Capture } from "@/types/capture";
import type { Knowledge } from "@/types/knowledge";
import type { Category, Project } from "@/types/task";

const RichTextContent = lazy(() => import("@/components/features/RichTextContent").then((module) => ({ default: module.RichTextContent })));
const dateFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });
const backLink = <a href="#knowledge" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2 self-start")}><ArrowLeft />Knowledge</a>;

interface KnowledgeDetailPageProps {
  knowledgeId: string;
  readOnly: boolean;
  store: KnowledgeStore;
  projects: Project[];
  captures: Capture[];
  categories: Category[];
  onEdit: (note: Knowledge) => void;
  onDeleted: () => void;
}

function ProjectLink({ project }: { project: Project }) {
  return <a href={projectHash(project.id)} className="flex max-w-full items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
    <Folder aria-hidden="true" className="size-3 shrink-0" /><span className="truncate">{project.title}</span>
  </a>;
}

export function KnowledgeDetailPage({ knowledgeId, readOnly, store, projects, captures, categories, onEdit, onDeleted }: KnowledgeDetailPageProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const note = store.knowledge.find((item) => item.id === knowledgeId);
  const projectMap = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const captureMap = useMemo(() => new Map(captures.map((capture) => [capture.id, capture])), [captures]);

  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); }, [knowledgeId]);

  if (!note) {
    return <div className="flex flex-col gap-4">
      {backLink}
      <Empty className="min-h-72 border">
        <EmptyHeader>
          <EmptyMedia variant="icon"><FileQuestion /></EmptyMedia>
          <EmptyTitle><h1 ref={headingRef} tabIndex={-1} className="outline-none">{store.isLoading ? "Loading knowledge…" : "Knowledge not found"}</h1></EmptyTitle>
          <EmptyDescription>{store.isLoading ? "One moment." : "It may have been deleted. Go back to see all your knowledge."}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>;
  }

  const run = async (action: () => Promise<unknown>, success: string) => {
    setPending(true);
    try { await action(); toast.success(success); }
    catch (caught) { toast.error(caught instanceof Error ? caught.message : "This knowledge could not be updated."); }
    finally { setPending(false); }
  };
  const origin = note.projectId ? projectMap.get(note.projectId) : undefined;
  const linked = note.linkedProjectIds.flatMap((id) => projectMap.get(id) ?? []);
  const sources = note.sourceIds.flatMap((id) => captureMap.get(id) ?? []);
  const category = categories.find((item) => item.id === note.categoryId);
  const evergreen = note.status === "evergreen";

  return <div className="flex flex-col gap-5">
    {backLink}
    <article className="flex max-w-3xl flex-col gap-5" aria-labelledby="knowledge-heading">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 id="knowledge-heading" ref={headingRef} tabIndex={-1} className="min-w-0 flex-1 font-heading text-2xl font-semibold leading-tight outline-none [overflow-wrap:anywhere] md:text-3xl">{note.title}</h1>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button variant="outline" disabled={readOnly || pending} onClick={() => onEdit(note)}><Pencil />Edit</Button>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`More actions for ${note.title}`} disabled={pending} />}><MoreHorizontal /></DropdownMenuTrigger>
              <DropdownMenuContent align="end"><DropdownMenuGroup>
                <DropdownMenuItem disabled={readOnly} onClick={() => void run(() => store.setKnowledgeStatus(note.id, evergreen ? "draft" : "evergreen"), evergreen ? "Moved back to drafts." : "Marked evergreen. It’s now in your review queue.")}>
                  {evergreen ? <Sprout /> : <TreeDeciduous />}{evergreen ? "Move back to draft" : "Mark as evergreen"}
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" disabled={readOnly} onClick={() => {
                  setConfirm({ title: `Delete ${note.title}?`, description: "This note will be removed from your knowledge and review queue. This can’t be undone.", confirmLabel: "Delete note", onConfirm: () => void run(async () => { await store.deleteKnowledge(note.id); onDeleted(); }, "Knowledge deleted.") });
                }}><Trash2 />Delete</DropdownMenuItem>
              </DropdownMenuGroup></DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
          <Badge variant={evergreen ? "default" : "outline"}>{KNOWLEDGE_STATUS_LABELS[note.status]}</Badge>
          {category ? <span className="flex items-center gap-1"><Tag aria-hidden="true" className="size-3.5" />{category.name}</span> : null}
          {evergreen && note.nextReviewAt && !isDue(note) ? <span>Next review {dateFormatter.format(note.nextReviewAt)}</span> : null}
          <span>Updated {dateFormatter.format(note.updatedAt)}</span>
        </div>
        {note.summary ? <p className="whitespace-pre-wrap text-base leading-relaxed [overflow-wrap:anywhere]">{note.summary}</p> : null}
      </header>
      {isDue(note) ? <section aria-label="Review this note" className="rounded-2xl border border-primary/25 bg-primary/5 p-4">
        <p className="mb-3 text-sm font-medium">Due for review. How well did you remember it?</p>
        <KnowledgeReview note={note} readOnly={readOnly} onReview={(remembered) => store.reviewKnowledge(note.id, remembered)} />
      </section> : null}
      {note.body ? <Suspense fallback={null}><div className="[&_.rich-text-content]:text-base [&_.rich-text-content]:text-foreground"><RichTextContent html={note.body} /></div></Suspense> : null}
      <section aria-labelledby="knowledge-sources" className="flex flex-col gap-2 border-t pt-4">
        <h2 id="knowledge-sources" className="text-sm font-medium">Sources{note.locator ? <span className="font-normal text-muted-foreground"> · {note.locator}</span> : null}</h2>
        {sources.length ? <ul className="flex flex-col gap-1">
          {sources.map((capture) => <li key={capture.id} className="flex min-w-0 items-center gap-2 text-sm">
            <span className="min-w-0 flex-1">
              {capture.url ? <a href={capture.url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 hover:underline">
                <span className="truncate">{captureDisplayTitle(capture)}</span><ExternalLink aria-hidden="true" className="size-3 shrink-0" /><span className="sr-only"> (opens in a new tab)</span>
              </a> : <span className="[overflow-wrap:anywhere]">{captureDisplayTitle(capture)}</span>}
              <span className="block text-xs text-muted-foreground">{[CAPTURE_KIND_LABELS[capture.kind], capture.author].filter(Boolean).join(" · ")}</span>
            </span>
          </li>)}
        </ul> : <p className="text-sm text-muted-foreground">No sources. Edit to link the captures this came from.</p>}
      </section>
      <section aria-labelledby="knowledge-projects" className="flex flex-col gap-3 border-t pt-4">
        <h2 id="knowledge-projects" className="sr-only">Projects</h2>
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium">Created in</p>
          {origin ? <div className="flex"><ProjectLink project={origin} /></div> : <p className="text-sm text-muted-foreground">Standalone knowledge.</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium">Also used in</p>
          {linked.length ? <ul className="flex flex-wrap gap-1.5">{linked.map((project) => <li key={project.id} className="min-w-0"><ProjectLink project={project} /></li>)}</ul>
            : <p className="text-sm text-muted-foreground">Not referenced by other projects yet.</p>}
        </div>
      </section>
    </article>
    <ConfirmPrompt request={confirm} onClose={() => setConfirm(null)} />
  </div>;
}
