import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatFocusDuration, type FocusStatistics } from "@/lib/focus-stats";

const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: "UTC" });
const longDay = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
const dayDate = (day: string) => new Date(`${day}T12:00:00Z`);

/** Today, this week, streak, lifetime totals, and a seven-day bar chart (one series, read as a list). */
export function FocusStats({ stats, completedTasks }: { stats: FocusStatistics; completedTasks: number }) {
  const max = Math.max(...stats.lastSevenDays.map((day) => day.seconds), 1);
  const tiles: [string, string][] = [
    ["Today", formatFocusDuration(stats.today)], ["This week", formatFocusDuration(stats.week)],
    ["Streak", `${stats.streak} ${stats.streak === 1 ? "day" : "days"}`], ["Total focus", formatFocusDuration(stats.total)],
  ];
  return <Card>
    <CardHeader><CardTitle>Focus</CardTitle><CardDescription>{completedTasks} completed {completedTasks === 1 ? "task" : "tasks"}</CardDescription></CardHeader>
    <CardContent className="flex flex-col gap-5">
      <dl className="grid grid-cols-2 gap-x-3 gap-y-4">
        {tiles.map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-xl font-semibold tabular-nums">{value}</dd></div>)}
      </dl>
      <figure className="flex flex-col gap-2">
        <figcaption className="text-xs text-muted-foreground">Last 7 days</figcaption>
        <ol className="flex h-28 items-end gap-1.5" aria-label="Focus per day, last 7 days">
          {stats.lastSevenDays.map(({ day, seconds }, index) => <li key={day} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${longDay.format(dayDate(day))}: ${formatFocusDuration(seconds)}`}>
            <span className="sr-only">{longDay.format(dayDate(day))}: {formatFocusDuration(seconds)}</span>
            <span aria-hidden="true" className="flex w-full flex-1 items-end"><span className={index === 6 ? "w-full rounded-t-sm bg-primary" : "w-full rounded-t-sm bg-primary/60"} style={{ height: seconds ? `${Math.max(4, (seconds / max) * 100)}%` : "2px" }} /></span>
            <span aria-hidden="true" className="text-xs text-muted-foreground">{weekday.format(dayDate(day))}</span>
          </li>)}
        </ol>
      </figure>
    </CardContent>
  </Card>;
}
