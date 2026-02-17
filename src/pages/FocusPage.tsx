import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { LayoutGrid, LogIn } from "lucide-react";
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
      const session = await createSession(title, duration, selectedTags);

      navigate(`/focus/${session.id}`, {
        state: { session },
        viewTransition: true,
      });
    } catch (error) {
      console.error("Failed to create session:", error);
    }
  }, [sessionName, duration, selectedTags, navigate]);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col relative overflow-hidden font-sans">
      {/* Navbar */}
      <nav className="flex justify-between items-center p-4 md:p-6 max-w-5xl mx-auto w-full z-10">
        <span className="font-bold text-lg tracking-tight text-foreground">
          POKUS
        </span>
        <div className="flex gap-4">
          {user ? (
            <Link to="/dashboard">
              <Button
                variant="ghost"
                className="text-muted-foreground hover:text-foreground flex items-center gap-2"
              >
                <LayoutGrid size={16} />
                Dashboard
              </Button>
            </Link>
          ) : (
            <Link to="/login">
              <Button
                variant="ghost"
                className="text-muted-foreground hover:text-foreground flex items-center gap-2"
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
            strokeWidth={6}
            className="w-full h-full"
          >
            <div className="text-[15vw] md:text-[140px] font-semibold leading-none tracking-tight text-center select-none pointer-events-none">
              {duration.toString().padStart(2, "0")}:00
            </div>
          </CircularDurationInput>
        </div>

        {/* Session Name Input */}
        <div className="w-full max-w-md space-y-4 mb-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground ml-1">
              Session Name
            </label>
            <Input
              type="text"
              placeholder="Focus Session"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
            />
          </div>
        </div>

        {/* Tag Selector */}
        <div className="w-full max-w-md mb-10">
          <label className="text-sm font-medium text-muted-foreground ml-1 block mb-3">
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
            size="lg"
            className="h-14 px-8 text-lg font-semibold"
          >
            Start session
          </Button>
        </div>
      </main>
    </div>
  );
}
