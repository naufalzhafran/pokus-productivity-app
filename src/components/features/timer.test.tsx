import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Timer } from "@/components/features/timer";
import { TimerCompletion } from "@/components/features/TimerCompletion";

const baseProps = {
  durationMinutes: 25,
  remainingSeconds: 70,
  isActive: true,
  onToggle: vi.fn(),
  onStop: vi.fn(),
  sessionTitle: "Write accessibility tests",
};

describe("Timer", () => {
  it("announces state changes and thresholds without making the clock live", () => {
    const { rerender } = render(<Timer {...baseProps} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Timer started for 25 minutes.",
    );
    expect(screen.getByRole("timer")).not.toHaveAttribute("aria-live");

    rerender(<Timer {...baseProps} isActive={false} />);
    expect(screen.getByRole("status")).toHaveTextContent("Timer paused.");
    rerender(<Timer {...baseProps} isActive />);
    expect(screen.getByRole("status")).toHaveTextContent("Timer resumed.");
    rerender(<Timer {...baseProps} remainingSeconds={60} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "One minute remaining.",
    );
    rerender(<Timer {...baseProps} remainingSeconds={10} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Ten seconds remaining.",
    );
  });

  it("moves focus to the persistent completion heading", () => {
    render(
      <TimerCompletion
        durationMinutes={25}
        onFocusAgain={vi.fn()}
        onViewTasks={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Session complete" }),
    ).toHaveFocus();
  });
});
