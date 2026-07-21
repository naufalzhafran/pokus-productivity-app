import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
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
      <ComboboxInput
        id={id}
        className="w-full"
        placeholder="Search projects..."
        disabled={disabled}
      />
      <ComboboxContent>
        <ComboboxEmpty>No projects found.</ComboboxEmpty>
        <ComboboxList>
          {(option: ProjectOption) => (
            <ComboboxItem key={option.value ?? "none"} value={option}>
              {option.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
