import type { Capture } from "@/types/capture";
import type { Knowledge, KnowledgeInput, KnowledgeStatus } from "@/types/knowledge";

export const KNOWLEDGE_TITLE_MAX_LENGTH = 300;
export const KNOWLEDGE_SUMMARY_MAX_LENGTH = 1000;
export const KNOWLEDGE_LOCATOR_MAX_LENGTH = 120;
export const KNOWLEDGE_STATUS_LABELS: Record<KnowledgeStatus, string> = { draft: "Draft", evergreen: "Evergreen" };

export function emptyKnowledgeInput(defaults: Partial<KnowledgeInput> = {}): KnowledgeInput {
  return { title: "", summary: "", body: "", projectId: null, linkedProjectIds: [], sourceIds: [], locator: "", categoryId: null, status: "draft", ...defaults };
}

export function knowledgeToInput(note: Knowledge): KnowledgeInput {
  const { title, summary, body, projectId, linkedProjectIds, sourceIds, locator, categoryId, status } = note;
  return { title, summary, body, projectId, linkedProjectIds, sourceIds, locator, categoryId, status };
}

export function validateKnowledgeInput(input: KnowledgeInput) {
  if (!input.title.trim()) return "Give this knowledge a title.";
  if (input.title.trim().length > KNOWLEDGE_TITLE_MAX_LENGTH) return `Titles can be up to ${KNOWLEDGE_TITLE_MAX_LENGTH} characters.`;
  if (input.summary.trim().length > KNOWLEDGE_SUMMARY_MAX_LENGTH) return `Summaries can be up to ${KNOWLEDGE_SUMMARY_MAX_LENGTH} characters.`;
  if (input.locator.trim().length > KNOWLEDGE_LOCATOR_MAX_LENGTH) return `Locations can be up to ${KNOWLEDGE_LOCATOR_MAX_LENGTH} characters.`;
  return null;
}

/** Trims text and keeps relation lists unique; the origin project is never also a reference. */
export function normalizeKnowledgeInput(input: KnowledgeInput): KnowledgeInput {
  const error = validateKnowledgeInput(input);
  if (error) throw new Error(error);
  return {
    ...input,
    title: input.title.trim(),
    summary: input.summary.trim(),
    locator: input.locator.trim(),
    linkedProjectIds: [...new Set(input.linkedProjectIds)].filter((id) => id !== input.projectId),
    sourceIds: [...new Set(input.sourceIds)],
  };
}

/** Plain text of rich-text HTML, for search and previews. */
export function htmlToPlainText(html: string) {
  return html.replace(/<(br|\/p|\/li|\/h\d|\/blockquote)[^>]*>/gi, " ").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
}

export function knowledgeMatches(note: Knowledge, search: string) {
  const needle = search.trim().toLocaleLowerCase();
  if (!needle) return true;
  return [note.title, note.summary, note.locator, htmlToPlainText(note.body)].some((value) => value.toLocaleLowerCase().includes(needle));
}

/** Notes grouped by each capture they were distilled from. */
export function knowledgeBySource(notes: Knowledge[]) {
  const map = new Map<string, Knowledge[]>();
  for (const note of notes) for (const id of note.sourceIds) map.set(id, [...(map.get(id) ?? []), note]);
  return map;
}

export type CaptureStage = "inbox" | "in_progress" | "processed";

/** Inbox until a capture is in a project or distilled into knowledge; processed only when marked. */
export function captureStage(capture: Pick<Capture, "id" | "isProcessed">, filedIds: ReadonlySet<string>, sourcedIds: ReadonlySet<string>): CaptureStage {
  if (capture.isProcessed) return "processed";
  return filedIds.has(capture.id) || sourcedIds.has(capture.id) ? "in_progress" : "inbox";
}
