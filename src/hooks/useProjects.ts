import { useCallback, useEffect, useState } from "react";
import type { Project } from "@/types/task";

const PROJECTS_STORAGE_KEY = "pokus_projects_v1";

function parseProject(value: unknown): Project | null {
  if (!value || typeof value !== "object") return null;

  const project = value as Partial<Project>;
  if (
    typeof project.id !== "string" ||
    typeof project.title !== "string" ||
    project.title.trim().length === 0 ||
    typeof project.createdAt !== "number"
  ) {
    return null;
  }

  return {
    id: project.id,
    title: project.title.trim(),
    createdAt: project.createdAt,
    isDone: typeof project.isDone === "boolean" ? project.isDone : false,
  };
}

function loadProjects() {
  try {
    const savedProjects = localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (!savedProjects) return [];

    const parsedProjects: unknown = JSON.parse(savedProjects);
    if (!Array.isArray(parsedProjects)) return [];

    return parsedProjects.reduce<Project[]>((validProjects, project) => {
      const parsedProject = parseProject(project);
      if (parsedProject) validProjects.push(parsedProject);
      return validProjects;
    }, []);
  } catch (error) {
    console.error("Failed to load projects:", error);
    return [];
  }
}

function createProjectId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `project-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>(loadProjects);

  useEffect(() => {
    try {
      localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
    } catch (error) {
      console.error("Failed to save projects:", error);
    }
  }, [projects]);

  const createProject = useCallback((title: string) => {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) return null;

    const project: Project = {
      id: createProjectId(),
      title: normalizedTitle,
      createdAt: Date.now(),
      isDone: false,
    };

    setProjects((currentProjects) => [project, ...currentProjects]);
    return project;
  }, []);

  const deleteProject = useCallback((projectId: string) => {
    setProjects((currentProjects) =>
      currentProjects.filter((project) => project.id !== projectId),
    );
  }, []);

  const setProjectDone = useCallback((projectId: string, isDone: boolean) => {
    setProjects((currentProjects) =>
      currentProjects.map((project) =>
        project.id === projectId ? { ...project, isDone } : project,
      ),
    );
  }, []);

  return { projects, createProject, deleteProject, setProjectDone };
}
