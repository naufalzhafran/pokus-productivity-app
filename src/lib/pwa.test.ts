import { describe, expect, it } from "vitest";
import { canApplyUpdate } from "@/lib/pwa";
describe("safe app updates", () => {
  it("waits for a session, open editor, or local save to finish", () => {
    expect(canApplyUpdate(true, false, false)).toBe(false);
    expect(canApplyUpdate(false, true, false)).toBe(false);
    expect(canApplyUpdate(false, false, true)).toBe(false);
    expect(canApplyUpdate(false, false, false)).toBe(true);
  });
});
