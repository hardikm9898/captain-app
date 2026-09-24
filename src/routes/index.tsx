import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "motion/react";
import {
  Bell,
  CalendarClock,
  LayoutGrid,
  RefreshCw,
  Search,
  ShoppingBag,
  Users,
} from "lucide-react";
import { AppShell, ScreenHeader } from "@/components/captain/AppShell";
import { Chip, ChipRow } from "@/components/captain/Chip";
import { EmptyState, LoadingState } from "@/components/captain/States";
import { StatusBadge, tableStatusMeta } from "@/components/captain/StatusBadge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { elapsed, inr } from "@/lib/captain/format";
import { orderTotals, useCaptain } from "@/lib/captain/store";
import type { TableStatus } from "@/lib/captain/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Table Grid — BillerPe Captain" },
      {
        name: "description",
        content:
          "Every table in the outlet with live status, guest count and elapsed time — tap to start or open an order.",
      },
    ],
  }),
  component: TableGrid,
});

const filters: ("all" | TableStatus)[] = ["all", "free", "running", "billed", "reserved"];

function TableGrid() {
  const {
    tables,
    areas,
    orderForTable,
    startOrder,
    captain,
    unreadCount,
    blocked,
    refresh,
    refreshing,
    booting,
    outlet,
  } = useCaptain();
  const navigate = useNavigate();
  const [area, setArea] = useState<string>("all");
  const [filter, setFilter] = useState<"all" | TableStatus>("all");
  const [query, setQuery] = useState("");

  const shown = tables.filter((t) => {
    if (area !== "all" && t.areaId !== area) return false;
    if (filter !== "all" && t.status !== filter) return false;
    if (query && !t.name.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  const openTable = (tableId: string) => {
    if (blocked) return;
    const existing = orderForTable(tableId);
    if (existing) {
      navigate({ to: "/order/$orderId", params: { orderId: existing.id } });
      return;
    }
    // A free table skips a separate guest-count step and goes straight into
    // the menu - guests are set from there (tap the guest count in the
    // header) once the captain actually knows the party size, not guessed
    // up front before even seeing the table.
    const started = startOrder({ tableId, guests: 2 });
    navigate({ to: "/order/$orderId", params: { orderId: started.id } });
  };

  return (
    <AppShell
      header={
        <ScreenHeader
          title="Tables"
          subtitle={captain ? `${captain.name} · ${captain.role}` : outlet.name}
          right={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="relative h-10 w-10"
                onClick={() => navigate({ to: "/notifications" })}
                aria-label="Notifications"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 ? (
                  <span className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[9px] font-bold text-brand-foreground">
                    {unreadCount}
                  </span>
                ) : null}
              </Button>
              <Button
                className="h-10"
                onClick={() => navigate({ to: "/takeaway" })}
                disabled={blocked}
              >
                <ShoppingBag className="mr-1.5 h-4 w-4" /> Take Away
              </Button>
            </div>
          }
        />
      }
    >
      <div className="relative">
        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search table (A1, G3…)"
          className="h-12 pl-9"
          inputMode="search"
        />
      </div>

      <ChipRow className="mt-3">
        <Chip active={area === "all"} onClick={() => setArea("all")}>
          All areas
        </Chip>
        {areas.map((a) => (
          <Chip key={a.id} active={area === a.id} onClick={() => setArea(a.id)}>
            {a.name}
          </Chip>
        ))}
      </ChipRow>

      <ChipRow>
        {filters.map((f) => (
          <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
            {f === "all" ? "All" : tableStatusMeta[f].label}
          </Chip>
        ))}
      </ChipRow>

      <button
        type="button"
        onClick={async () => {
          await refresh();
          toast.success("Floor refreshed from local server");
        }}
        className="mt-1 flex w-full items-center justify-center gap-1.5 py-2 text-xs font-medium text-muted-foreground"
      >
        <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
        {refreshing ? "Refreshing…" : "Tap to refresh"}
      </button>

      {tables.length === 0 && booting ? (
        <LoadingState label="Loading tables" />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title={tables.length === 0 ? "No tables yet" : "No tables match"}
          body={
            tables.length === 0
              ? "Add tables from the BillerPe Web POS."
              : "Try another area or filter."
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {shown.map((t) => {
            // Only an order the exe has (KOT / save / hold) shows on the card; a
            // draft still in this phone's cart leaves the table looking free.
            const found = orderForTable(t.id);
            const order = found && !found.id.startsWith("draft-") ? found : undefined;
            const meta = tableStatusMeta[t.status];
            const totals = order ? orderTotals(order) : null;
            return (
              <motion.button
                key={t.id}
                layout
                whileTap={{ scale: 0.97 }}
                type="button"
                onClick={() => openTable(t.id)}
                className={cn(
                  "min-h-28 rounded-2xl border bg-card p-3 text-left",
                  order ? "border-transparent shadow-sm" : "border-border",
                )}
                style={{ borderLeftColor: `var(--st-${t.status})`, borderLeftWidth: order ? 4 : 1 }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold">{t.name}</p>
                    <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Users className="h-3 w-3" />{" "}
                      {order && order.guests
                        ? `${order.guests}${t.seats ? `/${t.seats}` : ""}`
                        : t.seats || "—"}
                    </p>
                  </div>
                  <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", meta.dot)} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={t.status} />
                  {order ? (
                    <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
                      {elapsed(order.openedAt)}
                    </span>
                  ) : null}
                </div>
                {totals && totals.items > 0 ? (
                  <p className="mt-1.5 text-xs font-semibold tabular-nums">{inr(totals.total)}</p>
                ) : null}
                {t.reservedToday || t.reservedName ? (
                  <p className="mt-1 flex items-center gap-1 truncate text-[10px] font-medium text-st-reserved">
                    <CalendarClock className="h-3 w-3 shrink-0" />
                    {t.reservedToday
                      ? `Reserved ${t.reservedToday}`
                      : `Reserved · ${t.reservedName}`}
                  </p>
                ) : null}
              </motion.button>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
