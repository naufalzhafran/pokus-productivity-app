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
}

export function ProjectCombobox({
  id,
  projects,
  value,
  onValueChange,
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
    >
      <ComboboxInput
        id={id}
        className="w-full"
        placeholder="Search projects..."
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
