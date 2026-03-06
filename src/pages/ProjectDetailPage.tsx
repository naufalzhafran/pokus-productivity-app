import { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getProjectWithTasks,
  createTask,
  deleteTask,
  toggleTaskComplete,
  ProjectWithTasks,
  Task,
} from "@/api/projects";
import { useAuth } from "@/hooks/useAuth";
import {
  ArrowLeft,
  Plus,
  Trash2,
  CheckCircle,
  Circle,
  Clock,
  Play,
} from "lucide-react";
import { createPortal } from "react-dom";

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectWithTasks | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (user && id) {
      fetchProject();
    }
  }, [user, id]);

  const fetchProject = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await getProjectWithTasks(id);
      setProject(data);
    } catch (error) {
      console.error("Failed to fetch project", error);
      navigate("/projects");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || !id) return;

    setCreating(true);
    try {
      await createTask(id, newTaskTitle.trim());
      setNewTaskTitle("");
      setShowCreateModal(false);
      fetchProject();
    } catch (error) {
      console.error("Failed to create task", error);
    } finally {
      setCreating(false);
    }
  };

  const handleToggleTask = async (taskId: string) => {
    try {
      await toggleTaskComplete(taskId);
      fetchProject();
    } catch (error) {
      console.error("Failed to toggle task", error);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm("Are you sure you want to delete this task?")) {
      return;
    }

    try {
      await deleteTask(taskId);
      fetchProject();
    } catch (error) {
      console.error("Failed to delete task", error);
    }
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground p-4 md:p-8 font-sans pb-24">
        <div className="max-w-3xl mx-auto text-center py-12 text-muted-foreground">
          Loading...
        </div>
      </div>
    );
  }

  if (!project) {
    return null;
  }

  const incompleteTasks = project.tasks.filter((t) => !t.is_completed);
  const completedTasks = project.tasks.filter((t) => t.is_completed);

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8 font-sans pb-24">
      <div className="max-w-3xl mx-auto space-y-8">
        <header className="flex items-center gap-4">
          <Link to="/projects">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {project.name}
            </h1>
            {project.description && (
              <p className="text-muted-foreground text-sm mt-1">
                {project.description}
              </p>
            )}
          </div>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Task
          </Button>
        </header>

        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg border border-border bg-card p-4 text-center">
            <div className="text-2xl font-bold text-foreground">
              {project.total_tasks}
            </div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">
              Total Tasks
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4 text-center">
            <div className="text-2xl font-bold text-emerald-500">
              {project.completed_tasks}
            </div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">
              Completed
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4 text-center">
            <div className="text-2xl font-bold text-foreground">
              {formatDuration(project.total_duration)}
            </div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">
              Total Time
            </div>
          </div>
        </div>

        {project.tasks.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-zinc-500" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">
              No tasks yet
            </h3>
            <p className="text-muted-foreground text-sm mb-6">
              Add tasks to start tracking time
            </p>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Task
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {incompleteTasks.length > 0 && (
              <section>
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  To Do
                </h2>
                <div className="rounded-lg border border-border bg-card divide-y divide-border">
                  {incompleteTasks.map((task) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      onToggle={() => handleToggleTask(task.id)}
                      onDelete={() => handleDeleteTask(task.id)}
                      onStartFocus={() =>
                        navigate(`/focus?taskId=${task.id}`)
                      }
                    />
                  ))}
                </div>
              </section>
            )}

            {completedTasks.length > 0 && (
              <section>
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Completed
                </h2>
                <div className="rounded-lg border border-border bg-card divide-y divide-border opacity-60">
                  {completedTasks.map((task) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      onToggle={() => handleToggleTask(task.id)}
                      onDelete={() => handleDeleteTask(task.id)}
                      onStartFocus={() =>
                        navigate(`/focus?taskId=${task.id}`)
                      }
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {showCreateModal && (
        <CreateTaskModal
          title={newTaskTitle}
          onChange={setNewTaskTitle}
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreateTask}
          loading={creating}
        />
      )}
    </div>
  );
}

interface TaskItemProps {
  task: Task;
  onToggle: () => void;
  onDelete: () => void;
  onStartFocus: () => void;
}

function TaskItem({ task, onToggle, onDelete, onStartFocus }: TaskItemProps) {
  return (
    <div className="flex items-center justify-between p-4 group">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <button
          onClick={onToggle}
          className="flex-shrink-0 text-zinc-500 hover:text-emerald-500 transition-colors"
        >
          {task.is_completed ? (
            <CheckCircle className="w-5 h-5 text-emerald-500" />
          ) : (
            <Circle className="w-5 h-5" />
          )}
        </button>
        <div className="min-w-0">
          <h3
            className={`font-medium truncate ${
              task.is_completed ? "line-through text-muted-foreground" : "text-foreground"
            }`}
          >
            {task.title}
          </h3>
          {task.description && (
            <p className="text-sm text-muted-foreground truncate">
              {task.description}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {task.duration_minutes > 0 && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDuration(task.duration_minutes)}
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onStartFocus}
          title="Start focus session"
        >
          <Play className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          title="Delete task"
        >
          <Trash2 className="w-4 h-4 text-red-400" />
        </Button>
      </div>
    </div>
  );
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

interface CreateTaskModalProps {
  title: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  loading: boolean;
}

function CreateTaskModal({
  title,
  onChange,
  onClose,
  onSubmit,
  loading,
}: CreateTaskModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card text-foreground border border-border rounded-lg p-6 md:p-8 max-w-md w-full space-y-6 animate-in fade-in zoom-in-95 duration-200">
        <div>
          <h3 className="text-2xl font-bold">Add Task</h3>
          <p className="text-muted-foreground text-sm mt-1">
            What do you want to work on?
          </p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Task</label>
            <Input
              value={title}
              onChange={(e) => onChange(e.target.value)}
              placeholder="Complete the report"
              autoFocus
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
              disabled={!title.trim() || loading}
            >
              {loading ? "Adding..." : "Add Task"}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
