import { useEffect, useRef, type ReactNode } from "react";
import { FolderKanban, Inbox, Lightbulb, Timer, UserRound } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AppPage } from "@/lib/routes";
import type { PomodoroSession } from "@/types/task";

interface AppShellProps {
  page: AppPage;
  session: PomodoroSession | null;
  remainingSeconds?: number;
  onNavigate: (page: AppPage) => void;
  onNavigateIntent?: (page: AppPage) => void;
  children: ReactNode;
}
export function AppShell({ page, session, remainingSeconds = session?.remainingSeconds ?? 0, onNavigate, onNavigateIntent, children }: AppShellProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const timerStatus = session ? session.mode === "complete" ? "Complete" : session.isActive ? "Running" : "Paused" : null;
  const display = `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, "0")}`;
  const title = page === "timer" ? "Pomodoro Timer" : page === "profile" ? "Profile" : page === "capture" ? "Capture" : page === "knowledge" ? "Knowledge" : "Projects";
  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); }, [page]);
  useEffect(() => {
    if (page === "timer" && session?.mode === "running") return;
    document.title = `${page === "timer" ? session?.mode === "complete" ? "Session complete" : "Set up timer" : title} | Pokus`;
  }, [page, session?.mode, title]);
  const navigation = (mobile: boolean) => <nav aria-label="Primary navigation" className={cn("flex gap-1", mobile ? "mx-auto max-w-md" : "w-[33rem]")}>
    {([{ page: "timer", label: "Timer", Icon: Timer }, { page: "projects", label: "Projects", Icon: FolderKanban }, { page: "capture", label: "Capture", Icon: Inbox }, { page: "knowledge", label: "Knowledge", Icon: Lightbulb }, { page: "profile", label: "Profile", Icon: UserRound }] as const).map(({ page: value, label, Icon }) => <a key={value} href={`#${value}`} onClick={() => { onNavigateIntent?.(value); onNavigate(value); }}
      onMouseEnter={() => onNavigateIntent?.(value)} onFocus={() => onNavigateIntent?.(value)} onTouchStart={() => onNavigateIntent?.(value)}
      className={cn(buttonVariants({ variant: page === value ? "secondary" : "ghost" }), "min-h-12 flex-1", mobile && "h-11 min-h-11 min-w-0 flex-col gap-0.5 px-1 py-1 text-xs")}
      aria-current={page === value ? "page" : undefined} aria-label={value === "timer" && timerStatus ? `Timer, ${timerStatus.toLowerCase()}` : label}>
      <Icon aria-hidden="true" /><span>{label}</span>
    </a>)}
  </nav>;
  return <div className="min-h-dvh bg-background text-foreground">
    <a href="#main-content" className="fixed left-3 top-3 z-50 -translate-y-20 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:translate-y-0">Skip to content</a>
    <header className="app-header app-main border-b bg-background pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex min-h-14 max-w-7xl items-center justify-between gap-3 md:min-h-18">
        <a href="#timer" onClick={() => onNavigate("timer")} className="flex min-h-11 items-center gap-2 text-lg font-semibold tracking-tight">
          <svg viewBox="0 0 24 24" width="24" height="24" className="shrink-0 text-primary" aria-hidden="true">
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="3" />
            <circle cx="12" cy="12" r="4" fill="currentColor" />
          </svg>
          Pokus
        </a>
        <div className="hidden md:block">{navigation(false)}</div>
        <span className="text-sm text-muted-foreground md:hidden" aria-label={session?.isActive ? `Pomodoro running, ${display} remaining` : undefined}>{session ? session.isActive ? display : timerStatus : page === "timer" ? "Your focus, at your pace" : null}</span>
      </div>
    </header>
    <main id="main-content" className="app-main mx-auto w-full max-w-7xl pb-[calc(4rem+env(safe-area-inset-bottom))] pt-4 md:pb-10 md:pt-8">
      {page !== "projects" && page !== "knowledge" ? <h1 ref={headingRef} tabIndex={-1} className="sr-only outline-none md:not-sr-only md:mb-6 md:text-2xl md:font-semibold">{title}</h1> : null}
      {children}
    </main>
    <div className="app-main fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)] pt-1 md:hidden">{navigation(true)}</div>
  </div>;
}
