import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { ProjectsPage } from "@/components/features/ProjectsPage";
import { createDefaultWorkspaceState, localDateKey, type WorkspaceViewState } from "@/lib/workspace";
import type { Category, Project, Task } from "@/types/task";

const today = localDateKey();
const project = (values: Partial<Project> & Pick<Project, "id" | "title">): Project => ({ description: "", createdAt: 1, status: "active", isArchived: false, dueDate: null, ...values });
const projects = [
  project({ id: "launch", title: "Launch", dueDate: today, categoryId: "work", priority: "high" }),
  project({ id: "plan", title: "Q4 plan", status: "planned" }),
  project({ id: "old", title: "Old site", isArchived: true }),
  project({ id: "shipped", title: "Shipped", status: "completed" }),
];
const categories: Category[] = [{ id: "work", name: "Work", color: "blue", createdAt: 1, updatedAt: 1 }];
const tasks: Task[] = [
  { id: "t1", title: "Write copy", projectId: "launch", isDone: true, createdAt: 1, focusedSeconds: 1500 },
  { id: "t2", title: "Ship", projectId: "launch", isDone: false, createdAt: 2, focusedSeconds: 0 },
  { id: "t3", title: "Loose task", projectId: null, isDone: false, createdAt: 3, focusedSeconds: 0 },
];

function Page({ projectCategory = "all", ...overrides }: Partial<ComponentProps<typeof ProjectsPage>> & { projectCategory?: string } = {}) {
  const [state, setState] = useState<WorkspaceViewState>({ ...createDefaultWorkspaceState(), projectCategory });
  return <ProjectsPage readOnly={false} projects={projects} tasks={tasks} categories={categories} viewState={state} setViewState={setState}
    onCreateProject={vi.fn()} onOpenProject={vi.fn()} onUpdateCategory={vi.fn()} onDeleteCategory={vi.fn()} {...overrides} />;
}

describe("ProjectsPage", () => {
  it("lists open projects as links with progress, category, and priority", () => {
    render(<Page />);
    expect(screen.queryByRole("button", { name: /^All/ })).not.toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Open projects" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    const launch = within(list).getByRole("link", { name: /Launch/ });
    expect(launch).toHaveAttribute("href", "#projects/launch");
    expect(within(launch).getByText("1/2 tasks done")).toBeInTheDocument();
    expect(within(launch).getByText("25m focused")).toBeInTheDocument();
    expect(within(launch).getByText("Work")).toBeInTheDocument();
    expect(within(launch).getByText("High priority")).toBeInTheDocument();
    expect(within(list).queryByText(/No project/)).not.toBeInTheDocument();
    expect(within(list).queryByText("Old site")).not.toBeInTheDocument();
    expect(within(list).queryByText("Shipped")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All tasks" })).toHaveAttribute("href", "#tasks");
  });

  it("filters projects by category", () => {
    const { unmount } = render(<Page projectCategory="work" />);
    expect(screen.getByRole("list", { name: "Open projects" })).toHaveTextContent("Launch");
    expect(screen.getByRole("list", { name: "Open projects" })).not.toHaveTextContent("Q4 plan");
    expect(screen.getByRole("button", { name: "Planned" })).toBeInTheDocument();
    unmount();
    render(<Page projectCategory="none" />);
    expect(screen.getByRole("list", { name: "Open projects" })).toHaveTextContent("Q4 plan");
    expect(screen.getByRole("list", { name: "Open projects" })).not.toHaveTextContent("Launch");
  });

  it("filters by status, due date, and archive, and searches by name", async () => {
    const user = userEvent.setup();
    render(<Page />);
    await user.click(screen.getByRole("button", { name: "Planned 1" }));
    expect(screen.getByRole("list", { name: "Planned projects" })).toHaveTextContent("Q4 plan");
    await user.click(screen.getByRole("button", { name: "Due soon 1" }));
    expect(screen.getByRole("list", { name: "Due soon projects" })).toHaveTextContent("Launch");
    await user.click(screen.getByRole("button", { name: "Archived 1" }));
    expect(screen.getByRole("list", { name: "Archived projects" })).toHaveTextContent("Old site");
    await user.click(screen.getByRole("button", { name: "Completed 1" }));
    expect(screen.getByRole("list", { name: "Completed projects" })).toHaveTextContent("Shipped");
    await user.click(screen.getByRole("button", { name: "Open 2" }));
    await user.type(screen.getByRole("searchbox", { name: "Search projects" }), "missing");
    await waitFor(() => expect(screen.getByText("No matching projects")).toBeInTheDocument());
  });

  it("creates a project and opens it", async () => {
    const user = userEvent.setup();
    const created = project({ id: "new", title: "New thing" });
    const onCreateProject = vi.fn().mockResolvedValue(created);
    const onOpenProject = vi.fn();
    render(<Page onCreateProject={onCreateProject} onOpenProject={onOpenProject} />);
    await user.click(screen.getByRole("button", { name: "New project" }));
    await user.type(await screen.findByRole("textbox", { name: "Project name" }), "New thing");
    await user.click(screen.getByRole("button", { name: "Create project" }));
    await waitFor(() => expect(onOpenProject).toHaveBeenCalledWith("new"));
    expect(onCreateProject).toHaveBeenCalledWith(expect.objectContaining({ title: "New thing", status: "active" }));
  });
});
