/** The PWA share target opens `/?title=…&text=…&url=…`; this turns those fields into Quick capture text. */
export function sharedCaptureText(search: string) {
  const params = new URLSearchParams(search);
  const parts: string[] = [];
  for (const key of ["title", "text", "url"]) {
    const value = params.get(key)?.trim();
    // Apps often repeat the link inside the text, or the title inside the text.
    if (value && !parts.some((part) => part.includes(value))) parts.push(value);
  }
  return parts.length ? parts.join("\n") : null;
}

/** Reads a share once and removes it from the address bar, landing on Capture. */
export function consumeSharedCapture() {
  const text = sharedCaptureText(window.location.search);
  if (text !== null) history.replaceState(null, "", `${window.location.pathname}#capture`);
  return text;
}
