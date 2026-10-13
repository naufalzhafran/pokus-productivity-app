import { useEffect, useRef, type ReactNode } from "react";
import { CalendarCheck, CalendarDays, Ellipsis, FolderKanban, Inbox, Lightbulb, Sun, Timer, UserRound } from "lucide-react";
import { PokusLogo } from "@/components/features/PokusLogo";
import { cn } from "@/lib/utils";
import { MORE_PAGES, type AppPage } from "@/lib/routes";
import type { PomodoroSession } from "@/types/task";

const items = {
  timer: { label: "Timer", Icon: Timer }, today: { label: "Today", Icon: Sun }, projects: { label: "Projects", Icon: FolderKanban },
  calendar: { label: "Calendar", Icon: CalendarDays }, habits: { label: "Habits", Icon: CalendarCheck }, capture: { label: "Capture", Icon: Inbox },
  knowledge: { label: "Knowledge", Icon: Lightbulb }, profile: { label: "Profile", Icon: UserRound }, more: { label: "More", Icon: Ellipsis },
} as const;
// Phones get five tabs; Calendar, Habits, Knowledge, and Profile live under More.
const desktopPages = ["timer", "today", "projects", "calendar", "habits", "capture", "knowledge", "profile"] as const;
const mobilePages = ["timer", "today", "projects", "capture", "more"] as const;
const titles: Record<AppPage, string> = { timer: "Timer", today: "Today", projects: "Projects", calendar: "Calendar", habits: "Habits", capture: "Capture", knowledge: "Knowledge", profile: "Profile", more: "More" };

interface AppShellProps {
  page: AppPage;
  session: PomodoroSession | null;
  remainingSeconds?: number;
  onNavigate: (page: AppPage) => void;
  onNavigateIntent?: (page: AppPage) => void;
  children: ReactNode;
}

/** Brand "Pokus chip": session color dot plus a label, so state never relies on color alone. */
function SessionChip({ session, display }: { session: PomodoroSession; display: string }) {
  const state = session.mode === "complete" ? "break" : session.isActive ? "focus" : "paused";
  const label = state === "break" ? "Pokus complete" : state === "focus" ? display : `Paused · ${display}`;
  return <span data-state={state} className="pokus-chip inline-flex h-7 items-center gap-2 rounded-full px-3 text-caption tabular-nums text-foreground"
    aria-label={state === "focus" ? `Pokus running, ${display} remaining` : undefined}>
    <span aria-hidden="true" className="size-2 rounded-full bg-(--chip-color)" />{label}
  </span>;
}

export function AppShell({ page, session, remainingSeconds = session?.remainingSeconds ?? 0, onNavigate, onNavigateIntent, children }: AppShellProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const timerStatus = session ? session.mode === "complete" ? "Complete" : session.isActive ? "Running" : "Paused" : null;
  const display = `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, "0")}`;
  const title = titles[page];
  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); }, [page]);
  useEffect(() => {
    if (page === "timer" && session?.mode === "running") return;
    document.title = `${page === "timer" ? session?.mode === "complete" ? "Pokus complete" : "Start a Pokus" : title} | Pokus`;
  }, [page, session?.mode, title]);
  const navigation = (mobile: boolean) => <nav aria-label="Primary navigation" className={cn("flex gap-1", mobile ? "mx-auto max-w-lg" : "flex-col")}>
    {(mobile ? mobilePages : desktopPages).map((value) => {
      const { label, Icon } = items[value];
      const current = page === value || (value === "more" && MORE_PAGES.includes(page));
      return <a key={value} href={`#${value}`} onClick={() => { onNavigateIntent?.(value); onNavigate(value); }}
        onMouseEnter={() => onNavigateIntent?.(value)} onFocus={() => onNavigateIntent?.(value)} onTouchStart={() => onNavigateIntent?.(value)}
        className={cn("inline-flex items-center rounded-lg font-semibold transition-colors duration-150 ease-standard [&_svg]:shrink-0",
          current ? "text-primary" : "text-muted-foreground hover:text-foreground",
          mobile ? "h-11 min-h-11 min-w-0 flex-1 flex-col justify-center gap-0.5 px-1 py-1 text-xs [&_svg]:size-6"
            : cn("h-11 gap-3 px-3 text-sm [&_svg]:size-5", current ? "bg-accent" : "hover:bg-muted"))}
        aria-current={page === value ? "page" : undefined} aria-label={value === "timer" && timerStatus ? `Timer, ${timerStatus.toLowerCase()}` : value === "more" && page !== "more" && current ? `More, ${titles[page]}` : label}>
        <Icon aria-hidden="true" strokeWidth={1.75} /><span>{label}</span>
      </a>;
    })}
  </nav>;
  return <div className="min-h-dvh bg-background text-foreground md:grid md:grid-cols-[264px_minmax(0,1fr)]">
    <a href="#main-content" className="fixed left-3 top-3 z-50 -translate-y-20 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:translate-y-0">Skip to content</a>
    <aside className="sticky top-0 hidden h-dvh flex-col gap-8 border-r bg-card px-4 pb-6 pt-[max(1.5rem,env(safe-area-inset-top))] md:flex">
      <a href="#timer" onClick={() => onNavigate("timer")} className="flex min-h-11 items-center self-start rounded-md px-3">
        <PokusLogo className="h-9" />
      </a>
      {navigation(false)}
      {session ? <div className="mt-auto px-3"><SessionChip session={session} display={display} /></div> : null}
    </aside>
    <div className="min-w-0">
      <header className="app-header app-main border-b bg-background pt-[env(safe-area-inset-top)] md:hidden">
        <div className="flex min-h-14 items-center justify-between gap-3">
          <a href="#timer" onClick={() => onNavigate("timer")} className="flex min-h-11 items-center rounded-md">
            <PokusLogo className="h-9" />
          </a>
          {session ? <SessionChip session={session} display={display} /> : null}
        </div>
      </header>
      <main id="main-content" className="app-main mx-auto w-full max-w-[1200px] pb-[calc(4rem+env(safe-area-inset-bottom))] pt-4 md:pb-10 md:pt-8">
        {page !== "projects" && page !== "knowledge" ? <h1 ref={headingRef} tabIndex={-1} className="sr-only outline-none md:not-sr-only md:mb-6 md:font-display md:text-display-m">{title}</h1> : null}
        {children}
      </main>
    </div>
    <div className="app-main fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)] pt-1 md:hidden">{navigation(true)}</div>
  </div>;
}
