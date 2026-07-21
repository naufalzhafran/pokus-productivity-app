import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/features/AppShell";

describe("AppShell", () => {
  it("uses links for primary navigation and focuses the page heading", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(
      <AppShell page="profile" session={null} onNavigate={onNavigate}>
        <p>Profile content</p>
      </AppShell>,
    );

    const profileLinks = screen.getAllByRole("link", { name: "Profile" });
    expect(profileLinks[0]).toHaveAttribute("href", "#profile");
    expect(profileLinks[0]).toHaveAttribute("aria-current", "page");
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Profile" })).toHaveFocus(),
    );

    await user.click(screen.getAllByRole("link", { name: "Tasks" })[0]);
    expect(onNavigate).toHaveBeenCalledWith("tasks");
  });
});
