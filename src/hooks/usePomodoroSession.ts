import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type SetStateAction,
} from "react";
import { ClientResponseError } from "pocketbase";
import { pb } from "@/lib/pocketbase";
import {
  COLLECTIONS,
  loadCurrentSession,
  sessionToRecord,
} from "@/lib/pocketbase-records";
import type { PomodoroSession } from "@/types/task";

export function usePomodoroSession() {
  const [session, setSessionState] = useState<PomodoroSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const sessionRef = useRef<PomodoroSession | null>(null);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let isMounted = true;

    void loadCurrentSession()
      .then((savedSession) => {
        if (!isMounted) return;
        sessionRef.current = savedSession;
        setSessionState(savedSession);
        setLoadError(null);
      })
      .catch((error) => {
        console.error("Failed to load Pomodoro session from PocketBase:", error);
        if (isMounted) setLoadError("Your active session could not be restored.");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const setSession = useCallback(
    (action: SetStateAction<PomodoroSession | null>) => {
      const previousSession = sessionRef.current;
      const nextSession =
        typeof action === "function" ? action(previousSession) : action;

      sessionRef.current = nextSession;
      setSessionState(nextSession);

      if (nextSession) {
        writeQueueRef.current = writeQueueRef.current
          .catch(() => undefined)
          .then(async () => {
            const collection = pb.collection(COLLECTIONS.sessions);
            const data = sessionToRecord(nextSession);

            if (!previousSession || previousSession.id !== nextSession.id) {
              await collection.create(data, { requestKey: null });
            } else {
              await collection.update(nextSession.id, data, { requestKey: null });
            }
          })
          .catch((error: unknown) => {
            console.error("Failed to save Pomodoro session to PocketBase:", error);
          });
      } else if (previousSession && previousSession.mode !== "complete") {
        writeQueueRef.current = writeQueueRef.current
          .catch(() => undefined)
          .then(async () => {
            try {
              await pb
                .collection(COLLECTIONS.sessions)
                .delete(previousSession.id, { requestKey: null });
            } catch (error) {
              if (
                error instanceof ClientResponseError &&
                error.status === 404
              ) {
                return;
              }
              throw error;
            }
          })
          .catch((error: unknown) => {
            console.error(
              "Failed to delete Pomodoro session from PocketBase:",
              error,
            );
          });
      }
    },
    [],
  );

  return { session, setSession, isLoading, loadError };
}
