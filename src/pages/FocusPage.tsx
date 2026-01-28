import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Play, LayoutGrid, LogIn } from "lucide-react";
import { createSession } from "@/api/focus";
import { Link, useNavigate } from "react-router";
import { Input } from "@/components/ui/input";
import { CircularDurationInput } from "@/components/features/CircularDurationInput";
import { TagSelector } from "@/components/features/TagSelector";
import { useAuth } from "@/hooks/useAuth";

export default function FocusPage() {
  const [duration, setDuration] = useState(25);
  const [sessionName, setSessionName] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleDurationChange = useCallback((val: number) => {
    setDuration(val);
  }, []);

  const handleStartSession = useCallback(async () => {
    const title = sessionName.trim() || "Focus Session";

    try {
      // Create session locally - instant, no loading state needed
      const session = await createSession(title, duration, selectedTags);

      // Navigate immediately with local session data
      navigate(`/focus/${session.id}`, {
        state: { session },
        viewTransition: true,
      });
    } catch (error) {
      console.error("Failed to create session:", error);
    }
  }, [sessionName, duration, selectedTags, navigate]);

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

        {/* Session Name Input */}
        <div className="w-full max-w-md space-y-4 mb-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-400 ml-1">
              Session Name
            </label>
            <Input
              type="text"
              placeholder="Focus Session"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-cyan-500/50 focus:ring-cyan-500/20 h-12"
            />
          </div>
        </div>

        {/* Tag Selector */}
        <div className="w-full max-w-md mb-10">
          <label className="text-sm font-medium text-slate-400 ml-1 block mb-3">
            Tags (optional)
          </label>
          <TagSelector
            selectedTags={selectedTags}
            onTagsChange={setSelectedTags}
          />
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
    </div>
  );
}
