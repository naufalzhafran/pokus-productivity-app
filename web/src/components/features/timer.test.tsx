import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  it("offers to save or discard elapsed time without a task", async () => {
    const user = userEvent.setup();
    const onStop = vi.fn();
    render(<Timer {...baseProps} remainingSeconds={1200} onStop={onStop} />);
    await user.click(screen.getByRole("button", { name: "Stop Pomodoro timer" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("You focused for 5m 0s. Save this time");
    expect(within(dialog).getByRole("button", { name: "Discard this focus session" })).toBeEnabled();
    await user.click(within(dialog).getByRole("button", { name: "Save focused time and stop" }));
    expect(onStop).toHaveBeenCalledWith({ saveElapsedTime: true, elapsedSeconds: 300 });
  });

  it("makes Focus again the primary completion action and keeps Mark task done on the timer", () => {
    render(<TimerCompletion durationMinutes={25} taskTitle="Draft" onMarkTaskDone={vi.fn()} onFocusAgain={vi.fn()} onViewTasks={vi.fn()} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual(["Focus again", "Mark task done", "View tasks"]);
    expect(buttons[0]).toHaveClass("bg-primary");
    expect(buttons[1]).not.toHaveClass("bg-primary");
  });
});
