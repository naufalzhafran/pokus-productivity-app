import { useDeferredValue, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

export interface ChecklistOption {
  id: string;
  label: string;
  hint?: string;
  icon?: ReactNode;
}

interface SearchableChecklistProps {
  legend: string;
  options: ChecklistOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  emptyText: string;
  disabled?: boolean;
  /** Visually hides the legend when a surrounding label already names the list. */
  hideLegend?: boolean;
}

/** A multi-select list of checkboxes with search once it grows; selected options stay on top. */
export function SearchableChecklist({ legend, options, selected, onChange, emptyText, disabled = false, hideLegend = false }: SearchableChecklistProps) {
  const [search, setSearch] = useState("");
  const needle = useDeferredValue(search).trim().toLocaleLowerCase();
  const visible = options
    .filter((option) => !needle || `${option.label} ${option.hint ?? ""}`.toLocaleLowerCase().includes(needle))
    .sort((a, b) => Number(selected.includes(b.id)) - Number(selected.includes(a.id)));
  const toggle = (id: string, checked: boolean) => onChange(checked ? [...selected, id] : selected.filter((value) => value !== id));

  return <fieldset className="flex min-w-0 flex-col gap-2" disabled={disabled}>
    <legend className={hideLegend ? "sr-only" : "mb-2 text-sm font-medium"}>{legend}{selected.length ? <span className="font-normal text-muted-foreground"> · {selected.length} selected</span> : null}</legend>
    {options.length > 6 ? <label className="relative">
      <span className="sr-only">Search {legend.toLocaleLowerCase()}</span>
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <Input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" className="pl-9" />
    </label> : null}
    <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto overscroll-contain rounded-2xl border p-1">
      {visible.map((option) => <label key={option.id} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl px-3 py-2 text-sm hover:bg-muted">
        <Checkbox className="mt-0.5" checked={selected.includes(option.id)} onCheckedChange={(checked) => toggle(option.id, Boolean(checked))} disabled={disabled} />
        {option.icon}
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 [overflow-wrap:anywhere]">{option.label}</span>
          {option.hint ? <span className="block truncate text-xs text-muted-foreground">{option.hint}</span> : null}
        </span>
      </label>)}
      {!visible.length ? <p className="px-3 py-4 text-center text-sm text-muted-foreground">{needle ? "No matches." : emptyText}</p> : null}
    </div>
  </fieldset>;
}
