import { CalendarCheck, CalendarDays, ChevronRight, Lightbulb, UserRound } from "lucide-react";
import type { AppPage } from "@/lib/routes";

const links = [
  { page: "calendar", label: "Calendar", description: "Deadlines, dated tasks, habits, and reminders by day", Icon: CalendarDays },
  { page: "habits", label: "Habits", description: "Daily check-ins, totals, and streaks", Icon: CalendarCheck },
  { page: "knowledge", label: "Knowledge", description: "Notes distilled from your captures, and review", Icon: Lightbulb },
  { page: "profile", label: "Profile", description: "Focus stats, history, settings, and export", Icon: UserRound },
] as const;

/** The phone's More tab: the rest of Pokus, one tap away. */
export function MorePage({ onNavigate }: { onNavigate: (page: AppPage) => void }) {
  return <nav aria-label="More" className="screen-panel mx-auto w-full max-w-xl">
    <ul className="divide-y rounded-2xl border bg-card">
      {links.map(({ page, label, description, Icon }) => <li key={page}>
        <a href={`#${page}`} onClick={() => onNavigate(page)} aria-describedby={`more-${page}`} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-muted">
          <Icon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1"><span className="block font-medium">{label}</span><span id={`more-${page}`} aria-hidden="true" className="block text-sm text-muted-foreground">{description}</span></span>
          <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        </a>
      </li>)}
    </ul>
  </nav>;
}
