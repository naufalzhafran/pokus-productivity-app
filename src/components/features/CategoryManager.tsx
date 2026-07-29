import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Category, CategoryColor, CategoryInput, Task } from "@/types/task";

const colors: CategoryColor[] = ["slate", "red", "orange", "amber", "green", "teal", "blue", "violet", "pink"];
const colorLabels = Object.fromEntries(colors.map((color) => [color, color[0].toUpperCase() + color.slice(1)]));
interface Props { categories: Category[]; tasks: Task[]; onUpdate: (id: string, input: CategoryInput) => Promise<unknown>; onDelete: (id: string) => Promise<unknown> }

export function CategoryManager({ categories, tasks, onUpdate, onDelete }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState<CategoryColor>("blue");
  const [error, setError] = useState<string | null>(null);

  return <div className="flex flex-col gap-3"><p className="text-sm text-muted-foreground">Rename, recolor, or remove reusable task categories.</p>{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}<ul className="divide-y rounded-2xl border">{categories.map((category) => {
    const count = tasks.filter((task) => task.categoryId === category.id).length;
    return <li key={category.id} className="flex flex-wrap items-center gap-2 p-3">{editing === category.id ? <><Input aria-label={`Name for ${category.name}`} value={name} onChange={(event) => setName(event.target.value)} className="min-w-40 flex-1" /><Select items={colorLabels} value={color} onValueChange={(value) => setColor(value as CategoryColor)}><SelectTrigger aria-label="Category color" className="w-28"><SelectValue /></SelectTrigger><SelectContent>{colors.map((value) => <SelectItem key={value} value={value}>{colorLabels[value]}</SelectItem>)}</SelectContent></Select><Button size="sm" onClick={() => void onUpdate(category.id, { name, color }).then(() => setEditing(null)).catch((caught) => setError(caught instanceof Error ? caught.message : "Could not save category."))}>Save</Button></> : <><span className="size-3 rounded-full border" data-color={category.color} aria-hidden="true" /><span className="flex-1 font-medium">{category.name}</span><span className="text-xs text-muted-foreground">{count} {count === 1 ? "task" : "tasks"}</span><Button variant="ghost" size="icon-sm" aria-label={`Edit ${category.name}`} onClick={() => { setEditing(category.id); setName(category.name); setColor(category.color); }}><Pencil /></Button><Button variant="ghost" size="icon-sm" aria-label={`Delete ${category.name}`} onClick={() => { if (window.confirm(`Delete ${category.name}? ${count} affected ${count === 1 ? "task becomes" : "tasks become"} uncategorized.`)) void onDelete(category.id); }}><Trash2 /></Button></>}</li>;
  })}</ul>{categories.length === 0 ? <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">No categories yet. Create one while editing a task.</p> : null}</div>;
}
