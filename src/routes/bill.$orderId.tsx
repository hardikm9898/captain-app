import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, BellRing, Loader2, Printer, Receipt } from "lucide-react";
import { AppShell, ScreenHeader } from "@/components/captain/AppShell";
import { EmptyState } from "@/components/captain/States";
import { Button } from "@/components/ui/button";
import { inr, timeOf } from "@/lib/captain/format";
import { orderTotals, useCaptain } from "@/lib/captain/store";
import { toast } from "sonner";

export const Route = createFileRoute("/bill/$orderId")({
  head: () => ({
    meta: [
      { title: "Bill Preview — BillerPe Captain" },
      {
        name: "description",
        content:
          "Round-wise bill preview with taxes and service charge; captains notify the cashier to settle.",
      },
    ],
  }),
  component: BillPreview,
});

function BillPreview() {
  const { orderId } = Route.useParams();
  const { orderById, tableById, requestBill, outlet, blocked } = useCaptain();
  const navigate = useNavigate();
  const order = orderById(orderId);
  const [busy, setBusy] = useState(false);

  if (!order) {
    return (
      <AppShell header={<ScreenHeader title="Bill preview" />}>
        <EmptyState icon={Receipt} title="Order not found" />
      </AppShell>
    );
  }

  const t = orderTotals(order);
  const tableLabel =
    order.tableIds
      .map((id) => tableById(id)?.name)
      .filter(Boolean)
      .join(" + ") ||
    order.tableLabel ||
    "—";
  const label =
    order.type === "takeaway" ? `Take Away · ${order.customerName}` : `Table ${tableLabel}`;
  const alreadyBilled = order.status === "billed" || order.status === "settled";

  return (
    <AppShell
      hideNav
      header={
        <ScreenHeader
          title="Bill preview"
          subtitle={label}
          back={
            <Link
              to="/order/$orderId"
              params={{ orderId: order.id }}
              className="grid h-10 w-10 place-items-center rounded-full bg-secondary"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
          }
        />
      }
    >
      <div className="mx-auto w-full max-w-xl">
        <div className="rounded-3xl border border-border bg-card p-5">
          <div className="text-center">
            <p className="font-bold">{outlet.name}</p>
            <p className="text-xs text-muted-foreground">
              {outlet.outlet} · {outlet.deviceName}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {label} · opened {timeOf(order.openedAt)}
              {order.guests ? ` · ${order.guests} guests` : ""}
              {order.billNo && !order.billNo.startsWith("OFF") ? ` · Bill #${order.billNo}` : ""}
            </p>
          </div>

          <div className="mt-4 space-y-4 border-t border-dashed border-border pt-4">
            {order.rounds
              .filter((r) => r.lines.length > 0)
              .map((r) => (
                <div key={r.no}>
                  <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    Round {r.no}
                    {r.firedAt ? ` · ${timeOf(r.firedAt)}` : " · not fired"}
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {r.lines.map((l) => (
                      <li key={l.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 text-sm">
                        <span className="min-w-0">
                          {l.qty}× {l.name}
                          {l.variantName ? ` (${l.variantName})` : ""}
                          {l.addons.length ? (
                            <span className="block text-xs text-muted-foreground">
                              + {l.addons.map((a) => a.name).join(", ")}
                            </span>
                          ) : null}
                        </span>
                        <span className="tabular-nums">{inr(l.qty * l.unitPrice)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>

          <dl className="mt-4 space-y-1.5 border-t border-dashed border-border pt-4 text-sm">
            <Row label={`Subtotal (${t.items} items)`} value={inr(t.subtotal)} />
            {t.taxLines.map((tx) => (
              <Row key={tx.id} label={`${tx.name} ${tx.rate}`} value={inr(tx.amount)} />
            ))}
            {t.service > 0 ? <Row label="Service charge" value={inr(t.service)} /> : null}
            {t.discount > 0 ? <Row label="Discount" value={`- ${inr(t.discount)}`} /> : null}
            {t.roundOff !== 0 ? (
              <Row
                label="Round off"
                value={`${t.roundOff > 0 ? "+" : "-"} ₹${Math.abs(t.roundOff).toFixed(2)}`}
              />
            ) : null}
            <div className="flex items-center justify-between border-t border-border pt-2 text-base font-bold">
              <dt>Total payable</dt>
              <dd className="tabular-nums">{inr(t.total)}</dd>
            </div>
          </dl>

          <p className="mt-3 rounded-2xl bg-secondary px-3 py-2 text-[11px] text-muted-foreground">
            Captains cannot settle payments. Notify the cashier — payment and print happen on the
            Web POS.
          </p>
        </div>

        <div className="mt-5 space-y-2">
          <Button
            className="h-14 w-full text-base"
            disabled={blocked || alreadyBilled || busy}
            onClick={async () => {
              setBusy(true);
              const ok = await requestBill(order.id);
              setBusy(false);
              if (ok) {
                toast.success("Cashier notified — bill requested");
                navigate({ to: "/" });
              }
            }}
          >
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <BellRing className="mr-2 h-4 w-4" />
            )}
            {alreadyBilled ? "Bill already requested" : "Notify cashier for bill"}
          </Button>
          <Button
            variant="outline"
            className="h-12 w-full"
            onClick={() => toast.info("Ask the cashier to print — printing happens on the Web POS")}
          >
            <Printer className="mr-2 h-4 w-4" /> Ask cashier to print
          </Button>
        </div>
      </div>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
