import type { Capture, CaptureInput, CaptureKind, LinkPreview } from "@/types/capture";

export const CAPTURE_URL_MAX_LENGTH = 2048;
export const CAPTURE_TITLE_MAX_LENGTH = 300;
export const CAPTURE_NOTE_MAX_LENGTH = 10000;
export const CAPTURE_KINDS: CaptureKind[] = ["note", "article", "social", "video", "drive"];
export const CAPTURE_KIND_LABELS: Record<CaptureKind, string> = {
  note: "Note",
  article: "Article",
  social: "Social post",
  video: "YouTube video",
  drive: "Google Drive",
};

const SOCIAL_HOSTS = [
  "x.com", "twitter.com", "instagram.com", "threads.net", "threads.com", "tiktok.com", "linkedin.com",
  "facebook.com", "fb.watch", "reddit.com", "bsky.app", "mastodon.social", "pinterest.com", "tumblr.com",
];
const VIDEO_HOSTS = ["youtube.com", "youtu.be", "youtube-nocookie.com"];
const DRIVE_HOSTS = ["drive.google.com", "docs.google.com"];
const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']+/i;

function matchesHost(host: string, domains: string[]) {
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

/** Returns a normalized http(s) URL, accepting bare domains like `example.com/post`. */
export function normalizeCaptureUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : /^[^/]+\.[a-z]{2,}(\/|$)/i.test(trimmed) ? `https://${trimmed}` : null;
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

export function captureHost(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

export function detectCaptureKind(url: string | null): CaptureKind {
  if (!url) return "note";
  const host = captureHost(url).toLowerCase();
  if (matchesHost(host, VIDEO_HOSTS)) return "video";
  if (matchesHost(host, DRIVE_HOSTS)) return "drive";
  if (matchesHost(host, SOCIAL_HOSTS)) return "social";
  return "article";
}

/** Turns free-form quick-capture text into a capture: a lone link becomes a link capture, anything else stays a note. */
export function parseCaptureText(text: string): CaptureInput {
  const trimmed = text.trim();
  const loneUrl = normalizeCaptureUrl(trimmed);
  if (loneUrl) return { kind: detectCaptureKind(loneUrl), url: loneUrl, title: "", note: "" };
  const embeddedUrl = trimmed.match(URL_PATTERN)?.[0] ?? null;
  const url = embeddedUrl ? normalizeCaptureUrl(embeddedUrl.replace(/[).,;!?]+$/, "")) : null;
  return { kind: detectCaptureKind(url), url, title: "", note: trimmed };
}

export function validateCaptureInput(input: CaptureInput) {
  if (input.url !== null && !normalizeCaptureUrl(input.url)) return "Enter a valid http or https link.";
  if (input.kind !== "note" && !input.url) return "Add a link for this capture type.";
  if (!input.url && !input.title.trim() && !input.note.trim()) return "Write something or paste a link to capture.";
  if ((input.url?.length ?? 0) > CAPTURE_URL_MAX_LENGTH) return `Links can be up to ${CAPTURE_URL_MAX_LENGTH} characters.`;
  if (input.title.trim().length > CAPTURE_TITLE_MAX_LENGTH) return `Titles can be up to ${CAPTURE_TITLE_MAX_LENGTH} characters.`;
  if (input.note.trim().length > CAPTURE_NOTE_MAX_LENGTH) return `Notes can be up to ${CAPTURE_NOTE_MAX_LENGTH} characters.`;
  return null;
}

/** The best human-readable label for a capture when it has no explicit title. */
export function captureDisplayTitle(capture: Pick<Capture, "title" | "url" | "note"> & { preview?: LinkPreview | null }) {
  if (capture.title.trim()) return capture.title.trim();
  if (capture.preview?.title) return capture.preview.title;
  const firstLine = capture.note.trim().split("\n")[0]?.trim();
  if (firstLine && !(capture.url && firstLine === capture.url)) return firstLine;
  if (capture.url) {
    const path = new URL(capture.url).pathname.replace(/\/$/, "");
    try { return `${captureHost(capture.url)}${decodeURIComponent(path)}`; } catch { return `${captureHost(capture.url)}${path}`; }
  }
  return "Untitled capture";
}

/** Case-insensitive search across a capture's own text and its link preview. */
export function captureMatches(capture: Capture, search: string) {
  const needle = search.trim().toLocaleLowerCase();
  if (!needle) return true;
  return [capture.title, capture.note, capture.url ?? "", capture.preview?.title ?? "", capture.preview?.description ?? "", capture.preview?.author ?? ""]
    .some((value) => value.toLocaleLowerCase().includes(needle));
}
