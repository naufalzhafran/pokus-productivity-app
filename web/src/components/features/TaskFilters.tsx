import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface TaskFilterSelect {
  key: string;
  label: string;
  value: string;
  items: Record<string, string>;
  width: string;
  onChange: (value: string) => void;
}

/** A project's task filter and sort selects: a row on wider screens, labeled fields in the phone sheet. */
export function TaskFilters({ filters, stacked = false }: { filters: TaskFilterSelect[]; stacked?: boolean }) {
  return filters.map((filter) => {
    const select = <Select key={filter.key} items={filter.items} value={filter.value} onValueChange={(value) => filter.onChange(value as string)}>
      <SelectTrigger aria-label={filter.label} className={stacked ? "w-full" : filter.width}><SelectValue /></SelectTrigger>
      <SelectContent><SelectGroup>{Object.entries(filter.items).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectGroup></SelectContent>
    </Select>;
    return stacked ? <Field key={filter.key}><FieldLabel>{filter.label}</FieldLabel>{select}</Field> : select;
  });
}
