import type { ReactNode } from "react";
import { BookMarked, Clock, Folder } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { htmlToPlainText, KNOWLEDGE_STATUS_LABELS } from "@/lib/knowledge";
import { isDue } from "@/lib/review";
import { knowledgeHash } from "@/lib/routes";
import type { Knowledge } from "@/types/knowledge";

const dateFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

interface KnowledgeCardProps {
  note: Knowledge;
  /** Title of the project the note was created in, when it should be shown. */
  projectTitle?: string;
  /** Extra controls for the card footer, such as unlinking from a project. */
  action?: ReactNode;
}

export function KnowledgeCard({ note, projectTitle, action }: KnowledgeCardProps) {
  const preview = note.summary || htmlToPlainText(note.body);
  const due = isDue(note);
  return <article aria-label={note.title} className="flex min-w-0 flex-col rounded-[min(var(--radius-4xl),24px)] border bg-card text-card-foreground">
    <div className="flex min-w-0 flex-col gap-2 p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={note.status === "evergreen" ? "default" : "outline"}>{KNOWLEDGE_STATUS_LABELS[note.status]}</Badge>
        {due ? <Badge variant="secondary"><Clock aria-hidden="true" />Due for review</Badge> : null}
      </div>
      <a href={knowledgeHash(note.id)} className="line-clamp-2 font-semibold leading-snug [overflow-wrap:anywhere] hover:underline">{note.title}</a>
      {preview ? <p className="line-clamp-3 text-sm text-muted-foreground [overflow-wrap:anywhere]">{preview}</p> : null}
    </div>
    <div className="mt-auto flex min-h-11 items-center gap-3 border-t py-1.5 pl-4 pr-2 text-xs text-muted-foreground">
      {projectTitle ? <span className="flex min-w-0 items-center gap-1"><Folder aria-hidden="true" className="size-3 shrink-0" /><span className="truncate">{projectTitle}</span></span> : null}
      {note.sourceIds.length ? <span className="flex shrink-0 items-center gap-1"><BookMarked aria-hidden="true" className="size-3" />{note.sourceIds.length} {note.sourceIds.length === 1 ? "source" : "sources"}</span> : null}
      <time className="ml-auto shrink-0" dateTime={new Date(note.updatedAt).toISOString()}>{dateFormatter.format(note.updatedAt)}</time>
      {action}
    </div>
  </article>;
}
