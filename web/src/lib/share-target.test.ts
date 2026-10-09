import { describe, expect, it } from "vitest";
import { consumeSharedCapture, sharedCaptureText } from "@/lib/share-target";

describe("share target", () => {
  it("combines the shared fields without repeating them", () => {
    expect(sharedCaptureText("?title=Article&text=Read%20this%20https%3A%2F%2Fexample.com&url=https%3A%2F%2Fexample.com")).toBe("Article\nRead this https://example.com");
    expect(sharedCaptureText("?url=https%3A%2F%2Fexample.com")).toBe("https://example.com");
    expect(sharedCaptureText("?title=&text=")).toBeNull();
    expect(sharedCaptureText("")).toBeNull();
  });

  it("cleans the address and opens Capture", () => {
    history.replaceState(null, "", "/?text=Idea#timer");
    expect(consumeSharedCapture()).toBe("Idea");
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("#capture");
    expect(consumeSharedCapture()).toBeNull();
  });
});
