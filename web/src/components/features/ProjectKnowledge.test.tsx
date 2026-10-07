import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProjectKnowledge } from "@/components/features/ProjectKnowledge";
import { knowledgeProjects, knowledgeStore, makeNote } from "@/test/knowledge-fixtures";

const [reading, fitness] = knowledgeProjects;

describe("ProjectKnowledge", () => {
  it("separates knowledge created here from references, and links or unlinks existing notes", async () => {
    const user = userEvent.setup();
    const store = knowledgeStore([
      makeNote(),
      makeNote({ id: "env", title: "Environment design", projectId: "reading", linkedProjectIds: ["fitness"] }),
      makeNote({ id: "rule", title: "Two-minute rule", projectId: "reading" }),
    ]);
    const onCompose = vi.fn();
    render(<ProjectKnowledge project={fitness} store={store} projects={knowledgeProjects} readOnly={false} onCompose={onCompose} />);

    expect(screen.getByText("Nothing learned here yet")).toBeInTheDocument();
    const references = screen.getByRole("list", { name: "Referenced knowledge" });
    expect(within(references).getByText("Environment design")).toBeInTheDocument();
    expect(within(references).getByText("Read Atomic Habits")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Unlink Environment design from Fitness" }));
    expect(store.setKnowledgeLinked).toHaveBeenCalledWith("env", "fitness", false);

    await user.click(screen.getByRole("button", { name: "Link existing" }));
    const dialog = await screen.findByRole("dialog", { name: "Link knowledge" });
    await user.click(within(dialog).getByRole("checkbox", { name: /Two-minute rule/ }));
    await user.click(within(dialog).getByRole("button", { name: "Link 1" }));
    await waitFor(() => expect(store.setKnowledgeLinked).toHaveBeenCalledWith("rule", "fitness", true));

    await user.click(screen.getByRole("button", { name: "New knowledge" }));
    expect(onCompose).toHaveBeenCalled();
  });

  it("shows notes created in the project", () => {
    render(<ProjectKnowledge project={reading} store={knowledgeStore([makeNote()])} projects={knowledgeProjects} readOnly={false} onCompose={vi.fn()} />);
    expect(within(screen.getByRole("list", { name: "Knowledge created here" })).getByText("Habit loop")).toBeInTheDocument();
  });
});
