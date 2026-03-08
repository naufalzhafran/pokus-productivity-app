import { getSupabaseClient } from "@/lib/supabase/client";
import {
  saveLocalProject,
  deleteLocalProject,
  getLocalProjectsByUserId,
  getLocalProject,
  saveLocalTask,
  deleteLocalTask,
  getLocalTasksByProjectId,
  getLocalTask,
  updateLocalTask,
  LocalProject,
  LocalTask,
  addToSyncQueue,
} from "@/lib/sync";
import { getCachedUserId } from "@/lib/authCache";

const supabase = getSupabaseClient();

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectWithTasks extends Project {
  tasks: Task[];
  total_tasks: number;
  completed_tasks: number;
  total_duration: number;
}

export interface Task {
  id: string;
  user_id: string;
  project_id: string;
  title: string;
  description: string;
  duration_minutes: number;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskWithProject extends Task {
  project_name: string;
}

export async function createProject(
  name: string,
  description: string = "",
): Promise<Project> {
  const userId = getCachedUserId();

  if (!userId) {
    throw new Error("User not authenticated");
  }

  const projectId = crypto.randomUUID();
  const now = new Date().toISOString();

  const localProject: LocalProject = {
    id: projectId,
    user_id: userId,
    name,
    description,
    created_at: now,
    updated_at: now,
    syncStatus: "PENDING",
  };

  await saveLocalProject(localProject);

  addToSyncQueue({
    type: "CREATE",
    table: "projects",
    data: {
      id: projectId,
      user_id: userId,
      name,
      description,
    },
  });

  return {
    id: projectId,
    user_id: userId,
    name,
    description,
    created_at: now,
    updated_at: now,
  };
}

export async function getProjects(): Promise<Project[]> {
  const userId = getCachedUserId();

  if (!userId) {
    return [];
  }

  const localProjects = await getLocalProjectsByUserId(userId);

  if (navigator.onLine && localProjects.length === 0) {
    await fetchAndMergeRemoteProjects(userId);
    const updatedLocalProjects = await getLocalProjectsByUserId(userId);
    return updatedLocalProjects.map((p) => ({
      id: p.id,
      user_id: p.user_id,
      name: p.name,
      description: p.description,
      created_at: p.created_at,
      updated_at: p.updated_at,
    }));
  }

  if (navigator.onLine) {
    fetchAndMergeRemoteProjects(userId);
  }

  return localProjects.map((p) => ({
    id: p.id,
    user_id: p.user_id,
    name: p.name,
    description: p.description,
    created_at: p.created_at,
    updated_at: p.updated_at,
  }));
}

async function fetchAndMergeRemoteProjects(userId: string): Promise<void> {
  try {
    const { data: records, error } = await supabase
      .from("projects")
      .select("*")
      .eq("user_id", userId)
      .abortSignal(AbortSignal.timeout(5000));

    if (error) {
      console.error("Error fetching remote projects:", error);
      return;
    }

    for (const remoteProject of records || []) {
      const localProject = await getLocalProject(remoteProject.id);

      if (!localProject) {
        await saveLocalProject({
          ...remoteProject,
          syncStatus: "SYNCED",
          lastSyncedAt: new Date().toISOString(),
        });
      } else if (localProject.syncStatus === "SYNCED") {
        await saveLocalProject({
          ...localProject,
          name: remoteProject.name,
          description: remoteProject.description,
          updated_at: remoteProject.updated_at,
          syncStatus: "SYNCED",
          lastSyncedAt: new Date().toISOString(),
        });
      }
    }
  } catch (error) {
    console.error("Error merging remote projects:", error);
  }
}

export async function getProject(id: string): Promise<Project | null> {
  const localProject = await getLocalProject(id);

  if (localProject) {
    return {
      id: localProject.id,
      user_id: localProject.user_id,
      name: localProject.name,
      description: localProject.description,
      created_at: localProject.created_at,
      updated_at: localProject.updated_at,
    };
  }

  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function getProjectWithTasks(id: string): Promise<ProjectWithTasks> {
  const project = await getProject(id);

  if (!project) {
    throw new Error("Project not found");
  }

  const tasks = await getTasksByProject(id);

  const total_tasks = tasks.length;
  const completed_tasks = tasks.filter((t) => t.is_completed).length;
  const total_duration = tasks.reduce((sum, t) => sum + t.duration_minutes, 0);

  return {
    ...project,
    tasks,
    total_tasks,
    completed_tasks,
    total_duration,
  };
}

export async function updateProject(
  id: string,
  data: Partial<Pick<Project, "name" | "description">>,
): Promise<Project> {
  const { data: updated, error } = await supabase
    .from("projects")
    .update({
      ...data,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return updated;
}

export async function deleteProject(id: string): Promise<void> {
  const userId = getCachedUserId();

  const isGuest = !userId;

  const localProject = await getLocalProject(id);

  if (localProject) {
    await deleteLocalProject(id);

    if (!isGuest) {
      addToSyncQueue({
        type: "DELETE",
        table: "projects",
        data: { id },
      });
    }
  } else {
    const { error } = await supabase.from("projects").delete().eq("id", id);

    if (error) {
      throw new Error(error.message);
    }
  }
}

export async function createTask(
  projectId: string,
  title: string,
  description: string = "",
): Promise<Task> {
  const userId = getCachedUserId();

  if (!userId) {
    throw new Error("User not authenticated");
  }

  const taskId = crypto.randomUUID();
  const now = new Date().toISOString();

  const localTask: LocalTask = {
    id: taskId,
    user_id: userId,
    project_id: projectId,
    title,
    description,
    duration_minutes: 0,
    is_completed: false,
    completed_at: null,
    created_at: now,
    updated_at: now,
    syncStatus: "PENDING",
  };

  await saveLocalTask(localTask);

  addToSyncQueue({
    type: "CREATE",
    table: "tasks",
    data: {
      id: taskId,
      user_id: userId,
      project_id: projectId,
      title,
      description,
      duration_minutes: 0,
    },
  });

  return {
    id: taskId,
    user_id: userId,
    project_id: projectId,
    title,
    description,
    duration_minutes: 0,
    is_completed: false,
    completed_at: null,
    created_at: now,
    updated_at: now,
  };
}

export async function getTasksByProject(projectId: string): Promise<Task[]> {
  const userId = getCachedUserId();

  if (!userId) {
    return [];
  }

  const localTasks = await getLocalTasksByProjectId(projectId);

  return localTasks.map((t) => ({
    id: t.id,
    user_id: t.user_id,
    project_id: t.project_id,
    title: t.title,
    description: t.description,
    duration_minutes: t.duration_minutes,
    is_completed: t.is_completed,
    completed_at: t.completed_at,
    created_at: t.created_at,
    updated_at: t.updated_at,
  }));
}

export async function getAllTasks(): Promise<TaskWithProject[]> {
  const userId = getCachedUserId();

  if (!userId) {
    return [];
  }

  const { data, error } = await supabase
    .from("tasks")
    .select(`
      *,
      projects:project_id (name)
    `)
    .eq("user_id", userId)
    .eq("is_completed", false)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map((task) => ({
    ...task,
    project_name: (task.projects as { name: string } | null)?.name || "Unknown",
  })) as TaskWithProject[];
}

export async function getTask(id: string): Promise<Task | null> {
  const localTask = await getLocalTask(id);

  if (localTask) {
    return {
      id: localTask.id,
      user_id: localTask.user_id,
      project_id: localTask.project_id,
      title: localTask.title,
      description: localTask.description,
      duration_minutes: localTask.duration_minutes,
      is_completed: localTask.is_completed,
      completed_at: localTask.completed_at,
      created_at: localTask.created_at,
      updated_at: localTask.updated_at,
    };
  }

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    return null;
  }

  return data;
}

export async function updateTask(
  id: string,
  data: Partial<Pick<Task, "title" | "description" | "duration_minutes" | "is_completed">>,
): Promise<Task> {
  const userId = getCachedUserId();
  const now = new Date().toISOString();
  const updateData: Record<string, unknown> = {
    ...data,
    updated_at: now,
  };

  if (data.is_completed !== undefined) {
    updateData.completed_at = data.is_completed ? now : null;
  }

  if (userId) {
    await updateLocalTask(id, {
      ...updateData,
      syncStatus: "PENDING",
    } as Partial<LocalTask>);

    addToSyncQueue({
      type: "UPDATE",
      table: "tasks",
      data: { id, ...updateData },
    });
  }

  const localTask = await getLocalTask(id);
  if (localTask) {
    return {
      id: localTask.id,
      user_id: localTask.user_id,
      project_id: localTask.project_id,
      title: localTask.title,
      description: localTask.description,
      duration_minutes: localTask.duration_minutes,
      is_completed: localTask.is_completed,
      completed_at: localTask.completed_at,
      created_at: localTask.created_at,
      updated_at: localTask.updated_at,
    };
  }

  const { data: updated, error } = await supabase
    .from("tasks")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return updated;
}

export async function deleteTask(id: string): Promise<void> {
  const userId = getCachedUserId();
  const localTask = await getLocalTask(id);

  if (localTask) {
    await deleteLocalTask(id);

    if (userId) {
      addToSyncQueue({
        type: "DELETE",
        table: "tasks",
        data: { id },
      });
    }
    return;
  }

  const { error } = await supabase.from("tasks").delete().eq("id", id);

  if (error) {
    throw new Error(error.message);
  }
}

export async function toggleTaskComplete(id: string): Promise<Task> {
  const task = await getTask(id);

  if (!task) {
    throw new Error("Task not found");
  }

  return updateTask(id, { is_completed: !task.is_completed });
}
