import { Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Category, CategoryColor } from "@/types/task";

const categoryPillStyles: Record<CategoryColor, string> = {
  slate: "bg-slate-100 text-slate-800 dark:bg-slate-950 dark:text-slate-200",
  red: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  orange: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  green: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
  teal: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200",
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  violet: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  pink: "bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-200",
};

/** A category's name in its color, as shown on task rows and project cards. */
export function CategoryPill({ category, className }: { category: Category; className?: string }) {
  return (
    <span className={cn("flex min-w-0 items-center gap-1 rounded-full px-2 py-0.5", categoryPillStyles[category.color], className)}>
      <Tag className="size-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{category.name}</span>
    </span>
  );
}
