import { ProjectTasks, type ProjectTasksProps } from "@/components/features/ProjectTasks";

/** Every task in one list, across projects; the shell supplies the page heading. */
export function TasksPage(props: Omit<ProjectTasksProps, "project">) {
  return <section aria-label="All tasks" className="screen-panel">
    <ProjectTasks {...props} project="all" />
  </section>;
}
