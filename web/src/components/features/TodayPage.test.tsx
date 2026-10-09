import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TodayPage } from "@/components/features/TodayPage";
import { addHabitDays, habitDay } from "@/lib/habits";
import type { CaptureStore } from "@/hooks/useCaptures";
import type { Task } from "@/types/task";

const today = habitDay();
const tasks: Task[] = [
  { id: "due", title: "Write the brief", isDone: false, createdAt: 1, focusedSeconds: 0, projectId: null, dueDate: today },
  { id: "late", title: "Send invoice", isDone: false, createdAt: 1, focusedSeconds: 0, projectId: null, dueDate: addHabitDays(today, -2) },
  { id: "done", title: "Book room", isDone: true, createdAt: 1, focusedSeconds: 0, projectId: null, dueDate: today },
  { id: "later", title: "Someday", isDone: false, createdAt: 1, focusedSeconds: 0, projectId: null },
];
function props() {
  return {
    projects: [], tasks, categories: [],
    captureStore: { captures: [], isLoading: false, loadError: null, previewing: new Set(), createCapture: vi.fn(), updateCapture: vi.fn(), refreshPreview: vi.fn(), deleteCapture: vi.fn(), setCaptureProcessed: vi.fn(), setCaptureReminder: vi.fn(), setCaptureReminderDone: vi.fn() } as CaptureStore,
    habitStore: { habits: [{ id: "habit", name: "Walk", kind: "check" as const, unit: "", startDay: today, createdAt: 1, targets: [], entries: {} }], isLoading: false, loadError: null, saving: false, pendingCount: 0, create: vi.fn(), edit: vi.fn(), setValue: vi.fn().mockResolvedValue(undefined), increment: vi.fn(), remove: vi.fn() },
    readOnly: false, loading: false, loadError: null, session: null, sessionTask: null, selectedTask: null, remainingSeconds: 0, todaySeconds: 3900,
    onStartFocus: vi.fn(), onOpenTimer: vi.fn(), onFocusTask: vi.fn(), canFocus: true,
    onTaskDone: vi.fn().mockResolvedValue(undefined), onEditTask: vi.fn(), onEditProject: vi.fn(), onCreateTask: vi.fn(), onCreateCategory: vi.fn(),
  };
}

describe("TodayPage", () => {
  it("shows focus, overdue work, today's tasks, habits, and collapsed completed work", async () => {
    const user = userEvent.setup(); const input = props();
    render(<TodayPage {...input} />);
    expect(screen.getByText("1h 5m focused today")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Start focus" }));
    expect(input.onStartFocus).toHaveBeenCalled();
    expect(within(screen.getByRole("region", { name: "Overdue" })).getByText("Send invoice")).toBeInTheDocument();
    const work = screen.getByRole("region", { name: "Tasks and deadlines" });
    await user.click(within(work).getByRole("button", { name: "Focus on Write the brief" }));
    expect(input.onFocusTask).toHaveBeenCalledWith("due");
    await user.click(within(screen.getByRole("region", { name: "Habits" })).getByRole("button", { name: "Complete Walk" }));
    expect(input.habitStore.setValue).toHaveBeenCalledWith(input.habitStore.habits[0], today, 1);
    expect(screen.getByText("Completed (1)")).toBeInTheDocument();
    expect(screen.queryByText("Someday")).not.toBeInTheDocument();
  });

  it("starts a new task dated today", async () => {
    const user = userEvent.setup();
    render(<TodayPage {...props()} />);
    await user.click(screen.getByRole("button", { name: "New task" }));
    const dialog = await screen.findByRole("dialog", { name: "New task" });
    expect(await within(dialog).findByLabelText("Task due date")).toHaveValue(today);
  });
});
