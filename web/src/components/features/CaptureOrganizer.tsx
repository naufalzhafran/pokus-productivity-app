import { useDeferredValue, useMemo, useState, type FormEvent } from "react";
import { Folder, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { isProjectArchived } from "@/lib/workspace";
import type { Capture } from "@/types/capture";
import type { Project } from "@/types/task";

interface CaptureOrganizerProps {
  capture: Capture;
  projects: Project[];
  onCancel: () => void;
  onSave: (projectIds: string[], markProcessed: boolean) => Promise<unknown>;
}

/** Chooses which projects contain a capture. */
export function CaptureOrganizer({ capture, projects, onCancel, onSave }: CaptureOrganizerProps) {
  const initial = useMemo(() => projects.filter((project) => project.captureIds?.includes(capture.id)).map((project) => project.id), [capture.id, projects]);
  const [selected, setSelected] = useState<string[]>(initial);
  const [markProcessed, setMarkProcessed] = useState(!capture.isProcessed);
  const [search, setSearch] = useState("");
  const needle = useDeferredValue(search).trim().toLocaleLowerCase();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Archived projects only show up when they already contain this capture.
  const options = projects.filter((project) => (!isProjectArchived(project) || initial.includes(project.id)) && (!needle || project.title.toLocaleLowerCase().includes(needle)));

  const toggle = (projectId: string, checked: boolean) => setSelected((current) => checked ? [...current, projectId] : current.filter((id) => id !== projectId));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true); setError(null);
    try { await onSave(selected, markProcessed && selected.length > 0); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Projects could not be updated."); }
    finally { setSaving(false); }
  };

  return <form onSubmit={submit} className="flex flex-col gap-4" aria-busy={saving}>
    {projects.length > 6 ? <label className="relative">
      <span className="sr-only">Search projects</span>
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <Input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search projects" className="pl-9" />
    </label> : null}
    <fieldset className="flex flex-col gap-0.5">
      <legend className="sr-only">Projects</legend>
      {options.map((project) => (
        <label key={project.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-muted">
          <Checkbox checked={selected.includes(project.id)} onCheckedChange={(checked) => toggle(project.id, checked)} disabled={saving} />
          <Folder aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{project.title}</span>
        </label>
      ))}
      {!options.length ? <p className="px-3 py-6 text-center text-sm text-muted-foreground">{needle ? "No matching projects." : "No projects yet. Create one from the Projects page."}</p> : null}
    </fieldset>
    {!capture.isProcessed ? <label className="flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm">
      <Checkbox checked={markProcessed} onCheckedChange={setMarkProcessed} disabled={saving} />
      Mark as processed when it’s in a project
    </label> : null}
    <FieldError>{error}</FieldError>
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
      <Button type="submit" disabled={saving}>{saving ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}{saving ? "Saving…" : "Save"}</Button>
    </div>
  </form>;
}
