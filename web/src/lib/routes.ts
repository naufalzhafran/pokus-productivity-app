import { validHabitDay } from "@/lib/habits";

export type AppPage = "timer" | "today" | "projects" | "tasks" | "capture" | "knowledge" | "habits" | "calendar" | "profile" | "more";
/** Pages the phone's bottom bar reaches through More. */
export const MORE_PAGES: readonly AppPage[] = ["tasks", "calendar", "habits", "knowledge", "profile"];

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
  if (page === "projects") return { page, projectId: id ? decodeURIComponent(id) : null };
  // `#tasks/<id>` is an old project link; plain `#tasks` is the All tasks list.
  if (page === "tasks") return id ? { page: "projects", projectId: decodeURIComponent(id) } : { page, projectId: null };
  if (page === "knowledge") return { page, projectId: null, knowledgeId: id ? decodeURIComponent(id) : null };
  if (page === "capture" || page === "habits" || page === "profile" || page === "today" || page === "more") return { page, projectId: null };
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
