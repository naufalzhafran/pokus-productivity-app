import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProjectCaptures } from "@/components/features/ProjectCaptures";
import type { CaptureStore } from "@/hooks/useCaptures";
import type { Capture } from "@/types/capture";
import type { Project } from "@/types/task";

const base = { title: "", url: null, preview: null, isProcessed: false, createdAt: 1, updatedAt: 1, kind: "note" as const };
const captures: Capture[] = [
  { ...base, id: "first", note: "First added" },
  { ...base, id: "second", note: "Second added", isProcessed: true },
  { ...base, id: "loose", note: "Inbox thought" },
];
const project: Project = { id: "launch", title: "Launch", description: "", createdAt: 1, status: "active", captureIds: ["first", "second", "deleted"] };
const other: Project = { id: "blog", title: "Blog", description: "", createdAt: 2, status: "active", captureIds: ["first"] };
const store = { captures, previewing: new Set(), isLoading: false, loadError: null, createCapture: vi.fn(), updateCapture: vi.fn(), refreshPreview: vi.fn(), setCaptureProcessed: vi.fn(), deleteCapture: vi.fn() } as unknown as CaptureStore;

function renderCaptures(overrides: Partial<Parameters<typeof ProjectCaptures>[0]> = {}) {
  const props = { project, store, projects: [project, other], readOnly: false, onOrganize: vi.fn(), onAddCaptures: vi.fn().mockResolvedValue(undefined), onRemoveCapture: vi.fn().mockResolvedValue(undefined), onCaptureToProject: vi.fn().mockResolvedValue(undefined), ...overrides };
  render(<ProjectCaptures {...props} />);
  return props;
}

describe("ProjectCaptures", () => {
  it("lists the project's existing captures, newest additions first, with other projects as chips", () => {
    renderCaptures();
    const list = screen.getByRole("list", { name: "Launch captures" });
    expect(within(list).getAllByRole("article").map((card) => card.getAttribute("aria-label"))).toEqual(["Second added", "First added"]);
    expect(within(list).getByRole("link", { name: "Blog" })).toBeInTheDocument();
    expect(within(list).queryByRole("link", { name: "Launch" })).not.toBeInTheDocument();
  });

  it("captures straight into the project", async () => {
    const user = userEvent.setup();
    const props = renderCaptures();
    await user.type(screen.getByLabelText("Link or thought to capture"), "Idea for launch");
    await user.click(screen.getByRole("button", { name: "Capture" }));
    expect(props.onCaptureToProject).toHaveBeenCalledWith("launch", expect.objectContaining({ kind: "note", note: "Idea for launch" }));
  });

  it("adds existing captures and removes one from the project", async () => {
    const user = userEvent.setup();
    const props = renderCaptures();
    await user.click(screen.getByRole("button", { name: "Add existing captures" }));
    const dialog = await screen.findByRole("dialog", { name: "Add captures" });
    expect(within(dialog).queryByText("First added")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("checkbox", { name: /Inbox thought/ }));
    await user.click(within(dialog).getByRole("button", { name: "Add 1 capture" }));
    await waitFor(() => expect(props.onAddCaptures).toHaveBeenCalledWith("launch", ["loose"], true));

    await user.click(screen.getByRole("button", { name: "Actions for First added" }));
    await user.click(await screen.findByRole("menuitem", { name: "Remove from project" }));
    await waitFor(() => expect(props.onRemoveCapture).toHaveBeenCalledWith("launch", "first"));
  });
});
