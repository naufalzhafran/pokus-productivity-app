import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { KnowledgePage } from "@/components/features/KnowledgePage";
import { bookCapture, knowledgeProjects, knowledgeStore, makeNote } from "@/test/knowledge-fixtures";

const notes = [
  makeNote(),
  makeNote({ id: "rule", title: "Two-minute rule", summary: "Scale a habit down to two minutes.", body: "", status: "evergreen", nextReviewAt: 1, projectId: null, linkedProjectIds: ["fitness"] }),
];

describe("KnowledgePage", () => {
  it("lists knowledge with review count, search, and filters", async () => {
    const user = userEvent.setup();
    render(<KnowledgePage readOnly={false} store={knowledgeStore(notes)} projects={knowledgeProjects} captures={[bookCapture]} categories={[]} onCompose={vi.fn()} />);

    expect(screen.getByRole("heading", { level: 1, name: "Knowledge" })).toHaveFocus();
    expect(screen.getByRole("link", { name: "Review (1)" })).toHaveAttribute("href", "#knowledge/review");
    const list = screen.getByRole("list", { name: "Knowledge notes" });
    expect(within(list).getAllByRole("article")).toHaveLength(2);
    expect(within(list).getByRole("link", { name: "Habit loop" })).toHaveAttribute("href", "#knowledge/loop");
    expect(within(list).getByText("Due for review")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Evergreen" }));
    expect(within(list).getAllByRole("article")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "All" }));

    await user.type(screen.getByRole("searchbox", { name: "Search knowledge" }), "four steps");
    await waitFor(() => expect(within(list).getAllByRole("article")).toHaveLength(1));
    expect(within(list).getByText("Habit loop")).toBeInTheDocument();
  });

  it("starts a new note from the empty state", async () => {
    const user = userEvent.setup();
    const onCompose = vi.fn();
    render(<KnowledgePage readOnly={false} store={knowledgeStore([])} projects={[]} captures={[]} categories={[]} onCompose={onCompose} />);
    expect(screen.getByText("No knowledge yet")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Write knowledge" }));
    expect(onCompose).toHaveBeenCalled();
  });
});
