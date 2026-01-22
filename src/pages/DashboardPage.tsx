import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { logout } from "@/api/auth";
import { getSessions } from "@/api/focus";
import { useEffect, useState } from "react";
import {
  Calendar,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  XCircle,
} from "lucide-react";
export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const now = new Date();
    const day = now.getDay(); // 0 is Sunday
    const checkDate = new Date(now);
    // Set to previous Monday (or keep today if Monday)
    // Adjust 0 (Sunday) to 7 for simpler math if treating Monday as start
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

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const changeWeek = (direction: -1 | 1) => {
    const newStart = new Date(currentWeekStart);
    newStart.setDate(currentWeekStart.getDate() + direction * 7);
    setCurrentWeekStart(newStart);
  };

  const getWeekRangeString = () => {
    const end = new Date(currentWeekStart);
    end.setDate(currentWeekStart.getDate() + 6);

    const options: Intl.DateTimeFormatOptions = {
      month: "short",
      day: "numeric",
    };
    return `${currentWeekStart.toLocaleDateString("en-US", options)} - ${end.toLocaleDateString("en-US", options)}`;
  };

  // Stats
  const totalSessions = sessions.filter((s) => s.status === "COMPLETED").length;
  const totalMinutes = sessions.reduce((acc, s) => {
    if (s.status === "COMPLETED") {
      return acc + (s.duration_actual || s.duration_planned || 0);
    }
    return acc;
  }, 0);

  return (
    <div className="min-h-screen bg-[#0f172a] text-white p-4 md:p-8 font-sans pb-24">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center bg-[#1e293b] p-6 rounded-2xl shadow-lg border border-[#334155] gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
              Dashboard
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Welcome back, {user?.email}
            </p>
          </div>
          <div className="flex gap-3 w-full md:w-auto">
            <Link to="/focus" className="flex-1 md:flex-none">
              <Button className="w-full bg-[#06b6d4] hover:bg-[#0891b2] text-slate-900 font-bold transition-all shadow-[0_0_15px_rgba(6,182,212,0.3)] hover:shadow-[0_0_25px_rgba(6,182,212,0.5)]">
                Start Session
              </Button>
            </Link>
            <Button
              onClick={handleLogout}
              variant="ghost"
              className="text-slate-400 hover:text-white hover:bg-white/10"
            >
              Log Out
            </Button>
          </div>
        </header>

        {/* Weekly Stats & Navigation */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-3 bg-[#1e293b] rounded-2xl p-4 border border-[#334155] flex items-center justify-between shadow-md">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => changeWeek(-1)}
              className="text-slate-400 hover:text-white hover:bg-white/5"
            >
              <ChevronLeft className="w-6 h-6" />
            </Button>
            <div className="flex items-center gap-2 text-slate-200 font-medium bg-[#0f172a] px-4 py-2 rounded-lg border border-[#334155]">
              <Calendar className="w-4 h-4 text-[#06b6d4]" />
              {getWeekRangeString()}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => changeWeek(1)}
              className="text-slate-400 hover:text-white hover:bg-white/5"
            >
              <ChevronRight className="w-6 h-6" />
            </Button>
          </div>

          <div className="bg-[#1e293b] p-6 rounded-2xl border border-[#334155] shadow-md flex flex-col items-center justify-center gap-1 group hover:border-[#06b6d4]/50 transition-colors">
            <span className="text-slate-400 text-sm font-medium uppercase tracking-wider">
              Completed Sessions
            </span>
            <span className="text-4xl font-bold text-white group-hover:text-[#06b6d4] transition-colors">
              {totalSessions}
            </span>
          </div>

          <div className="bg-[#1e293b] p-6 rounded-2xl border border-[#334155] shadow-md flex flex-col items-center justify-center gap-1 group hover:border-[#06b6d4]/50 transition-colors md:col-span-2">
            <span className="text-slate-400 text-sm font-medium uppercase tracking-wider">
              Total Focus Time
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold text-white group-hover:text-[#06b6d4] transition-colors">
                {Math.round(totalMinutes)}
              </span>
              <span className="text-slate-500">minutes</span>
            </div>
          </div>
        </div>

        {/* Session History List */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-slate-200 flex items-center gap-2 px-1">
            <Clock className="w-5 h-5 text-[#06b6d4]" />
            Session History
          </h2>

          <div className="space-y-3">
            {loading ? (
              <div className="text-slate-500 text-center py-12 bg-[#1e293b] rounded-2xl border border-[#334155]">
                Loading history...
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-slate-500 text-center py-12 bg-[#1e293b] rounded-2xl border border-[#334155] flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center">
                  <Clock className="w-6 h-6 text-slate-600" />
                </div>
                <p>No sessions recorded for this week.</p>
              </div>
            ) : (
              sessions.map((session) => (
                <div
                  key={session.id}
                  className="bg-[#1e293b] hover:bg-[#283548] p-4 rounded-xl border border-[#334155] flex items-center justify-between group transition-all"
                >
                  <div className="flex items-start gap-4">
                    {session.status === "COMPLETED" ? (
                      <div className="mt-1">
                        <CheckCircle className="w-5 h-5 text-emerald-500" />
                      </div>
                    ) : session.status === "ABANDONED" ? (
                      <div className="mt-1">
                        <XCircle className="w-5 h-5 text-rose-500" />
                      </div>
                    ) : (
                      <div className="mt-1">
                        <div className="w-5 h-5 rounded-full border-2 border-slate-500 border-t-transparent animate-spin" />
                      </div>
                    )}
                    <div>
                      <h3 className="font-medium text-slate-200 group-hover:text-white transition-colors">
                        {session.title || "Untitled Session"}
                      </h3>
                      <p className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                        <span>
                          {new Date(session.created_at).toLocaleDateString(
                            undefined,
                            {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                            },
                          )}
                        </span>
                        <span>•</span>
                        <span>
                          {new Date(session.created_at).toLocaleTimeString(
                            undefined,
                            { hour: "2-digit", minute: "2-digit" },
                          )}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span
                      className={`text-lg font-bold ${session.status === "COMPLETED" ? "text-[#06b6d4]" : "text-slate-500"}`}
                    >
                      {session.duration_actual || session.duration_planned}
                      <span className="text-xs ml-1 font-normal opacity-70">
                        min
                      </span>
                    </span>
                    <p className="text-[10px] uppercase font-bold tracking-wider text-slate-600 mt-1">
                      {session.status}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
