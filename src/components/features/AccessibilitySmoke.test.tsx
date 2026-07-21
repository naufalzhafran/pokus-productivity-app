import axe from "axe-core";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "@/components/features/LoginForm";
import { CircularDurationInput } from "@/components/features/CircularDurationInput";
import { ProfilePage } from "@/components/features/ProfilePage";
import { ResponsiveOverlay } from "@/components/features/ResponsiveOverlay";
import { TaskWorkspace } from "@/components/features/TaskWorkspace";
import { Timer } from "@/components/features/timer";
import { TimerCompletion } from "@/components/features/TimerCompletion";
import { Button } from "@/components/ui/button";
import { pb } from "@/lib/pocketbase";
import type { Task } from "@/types/task";

vi.mock("@/hooks/usePomodoroHistory", () => ({
  usePomodoroHistory: () => ({
    history: [
      {
        id: "history-1",
        taskId: "task-1",
        durationMinutes: 25,
        focusedSeconds: 1500,
        completedAt: Date.now(),
      },
    ],
    isLoading: false,
    error: null,
  }),
}));

vi.mock("@/components/features/ProjectNavigation", () => ({
  DesktopProjectNavigation: () => null,
  MobileProjectNavigation: () => null,
}));

const task: Task = {
  id: "task-1",
  title: "Review the accessibility checklist",
  isDone: false,
  createdAt: Date.now(),
  focusedSeconds: 600,
  projectId: null,
};

async function expectNoCriticalViolations(root: Element | Document) {
  const results = await axe.run(root, {
    rules: { "color-contrast": { enabled: false } },
  });
  const critical = results.violations.filter(
    (violation) => violation.impact === "critical",
  );
  expect(
    critical.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) })),
  ).toEqual([]);
}

afterEach(() => {
  cleanup();
  pb.authStore.clear();
});

describe("accessibility smoke states", () => {
  it("has no critical violations on sign-in", async () => {
    const { container } = render(<LoginForm />);
    await expectNoCriticalViolations(container);
  });

  it("has no critical violations in the task workspace", async () => {
    const { container } = render(
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
    await expectNoCriticalViolations(container);
  });

  it("has no critical violations in timer setup, running, and completion", async () => {
    const setup = render(
      <main>
        <h1>Pomodoro Timer</h1>
        <CircularDurationInput
          value={25}
          onChange={vi.fn()}
          min={1}
          max={60}
          size={300}
          strokeWidth={10}
          ariaLabel="Pomodoro duration"
          ariaValueText="25 minutes"
        />
      </main>,
    );
    await expectNoCriticalViolations(setup.container);
    setup.unmount();

    const running = render(
      <main>
        <h1>Pomodoro Timer</h1>
        <Timer
          durationMinutes={25}
          remainingSeconds={1200}
          isActive
          onToggle={vi.fn()}
          onStop={vi.fn()}
          sessionTitle="Accessibility review"
          taskTitle="Accessibility review"
        />
      </main>,
    );
    await expectNoCriticalViolations(running.container);
    running.unmount();

    const complete = render(
      <main>
        <h1>Pomodoro Timer</h1>
        <TimerCompletion
          durationMinutes={25}
          taskTitle="Accessibility review"
          onMarkTaskDone={vi.fn()}
          onFocusAgain={vi.fn()}
          onViewTasks={vi.fn()}
        />
      </main>,
    );
    await expectNoCriticalViolations(complete.container);
  });

  it("has no critical violations on profile and an open overlay", async () => {
    pb.authStore.save("test-token", {
      id: "user-1",
      collectionId: "users",
      collectionName: "users",
      email: "person@example.com",
      name: "Pokus User",
      verified: true,
    });
    const profile = render(
      <main>
        <h1>Profile</h1>
        <ProfilePage tasks={[task]} openTaskId={null} onOpenTask={vi.fn()} />
      </main>,
    );
    await expectNoCriticalViolations(profile.container);
    profile.unmount();

    render(
      <ResponsiveOverlay
        open
        onOpenChange={vi.fn()}
        title="Task details"
        description="Review task information."
      >
        <Button type="button">Save task</Button>
      </ResponsiveOverlay>,
    );
    await expectNoCriticalViolations(document);
  });
});
