import { useState, type ReactNode } from "react";
import { BookOpen, CheckCheck, CirclePlay, ClipboardList, ExternalLink, File, FileText, Folder, FolderInput, FolderMinus, FolderPlus, HardDrive, Lightbulb, MessagesSquare, MoreHorizontal, Newspaper, PenTool, Pencil, Play, Presentation, RefreshCw, Sheet, StickyNote, Trash2, Undo2, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { CAPTURE_KIND_LABELS, captureDisplayTitle, captureHost } from "@/lib/capture";
import { driveApp, socialSource, youtubeEmbedUrl, youtubeThumbnail, youtubeVideoId, type DriveApp } from "@/lib/link-preview";
import { projectHash } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { Capture, CaptureKind } from "@/types/capture";
import type { Project } from "@/types/task";

const captureKindIcons: Record<CaptureKind, LucideIcon> = { note: StickyNote, article: Newspaper, social: MessagesSquare, video: CirclePlay, drive: HardDrive, book: BookOpen };

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
        {social?.handle && headline !== social.handle ? <span className="truncate">{social.handle}</span> : kind === "video" && preview?.author ? <span className="truncate">{preview.author}</span> : kind === "book" && capture.author ? <span className="truncate">{capture.author}</span> : null}
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
  /** Projects that contain this capture, shown as links. */
  projects?: Project[];
  onOrganize?: () => void;
  /** Set when the card is shown inside a project. */
  onRemoveFromProject?: () => void;
  /** How many knowledge notes were distilled from this capture. */
  knowledgeCount?: number;
  onShowKnowledge?: () => void;
  onDistill?: () => void;
  onStartProject?: () => void;
  onReminder?: () => void;
}

export function CaptureCard({ capture, readOnly: offline, pending, loadingPreview, onToggleProcessed, onEdit, onRefreshPreview, onDelete, projects = [], onOrganize, onRemoveFromProject, knowledgeCount = 0, onShowKnowledge, onDistill, onStartProject, onReminder }: CaptureCardProps) {
  const title = captureDisplayTitle(capture);
  // A capture that hasn't synced exists only on this device: it can be deleted, not edited.
  const readOnly = offline || Boolean(capture.syncState);
  return <article aria-busy={pending || loadingPreview} aria-label={title} className="flex min-w-0 flex-col overflow-hidden rounded-[min(var(--radius-4xl),24px)] border bg-card text-card-foreground">
    <CapturePreview capture={capture} loading={loadingPreview} />
    {capture.reminderAt && onReminder ? <Button variant="ghost" className="mx-3 mb-3 h-auto min-h-11 justify-start whitespace-normal text-left" onClick={onReminder}>{capture.reminderDone ? "Reminder completed" : "Reminder"} · {new Date(capture.reminderAt).toLocaleString()}</Button> : null}
    {projects.length || knowledgeCount ? <ul aria-label="Connections" className="flex flex-wrap gap-1.5 px-4 pb-3">
      {projects.map((project) => <li key={project.id} className="min-w-0">
        <a href={projectHash(project.id)} className="flex max-w-full items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
          <Folder aria-hidden="true" className="size-3 shrink-0" /><span className="truncate">{project.title}</span>
        </a>
      </li>)}
      {knowledgeCount && onShowKnowledge ? <li>
        <button type="button" onClick={onShowKnowledge} aria-label={`${knowledgeCount} ${knowledgeCount === 1 ? "note" : "notes"} distilled from ${title}`} className="group/chip -my-3 flex items-center py-3">
          {/* The button keeps a full touch target; the pill inside matches the project chips. */}
          <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary group-hover/chip:bg-primary/15">
            <Lightbulb aria-hidden="true" className="size-3 shrink-0" />{knowledgeCount} {knowledgeCount === 1 ? "note" : "notes"}
          </span>
        </button>
      </li> : null}
    </ul> : null}
    <div className="mt-auto flex items-center gap-1 border-t py-1.5 pl-4 pr-2">
      <p className="mr-auto truncate text-xs text-muted-foreground">
        {CAPTURE_KIND_LABELS[capture.kind]} · <time dateTime={new Date(capture.createdAt).toISOString()}>{dateFormatter.format(capture.createdAt)}</time>
      </p>
      {capture.syncState ? <Badge variant={capture.syncState === "failed" ? "destructive" : "outline"} className="shrink-0">{capture.syncState === "failed" ? "Couldn’t sync" : "Waiting to sync"}</Badge> : null}
      {capture.url ? <a href={capture.url} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "ghost", size: "icon-sm" })} aria-label={`Open ${title} in a new tab`} title="Open link"><ExternalLink /></a> : null}
      <Button type="button" variant="ghost" size="icon-sm" disabled={readOnly || pending} onClick={onToggleProcessed}
        aria-label={capture.isProcessed ? `Move ${title} back to inbox` : `Mark ${title} as processed`} title={capture.isProcessed ? "Move back to inbox" : "Mark as processed"}>
        {capture.isProcessed ? <Undo2 /> : <CheckCheck />}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label={`Actions for ${title}`} disabled={pending} />}><MoreHorizontal /></DropdownMenuTrigger>
        <DropdownMenuContent align="end"><DropdownMenuGroup>
          {onReminder ? <DropdownMenuItem onClick={onReminder} disabled={readOnly}>{capture.reminderAt ? "Edit reminder…" : "Add reminder…"}</DropdownMenuItem> : null}
          {onDistill ? <DropdownMenuItem onClick={onDistill} disabled={readOnly}><Lightbulb />Distill into knowledge…</DropdownMenuItem> : null}
          {onOrganize ? <DropdownMenuItem onClick={onOrganize} disabled={readOnly}><FolderInput />Add to projects…</DropdownMenuItem> : null}
          {onStartProject ? <DropdownMenuItem onClick={onStartProject} disabled={readOnly}><FolderPlus />{capture.kind === "book" ? "Start reading project" : "Start project"}</DropdownMenuItem> : null}
          {onRemoveFromProject ? <DropdownMenuItem onClick={onRemoveFromProject} disabled={readOnly}><FolderMinus />Remove from project</DropdownMenuItem> : null}
          <DropdownMenuItem onClick={onEdit} disabled={readOnly}><Pencil />Edit</DropdownMenuItem>
          {capture.url ? <DropdownMenuItem onClick={onRefreshPreview} disabled={readOnly || loadingPreview}><RefreshCw />Refresh preview</DropdownMenuItem> : null}
          <DropdownMenuItem variant="destructive" onClick={onDelete} disabled={capture.syncState ? false : offline}><Trash2 />Delete</DropdownMenuItem>
        </DropdownMenuGroup></DropdownMenuContent>
      </DropdownMenu>
    </div>
  </article>;
}
