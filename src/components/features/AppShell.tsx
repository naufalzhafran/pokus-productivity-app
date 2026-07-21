import { useEffect, useRef, type ReactNode } from "react";
import { ListTodo, Timer, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PomodoroSession } from "@/types/task";

export type AppPage = "tasks" | "timer" | "profile";

interface AppShellProps {
  page: AppPage;
  session: PomodoroSession | null;
  onNavigate: (page: AppPage) => void;
  children: ReactNode;
}

function pageTitle(page: AppPage) {
  if (page === "timer") return "Pomodoro Timer";
  if (page === "profile") return "Profile";
  return "Tasks";
}

function getTimerStatus(session: PomodoroSession | null) {
  if (!session) return null;
  if (session.mode === "complete") return "Complete";
  return session.isActive ? "Running" : "Paused";
}

export function AppShell({
  page,
  session,
  onNavigate,
  children,
}: AppShellProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const timerStatus = getTimerStatus(session);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [page]);

  const navItem = (
    value: AppPage,
    label: string,
    icon: React.ReactNode,
  ) => (
    <Button
      type="button"
      variant={page === value ? "secondary" : "ghost"}
      className="min-h-11 flex-1 flex-col gap-0.5 px-2 text-xs sm:flex-row sm:text-sm"
      onClick={() => onNavigate(value)}
      aria-current={page === value ? "page" : undefined}
      aria-label={
        value === "timer" && timerStatus
          ? `Timer, ${timerStatus.toLowerCase()}`
          : label
      }
    >
      {icon}
      <span>{label}</span>
      {value === "timer" && timerStatus ? (
        <Badge variant="outline" className="hidden md:inline-flex">
          {timerStatus}
        </Badge>
      ) : null}
    </Button>
  );

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <a
        href="#main-content"
        className="fixed left-3 top-3 z-50 -translate-y-20 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:translate-y-0"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 hidden border-b bg-background/90 backdrop-blur md:block">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Badge>Pokus</Badge>
            <span className="text-sm text-muted-foreground">Focus workspace</span>
          </div>
          <nav aria-label="Primary navigation" className="flex w-[28rem] gap-1">
            {navItem("tasks", "Tasks", <ListTodo data-icon="inline-start" />)}
            {navItem("timer", "Timer", <Timer data-icon="inline-start" />)}
            {navItem("profile", "Profile", <UserRound data-icon="inline-start" />)}
          </nav>
        </div>
      </header>

      <div className="border-b bg-background px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:hidden">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Badge>Pokus</Badge>
            <p className="mt-1 text-sm font-medium">{pageTitle(page)}</p>
          </div>
          {timerStatus ? <Badge variant="secondary">{timerStatus}</Badge> : null}
        </div>
      </div>

      <main
        id="main-content"
        className="mx-auto min-h-[calc(100dvh-4rem)] w-full max-w-7xl px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 md:pb-10 md:pt-8 lg:px-8"
      >
        {page !== "tasks" ? (
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="mb-6 font-heading text-2xl font-semibold tracking-tight outline-none md:text-3xl"
          >
            {pageTitle(page)}
          </h1>
        ) : null}
        {children}
      </main>

      <nav
        aria-label="Primary navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden"
      >
        <div className="mx-auto flex max-w-lg gap-1">
          {navItem("tasks", "Tasks", <ListTodo />)}
          {navItem("timer", "Timer", <Timer />)}
          {navItem("profile", "Profile", <UserRound />)}
        </div>
      </nav>
    </div>
  );
}
