import { getDB, LocalProject } from "./db";

export async function getAllLocalProjects(): Promise<LocalProject[]> {
  const db = await getDB();
  return db.getAll("projects");
}

export async function getLocalProject(
  id: string,
): Promise<LocalProject | undefined> {
  const db = await getDB();
  return db.get("projects", id);
}

export async function saveLocalProject(project: LocalProject): Promise<void> {
  const db = await getDB();
  await db.put("projects", project);
}

export async function deleteLocalProject(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("projects", id);
}

export async function getLocalProjectsByUserId(
  userId: string,
): Promise<LocalProject[]> {
  const db = await getDB();
  return db.getAllFromIndex("projects", "by-user-id", userId);
}
