import { useState, useCallback, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { LayoutGrid, LogIn, ChevronDown, Folder, Check, Search, X } from "lucide-react";
import { createSession } from "@/api/focus";
import { getAllTasks, TaskWithProject } from "@/api/projects";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Input } from "@/components/ui/input";
import { CircularDurationInput } from "@/components/features/CircularDurationInput";
import { TagSelector } from "@/components/features/TagSelector";
import { useAuth } from "@/hooks/useAuth";

export default function FocusPage() {
  const [duration, setDuration] = useState(25);
  const [sessionName, setSessionName] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tasks, setTasks] = useState<TaskWithProject[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showTaskDropdown, setShowTaskDropdown] = useState(false);
  const [taskSearch, setTaskSearch] = useState("");
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const filteredTasks = useMemo(() => {
    if (!taskSearch.trim()) return tasks;
    const search = taskSearch.toLowerCase();
    return tasks.filter((t) => 
      t.title.toLowerCase().includes(search) || 
      t.project_name.toLowerCase().includes(search)
    );
  }, [tasks, taskSearch]);

  const selectedTask = tasks.find((t) => t.id === selectedTaskId);

  useEffect(() => {
    if (user) {
      fetchTasks();
    }
  }, [user]);

  useEffect(() => {
    const taskId = searchParams.get("taskId");
    if (taskId && tasks.length > 0) {
      setSelectedTaskId(taskId);
      const task = tasks.find((t) => t.id === taskId);
      if (task && !sessionName) {
        setSessionName(task.title);
      }
    }
  }, [searchParams, tasks]);

  const fetchTasks = async () => {
    try {
      const data = await getAllTasks();
      setTasks(data);
    } catch (error) {
      console.error("Failed to fetch tasks", error);
    }
  };

  const handleDurationChange = useCallback((val: number) => {
    setDuration(val);
  }, []);

  const handleStartSession = useCallback(async () => {
    const title = sessionName.trim() || "Focus Session";

    try {
      const session = await createSession(
        title,
        duration,
        selectedTags,
        selectedTaskId || undefined
      );

      navigate(`/focus/${session.id}`, {
        state: { session },
        viewTransition: true,
      });
    } catch (error) {
      console.error("Failed to create session:", error);
    }
  }, [sessionName, duration, selectedTags, selectedTaskId, navigate]);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col relative overflow-hidden font-sans">
      <nav className="flex justify-between items-center p-4 md:p-6 max-w-5xl mx-auto w-full z-10">
        <span className="font-bold text-lg tracking-tight text-foreground">
          POKUS
        </span>
        <div className="flex gap-4">
          {user ? (
            <>
              <Link to="/projects">
                <Button
                  variant="ghost"
                  className="text-muted-foreground hover:text-foreground flex items-center gap-2"
                >
                  <Folder size={16} />
                  Projects
                </Button>
              </Link>
              <Link to="/history">
                <Button
                  variant="ghost"
                  className="text-muted-foreground hover:text-foreground flex items-center gap-2"
                >
                  <LayoutGrid size={16} />
                  History
                </Button>
              </Link>
            </>
          ) : (
            <Link to="/login">
              <Button
                variant="ghost"
                className="text-muted-foreground hover:text-foreground flex items-center gap-2"
              >
                <LogIn size={16} />
                Sign in
              </Button>
            </Link>
          )}
        </div>
      </nav>

      <main className="flex-1 flex flex-col items-center justify-center p-4 z-10 w-full max-w-2xl mx-auto min-h-0">
        <div
          className="mb-8 md:mb-12 relative flex justify-center w-[80vw] max-w-[500px] aspect-square"
          style={
            {
              viewTransitionName: "focus-timer-container",
            } as React.CSSProperties
          }
        >
          <CircularDurationInput
            value={duration}
            onChange={handleDurationChange}
            size={500}
            strokeWidth={6}
            className="w-full h-full"
          >
            <div className="text-[15vw] md:text-[140px] font-semibold leading-none tracking-tight text-center select-none pointer-events-none">
              {duration.toString().padStart(2, "0")}:00
            </div>
          </CircularDurationInput>
        </div>

        <div className="w-full max-w-md space-y-4 mb-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground ml-1">
              Session Name
            </label>
            <Input
              type="text"
              placeholder="Focus Session"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
            />
          </div>
        </div>

        {user && tasks.length > 0 && (
          <div className="w-full max-w-md mb-6">
            <label className="text-sm font-medium text-muted-foreground ml-1 block mb-2">
              Task (optional)
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowTaskDropdown(!showTaskDropdown);
                  if (!showTaskDropdown) {
                    setTaskSearch("");
                  }
                }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-md border border-border bg-card text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {selectedTask ? (
                    <>
                      <span className="truncate">{selectedTask.title}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-300 flex-shrink-0">
                        {selectedTask.project_name}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Select a task...</span>
                  )}
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-muted-foreground transition-transform flex-shrink-0 ${
                    showTaskDropdown ? "rotate-180" : ""
                  }`}
                />
              </button>

              {showTaskDropdown && (
                <div className="absolute z-20 w-full mt-1 rounded-md border border-border bg-card shadow-lg">
                  <div className="p-2 border-b border-border">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Search tasks..."
                        value={taskSearch}
                        onChange={(e) => setTaskSearch(e.target.value)}
                        className="w-full pl-8 pr-8 py-1.5 rounded-md bg-zinc-800 border-none text-sm focus:outline-none focus:ring-1 focus:ring-zinc-600"
                        autoFocus
                      />
                      {taskSearch && (
                        <button
                          type="button"
                          onClick={() => setTaskSearch("")}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="max-h-64 overflow-auto py-1">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTaskId(null);
                        setShowTaskDropdown(false);
                        setTaskSearch("");
                      }}
                      className="w-full px-3 py-2 text-left text-sm text-muted-foreground hover:bg-zinc-800 flex items-center gap-2"
                    >
                      <Check
                        className={`w-4 h-4 ${!selectedTaskId ? "opacity-100" : "opacity-0"}`}
                      />
                      No task
                    </button>
                    {filteredTasks.length === 0 ? (
                      <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                        {taskSearch ? "No matching tasks" : "No tasks available"}
                      </div>
                    ) : (
                      filteredTasks.map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => {
                            setSelectedTaskId(task.id);
                            if (!sessionName) {
                              setSessionName(task.title);
                            }
                            setShowTaskDropdown(false);
                            setTaskSearch("");
                          }}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-800 flex items-center gap-2"
                        >
                          <Check
                            className={`w-4 h-4 flex-shrink-0 ${
                              selectedTaskId === task.id
                                ? "opacity-100"
                                : "opacity-0"
                            }`}
                          />
                          <span className="truncate">{task.title}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-300 flex-shrink-0 ml-auto">
                            {task.project_name}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="w-full max-w-md mb-10">
          <label className="text-sm font-medium text-muted-foreground ml-1 block mb-3">
            Tags (optional)
          </label>
          <TagSelector
            selectedTags={selectedTags}
            onTagsChange={setSelectedTags}
          />
        </div>

        <div className="flex items-center gap-4">
          <Button
            onClick={handleStartSession}
            disabled={duration <= 0}
            size="lg"
            className="h-14 px-8 text-lg font-semibold"
          >
            Start session
          </Button>
        </div>
      </main>
    </div>
  );
}
