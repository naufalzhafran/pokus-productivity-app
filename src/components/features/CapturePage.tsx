import { lazy, Suspense, useDeferredValue, useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { Inbox, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CaptureCard, CapturePreview } from "@/components/features/CaptureCard";
import { ResponsiveOverlay } from "@/components/features/ResponsiveOverlay";
import { useCaptures } from "@/hooks/useCaptures";
import { CAPTURE_KINDS, CAPTURE_NOTE_MAX_LENGTH, captureDisplayTitle, parseCaptureText, validateCaptureInput } from "@/lib/capture";
import { fetchLinkPreview } from "@/lib/link-preview";
import type { Capture, CaptureKind, LinkPreview } from "@/types/capture";

const CaptureEditor = lazy(() => import("@/components/features/CaptureEditor").then((module) => ({ default: module.CaptureEditor })));
const kindFilterLabels: Record<CaptureKind, string> = { note: "Notes", article: "Articles", social: "Social", video: "Videos", drive: "Drive" };
const PREVIEW_DELAY_MS = 400;
const errorMessage = (caught: unknown, fallback: string) => caught instanceof Error ? caught.message : fallback;

type StatusFilter = "inbox" | "processed";
type KindFilter = "all" | CaptureKind;

function QuickCapture({ readOnly, onCapture }: { readOnly: boolean; onCapture: ReturnType<typeof useCaptures>["createCapture"] }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lookup, setLookup] = useState<{ url: string; preview: LinkPreview | null } | null>(null);
  const parsed = useMemo(() => text.trim() ? parseCaptureText(text) : null, [text]);
  const url = parsed?.url ?? null;
  const preview = lookup && lookup.url === url ? lookup.preview : undefined;

  useEffect(() => {
    if (!url || readOnly) return;
    let current = true;
    const timer = window.setTimeout(() => void fetchLinkPreview(url).then((value) => { if (current) setLookup({ url, preview: value }); }), PREVIEW_DELAY_MS);
    return () => { current = false; window.clearTimeout(timer); };
  }, [readOnly, url]);

  const draft: Capture | null = parsed && url ? { id: "draft", ...parsed, preview: preview ?? null, isProcessed: false, createdAt: 0, updatedAt: 0 } : null;

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!parsed) return;
    const invalid = validateCaptureInput(parsed);
    if (invalid) { setError(invalid); return; }
    setIsSaving(true); setError(null);
    try {
      await onCapture({ ...parsed, preview });
      setText("");
      toast.success("Captured to your inbox.");
    } catch (caught) {
      setError(errorMessage(caught, "This could not be captured. Try again."));
    } finally {
      setIsSaving(false);
    }
  };
  const submitOnShortcut = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void submit(); }
  };

  return <Card size="sm">
    <CardHeader>
      <CardTitle className="text-lg">Quick capture</CardTitle>
      <CardDescription>Save it now, sort it later. Paste a post, article, YouTube video, or Google Drive link, or just write a thought.</CardDescription>
    </CardHeader>
    <CardContent>
      <form onSubmit={submit} className="flex flex-col gap-3" aria-busy={isSaving}>
        <label htmlFor="quick-capture" className="sr-only">Link or thought to capture</label>
        <Textarea id="quick-capture" value={text} maxLength={CAPTURE_NOTE_MAX_LENGTH} disabled={readOnly || isSaving} onKeyDown={submitOnShortcut}
          onChange={(event) => { setText(event.target.value); setError(null); }} placeholder="Paste a link or jot down a thought…" className="min-h-24"
          aria-invalid={Boolean(error)} aria-describedby={error ? "quick-capture-error" : undefined} />
        <FieldError id="quick-capture-error">{error}</FieldError>
        {draft ? <section aria-label="Link preview" className="overflow-hidden rounded-2xl border bg-background">
          <CapturePreview capture={draft} loading={preview === undefined && !readOnly} />
        </section> : null}
        <div className="flex items-center justify-between gap-3">
          <p className="hidden text-xs text-muted-foreground sm:block">⌘ Enter or Ctrl Enter to capture</p>
          <Button type="submit" className="ml-auto" disabled={readOnly || isSaving || !parsed}>
            {isSaving ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Plus data-icon="inline-start" />}
            {isSaving ? "Capturing…" : "Capture"}
          </Button>
        </div>
      </form>
    </CardContent>
  </Card>;
}

export function CapturePage({ readOnly = false }: { readOnly?: boolean }) {
  const { captures, previewing, isLoading, loadError, createCapture, updateCapture, refreshPreview, setCaptureProcessed, deleteCapture } = useCaptures();
  const [status, setStatus] = useState<StatusFilter>("inbox");
  const [kind, setKind] = useState<KindFilter>("all");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase());
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  const [editing, setEditing] = useState<Capture | null>(null);

  const inStatus = useMemo(() => captures.filter((capture) => capture.isProcessed === (status === "processed")), [captures, status]);
  const inboxCount = useMemo(() => captures.filter((capture) => !capture.isProcessed).length, [captures]);
  const visible = useMemo(() => inStatus.filter((capture) =>
    (kind === "all" || capture.kind === kind) &&
    (!deferredSearch || [capture.title, capture.note, capture.url ?? "", capture.preview?.title ?? "", capture.preview?.description ?? "", capture.preview?.author ?? ""]
      .some((value) => value.toLocaleLowerCase().includes(deferredSearch))),
  ), [deferredSearch, inStatus, kind]);

  const mutate = async (id: string, action: () => Promise<unknown>, success: string, failure: string) => {
    setPending((current) => new Set(current).add(id));
    try { await action(); toast.success(success); }
    catch (caught) { toast.error(errorMessage(caught, failure)); }
    finally { setPending((current) => { const next = new Set(current); next.delete(id); return next; }); }
  };
  const refresh = async (capture: Capture) => {
    if (!capture.url) return;
    try {
      if (await refreshPreview(capture.id, capture.url)) toast.success("Preview updated.");
      else toast.error("No preview is available for this link.");
    } catch (caught) {
      toast.error(errorMessage(caught, "The preview could not be saved."));
    }
  };

  const filtered = Boolean(deferredSearch) || kind !== "all";
  return <div className="grid gap-5 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start">
    <div className="lg:sticky lg:top-6"><QuickCapture readOnly={readOnly} onCapture={createCapture} /></div>
    <section aria-label="Captures" className="flex min-w-0 flex-col gap-4">
      {loadError ? <p role="alert" className="text-sm text-destructive">{loadError}</p> : null}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <ToggleGroup variant="outline" className="grid w-full shrink-0 grid-cols-2 sm:w-64" value={[status]} onValueChange={(values) => values[0] && setStatus(values[0] as StatusFilter)} aria-label="Capture status">
            <ToggleGroupItem value="inbox">Inbox{inboxCount ? ` (${inboxCount})` : ""}</ToggleGroupItem>
            <ToggleGroupItem value="processed">Processed</ToggleGroupItem>
          </ToggleGroup>
          <label className="relative flex-1">
            <span className="sr-only">Search captures</span>
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input type="search" enterKeyHint="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search captures" className="pl-9" />
          </label>
        </div>
        <div className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          <ToggleGroup variant="outline" size="sm" className="w-max" value={[kind]} onValueChange={(values) => values[0] && setKind(values[0] as KindFilter)} aria-label="Filter by type">
            <ToggleGroupItem value="all">All</ToggleGroupItem>
            {CAPTURE_KINDS.map((value) => <ToggleGroupItem key={value} value={value}>{kindFilterLabels[value]}</ToggleGroupItem>)}
          </ToggleGroup>
        </div>
      </div>
      {isLoading ? <div className="grid gap-4 sm:grid-cols-2"><Skeleton className="h-72 w-full" /><Skeleton className="h-72 w-full" /></div> : visible.length ? <ul aria-label={status === "inbox" ? "Inbox captures" : "Processed captures"} className="grid items-start gap-4 sm:grid-cols-2">
        {visible.map((capture) => <li key={capture.id} className="min-w-0">
          <CaptureCard capture={capture} readOnly={readOnly} pending={pending.has(capture.id)} loadingPreview={previewing.has(capture.id)}
            onToggleProcessed={() => void mutate(capture.id, () => setCaptureProcessed(capture.id, !capture.isProcessed), capture.isProcessed ? "Moved back to inbox." : "Marked as processed.", "This capture could not be updated.")}
            onEdit={() => setEditing(capture)}
            onRefreshPreview={() => void refresh(capture)}
            onDelete={() => { if (window.confirm(`Delete ${captureDisplayTitle(capture)}?`)) void mutate(capture.id, () => deleteCapture(capture.id), "Capture deleted.", "This capture could not be deleted."); }} />
        </li>)}
      </ul> : <Empty className="min-h-72 border">
        <EmptyHeader>
          <EmptyMedia variant="icon"><Inbox /></EmptyMedia>
          <EmptyTitle>{filtered ? "No matching captures" : status === "inbox" ? "Your inbox is clear" : "Nothing processed yet"}</EmptyTitle>
          <EmptyDescription>{filtered ? "Try a different search or type." : status === "inbox" ? "Anything you capture lands here until you process it." : "Captures you mark as processed will appear here."}</EmptyDescription>
        </EmptyHeader>
        {filtered ? <Button variant="outline" onClick={() => { setSearch(""); setKind("all"); }}>Clear filters</Button> : null}
      </Empty>}
    </section>
    <ResponsiveOverlay open={Boolean(editing)} onOpenChange={(open) => { if (!open) setEditing(null); }} title="Edit capture">
      {editing ? <Suspense fallback={<Skeleton className="h-72 w-full" />}>
        <CaptureEditor capture={editing} onCancel={() => setEditing(null)} onSave={async (input) => { await updateCapture(editing.id, input); setEditing(null); toast.success("Capture updated."); }} />
      </Suspense> : null}
    </ResponsiveOverlay>
  </div>;
}
