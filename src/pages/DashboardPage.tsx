import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { getSessions } from "@/api/focus";
import { useEffect, useState, useCallback, useMemo, memo, useRef } from "react";
import { LocalSession } from "@/lib/sync";
import { TagDisplay } from "@/components/features/TagSelector";
import {
  Calendar,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  XCircle,
  RefreshCw,
} from "lucide-react";

interface SessionListItemProps {
  session: LocalSession;
}

const SessionListItem = memo(function SessionListItem({
  session,
}: SessionListItemProps) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-border last:border-0">
      <div className="flex items-start gap-3">
        {session.status === "COMPLETED" ? (
          <div className="mt-1">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
          </div>
        ) : session.status === "ABANDONED" ? (
          <div className="mt-1">
            <XCircle className="w-4 h-4 text-red-400" />
          </div>
        ) : (
          <div className="mt-1">
            <div className="w-4 h-4 rounded-full border-2 border-zinc-600 border-t-transparent animate-spin" />
          </div>
        )}
        <div>
          <h3 className="font-medium text-foreground text-sm">
            {session.title || "Untitled Session"}
          </h3>
          <TagDisplay tags={session.tags} size="sm" className="mt-1" />
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
            <span>
              {new Date(session.created_at).toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </span>
            <span>·</span>
            <span>
              {new Date(session.created_at).toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </p>
        </div>
      </div>
      <div className="text-right">
        <span
          className={`text-lg font-bold ${session.status === "COMPLETED" ? "text-foreground" : "text-muted-foreground"}`}
        >
          {session.duration}
          <span className="text-xs ml-1 font-normal text-muted-foreground">min</span>
        </span>
        <p className="text-[10px] uppercase font-medium tracking-wider text-muted-foreground mt-1">
          {session.status}
        </p>
      </div>
    </div>
  );
});

export default function DashboardPage() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<LocalSession[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const now = new Date();
    const day = now.getDay();
    const checkDate = new Date(now);
    const diff = (day === 0 ? -6 : 1) - day;
    checkDate.setDate(now.getDate() + diff);
    checkDate.setHours(0, 0, 0, 0);
    return checkDate;
  });
  const hasInitialLoad = useRef(false);

  const fetchSessions = useCallback(async (showLoading = false) => {
    if (showLoading) {
      setIsRefreshing(true);
    }
    try {
      const endDate = new Date(currentWeekStart);
      endDate.setDate(currentWeekStart.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);

      const data = await getSessions(currentWeekStart, endDate);
      setSessions(data || []);
    } catch (error) {
      console.error("Failed to fetch sessions", error);
    } finally {
      setIsRefreshing(false);
      setIsInitialLoading(false);
    }
  }, [currentWeekStart]);

  useEffect(() => {
    if (user && !hasInitialLoad.current) {
      hasInitialLoad.current = true;
      fetchSessions(false);
    }
  }, [user, fetchSessions]);

  useEffect(() => {
    if (user && hasInitialLoad.current) {
      fetchSessions(false);
    }
  }, [user, currentWeekStart, fetchSessions]);

  const changeWeek = useCallback((direction: -1 | 1) => {
    setCurrentWeekStart((prev) => {
      const newStart = new Date(prev);
      newStart.setDate(prev.getDate() + direction * 7);
      return newStart;
    });
  }, []);

  const weekRangeString = useMemo(() => {
    const end = new Date(currentWeekStart);
    end.setDate(currentWeekStart.getDate() + 6);

    const options: Intl.DateTimeFormatOptions = {
      month: "short",
      day: "numeric",
    };
    return `${currentWeekStart.toLocaleDateString("en-US", options)} – ${end.toLocaleDateString("en-US", options)}`;
  }, [currentWeekStart]);

  const totalSessions = useMemo(
    () => sessions.filter((s) => s.status === "COMPLETED").length,
    [sessions],
  );

  const totalMinutes = useMemo(
    () =>
      sessions.reduce((acc, s) => {
        if (s.status === "COMPLETED") {
          return acc + (s.duration || 0);
        }
        return acc;
      }, 0),
    [sessions],
  );

  return (
    <div className="min-h-screen bg-background text-foreground p-4 font-sans pb-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            History
          </h1>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchSessions(true)}
            disabled={isRefreshing}
            className="text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>

        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => changeWeek(-1)}
            className="text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="w-4 h-4" />
            {weekRangeString}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => changeWeek(1)}
            className="text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-card p-3 text-center">
            <div className="text-xl font-bold text-foreground">
              {totalSessions}
            </div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Sessions
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-3 text-center">
            <div className="text-xl font-bold text-foreground">
              {Math.round(totalMinutes)}
            </div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Minutes
            </div>
          </div>
        </div>

        <section>
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <Clock className="w-3 h-3" />
            Sessions
          </h2>

          <div className="rounded-lg border border-border bg-card px-3">
            {isInitialLoading ? (
              <div className="space-y-3 py-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between animate-pulse">
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 rounded-full bg-zinc-800" />
                      <div className="space-y-2">
                        <div className="h-4 w-32 bg-zinc-800 rounded" />
                        <div className="h-3 w-20 bg-zinc-800/50 rounded" />
                      </div>
                    </div>
                    <div className="h-5 w-10 bg-zinc-800 rounded" />
                  </div>
                ))}
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-muted-foreground text-center py-8 text-sm">
                No sessions this week.
              </div>
            ) : (
              sessions.map((session) => (
                <SessionListItem key={session.id} session={session} />
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
