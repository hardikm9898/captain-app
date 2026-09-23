import { useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { QtyStepper } from "./QtyStepper";
import { useCaptain } from "@/lib/captain/store";
import type { Order } from "@/lib/captain/types";
import { ArrowRightLeft, GitMerge, Loader2, Users, XCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useNavigate } from "@tanstack/react-router";

type Panel = "menu" | "merge" | "transfer" | "guests" | "cancel";

export function TableActionsSheet({
  order,
  open,
  onOpenChange,
}: {
  order: Order;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { tables, areas, orderForTable, mergeTables, transferTable, setGuests, cancelOrder } =
    useCaptain();
  // The section a table sits in, shown in the merge/transfer lists so the
  // right table is picked (owner report, 2026-09-22).
  const areaName = (areaId: string) => areas.find((a) => a.id === areaId)?.name ?? "";
  const navigate = useNavigate();
  const [panel, setPanel] = useState<Panel>("menu");
  const [guests, setLocalGuests] = useState(order.guests);
  const [busy, setBusy] = useState(false);

  const close = () => {
    onOpenChange(false);
    setTimeout(() => setPanel("menu"), 200);
  };

  // Held and billed orders are never merged (the exe refuses both).
  const occupied = tables.filter((t) => {
    const other = orderForTable(t.id);
    return (
      !order.tableIds.includes(t.id) &&
      !!other &&
      other.status !== "held" &&
      other.status !== "billed"
    );
  });
  const free = tables.filter((t) => !orderForTable(t.id) && t.status !== "reserved");

  return (
    <Drawer open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="text-left">
          <DrawerTitle>
            {panel === "menu"
              ? "Table actions"
              : panel === "merge"
                ? "Merge with table"
                : panel === "transfer"
                  ? "Transfer to table"
                  : panel === "guests"
                    ? "Edit guest count"
                    : "Cancel order"}
          </DrawerTitle>
        </DrawerHeader>
        <div className="max-h-[62vh] overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {panel === "menu" ? (
            <div className="space-y-2">
              <ActionRow
                icon={GitMerge}
                label="Merge Table"
                hint="Bring another table's lines into this order"
                onClick={() => setPanel("merge")}
              />
              <ActionRow
                icon={ArrowRightLeft}
                label="Transfer Table"
                hint="Move this whole order to a free table"
                onClick={() => setPanel("transfer")}
              />
              <ActionRow
                icon={Users}
                label="Edit Guest Count"
                hint={`Currently ${order.guests} guests`}
                onClick={() => setPanel("guests")}
              />
              <ActionRow
                icon={XCircle}
                destructive
                label="Cancel Order"
                hint="Void this order on the floor"
                onClick={() => setPanel("cancel")}
              />
            </div>
          ) : null}

          {panel === "merge" ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                The selected table's rounds and un-fired lines move into this order; that table is
                freed.
              </p>
              {order.status === "held" ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  This order is on hold. Held orders can't be merged — use Transfer Table to move it
                  to a free table.
                </p>
              ) : occupied.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No other occupied table to merge.
                </p>
              ) : (
                occupied.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      const ok = await mergeTables(order.id, t.id);
                      setBusy(false);
                      if (ok) {
                        toast.success(`Table ${t.name} merged into this order`);
                        close();
                      }
                    }}
                    className="flex w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-left disabled:opacity-60"
                  >
                    <span className="font-semibold">
                      Table {t.name}
                      {/* its section, so the right table is picked (owner
                          report, 2026-09-22) */}
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        {areaName(t.areaId)}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {orderForTable(t.id)?.guests || "—"} guests
                    </span>
                  </button>
                ))
              )}
            </div>
          ) : null}

          {panel === "transfer" ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Every line, fired or not, moves with the order to the new table.
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {free.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      const ok = await transferTable(order.id, t.id);
                      setBusy(false);
                      if (ok) {
                        toast.success(`Order moved to table ${t.name}`);
                        close();
                        navigate({ to: "/" });
                      } else toast.error("That table is occupied");
                    }}
                    className="rounded-2xl border border-border bg-card py-3 text-center font-semibold disabled:opacity-60"
                  >
                    <span className="block">{t.name}</span>
                    <span className="block text-[10px] font-normal text-muted-foreground">
                      {areaName(t.areaId)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {panel === "guests" ? (
            <div className="space-y-4 py-2 text-center">
              <div className="flex justify-center">
                <QtyStepper value={guests} onChange={setLocalGuests} min={1} size="lg" />
              </div>
              <Button
                className="h-12 w-full"
                onClick={() => {
                  setGuests(order.id, guests);
                  toast.success(`Guest count updated to ${guests}`);
                  close();
                }}
              >
                Save guest count
              </Button>
            </div>
          ) : null}

          {panel === "cancel" ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Cancelling voids this order and frees the table. Fired KOT rounds stay in today's
                history for the cashier to review.
              </p>
              <Button
                variant="destructive"
                className="h-12 w-full"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const ok = await cancelOrder(order.id);
                  setBusy(false);
                  if (ok) {
                    toast.success("Order cancelled");
                    close();
                    navigate({ to: "/" });
                  }
                }}
              >
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Cancel this order
              </Button>
              <Button variant="ghost" className="h-11 w-full" onClick={() => setPanel("menu")}>
                Keep order
              </Button>
            </div>
          ) : null}

          {panel !== "menu" && panel !== "cancel" ? (
            <Button variant="ghost" className="mt-4 h-11 w-full" onClick={() => setPanel("menu")}>
              Back to actions
            </Button>
          ) : null}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function ActionRow({
  icon: Icon,
  label,
  hint,
  onClick,
  destructive,
}: {
  icon: typeof GitMerge;
  label: string;
  hint: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-left"
    >
      <span
        className={cn(
          "grid h-10 w-10 shrink-0 place-items-center rounded-xl",
          destructive ? "bg-destructive/10 text-destructive" : "bg-brand-soft text-brand",
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className={cn("block font-semibold", destructive && "text-destructive")}>
          {label}
        </span>
        <span className="block truncate text-xs text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}
