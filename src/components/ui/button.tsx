import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const baseClasses =
  "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";

const variantClasses = {
  default: "bg-primary text-primary-foreground hover:bg-primary/80",
  outline: "border border-border bg-transparent hover:bg-white/5 hover:text-foreground",
  ghost: "hover:bg-white/5 hover:text-foreground",
};

const sizeClasses = {
  default: "h-10 px-6 py-2",
  lg: "h-12 rounded-lg px-8 text-base",
  icon: "h-10 w-10",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variantClasses;
  size?: keyof typeof sizeClasses;
}

export function Button({
  className,
  variant = "default",
  size = "default",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        baseClasses,
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      type={type}
      {...props}
    />
  );
}
