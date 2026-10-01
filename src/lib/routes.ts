export type AppPage = "timer" | "projects" | "capture" | "profile";

export interface AppRoute {
  page: AppPage;
  /** Set on `#projects/<id>`; `NO_PROJECT_ID` opens tasks without a project. */
  projectId: string | null;
}

export function parseRoute(hash: string): AppRoute {
  const [page, id] = hash.replace(/^#/, "").split("/");
  if (page === "projects" || page === "tasks") return { page: "projects", projectId: page === "projects" && id ? decodeURIComponent(id) : null };
  if (page === "capture" || page === "profile") return { page, projectId: null };
  return { page: "timer", projectId: null };
}

export function routeHash({ page, projectId }: AppRoute) {
  return page === "projects" && projectId ? `#projects/${encodeURIComponent(projectId)}` : `#${page}`;
}

export function projectHash(projectId: string) {
  return routeHash({ page: "projects", projectId });
}
