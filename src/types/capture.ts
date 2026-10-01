export type CaptureKind = "note" | "article" | "social" | "video" | "drive" | "book";

/** Public page metadata cached on a link capture. */
export interface LinkPreview {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  icon?: string;
  author?: string;
}

export interface Capture {
  id: string;
  kind: CaptureKind;
  url: string | null;
  title: string;
  note: string;
  /** Book author; empty for other kinds. */
  author?: string;
  preview: LinkPreview | null;
  isProcessed: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CaptureInput {
  kind: CaptureKind;
  url: string | null;
  title: string;
  note: string;
  author?: string;
  preview?: LinkPreview | null;
}
