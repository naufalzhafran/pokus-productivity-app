import { KnowledgeReview } from "@/components/features/KnowledgeReview";
import type { Knowledge } from "@/types/knowledge";

interface BreakReviewProps {
  note: Knowledge;
  dueCount: number;
  readOnly: boolean;
  onReview: (remembered: boolean) => Promise<unknown>;
}

/** A due knowledge note offered on the session-complete screen, so breaks double as short reviews. */
export function BreakReview({ note, dueCount, readOnly, onReview }: BreakReviewProps) {
  return <section aria-labelledby="break-review-heading" className="mx-4 mb-4 flex flex-col gap-3 rounded-2xl border border-primary/25 bg-primary/5 p-4">
    <div>
      <h3 id="break-review-heading" className="text-sm font-medium">While you rest, relearn this</h3>
      <p className="text-xs text-muted-foreground">{dueCount} {dueCount === 1 ? "note" : "notes"} due for review</p>
    </div>
    <KnowledgeReview key={note.id} note={note} readOnly={readOnly} onReview={onReview} />
  </section>;
}
