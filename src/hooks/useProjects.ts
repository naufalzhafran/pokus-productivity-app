import { useCallback } from "react";
import { useCachedResource } from "@/hooks/useCachedResource";
import { requireConnection } from "@/hooks/useConnectivity";
import { pb } from "@/lib/pocketbase";
import {
  COLLECTIONS,
  createPocketBaseId,
  listProjects,
  projectFromRecord,
  projectToRecord,
  type ProjectRecord,
} from "@/lib/pocketbase-records";
import type { Project, ProjectInput, ProjectStatus } from "@/types/task";

export function useProjects() {
  const { items: projects, itemsRef: projectsRef, replace: replaceProjects, isLoading, loadError } = useCachedResource<Project>("projects", listProjects);

  const createProject = useCallback(
    async (input: ProjectInput) => {
      requireConnection();
      const normalizedTitle = input.title.trim();
      if (!normalizedTitle) return null;

      const project: Project = {
        id: createPocketBaseId(),
        title: normalizedTitle,
        description: input.description,
        createdAt: Date.now(),
        status: input.status,
        dueDate: input.dueDate,
        isArchived: false,
      };

      try {
        const record = await pb
          .collection(COLLECTIONS.projects)
          .create<ProjectRecord>(projectToRecord(project), {
            requestKey: null,
          });
        const savedProject = projectFromRecord(record);
        replaceProjects([savedProject, ...projectsRef.current]);
        return savedProject;
      } catch (error) {
        console.error("Failed to create project in PocketBase:", error);
        throw error;
      }
    },
    [replaceProjects, projectsRef],
  );

  const deleteProject = useCallback(
    async (projectId: string) => {
      requireConnection();
      const deletedProject = projectsRef.current.find(
        (project) => project.id === projectId,
      );
      if (!deletedProject) return false;

      replaceProjects(
        projectsRef.current.filter((project) => project.id !== projectId),
      );
      try {
        await pb.collection(COLLECTIONS.projects).delete(projectId);
        return true;
      } catch (error) {
        replaceProjects(
          [deletedProject, ...projectsRef.current].sort(
            (a, b) => b.createdAt - a.createdAt,
          ),
        );
        console.error("Failed to delete project from PocketBase:", error);
        throw error;
      }
    },
    [replaceProjects, projectsRef],
  );

  const setProjectArchived = useCallback(
    async (projectId: string, isArchived: boolean) => {
      requireConnection();
      const previousProject = projectsRef.current.find(
        (project) => project.id === projectId,
      );
      if (!previousProject) return false;

      replaceProjects(
        projectsRef.current.map((project) =>
          project.id === projectId ? { ...project, isArchived } : project,
        ),
      );
      try {
        const record = await pb
          .collection(COLLECTIONS.projects)
          .update<ProjectRecord>(projectId, { isDone: isArchived }, { requestKey: null });
        const savedProject = projectFromRecord(record);
        replaceProjects(
          projectsRef.current.map((project) =>
            project.id === projectId ? savedProject : project,
          ),
        );
        return true;
      } catch (error) {
        replaceProjects(
          projectsRef.current.map((project) =>
            project.id === projectId ? previousProject : project,
          ),
        );
        console.error("Failed to update project in PocketBase:", error);
        throw error;
      }
    },
    [replaceProjects, projectsRef],
  );

  const updateProject = useCallback(
    async (projectId: string, input: ProjectInput) => {
      requireConnection();
      const normalizedTitle = input.title.trim();
      if (!normalizedTitle || normalizedTitle.length > 120) {
        throw new Error("Enter a project name up to 120 characters.");
      }
      const previousProject = projectsRef.current.find((project) => project.id === projectId);
      if (!previousProject) return false;
      replaceProjects(
        projectsRef.current.map((project) =>
          project.id === projectId ? { ...project, ...input, title: normalizedTitle } : project,
        ),
      );
      try {
        const record = await pb.collection(COLLECTIONS.projects).update<ProjectRecord>(projectId, { title: normalizedTitle, description: input.description, status: input.status, dueDate: input.dueDate ?? "" }, { requestKey: null });
        const savedProject = projectFromRecord(record);
        replaceProjects(projectsRef.current.map((project) => project.id === projectId ? savedProject : project));
        return savedProject;
      } catch (error) {
        replaceProjects(projectsRef.current.map((project) => project.id === projectId ? previousProject : project));
        console.error("Failed to update project in PocketBase:", error);
        throw error;
      }
    },
    [replaceProjects, projectsRef],
  );

  return {
    projects,
    isLoading,
    loadError,
    createProject,
    deleteProject,
    setProjectArchived,
    updateProject,
    setProjectStatus: useCallback(async (projectId: string, status: ProjectStatus) => updateProject(projectId, {
      title: projectsRef.current.find((project) => project.id === projectId)?.title ?? "",
      description: projectsRef.current.find((project) => project.id === projectId)?.description ?? "",
      status,
      dueDate: projectsRef.current.find((project) => project.id === projectId)?.dueDate ?? null,
    }), [updateProject, projectsRef]),
  };
}
