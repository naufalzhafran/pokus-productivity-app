import { beforeEach, describe, expect, it } from "vitest";
import { loadWorkspacePreferences } from "@/hooks/useWorkspacePreferences";

describe("workspace preference restoration", () => {
  beforeEach(() => localStorage.clear());

  it("restores valid user-scoped preferences and excludes search text", () => {
    localStorage.setItem(
      "pokus-workspace-v1:user-a",
      JSON.stringify({
        scope: "project:abc",
        status: "completed",
        sort: "alphabetical",
        lastDuration: 45,
        search: "transient",
      }),
    );
    const restored = loadWorkspacePreferences("user-a");
    expect(restored).toEqual({
      scope: "project:abc",
      status: "completed",
      sort: "alphabetical",
      lastDuration: 45,
    });
    expect(loadWorkspacePreferences("user-b").scope).toBe("all");
  });

  it("falls back safely for corrupt values", () => {
    localStorage.setItem("pokus-workspace-v1:user-a", "{");
    expect(loadWorkspacePreferences("user-a").status).toBe("open");
  });
});
