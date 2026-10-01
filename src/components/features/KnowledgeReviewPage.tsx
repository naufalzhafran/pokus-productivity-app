import { useEffect, useRef } from "react";
import { ArrowLeft, PartyPopper } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { KnowledgeReview } from "@/components/features/KnowledgeReview";
import type { KnowledgeStore } from "@/hooks/useKnowledge";
import { dueKnowledge, nextDueAt, REVIEW_INTERVAL_DAYS } from "@/lib/review";
import { cn } from "@/lib/utils";

const dateFormatter = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });

interface KnowledgeReviewPageProps {
  readOnly: boolean;
  store: KnowledgeStore;
}

/** One due note at a time; each review reschedules it, which moves the queue forward. */
export function KnowledgeReviewPage({ readOnly, store }: KnowledgeReviewPageProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const due = dueKnowledge(store.knowledge);
  const current = due[0];
  const upcoming = nextDueAt(store.knowledge);

  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); }, []);

  return <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
    <a href="#knowledge" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2 self-start")}><ArrowLeft />Knowledge</a>
    <header>
      <h1 ref={headingRef} tabIndex={-1} className="font-heading text-2xl font-semibold outline-none md:text-3xl">Review</h1>
      <p className="mt-1 text-sm text-muted-foreground" role="status">{store.isLoading ? "Loading…" : due.length ? `${due.length} ${due.length === 1 ? "note" : "notes"} due` : "Nothing due"}</p>
    </header>
    {store.isLoading ? <Skeleton className="h-56 w-full" /> : current ? <Card>
      <CardHeader>
        <CardTitle>Try to recall it first</CardTitle>
        <CardDescription>Remembered notes come back after {REVIEW_INTERVAL_DAYS.join(", ")} days. Review sooner starts over at one day.</CardDescription>
      </CardHeader>
      <CardContent>
        <KnowledgeReview key={current.id} note={current} readOnly={readOnly} onReview={(remembered) => store.reviewKnowledge(current.id, remembered)} />
      </CardContent>
    </Card> : <Empty className="min-h-64 border">
      <EmptyHeader>
        <EmptyMedia variant="icon"><PartyPopper /></EmptyMedia>
        <EmptyTitle>All caught up</EmptyTitle>
        <EmptyDescription>{upcoming ? `Your next review is on ${dateFormatter.format(upcoming)}.` : "Mark knowledge as evergreen to add it to your review queue."}</EmptyDescription>
      </EmptyHeader>
    </Empty>}
  </div>;
}
