import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { KnowledgeDetailPage } from "@/components/features/KnowledgeDetailPage";
import { KnowledgeReviewPage } from "@/components/features/KnowledgeReviewPage";
import { bookCapture, knowledgeProjects, knowledgeStore, makeNote } from "@/test/knowledge-fixtures";

describe("KnowledgeDetailPage", () => {
  it("shows the note with its sources and projects, and edits or promotes it", async () => {
    const user = userEvent.setup();
    const note = makeNote({ linkedProjectIds: ["fitness"] });
    const store = knowledgeStore([note]);
    const onEdit = vi.fn();
    render(<KnowledgeDetailPage knowledgeId="loop" readOnly={false} store={store} projects={knowledgeProjects} captures={[bookCapture]} categories={[]} onEdit={onEdit} onDeleted={vi.fn()} />);

    expect(screen.getByRole("heading", { level: 1, name: "Habit loop" })).toHaveFocus();
    expect(screen.getByText("Cue, craving, response, reward.")).toBeInTheDocument();
    expect(await screen.findByText("four steps")).toBeInTheDocument();
    const sources = screen.getByRole("region", { name: /Sources/ });
    expect(within(sources).getByText("Atomic Habits")).toBeInTheDocument();
    expect(within(sources).getByText("Book · James Clear")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Read Atomic Habits" })).toHaveAttribute("href", "#projects/reading");
    expect(screen.getByRole("link", { name: "Fitness" })).toHaveAttribute("href", "#projects/fitness");

    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(onEdit).toHaveBeenCalledWith(note);
    await user.click(screen.getByRole("button", { name: "More actions for Habit loop" }));
    await user.click(await screen.findByRole("menuitem", { name: "Mark as evergreen" }));
    expect(store.setKnowledgeStatus).toHaveBeenCalledWith("loop", "evergreen");
  });

  it("reviews a due note in place", async () => {
    const user = userEvent.setup();
    const store = knowledgeStore([makeNote({ status: "evergreen", nextReviewAt: 1 })]);
    render(<KnowledgeDetailPage knowledgeId="loop" readOnly={false} store={store} projects={knowledgeProjects} captures={[bookCapture]} categories={[]} onEdit={vi.fn()} onDeleted={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Remembered" }));
    expect(store.reviewKnowledge).toHaveBeenCalledWith("loop", true);
  });

  it("explains a missing note", () => {
    render(<KnowledgeDetailPage knowledgeId="gone" readOnly={false} store={knowledgeStore([])} projects={[]} captures={[]} categories={[]} onEdit={vi.fn()} onDeleted={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Knowledge not found" })).toBeInTheDocument();
  });
});

describe("KnowledgeReviewPage", () => {
  it("reviews the longest-waiting note first and shows the full note on request", async () => {
    const user = userEvent.setup();
    const store = knowledgeStore([makeNote({ id: "newer", title: "Newer", status: "evergreen", nextReviewAt: 20 }), makeNote({ status: "evergreen", nextReviewAt: 10 })]);
    render(<KnowledgeReviewPage readOnly={false} store={store} />);
    expect(screen.getByRole("status")).toHaveTextContent("2 notes due");
    expect(screen.getByRole("link", { name: "Habit loop" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show full note" }));
    expect(await screen.findByText("four steps")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Review sooner" }));
    expect(store.reviewKnowledge).toHaveBeenCalledWith("loop", false);
  });

  it("is all caught up when nothing is due", () => {
    render(<KnowledgeReviewPage readOnly={false} store={knowledgeStore([makeNote()])} />);
    expect(screen.getByText("All caught up")).toBeInTheDocument();
  });
});
