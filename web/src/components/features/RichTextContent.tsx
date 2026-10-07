import { useMemo } from "react";
import DOMPurify from "dompurify";

export function RichTextContent({ html }: { html: string }) {
  const cleanHtml = useMemo(
    () => DOMPurify.sanitize(html, { ADD_ATTR: ["target", "rel"] }),
    [html],
  );

  return (
    <div
      className="rich-text-content text-sm text-muted-foreground"
      dangerouslySetInnerHTML={{ __html: cleanHtml }}
    />
  );
}
