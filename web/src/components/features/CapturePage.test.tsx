import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CapturePage } from "@/components/features/CapturePage";
import type { CaptureStore } from "@/hooks/useCaptures";
import { knowledgeBySource } from "@/lib/knowledge";
import type { Capture } from "@/types/capture";
import type { Knowledge } from "@/types/knowledge";
import type { Project } from "@/types/task";

const base = { title: "", note: "", preview: null, isProcessed: false, createdAt: 1, updatedAt: 1 };
const captures: Capture[] = [
  { ...base, id: "video", kind: "video", url: "https://youtu.be/dQw4w9WgXcQ", preview: { title: "Deep work talk", author: "Cal" } },
  { ...base, id: "post", kind: "social", url: "https://x.com/naval/status/1", preview: { author: "Naval", description: "How to get rich without getting lucky" } },
  { ...base, id: "sheet", kind: "drive", url: "https://docs.google.com/spreadsheets/d/1/edit", title: "Budget" },
  { ...base, id: "idea", kind: "note", url: null, note: "Newsletter idea\nWrite about focus rituals" },
  { ...base, id: "done", kind: "article", url: "https://example.com/essay", isProcessed: true },
];
const projects: Project[] = [
  { id: "launch", title: "Launch", description: "", createdAt: 1, status: "active", captureIds: ["video"] },
  { id: "blog", title: "Blog", description: "", createdAt: 2, status: "active", captureIds: [] },
];
vi.mock("@/lib/link-preview", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/link-preview")>()),
  fetchLinkPreview: vi.fn(async () => ({ title: "An essay worth reading", siteName: "Example", description: "On doing great work." })),
}));

function store(overrides: Partial<CaptureStore> = {}): CaptureStore {
  return { captures, previewing: new Set(), isLoading: false, loadError: null, createCapture: vi.fn(async () => captures[0]), updateCapture: vi.fn(), refreshPreview: vi.fn(), setCaptureProcessed: vi.fn(async () => captures[0]), deleteCapture: vi.fn(), ...overrides } as CaptureStore;
}

describe("CapturePage", () => {
  it("previews a pasted link before capturing it with its metadata", async () => {
    const user = userEvent.setup();
    const captureStore = store();
    render(<CapturePage store={captureStore} projects={projects} onOrganize={vi.fn()} />);

    await user.type(screen.getByLabelText("Link or thought to capture"), "https://example.com/essay");
    const preview = screen.getByRole("region", { name: "Link preview" });
    await waitFor(() => expect(within(preview).getByRole("link", { name: /An essay worth reading/ })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Capture" }));

    expect(captureStore.createCapture).toHaveBeenCalledWith({
      kind: "article", url: "https://example.com/essay", title: "", note: "",
      preview: { title: "An essay worth reading", siteName: "Example", description: "On doing great work." },
    });
  });

  it("renders type-specific cards with project chips, filters, and marks captures processed", async () => {
    const user = userEvent.setup();
    const captureStore = store();
    render(<CapturePage store={captureStore} projects={projects} onOrganize={vi.fn()} />);

    const inbox = screen.getByRole("list", { name: "Inbox captures" });
    expect(within(inbox).getAllByRole("article")).toHaveLength(3);
    expect(within(inbox).getByText("How to get rich without getting lucky")).toBeInTheDocument();
    expect(within(inbox).getByText("Google Sheets")).toBeInTheDocument();
    expect(within(inbox).getByText("Write about focus rituals")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "In progress" }));
    const inProgress = screen.getByRole("list", { name: "Captures in progress" });
    expect(within(inProgress).getByRole("link", { name: "Launch" })).toHaveAttribute("href", "#projects/launch");
    await user.click(within(inProgress).getByRole("button", { name: "Play Deep work talk" }));
    expect(within(inProgress).getByTitle("Deep work talk")).toHaveAttribute("src", expect.stringContaining("youtube-nocookie.com/embed/dQw4w9WgXcQ"));

    await user.click(screen.getByRole("button", { name: /^Inbox/ }));
    await user.click(screen.getByRole("button", { name: "Notes" }));
    expect(within(screen.getByRole("list", { name: "Inbox captures" })).getAllByRole("article")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Mark Newsletter idea as processed" }));
    expect(captureStore.setCaptureProcessed).toHaveBeenCalledWith("idea", true);

    await user.click(screen.getByRole("button", { name: "Processed" }));
    await user.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getByRole("link", { name: /^example\.com\/essay/ })).toBeInTheDocument();
  });

  it("keeps distilled captures in progress, lists their knowledge, and distills from the menu", async () => {
    const user = userEvent.setup();
    const onDistill = vi.fn();
    const note: Knowledge = { id: "note1", title: "Focus rituals compound", summary: "", body: "", projectId: null, linkedProjectIds: [], sourceIds: ["idea"], locator: "Intro", categoryId: null, status: "draft", reviewStep: 0, nextReviewAt: null, createdAt: 1, updatedAt: 1 };
    render(<CapturePage store={store()} projects={projects} onOrganize={vi.fn()} knowledgeBySource={knowledgeBySource([note])} onDistill={onDistill} />);

    expect(within(screen.getByRole("list", { name: "Inbox captures" })).queryByText("Write about focus rituals")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "In progress" }));
    await user.click(screen.getByRole("button", { name: /1 note distilled from Newsletter idea/ }));
    const dialog = await screen.findByRole("dialog", { name: "Knowledge from this source" });
    expect(within(dialog).getByRole("link", { name: /Focus rituals compound/ })).toHaveAttribute("href", "#knowledge/note1");
    await user.click(within(dialog).getByRole("button", { name: "Add knowledge" }));
    expect(onDistill).toHaveBeenCalledWith(expect.objectContaining({ id: "idea" }));
  });

  it("adds a capture to projects from its menu", async () => {
    const user = userEvent.setup();
    const onOrganize = vi.fn().mockResolvedValue(undefined);
    render(<CapturePage store={store()} projects={projects} onOrganize={onOrganize} />);

    await user.click(screen.getByRole("button", { name: "Actions for Newsletter idea" }));
    await user.click(await screen.findByRole("menuitem", { name: "Add to projects…" }));
    const dialog = await screen.findByRole("dialog", { name: "Add to projects" });
    await user.click(within(dialog).getByRole("checkbox", { name: "Blog" }));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onOrganize).toHaveBeenCalledWith("idea", ["blog"], true));
  });
});
