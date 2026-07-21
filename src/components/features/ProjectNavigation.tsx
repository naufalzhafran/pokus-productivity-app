import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  Folder,
  ListTodo,
  Menu,
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { WorkspaceIndex, WorkspaceScope } from "@/lib/workspace";

interface ProjectNavigationProps {
  index: WorkspaceIndex;
  scope: WorkspaceScope;
  onScopeChange: (scope: WorkspaceScope) => void;
}

function NavigationItems({
  index,
  scope,
  onScopeChange,
  onChosen,
}: ProjectNavigationProps & { onChosen?: () => void }) {
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(25);
  const [announcement, setAnnouncement] = useState("");
  const filteredProjects = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return index.activeProjects;
    return index.activeProjects.filter((project) =>
      project.title.toLocaleLowerCase().includes(needle),
    );
  }, [index.activeProjects, query]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setAnnouncement(
        `${filteredProjects.length} matching ${filteredProjects.length === 1 ? "project" : "projects"}.`,
      );
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [filteredProjects.length, query]);

  const choose = (nextScope: WorkspaceScope) => {
    onScopeChange(nextScope);
    onChosen?.();
  };

  const item = (
    value: WorkspaceScope,
    label: string,
    count: number,
    icon: React.ReactNode,
  ) => (
    <Button
      type="button"
      variant={scope === value ? "secondary" : "ghost"}
      className="min-h-11 w-full justify-start"
      onClick={() => choose(value)}
      aria-current={scope === value ? "page" : undefined}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      <Badge variant="outline">{count}</Badge>
    </Button>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      <label className="relative">
        <span className="sr-only">Search projects</span>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a project"
          className="pl-9"
        />
      </label>
      {query ? (
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setQuery("");
            setAnnouncement("Project search cleared.");
          }}
        >
          Clear project search
        </Button>
      ) : null}
      <ScrollArea className="min-h-0 flex-1">
        <nav aria-label="Project scopes" className="flex flex-col gap-1 pr-3">
          {item(
            "all",
            "All tasks",
            index.activeOpenCount,
            <ListTodo data-icon="inline-start" />,
          )}
          <p className="px-3 pb-1 pt-4 text-xs font-medium text-muted-foreground">
            Projects
          </p>
          {filteredProjects.slice(0, visibleCount).map((project) =>
            item(
              `project:${project.id}`,
              project.title,
              index.groupMap.get(project.id)?.openCount ?? 0,
              <Folder data-icon="inline-start" />,
            ),
          )}
          {visibleCount < filteredProjects.length ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                const nextCount = Math.min(
                  visibleCount + 25,
                  filteredProjects.length,
                );
                setVisibleCount(nextCount);
                setAnnouncement(
                  `${nextCount - visibleCount} more projects shown. ${nextCount} of ${filteredProjects.length} projects visible.`,
                );
              }}
            >
              Show more projects
            </Button>
          ) : null}
          {item(
            "archived",
            "Archived",
            index.archivedProjects.length,
            <Archive data-icon="inline-start" />,
          )}
        </nav>
      </ScrollArea>
    </div>
  );
}

export function DesktopProjectNavigation(props: ProjectNavigationProps) {
  return (
    <aside className="sticky top-24 hidden h-fit max-h-[calc(100dvh-7rem)] flex-col overflow-hidden rounded-2xl border bg-card p-4 lg:flex">
      <h2 className="mb-3 font-heading font-medium">Workspace</h2>
      <NavigationItems {...props} />
    </aside>
  );
}

export function MobileProjectNavigation(props: ProjectNavigationProps) {
  const [open, setOpen] = useState(false);
  return (
    <Drawer open={open} onOpenChange={setOpen} swipeDirection="right">
      <DrawerTrigger
        render={
          <Button type="button" variant="outline" className="lg:hidden" />
        }
      >
        <Menu data-icon="inline-start" />
        Projects
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Projects</DrawerTitle>
        </DrawerHeader>
        <div className="flex min-h-0 flex-1 flex-col p-4 pt-0">
          <NavigationItems {...props} onChosen={() => setOpen(false)} />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
