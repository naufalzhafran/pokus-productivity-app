import { KnowledgeEditor } from "@/components/features/KnowledgeEditor";
import { ResponsiveOverlay } from "@/components/features/ResponsiveOverlay";
import { emptyKnowledgeInput, knowledgeToInput } from "@/lib/knowledge";
import type { Capture } from "@/types/capture";
import type { Knowledge, KnowledgeInput } from "@/types/knowledge";
import type { Category, Project } from "@/types/task";

export interface KnowledgeComposerProps {
  /** The note to edit; omitted when writing a new one. */
  note?: Knowledge;
  /** Prefilled fields for a new note, such as its project or source. */
  defaults?: Partial<KnowledgeInput>;
  projects: Project[];
  captures: Capture[];
  categories: Category[];
  onClose: () => void;
  onSave: (input: KnowledgeInput) => Promise<unknown>;
}

/** The one place knowledge is written or edited, opened from anywhere in the app. */
export function KnowledgeComposer({ note, defaults, projects, captures, categories, onClose, onSave }: KnowledgeComposerProps) {
  return <ResponsiveOverlay open onOpenChange={(open) => { if (!open) onClose(); }} title={note ? "Edit knowledge" : "New knowledge"}
    description={note ? undefined : "Distill what you learned into a note you can reuse and relearn."}>
    <KnowledgeEditor initial={note ? knowledgeToInput(note) : emptyKnowledgeInput(defaults)} projects={projects} captures={captures} categories={categories}
      submitLabel={note ? "Save changes" : "Save knowledge"} onCancel={onClose} onSave={onSave} />
  </ResponsiveOverlay>;
}
