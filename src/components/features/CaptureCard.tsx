import { useState, type ReactNode } from "react";
import { CheckCheck, CirclePlay, ClipboardList, ExternalLink, File, FileText, Folder, HardDrive, MessagesSquare, MoreHorizontal, Newspaper, PenTool, Pencil, Play, Presentation, RefreshCw, Sheet, StickyNote, Trash2, Undo2, type LucideIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { CAPTURE_KIND_LABELS, captureDisplayTitle, captureHost } from "@/lib/capture";
import { driveApp, socialSource, youtubeEmbedUrl, youtubeThumbnail, youtubeVideoId, type DriveApp } from "@/lib/link-preview";
import { cn } from "@/lib/utils";
import type { Capture, CaptureKind } from "@/types/capture";

const captureKindIcons: Record<CaptureKind, LucideIcon> = { note: StickyNote, article: Newspaper, social: MessagesSquare, video: CirclePlay, drive: HardDrive };

const driveApps: Record<DriveApp, { label: string; Icon: LucideIcon; tone: string }> = {
  docs: { label: "Google Docs", Icon: FileText, tone: "bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300" },
  sheets: { label: "Google Sheets", Icon: Sheet, tone: "bg-green-50 text-green-700 dark:bg-green-950/60 dark:text-green-300" },
  slides: { label: "Google Slides", Icon: Presentation, tone: "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300" },
  forms: { label: "Google Forms", Icon: ClipboardList, tone: "bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300" },
  drawings: { label: "Google Drawings", Icon: PenTool, tone: "bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300" },
  folder: { label: "Drive folder", Icon: Folder, tone: "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300" },
  file: { label: "Drive file", Icon: File, tone: "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300" },
};
// YouTube answers unknown thumbnails with a 120px gray placeholder instead of an error.
const YOUTUBE_PLACEHOLDER_WIDTH = 120;
const dateFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

/** A remote preview image that disappears instead of showing a broken icon or a tiny placeholder. */
function RemoteImage({ src, className, fallback = null, minWidth = 0 }: { src: string; className?: string; fallback?: ReactNode; minWidth?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) return fallback;
  return <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className={className}
    onError={() => setFailed(true)} onLoad={(event) => { if (event.currentTarget.naturalWidth <= minWidth) setFailed(true); }} />;
}

function MediaLink({ url, children, className }: { url: string; children: ReactNode; className?: string }) {
  // The title link carries the accessible name; the media is a larger pointer target for the same link.
  return <a href={url} target="_blank" rel="noopener noreferrer" tabIndex={-1} aria-hidden="true" className={cn("block overflow-hidden bg-muted", className)}>{children}</a>;
}

function VideoMedia({ url, title, image }: { url: string; title: string; image?: string }) {
  const [playing, setPlaying] = useState(false);
  const videoId = youtubeVideoId(url);
  if (!videoId) return image ? <MediaLink url={url} className="aspect-video"><RemoteImage key={image} src={image} className="size-full object-cover" /></MediaLink> : null;
  if (playing) {
    return <div className="aspect-video bg-black">
      <iframe src={youtubeEmbedUrl(videoId)} title={title} className="size-full" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
    </div>;
  }
  return <button type="button" onClick={() => setPlaying(true)} aria-label={`Play ${title}`} className="group/play relative block aspect-video w-full overflow-hidden bg-neutral-900">
    <RemoteImage key={image ?? videoId} src={image ?? youtubeThumbnail(videoId)} minWidth={YOUTUBE_PLACEHOLDER_WIDTH} className="size-full object-cover transition-transform duration-300 group-hover/play:scale-[1.02]" />
    <span className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
    <span className="absolute left-1/2 top-1/2 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 text-white shadow-lg transition-colors group-hover/play:bg-red-600 group-focus-visible/play:bg-red-600">
      <Play aria-hidden="true" className="ml-0.5 size-6 fill-current" />
    </span>
  </button>;
}

function DriveMedia({ url }: { url: string }) {
  const { Icon, tone } = driveApps[driveApp(url)];
  return <MediaLink url={url} className={cn("flex h-28 items-center justify-center", tone)}>
    <Icon aria-hidden="true" className="size-12" strokeWidth={1.25} />
  </MediaLink>;
}

interface CapturePreviewProps {
  capture: Capture;
  /** True while the link metadata is still being looked up. */
  loading?: boolean;
}

/** The visual body of a capture: media banner, source, title, and text. Shared by the capture list and the quick-capture preview. */
export function CapturePreview({ capture, loading = false }: CapturePreviewProps) {
  const { kind, url, preview } = capture;
  const host = url ? captureHost(url) : null;
  const social = kind === "social" && url ? socialSource(url) : null;
  // Without a title, preview, or note, name the content instead of echoing its URL path.
  const untitled = !capture.title.trim() && !preview?.title && !capture.note.trim();
  const title = untitled && kind === "video" ? "YouTube video" : untitled && social ? `${social.platform} post` : captureDisplayTitle(capture);
  const firstNoteLine = capture.note.trim().split("\n")[0]?.trim();
  const note = (firstNoteLine === title ? capture.note.trim().split("\n").slice(1).join("\n") : capture.note).trim();
  const KindIcon = captureKindIcons[kind];
  const source = social ? social.platform : kind === "drive" && url ? driveApps[driveApp(url)].label : preview?.siteName ?? (kind === "video" ? "YouTube" : host);
  const showDescription = kind === "article" || kind === "social";
  const headline = social ? capture.title.trim() || preview?.author || social.handle || title : title;
  const titleClass = cn("font-semibold leading-snug [overflow-wrap:anywhere]", kind === "note" ? "text-base" : "line-clamp-2");

  let media: ReactNode = null;
  if (loading && !preview && kind !== "note" && kind !== "drive") media = <Skeleton className={cn("rounded-none", kind === "video" ? "aspect-video" : "aspect-[1.91/1]")} />;
  else if (kind === "video" && url) media = <VideoMedia url={url} title={title} image={preview?.image} />;
  else if (kind === "drive" && url) media = <DriveMedia url={url} />;
  else if (url && preview?.image) media = <MediaLink url={url} className={kind === "social" ? "aspect-[4/3]" : "aspect-[1.91/1]"}><RemoteImage key={preview.image} src={preview.image} className="size-full object-cover" /></MediaLink>;

  return <div className="flex min-w-0 flex-col">
    {media}
    <div className="flex min-w-0 flex-col gap-2 p-4">
      <p className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        {preview?.icon && kind !== "drive" ? <RemoteImage key={preview.icon} src={preview.icon} className="size-4 shrink-0 rounded-sm" fallback={<KindIcon aria-hidden="true" className="size-4 shrink-0" />} /> : <KindIcon aria-hidden="true" className="size-4 shrink-0" />}
        <span className="truncate font-medium text-foreground/80">{source ?? CAPTURE_KIND_LABELS[kind]}</span>
        {social?.handle && headline !== social.handle ? <span className="truncate">{social.handle}</span> : kind === "video" && preview?.author ? <span className="truncate">{preview.author}</span> : null}
      </p>
      {loading && !preview && url ? <div className="flex flex-col gap-2"><Skeleton className="h-4 w-4/5" /><Skeleton className="h-3 w-3/5" /></div> : <>
        {url ? <a href={url} target="_blank" rel="noopener noreferrer" className={cn(titleClass, "rounded-sm hover:underline")}>
          {headline}<span className="sr-only"> (opens in a new tab)</span>
        </a> : <p className={titleClass}>{headline}</p>}
        {showDescription && preview?.description ? <p className={cn("whitespace-pre-wrap [overflow-wrap:anywhere]", kind === "social" ? "line-clamp-6 text-sm leading-relaxed" : "line-clamp-3 text-sm text-muted-foreground")}>{preview.description}</p> : null}
      </>}
      {note ? kind === "note"
        ? <p className="line-clamp-[10] whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">{note}</p>
        : <p className="line-clamp-4 whitespace-pre-wrap border-l-2 border-primary/40 pl-3 text-sm text-muted-foreground [overflow-wrap:anywhere]"><span className="sr-only">Your note: </span>{note}</p> : null}
    </div>
  </div>;
}

interface CaptureCardProps {
  capture: Capture;
  readOnly: boolean;
  pending: boolean;
  loadingPreview: boolean;
  onToggleProcessed: () => void;
  onEdit: () => void;
  onRefreshPreview: () => void;
  onDelete: () => void;
}

export function CaptureCard({ capture, readOnly, pending, loadingPreview, onToggleProcessed, onEdit, onRefreshPreview, onDelete }: CaptureCardProps) {
  const title = captureDisplayTitle(capture);
  return <article aria-busy={pending || loadingPreview} aria-label={title} className="flex min-w-0 flex-col overflow-hidden rounded-[min(var(--radius-4xl),24px)] border bg-card text-card-foreground">
    <CapturePreview capture={capture} loading={loadingPreview} />
    <div className="mt-auto flex items-center gap-1 border-t py-1.5 pl-4 pr-2">
      <p className="mr-auto truncate text-xs text-muted-foreground">
        {CAPTURE_KIND_LABELS[capture.kind]} · <time dateTime={new Date(capture.createdAt).toISOString()}>{dateFormatter.format(capture.createdAt)}</time>
      </p>
      {capture.url ? <a href={capture.url} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "ghost", size: "icon-sm" })} aria-label={`Open ${title} in a new tab`} title="Open link"><ExternalLink /></a> : null}
      <Button type="button" variant="ghost" size="icon-sm" disabled={readOnly || pending} onClick={onToggleProcessed}
        aria-label={capture.isProcessed ? `Move ${title} back to inbox` : `Mark ${title} as processed`} title={capture.isProcessed ? "Move back to inbox" : "Mark as processed"}>
        {capture.isProcessed ? <Undo2 /> : <CheckCheck />}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label={`Actions for ${title}`} disabled={pending} />}><MoreHorizontal /></DropdownMenuTrigger>
        <DropdownMenuContent align="end"><DropdownMenuGroup>
          <DropdownMenuItem onClick={onEdit} disabled={readOnly}><Pencil />Edit</DropdownMenuItem>
          {capture.url ? <DropdownMenuItem onClick={onRefreshPreview} disabled={readOnly || loadingPreview}><RefreshCw />Refresh preview</DropdownMenuItem> : null}
          <DropdownMenuItem variant="destructive" onClick={onDelete} disabled={readOnly}><Trash2 />Delete</DropdownMenuItem>
        </DropdownMenuGroup></DropdownMenuContent>
      </DropdownMenu>
    </div>
  </article>;
}
