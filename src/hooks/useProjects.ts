import { useCallback, useEffect, useRef, useState } from "react";
import { pb } from "@/lib/pocketbase";
import {
  COLLECTIONS,
  createPocketBaseId,
  listProjects,
  projectFromRecord,
  projectToRecord,
  type ProjectRecord,
} from "@/lib/pocketbase-records";
import type { Project } from "@/types/task";

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const projectsRef = useRef<Project[]>([]);

  const replaceProjects = useCallback((nextProjects: Project[]) => {
    projectsRef.current = nextProjects;
    setProjects(nextProjects);
  }, []);

  useEffect(() => {
    let isMounted = true;

    void listProjects()
      .then((savedProjects) => {
        if (isMounted) {
          replaceProjects(savedProjects);
          setLoadError(null);
        }
      })
      .catch((error) => {
        console.error("Failed to load projects from PocketBase:", error);
        if (isMounted) setLoadError("Your projects could not be loaded.");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [replaceProjects]);

  const createProject = useCallback(
    async (title: string, description: string) => {
      const normalizedTitle = title.trim();
      if (!normalizedTitle) return null;

      const project: Project = {
        id: createPocketBaseId(),
        title: normalizedTitle,
        description,
        createdAt: Date.now(),
        isDone: false,
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
    [replaceProjects],
  );

  const deleteProject = useCallback(
    async (projectId: string) => {
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
    [replaceProjects],
  );

  const setProjectDone = useCallback(
    async (projectId: string, isDone: boolean) => {
      const previousProject = projectsRef.current.find(
        (project) => project.id === projectId,
      );
      if (!previousProject) return false;

      replaceProjects(
        projectsRef.current.map((project) =>
          project.id === projectId ? { ...project, isDone } : project,
        ),
      );
      try {
        const record = await pb
          .collection(COLLECTIONS.projects)
          .update<ProjectRecord>(projectId, { isDone }, { requestKey: null });
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
    [replaceProjects],
  );

  const updateProject = useCallback(
    async (projectId: string, title: string, description: string) => {
      const normalizedTitle = title.trim();
      if (!normalizedTitle || normalizedTitle.length > 120) {
        throw new Error("Enter a project name up to 120 characters.");
      }
      const record = await pb
        .collection(COLLECTIONS.projects)
        .update<ProjectRecord>(
          projectId,
          { title: normalizedTitle, description },
          { requestKey: null },
        );
      const savedProject = projectFromRecord(record);
      replaceProjects(
        projectsRef.current.map((project) =>
          project.id === projectId ? savedProject : project,
        ),
      );
      return savedProject;
    },
    [replaceProjects],
  );

  return {
    projects,
    isLoading,
    loadError,
    createProject,
    deleteProject,
    setProjectDone,
    updateProject,
  };
}
