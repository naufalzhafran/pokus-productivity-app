const SELECTED_TASK_STORAGE_KEY = "pokus_selected_task_v1";

export function loadSelectedTaskId() {
  try {
    return localStorage.getItem(SELECTED_TASK_STORAGE_KEY);
  } catch (error) {
    console.error("Failed to load the selected task:", error);
    return null;
  }
}

export function saveSelectedTaskId(taskId: string | null) {
  try {
    if (taskId) {
      localStorage.setItem(SELECTED_TASK_STORAGE_KEY, taskId);
    } else {
      localStorage.removeItem(SELECTED_TASK_STORAGE_KEY);
    }
  } catch (error) {
    console.error("Failed to save the selected task:", error);
  }
}
