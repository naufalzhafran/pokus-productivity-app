import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { TaskWorkspace } from "@/components/features/TaskWorkspace";
import { createDefaultWorkspaceState } from "@/lib/workspace";
import type { Category, Project, Task } from "@/types/task";

vi.mock("@/components/features/ProjectNavigation", () => ({ DesktopProjectNavigation: () => null, MobileProjectNavigation: () => null }));
const project: Project = { id: "project", title: "Launch", description: "", createdAt: 1, status: "active", isArchived: false, dueDate: "2026-07-29" };
const category: Category = { id: "category", name: "Writing", color: "violet", createdAt: 1, updatedAt: 1 };
const task: Task = { id: "task", title: "Review release notes", description: "<p>Check every link</p>", priority: "high", categoryId: category.id, projectId: project.id, isDone: false, createdAt: 2, focusedSeconds: 120 };

function Workspace(overrides: Partial<ComponentProps<typeof TaskWorkspace>> = {}) {
  const [state, setState] = useState(createDefaultWorkspaceState());
  return <TaskWorkspace tasks={[task]} projects={[project]} categories={[category]} viewState={state} setViewState={setState} canStartPomodoro onCreateTask={vi.fn()} onCreateProject={vi.fn()} onUpdateProject={vi.fn()} onDeleteProject={vi.fn()} onArchiveProject={vi.fn()} onStartPomodoro={vi.fn()} onStatusChange={vi.fn()} onEditTask={vi.fn()} onDeleteTask={vi.fn()} onCreateCategory={vi.fn()} onUpdateCategory={vi.fn()} onDeleteCategory={vi.fn()} {...overrides} />;
}

describe("TaskWorkspace", () => {
  it("distinguishes an empty project from a project with all tasks completed", () => {
    const viewState = { ...createDefaultWorkspaceState(), scope: `project:${project.id}` as const };
    const { rerender } = render(<Workspace tasks={[]} viewState={viewState} />);
    expect(screen.getByText("No tasks yet")).toBeInTheDocument();
    expect(screen.getByText("Add the first task to this project.")).toBeInTheDocument();
    rerender(<Workspace tasks={[{ ...task, isDone: true }]} viewState={viewState} />);
    expect(screen.getByText("No open tasks")).toBeInTheDocument();
  });

  it("lists archived projects including empty ones, searches, and opens a project's tasks", async () => {
    const user = userEvent.setup();
    function ArchivedWorkspace() {
      const [state, setState] = useState<ComponentProps<typeof TaskWorkspace>["viewState"]>({ ...createDefaultWorkspaceState(), scope: "archived" });
      return <Workspace projects={[{ ...project, isArchived: true }, { ...project, id: "empty", title: "Empty archive", isArchived: true }]} viewState={state} setViewState={setState} />;
    }
    render(<ArchivedWorkspace />);
    expect(screen.getByRole("list", { name: "Archived projects" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open project Empty archive" })).toBeInTheDocument();
    expect(screen.queryByText(task.title)).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Task status" })).not.toBeInTheDocument();
    const search = screen.getByRole("searchbox", { name: "Search archived projects" });
    await user.type(search, "missing");
    expect(screen.getByText("No matching projects")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    await user.click(screen.getByRole("button", { name: "Open project Launch" }));
    expect(screen.getByText(task.title)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to archived projects" }));
    expect(screen.getByRole("list", { name: "Archived projects" })).toBeInTheDocument();
  });

  it("restores archived projects from the list and shows an empty archive", async () => {
    const user = userEvent.setup();
    const onArchiveProject = vi.fn().mockResolvedValue(undefined);
    const props = { projects: [{ ...project, isArchived: true }], viewState: { ...createDefaultWorkspaceState(), scope: "archived" as const }, onArchiveProject };
    const { rerender } = render(<Workspace {...props} />);
    await user.click(screen.getByRole("button", { name: "Restore project Launch" }));
    expect(onArchiveProject).toHaveBeenCalledWith(project.id, false);
    rerender(<Workspace {...props} projects={[project]} />);
    expect(screen.getByText("No archived projects")).toBeInTheDocument();
  });

  it("renders focused flat rows with category pills and a full detail overlay", async () => {
    const user = userEvent.setup(); render(<Workspace />);
    expect(screen.getByRole("list", { name: /all tasks task list/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Task status" })).toHaveTextContent("Open");
    expect(screen.getByRole("combobox", { name: "Priority filter" })).toHaveTextContent("All priorities");
    expect(screen.getByRole("combobox", { name: "Category filter" })).toHaveTextContent("All categories");
    expect(screen.getByRole("combobox", { name: "Sort tasks" })).toHaveTextContent("Smart");
    expect(screen.getByLabelText("Priority: High")).toBeInTheDocument();
    expect(screen.getByText("Writing")).toBeInTheDocument();
    expect(screen.queryByText(/Writing · violet/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /open details/i }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Check every link")).toBeInTheDocument();
    expect(within(dialog).getByText("high")).toBeInTheDocument();
  });

  it("blocks duplicate task mutations and announces completion", async () => {
    const user = userEvent.setup(); let resolve: (() => void) | undefined;
    const onStatusChange = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
    render(<Workspace onStatusChange={onStatusChange} />);
    const checkbox = screen.getByRole("checkbox", { name: /mark review release notes complete/i });
    await user.click(checkbox); await user.click(checkbox); expect(onStatusChange).toHaveBeenCalledTimes(1); expect(checkbox).toHaveAttribute("aria-disabled", "true");
    await act(async () => resolve?.()); await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Task completed."));
  });

  it("searches task description and clears metadata filters", async () => {
    const user = userEvent.setup(); render(<Workspace />);
    const search = screen.getByRole("searchbox"); await user.type(search, "every link");
    await waitFor(() => expect(screen.getByText("Review release notes")).toBeInTheDocument());
    await user.clear(search); await user.type(search, "missing");
    await waitFor(() => expect(screen.getByText("No matching tasks")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Clear" })); expect(search).toHaveValue("");
  });

  it("can collapse the desktop workspace pane", async () => {
    const user = userEvent.setup(); render(<Workspace />);
    const toggle = screen.getByRole("button", { name: "Hide workspace" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.click(toggle);
    expect(screen.getByRole("button", { name: "Show workspace" })).toHaveAttribute("aria-expanded", "false");
  });

  it("shows project lifecycle progress independently from archive state", () => {
    render(<Workspace viewState={{ ...createDefaultWorkspaceState(), scope: `project:${project.id}` }} setViewState={vi.fn()} />);
    expect(screen.getByText("Active")).toBeInTheDocument(); expect(screen.getByText(/0\/1 completed/)).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument();
  });
});
