import { useCallback, useState } from "react";
import { RotateCcw, TimerReset } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CircularDurationInput } from "@/components/features/CircularDurationInput";
import { Timer } from "@/components/features/timer";

const PRESETS = [15, 25, 45, 60];

function formatDuration(minutes: number) {
  return `${minutes.toString().padStart(2, "0")}:00`;
}

export default function App() {
  const [duration, setDuration] = useState(25);
  const [sessionId, setSessionId] = useState(() => `pomodoro-${Date.now()}`);
  const [mode, setMode] = useState<"setup" | "running" | "complete">("setup");

  const sessionTitle = `${duration}-minute Pomodoro`;

  const handleDurationChange = useCallback((value: number) => {
    setDuration(Math.max(1, value));
  }, []);

  const startTimer = useCallback(() => {
    setSessionId(`pomodoro-${Date.now()}`);
    setMode("running");
  }, []);

  const resetTimer = useCallback(() => {
    setSessionId(`pomodoro-${Date.now()}`);
    setMode("setup");
  }, []);

  const completeTimer = useCallback(() => {
    setMode("complete");
  }, []);

  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-6 md:px-10 md:py-8">
        <div className="pointer-events-none absolute inset-x-6 top-6 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-primary">
              Pokus
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal md:text-3xl">
              Pomodoro Timer
            </h1>
          </div>
          {mode !== "setup" ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Reset timer"
              onClick={resetTimer}
              className="h-11 w-11 rounded-full"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          ) : null}
        </header>

        <section className="flex flex-1 flex-col items-center justify-center gap-8 py-10">
          {mode === "running" ? (
            <div className="w-full max-w-3xl text-center">
              <div className="mb-8">
                <p className="text-sm uppercase text-muted-foreground">
                  Focus session
                </p>
                <h2 className="mt-3 text-3xl font-semibold md:text-5xl">
                  {sessionTitle}
                </h2>
              </div>
              <Timer
                key={sessionId}
                initialDurationMinutes={duration}
                sessionId={sessionId}
                sessionTitle={sessionTitle}
                onStop={resetTimer}
                onComplete={completeTimer}
              />
            </div>
          ) : (
            <div className="grid w-full items-center gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="flex justify-center lg:justify-end">
                <div className="relative w-[min(78vw,430px)]">
                  <CircularDurationInput
                    value={duration}
                    onChange={handleDurationChange}
                    max={60}
                    size={430}
                    strokeWidth={8}
                    className="w-full"
                  >
                    <div className="text-center">
                      <div className="font-mono text-6xl font-semibold leading-none tracking-normal text-foreground md:text-7xl">
                        {formatDuration(duration)}
                      </div>
                      <div className="mt-4 text-xs font-semibold uppercase text-muted-foreground">
                        minutes
                      </div>
                    </div>
                  </CircularDurationInput>
                </div>
              </div>

              <div className="mx-auto flex w-full max-w-sm flex-col gap-5 lg:mx-0">
                {mode === "complete" ? (
                  <div className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-blue-100">
                    Session complete. Reset or start another Pomodoro.
                  </div>
                ) : null}

                <div className="grid grid-cols-4 gap-2">
                  {PRESETS.map((preset) => (
                    <Button
                      key={preset}
                      type="button"
                      variant={duration === preset ? "default" : "outline"}
                      onClick={() => setDuration(preset)}
                      className="h-11 px-0"
                    >
                      {preset}
                    </Button>
                  ))}
                </div>

                <Button
                  type="button"
                  size="lg"
                  disabled={duration <= 0}
                  onClick={startTimer}
                  className="h-14 gap-2 text-base font-semibold"
                >
                  <TimerReset className="h-5 w-5" />
                  Start Pomodoro
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
