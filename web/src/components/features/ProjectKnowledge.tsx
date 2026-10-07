import { useMemo, useState, type FormEvent } from "react";
import { Lightbulb, Link2, Loader2, Plus, Unlink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { FieldError } from "@/components/ui/field";
import { KnowledgeCard } from "@/components/features/KnowledgeCard";
import { ResponsiveOverlay } from "@/components/features/ResponsiveOverlay";
import { SearchableChecklist } from "@/components/features/SearchableChecklist";
import type { KnowledgeStore } from "@/hooks/useKnowledge";
import { KNOWLEDGE_STATUS_LABELS } from "@/lib/knowledge";
import type { Knowledge } from "@/types/knowledge";
import type { Project } from "@/types/task";

export interface ProjectKnowledgeProps {
  project: Project;
  store: KnowledgeStore;
  projects: Project[];
  readOnly: boolean;
  onCompose: () => void;
}

function KnowledgePicker({ options, onCancel, onLink }: { options: Knowledge[]; onCancel: () => void; onLink: (ids: string[]) => Promise<unknown> }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected.length) return;
    setSaving(true); setError(null);
    try { await onLink(selected); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Knowledge could not be linked."); }
    finally { setSaving(false); }
  };
  return <form onSubmit={submit} className="flex flex-col gap-4" aria-busy={saving}>
    <SearchableChecklist legend="Knowledge" hideLegend options={options.map((note) => ({ id: note.id, label: note.title, hint: [KNOWLEDGE_STATUS_LABELS[note.status], note.summary].filter(Boolean).join(" · ") }))}
      selected={selected} onChange={setSelected} disabled={saving} emptyText="All your knowledge is already in this project." />
    <FieldError>{error}</FieldError>
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
      <Button type="submit" disabled={saving || !selected.length}>
        {saving ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}
        {selected.length ? `Link ${selected.length}` : "Link knowledge"}
      </Button>
    </div>
  </form>;
}

/** Knowledge created in a project, and existing knowledge the project references. */
export function ProjectKnowledge({ project, store, projects, readOnly, onCompose }: ProjectKnowledgeProps) {
  const [picking, setPicking] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const projectMap = useMemo(() => new Map(projects.map((item) => [item.id, item])), [projects]);
  const created = useMemo(() => store.knowledge.filter((note) => note.projectId === project.id), [project.id, store.knowledge]);
  const referenced = useMemo(() => store.knowledge.filter((note) => note.projectId !== project.id && note.linkedProjectIds.includes(project.id)), [project.id, store.knowledge]);
  const available = useMemo(() => store.knowledge.filter((note) => note.projectId !== project.id && !note.linkedProjectIds.includes(project.id)), [project.id, store.knowledge]);

  const unlink = async (note: Knowledge) => {
    setPending(note.id);
    try { await store.setKnowledgeLinked(note.id, project.id, false); toast.success(`Unlinked from ${project.title}.`); }
    catch (caught) { toast.error(caught instanceof Error ? caught.message : "This knowledge could not be unlinked."); }
    finally { setPending(null); }
  };
  const link = async (ids: string[]) => {
    const failed = (await Promise.allSettled(ids.map((id) => store.setKnowledgeLinked(id, project.id, true)))).find((result) => result.status === "rejected");
    if (failed) throw failed.reason;
    setPicking(false);
    toast.success(`Linked ${ids.length} ${ids.length === 1 ? "note" : "notes"} to ${project.title}.`);
  };

  return <div className="flex flex-col gap-6">
    <div className="flex flex-wrap gap-2">
      <Button disabled={readOnly} onClick={onCompose}><Plus />New knowledge</Button>
      <Button variant="outline" disabled={readOnly || !available.length} onClick={() => setPicking(true)}><Link2 />Link existing</Button>
    </div>
    <section aria-labelledby="project-knowledge-created" className="flex flex-col gap-3">
      <h2 id="project-knowledge-created" className="text-sm font-medium">Created here <span className="font-normal text-muted-foreground">{created.length}</span></h2>
      {created.length ? <ul aria-label="Knowledge created here" className="grid items-start gap-4 sm:grid-cols-2">
        {created.map((note) => <li key={note.id} className="min-w-0"><KnowledgeCard note={note} /></li>)}
      </ul> : <Empty className="min-h-40 border">
        <EmptyHeader>
          <EmptyMedia variant="icon"><Lightbulb /></EmptyMedia>
          <EmptyTitle>Nothing learned here yet</EmptyTitle>
          <EmptyDescription>Write down what this project taught you, so you can relearn it later.</EmptyDescription>
        </EmptyHeader>
      </Empty>}
    </section>
    <section aria-labelledby="project-knowledge-referenced" className="flex flex-col gap-3">
      <h2 id="project-knowledge-referenced" className="text-sm font-medium">References <span className="font-normal text-muted-foreground">{referenced.length}</span></h2>
      {referenced.length ? <ul aria-label="Referenced knowledge" className="grid items-start gap-4 sm:grid-cols-2">
        {referenced.map((note) => <li key={note.id} className="min-w-0">
          <KnowledgeCard note={note} projectTitle={note.projectId ? projectMap.get(note.projectId)?.title : undefined}
            action={<Button type="button" variant="ghost" size="icon-sm" disabled={readOnly || pending === note.id} onClick={() => void unlink(note)} aria-label={`Unlink ${note.title} from ${project.title}`} title="Unlink"><Unlink /></Button>} />
        </li>)}
      </ul> : <p className="text-sm text-muted-foreground">Link knowledge from other projects or books that this project builds on.</p>}
    </section>
    <ResponsiveOverlay open={picking} onOpenChange={setPicking} title="Link knowledge" description={`Choose knowledge that ${project.title} builds on.`}>
      {picking ? <KnowledgePicker options={available} onCancel={() => setPicking(false)} onLink={link} /> : null}
    </ResponsiveOverlay>
  </div>;
}
