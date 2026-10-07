import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { KnowledgeEditor } from "@/components/features/KnowledgeEditor";
import { emptyKnowledgeInput } from "@/lib/knowledge";
import { bookCapture, knowledgeProjects } from "@/test/knowledge-fixtures";

describe("KnowledgeEditor", () => {
  it("requires a title, then saves the note with its source, location, references, and status", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<KnowledgeEditor initial={emptyKnowledgeInput({ projectId: "reading", sourceIds: ["book"] })} projects={knowledgeProjects} captures={[bookCapture]} categories={[]}
      submitLabel="Save knowledge" onCancel={vi.fn()} onSave={onSave} />);

    await user.click(screen.getByRole("button", { name: "Save knowledge" }));
    expect(screen.getByText("Give this knowledge a title.")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Title"), "Two-minute rule");
    await user.type(screen.getByLabelText("Summary"), "Scale it down.");
    await user.type(screen.getByLabelText("Location in source"), "Ch. 13");
    expect(within(screen.getByRole("group", { name: /Sources/ })).getByRole("checkbox", { name: /Atomic Habits/ })).toBeChecked();
    await user.click(within(screen.getByRole("group", { name: /Also used in/ })).getByRole("checkbox", { name: "Fitness" }));
    await user.click(screen.getByRole("button", { name: "Evergreen" }));
    await user.click(screen.getByRole("button", { name: "Save knowledge" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      title: "Two-minute rule", summary: "Scale it down.", locator: "Ch. 13", projectId: "reading", sourceIds: ["book"], linkedProjectIds: ["fitness"], status: "evergreen",
    })));
  });
});
