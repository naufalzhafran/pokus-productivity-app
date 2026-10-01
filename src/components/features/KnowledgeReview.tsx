import { lazy, Suspense, useState } from "react";
import { ChevronDown, Loader2, RotateCcw, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { htmlToPlainText } from "@/lib/knowledge";
import { knowledgeHash } from "@/lib/routes";
import type { Knowledge } from "@/types/knowledge";

const RichTextContent = lazy(() => import("@/components/features/RichTextContent").then((module) => ({ default: module.RichTextContent })));

interface KnowledgeReviewProps {
  note: Knowledge;
  readOnly?: boolean;
  onReview: (remembered: boolean) => Promise<unknown>;
}

/** Recall first: the summary is shown, the full note on request, then you rate how well you remembered it. */
export function KnowledgeReview({ note, readOnly = false, onReview }: KnowledgeReviewProps) {
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasBody = Boolean(htmlToPlainText(note.body));

  const review = async (remembered: boolean) => {
    setPending(remembered); setError(null);
    try { await onReview(remembered); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "This review could not be saved."); }
    finally { setPending(null); }
  };

  return <div className="flex min-w-0 flex-col gap-3" aria-busy={pending !== null}>
    <div className="flex flex-col gap-1">
      <a href={knowledgeHash(note.id)} className="font-semibold leading-snug [overflow-wrap:anywhere] hover:underline">{note.title}</a>
      {note.locator ? <p className="text-xs text-muted-foreground">{note.locator}</p> : null}
    </div>
    {note.summary ? <p className="whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">{note.summary}</p> : null}
    {hasBody ? <>
      <Button type="button" variant="ghost" size="sm" className="-ml-2 self-start" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
        <ChevronDown data-icon="inline-start" className={expanded ? "rotate-180 transition-transform motion-reduce:transition-none" : "transition-transform motion-reduce:transition-none"} />
        {expanded ? "Hide full note" : "Show full note"}
      </Button>
      {expanded ? <Suspense fallback={null}><RichTextContent html={note.body} /></Suspense> : null}
    </> : null}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    <div className="grid grid-cols-2 gap-2">
      <Button type="button" variant="outline" disabled={readOnly || pending !== null} onClick={() => void review(false)}>
        {pending === false ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <RotateCcw data-icon="inline-start" />}Review sooner
      </Button>
      <Button type="button" disabled={readOnly || pending !== null} onClick={() => void review(true)}>
        {pending === true ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <ThumbsUp data-icon="inline-start" />}Remembered
      </Button>
    </div>
  </div>;
}
