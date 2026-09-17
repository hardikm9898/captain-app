import { cn } from "@/lib/utils";
import type { KotStatus, TableStatus } from "@/lib/captain/types";

export const tableStatusMeta: Record<TableStatus, { label: string; cls: string; dot: string }> = {
  free: { label: "Free", cls: "bg-st-free-soft text-st-free border-st-free/25", dot: "bg-st-free" },
  running: {
    label: "Running",
    cls: "bg-st-running-soft text-st-running border-st-running/25",
    dot: "bg-st-running",
  },
  held: { label: "Hold", cls: "bg-st-held-soft text-st-held border-st-held/25", dot: "bg-st-held" },
  billed: {
    label: "Bill Generated",
    cls: "bg-st-billed-soft text-st-billed border-st-billed/25",
    dot: "bg-st-billed",
  },
  reserved: {
    label: "Reserved",
    cls: "bg-st-reserved-soft text-st-reserved border-st-reserved/25",
    dot: "bg-st-reserved",
  },
};

export const kotStatusMeta: Record<KotStatus, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-st-held-soft text-st-held border-st-held/25" },
  printed: { label: "Printed", cls: "bg-st-reserved-soft text-st-reserved border-st-reserved/25" },
  accepted: { label: "Accepted", cls: "bg-st-running-soft text-st-running border-st-running/25" },
  preparing: { label: "Preparing", cls: "bg-st-billed-soft text-st-billed border-st-billed/25" },
  ready: { label: "Ready", cls: "bg-st-free-soft text-st-free border-st-free/30 font-semibold" },
  served: { label: "Served", cls: "bg-st-cancelled-soft text-st-cancelled border-st-cancelled/25" },
  cancelled: {
    label: "Cancelled",
    cls: "bg-st-cancelled-soft text-st-cancelled border-st-cancelled/25",
  },
};

export function StatusBadge({
  status,
  kind = "table",
  className,
}: {
  status: TableStatus | KotStatus;
  kind?: "table" | "kot";
  className?: string;
}) {
  const meta =
    kind === "table" ? tableStatusMeta[status as TableStatus] : kotStatusMeta[status as KotStatus];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        meta.cls,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}
