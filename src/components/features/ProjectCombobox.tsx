import { Folder, Inbox } from "lucide-react";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from "@/components/ui/combobox";
import type { Project } from "@/types/task";

interface ProjectOption {
  label: string;
  value: string | null;
}

interface ProjectComboboxProps {
  id: string;
  projects: Project[];
  value: string | null;
  onValueChange: (projectId: string | null) => void;
  disabled?: boolean;
}

function ProjectOptionContent({ option }: { option: ProjectOption }) {
  return (
    <>
      {option.value ? (
        <Folder className="mt-0.5 shrink-0 text-muted-foreground" />
      ) : (
        <Inbox className="mt-0.5 shrink-0 text-muted-foreground" />
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-1 text-left">
        <span className="whitespace-pre-wrap font-medium [overflow-wrap:anywhere]">
          {option.label}
        </span>
        <span className="text-xs text-muted-foreground">
          {option.value ? "Project" : "Tasks without a project"}
        </span>
      </span>
    </>
  );
}

export function ProjectCombobox({
  id,
  projects,
  value,
  onValueChange,
  disabled = false,
}: ProjectComboboxProps) {
  const options: ProjectOption[] = [
    { label: "No project", value: null },
    ...projects.map((project) => ({
      label: project.title,
      value: project.id,
    })),
  ];
  const selectedOption =
    options.find((option) => option.value === value) ?? options[0];

  return (
    <Combobox
      items={options}
      value={selectedOption}
      onValueChange={(option) => onValueChange(option?.value ?? null)}
      itemToStringValue={(option) => option.label}
      disabled={disabled}
    >
      <ComboboxTrigger
        id={id}
        data-selected-project={selectedOption.value ?? "unassigned"}
        className="flex min-h-16 w-full items-start gap-2 rounded-2xl border border-border bg-card px-3 py-3 text-sm transition-[border-color,background-color,box-shadow] hover:bg-muted/40 focus-visible:border-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
      >
        <ComboboxValue>
          {(option: ProjectOption) => (
            <ProjectOptionContent option={option} />
          )}
        </ComboboxValue>
      </ComboboxTrigger>
      <ComboboxContent aria-label="Select project">
        <ComboboxInput
          aria-label="Search projects"
          placeholder="Search projects..."
          showTrigger={false}
          disabled={disabled}
        />
        <ComboboxEmpty>No projects found.</ComboboxEmpty>
        <ComboboxList>
          {(option: ProjectOption) => (
            <ComboboxItem
              key={option.value ?? "none"}
              value={option}
              data-project-option={option.value ?? "unassigned"}
              className="my-1 min-h-16 items-start rounded-2xl border border-border bg-card px-3 py-3 pr-10 data-highlighted:border-ring data-highlighted:bg-accent/50"
            >
              <ProjectOptionContent option={option} />
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
