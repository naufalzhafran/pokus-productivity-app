import { useDeferredValue, useMemo, useState, type FormEvent } from "react";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { CAPTURE_KIND_LABELS, captureDisplayTitle, captureHost, captureMatches } from "@/lib/capture";
import type { Capture } from "@/types/capture";

interface CapturePickerProps {
  /** Captures that can be added; inbox captures are listed first. */
  captures: Capture[];
  onCancel: () => void;
  onAdd: (captureIds: string[], markProcessed: boolean) => Promise<unknown>;
}

/** Picks existing captures to add to a project. */
export function CapturePicker({ captures, onCancel, onAdd }: CapturePickerProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [markProcessed, setMarkProcessed] = useState(true);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const options = useMemo(() => captures.filter((capture) => captureMatches(capture, deferredSearch)).sort((a, b) => Number(a.isProcessed) - Number(b.isProcessed) || b.createdAt - a.createdAt), [captures, deferredSearch]);
  const hasInboxSelection = selected.some((id) => !captures.find((capture) => capture.id === id)?.isProcessed);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected.length) return;
    setSaving(true); setError(null);
    try { await onAdd(selected, markProcessed); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Captures could not be added."); }
    finally { setSaving(false); }
  };

  return <form onSubmit={submit} className="flex flex-col gap-4" aria-busy={saving}>
    <label className="relative">
      <span className="sr-only">Search captures</span>
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <Input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search captures" className="pl-9" />
    </label>
    <fieldset className="flex flex-col gap-0.5">
      <legend className="sr-only">Captures</legend>
      {options.map((capture) => (
        <label key={capture.id} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl px-3 py-2 text-sm hover:bg-muted">
          <Checkbox className="mt-0.5" checked={selected.includes(capture.id)} disabled={saving}
            onCheckedChange={(checked) => setSelected((current) => checked ? [...current, capture.id] : current.filter((id) => id !== capture.id))} />
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 font-medium [overflow-wrap:anywhere]">{captureDisplayTitle(capture)}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {capture.isProcessed ? "Processed" : "Inbox"} · {CAPTURE_KIND_LABELS[capture.kind]}{capture.url ? ` · ${captureHost(capture.url)}` : ""}
            </span>
          </span>
        </label>
      ))}
      {!options.length ? <p className="px-3 py-6 text-center text-sm text-muted-foreground">{deferredSearch.trim() ? "No matching captures." : "Everything you’ve captured is already in this project."}</p> : null}
    </fieldset>
    {hasInboxSelection ? <label className="flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm">
      <Checkbox checked={markProcessed} onCheckedChange={setMarkProcessed} disabled={saving} />
      Mark inbox captures as processed
    </label> : null}
    <FieldError>{error}</FieldError>
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
      <Button type="submit" disabled={saving || !selected.length}>
        {saving ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}
        {saving ? "Adding…" : selected.length ? `Add ${selected.length} ${selected.length === 1 ? "capture" : "captures"}` : "Add captures"}
      </Button>
    </div>
  </form>;
}
