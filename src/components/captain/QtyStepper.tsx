import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseQty, roundQty, sanitizeQtyInput } from "@/lib/captain/qty";

export function QtyStepper({
  value,
  onChange,
  min = 0,
  size = "md",
  className,
  disabled,
  editable,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
  disabled?: boolean;
  /**
   * Item quantities: tap the number to type it (10 instead of ten taps, or
   * 1.5 - up to 2 decimals). Guest counts stay +/- only.
   */
  editable?: boolean;
}) {
  const btn = size === "lg" ? "h-12 w-12" : size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    const typed = parseQty(draft);
    setDraft(null);
    // Nothing usable typed, or 0 where the stepper cannot go to 0: keep it.
    if (typed === null || typed === value || (typed <= 0 && min > 0)) return;
    onChange(Math.max(0, typed));
  };

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
        onClick={() => onChange(Math.max(min, roundQty(value - 1)))}
        className={cn(
          btn,
          "grid place-items-center rounded-full bg-secondary text-secondary-foreground transition active:scale-95 disabled:opacity-40",
        )}
      >
        <Minus className="h-4 w-4" />
      </button>
      {editable && draft !== null ? (
        <input
          autoFocus
          inputMode="decimal"
          aria-label="Quantity"
          value={draft}
          onChange={(e) => setDraft(sanitizeQtyInput(e.target.value))}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setDraft(null);
          }}
          className={cn(
            "w-14 rounded-md border border-brand bg-background text-center font-semibold tabular-nums outline-none",
            size === "lg" ? "h-10 text-lg" : "h-7 text-sm",
          )}
        />
      ) : editable ? (
        <button
          type="button"
          disabled={disabled}
          aria-label="Type quantity"
          onClick={() => setDraft(String(value))}
          className={cn(
            "min-w-8 text-center font-semibold tabular-nums underline decoration-dotted underline-offset-4",
            size === "lg" ? "text-lg" : "text-sm",
          )}
        >
          {value}
        </button>
      ) : (
        <span
          className={cn(
            "min-w-8 text-center font-semibold tabular-nums",
            size === "lg" ? "text-lg" : "text-sm",
          )}
        >
          {value}
        </span>
      )}
      <button
        type="button"
        aria-label="Increase quantity"
        disabled={disabled}
        onClick={() => onChange(roundQty(value + 1))}
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
