import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CAPTURE_KIND_LABELS, CAPTURE_KINDS, CAPTURE_NOTE_MAX_LENGTH, CAPTURE_TITLE_MAX_LENGTH, CAPTURE_URL_MAX_LENGTH, detectCaptureKind, normalizeCaptureUrl, validateCaptureInput } from "@/lib/capture";
import type { Capture, CaptureInput, CaptureKind } from "@/types/capture";

interface CaptureEditorProps {
  capture: Capture;
  onCancel: () => void;
  onSave: (input: CaptureInput) => Promise<unknown>;
}

export function CaptureEditor({ capture, onCancel, onSave }: CaptureEditorProps) {
  const [kind, setKind] = useState<CaptureKind>(capture.kind);
  const [url, setUrl] = useState(capture.url ?? "");
  const [title, setTitle] = useState(capture.title);
  const [note, setNote] = useState(capture.note);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedUrl = url.trim() ? normalizeCaptureUrl(url) ?? url.trim() : null;
    const input: CaptureInput = { kind, url: normalizedUrl, title, note };
    const invalid = validateCaptureInput(input);
    if (invalid) { setError(invalid); return; }
    setIsSaving(true); setError(null);
    try { await onSave(input); } catch (caught) { setError(caught instanceof Error ? caught.message : "This capture could not be saved."); } finally { setIsSaving(false); }
  };

  return <form onSubmit={submit} className="flex flex-col gap-5" aria-busy={isSaving}>
    <FieldGroup>
      <Field data-invalid={Boolean(error)}>
        <FieldLabel htmlFor="capture-editor-url">Link</FieldLabel>
        <Input id="capture-editor-url" type="url" inputMode="url" value={url} maxLength={CAPTURE_URL_MAX_LENGTH} disabled={isSaving} placeholder="https://"
          onChange={(event) => { setUrl(event.target.value); const next = normalizeCaptureUrl(event.target.value); if (next || !event.target.value.trim()) setKind(detectCaptureKind(next)); }}
          aria-invalid={Boolean(error)} aria-describedby={error ? "capture-editor-error" : undefined} />
        <FieldError id="capture-editor-error">{error}</FieldError>
      </Field>
      <Field>
        <FieldLabel>Type</FieldLabel>
        <Select disabled={isSaving} items={CAPTURE_KIND_LABELS} value={kind} onValueChange={(value) => setKind(value as CaptureKind)}>
          <SelectTrigger aria-label="Capture type"><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup>{CAPTURE_KINDS.map((value) => <SelectItem key={value} value={value}>{CAPTURE_KIND_LABELS[value]}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor="capture-editor-title">Title</FieldLabel>
        <Input id="capture-editor-title" value={title} maxLength={CAPTURE_TITLE_MAX_LENGTH} disabled={isSaving} placeholder="Optional" onChange={(event) => setTitle(event.target.value)} />
      </Field>
      <Field>
        <FieldLabel htmlFor="capture-editor-note">Note</FieldLabel>
        <Textarea id="capture-editor-note" value={note} maxLength={CAPTURE_NOTE_MAX_LENGTH} disabled={isSaving} placeholder="Why does this matter to you?" className="min-h-28" onChange={(event) => setNote(event.target.value)} />
      </Field>
    </FieldGroup>
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>Cancel</Button>
      <Button type="submit" disabled={isSaving}>{isSaving ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}{isSaving ? "Saving…" : "Save changes"}</Button>
    </div>
  </form>;
}
