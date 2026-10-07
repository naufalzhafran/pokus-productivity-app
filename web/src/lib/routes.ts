import { validHabitDay } from "@/lib/habits";

export type AppPage = "timer" | "projects" | "capture" | "knowledge" | "habits" | "calendar" | "profile";

/** `#knowledge/review` opens the review queue; note ids are 15 characters, so they never collide. */
export const KNOWLEDGE_REVIEW_ID = "review";

export interface AppRoute {
  page: AppPage;
  /** Set on `#projects/<id>`; `NO_PROJECT_ID` opens tasks without a project. */
  projectId: string | null;
  /** Set on `#knowledge/<id>` or `#knowledge/review`. */
  knowledgeId?: string | null;
  calendarDay?: string | null;
  captureId?: string | null;
}

export function parseRoute(hash: string): AppRoute {
  const [page, id, captureId] = hash.replace(/^#/, "").split("/");
  if (page === "calendar") return { page, projectId: null, calendarDay: id && validHabitDay(id) ? id : null, captureId: captureId && /^[a-z0-9]{15}$/.test(captureId) ? captureId : null };
  if (page === "projects" || page === "tasks") return { page: "projects", projectId: page === "projects" && id ? decodeURIComponent(id) : null };
  if (page === "knowledge") return { page, projectId: null, knowledgeId: id ? decodeURIComponent(id) : null };
  if (page === "capture" || page === "habits" || page === "profile") return { page, projectId: null };
  return { page: "timer", projectId: null };
}

export function routeHash({ page, projectId, knowledgeId, calendarDay, captureId }: AppRoute) {
  if (page === "calendar" && calendarDay && validHabitDay(calendarDay)) return `#calendar/${calendarDay}${captureId ? `/${encodeURIComponent(captureId)}` : ""}`;
  if (page === "projects" && projectId) return `#projects/${encodeURIComponent(projectId)}`;
  if (page === "knowledge" && knowledgeId) return `#knowledge/${encodeURIComponent(knowledgeId)}`;
  return `#${page}`;
}

export function calendarHash(day: string, captureId?: string) {
  return routeHash({ page: "calendar", projectId: null, calendarDay: day, captureId });
}

export function projectHash(projectId: string) {
  return routeHash({ page: "projects", projectId });
}

export function knowledgeHash(knowledgeId: string) {
  return routeHash({ page: "knowledge", projectId: null, knowledgeId });
}
