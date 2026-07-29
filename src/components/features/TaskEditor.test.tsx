import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TaskEditor } from "@/components/features/TaskEditor";
import type { Project } from "@/types/task";

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

  it("renders project options as wrapping cards with metadata space", async () => {
    const user = userEvent.setup();
    const longTitle = `Project planning\n${"unbroken".repeat(40)}`;
    const project: Project = {
      id: "project-long",
      title: longTitle,
      description: "",
      createdAt: 1,
      isDone: false,
    };

    render(
      <TaskEditor
        projects={[project]}
        initialProjectId={project.id}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    const projectSelector = screen.getByRole("combobox", { name: "Project" });
    const selectedTitle = within(projectSelector).getByText(
      (_, element) =>
        element?.textContent === longTitle && element.tagName === "SPAN",
    );
    expect(projectSelector).toHaveAttribute(
      "data-selected-project",
      project.id,
    );
    expect(projectSelector).toHaveClass("border", "bg-card", "rounded-2xl");
    expect(selectedTitle.textContent).toBe(longTitle);
    expect(selectedTitle).toHaveClass(
      "whitespace-pre-wrap",
      "[overflow-wrap:anywhere]",
    );

    await user.click(projectSelector);
    expect(
      await screen.findByRole("combobox", { name: "Search projects" }),
    ).toBeInTheDocument();

    const option = await screen.findByRole("option", { name: /Project planning/ });
    const title = within(option).getByText((_, element) =>
      element?.textContent === longTitle && element.tagName === "SPAN",
    );
    expect(option).toHaveAttribute("data-project-option", project.id);
    expect(option).toHaveClass("border", "bg-card", "rounded-2xl");
    expect(title.textContent).toBe(longTitle);
    expect(title).toHaveClass(
      "whitespace-pre-wrap",
      "[overflow-wrap:anywhere]",
    );
    expect(within(option).getByText("Project")).toBeInTheDocument();
  });
});
