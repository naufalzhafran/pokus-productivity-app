import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { captureDisplayTitle } from "@/lib/capture";
import { validReminderAt } from "@/lib/calendar";
import { claimCaptureReminder } from "@/lib/offline-store";
import { pb } from "@/lib/pocketbase";
import { calendarHash } from "@/lib/routes";
import { localDateKey } from "@/lib/workspace";
import type { Capture } from "@/types/capture";

/** Browsers show due reminders while the workspace is visible; there is no background push. */
export function useCaptureReminders(owner: string, captures: Capture[], isLoading = false) {
  const current = useRef({ owner, captures, isLoading });
  const checking = useRef(false);
  const check = useCallback(async () => {
    if (checking.current || document.visibilityState !== "visible") return;
    const snapshot = current.current;
    if (snapshot.isLoading || snapshot.owner === "anonymous" || pb.authStore.record?.id !== snapshot.owner) return;
    checking.current = true;
    try {
      const claimed: Capture[] = [];
      for (const capture of snapshot.captures) {
        if (document.visibilityState !== "visible" || current.current.owner !== snapshot.owner || pb.authStore.record?.id !== snapshot.owner) return;
        if (!validReminderAt(capture.reminderAt) || capture.reminderDone || capture.reminderAt > Date.now()) continue;
        try {
          if (await claimCaptureReminder(snapshot.owner, capture.id, capture.reminderAt)) claimed.push(capture);
        } catch { /* Without a durable claim, another tab could repeat the reminder. */ }
      }
      const latest = current.current;
      if (latest.owner !== snapshot.owner || pb.authStore.record?.id !== snapshot.owner) return;
      const due = claimed.filter((capture) => latest.captures.some((item) => item.id === capture.id && !item.reminderDone && item.reminderAt === capture.reminderAt));
      if (!due.length) return;
      const href = due.length === 1 ? calendarHash(localDateKey(new Date(due[0].reminderAt!)), due[0].id) : calendarHash(localDateKey());
      toast(due.length === 1 ? captureDisplayTitle(due[0]) : `${due.length} capture reminders are due`, {
        description: due.length === 1 ? "Capture reminder" : "Review your reminders in Calendar.",
        action: { label: "Open calendar", onClick: () => { window.location.hash = href; } },
      });
    } finally { checking.current = false; }
  }, []);

  useEffect(() => {
    current.current = { owner, captures, isLoading };
    void check();
  }, [owner, captures, isLoading, check]);

  useEffect(() => {
    const timer = window.setInterval(() => void check(), 30_000);
    const visible = () => { void check(); };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
      current.current = { owner: "anonymous", captures: [], isLoading: true };
    };
  }, [check]);
}
