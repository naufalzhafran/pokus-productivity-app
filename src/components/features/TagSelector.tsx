import { cn } from "@/lib/utils";

export const PREDEFINED_TAGS = ["WORK", "STUDY", "SIDES", "CHORES"] as const;
export type PredefinedTag = (typeof PREDEFINED_TAGS)[number];

interface TagSelectorProps {
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  className?: string;
}

export function TagSelector({
  selectedTags,
  onTagsChange,
  className,
}: TagSelectorProps) {
  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      onTagsChange(selectedTags.filter((t) => t !== tag));
    } else {
      onTagsChange([...selectedTags, tag]);
    }
  };

  return (
    <div className={cn("flex flex-wrap gap-2 justify-center", className)}>
      {PREDEFINED_TAGS.map((tag) => {
        const isSelected = selectedTags.includes(tag);

        return (
          <button
            key={tag}
            type="button"
            onClick={() => toggleTag(tag)}
            className={cn(
              "px-4 py-2 rounded-lg font-medium text-sm transition-colors border",
              isSelected
                ? "bg-white/10 text-zinc-100 border-zinc-600"
                : "bg-white/5 border-transparent text-zinc-400 hover:bg-white/10 hover:text-zinc-300",
            )}
          >
            {tag}
          </button>
        );
      })}
    </div>
  );
}

/** Display-only tag pills for showing tags in lists */
interface TagDisplayProps {
  tags: string[];
  size?: "sm" | "md";
  className?: string;
}

export function TagDisplay({ tags, size = "sm", className }: TagDisplayProps) {
  if (!tags || tags.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {tags.map((tag) => (
        <span
          key={tag}
          className={cn(
            "rounded-md font-medium bg-white/5 text-zinc-400",
            size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs",
          )}
        >
          {tag}
        </span>
      ))}
    </div>
  );
}
