import { pb } from "@/lib/pocketbase";
const storageKey = () => `pokus_selected_task_v2:${pb.authStore.record?.id ?? "anonymous"}`;

export function loadSelectedTaskId() {
  try {
    return localStorage.getItem(storageKey());
  } catch (error) {
    console.error("Failed to load the selected task:", error);
    return null;
  }
}

export function saveSelectedTaskId(taskId: string | null) {
  try {
    if (taskId) {
      localStorage.setItem(storageKey(), taskId);
    } else {
      localStorage.removeItem(storageKey());
    }
  } catch (error) {
    console.error("Failed to save the selected task:", error);
  }
}
