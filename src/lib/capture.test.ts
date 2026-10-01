import { describe, expect, it } from "vitest";
import { captureDisplayTitle, detectCaptureKind, normalizeCaptureUrl, parseCaptureText, validateCaptureInput } from "@/lib/capture";

describe("capture parsing", () => {
  it("detects the capture kind from the link host", () => {
    expect(detectCaptureKind("https://youtu.be/dQw4w9WgXcQ")).toBe("video");
    expect(detectCaptureKind("https://m.youtube.com/watch?v=abc")).toBe("video");
    expect(detectCaptureKind("https://docs.google.com/document/d/1/edit")).toBe("drive");
    expect(detectCaptureKind("https://x.com/user/status/1")).toBe("social");
    expect(detectCaptureKind("https://www.instagram.com/p/abc/")).toBe("social");
    expect(detectCaptureKind("https://example.com/essay")).toBe("article");
    expect(detectCaptureKind("https://notyoutube.com/watch")).toBe("article");
    expect(detectCaptureKind(null)).toBe("note");
  });

  it("normalizes bare domains and rejects non-web links", () => {
    expect(normalizeCaptureUrl("example.com/post")).toBe("https://example.com/post");
    expect(normalizeCaptureUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeCaptureUrl("just a thought")).toBeNull();
  });

  it("turns a lone link into a link capture and keeps other text as a note", () => {
    expect(parseCaptureText(" https://youtu.be/abc ")).toEqual({ kind: "video", url: "https://youtu.be/abc", title: "", note: "" });
    expect(parseCaptureText("Read later: https://example.com/a.")).toEqual({ kind: "article", url: "https://example.com/a", title: "", note: "Read later: https://example.com/a." });
    expect(parseCaptureText("Idea for the newsletter")).toEqual({ kind: "note", url: null, title: "", note: "Idea for the newsletter" });
  });

  it("validates captures and picks a readable title", () => {
    expect(validateCaptureInput({ kind: "note", url: null, title: "", note: " " })).toMatch(/Write something/);
    expect(validateCaptureInput({ kind: "video", url: null, title: "", note: "x" })).toMatch(/Add a link/);
    expect(validateCaptureInput({ kind: "article", url: "https://example.com", title: "", note: "" })).toBeNull();
    expect(captureDisplayTitle({ title: "", url: "https://www.example.com/blog/post/", note: "" })).toBe("example.com/blog/post");
    expect(captureDisplayTitle({ title: "", url: null, note: "First line\nSecond" })).toBe("First line");
  });
});
