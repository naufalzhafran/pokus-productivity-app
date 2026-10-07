import { CheckCircle2, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";

interface SessionTaskProps {
  title: string;
  isComplete?: boolean;
}

export function SessionTask({ title, isComplete = false }: SessionTaskProps) {
  const Icon = isComplete ? CheckCircle2 : CircleDot;

  return (
    <div className="mx-auto flex max-w-xl items-center justify-center gap-3">
      <Icon
        className={cn("shrink-0 text-primary", isComplete ? "size-5" : "size-4")}
        aria-hidden="true"
      />
      <p className="min-w-0 text-lg font-medium md:text-2xl">
        <span className="sr-only">
          {isComplete ? "Completed Pomodoro for task: " : "Current task: "}
        </span>
        <span className="line-clamp-2 whitespace-pre-wrap [overflow-wrap:anywhere]">
          {title}
        </span>
      </p>
    </div>
  );
}
