import { useEffect, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { ResponsiveOverlay } from "@/components/features/ResponsiveOverlay";
import { HabitEditor } from "@/components/features/HabitEditor";
import { HabitActivity } from "@/components/features/HabitActivity";
import { HabitDayList } from "@/components/features/HabitDayList";
import { HabitReminder } from "@/components/features/HabitReminder";
import { useHabits } from "@/hooks/useHabits";
import { useConnectivity } from "@/hooks/useConnectivity";
import { formatHabitDay, habitDay, habitFraction, habitStreaks, overallHabitProgress, validHabitDay } from "@/lib/habits";
import type { Habit } from "@/types/habit";

function Streaks({ habits, today }: { habits: Habit[]; today: string }) {
  const stats = habitStreaks(habits, today);
  return <dl className="grid grid-cols-3 gap-3 py-4 text-center">{[["Current streak", stats.current], ["Best streak", stats.longest], ["Completed days", stats.completedDays]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground sm:text-sm">{label}</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd></div>)}</dl>;
}

export function HabitsPage() {
  const store = useHabits(); const { canEdit } = useConnectivity();
  const [today, setToday] = useState(habitDay);
  const [day, setDay] = useState(today);
  const [year, setYear] = useState(today.slice(0, 4));
  const [tab, setTab] = useState("today");
  const [editor, setEditor] = useState<{ habit: Habit | null } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Habit | null>(null);
  const disabled = !canEdit || store.saving;
  const detail = store.habits.find((habit) => habit.id === detailId);
  useEffect(() => {
    const update = () => { const next = habitDay(); setToday((previous) => { if (previous !== next) setDay((selected) => selected === previous ? next : selected); return next; }); };
    const timer = window.setInterval(update, 30_000); document.addEventListener("visibilitychange", update);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", update); };
  }, []);
  async function action(write: () => Promise<void>) {
    try { await write(); } catch (cause) {
      window.dispatchEvent(new Event("pokus-workspace-refresh"));
      toast.error(cause instanceof Error ? cause.message : "Could not save this entry. Refresh to check its value before retrying.");
      throw cause;
    }
  }
  const firstDay = store.habits.reduce((first, habit) => habit.startDay < first ? habit.startDay : first, today);
  const progress = overallHabitProgress(store.habits, day);
  const dateControl = (id: string, startDay = firstDay) => <Field className="w-auto"><FieldLabel htmlFor={id}>Date</FieldLabel><Input id={id} type="date" value={day} min={startDay} max={today} onChange={(event) => { if (validHabitDay(event.target.value) && event.target.value >= startDay && event.target.value <= today) setDay(event.target.value); }} /></Field>;
  const dayList = (habits: Habit[]) => <HabitDayList habits={habits} day={day} disabled={disabled} onDetail={(habit) => { setDetailId(habit.id); if (day < habit.startDay) setDay(today); }}
    onSet={(habit, value) => action(() => store.setValue(habit, day, value))} onIncrement={(habit) => action(() => store.increment(habit, day))} />;
  return <div className="mx-auto max-w-4xl space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Daily habits, separate from your focus sessions.</p><div className="flex gap-2"><Button variant="ghost" size="icon" aria-label="Refresh habits" disabled={!canEdit || store.saving} onClick={() => window.dispatchEvent(new Event("pokus-workspace-refresh"))}><RefreshCw /></Button><Button disabled={disabled} onClick={() => setEditor({ habit: null })}><Plus data-icon="inline-start" />New habit</Button></div></div>
    {store.loadError && <p role="status" className="rounded-lg border p-3 text-sm">{store.loadError} Use Refresh to try again.</p>}
    {!canEdit && <p role="status" className="text-sm text-muted-foreground">Saved habits are available to browse. Connect and sign in to record changes.</p>}
    {store.isLoading ? <Skeleton className="h-64 w-full" /> : !store.habits.length ? <Empty><EmptyHeader><EmptyTitle>No habits yet</EmptyTitle><EmptyDescription>Add a daily check-in or track a number toward a target. Your habits sync through your Pokus account.</EmptyDescription></EmptyHeader><EmptyContent><Button disabled={disabled} onClick={() => setEditor({ habit: null })}>Create your first habit</Button></EmptyContent></Empty> : <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
      <TabsList aria-label="Habit views"><TabsTrigger value="today">Today</TabsTrigger><TabsTrigger value="progress">Progress</TabsTrigger></TabsList>
      <TabsContent value="today" className="space-y-4 pt-4"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-semibold">{day === today ? "Today" : formatHabitDay(day)}</h2><p className="text-sm text-muted-foreground" aria-live="polite">{progress.completed} of {progress.total} habits complete</p></div><div className="flex items-end gap-2">{dateControl("habit-day")}{day !== today && <Button variant="outline" onClick={() => setDay(today)}>Today</Button>}</div></div>{dayList(store.habits)}{progress.total === 0 && <p className="text-sm text-muted-foreground">No habits had started on this date.</p>}</TabsContent>
      <TabsContent value="progress" className="space-y-5 pt-4"><div className="flex items-end justify-between gap-3"><h2 className="font-semibold">Activity</h2><Field className="w-28"><FieldLabel htmlFor="habit-year">Year</FieldLabel><Input id="habit-year" type="number" min={Number(firstDay.slice(0, 4))} max={Number(today.slice(0, 4))} value={year} onChange={(event) => setYear(event.target.value)} /></Field></div><Streaks habits={store.habits} today={today} />
        {Number(year) >= Number(firstDay.slice(0, 4)) && Number(year) <= Number(today.slice(0, 4)) && /^\d{4}$/.test(year) && <HabitActivity year={Number(year)} selected={day} firstDay={firstDay} fraction={(value) => overallHabitProgress(store.habits, value).fraction} onSelect={(value) => { setDay(value); setTab("today"); }} />}
        <p className="text-sm text-muted-foreground">A day counts toward your streak when at least one habit is complete.</p><ul className="divide-y border-y">{store.habits.map((habit) => <li key={habit.id}><Button variant="ghost" className="h-auto min-h-12 w-full justify-between whitespace-normal py-3 text-left" onClick={() => { setDetailId(habit.id); setDay(today); }}><span>{habit.name}</span><span className="ml-3 shrink-0 text-sm text-muted-foreground">{habitStreaks([habit], today).current} day streak</span></Button></li>)}</ul>
      </TabsContent>
    </Tabs>}
    {detail && <ResponsiveOverlay open onOpenChange={(open) => { if (!open && !store.saving) setDetailId(null); }} title={detail.name} description={`Started ${formatHabitDay(detail.startDay)}`}><div className="space-y-5"><Streaks habits={[detail]} today={today} />{dateControl("habit-detail-day", detail.startDay)}{dayList([detail])}<HabitActivity year={Number(day.slice(0, 4))} selected={day} firstDay={detail.startDay} fraction={(value) => habitFraction(detail, value)} onSelect={setDay} /><div className="flex justify-between gap-2"><Button variant="outline" disabled={disabled} onClick={() => { setDetailId(null); setEditor({ habit: detail }); }}>Edit habit</Button><Button variant="destructive" disabled={disabled} onClick={() => setDeleting(detail)}>Delete habit</Button></div></div></ResponsiveOverlay>}
    {editor && <HabitEditor key={editor.habit?.id ?? "new"} habit={editor.habit} saving={store.saving} onClose={() => setEditor(null)} onSave={(input) => editor.habit ? store.edit(editor.habit, input.name, input.target) : store.create(input)} />}
    <AlertDialog open={!!deleting} onOpenChange={(open) => { if (!open && !store.saving) setDeleting(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle><AlertDialogDescription>This permanently removes the habit, its targets, and all daily entries across your Pokus account.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={store.saving}>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={disabled} onClick={() => { if (deleting) void action(() => store.remove(deleting.id)).then(() => { setDeleting(null); setDetailId(null); }).catch(() => {}); }}>{store.saving ? "Deleting…" : "Delete habit"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <HabitReminder />
  </div>;
}
