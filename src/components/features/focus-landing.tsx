import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Timer, Coffee, Plane, Play, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { createSession } from "@/api/focus";
import { Link, useNavigate } from "react-router-dom";

export function FocusLanding() {
  const [mode, setMode] = useState<"focus" | "short" | "long">("focus");
  const [duration, setDuration] = useState(25);
  const [isCreating, setIsCreating] = useState(false);
  const navigate = useNavigate();

  const getDuration = (m: typeof mode) => {
    switch (m) {
      case "focus":
        return 25;
      case "short":
        return 5;
      case "long":
        return 15;
    }
  };

  const handleModeChange = (newMode: typeof mode) => {
    setMode(newMode);
    setDuration(getDuration(newMode));
  };

  const handleStartSession = async () => {
    setIsCreating(true);
    try {
      const title = mode === "focus" ? "Focus Session" : "Break";
      const session = await createSession(title, duration);
      navigate(`/focus/${session.id}`);
    } catch (error) {
      console.error("Error creating session:", error);
      setIsCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col relative overflow-hidden font-sans">
      {/* Navbar */}
      <nav className="flex justify-between items-center p-6 max-w-5xl mx-auto w-full z-10">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full border-2 border-dashed border-[#06b6d4] p-0.5">
            <div className="w-full h-full bg-[#06b6d4] rounded-full animate-pulse shadow-[0_0_10px_#06b6d4]" />
          </div>
          <span className="font-bold text-lg tracking-tight drop-shadow-md">
            FOCUS KEEPER
          </span>
        </div>
        <div className="flex gap-4">
          <Link to="/dashboard">
            <Button
              variant="ghost"
              className="text-white hover:text-white/80 hover:bg-white/10 flex items-center gap-2"
            >
              <LayoutGrid size={16} />
              Dashboard
            </Button>
          </Link>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 z-10 w-full max-w-2xl mx-auto -mt-20">
        {/* Timer Display */}
        <div className="text-[120px] md:text-[180px] font-semibold leading-none tracking-tight mb-8 font-sans drop-shadow-2xl text-transparent bg-clip-text bg-gradient-to-b from-white to-blue-200">
          {duration.toString().padStart(2, "0")}:00
        </div>

        {/* Mode Selectors */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full mb-12">
          <button
            onClick={() => handleModeChange("focus")}
            className={cn(
              "flex flex-col items-start p-4 rounded-xl transition-all duration-200 border-2 backdrop-blur-sm",
              mode === "focus"
                ? "bg-white/10 border-cyan-400 translate-y-[-4px] shadow-[0_0_20px_rgba(6,182,212,0.3)]"
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
              mode === "short"
                ? "bg-white/10 border-sky-400 translate-y-[-4px] shadow-[0_0_20px_rgba(56,189,248,0.3)]"
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
              mode === "long"
                ? "bg-white/10 border-indigo-400 translate-y-[-4px] shadow-[0_0_20px_rgba(129,140,248,0.3)]"
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
            disabled={isCreating}
            className="h-14 px-8 rounded-full bg-cyan-500 hover:bg-cyan-400 text-slate-900 text-lg font-bold flex items-center gap-2 shadow-[0_0_25px_rgba(6,182,212,0.4)] transition-all hover:scale-105 active:scale-95"
          >
            <div className="w-6 h-6 rounded-full bg-slate-900 flex items-center justify-center">
              <Play
                size={10}
                className="text-cyan-500 ml-0.5"
                fill="currentColor"
              />
            </div>
            {isCreating ? "Creating..." : "Start focus timer"}
          </Button>
        </div>
      </main>

      {/* Water Wave Footer - Layered */}
      <div className="absolute bottom-0 left-0 right-0 h-48 w-full z-0 overflow-hidden">
        {/* Back Wave */}
        <svg
          viewBox="0 0 1440 320"
          className="absolute bottom-0 w-full h-full preserve-3d opacity-30 animate-pulse"
          style={{ animationDuration: "8s" }}
          preserveAspectRatio="none"
        >
          <path
            fill="#0ea5e9"
            fillOpacity="1"
            d="M0,192L48,197.3C96,203,192,213,288,229.3C384,245,480,267,576,250.7C672,235,768,181,864,181.3C960,181,1056,235,1152,234.7C1248,235,1344,181,1392,154.7L1440,128L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320L0,320Z"
          ></path>
        </svg>

        {/* Middle Wave */}
        <svg
          viewBox="0 0 1440 320"
          className="absolute bottom-[-10px] w-full h-full preserve-3d opacity-50"
          preserveAspectRatio="none"
        >
          <path
            fill="#06b6d4"
            fillOpacity="1"
            d="M0,160L48,170.7C96,181,192,203,288,197.3C384,192,480,160,576,144C672,128,768,128,864,144C960,160,1056,192,1152,192C1248,192,1344,160,1392,144L1440,128L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320L0,320Z"
          ></path>
        </svg>

        {/* Front Wave (Filling) */}
        <svg
          viewBox="0 0 1440 320"
          className="absolute bottom-[-20px] w-full h-full preserve-3d opacity-80"
          preserveAspectRatio="none"
        >
          <path
            fill="#22d3ee"
            fillOpacity="1"
            d="M0,224L80,213.3C160,203,320,181,480,181.3C640,181,800,203,960,202.7C1120,203,1280,181,1360,170.7L1440,160L1440,320L1360,320C1280,320,1120,320,960,320C800,320,640,320,480,320C320,320,160,320,80,320L0,320Z"
          ></path>
        </svg>
      </div>
    </div>
  );
}
