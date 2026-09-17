import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ReceiptText } from "lucide-react";
import { AppShell, ScreenHeader } from "@/components/captain/AppShell";
import { Chip, ChipRow } from "@/components/captain/Chip";
import { EmptyState } from "@/components/captain/States";
import { inr, timeOf } from "@/lib/captain/format";
import { orderTotals, useCaptain } from "@/lib/captain/store";
import type { Order } from "@/lib/captain/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/orders/")({
  head: () => ({
    meta: [
      { title: "Today's Orders — BillerPe Captain" },
      {
        name: "description",
        content:
          "Every dine-in and take away order opened today with rounds, totals and bill status.",
      },
    ],
  }),
  component: OrdersScreen,
});

const tabs: { id: "all" | Order["status"] | "takeaway"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "running", label: "Running" },
  { id: "held", label: "Hold" },
  { id: "billed", label: "Bill requested" },
  { id: "takeaway", label: "Take away" },
  { id: "cancelled", label: "Cancelled" },
];

function OrdersScreen() {
  const { orders, tableById, captain } = useCaptain();
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("all");

  const list = useMemo(
    () =>
      orders
        .filter((o) =>
          tab === "all" ? true : tab === "takeaway" ? o.type === "takeaway" : o.status === tab,
        )
        .slice()
        .sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1)),
    [orders, tab],
  );

  return (
    <AppShell
      header={
        <ScreenHeader
          title="Today's orders"
          subtitle={`${orders.length} orders today · ${captain?.name ?? ""}`}
        />
      }
    >
      <ChipRow>
        {tabs.map((t) => (
          <Chip key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </Chip>
        ))}
      </ChipRow>

      {list.length === 0 ? (
        <EmptyState icon={ReceiptText} title="Nothing in this tab yet" />
      ) : (
        <div className="mt-2 space-y-2 md:grid md:grid-cols-2 md:gap-2 md:space-y-0">
          {list.map((o) => {
            const totals = orderTotals(o);
            const total =
              o.status === "settled" || o.status === "cancelled"
                ? (o.serverTotal ?? totals.total)
                : totals.total;
            const label =
              o.type === "takeaway"
                ? `Take Away · ${o.customerName ?? "Pickup"}`
                : `Table ${
                    o.tableIds
                      .map((id) => tableById(id)?.name)
                      .filter(Boolean)
                      .join(" + ") ||
                    o.tableLabel ||
                    "—"
                  }`;
            const fired = o.rounds.filter((r) => r.firedAt).length;
            return (
              <Link
                key={o.id}
                to="/order/$orderId"
                params={{ orderId: o.id }}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-border bg-card p-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">{label}</p>
                  <p className="text-xs text-muted-foreground">
                    {timeOf(o.openedAt)} · {fired} round{fired === 1 ? "" : "s"} · {totals.items}{" "}
                    items
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold">{inr(total)}</p>
                  <p
                    className={cn(
                      "text-[11px] font-semibold capitalize",
                      o.status === "billed"
                        ? "text-st-billed"
                        : o.status === "held"
                          ? "text-st-held"
                          : o.status === "cancelled"
                            ? "text-destructive"
                            : "text-st-running",
                    )}
                  >
                    {o.status === "billed" ? "Bill requested" : o.status}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
