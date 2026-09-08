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
  it("hides empty lifecycle groups and lets users recover from an empty search", async () => {
    const user = userEvent.setup();
    render(<DesktopProjectNavigation index={index} scope="all" onScopeChange={vi.fn()} />);
    expect(screen.queryByText("Planned")).not.toBeInTheDocument();
    await user.type(screen.getByRole("searchbox", { name: "Search projects" }), "missing");
    expect(screen.getByText("No matching projects")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByRole("button", { name: /Planning/ })).toBeInTheDocument();
  });

  it("shows only the archived project count and opens the archive scope", async () => {
    const user = userEvent.setup();
    const onScopeChange = vi.fn();
    const archived = { ...project, id: "archived", title: "Old launch", isArchived: true };
    render(<DesktopProjectNavigation index={buildWorkspaceIndex([project, archived], [])} scope="all" onScopeChange={onScopeChange} />);
    expect(screen.queryByRole("button", { name: /Old launch/ })).not.toBeInTheDocument();
    const archiveButton = screen.getByRole("button", { name: /Archived projects/ });
    expect(within(archiveButton).getByText("1")).toBeInTheDocument();
    await user.click(archiveButton);
    expect(onScopeChange).toHaveBeenCalledWith("archived");
  });

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
