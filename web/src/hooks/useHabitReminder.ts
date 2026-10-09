import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { habitDay, habitsDueOn } from "@/lib/habits";
import type { Habit } from "@/types/habit";

interface Reminder { enabled: boolean; time: string }
function key(owner: string) { return `pokus-habit-reminder:${owner}`; }
export function readHabitReminder(owner: string): Reminder {
  try {
    const value = JSON.parse(localStorage.getItem(key(owner)) ?? "{}");
    return { enabled: value.enabled === true, time: /^([01]\d|2[0-3]):[0-5]\d$/.test(value.time) ? value.time : "20:00" };
  } catch { return { enabled: false, time: "20:00" }; }
}
/** `habits` is null until they've loaded; the reminder waits for them and skips days with nothing left to do. */
export function useHabitReminder(owner: string, habits: Habit[] | null) {
  const latest = useRef(habits);
  useEffect(() => { latest.current = habits; }, [habits]);
  useEffect(() => {
    const check = () => {
      const reminder = readHabitReminder(owner); const date = new Date();
      const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
      if (!reminder.enabled || time < reminder.time || !latest.current || !habitsDueOn(latest.current, habitDay(date))) return;
      const stamp = `${key(owner)}:last-day`; const day = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
      try { if (localStorage.getItem(stamp) === day) return; localStorage.setItem(stamp, day); } catch { return; }
      toast("Time for your daily habits", { action: { label: "Open habits", onClick: () => { window.location.hash = "#habits"; } } });
    };
    check(); const timer = window.setInterval(check, 30_000);
    window.addEventListener("pokus-habit-reminder-change", check);
    document.addEventListener("visibilitychange", check);
    return () => { clearInterval(timer); window.removeEventListener("pokus-habit-reminder-change", check); document.removeEventListener("visibilitychange", check); };
  }, [owner]);
}
export function useHabitReminderSettings(owner: string) {
  const [reminder, setReminder] = useState(() => readHabitReminder(owner));
  function update(next: Reminder) {
    try { localStorage.setItem(key(owner), JSON.stringify(next)); setReminder(next); window.dispatchEvent(new Event("pokus-habit-reminder-change")); }
    catch { toast.error("This browser couldn't save your reminder preference."); }
  }
  return { reminder, update };
}
