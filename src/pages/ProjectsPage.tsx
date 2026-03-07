import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getProjects,
  createProject,
  deleteProject,
  Project,
} from "@/api/projects";
import { useAuth } from "@/hooks/useAuth";
import {
  Folder,
  Plus,
  Trash2,
  History,
  RefreshCw,
} from "lucide-react";
import { createPortal } from "react-dom";

export default function ProjectsPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const hasInitialLoad = useRef(false);

  const fetchProjects = useCallback(async (showLoading = false) => {
    if (showLoading) {
      setIsRefreshing(true);
    }
    try {
      const data = await getProjects();
      setProjects(data || []);
    } catch (error) {
      console.error("Failed to fetch projects", error);
    } finally {
      setIsRefreshing(false);
      setIsInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user && !hasInitialLoad.current) {
      hasInitialLoad.current = true;
      fetchProjects(false);
    }
  }, [user, fetchProjects]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    setCreating(true);
    try {
      await createProject(newProjectName.trim(), newProjectDescription.trim());
      setNewProjectName("");
      setNewProjectDescription("");
      setShowCreateModal(false);
      fetchProjects();
    } catch (error) {
      console.error("Failed to create project", error);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (!confirm("Are you sure you want to delete this project? All tasks will also be deleted.")) {
      return;
    }

    try {
      await deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (error) {
      console.error("Failed to delete project", error);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8 font-sans pb-24">
      <div className="max-w-3xl mx-auto space-y-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Projects
              </h1>
              <p className="text-muted-foreground text-sm mt-1">
                Organize your work into projects
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchProjects(true)}
              disabled={isRefreshing}
              className="text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
              {isRefreshing ? "Syncing" : "Sync"}
            </Button>
            <Link to="/history">
              <Button variant="outline">
                <History className="w-4 h-4 mr-2" />
                History
              </Button>
            </Link>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="w-4 h-4 mr-2" />
              New Project
            </Button>
          </div>
        </header>

        {isInitialLoading ? (
          <div className="grid gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-lg border border-border bg-card p-4 animate-pulse"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-zinc-800" />
                  <div className="space-y-2">
                    <div className="h-4 w-32 bg-zinc-800 rounded" />
                    <div className="h-3 w-48 bg-zinc-800/50 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-4">
              <Folder className="w-8 h-8 text-zinc-500" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">
              No projects yet
            </h3>
            <p className="text-muted-foreground text-sm mb-6">
              Create your first project to start organizing tasks
            </p>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Project
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            {projects.map((project) => (
              <Link
                key={project.id}
                to={`/projects/${project.id}`}
                className="block group"
              >
                <div className="rounded-lg border border-border bg-card p-4 hover:border-zinc-600 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center">
                        <Folder className="w-5 h-5 text-zinc-400" />
                      </div>
                      <div>
                        <h3 className="font-medium text-foreground">
                          {project.name}
                        </h3>
                        {project.description && (
                          <p className="text-sm text-muted-foreground line-clamp-1">
                            {project.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.preventDefault();
                          handleDeleteProject(project.id);
                        }}
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </Button>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {showCreateModal && (
        <CreateProjectModal
          name={newProjectName}
          description={newProjectDescription}
          onNameChange={setNewProjectName}
          onDescriptionChange={setNewProjectDescription}
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreateProject}
          loading={creating}
        />
      )}
    </div>
  );
}

interface CreateProjectModalProps {
  name: string;
  description: string;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  loading: boolean;
}

function CreateProjectModal({
  name,
  description,
  onNameChange,
  onDescriptionChange,
  onClose,
  onSubmit,
  loading,
}: CreateProjectModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card text-foreground border border-border rounded-lg p-6 md:p-8 max-w-md w-full space-y-6 animate-in fade-in zoom-in-95 duration-200">
        <div>
          <h3 className="text-2xl font-bold">Create Project</h3>
          <p className="text-muted-foreground text-sm mt-1">
            Give your project a name and description
          </p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Name</label>
            <Input
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="My Project"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Description (optional)</label>
            <Input
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="What is this project about?"
            />
          </div>
          <div className="flex gap-4 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="w-full"
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="w-full"
              disabled={!name.trim() || loading}
            >
              {loading ? "Creating..." : "Create"}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
