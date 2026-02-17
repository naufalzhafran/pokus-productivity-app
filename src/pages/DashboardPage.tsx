import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { logout } from "@/api/auth";
import { getSessions } from "@/api/focus";
import { useEffect, useState, useCallback, useMemo, memo } from "react";
import { LocalSession } from "@/lib/sync";
import { TagDisplay } from "@/components/features/TagSelector";
import {
  Calendar,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  XCircle,
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
          {session.duration_actual || session.duration_planned}
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
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<LocalSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const now = new Date();
    const day = now.getDay();
    const checkDate = new Date(now);
    const diff = (day === 0 ? -6 : 1) - day;
    checkDate.setDate(now.getDate() + diff);
    checkDate.setHours(0, 0, 0, 0);
    return checkDate;
  });

  useEffect(() => {
    const fetchSessions = async () => {
      setLoading(true);
      try {
        const endDate = new Date(currentWeekStart);
        endDate.setDate(currentWeekStart.getDate() + 6);
        endDate.setHours(23, 59, 59, 999);

        const data = await getSessions(currentWeekStart, endDate);
        setSessions(data || []);
      } catch (error) {
        console.error("Failed to fetch sessions", error);
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      fetchSessions();
    }
  }, [user, currentWeekStart]);

  const handleLogout = useCallback(async () => {
    try {
      await logout();
      navigate("/");
    } catch (error) {
      console.error("Logout error:", error);
    }
  }, [navigate]);

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
          return acc + (s.duration_actual || s.duration_planned || 0);
        }
        return acc;
      }, 0),
    [sessions],
  );

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8 font-sans pb-24">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Dashboard
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {user?.email}
            </p>
          </div>
          <div className="flex gap-3 w-full md:w-auto">
            <Link to="/focus" className="flex-1 md:flex-none">
              <Button className="w-full">
                Start Session
              </Button>
            </Link>
            <Button
              onClick={handleLogout}
              variant="ghost"
              className="text-muted-foreground hover:text-foreground"
            >
              Log Out
            </Button>
          </div>
        </header>

        {/* Week Navigation + Stats inline */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => changeWeek(-1)}
            className="text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="w-4 h-4" />
              {weekRangeString}
            </div>
            <div className="text-sm text-muted-foreground">
              <span className="text-foreground font-semibold">{totalSessions}</span> sessions
            </div>
            <div className="text-sm text-muted-foreground">
              <span className="text-foreground font-semibold">{Math.round(totalMinutes)}</span> min
            </div>
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

        {/* Session History List */}
        <section>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            History
          </h2>

          <div className="rounded-lg border border-border bg-card px-4">
            {loading ? (
              <div className="text-muted-foreground text-center py-12 text-sm">
                Loading...
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-muted-foreground text-center py-12 text-sm">
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
