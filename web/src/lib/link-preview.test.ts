import { describe, expect, it } from "vitest";
import { driveApp, sanitizeLinkPreview, socialSource, youtubeVideoId } from "@/lib/link-preview";

describe("link previews", () => {
  it("extracts YouTube video ids from common link shapes", () => {
    expect(youtubeVideoId("https://youtu.be/dQw4w9WgXcQ?t=10")).toBe("dQw4w9WgXcQ");
    expect(youtubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=x")).toBe("dQw4w9WgXcQ");
    expect(youtubeVideoId("https://m.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeVideoId("https://www.youtube.com/@channel")).toBeNull();
  });

  it("recognizes Google Drive apps", () => {
    expect(driveApp("https://docs.google.com/spreadsheets/d/1/edit")).toBe("sheets");
    expect(driveApp("https://docs.google.com/presentation/d/1/edit")).toBe("slides");
    expect(driveApp("https://docs.google.com/document/d/1/edit")).toBe("docs");
    expect(driveApp("https://drive.google.com/drive/folders/abc")).toBe("folder");
    expect(driveApp("https://drive.google.com/file/d/abc/view")).toBe("file");
  });

  it("names the social platform and author handle", () => {
    expect(socialSource("https://x.com/naval/status/1")).toEqual({ platform: "X", handle: "@naval" });
    expect(socialSource("https://www.instagram.com/p/abc/")).toEqual({ platform: "Instagram", handle: null });
    expect(socialSource("https://www.tiktok.com/@creator/video/1")).toEqual({ platform: "TikTok", handle: "@creator" });
    expect(socialSource("https://www.reddit.com/r/productivity/comments/1")).toEqual({ platform: "Reddit", handle: "r/productivity" });
    expect(socialSource("https://bsky.app/profile/someone.bsky.social/post/1")).toEqual({ platform: "Bluesky", handle: "@someone.bsky.social" });
  });

  it("drops unsafe or malformed preview fields", () => {
    expect(sanitizeLinkPreview({ title: "  A   title ", image: "javascript:alert(1)", icon: "https://example.com/i.png", extra: 1 }))
      .toEqual({ title: "A title", icon: "https://example.com/i.png" });
    expect(sanitizeLinkPreview({ title: "" })).toBeNull();
    expect(sanitizeLinkPreview("nope")).toBeNull();
  });
});
