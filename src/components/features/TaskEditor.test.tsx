import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TaskEditor } from "@/components/features/TaskEditor";

describe("TaskEditor", () => {
  it("focuses and describes the first invalid field", () => {
    render(
      <TaskEditor
        projects={[]}
        initialProjectId={null}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    const textbox = screen.getByRole("textbox", { name: "Task" });
    fireEvent.submit(textbox.closest("form")!);

    expect(textbox).toHaveFocus();
    expect(textbox).toHaveAttribute("aria-invalid", "true");
    expect(textbox).toHaveAccessibleDescription(/enter a task/i);
  });
});
