import { describe, expect, it } from "vitest";
import { dueKnowledge, firstReview, isDue, nextDueAt, nextReview, scheduleForStatus } from "@/lib/review";
import type { Knowledge } from "@/types/knowledge";

const now = new Date(2026, 9, 1, 21, 30).getTime();
const day = (offset: number) => new Date(2026, 9, 1 + offset).getTime();
const note = (overrides: Partial<Knowledge>): Knowledge => ({ id: "n", title: "Note", summary: "", body: "", projectId: null, linkedProjectIds: [], sourceIds: [], locator: "", categoryId: null, status: "evergreen", reviewStep: 0, nextReviewAt: null, createdAt: 1, updatedAt: 1, ...overrides });

describe("spaced review", () => {
  it("schedules the first review for the start of tomorrow", () => {
    expect(firstReview(now)).toEqual({ reviewStep: 0, nextReviewAt: day(1) });
  });

  it("walks the 1, 3, 7, 21, 60 day intervals and stays at the last", () => {
    expect(nextReview(0, true, now)).toEqual({ reviewStep: 1, nextReviewAt: day(3) });
    expect(nextReview(2, true, now)).toEqual({ reviewStep: 3, nextReviewAt: day(21) });
    expect(nextReview(4, true, now)).toEqual({ reviewStep: 4, nextReviewAt: day(60) });
  });

  it("starts over at one day when a note needs another look", () => {
    expect(nextReview(3, false, now)).toEqual({ reviewStep: 0, nextReviewAt: day(1) });
  });

  it("only schedules evergreen notes and keeps an existing schedule", () => {
    expect(scheduleForStatus(note({ status: "draft" }), "evergreen", now)).toEqual({ reviewStep: 0, nextReviewAt: day(1) });
    expect(scheduleForStatus(note({ reviewStep: 2, nextReviewAt: day(5) }), "evergreen", now)).toEqual({ reviewStep: 2, nextReviewAt: day(5) });
    expect(scheduleForStatus(note({ reviewStep: 2, nextReviewAt: day(5) }), "draft", now)).toEqual({ reviewStep: 0, nextReviewAt: null });
  });

  it("lists due evergreen notes, longest waiting first", () => {
    const notes = [note({ id: "later", nextReviewAt: day(2) }), note({ id: "recent", nextReviewAt: day(0) }), note({ id: "oldest", nextReviewAt: day(-3) }), note({ id: "draft", status: "draft", nextReviewAt: day(-9) })];
    expect(dueKnowledge(notes, now).map((item) => item.id)).toEqual(["oldest", "recent"]);
    expect(isDue(notes[0], now)).toBe(false);
    expect(nextDueAt(notes)).toBe(day(-3));
  });
});
