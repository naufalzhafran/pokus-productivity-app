import { render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { TasksPage } from "@/components/features/TasksPage";
import { createDefaultWorkspaceState } from "@/lib/workspace";
import type { Project, Task } from "@/types/task";

const projects: Project[] = [
  { id: "launch", title: "Launch", description: "", createdAt: 1, status: "active", isArchived: false, dueDate: "2026-11-01" },
  { id: "old", title: "Old site", description: "", createdAt: 1, status: "active", isArchived: true },
];
const task = (values: Partial<Task> & Pick<Task, "id" | "title">): Task => ({ isDone: false, createdAt: 1, focusedSeconds: 0, projectId: null, priority: "none", categoryId: null, ...values });
const tasks = [
  task({ id: "ship", title: "Ship", projectId: "launch", priority: "urgent" }),
  task({ id: "loose", title: "Loose task", dueDate: "2026-10-20" }),
  task({ id: "archived", title: "Archived work", projectId: "old" }),
  task({ id: "done", title: "Done task", projectId: "launch", isDone: true }),
];

function Page() {
  const [state, setState] = useState(createDefaultWorkspaceState());
  return <TasksPage readOnly={false} tasks={tasks} projects={projects} categories={[]} viewState={state} setViewState={setState} canStartPomodoro
    onCreateTask={vi.fn()} onEditTask={vi.fn()} onDeleteTask={vi.fn()} onStatusChange={vi.fn()} onStartPomodoro={vi.fn()} />;
}

describe("TasksPage", () => {
  it("lists open tasks from every project in one list, with project and due date", () => {
    render(<Page />);
    const list = screen.getByRole("list", { name: "All tasks" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows.map((row) => row.getAttribute("data-task-id"))).toEqual(["ship", "loose"]);
    expect(within(rows[0]).getByText("Launch")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Due 2026-11-01")).toBeInTheDocument();
    expect(within(rows[1]).getByText("No project")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Due 2026-10-20")).toBeInTheDocument();
    expect(within(list).queryByText("Archived work")).not.toBeInTheDocument();
  });
});
