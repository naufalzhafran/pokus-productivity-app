import { useEffect, useRef, useState } from "react";
import type { PomodoroSession } from "@/types/task";

export function calculateRemainingSeconds(
  session: PomodoroSession | null,
  now = Date.now(),
) {
  if (!session) return 0;
  if (!session.isActive || session.mode === "complete") {
    return session.remainingSeconds;
  }
  const elapsed = Math.max(0, Math.floor((now - session.lastTick) / 1000));
  return Math.max(0, session.remainingSeconds - elapsed);
}

export function useTimerClock(
  session: PomodoroSession | null,
  onComplete: (session: PomodoroSession) => void,
) {
  const [clock, setClock] = useState(() => ({
    sessionId: session?.id ?? null,
    remainingSeconds: calculateRemainingSeconds(session),
  }));
  const completedSessionId = useRef<string | null>(null);

  useEffect(() => {
    if (!session || session.mode === "complete" || !session.isActive) return;

    const update = () => {
      const remaining = calculateRemainingSeconds(session);
      setClock({
        sessionId: session.id,
        remainingSeconds: remaining,
      });
      if (
        remaining === 0 &&
        session.isActive &&
        completedSessionId.current !== session.id
      ) {
        completedSessionId.current = session.id;
        onComplete(session);
      }
    };

    const interval = window.setInterval(update, 1000);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", update);
    };
  }, [onComplete, session]);

  if (
    session?.mode === "running" &&
    session.isActive &&
    clock.sessionId === session.id
  ) {
    return clock.remainingSeconds;
  }
  return calculateRemainingSeconds(session);
}
