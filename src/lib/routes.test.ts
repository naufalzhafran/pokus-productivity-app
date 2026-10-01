import { describe, expect, it } from "vitest";
import { parseRoute, projectHash, routeHash } from "@/lib/routes";

describe("hash routes", () => {
  it("parses pages, project details, and legacy task links", () => {
    expect(parseRoute("")).toEqual({ page: "timer", projectId: null });
    expect(parseRoute("#capture")).toEqual({ page: "capture", projectId: null });
    expect(parseRoute("#projects")).toEqual({ page: "projects", projectId: null });
    expect(parseRoute("#projects/abc123")).toEqual({ page: "projects", projectId: "abc123" });
    expect(parseRoute("#tasks")).toEqual({ page: "projects", projectId: null });
    expect(parseRoute("#unknown")).toEqual({ page: "timer", projectId: null });
  });

  it("builds hashes that round-trip", () => {
    expect(routeHash({ page: "profile", projectId: null })).toBe("#profile");
    expect(projectHash("abc123")).toBe("#projects/abc123");
    expect(parseRoute(projectHash("a/b"))).toEqual({ page: "projects", projectId: "a/b" });
  });
});
