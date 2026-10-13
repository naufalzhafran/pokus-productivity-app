import lockup from "@/assets/brand/pokus-lockup-horizontal.svg";
import lockupOnDark from "@/assets/brand/pokus-lockup-horizontal-on-dark.svg";
import mark from "@/assets/brand/pokus-mark.svg";
import markOnDark from "@/assets/brand/pokus-mark-on-dark.svg";
import { cn } from "@/lib/utils";

/** Supplied brand artwork; the on-dark colorway swaps in with the `.dark` theme. */
export function PokusLogo({ variant = "lockup", className }: { variant?: "lockup" | "mark"; className?: string }) {
  const [light, dark] = variant === "mark" ? [mark, markOnDark] : [lockup, lockupOnDark];
  return <span role="img" aria-label="Pokus" className={cn("inline-flex shrink-0", className)}>
    <img src={light} alt="" className="h-full w-auto dark:hidden" draggable={false} />
    <img src={dark} alt="" className="hidden h-full w-auto dark:block" draggable={false} />
  </span>;
}
