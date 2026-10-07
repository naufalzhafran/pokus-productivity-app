import { describe, expect, it } from "vitest";
import { captureStage, emptyKnowledgeInput, htmlToPlainText, knowledgeBySource, knowledgeMatches, normalizeKnowledgeInput, validateKnowledgeInput } from "@/lib/knowledge";
import type { Knowledge } from "@/types/knowledge";

const note = (overrides: Partial<Knowledge>): Knowledge => ({ id: "n", title: "Habit loop", summary: "Cue, craving, response, reward.", body: "<p>Make it <strong>obvious</strong>.</p>", projectId: null, linkedProjectIds: [], sourceIds: [], locator: "Ch. 3", categoryId: null, status: "draft", reviewStep: 0, nextReviewAt: null, createdAt: 1, updatedAt: 1, ...overrides });

describe("knowledge", () => {
  it("validates titles and lengths", () => {
    expect(validateKnowledgeInput(emptyKnowledgeInput())).toMatch(/title/);
    expect(validateKnowledgeInput(emptyKnowledgeInput({ title: "x", locator: "y".repeat(121) }))).toMatch(/Locations/);
    expect(validateKnowledgeInput(emptyKnowledgeInput({ title: "Two-minute rule" }))).toBeNull();
  });

  it("trims text, de-duplicates relations, and never references its own origin project", () => {
    expect(normalizeKnowledgeInput(emptyKnowledgeInput({ title: "  Rule ", projectId: "p1", linkedProjectIds: ["p1", "p2", "p2"], sourceIds: ["c1", "c1"] })))
      .toMatchObject({ title: "Rule", linkedProjectIds: ["p2"], sourceIds: ["c1"] });
    expect(() => normalizeKnowledgeInput(emptyKnowledgeInput())).toThrow(/title/);
  });

  it("searches the title, summary, location, and note text", () => {
    expect(htmlToPlainText("<p>Make it <strong>obvious</strong>.</p><ul><li>One</li></ul>")).toBe("Make it obvious. One");
    expect(knowledgeMatches(note({}), "OBVIOUS")).toBe(true);
    expect(knowledgeMatches(note({}), "ch. 3")).toBe(true);
    expect(knowledgeMatches(note({}), "missing")).toBe(false);
  });

  it("groups notes by source, so one book can hold many notes", () => {
    const map = knowledgeBySource([note({ id: "a", sourceIds: ["book"] }), note({ id: "b", sourceIds: ["book", "video"] })]);
    expect(map.get("book")?.map((item) => item.id)).toEqual(["a", "b"]);
    expect(map.get("video")?.map((item) => item.id)).toEqual(["b"]);
  });

  it("derives the capture stage from projects, knowledge, and the processed flag", () => {
    const filed = new Set(["filed"]);
    const sourced = new Set(["sourced"]);
    expect(captureStage({ id: "new", isProcessed: false }, filed, sourced)).toBe("inbox");
    expect(captureStage({ id: "filed", isProcessed: false }, filed, sourced)).toBe("in_progress");
    expect(captureStage({ id: "sourced", isProcessed: false }, filed, sourced)).toBe("in_progress");
    expect(captureStage({ id: "sourced", isProcessed: true }, filed, sourced)).toBe("processed");
  });
});
