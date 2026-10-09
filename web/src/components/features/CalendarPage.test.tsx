import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CalendarPage } from "@/components/features/CalendarPage";
import { CaptureReminderEditor } from "@/components/features/CaptureReminderEditor";
import { addHabitDays, habitDay } from "@/lib/habits";
import { reminderLocalDateTime } from "@/lib/calendar";
import type { CaptureStore } from "@/hooks/useCaptures";
import type { Capture } from "@/types/capture";
import type { Project, Task } from "@/types/task";

const today = habitDay();
const project: Project = { id: "project", title: "Launch", description: "", createdAt: 1, status: "active", dueDate: today };
const task: Task = { id: "task", title: "Ship calendar", isDone: false, createdAt: 1, focusedSeconds: 0, projectId: project.id };
const capture: Capture = { id: "capture00000001", kind: "note", title: "Read reference", url: null, note: "Context", preview: null, isProcessed: true, createdAt: 1, updatedAt: 1 };
function props() {
  return {
    projects: [project], tasks: [task], categories: [], captureStore: { captures: [capture], isLoading: false, loadError: null, previewing: new Set(), createCapture: vi.fn(), updateCapture: vi.fn(), refreshPreview: vi.fn(), deleteCapture: vi.fn(), setCaptureProcessed: vi.fn(), setCaptureReminder: vi.fn(), setCaptureReminderDone: vi.fn() } as CaptureStore,
    habitStore: { habits: [{ id: "habit", name: "Walk", kind: "check" as const, unit: "", startDay: today, createdAt: 1, targets: [], entries: {} }], isLoading: false, loadError: null, saving: false, pendingCount: 0, create: vi.fn(), edit: vi.fn(), setValue: vi.fn(), increment: vi.fn(), remove: vi.fn() },
    readOnly: false, loading: false, loadError: null, selectedDay: today,
    onSelect: vi.fn(), onTaskDone: vi.fn().mockResolvedValue(true), onEditTask: vi.fn(), onEditProject: vi.fn(), onCreateCategory: vi.fn(),
  };
}

describe("Calendar", () => {
  it("uses inherited dates and existing completion actions; future habits are read-only", async () => {
    const user = userEvent.setup(); const input = props();
    const view = render(<CalendarPage {...input} />);
    expect(screen.getByText(/From project/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Complete Ship calendar" }));
    expect(input.onTaskDone).toHaveBeenCalledWith("task", true);
    view.rerender(<CalendarPage {...input} selectedDay={addHabitDays(today, 1)} />);
    expect(screen.getByRole("button", { name: "Complete Walk" })).toBeDisabled();
  });

  it("separates unscheduled work and keeps completed work collapsed", async () => {
    const user = userEvent.setup(); const input = props();
    render(<CalendarPage {...input} tasks={[{ ...task, isDone: true }, { ...task, id: "loose", title: "Undated task", projectId: null }]} />);
    expect(screen.getByText("Completed (1)")).toBeVisible();
    expect(screen.getByRole("button", { name: "Reopen Ship calendar", hidden: true })).not.toBeVisible();
    await user.click(screen.getByRole("tab", { name: "Unscheduled" }));
    expect(screen.getByText("Undated task")).toBeVisible();
    expect(screen.getByRole("button", { name: "Set date" })).toBeVisible();
    expect(screen.queryByText("Ship calendar")).not.toBeInTheDocument();
  });

  it("supports keyboard date movement and marks the selected grid cell", async () => {
    const user = userEvent.setup(); const input = props(); render(<CalendarPage {...input} />);
    const cell = screen.getByRole("gridcell", { selected: true });
    within(cell).getByRole("button").focus();
    await user.keyboard("{ArrowRight}");
    expect(input.onSelect).toHaveBeenCalledWith(addHabitDays(today, 1));
  });

  it("saves only future reminder times and completes separately from capture processing", async () => {
    const user = userEvent.setup(); const input = props();
    render(<CaptureReminderEditor capture={{ ...capture, reminderAt: Date.now() + 3_600_000 }} store={input.captureStore} onClose={vi.fn()} />);
    const date = screen.getByLabelText("Remind me on");
    await user.clear(date); await user.type(date, reminderLocalDateTime(Date.now() - 3_600_000));
    await user.click(screen.getByRole("button", { name: "Reschedule reminder" }));
    expect(input.captureStore.setCaptureReminder).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Complete reminder" }));
    expect(input.captureStore.setCaptureReminderDone).toHaveBeenCalledWith(capture.id, true);
    expect(input.captureStore.setCaptureProcessed).not.toHaveBeenCalled();
  });
  it("adds a task on the selected day and focuses on agenda tasks", async () => {
    const user = userEvent.setup(); const input = props();
    const onCreateTask = vi.fn().mockResolvedValue(undefined); const onFocusTask = vi.fn();
    const tomorrow = addHabitDays(today, 1);
    const view = render(<CalendarPage {...input} onCreateTask={onCreateTask} onFocusTask={onFocusTask} canFocus />);
    await user.click(screen.getByRole("button", { name: "Focus on Ship calendar" }));
    expect(onFocusTask).toHaveBeenCalledWith("task");
    view.rerender(<CalendarPage {...input} onCreateTask={onCreateTask} onFocusTask={onFocusTask} canFocus={false} selectedDay={tomorrow} />);
    await user.click(screen.getByRole("button", { name: /^New task on / }));
    const dialog = await screen.findByRole("dialog", { name: "New task" });
    expect(await within(dialog).findByLabelText("Task due date")).toHaveValue(tomorrow);
    await user.type(within(dialog).getByRole("textbox", { name: "Task" }), "Plan the review");
    await user.click(within(dialog).getByRole("button", { name: "Create task" }));
    await waitFor(() => expect(onCreateTask).toHaveBeenCalledWith(expect.objectContaining({ title: "Plan the review", dueDate: tomorrow, projectId: null })));
  });
});
