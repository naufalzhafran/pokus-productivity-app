import { cn } from "@/lib/utils";

export const PREDEFINED_TAGS = ["WORK", "STUDY", "SIDES", "CHORES"] as const;
export type PredefinedTag = (typeof PREDEFINED_TAGS)[number];

const TAG_COLORS: Record<
  PredefinedTag,
  { bg: string; border: string; text: string }
> = {
  WORK: {
    bg: "bg-cyan-500/20",
    border: "border-cyan-400",
    text: "text-cyan-400",
  },
  STUDY: {
    bg: "bg-violet-500/20",
    border: "border-violet-400",
    text: "text-violet-400",
  },
  SIDES: {
    bg: "bg-amber-500/20",
    border: "border-amber-400",
    text: "text-amber-400",
  },
  CHORES: {
    bg: "bg-emerald-500/20",
    border: "border-emerald-400",
    text: "text-emerald-400",
  },
};

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
        const colors = TAG_COLORS[tag];

        return (
          <button
            key={tag}
            type="button"
            onClick={() => toggleTag(tag)}
            className={cn(
              "px-4 py-2 rounded-full font-medium text-sm transition-all duration-200 border-2",
              isSelected
                ? `${colors.bg} ${colors.border} ${colors.text}`
                : "bg-white/5 border-transparent text-white/60 hover:bg-white/10 hover:text-white/80",
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
      {tags.map((tag) => {
        const colors = TAG_COLORS[tag as PredefinedTag] || {
          bg: "bg-slate-500/20",
          border: "border-slate-400",
          text: "text-slate-400",
        };

        return (
          <span
            key={tag}
            className={cn(
              "rounded-full font-medium",
              colors.bg,
              colors.text,
              size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs",
            )}
          >
            {tag}
          </span>
        );
      })}
    </div>
  );
}
