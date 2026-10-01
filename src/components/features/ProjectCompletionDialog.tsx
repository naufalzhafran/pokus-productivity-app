import { useState } from "react";
import { Lightbulb, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldError } from "@/components/ui/field";
import { ResponsiveOverlay } from "@/components/features/ResponsiveOverlay";
import type { Project } from "@/types/task";

interface ProjectCompletionDialogProps {
  project: Project | null;
  /** Captures in the project that aren't processed yet. */
  unprocessedCaptureCount: number;
  draftCount: number;
  onClose: () => void;
  onFinish: (options: { writeKnowledge: boolean; markProcessed: boolean }) => Promise<unknown>;
}

/** Asks what a just-completed project taught you: the Express moment. */
export function ProjectCompletionDialog({ project, unprocessedCaptureCount, draftCount, onClose, onFinish }: ProjectCompletionDialogProps) {
  const [markProcessed, setMarkProcessed] = useState(true);
  const [pending, setPending] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const finish = async (writeKnowledge: boolean) => {
    setPending(writeKnowledge); setError(null);
    try { await onFinish({ writeKnowledge, markProcessed: markProcessed && unprocessedCaptureCount > 0 }); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Captures could not be updated."); }
    finally { setPending(null); }
  };

  return <ResponsiveOverlay open={Boolean(project)} onOpenChange={(open) => { if (!open) onClose(); }} title="Project completed" description={project ? `What did ${project.title} teach you?` : undefined} className="sm:max-w-lg">
    {project ? <div className="flex flex-col gap-4" aria-busy={pending !== null}>
      <div className="flex gap-3 rounded-2xl bg-muted p-4 text-sm leading-relaxed">
        <Lightbulb aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
        <p>Write what you learned while it’s fresh. It becomes knowledge you can find and relearn later.{draftCount ? ` ${draftCount} ${draftCount === 1 ? "draft is" : "drafts are"} waiting to be finished in this project.` : ""}</p>
      </div>
      {unprocessedCaptureCount ? <label className="flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm">
        <Checkbox checked={markProcessed} onCheckedChange={(checked) => setMarkProcessed(Boolean(checked))} disabled={pending !== null} />
        Mark its {unprocessedCaptureCount} unprocessed {unprocessedCaptureCount === 1 ? "capture" : "captures"} as processed
      </label> : null}
      <FieldError>{error}</FieldError>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" disabled={pending !== null} onClick={() => void finish(false)}>{pending === false ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}Not now</Button>
        <Button type="button" disabled={pending !== null} onClick={() => void finish(true)}>{pending === true ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}Write what I learned</Button>
      </div>
    </div> : null}
  </ResponsiveOverlay>;
}
