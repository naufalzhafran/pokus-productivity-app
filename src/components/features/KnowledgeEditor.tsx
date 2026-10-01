import { lazy, Suspense, useMemo, useState, type FormEvent } from "react";
import { Folder, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CategoryCombobox } from "@/components/features/CategoryCombobox";
import { ProjectCombobox } from "@/components/features/ProjectCombobox";
import { SearchableChecklist, type ChecklistOption } from "@/components/features/SearchableChecklist";
import { CAPTURE_KIND_LABELS, captureDisplayTitle, captureHost } from "@/lib/capture";
import { KNOWLEDGE_LOCATOR_MAX_LENGTH, KNOWLEDGE_STATUS_LABELS, KNOWLEDGE_SUMMARY_MAX_LENGTH, KNOWLEDGE_TITLE_MAX_LENGTH, validateKnowledgeInput } from "@/lib/knowledge";
import { isProjectArchived } from "@/lib/workspace";
import type { Capture } from "@/types/capture";
import type { KnowledgeInput, KnowledgeStatus } from "@/types/knowledge";
import type { Category, Project } from "@/types/task";

const RichTextEditor = lazy(() => import("@/components/features/RichTextEditor").then((module) => ({ default: module.RichTextEditor })));

interface KnowledgeEditorProps {
  initial: KnowledgeInput;
  projects: Project[];
  captures: Capture[];
  categories: Category[];
  submitLabel: string;
  onCancel: () => void;
  onSave: (input: KnowledgeInput) => Promise<unknown>;
}

export function KnowledgeEditor({ initial, projects, captures, categories, submitLabel, onCancel, onSave }: KnowledgeEditorProps) {
  const [input, setInput] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof KnowledgeInput>(key: K, value: KnowledgeInput[K]) => setInput((current) => ({ ...current, [key]: value }));
  // Archived projects stay listed only when this note already uses them.
  const usable = useMemo(() => projects.filter((project) => !isProjectArchived(project) || project.id === initial.projectId || initial.linkedProjectIds.includes(project.id)), [initial.linkedProjectIds, initial.projectId, projects]);
  const projectOptions = useMemo<ChecklistOption[]>(() => usable.filter((project) => project.id !== input.projectId)
    .map((project) => ({ id: project.id, label: project.title, icon: <Folder aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> })), [input.projectId, usable]);
  const sourceOptions = useMemo<ChecklistOption[]>(() => captures.map((capture) => ({
    id: capture.id,
    label: captureDisplayTitle(capture),
    hint: [CAPTURE_KIND_LABELS[capture.kind], capture.author, capture.url ? captureHost(capture.url) : null].filter(Boolean).join(" · "),
  })), [captures]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const invalid = validateKnowledgeInput(input);
    if (invalid) { setError(invalid); return; }
    setSaving(true); setError(null);
    try { await onSave(input); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "This knowledge could not be saved."); }
    finally { setSaving(false); }
  };

  return <form onSubmit={submit} className="flex flex-col gap-5" aria-busy={saving}>
    <FieldGroup>
      <Field data-invalid={Boolean(error)}>
        <FieldLabel htmlFor="knowledge-title">Title</FieldLabel>
        <Input id="knowledge-title" value={input.title} maxLength={KNOWLEDGE_TITLE_MAX_LENGTH} disabled={saving} placeholder="The idea, in a few words" autoFocus
          onChange={(event) => set("title", event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? "knowledge-error" : undefined} />
        <FieldError id="knowledge-error">{error}</FieldError>
      </Field>
      <Field>
        <FieldLabel htmlFor="knowledge-summary">Summary</FieldLabel>
        <Textarea id="knowledge-summary" value={input.summary} maxLength={KNOWLEDGE_SUMMARY_MAX_LENGTH} disabled={saving} className="min-h-20" placeholder="One to three sentences you’d want to remember"
          onChange={(event) => set("summary", event.target.value)} aria-describedby="knowledge-summary-help" />
        <FieldDescription id="knowledge-summary-help">Shown on cards and first when you review.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel>Note</FieldLabel>
        <Suspense fallback={<div className="h-48 animate-pulse rounded-2xl bg-muted" />}>
          <RichTextEditor id="knowledge-body" label="Knowledge note" placeholder="Explain it in your own words, with examples…" value={input.body} onChange={(value) => set("body", value)} disabled={saving} />
        </Suspense>
      </Field>
      <Field>
        <FieldLabel>Status</FieldLabel>
        <ToggleGroup variant="outline" className="grid grid-cols-2" value={[input.status]} disabled={saving} aria-label="Knowledge status"
          onValueChange={(values) => values[0] && set("status", values[0] as KnowledgeStatus)}>
          {(["draft", "evergreen"] as const).map((status) => <ToggleGroupItem key={status} value={status}>{KNOWLEDGE_STATUS_LABELS[status]}</ToggleGroupItem>)}
        </ToggleGroup>
        <FieldDescription>Evergreen notes are finished and join your review queue.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="knowledge-project">Created in</FieldLabel>
        <ProjectCombobox id="knowledge-project" projects={usable} value={input.projectId} noneDescription="Standalone knowledge" disabled={saving}
          onValueChange={(value) => setInput((current) => ({ ...current, projectId: value, linkedProjectIds: current.linkedProjectIds.filter((id) => id !== value) }))} />
      </Field>
      <SearchableChecklist legend="Sources" options={sourceOptions} selected={input.sourceIds} onChange={(value) => set("sourceIds", value)} disabled={saving} emptyText="Nothing captured yet." />
      <Field>
        <FieldLabel htmlFor="knowledge-locator">Location in source</FieldLabel>
        <Input id="knowledge-locator" value={input.locator} maxLength={KNOWLEDGE_LOCATOR_MAX_LENGTH} disabled={saving} placeholder="Ch. 13, p. 162 · 12:40" onChange={(event) => set("locator", event.target.value)} />
      </Field>
      <SearchableChecklist legend="Also used in" options={projectOptions} selected={input.linkedProjectIds} onChange={(value) => set("linkedProjectIds", value)} disabled={saving} emptyText="No other projects." />
      <Field>
        <FieldLabel htmlFor="knowledge-category">Category</FieldLabel>
        <CategoryCombobox id="knowledge-category" categories={categories} value={input.categoryId} onValueChange={(value) => set("categoryId", value)} disabled={saving} />
      </Field>
    </FieldGroup>
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
      <Button type="submit" disabled={saving}>{saving ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}{saving ? "Saving…" : submitLabel}</Button>
    </div>
  </form>;
}
