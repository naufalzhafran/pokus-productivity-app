import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CapturePage } from "@/components/features/CapturePage";
import type { Capture } from "@/types/capture";

const base = { title: "", note: "", preview: null, isProcessed: false, createdAt: 1, updatedAt: 1 };
const captures: Capture[] = [
  { ...base, id: "video", kind: "video", url: "https://youtu.be/dQw4w9WgXcQ", preview: { title: "Deep work talk", author: "Cal" } },
  { ...base, id: "post", kind: "social", url: "https://x.com/naval/status/1", preview: { author: "Naval", description: "How to get rich without getting lucky" } },
  { ...base, id: "sheet", kind: "drive", url: "https://docs.google.com/spreadsheets/d/1/edit", title: "Budget" },
  { ...base, id: "idea", kind: "note", url: null, note: "Newsletter idea\nWrite about focus rituals" },
  { ...base, id: "done", kind: "article", url: "https://example.com/essay", isProcessed: true },
];
const createCapture = vi.fn(async () => captures[0]);
const setCaptureProcessed = vi.fn(async () => captures[0]);
vi.mock("@/hooks/useCaptures", () => ({
  useCaptures: () => ({ captures, previewing: new Set(), isLoading: false, loadError: null, createCapture, updateCapture: vi.fn(), refreshPreview: vi.fn(), setCaptureProcessed, deleteCapture: vi.fn() }),
}));
vi.mock("@/lib/link-preview", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/link-preview")>()),
  fetchLinkPreview: vi.fn(async () => ({ title: "An essay worth reading", siteName: "Example", description: "On doing great work." })),
}));

describe("CapturePage", () => {
  it("previews a pasted link before capturing it with its metadata", async () => {
    const user = userEvent.setup();
    render(<CapturePage />);

    await user.type(screen.getByLabelText("Link or thought to capture"), "https://example.com/essay");
    const preview = screen.getByRole("region", { name: "Link preview" });
    await waitFor(() => expect(within(preview).getByRole("link", { name: /An essay worth reading/ })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Capture" }));

    expect(createCapture).toHaveBeenCalledWith({
      kind: "article", url: "https://example.com/essay", title: "", note: "",
      preview: { title: "An essay worth reading", siteName: "Example", description: "On doing great work." },
    });
  });

  it("renders type-specific cards, filters by type, and marks captures processed", async () => {
    const user = userEvent.setup();
    render(<CapturePage />);

    const inbox = screen.getByRole("list", { name: "Inbox captures" });
    expect(within(inbox).getAllByRole("listitem")).toHaveLength(4);
    expect(within(inbox).getByRole("button", { name: "Play Deep work talk" })).toBeInTheDocument();
    expect(within(inbox).getByText("How to get rich without getting lucky")).toBeInTheDocument();
    expect(within(inbox).getByText("Google Sheets")).toBeInTheDocument();
    expect(within(inbox).getByText("Write about focus rituals")).toBeInTheDocument();

    await user.click(within(inbox).getByRole("button", { name: "Play Deep work talk" }));
    expect(within(inbox).getByTitle("Deep work talk")).toHaveAttribute("src", expect.stringContaining("youtube-nocookie.com/embed/dQw4w9WgXcQ"));

    await user.click(screen.getByRole("button", { name: "Notes" }));
    expect(within(inbox).getAllByRole("listitem")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Mark Newsletter idea as processed" }));
    expect(setCaptureProcessed).toHaveBeenCalledWith("idea", true);

    await user.click(screen.getByRole("button", { name: "Processed" }));
    await user.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getByRole("link", { name: /^example\.com\/essay/ })).toBeInTheDocument();
  });
});
