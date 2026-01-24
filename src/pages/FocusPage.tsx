import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Timer, Coffee, Plane, Play, LayoutGrid, LogIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { createSession } from "@/api/focus";
import { Link, useNavigate } from "react-router";
import { Input } from "@/components/ui/input";
import { CircularDurationInput } from "@/components/features/CircularDurationInput";
import { useAuth } from "@/hooks/useAuth";

type FocusMode = "focus" | "short" | "long";

const getDuration = (mode: FocusMode): number => {
  switch (mode) {
    case "focus":
      return 25;
    case "short":
      return 5;
    case "long":
      return 15;
  }
};

export default function FocusPage() {
  const [mode, setMode] = useState<FocusMode>("focus");
  const [duration, setDuration] = useState(25);
  const [sessionName, setSessionName] = useState("");
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleModeChange = useCallback((newMode: FocusMode) => {
    setMode(newMode);
    setDuration(getDuration(newMode));
  }, []);

  const handleDurationChange = useCallback((val: number) => {
    setDuration(val);
    if (val !== 25 && val !== 5 && val !== 15) {
      setMode("focus");
    }
  }, []);

  const handleStartSession = useCallback(async () => {
    let title = sessionName;
    if (!title.trim()) {
      title =
        mode === "focus"
          ? "Focus Session"
          : mode === "short"
            ? "Short Break"
            : "Long Break";
    }

    try {
      // Create session locally - instant, no loading state needed
      const session = await createSession(title, duration);

      // Navigate immediately with local session data
      navigate(`/focus/${session.id}`, {
        state: { session },
        viewTransition: true,
      });
    } catch (error) {
      console.error("Failed to create session:", error);
    }
  }, [sessionName, mode, duration, navigate]);

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col relative overflow-hidden font-sans">
      {/* Navbar */}
      <nav className="flex justify-between items-center p-4 md:p-6 max-w-5xl mx-auto w-full z-10">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full border-2 border-dashed border-[#06b6d4] p-0.5">
            <div className="w-full h-full bg-[#06b6d4] rounded-full" />
          </div>
          <span className="font-bold text-lg tracking-tight">POKUS</span>
        </div>
        <div className="flex gap-4">
          {user ? (
            <Link to="/dashboard">
              <Button
                variant="ghost"
                className="text-white hover:text-white/80 hover:bg-white/10 flex items-center gap-2"
              >
                <LayoutGrid size={16} />
                Dashboard
              </Button>
            </Link>
          ) : (
            <Link to="/login">
              <Button
                variant="ghost"
                className="text-white hover:text-white/80 hover:bg-white/10 flex items-center gap-2"
              >
                <LogIn size={16} />
                Sign in
              </Button>
            </Link>
          )}
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 z-10 w-full max-w-2xl mx-auto min-h-0">
        {/* Timer Display with Circular Slider */}
        <div
          className="mb-8 md:mb-12 relative flex justify-center w-[80vw] max-w-[500px] aspect-square"
          style={
            {
              viewTransitionName: "focus-timer-container",
            } as React.CSSProperties
          }
        >
          <CircularDurationInput
            value={duration}
            onChange={handleDurationChange}
            size={500}
            strokeWidth={15}
            className="w-full h-full"
          >
            <div className="text-[15vw] md:text-[140px] font-semibold leading-none tracking-tight font-sans text-center select-none pointer-events-none">
              {duration.toString().padStart(2, "0")}:00
            </div>
          </CircularDurationInput>
        </div>

        {/* Custom Inputs */}
        <div className="w-full max-w-md space-y-4 mb-8">
          <div className="flex flex-col gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-400 ml-1">
                Session Name
              </label>
              <Input
                type="text"
                placeholder={
                  mode === "focus"
                    ? "Focus Session"
                    : mode === "short"
                      ? "Short Break"
                      : "Long Break"
                }
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-cyan-500/50 focus:ring-cyan-500/20 h-12"
              />
            </div>
          </div>
        </div>

        {/* Mode Selectors */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full mb-12">
          <button
            onClick={() => handleModeChange("focus")}
            className={cn(
              "flex flex-col items-start p-4 rounded-xl transition-all duration-200 border-2 backdrop-blur-sm",
              mode === "focus" && duration === 25
                ? "bg-white/10 border-cyan-400 translate-y-[-4px]"
                : "bg-white/5 border-transparent hover:bg-white/10",
            )}
          >
            <div className="flex items-center gap-2 mb-1 text-cyan-400">
              <Timer size={20} />
              <span className="font-medium">Focus</span>
            </div>
            <div className="text-2xl font-bold">
              25 <span className="text-sm font-normal text-blue-200">min</span>
            </div>
          </button>

          <button
            onClick={() => handleModeChange("short")}
            className={cn(
              "flex flex-col items-start p-4 rounded-xl transition-all duration-200 border-2 backdrop-blur-sm",
              mode === "short" && duration === 5
                ? "bg-white/10 border-sky-400 translate-y-[-4px]"
                : "bg-white/5 border-transparent hover:bg-white/10",
            )}
          >
            <div className="flex items-center gap-2 mb-1 text-sky-400">
              <Coffee size={20} />
              <span className="font-medium">Short Break</span>
            </div>
            <div className="text-2xl font-bold">
              5 <span className="text-sm font-normal text-blue-200">min</span>
            </div>
          </button>

          <button
            onClick={() => handleModeChange("long")}
            className={cn(
              "flex flex-col items-start p-4 rounded-xl transition-all duration-200 border-2 backdrop-blur-sm",
              mode === "long" && duration === 15
                ? "bg-white/10 border-indigo-400 translate-y-[-4px]"
                : "bg-white/5 border-transparent hover:bg-white/10",
            )}
          >
            <div className="flex items-center gap-2 mb-1 text-indigo-400">
              <Plane size={20} />
              <span className="font-medium">Long Break</span>
            </div>
            <div className="text-2xl font-bold">
              15 <span className="text-sm font-normal text-blue-200">min</span>
            </div>
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-4">
          <Button
            onClick={handleStartSession}
            disabled={duration <= 0}
            className="h-14 px-8 rounded-full bg-cyan-500 hover:bg-cyan-400 text-slate-900 text-lg font-bold flex items-center gap-2 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
          >
            <div className="w-6 h-6 rounded-full bg-slate-900 flex items-center justify-center">
              <Play
                size={10}
                className="text-cyan-500 ml-0.5"
                fill="currentColor"
              />
            </div>
            Start session
          </Button>
        </div>
      </main>

      {/* Wave Background Removed */}
    </div>
  );
}
