import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TaskWorkspace } from "@/components/features/TaskWorkspace";
import type { Project, Task } from "@/types/task";

vi.mock("@/components/features/ProjectNavigation", () => ({
  DesktopProjectNavigation: () => null,
  MobileProjectNavigation: () => null,
}));

describe("TaskWorkspace", () => {
  it("separates selected project details from its task workspace", () => {
    const project: Project = {
      id: "project-1",
      title: "Empty project",
      description: "<p>Project context</p>",
      createdAt: 1,
      isDone: false,
    };

    render(
      <TaskWorkspace
        tasks={[]}
        projects={[project]}
        viewState={{
          scope: `project:${project.id}`,
          status: "open",
          sort: "newest",
          lastDuration: 25,
        }}
        setViewState={vi.fn()}
        canStartPomodoro
        onCreateTask={vi.fn()}
        onCreateProject={vi.fn()}
        onUpdateProject={vi.fn()}
        onDeleteProject={vi.fn()}
        onArchiveProject={vi.fn()}
        onStartPomodoro={vi.fn()}
        onStatusChange={vi.fn()}
        onEditTask={vi.fn()}
        onDeleteTask={vi.fn()}
      />,
    );

    const editButton = screen.getByRole("button", { name: "Edit project" });
    const projectCard = editButton.closest('[data-slot="card"]');
    if (!(projectCard instanceof HTMLElement)) {
      throw new Error("Expected the edit action inside the project card.");
    }
    expect(within(projectCard).getByText(project.title)).toBeInTheDocument();
    expect(
      within(projectCard).getByRole("button", { name: "Show description" }),
    ).toBeInTheDocument();
    expect(
      within(projectCard).queryByPlaceholderText("Search tasks"),
    ).not.toBeInTheDocument();

    const taskSearch = screen.getByPlaceholderText("Search tasks");
    const taskCard = taskSearch.closest('[data-slot="card"]');
    if (!(taskCard instanceof HTMLElement)) {
      throw new Error("Expected the task search inside the task card.");
    }
    expect(within(taskCard).getByText("Tasks")).toBeInTheDocument();
    expect(within(taskCard).queryByText(project.title)).not.toBeInTheDocument();
  });

  it("names repeated task controls and blocks duplicate async operations", async () => {
    const user = userEvent.setup();
    let resolveStatus: (() => void) | undefined;
    const onStatusChange = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveStatus = resolve;
        }),
    );
    const task: Task = {
      id: "task-1",
      title: "Review keyboard navigation",
      isDone: false,
      createdAt: 2,
      focusedSeconds: 0,
      projectId: null,
    };

    render(
      <TaskWorkspace
        tasks={[task]}
        projects={[]}
        viewState={{
          scope: "all",
          status: "open",
          sort: "newest",
          lastDuration: 25,
        }}
        setViewState={vi.fn()}
        canStartPomodoro={false}
        onCreateTask={vi.fn()}
        onCreateProject={vi.fn()}
        onUpdateProject={vi.fn()}
        onDeleteProject={vi.fn()}
        onArchiveProject={vi.fn()}
        onStartPomodoro={vi.fn()}
        onStatusChange={onStatusChange}
        onEditTask={vi.fn()}
        onDeleteTask={vi.fn()}
      />,
    );

    const checkbox = screen.getByRole("checkbox", {
      name: "Mark Review keyboard navigation complete",
    });
    expect(
      screen.getByRole("button", {
        name: "Open details for Review keyboard navigation",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Focus on Review keyboard navigation",
      }),
    ).toHaveAccessibleDescription(/another focus session/i);
    expect(
      screen.getByRole("button", {
        name: "Actions for Review keyboard navigation",
      }),
    ).toBeInTheDocument();

    await user.click(checkbox);
    expect(onStatusChange).toHaveBeenCalledTimes(1);
    expect(checkbox).toHaveAttribute("aria-disabled", "true");
    expect(checkbox.closest("li")).toHaveAttribute("aria-busy", "true");
    await user.click(checkbox);
    expect(onStatusChange).toHaveBeenCalledTimes(1);

    await act(async () => resolveStatus?.());
    expect(checkbox).not.toHaveAttribute("aria-disabled", "true");
  });

  it("politely announces filtered result counts and clears changed filters", async () => {
    const user = userEvent.setup();
    const setViewState = vi.fn();
    const task: Task = {
      id: "task-1",
      title: "Visible task",
      isDone: false,
      createdAt: 2,
      focusedSeconds: 0,
      projectId: null,
    };
    render(
      <TaskWorkspace
        tasks={[task]}
        projects={[]}
        viewState={{
          scope: "all",
          status: "all",
          sort: "alphabetical",
          lastDuration: 25,
        }}
        setViewState={setViewState}
        canStartPomodoro
        onCreateTask={vi.fn()}
        onCreateProject={vi.fn()}
        onUpdateProject={vi.fn()}
        onDeleteProject={vi.fn()}
        onArchiveProject={vi.fn()}
        onStartPomodoro={vi.fn()}
        onStatusChange={vi.fn()}
        onEditTask={vi.fn()}
        onDeleteTask={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("combobox", { name: "Task status" }),
    ).toHaveTextContent("All statuses");
    expect(
      screen.getByRole("combobox", { name: "Sort tasks" }),
    ).toHaveTextContent("A–Z");

    await user.type(screen.getByPlaceholderText("Search tasks and projects"), "missing");
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "0 matching tasks.",
      ),
    );
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Task filters cleared.",
    );
    expect(setViewState).toHaveBeenCalled();
  });
});
