import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function Chip({
  active,
  onClick,
  children,
  className,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 rounded-full border px-3.5 py-2 text-sm font-medium transition active:scale-[0.97]",
        active
          ? "border-brand bg-brand text-brand-foreground"
          : "border-border bg-card text-muted-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function ChipRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-1", className)}>
      {children}
    </div>
  );
}
