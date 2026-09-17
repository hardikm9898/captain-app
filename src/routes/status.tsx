import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Soup } from "lucide-react";
import { AppShell, ScreenHeader } from "@/components/captain/AppShell";
import { Chip, ChipRow } from "@/components/captain/Chip";
import { StatusBadge } from "@/components/captain/StatusBadge";
import { EmptyState } from "@/components/captain/States";
import { elapsed } from "@/lib/captain/format";
import { useCaptain } from "@/lib/captain/store";
import type { KotStatus } from "@/lib/captain/types";

export const Route = createFileRoute("/status")({
  head: () => ({
    meta: [
      { title: "Order Status — BillerPe Captain" },
      {
        name: "description",
        content:
          "Live KOT round tracker showing what the kitchen has accepted, is preparing, or has ready.",
      },
    ],
  }),
  component: StatusScreen,
});

const filters: { id: "all" | KotStatus; label: string }[] = [
  { id: "all", label: "All" },
  { id: "printed", label: "Sent" },
  { id: "accepted", label: "Accepted" },
  { id: "preparing", label: "Preparing" },
  { id: "ready", label: "Ready" },
  { id: "served", label: "Served" },
];

function StatusScreen() {
  const { orders, tableById } = useCaptain();
  const [filter, setFilter] = useState<"all" | KotStatus>("all");

  const rows = useMemo(
    () =>
      orders
        .filter((o) => o.status !== "cancelled")
        .flatMap((o) => o.rounds.filter((r) => r.firedAt).map((r) => ({ order: o, round: r })))
        .filter((r) => filter === "all" || r.round.status === filter)
        .sort((a, b) => (a.round.firedAt! < b.round.firedAt! ? 1 : -1)),
    [orders, filter],
  );

  return (
    <AppShell
      header={<ScreenHeader title="Order status" subtitle="Live KOT rounds from the kitchen" />}
    >
      <ChipRow>
        {filters.map((f) => (
          <Chip key={f.id} active={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label}
          </Chip>
        ))}
      </ChipRow>

      {rows.length === 0 ? (
        <EmptyState
          icon={Soup}
          title="No rounds here"
          body="Fired KOT rounds and their kitchen progress appear on this screen."
        />
      ) : (
        <div className="mt-2 space-y-2 md:grid md:grid-cols-2 md:gap-2 md:space-y-0 md:items-start">
          {rows.map(({ order, round }) => {
            const label =
              order.type === "takeaway"
                ? `Take Away · ${order.customerName}`
                : `Table ${
                    order.tableIds
                      .map((id) => tableById(id)?.name)
                      .filter(Boolean)
                      .join(" + ") ||
                    order.tableLabel ||
                    "—"
                  }`;
            return (
              <Link
                key={`${order.id}-${round.no}`}
                to="/order/$orderId"
                params={{ orderId: order.id }}
                className="block rounded-2xl border border-border bg-card p-4"
              >
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{label}</p>
                    <p className="text-xs text-muted-foreground">
                      Round {round.no} · fired {elapsed(round.firedAt!)} ago ·{" "}
                      {round.stations.join(", ")}
                    </p>
                  </div>
                  <StatusBadge kind="kot" status={round.status} />
                </div>
                <ul className="mt-3 space-y-1 border-t border-border pt-3">
                  {round.lines.map((l) => (
                    <li key={l.id} className="flex items-start justify-between gap-3 text-sm">
                      <span className="min-w-0">
                        <span className="font-medium">{l.qty}×</span> {l.name}
                        {l.variantName ? ` (${l.variantName})` : ""}
                        {l.note ? (
                          <span className="block text-xs text-st-held">Note: {l.note}</span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{l.station}</span>
                    </li>
                  ))}
                </ul>
              </Link>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
