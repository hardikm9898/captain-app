import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function QtyStepper({
  value,
  onChange,
  min = 0,
  size = "md",
  className,
  disabled,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
  disabled?: boolean;
}) {
  const btn = size === "lg" ? "h-12 w-12" : size === "sm" ? "h-8 w-8" : "h-10 w-10";
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border bg-card p-1",
        disabled && "opacity-50",
        className,
      )}
    >
      <button
        type="button"
        aria-label="Decrease quantity"
        disabled={disabled || value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className={cn(
          btn,
          "grid place-items-center rounded-full bg-secondary text-secondary-foreground transition active:scale-95 disabled:opacity-40",
        )}
      >
        <Minus className="h-4 w-4" />
      </button>
      <span
        className={cn(
          "min-w-8 text-center font-semibold tabular-nums",
          size === "lg" ? "text-lg" : "text-sm",
        )}
      >
        {value}
      </span>
      <button
        type="button"
        aria-label="Increase quantity"
        disabled={disabled}
        onClick={() => onChange(value + 1)}
        className={cn(
          btn,
          "grid place-items-center rounded-full bg-brand text-brand-foreground transition active:scale-95",
        )}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
