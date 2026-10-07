import { Tag } from "lucide-react";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxTrigger, ComboboxValue } from "@/components/ui/combobox";
import type { Category } from "@/types/task";

interface Option { label: string; value: string | null; color?: Category["color"] }
interface Props { id: string; categories: Category[]; value: string | null; onValueChange: (id: string | null) => void; disabled?: boolean }
function Content({ option }: { option: Option }) { return <><Tag className="shrink-0" /><span className="min-w-0 flex-1 truncate">{option.label}</span>{option.color ? <span className="text-xs text-muted-foreground">{option.color}</span> : null}</>; }
export function CategoryCombobox({ id, categories, value, onValueChange, disabled }: Props) {
  const options: Option[] = [{ label: "No category", value: null }, ...categories.map((category) => ({ label: category.name, value: category.id, color: category.color }))];
  const selected = options.find((option) => option.value === value) ?? options[0];
  return <Combobox items={options} value={selected} onValueChange={(option) => onValueChange(option?.value ?? null)} itemToStringValue={(option) => option.label} disabled={disabled}><ComboboxTrigger id={id} className="flex h-8 w-full items-center gap-2 rounded-2xl border px-3" disabled={disabled}><ComboboxValue>{(option: Option) => <Content option={option} />}</ComboboxValue></ComboboxTrigger><ComboboxContent aria-label="Select category"><ComboboxInput aria-label="Search categories" placeholder="Search categories…" showTrigger={false} /><ComboboxEmpty>No categories found.</ComboboxEmpty><ComboboxList>{(option: Option) => <ComboboxItem key={option.value ?? "none"} value={option}><Content option={option} /></ComboboxItem>}</ComboboxList></ComboboxContent></Combobox>;
}
