import { getDB, LocalTask } from "./db";

export async function getAllLocalTasks(): Promise<LocalTask[]> {
  const db = await getDB();
  return db.getAll("tasks");
}

export async function getLocalTask(
  id: string,
): Promise<LocalTask | undefined> {
  const db = await getDB();
  return db.get("tasks", id);
}

export async function saveLocalTask(task: LocalTask): Promise<void> {
  const db = await getDB();
  await db.put("tasks", task);
}

export async function updateLocalTask(
  id: string,
  updates: Partial<LocalTask>,
): Promise<void> {
  const db = await getDB();
  const existing = await db.get("tasks", id);
  if (existing) {
    await db.put("tasks", { ...existing, ...updates });
  }
}

export async function deleteLocalTask(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("tasks", id);
}

export async function getLocalTasksByProjectId(
  projectId: string,
): Promise<LocalTask[]> {
  const db = await getDB();
  return db.getAllFromIndex("tasks", "by-project-id", projectId);
}

export async function getLocalTasksByUserId(
  userId: string,
): Promise<LocalTask[]> {
  const db = await getDB();
  return db.getAllFromIndex("tasks", "by-user-id", userId);
}
