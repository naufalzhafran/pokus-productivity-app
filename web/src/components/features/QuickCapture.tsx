import { useEffect, useId, useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { CapturePreview } from "@/components/features/CaptureCard";
import { CAPTURE_NOTE_MAX_LENGTH, parseCaptureText, validateCaptureInput } from "@/lib/capture";
import { fetchLinkPreview } from "@/lib/link-preview";
import type { Capture, CaptureInput, LinkPreview } from "@/types/capture";

const PREVIEW_DELAY_MS = 400;

interface QuickCaptureProps {
  readOnly: boolean;
  onCapture: (input: CaptureInput) => Promise<unknown>;
  title?: string;
  description?: string;
  successMessage?: string;
  /** Look up link previews while typing; off while offline, so the preview is fetched after the capture syncs. */
  previews?: boolean;
  /** Prefilled text, such as something shared to Pokus. */
  initialText?: string;
}

export function QuickCapture({
  readOnly,
  onCapture,
  title = "Quick capture",
  description = "Save it now, sort it later. Paste a post, article, YouTube video, or Google Drive link, or just write a thought.",
  successMessage = "Captured to your inbox.",
  previews = !readOnly,
  initialText = "",
}: QuickCaptureProps) {
  const id = useId();
  const [text, setText] = useState(initialText);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lookup, setLookup] = useState<{ url: string; preview: LinkPreview | null } | null>(null);
  const parsed = useMemo(() => text.trim() ? parseCaptureText(text) : null, [text]);
  const url = parsed?.url ?? null;
  const preview = lookup && lookup.url === url ? lookup.preview : undefined;

  useEffect(() => {
    if (!url || !previews) return;
    let current = true;
    const timer = window.setTimeout(() => void fetchLinkPreview(url).then((value) => { if (current) setLookup({ url, preview: value }); }), PREVIEW_DELAY_MS);
    return () => { current = false; window.clearTimeout(timer); };
  }, [previews, url]);

  const draft: Capture | null = parsed && url ? { id: "draft", ...parsed, preview: preview ?? null, isProcessed: false, createdAt: 0, updatedAt: 0 } : null;

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!parsed) return;
    const invalid = validateCaptureInput(parsed);
    if (invalid) { setError(invalid); return; }
    setIsSaving(true); setError(null);
    try {
      const saved = await onCapture({ ...parsed, preview });
      setText("");
      toast.success(saved && typeof saved === "object" && "syncState" in saved && saved.syncState ? "Saved on this device. It syncs when you’re back online." : successMessage);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "This could not be captured. Try again.");
    } finally {
      setIsSaving(false);
    }
  };
  const submitOnShortcut = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void submit(); }
  };

  return <Card size="sm">
    <CardHeader>
      <CardTitle className="text-lg">{title}</CardTitle>
      <CardDescription>{description}</CardDescription>
    </CardHeader>
    <CardContent>
      <form onSubmit={submit} className="flex flex-col gap-3" aria-busy={isSaving}>
        <label htmlFor={`${id}-text`} className="sr-only">Link or thought to capture</label>
        <Textarea id={`${id}-text`} value={text} maxLength={CAPTURE_NOTE_MAX_LENGTH} disabled={readOnly || isSaving} onKeyDown={submitOnShortcut}
          onChange={(event) => { setText(event.target.value); setError(null); }} placeholder="Paste a link or jot down a thought…" className="min-h-24"
          aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} />
        <FieldError id={`${id}-error`}>{error}</FieldError>
        {draft ? <section aria-label="Link preview" className="overflow-hidden rounded-2xl border bg-background">
          <CapturePreview capture={draft} loading={preview === undefined && previews} />
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
