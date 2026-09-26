import { useState, type ReactNode } from "react";
import { Archive, ChevronRight, Folder, RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import type { FlatWorkspaceIndex } from "@/lib/workspace";

interface Props {
  readOnly?: boolean;
  index: FlatWorkspaceIndex;
  pending: Set<string>;
  onOpen: (id: string) => void;
  onRestore: (id: string) => Promise<unknown>;
  navigation: ReactNode;
}

export function ArchivedProjects({
  readOnly = false,
  index,
  pending,
  onOpen,
  onRestore,
  navigation,
}: Props) {
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const projects = index.archivedProjects.filter((project) =>
    project.title
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase()),
  );

  return (
    <Card size="sm" className="gap-0">
      <CardHeader className="gap-3 border-b pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">Archived projects</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {index.archivedProjects.length} archived{" "}
              {index.archivedProjects.length === 1 ? "project" : "projects"}
            </p>
          </div>
          {navigation}
        </div>
        {index.archivedProjects.length > 0 ? (
          <label className="relative">
            <span className="sr-only">Search archived projects</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              enterKeyHint="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search archived projects"
              className="pl-9"
            />
          </label>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="p-0">
        {projects.length ? (
          <ul aria-label="Archived projects">
            {projects.map((project) => {
              const group = index.groupMap.get(project.id);
              return (
                <li
                  key={project.id}
                  aria-busy={pending.has(project.id)}
                  className="flex items-center gap-2 border-b px-4 py-3 last:border-b-0 sm:px-5"
                >
                  <button
                    type="button"
                    onClick={() => onOpen(project.id)}
                    aria-label={`Open project ${project.title}`}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-md py-1 text-left"
                  >
                    <Folder className="size-5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium [overflow-wrap:anywhere]">
                        {project.title}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {group?.tasks.length ?? 0} tasks ·{" "}
                        {group?.completedCount ?? 0} completed
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                  <Button
                    variant="ghost"
                    size="sm"
                  disabled={readOnly || pending.has(project.id)}
                    aria-label={`Restore project ${project.title}`}
                    onClick={() => {
                      setError(null);
                      void onRestore(project.id).catch((caught) =>
                        setError(
                          caught instanceof Error
                            ? caught.message
                            : "Could not restore project. Try again.",
                        ),
                      );
                    }}
                  >
                    <RotateCcw />
                    Restore
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty className="min-h-72">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Archive />
              </EmptyMedia>
              <EmptyTitle>
                {index.archivedProjects.length
                  ? "No matching projects"
                  : "No archived projects"}
              </EmptyTitle>
              <EmptyDescription>
                {index.archivedProjects.length
                  ? "Try a different project name."
                  : "Projects you archive will appear here. You can open or restore them anytime."}
              </EmptyDescription>
            </EmptyHeader>
            {search ? (
              <Button variant="outline" onClick={() => setSearch("")}>
                Clear search
              </Button>
            ) : null}
          </Empty>
        )}
      </CardContent>
    </Card>
  );
}
