import { beforeEach, describe, expect, it } from "vitest";
import { loadWorkspacePreferences } from "@/hooks/useWorkspacePreferences";

describe("workspace preference restoration", () => {
  beforeEach(() => localStorage.clear());

  it("restores valid user-scoped preferences and excludes search text", () => {
    localStorage.setItem(
      "pokus-workspace-v1:user-a",
      JSON.stringify({
        scope: "project:abc",
        projectFilter: "due",
        status: "completed",
        sort: "alphabetical",
        lastDuration: 45,
        search: "transient",
      }),
    );
    const restored = loadWorkspacePreferences("user-a");
    expect(restored).toEqual({
      projectFilter: "due",
      status: "completed",
      sort: "alphabetical",
      priority: "all",
      categoryId: null,
      lastDuration: 45,
    });
    expect(loadWorkspacePreferences("user-b").projectFilter).toBe("all");
  });

  it("falls back safely for corrupt values and removed options", () => {
    localStorage.setItem("pokus-workspace-v1:user-a", "{");
    expect(loadWorkspacePreferences("user-a").status).toBe("open");
    localStorage.setItem("pokus-workspace-v1:user-a", JSON.stringify({ sort: "due", projectFilter: "today" }));
    expect(loadWorkspacePreferences("user-a")).toMatchObject({ sort: "smart", projectFilter: "all" });
  });
});
