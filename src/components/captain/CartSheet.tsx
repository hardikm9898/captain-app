import { roundQty } from "@/lib/captain/qty";
import { useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { QtyStepper } from "./QtyStepper";
import { StatusBadge } from "./StatusBadge";
import { inr, timeOf } from "@/lib/captain/format";
import { currentRoundOf, lineTotal, orderTotals, useCaptain } from "@/lib/captain/store";
import type { Order, OrderLine } from "@/lib/captain/types";
import { Loader2, Lock, PauseCircle, Plus, Send, Trash2 } from "lucide-react";

export function CartSheet({
  order,
  open,
  onOpenChange,
  onFire,
  onHold,
  busy,
}: {
  order: Order;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFire: () => void;
  onHold: () => void;
  busy?: "fire" | "hold" | null;
}) {
  const { updateLineQty, setLineNote, canRemoveLine, removeLine, blocked } = useCaptain();
  const [removeTarget, setRemoveTarget] = useState<OrderLine | null>(null);
  const [removing, setRemoving] = useState(false);
  const totals = orderTotals(order);
  const round = currentRoundOf(order);
  const roundItems = roundQty(round?.lines.reduce((s, l) => s + l.qty, 0) ?? 0);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92vh]">
        <DrawerHeader className="text-left">
          <DrawerTitle>Cart review</DrawerTitle>
          <p className="text-xs text-muted-foreground">
            Fired rounds are locked — editing them needs cashier permission.
          </p>
        </DrawerHeader>
        <div className="max-h-[58vh] space-y-4 overflow-y-auto px-4">
          {order.rounds.map((r) => {
            const fired = Boolean(r.firedAt);
            return (
              <section
                key={r.no}
                className={
                  fired
                    ? "rounded-2xl border border-border bg-muted/50 p-3"
                    : "rounded-2xl border border-brand/25 bg-card p-3"
                }
              >
                <div className="mb-2 flex items-center gap-2">
                  <p className="text-sm font-semibold">Round {r.no}</p>
                  {fired ? (
                    <>
                      <StatusBadge kind="kot" status={r.status} />
                      <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Lock className="h-3 w-3" /> {timeOf(r.firedAt!)}
                      </span>
                    </>
                  ) : (
                    <span className="ml-auto text-[11px] font-medium text-brand">Editable</span>
                  )}
                </div>
                {r.lines.length === 0 ? (
                  <p className="py-3 text-center text-sm text-muted-foreground">
                    No items in this round yet.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {r.lines.map((l) => (
                      <li
                        key={l.id}
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{l.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {[l.variantName, ...l.addons.map((a) => a.name)]
                              .filter(Boolean)
                              .join(" · ") || l.station}
                          </p>
                          {fired ? (
                            l.note ? (
                              <p className="text-xs text-brand">Note: {l.note}</p>
                            ) : null
                          ) : (
                            <input
                              value={l.note ?? ""}
                              onChange={(e) => setLineNote(order.id, l.id, e.target.value)}
                              placeholder="Add note"
                              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                            />
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {fired ? (
                            <span className="flex items-center gap-2">
                              <span className="text-sm font-semibold tabular-nums">× {l.qty}</span>
                              {r.status !== "served" && canRemoveLine(l) ? (
                                <button
                                  type="button"
                                  aria-label={`Remove ${l.name}`}
                                  onClick={() => setRemoveTarget(l)}
                                  disabled={blocked}
                                  className="grid h-6 w-6 place-items-center rounded-full text-destructive disabled:opacity-40"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              ) : null}
                            </span>
                          ) : (
                            <QtyStepper
                              size="sm"
                              editable
                              value={l.qty}
                              onChange={(q) => updateLineQty(order.id, l.id, q)}
                            />
                          )}
                          <span className="text-xs font-semibold tabular-nums">
                            {inr(lineTotal(l))}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>

        <div className="mt-2 space-y-1 border-t border-border px-4 pt-3 text-sm">
          <Row label="Subtotal" value={inr(totals.subtotal)} />
          {totals.taxLines.map((t) => (
            <Row key={t.id} label={`${t.name} (${t.rate})`} value={inr(t.amount)} />
          ))}
          {totals.service ? <Row label="Service charge" value={inr(totals.service)} /> : null}
          {totals.discount ? <Row label="Discount" value={`- ${inr(totals.discount)}`} /> : null}
          <Row label="Order total" value={inr(totals.total)} strong />
        </div>

        <div className="space-y-2 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <Button
            className="h-13 w-full text-base"
            disabled={roundItems === 0 || blocked || Boolean(busy)}
            onClick={onFire}
          >
            {busy === "fire" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}{" "}
            {busy === "fire"
              ? "Sending KOT…"
              : `Send KOT · ${roundItems} item${roundItems === 1 ? "" : "s"}`}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              className="h-11"
              onClick={onHold}
              disabled={blocked || roundItems === 0 || Boolean(busy)}
            >
              {busy === "hold" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <PauseCircle className="mr-2 h-4 w-4" />
              )}{" "}
              Hold order
            </Button>
            <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
              <Plus className="mr-2 h-4 w-4" /> Add more items
            </Button>
          </div>
        </div>
      </DrawerContent>

      <Dialog
        open={Boolean(removeTarget)}
        onOpenChange={(o) => (!o ? setRemoveTarget(null) : null)}
      >
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle>Remove from KOT?</DialogTitle>
            <DialogDescription>
              {removeTarget?.name} has already been sent to the kitchen. Only remove it if it was
              punched by mistake or the customer cancelled it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-center">
            <Button variant="outline" className="h-11 flex-1" onClick={() => setRemoveTarget(null)}>
              Keep item
            </Button>
            <Button
              variant="destructive"
              className="h-11 flex-1"
              disabled={removing}
              onClick={async () => {
                if (!removeTarget) return;
                setRemoving(true);
                const ok = await removeLine(order.id, removeTarget);
                setRemoving(false);
                if (ok) setRemoveTarget(null);
              }}
            >
              {removing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Drawer>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={strong ? "font-semibold" : "text-muted-foreground"}>{label}</span>
      <span className={strong ? "text-base font-bold tabular-nums" : "font-medium tabular-nums"}>
        {value}
      </span>
    </div>
  );
}
