import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CircularDurationInput } from "@/components/features/CircularDurationInput";

function DurationHarness() {
  const [value, setValue] = useState(25);
  return (
    <CircularDurationInput
      value={value}
      onChange={setValue}
      min={1}
      max={60}
      size={300}
      strokeWidth={10}
      ariaLabel="Pomodoro duration"
      ariaValueText={`${value} minutes`}
    />
  );
}

describe("CircularDurationInput", () => {
  it("supports the full slider keyboard model and human-readable values", async () => {
    const user = userEvent.setup();
    render(<DurationHarness />);
    const slider = screen.getByRole("slider", { name: "Pomodoro duration" });

    expect(slider).toHaveAttribute("aria-valuetext", "25 minutes");
    slider.focus();
    await user.keyboard("{ArrowRight}{PageUp}");
    expect(slider).toHaveAttribute("aria-valuenow", "31");
    await user.keyboard("{Home}");
    expect(slider).toHaveAttribute("aria-valuenow", "1");
    await user.keyboard("{End}{ArrowLeft}{PageDown}");
    expect(slider).toHaveAttribute("aria-valuenow", "54");
  });
});
