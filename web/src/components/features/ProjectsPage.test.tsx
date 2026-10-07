import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { ProjectsPage } from "@/components/features/ProjectsPage";
import { createDefaultWorkspaceState, localDateKey } from "@/lib/workspace";
import type { Project, Task } from "@/types/task";

const today = localDateKey();
const project = (values: Partial<Project> & Pick<Project, "id" | "title">): Project => ({ description: "", createdAt: 1, status: "active", isArchived: false, dueDate: null, ...values });
const projects = [
  project({ id: "launch", title: "Launch", dueDate: today }),
  project({ id: "plan", title: "Q4 plan", status: "planned" }),
  project({ id: "old", title: "Old site", isArchived: true }),
];
const tasks: Task[] = [
  { id: "t1", title: "Write copy", projectId: "launch", isDone: true, createdAt: 1, focusedSeconds: 1500 },
  { id: "t2", title: "Ship", projectId: "launch", isDone: false, createdAt: 2, focusedSeconds: 0 },
  { id: "t3", title: "Loose task", projectId: null, isDone: false, createdAt: 3, focusedSeconds: 0 },
];

function Page(overrides: Partial<ComponentProps<typeof ProjectsPage>> = {}) {
  const [state, setState] = useState(createDefaultWorkspaceState());
  return <ProjectsPage readOnly={false} projects={projects} tasks={tasks} categories={[]} viewState={state} setViewState={setState}
    onCreateProject={vi.fn()} onOpenProject={vi.fn()} onUpdateCategory={vi.fn()} onDeleteCategory={vi.fn()} {...overrides} />;
}

describe("ProjectsPage", () => {
  it("lists active projects as links with progress, plus tasks without a project", () => {
    render(<Page />);
    const list = screen.getByRole("list", { name: "All projects" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    const launch = within(list).getByRole("link", { name: /Launch/ });
    expect(launch).toHaveAttribute("href", "#projects/launch");
    expect(within(launch).getByText("1/2 tasks done")).toBeInTheDocument();
    expect(within(launch).getByText("25m focused")).toBeInTheDocument();
    expect(within(list).getByRole("link", { name: /No project/ })).toHaveAttribute("href", "#projects/none");
    expect(within(list).queryByText("Old site")).not.toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: "All 2" }));
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
    await user.type(screen.getByRole("textbox", { name: "Project name" }), "New thing");
    await user.click(screen.getByRole("button", { name: "Create project" }));
    await waitFor(() => expect(onOpenProject).toHaveBeenCalledWith("new"));
    expect(onCreateProject).toHaveBeenCalledWith(expect.objectContaining({ title: "New thing", status: "active" }));
  });
});
