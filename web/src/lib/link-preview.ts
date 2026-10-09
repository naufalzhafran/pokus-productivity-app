import { pb } from "@/lib/pocketbase";
import type { LinkPreview } from "@/types/capture";

export type DriveApp = "docs" | "sheets" | "slides" | "forms" | "drawings" | "folder" | "file";
export interface SocialSource { platform: string; handle: string | null }

const TEXT_LIMITS: Record<Exclude<keyof LinkPreview, "image" | "icon">, number> = { title: 300, description: 600, siteName: 120, author: 120 };
const SOCIAL_PLATFORMS: [string, string][] = [
  ["x.com", "X"], ["twitter.com", "X"], ["instagram.com", "Instagram"], ["threads.net", "Threads"], ["threads.com", "Threads"],
  ["tiktok.com", "TikTok"], ["linkedin.com", "LinkedIn"], ["facebook.com", "Facebook"], ["fb.watch", "Facebook"], ["reddit.com", "Reddit"],
  ["bsky.app", "Bluesky"], ["mastodon.social", "Mastodon"], ["pinterest.com", "Pinterest"], ["tumblr.com", "Tumblr"],
];
const RESERVED_SOCIAL_PATHS = new Set(["p", "reel", "reels", "tv", "stories", "explore", "i", "home", "search", "watch", "share", "posts", "feed", "pin"]);

function parseUrl(url: string) {
  try { return new URL(url); } catch { return null; }
}

function hostMatches(host: string, domain: string) {
  return host === domain || host.endsWith(`.${domain}`);
}

/** Preview images load straight from third-party hosts, so only HTTPS URLs are kept (no mixed content). */
function imageUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 2048) return undefined;
  const url = parseUrl(value.trim());
  return url?.protocol === "https:" ? url.href : undefined;
}

/** Keeps only well-formed preview fields; stored previews originate from untrusted third-party pages. */
export function sanitizeLinkPreview(value: unknown): LinkPreview | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const preview: LinkPreview = {};
  for (const [key, limit] of Object.entries(TEXT_LIMITS) as [keyof typeof TEXT_LIMITS, number][]) {
    const text = typeof source[key] === "string" ? source[key].replace(/\s+/g, " ").trim().slice(0, limit) : "";
    if (text) preview[key] = text;
  }
  const image = imageUrl(source.image);
  const icon = imageUrl(source.icon);
  if (image) preview.image = image;
  if (icon) preview.icon = icon;
  return Object.keys(preview).length ? preview : null;
}

/** Asks the Pokus PocketBase hook for public page metadata. Resolves to null when no preview is available. */
export async function fetchLinkPreview(url: string) {
  try {
    return sanitizeLinkPreview(await pb.send("/api/pokus/link-preview", { query: { url }, requestKey: null }));
  } catch {
    return null;
  }
}

export function youtubeVideoId(url: string) {
  const parsed = parseUrl(url);
  if (!parsed) return null;
  const host = parsed.hostname.replace(/^www\./, "");
  const candidate = hostMatches(host, "youtu.be")
    ? parsed.pathname.split("/")[1]
    : hostMatches(host, "youtube.com") || hostMatches(host, "youtube-nocookie.com")
      ? parsed.searchParams.get("v") ?? parsed.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/)?.[1]
      : null;
  return candidate && /^[\w-]{11}$/.test(candidate) ? candidate : null;
}

export function youtubeThumbnail(videoId: string) {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export function youtubeEmbedUrl(videoId: string) {
  return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`;
}

export function driveApp(url: string): DriveApp {
  const parsed = parseUrl(url);
  const path = parsed?.pathname ?? "";
  if (parsed?.hostname === "docs.google.com") {
    if (path.startsWith("/spreadsheets")) return "sheets";
    if (path.startsWith("/presentation")) return "slides";
    if (path.startsWith("/forms")) return "forms";
    if (path.startsWith("/drawings")) return "drawings";
    return "docs";
  }
  return /\/folders\//.test(path) ? "folder" : "file";
}

export function socialSource(url: string): SocialSource {
  const parsed = parseUrl(url);
  const host = parsed?.hostname.replace(/^www\./, "").toLowerCase() ?? "";
  const platform = SOCIAL_PLATFORMS.find(([domain]) => hostMatches(host, domain))?.[1] ?? host;
  const segments = (parsed?.pathname ?? "").split("/").filter(Boolean).map((segment) => decodeURIComponent(segment));
  const [first, second] = segments;
  let handle: string | null = null;
  if (platform === "Reddit" && (first === "r" || first === "u" || first === "user") && second) handle = `${first === "r" ? "r" : "u"}/${second}`;
  else if (platform === "Bluesky" && first === "profile" && second) handle = `@${second}`;
  else if (platform === "LinkedIn" && (first === "in" || first === "company") && second) handle = second;
  else if (first?.startsWith("@")) handle = first;
  else if (first && !RESERVED_SOCIAL_PATHS.has(first.toLowerCase()) && /^[\w.]{1,40}$/.test(first) && ["X", "Instagram", "Threads", "TikTok", "Tumblr", "Pinterest"].includes(platform)) handle = `@${first}`;
  return { platform, handle };
}
