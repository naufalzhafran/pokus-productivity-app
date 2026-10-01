export type KnowledgeStatus = "draft" | "evergreen";

/** A distilled, reusable note: the "Express" step of the second-brain loop. */
export interface Knowledge {
  id: string;
  title: string;
  summary: string;
  /** Sanitized rich-text HTML. */
  body: string;
  /** The project this note was created in. */
  projectId: string | null;
  /** Projects that reference this note. */
  linkedProjectIds: string[];
  /** Captures this note was distilled from. */
  sourceIds: string[];
  /** Where in the sources, e.g. `Ch. 13, p. 162` or `12:40`. */
  locator: string;
  categoryId: string | null;
  status: KnowledgeStatus;
  reviewStep: number;
  /** Epoch milliseconds; `null` when the note is not scheduled for review. */
  nextReviewAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface KnowledgeInput {
  title: string;
  summary: string;
  body: string;
  projectId: string | null;
  linkedProjectIds: string[];
  sourceIds: string[];
  locator: string;
  categoryId: string | null;
  status: KnowledgeStatus;
}
