import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { ProjectDetailPage } from "@/components/features/ProjectDetailPage";
import { createDefaultWorkspaceState, NO_PROJECT_ID } from "@/lib/workspace";
import type { Category, Project, Task } from "@/types/task";

const project: Project = { id: "project", title: "Launch", description: "<p>Ship the beta</p>", createdAt: 1, status: "active", isArchived: false, dueDate: "2026-07-29" };
const category: Category = { id: "category", name: "Writing", color: "violet", createdAt: 1, updatedAt: 1 };
const task: Task = { id: "task", title: "Review release notes", description: "<p>Check every link</p>", priority: "high", categoryId: category.id, projectId: project.id, isDone: false, createdAt: 2, focusedSeconds: 120 };

function Detail(overrides: Partial<ComponentProps<typeof ProjectDetailPage>> = {}) {
  const [state, setState] = useState(createDefaultWorkspaceState());
  return <ProjectDetailPage projectId={project.id} readOnly={false} tasks={[task]} projects={[project]} categories={[category]} viewState={state} setViewState={setState} canStartPomodoro
    onCreateTask={vi.fn()} onEditTask={vi.fn()} onDeleteTask={vi.fn()} onStatusChange={vi.fn()} onStartPomodoro={vi.fn()} onCreateCategory={vi.fn()}
    onUpdateProject={vi.fn()} onArchiveProject={vi.fn()} onDeleteProject={vi.fn()} {...overrides} />;
}

describe("ProjectDetailPage", () => {
  it("shows the project header, progress, and its task rows", async () => {
    const user = userEvent.setup();
    render(<Detail />);
    expect(screen.getByRole("heading", { level: 1, name: "Launch" })).toHaveFocus();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("0/1 task done")).toBeInTheDocument();
    expect(await screen.findByText("Ship the beta")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Projects" })).toHaveAttribute("href", "#projects");
    expect(screen.getByRole("combobox", { name: "Task status" })).toHaveTextContent("Open");
    expect(screen.getByLabelText("Priority: High")).toBeInTheDocument();
    expect(screen.getByText("Writing")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /open details/i }));
    expect(await within(screen.getByRole("dialog")).findByText("Check every link")).toBeInTheDocument();
  });

  it("distinguishes an empty project from one with every task completed", () => {
    const { rerender } = render(<Detail tasks={[]} />);
    expect(screen.getByText("No tasks yet")).toBeInTheDocument();
    rerender(<Detail tasks={[{ ...task, isDone: true }]} />);
    expect(screen.getByText("No open tasks")).toBeInTheDocument();
  });

  it("blocks duplicate task mutations and announces completion", async () => {
    const user = userEvent.setup();
    let resolve: (() => void) | undefined;
    const onStatusChange = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
    render(<Detail onStatusChange={onStatusChange} />);
    const checkbox = screen.getByRole("checkbox", { name: /mark review release notes complete/i });
    await user.click(checkbox);
    await user.click(checkbox);
    expect(onStatusChange).toHaveBeenCalledTimes(1);
    await act(async () => resolve?.());
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Task completed."));
  });

  it("searches tasks and clears filters", async () => {
    const user = userEvent.setup();
    render(<Detail />);
    const search = screen.getByRole("searchbox", { name: "Search tasks" });
    await user.type(search, "missing");
    await waitFor(() => expect(screen.getByText("No matching tasks")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(search).toHaveValue("");
  });

  it("archives from the project menu and disables focus for archived projects", async () => {
    const user = userEvent.setup();
    const onArchiveProject = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(<Detail onArchiveProject={onArchiveProject} />);
    await user.click(screen.getByRole("button", { name: "More actions for Launch" }));
    await user.click(await screen.findByRole("menuitem", { name: "Archive project" }));
    expect(onArchiveProject).toHaveBeenCalledWith(project.id, true);
    rerender(<Detail projects={[{ ...project, isArchived: true }]} />);
    expect(screen.getByText("Archived")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Focus on Review release notes" })).toBeDisabled();
  });

  it("shows tasks without a project and a not-found state", () => {
    const { rerender } = render(<Detail projectId={NO_PROJECT_ID} tasks={[{ ...task, projectId: null }]} />);
    expect(screen.getByRole("heading", { level: 1, name: "No project" })).toBeInTheDocument();
    expect(screen.getByText("Review release notes")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    rerender(<Detail projectId="missing" />);
    expect(screen.getByRole("heading", { level: 1, name: "Project not found" })).toBeInTheDocument();
  });
});
