import { useEffect, useState } from "react";
import { listPomodoroHistory } from "@/lib/pocketbase-records";
import type { PomodoroHistoryEntry } from "@/types/task";

export function usePomodoroHistory() {
  const [history, setHistory] = useState<PomodoroHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    void listPomodoroHistory()
      .then((entries) => {
        if (!isMounted) return;
        setHistory(entries);
        setError(null);
      })
      .catch((loadError: unknown) => {
        console.error("Failed to load Pomodoro history from PocketBase:", loadError);
        if (isMounted) setError("Your Pomodoro history could not be loaded.");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return { history, isLoading, error };
}
