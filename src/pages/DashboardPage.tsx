import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { logout } from "@/api/auth";
import { useNavigate } from "react-router-dom";

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-white p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center bg-[#1e293b] p-6 rounded-xl shadow-lg border border-[#334155] gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
              Dashboard
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Welcome back, {user?.email}
            </p>
          </div>
          <div className="flex gap-4 w-full md:w-auto">
            <Link to="/focus">
              <Button className="bg-[#06b6d4] hover:bg-[#0891b2] text-slate-900 font-bold shadow-[0_0_15px_rgba(6,182,212,0.3)]">
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

        <main className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-slate-200 flex items-center gap-2">
              <span className="w-2 h-6 bg-[#06b6d4] rounded-full shadow-[0_0_10px_#06b6d4]"></span>
              Analytics
            </h2>
            <div className="bg-[#1e293b] rounded-xl p-8 min-h-[300px] border border-[#334155] shadow-md flex items-center justify-center">
              <p className="text-slate-500 font-medium">
                No session data available yet.
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-slate-200 flex items-center gap-2">
              <span className="w-2 h-6 bg-[#6b9dff] rounded-full shadow-[0_0_10px_#6b9dff]"></span>
              Settings
            </h2>
            <div className="bg-[#1e293b] rounded-xl p-8 min-h-[300px] border border-[#334155] shadow-md flex items-center justify-center">
              <p className="text-slate-500 font-medium">
                Settings are currently locked.
              </p>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
