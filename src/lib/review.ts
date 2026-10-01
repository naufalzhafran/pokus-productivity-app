import type { Knowledge } from "@/types/knowledge";

/** Days until the next review after each successful recall. */
export const REVIEW_INTERVAL_DAYS = [1, 3, 7, 21, 60] as const;

/** Midnight in local time, `days` days after `now`, so a note is due for that whole day. */
function localDayStart(now: number, days: number) {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.getTime();
}

export interface ReviewSchedule {
  reviewStep: number;
  nextReviewAt: number | null;
}

export function firstReview(now = Date.now()): ReviewSchedule {
  return { reviewStep: 0, nextReviewAt: localDayStart(now, REVIEW_INTERVAL_DAYS[0]) };
}

/** Moves one interval further when remembered, or back to the first interval when it needs another look. */
export function nextReview(step: number, remembered: boolean, now = Date.now()): ReviewSchedule {
  const last = REVIEW_INTERVAL_DAYS.length - 1;
  const reviewStep = remembered ? Math.min(Math.max(0, step) + 1, last) : 0;
  return { reviewStep, nextReviewAt: localDayStart(now, REVIEW_INTERVAL_DAYS[reviewStep]) };
}

/** Review state that follows a status change: evergreen notes get scheduled, drafts leave the queue. */
export function scheduleForStatus(note: Pick<Knowledge, "status" | "reviewStep" | "nextReviewAt">, status: Knowledge["status"], now = Date.now()): ReviewSchedule {
  if (status === "draft") return { reviewStep: 0, nextReviewAt: null };
  return note.status === "evergreen" && note.nextReviewAt !== null ? { reviewStep: note.reviewStep, nextReviewAt: note.nextReviewAt } : firstReview(now);
}

export function isDue(note: Pick<Knowledge, "status" | "nextReviewAt">, now = Date.now()) {
  return note.status === "evergreen" && note.nextReviewAt !== null && note.nextReviewAt <= now;
}

/** Evergreen notes due now, the longest-waiting first. */
export function dueKnowledge(notes: Knowledge[], now = Date.now()) {
  return notes.filter((note) => isDue(note, now)).sort((a, b) => (a.nextReviewAt ?? 0) - (b.nextReviewAt ?? 0));
}

/** The next upcoming review time, if any note is scheduled. */
export function nextDueAt(notes: Knowledge[]) {
  return notes.reduce<number | null>((soonest, note) => note.status === "evergreen" && note.nextReviewAt !== null && (soonest === null || note.nextReviewAt < soonest) ? note.nextReviewAt : soonest, null);
}
