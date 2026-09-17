import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  ChefHat,
  MoreVertical,
  ReceiptText,
  Search,
  ShoppingCart,
  Star,
  Timer,
  Users,
} from "lucide-react";
import { AppShell, ScreenHeader, SHELL_WIDTH } from "@/components/captain/AppShell";
import { Chip, ChipRow } from "@/components/captain/Chip";
import { CartSheet } from "@/components/captain/CartSheet";
import { VariantSheet } from "@/components/captain/VariantSheet";
import { TableActionsSheet } from "@/components/captain/TableActionsSheet";
import { EmptyState, LoadingState } from "@/components/captain/States";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QtyStepper } from "@/components/captain/QtyStepper";
import { elapsed, inr } from "@/lib/captain/format";
import { currentRoundOf, orderTotals, useCaptain, type KotResult } from "@/lib/captain/store";
import type { MenuItem } from "@/lib/captain/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/order/$orderId")({
  head: () => ({
    meta: [
      { title: "Order & Menu — BillerPe Captain" },
      {
        name: "description",
        content:
          "Build a table's order from the live menu, pick variants and addons, and fire the KOT round.",
      },
    ],
  }),
  component: OrderMenu,
});

function OrderMenu() {
  const { orderId } = Route.useParams();
  const {
    orderById,
    tableById,
    menu,
    categories,
    addLine,
    updateLineQty,
    fireKot,
    holdOrder,
    setGuests,
    blocked,
    booting,
  } = useCaptain();
  const navigate = useNavigate();
  const order = orderById(orderId);
  // "" = All categories - the menu opens showing every item; tapping a
  // category chip narrows it, tapping it again (or "All") widens back out.
  const [categoryId, setCategoryId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [vegOnly, setVegOnly] = useState(false);
  const [sheetItem, setSheetItem] = useState<MenuItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [guestEditorOpen, setGuestEditorOpen] = useState(false);
  const [guestDraft, setGuestDraft] = useState(2);
  const [busy, setBusy] = useState<"fire" | "hold" | null>(null);
  const [kotToast, setKotToast] = useState<KotResult | null>(null);

  const items = useMemo(
    () =>
      menu.filter((m) => {
        if (vegOnly && !m.veg) return false;
        if (query) return m.name.toLowerCase().includes(query.toLowerCase());
        if (!categoryId) return true;
        return m.categoryId === categoryId;
      }),
    [menu, categoryId, query, vegOnly],
  );

  if (!order) {
    return (
      <AppShell header={<ScreenHeader title="Order" />}>
        {booting ? (
          <LoadingState label="Loading order" />
        ) : (
          <EmptyState
            icon={ReceiptText}
            title="Order not found"
            body="It may have been merged or settled."
          />
        )}
      </AppShell>
    );
  }

  const table = order.tableIds[0] ? tableById(order.tableIds[0]) : undefined;
  const tableName = table?.name ?? order.tableLabel ?? "—";
  const round = currentRoundOf(order);
  const totals = orderTotals(order);
  const roundLines = round?.lines ?? [];
  const roundItems = roundLines.reduce((s, l) => s + l.qty, 0);
  const roundValue = roundLines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const readOnly =
    order.status === "billed" || order.status === "settled" || order.status === "cancelled";

  const qtyInRound = (itemId: string) =>
    roundLines.filter((l) => l.itemId === itemId).reduce((s, l) => s + l.qty, 0);

  // Across every FIRED round (not the one being built right now) - so a
  // captain browsing the menu can see at a glance what this table has
  // already been sent, before adding more of it by mistake.
  const firedLines = order.rounds.filter((r) => r.firedAt).flatMap((r) => r.lines);
  const alreadySentQty = (itemId: string) =>
    firedLines.filter((l) => l.itemId === itemId).reduce((s, l) => s + l.qty, 0);
  const firedSummary = (() => {
    const byName = new Map<string, number>();
    firedLines.forEach((l) => byName.set(l.name, (byName.get(l.name) ?? 0) + l.qty));
    return [...byName.entries()].map(([name, qty]) => `${qty}× ${name}`);
  })();

  const tap = (item: MenuItem) => {
    if (blocked || readOnly) return;
    if (item.variants?.length || item.addonGroups?.length) {
      setSheetItem(item);
      return;
    }
    addLine(order.id, { itemId: item.id, qty: 1, unitPrice: item.price, addons: [] });
  };

  const onFire = async () => {
    if (roundItems === 0) {
      toast.error("Add items before sending a KOT");
      return;
    }
    setBusy("fire");
    const res = await fireKot(order.id);
    setBusy(null);
    if (!res) return;
    setCartOpen(false);
    // A draft becomes a real server order on its first KOT - follow its new
    // id so the captain stays on this menu (same as the prototype's flow).
    if (res.orderId !== order.id) {
      navigate({ to: "/order/$orderId", params: { orderId: res.orderId }, replace: true });
    }
    setKotToast(res);
    setTimeout(() => setKotToast(null), 2600);
  };

  const onHold = async () => {
    setBusy("hold");
    const ok = await holdOrder(order.id);
    setBusy(null);
    if (!ok) return;
    setCartOpen(false);
    toast.success("Order on hold — nothing sent to the kitchen");
    navigate({ to: "/" });
  };

  const categoryRail = (
    <>
      <Chip active={vegOnly} onClick={() => setVegOnly(!vegOnly)}>
        Veg only
      </Chip>
      <Chip
        active={!query && !categoryId}
        onClick={() => {
          setQuery("");
          setCategoryId("");
        }}
        className="md:w-full md:text-left"
      >
        All
      </Chip>
      {categories.map((c) => (
        <Chip
          key={c.id}
          active={!query && categoryId === c.id}
          onClick={() => {
            setQuery("");
            setCategoryId(c.id);
          }}
          className="md:w-full md:text-left"
        >
          {c.name}
        </Chip>
      ))}
    </>
  );

  return (
    <AppShell
      hideNav
      header={
        <ScreenHeader
          title={
            order.type === "takeaway" ? `Take Away · ${order.customerName}` : `Table ${tableName}`
          }
          subtitle={
            order.type === "takeaway" ? (
              `${order.mobile ?? ""} · ${elapsed(order.openedAt)}`
            ) : (
              <span className="inline-flex items-center gap-1">
                {readOnly ? (
                  <span>{order.guests ? `${order.guests} guests · ` : ""}</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setGuestDraft(order.guests || 2);
                      setGuestEditorOpen(true);
                    }}
                  >
                    {order.guests ? `${order.guests} guests` : "Add guests"}
                  </button>
                )}
                <span>
                  {readOnly ? "" : " · "}
                  {elapsed(order.openedAt)}
                  {readOnly
                    ? ` · ${order.status === "billed" ? "bill requested" : order.status}`
                    : ""}
                </span>
              </span>
            )
          }
          back={
            <Link to="/" className="grid h-10 w-10 place-items-center rounded-full bg-secondary">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          }
          right={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10"
                aria-label="Bill preview"
                onClick={() => navigate({ to: "/bill/$orderId", params: { orderId: order.id } })}
              >
                <ReceiptText className="h-4 w-4" />
              </Button>
              {order.type === "dine-in" && !readOnly ? (
                <Button
                  variant="outline"
                  size="icon"
                  className="h-10 w-10"
                  aria-label="Table actions"
                  onClick={() => setActionsOpen(true)}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          }
        />
      }
    >
      {firedSummary.length > 0 ? (
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="mb-3 flex w-full items-start gap-2 rounded-2xl border border-st-running/25 bg-st-running-soft px-3 py-2 text-left"
        >
          <ChefHat className="mt-0.5 h-4 w-4 shrink-0 text-st-running" />
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-st-running">
              Already ordered on this table
            </span>
            <span className="line-clamp-2 block text-xs text-st-running/90">
              {firedSummary.join(", ")}
            </span>
          </span>
          <span className="shrink-0 self-center text-[11px] font-semibold text-st-running">
            View
          </span>
        </button>
      ) : null}

      <div className="relative">
        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the menu"
          className="h-12 pl-9"
        />
      </div>

      {/* Phone: horizontal chip row. Tablet (md+): the same chips as a left rail. */}
      <ChipRow className="mt-3 md:hidden">{categoryRail}</ChipRow>

      <div className="md:mt-3 md:grid md:grid-cols-[11rem_minmax(0,1fr)] md:gap-4">
        <aside className="no-scrollbar hidden max-h-[calc(100vh-14rem)] flex-col gap-2 overflow-y-auto md:sticky md:top-32 md:flex">
          {categoryRail}
        </aside>

        <div className="mt-2 grid gap-2 pb-4 sm:grid-cols-2 md:mt-0 xl:grid-cols-3">
          {menu.length === 0 && booting ? (
            <div className="sm:col-span-2 xl:col-span-3">
              <LoadingState label="Loading menu" />
            </div>
          ) : items.length === 0 ? (
            <div className="sm:col-span-2 xl:col-span-3">
              <EmptyState
                icon={ChefHat}
                title="Nothing matches"
                body="Try another category or search term."
              />
            </div>
          ) : (
            items.map((item) => {
              const qty = qtyInRound(item.id);
              const sentQty = alreadySentQty(item.id);
              const configurable = Boolean(item.variants?.length || item.addonGroups?.length);
              return (
                <div
                  key={item.id}
                  className={cn(
                    "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border bg-card p-3",
                    qty > 0
                      ? "border-brand/40"
                      : sentQty > 0
                        ? "border-st-running/40"
                        : "border-border",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => tap(item)}
                    className="flex min-w-0 items-center gap-3 text-left"
                    aria-label={`Add ${item.name}`}
                  >
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt=""
                        loading="lazy"
                        className="h-12 w-12 shrink-0 rounded-xl object-cover"
                        onError={(e) =>
                          ((e.currentTarget as HTMLImageElement).style.display = "none")
                        }
                      />
                    ) : null}
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            "grid h-4 w-4 shrink-0 place-items-center rounded-[3px] border-2",
                            item.veg ? "border-veg" : "border-nonveg",
                          )}
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              item.veg ? "bg-veg" : "bg-nonveg",
                            )}
                          />
                        </span>
                        <span className="truncate text-sm font-semibold">{item.name}</span>
                        {item.favourite ? (
                          <Star className="h-3.5 w-3.5 shrink-0 fill-st-held text-st-held" />
                        ) : null}
                        {sentQty > 0 ? (
                          <span className="shrink-0 rounded-full bg-st-running-soft px-1.5 py-0.5 text-[10px] font-semibold text-st-running">
                            {sentQty} already ordered
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {inr(item.price)}
                        {configurable ? " · options" : ""} · {item.station}
                      </span>
                    </span>
                  </button>
                  {qty > 0 && !configurable ? (
                    <QtyStepper
                      size="sm"
                      value={qty}
                      onChange={(q) => {
                        const line = roundLines.find((l) => l.itemId === item.id);
                        if (!line) return;
                        if (q > qty)
                          addLine(order.id, {
                            itemId: item.id,
                            qty: 1,
                            unitPrice: item.price,
                            addons: [],
                          });
                        else updateLineQty(order.id, line.id, q);
                      }}
                    />
                  ) : (
                    <Button
                      className="h-10"
                      disabled={blocked || readOnly}
                      onClick={() => tap(item)}
                    >
                      {qty > 0 ? `${qty} · Add` : "Add"}
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <AnimatePresence>
        {roundItems > 0 ? (
          <motion.button
            type="button"
            initial={{ y: 80 }}
            animate={{ y: 0 }}
            exit={{ y: 80 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            onClick={() => setCartOpen(true)}
            className={cn(
              "fixed bottom-0 left-1/2 z-30 grid w-full -translate-x-1/2 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-t border-brand/20 bg-brand px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] text-brand-foreground",
              SHELL_WIDTH,
            )}
          >
            <span className="grid h-11 w-11 place-items-center rounded-full bg-brand-foreground/15">
              <ShoppingCart className="h-5 w-5" />
            </span>
            <span className="min-w-0 text-left">
              <span className="block text-sm font-semibold">
                Round {round?.no} · {roundItems} item{roundItems === 1 ? "" : "s"}
              </span>
              <span className="block text-xs opacity-90">
                {inr(roundValue)} · order total {inr(totals.total)}
              </span>
            </span>
            <span className="rounded-full bg-brand-foreground/15 px-4 py-2 text-sm font-semibold">
              Review
            </span>
          </motion.button>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {kotToast ? (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12 }}
            className="fixed top-16 left-1/2 z-40 w-[min(92vw,26rem)] -translate-x-1/2 rounded-3xl border border-st-free/30 bg-card p-4 text-center shadow-xl"
          >
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-st-free-soft text-st-free">
              <ChefHat className="h-6 w-6" />
            </div>
            <p className="mt-2 font-bold">KOT round {kotToast.round} sent</p>
            <p className="text-sm text-muted-foreground">
              {kotToast.items} item{kotToast.items === 1 ? "" : "s"} routed to{" "}
              {kotToast.stations.join(", ")}
            </p>
            <p className="mt-1 flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
              <Timer className="h-3 w-3" /> returning to menu
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <VariantSheet
        item={sheetItem}
        onClose={() => setSheetItem(null)}
        onAdd={(line) => addLine(order.id, line)}
      />
      <CartSheet
        order={order}
        open={cartOpen}
        onOpenChange={setCartOpen}
        onFire={() => void onFire()}
        onHold={() => void onHold()}
        busy={busy}
      />
      {order.type === "dine-in" ? (
        <TableActionsSheet order={order} open={actionsOpen} onOpenChange={setActionsOpen} />
      ) : null}

      {order.type === "dine-in" ? (
        <Dialog open={guestEditorOpen} onOpenChange={setGuestEditorOpen}>
          <DialogContent className="max-w-xs rounded-3xl">
            <DialogHeader>
              <DialogTitle className="text-center">How many guests?</DialogTitle>
            </DialogHeader>
            <div className="flex justify-center py-2">
              <QtyStepper value={guestDraft} onChange={setGuestDraft} min={1} size="lg" />
            </div>
            <Button
              className="h-12 w-full"
              onClick={() => {
                setGuests(order.id, guestDraft);
                setGuestEditorOpen(false);
              }}
            >
              Save
            </Button>
          </DialogContent>
        </Dialog>
      ) : null}

      {order.type === "dine-in" ? (
        <p className="mb-2 flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
          <Users className="h-3 w-3" /> Any captain can act on any table — no table assignment in
          BillerPe.
        </p>
      ) : null}
    </AppShell>
  );
}
