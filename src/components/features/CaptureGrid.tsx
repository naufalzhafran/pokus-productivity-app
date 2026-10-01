import { lazy, Suspense, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { CaptureCard } from "@/components/features/CaptureCard";
import { CaptureOrganizer } from "@/components/features/CaptureOrganizer";
import { ResponsiveOverlay } from "@/components/features/ResponsiveOverlay";
import type { CaptureStore } from "@/hooks/useCaptures";
import { captureDisplayTitle } from "@/lib/capture";
import type { Capture } from "@/types/capture";
import type { Project } from "@/types/task";

const CaptureEditor = lazy(() => import("@/components/features/CaptureEditor").then((module) => ({ default: module.CaptureEditor })));
const errorMessage = (caught: unknown, fallback: string) => caught instanceof Error ? caught.message : fallback;

export interface CaptureGridProps {
  label: string;
  captures: Capture[];
  store: CaptureStore;
  projects: Project[];
  readOnly: boolean;
  onOrganize: (captureId: string, projectIds: string[], markProcessed: boolean) => Promise<unknown>;
  /** The project this grid is shown in; its chip is hidden and cards can be removed from it. */
  currentProject?: Project;
  onRemoveFromProject?: (captureId: string) => Promise<unknown>;
  empty: ReactNode;
}

/** Capture cards with their actions: process, organize into projects, edit, refresh preview, and delete. */
export function CaptureGrid({ label, captures, store, projects, readOnly, onOrganize, currentProject, onRemoveFromProject, empty }: CaptureGridProps) {
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  const [editing, setEditing] = useState<Capture | null>(null);
  const [organizing, setOrganizing] = useState<Capture | null>(null);
  const projectsByCapture = useMemo(() => {
    const map = new Map<string, Project[]>();
    for (const project of projects) {
      if (project.id === currentProject?.id) continue;
      for (const id of project.captureIds ?? []) map.set(id, [...(map.get(id) ?? []), project]);
    }
    return map;
  }, [currentProject?.id, projects]);

  const mutate = async (id: string, action: () => Promise<unknown>, success: string, failure: string) => {
    setPending((current) => new Set(current).add(id));
    try { await action(); toast.success(success); }
    catch (caught) { toast.error(errorMessage(caught, failure)); }
    finally { setPending((current) => { const next = new Set(current); next.delete(id); return next; }); }
  };
  const refresh = async (capture: Capture) => {
    if (!capture.url) return;
    try {
      if (await store.refreshPreview(capture.id, capture.url)) toast.success("Preview updated.");
      else toast.error("No preview is available for this link.");
    } catch (caught) {
      toast.error(errorMessage(caught, "The preview could not be saved."));
    }
  };

  if (store.isLoading) return <div className="grid gap-4 sm:grid-cols-2"><Skeleton className="h-72 w-full" /><Skeleton className="h-72 w-full" /></div>;
  return <>
    {captures.length ? <ul aria-label={label} className="grid items-start gap-4 sm:grid-cols-2">
      {captures.map((capture) => <li key={capture.id} className="min-w-0">
        <CaptureCard capture={capture} readOnly={readOnly} pending={pending.has(capture.id)} loadingPreview={store.previewing.has(capture.id)}
          projects={projectsByCapture.get(capture.id)}
          onToggleProcessed={() => void mutate(capture.id, () => store.setCaptureProcessed(capture.id, !capture.isProcessed), capture.isProcessed ? "Moved back to inbox." : "Marked as processed.", "This capture could not be updated.")}
          onOrganize={() => setOrganizing(capture)}
          onRemoveFromProject={onRemoveFromProject && currentProject ? () => void mutate(capture.id, () => onRemoveFromProject(capture.id), `Removed from ${currentProject.title}.`, "This capture could not be removed.") : undefined}
          onEdit={() => setEditing(capture)}
          onRefreshPreview={() => void refresh(capture)}
          onDelete={() => { if (window.confirm(`Delete ${captureDisplayTitle(capture)}? It will be removed from every project.`)) void mutate(capture.id, () => store.deleteCapture(capture.id), "Capture deleted.", "This capture could not be deleted."); }} />
      </li>)}
    </ul> : empty}
    <ResponsiveOverlay open={Boolean(editing)} onOpenChange={(open) => { if (!open) setEditing(null); }} title="Edit capture">
      {editing ? <Suspense fallback={<Skeleton className="h-72 w-full" />}>
        <CaptureEditor capture={editing} onCancel={() => setEditing(null)} onSave={async (input) => { await store.updateCapture(editing.id, input); setEditing(null); toast.success("Capture updated."); }} />
      </Suspense> : null}
    </ResponsiveOverlay>
    <ResponsiveOverlay open={Boolean(organizing)} onOpenChange={(open) => { if (!open) setOrganizing(null); }} title="Add to projects" description={organizing ? captureDisplayTitle(organizing) : undefined}>
      {organizing ? <CaptureOrganizer capture={organizing} projects={projects} onCancel={() => setOrganizing(null)} onSave={async (projectIds, markProcessed) => {
        await onOrganize(organizing.id, projectIds, markProcessed);
        setOrganizing(null);
        toast.success(projectIds.length ? `In ${projectIds.length} ${projectIds.length === 1 ? "project" : "projects"}.` : "Removed from all projects.");
      }} /> : null}
    </ResponsiveOverlay>
  </>;
}
