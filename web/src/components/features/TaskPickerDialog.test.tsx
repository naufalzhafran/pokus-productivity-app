import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TaskPickerDialog } from "@/components/features/TaskPickerDialog";

describe("TaskPickerDialog", () => {
  it("creates a task from the empty state and chooses it", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn(); const onCreateTask = vi.fn().mockResolvedValue({ id: "new" });
    render(<TaskPickerDialog open onOpenChange={vi.fn()} tasks={[]} projects={[]} selectedTaskId={null} onSelect={onSelect} onCreateTask={onCreateTask} />);
    expect(screen.getByText("No open tasks yet. Add one below.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("New task"), "Outline the talk");
    await user.click(screen.getByRole("button", { name: "Add task" }));
    expect(onCreateTask).toHaveBeenCalledWith("Outline the talk");
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith("new"));
  });

  it("links a task to a running session without a no-task option", () => {
    render(<TaskPickerDialog open linking onOpenChange={vi.fn()} tasks={[{ id: "t", title: "Draft", isDone: false, createdAt: 1, focusedSeconds: 0, projectId: null }]} projects={[]} selectedTaskId={null} onSelect={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Link a task" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "No task, just focus" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Draft" })).toBeInTheDocument();
  });
});
