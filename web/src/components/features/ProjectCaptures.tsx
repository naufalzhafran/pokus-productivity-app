import { useMemo, useState } from "react";
import { FolderInput, Inbox } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { CaptureGrid } from "@/components/features/CaptureGrid";
import { CapturePicker } from "@/components/features/CapturePicker";
import { QuickCapture } from "@/components/features/QuickCapture";
import { ResponsiveOverlay } from "@/components/features/ResponsiveOverlay";
import type { CaptureStore } from "@/hooks/useCaptures";
import type { Capture, CaptureInput } from "@/types/capture";
import type { Knowledge } from "@/types/knowledge";
import type { Project } from "@/types/task";

export interface ProjectCapturesProps {
  project: Project;
  store: CaptureStore;
  projects: Project[];
  readOnly: boolean;
  onOrganize: (captureId: string, projectIds: string[], markProcessed: boolean) => Promise<unknown>;
  onAddCaptures: (projectId: string, captureIds: string[], markProcessed: boolean) => Promise<unknown>;
  onRemoveCapture: (projectId: string, captureId: string) => Promise<unknown>;
  onCaptureToProject: (projectId: string, input: CaptureInput) => Promise<unknown>;
  knowledgeBySource?: ReadonlyMap<string, Knowledge[]>;
  onDistill?: (capture: Capture) => void;
}

/** The captures a project contains, newest additions first. */
export function ProjectCaptures({ project, store, projects, readOnly, onOrganize, onAddCaptures, onRemoveCapture, onCaptureToProject, knowledgeBySource, onDistill }: ProjectCapturesProps) {
  const [picking, setPicking] = useState(false);
  const captureMap = useMemo(() => new Map(store.captures.map((capture) => [capture.id, capture])), [store.captures]);
  const contained = useMemo(() => [...(project.captureIds ?? [])].reverse().flatMap((id) => captureMap.get(id) ?? []), [captureMap, project.captureIds]);
  const available = useMemo(() => store.captures.filter((capture) => !project.captureIds?.includes(capture.id)), [project.captureIds, store.captures]);

  return <div className="grid gap-5 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
    <div className="flex flex-col gap-3 lg:sticky lg:top-6">
      <QuickCapture readOnly={readOnly} onCapture={(input) => onCaptureToProject(project.id, input)} title="Capture to this project"
        description="Save a link or thought straight into this project." successMessage={`Captured to ${project.title}.`} />
      <Button variant="outline" disabled={readOnly || !available.length} onClick={() => setPicking(true)}><FolderInput />Add existing captures</Button>
    </div>
    <CaptureGrid label={`${project.title} captures`} captures={contained} store={store} projects={projects} readOnly={readOnly} onOrganize={onOrganize}
      currentProject={project} onRemoveFromProject={(captureId) => onRemoveCapture(project.id, captureId)} knowledgeBySource={knowledgeBySource} onDistill={onDistill}
      empty={<Empty className="min-h-64 border">
        <EmptyHeader>
          <EmptyMedia variant="icon"><Inbox /></EmptyMedia>
          <EmptyTitle>No captures yet</EmptyTitle>
          <EmptyDescription>Capture something here, or add links and notes from your inbox.</EmptyDescription>
        </EmptyHeader>
        {available.length ? <Button variant="outline" disabled={readOnly} onClick={() => setPicking(true)}><FolderInput />Add existing captures</Button> : null}
      </Empty>} />
    <ResponsiveOverlay open={picking} onOpenChange={setPicking} title="Add captures" description={`Choose captures to add to ${project.title}.`}>
      {picking ? <CapturePicker captures={available} onCancel={() => setPicking(false)} onAdd={async (captureIds, markProcessed) => {
        await onAddCaptures(project.id, captureIds, markProcessed);
        setPicking(false);
        toast.success(`Added ${captureIds.length} ${captureIds.length === 1 ? "capture" : "captures"} to ${project.title}.`);
      }} /> : null}
    </ResponsiveOverlay>
  </div>;
}
