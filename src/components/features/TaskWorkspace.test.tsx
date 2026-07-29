import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Profiler, useState, type ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { TaskWorkspace } from "@/components/features/TaskWorkspace";
import type { Project, Task } from "@/types/task";

vi.mock("@/components/features/ProjectNavigation", () => ({
  DesktopProjectNavigation: () => null,
  MobileProjectNavigation: () => null,
}));

function renderWorkspace(
  overrides: Partial<ComponentProps<typeof TaskWorkspace>> = {},
) {
  return render(
    <TaskWorkspace
      tasks={[]}
      projects={[]}
      viewState={{
        scope: "all",
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
      {...overrides}
    />,
  );
}

describe("TaskWorkspace", () => {
  it("does not recommit when a parent clock tick leaves its inputs unchanged", async () => {
    const user = userEvent.setup();
    const onRender = vi.fn();
    const stableProps: ComponentProps<typeof TaskWorkspace> = {
      tasks: [],
      projects: [],
      viewState: { scope: "all", status: "open", sort: "newest", lastDuration: 25 },
      setViewState: vi.fn(),
      canStartPomodoro: false,
      onCreateTask: vi.fn(),
      onCreateProject: vi.fn(),
      onUpdateProject: vi.fn(),
      onDeleteProject: vi.fn(),
      onArchiveProject: vi.fn(),
      onStartPomodoro: vi.fn(),
      onStatusChange: vi.fn(),
      onEditTask: vi.fn(),
      onDeleteTask: vi.fn(),
    };

    function ClockHarness() {
      const [tick, setTick] = useState(0);
      return (
        <>
          <button type="button" onClick={() => setTick((value) => value + 1)}>
            Tick {tick}
          </button>
          <Profiler id="workspace" onRender={onRender}>
            <TaskWorkspace {...stableProps} />
          </Profiler>
        </>
      );
    }

    render(<ClockHarness />);
    onRender.mockClear();
    await user.click(screen.getByRole("button", { name: "Tick 0" }));
    expect(screen.getByRole("button", { name: "Tick 1" })).toBeInTheDocument();
    expect(onRender).toHaveBeenCalledTimes(1);
    const [, phase, actualDuration, baseDuration] = onRender.mock.calls[0];
    expect(phase).toBe("update");
    expect(actualDuration).toBeLessThan(baseDuration * 0.01);
  });

  it("combines selected project details, filters, and tasks in one project card", () => {
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
      within(projectCard).getByPlaceholderText("Search tasks"),
    ).toBeInTheDocument();
    expect(within(projectCard).getByText("Tasks")).toBeInTheDocument();
    expect(projectCard).toHaveAttribute("data-project-id", project.id);
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
    const actionsButton = screen.getByRole("button", {
      name: "Actions for Review keyboard navigation",
    });
    expect(actionsButton).toBeInTheDocument();

    await user.click(checkbox);
    expect(onStatusChange).toHaveBeenCalledTimes(1);
    expect(checkbox).toHaveAttribute("aria-disabled", "true");
    expect(checkbox.closest("li")).toHaveAttribute("aria-busy", "true");
    await user.click(checkbox);
    expect(onStatusChange).toHaveBeenCalledTimes(1);

    await act(async () => resolveStatus?.());
    expect(checkbox).not.toHaveAttribute("aria-disabled", "true");

    await user.click(
      screen.getByRole("button", {
        name: "Actions for Review keyboard navigation",
      }),
    );
    const menu = await screen.findByRole("menu");
    expect(
      within(menu).getByRole("menuitem", { name: "Edit or move" }),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: "Delete" }),
    ).toBeInTheDocument();
    expect(menu).not.toHaveTextContent(task.title);
  });

  it("renders every project and task as a card with complete wrapping titles", () => {
    const longProjectTitle = `Roadmap\n${"project".repeat(30)}`;
    const longTaskTitle = `First line\n${"unbroken".repeat(80)}`;
    const projects: Project[] = [
      {
        id: "project-long",
        title: longProjectTitle,
        description: "",
        createdAt: 2,
        isDone: false,
      },
      {
        id: "project-empty",
        title: "Empty project",
        description: "",
        createdAt: 1,
        isDone: false,
      },
    ];
    const tasks: Task[] = [
      {
        id: "task-long",
        title: longTaskTitle,
        isDone: false,
        createdAt: 2,
        focusedSeconds: 0,
        projectId: "project-long",
      },
      {
        id: "task-unassigned",
        title: "Loose task",
        isDone: false,
        createdAt: 1,
        focusedSeconds: 0,
        projectId: null,
      },
    ];

    const { container } = renderWorkspace({ projects, tasks });

    expect(container.querySelectorAll("[data-project-id]")).toHaveLength(3);
    expect(container.querySelectorAll("[data-task-id]")).toHaveLength(2);
    expect(
      container.querySelector('[data-project-id="project-empty"]'),
    ).toHaveTextContent("No matching tasks");
    expect(
      container.querySelector('[data-project-id="unassigned"]'),
    ).toHaveTextContent("No project");

    const projectTitle = container.querySelector(
      '[data-project-id="project-long"] [data-slot="card-title"]',
    );
    const taskTitle = container.querySelector(
      '[data-task-id="task-long"] .task-preview',
    );
    if (!(projectTitle instanceof HTMLElement) || !(taskTitle instanceof HTMLElement)) {
      throw new Error("Expected wrapping project and task title elements.");
    }
    expect(projectTitle.textContent).toBe(longProjectTitle);
    expect(taskTitle.textContent).toBe(longTaskTitle);
    expect(projectTitle).toHaveClass("whitespace-pre-wrap");
    expect(projectTitle).toHaveClass("[overflow-wrap:anywhere]");
    expect(taskTitle).toHaveClass("whitespace-pre-wrap");
    expect(taskTitle).toHaveClass("[overflow-wrap:anywhere]");
    expect(projectTitle.className).not.toMatch(/truncate|line-clamp/);
    expect(taskTitle.className).not.toMatch(/truncate|line-clamp/);
  });

  it("keeps selected project tasks inside one card and uses a responsive task grid", () => {
    const project: Project = {
      id: "selected",
      title: "Selected project",
      description: "",
      createdAt: 1,
      isDone: false,
    };
    const task: Task = {
      id: "selected-task",
      title: "Nested card task",
      isDone: false,
      createdAt: 1,
      focusedSeconds: 60,
      projectId: project.id,
    };

    const { container } = renderWorkspace({
      projects: [project],
      tasks: [task],
      viewState: {
        scope: `project:${project.id}`,
        status: "open",
        sort: "newest",
        lastDuration: 25,
      },
    });

    const projectCard = container.querySelector(
      '[data-project-id="selected"]',
    );
    const taskCard = container.querySelector('[data-task-id="selected-task"]');
    if (!(projectCard instanceof HTMLElement) || !(taskCard instanceof HTMLElement)) {
      throw new Error("Expected selected project and task cards.");
    }
    expect(projectCard).toContainElement(taskCard);
    expect(taskCard.closest("ul")).toHaveClass("md:grid-cols-2");
  });

  it("shows empty archived project cards and omits an empty No project card", () => {
    const archived: Project = {
      id: "archived-empty",
      title: "Archived empty",
      description: "",
      createdAt: 1,
      isDone: true,
    };

    const { container } = renderWorkspace({
      projects: [archived],
      viewState: {
        scope: "archived",
        status: "open",
        sort: "newest",
        lastDuration: 25,
      },
    });

    expect(
      container.querySelector('[data-project-id="archived-empty"]'),
    ).toHaveTextContent("No matching tasks");
    expect(
      container.querySelector('[data-project-id="unassigned"]'),
    ).not.toBeInTheDocument();
  });

  it("progressively reveals task cards in batches", async () => {
    const user = userEvent.setup();
    const project: Project = {
      id: "many",
      title: "Many tasks",
      description: "",
      createdAt: 1,
      isDone: false,
    };
    const tasks: Task[] = Array.from({ length: 26 }, (_, index) => ({
      id: `task-${index}`,
      title: `Task ${index}`,
      isDone: false,
      createdAt: index,
      focusedSeconds: 0,
      projectId: project.id,
    }));

    const { container } = renderWorkspace({ projects: [project], tasks });
    expect(container.querySelectorAll("[data-task-id]")).toHaveLength(25);
    await user.click(screen.getByRole("button", { name: "Show 25 more" }));
    expect(container.querySelectorAll("[data-task-id]")).toHaveLength(26);
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
