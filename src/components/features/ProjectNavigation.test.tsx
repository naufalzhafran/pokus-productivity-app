import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  DesktopProjectNavigation,
  MobileProjectNavigation,
} from "@/components/features/ProjectNavigation";
import { buildWorkspaceIndex } from "@/lib/workspace";
import type { Project } from "@/types/task";

const longTitle = `Planning\n${"unbroken".repeat(30)}`;
const project: Project = {
  id: "long-project",
  title: longTitle,
  description: "",
  createdAt: 1,
  isDone: false,
};
const index = buildWorkspaceIndex([project], []);

describe("ProjectNavigation", () => {
  it("wraps complete desktop project labels", () => {
    render(
      <DesktopProjectNavigation
        index={index}
        scope="all"
        onScopeChange={vi.fn()}
      />,
    );

    const label = screen
      .getByRole("button", { name: /Planning/ })
      .querySelector("span");
    expect(label?.textContent).toBe(longTitle);
    expect(label).toHaveClass("whitespace-pre-wrap");
    expect(label).toHaveClass("[overflow-wrap:anywhere]");
    expect(label).not.toHaveClass("truncate");
  });

  it("wraps complete labels in the mobile Projects dialog", async () => {
    const user = userEvent.setup();
    render(
      <MobileProjectNavigation
        index={index}
        scope="all"
        onScopeChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Projects" }));
    const dialog = screen.getByRole("dialog");
    const label = within(dialog)
      .getByRole("button", { name: /Planning/ })
      .querySelector("span");
    expect(label?.textContent).toBe(longTitle);
    expect(label).toHaveClass("whitespace-pre-wrap");
    expect(label).toHaveClass("[overflow-wrap:anywhere]");
    expect(label).not.toHaveClass("truncate");
  });
});
