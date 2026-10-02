import { describe, expect, it } from "vitest";
import { knowledgeHash, KNOWLEDGE_REVIEW_ID, parseRoute, projectHash, routeHash } from "@/lib/routes";

describe("hash routes", () => {
  it("parses pages, project details, and legacy task links", () => {
    expect(parseRoute("")).toEqual({ page: "timer", projectId: null });
    expect(parseRoute("#capture")).toEqual({ page: "capture", projectId: null });
    expect(parseRoute("#habits")).toEqual({ page: "habits", projectId: null });
    expect(parseRoute("#projects")).toEqual({ page: "projects", projectId: null });
    expect(parseRoute("#projects/abc123")).toEqual({ page: "projects", projectId: "abc123" });
    expect(parseRoute("#tasks")).toEqual({ page: "projects", projectId: null });
    expect(parseRoute("#unknown")).toEqual({ page: "timer", projectId: null });
    expect(parseRoute("#knowledge")).toEqual({ page: "knowledge", projectId: null, knowledgeId: null });
    expect(parseRoute("#knowledge/review")).toEqual({ page: "knowledge", projectId: null, knowledgeId: KNOWLEDGE_REVIEW_ID });
  });

  it("builds hashes that round-trip", () => {
    expect(routeHash({ page: "profile", projectId: null })).toBe("#profile");
    expect(projectHash("abc123")).toBe("#projects/abc123");
    expect(parseRoute(projectHash("a/b"))).toEqual({ page: "projects", projectId: "a/b" });
    expect(knowledgeHash("abc123")).toBe("#knowledge/abc123");
    expect(parseRoute(knowledgeHash("abc123"))).toEqual({ page: "knowledge", projectId: null, knowledgeId: "abc123" });
  });
});
