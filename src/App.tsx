import { useCallback, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { RotateCcw, TimerReset } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CircularDurationInput } from "@/components/features/CircularDurationInput";
import { Timer } from "@/components/features/timer";

const PRESETS = [15, 25, 45, 60];

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> };
};

function formatDuration(minutes: number) {
  return `${minutes.toString().padStart(2, "0")}:00`;
}

function ClockDigits({ value }: { value: string }) {
  return (
    <div
      className="clock-digits flex justify-center"
      aria-label={value}
    >
      {value.split("").map((character, index) => (
        <span
          key={`${index}-${character}`}
          className={character === ":" ? "duration-separator" : "duration-digit"}
          aria-hidden="true"
        >
          {character}
        </span>
      ))}
    </div>
  );
}

export default function App() {
  const [duration, setDuration] = useState(25);
  const [sessionId, setSessionId] = useState(() => `pomodoro-${Date.now()}`);
  const [mode, setMode] = useState<"setup" | "running" | "complete">("setup");

  const sessionTitle = `${duration}-minute Pomodoro`;

  const runActionTransition = useCallback((action: string, update: () => void) => {
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const transitionDocument = document as ViewTransitionDocument;

    if (!transitionDocument.startViewTransition || prefersReducedMotion) {
      update();
      return;
    }

    document.documentElement.dataset.transitionAction = action;

    const transition = transitionDocument.startViewTransition(() => {
      flushSync(update);
    });

    transition.finished.finally(() => {
      delete document.documentElement.dataset.transitionAction;
    });
  }, []);

  const handleDurationChange = useCallback((value: number) => {
    setDuration(Math.max(1, value));
  }, []);

  const startTimer = useCallback(() => {
    runActionTransition("start", () => {
      setSessionId(`pomodoro-${Date.now()}`);
      setMode("running");
    });
  }, [runActionTransition]);

  const resetTimer = useCallback(() => {
    runActionTransition("reset", () => {
      setSessionId(`pomodoro-${Date.now()}`);
      setMode("setup");
    });
  }, [runActionTransition]);

  const completeTimer = useCallback(() => {
    runActionTransition("complete", () => {
      setMode("complete");
    });
  }, [runActionTransition]);

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
              className="h-11 w-11 rounded-full transition-transform duration-300 hover:rotate-[-35deg]"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          ) : null}
        </header>

        <section className="flex flex-1 flex-col items-center justify-center gap-8 py-10">
          {mode === "running" ? (
            <div className="screen-panel w-full max-w-3xl text-center">
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
              <div className="screen-panel flex justify-center lg:justify-end">
                <div
                  className="timer-shell setup-dial relative mx-auto flex aspect-square w-full max-w-[560px] justify-center"
                  style={
                    {
                      viewTransitionName: "focus-timer-container",
                    } as CSSProperties
                  }
                >
                  <CircularDurationInput
                    value={duration}
                    onChange={handleDurationChange}
                    min={1}
                    max={60}
                    size={560}
                    strokeWidth={12}
                    className="w-full h-full"
                    ariaLabel="Pomodoro duration in minutes"
                  >
                    <ClockDigits value={formatDuration(duration)} />
                  </CircularDurationInput>
                </div>
              </div>

              <div className="screen-panel mx-auto flex w-full max-w-sm flex-col gap-5 lg:mx-0">
                {mode === "complete" ? (
                  <div className="complete-banner rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-blue-100">
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
                      className="h-11 px-0 transition-transform duration-200 hover:-translate-y-0.5"
                    >
                      {preset}
                    </Button>
                  ))}
                </div>

                <Button
                  type="button"
                  size="lg"
                  onClick={startTimer}
                  className="h-14 gap-2 text-base font-semibold transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0"
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
