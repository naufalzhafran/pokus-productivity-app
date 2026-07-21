import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TaskWorkspace } from "@/components/features/TaskWorkspace";
import type { Project } from "@/types/task";

vi.mock("@/components/features/ProjectNavigation", () => ({
  DesktopProjectNavigation: () => null,
  MobileProjectNavigation: () => null,
}));

describe("TaskWorkspace", () => {
  it("offers project editing when the selected project is empty", () => {
    const project: Project = {
      id: "project-1",
      title: "Empty project",
      description: "",
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

    expect(
      screen.getByRole("button", { name: "Edit project" }),
    ).toBeInTheDocument();
  });
});
