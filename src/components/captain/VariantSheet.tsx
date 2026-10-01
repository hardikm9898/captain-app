import { useEffect, useMemo, useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { QtyStepper } from "./QtyStepper";
import { inr } from "@/lib/captain/format";
import type { MenuItem } from "@/lib/captain/types";
import type { NewLineInput } from "@/lib/captain/store";
import { cn } from "@/lib/utils";
import { Check, Minus, Plus } from "lucide-react";
import { engineLineTotal } from "@/lib/captain/billEngine";

export function VariantSheet({
  item,
  onClose,
  onAdd,
}: {
  item: MenuItem | null;
  onClose: () => void;
  onAdd: (line: NewLineInput) => void;
}) {
  const [variantId, setVariantId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  // How many of each picked addon ("Cheese ×2") - same as the Web POS
  // (owner list 2026-09-30 #8). Keyed `${groupId}:${optionId}`; 1 when absent.
  const [addonQty, setAddonQty] = useState<Record<string, number>>({});
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!item) return;
    setVariantId(item.variants?.[0]?.id ?? null);
    const init: Record<string, string[]> = {};
    item.addonGroups?.forEach((g) => {
      init[g.id] = g.min > 0 && g.options[0] ? [g.options[0].id] : [];
    });
    setSelected(init);
    setAddonQty({});
    setQty(1);
    setNote("");
  }, [item]);

  const variant = item?.variants?.find((v) => v.id === variantId);
  const base = variant?.price ?? item?.price ?? 0;

  const addons = useMemo(() => {
    if (!item?.addonGroups) return [];
    return item.addonGroups.flatMap((g) =>
      (selected[g.id] ?? [])
        .map((id) => g.options.find((o) => o.id === id))
        .filter((o): o is NonNullable<typeof o> => Boolean(o))
        .map((o) => ({
          id: o.id,
          groupId: g.id,
          name: o.name,
          price: o.price,
          qty: addonQty[`${g.id}:${o.id}`] ?? 1,
        })),
    );
  }, [item, selected, addonQty]);

  // Same figure as the cart and the bill: addons by their own qty, not
  // multiplied by the dish qty (helpers/billEngine.js).
  const total = engineLineTotal({ qty, price: base, addons });

  const valid = item?.addonGroups?.every((g) => (selected[g.id] ?? []).length >= g.min) ?? true;

  const toggle = (groupId: string, optionId: string, multiple: boolean, max: number, min: number) =>
    setSelected((prev) => {
      const cur = prev[groupId] ?? [];
      // Single-select groups that require a pick behave like radios: tapping
      // the chosen option again keeps it instead of leaving the group empty.
      if (!multiple)
        return { ...prev, [groupId]: cur[0] === optionId ? (min > 0 ? cur : []) : [optionId] };
      if (cur.includes(optionId)) return { ...prev, [groupId]: cur.filter((c) => c !== optionId) };
      if (cur.length >= max) return prev;
      return { ...prev, [groupId]: [...cur, optionId] };
    });

  return (
    <Drawer open={Boolean(item)} onOpenChange={(open) => (!open ? onClose() : null)}>
      <DrawerContent className="max-h-[90vh]">
        {item ? (
          <>
            <DrawerHeader className="text-left">
              <DrawerTitle className="flex items-center gap-2">
                <span
                  className={cn(
                    "grid h-4 w-4 shrink-0 place-items-center rounded-[3px] border-2",
                    item.veg ? "border-veg" : "border-nonveg",
                  )}
                >
                  <span
                    className={cn("h-1.5 w-1.5 rounded-full", item.veg ? "bg-veg" : "bg-nonveg")}
                  />
                </span>
                {item.name}
              </DrawerTitle>
            </DrawerHeader>
            <div className="max-h-[52vh] space-y-5 overflow-y-auto px-4 pb-2">
              {item.variants?.length ? (
                <section>
                  <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Variant · pick 1
                  </p>
                  <div className="space-y-2">
                    {item.variants.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setVariantId(v.id)}
                        className={cn(
                          "flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left",
                          variantId === v.id
                            ? "border-brand bg-brand-soft"
                            : "border-border bg-card",
                        )}
                      >
                        <span className="flex items-center gap-2 text-sm font-medium">
                          <span
                            className={cn(
                              "grid h-5 w-5 place-items-center rounded-full border-2",
                              variantId === v.id ? "border-brand bg-brand" : "border-border",
                            )}
                          >
                            {variantId === v.id ? (
                              <Check className="h-3 w-3 text-brand-foreground" />
                            ) : null}
                          </span>
                          {v.name}
                        </span>
                        <span className="text-sm font-semibold">{inr(v.price)}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              {item.addonGroups?.map((g) => (
                <section key={g.id}>
                  <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {g.name} ·{" "}
                    {g.multiple
                      ? `choose up to ${g.max}${g.min > 0 ? `, min ${g.min}` : ""}`
                      : g.min > 0
                        ? "pick 1"
                        : "optional"}
                  </p>
                  <div className="space-y-2">
                    {g.options.map((o) => {
                      const on = (selected[g.id] ?? []).includes(o.id);
                      const key = `${g.id}:${o.id}`;
                      const n = addonQty[key] ?? 1;
                      // A required single pick can't be stepped down to none.
                      const keepOne = !g.multiple && g.min > 0;
                      return (
                        <div
                          key={o.id}
                          data-addon-option={o.name}
                          className={cn(
                            "flex items-center justify-between gap-2 rounded-2xl border pl-3.5",
                            on ? "border-brand bg-brand-soft" : "border-border bg-card",
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              toggle(g.id, o.id, g.multiple, g.max, g.min);
                              setAddonQty((prev) => {
                                const { [key]: _drop, ...rest } = prev;
                                return rest;
                              });
                            }}
                            className="flex min-h-11 flex-1 items-center gap-2 py-2 text-left text-sm font-medium"
                          >
                            <span
                              className={cn(
                                "grid h-5 w-5 shrink-0 place-items-center rounded-md border-2",
                                on ? "border-brand bg-brand" : "border-border",
                              )}
                            >
                              {on ? <Check className="h-3 w-3 text-brand-foreground" /> : null}
                            </span>
                            {o.name}
                            {o.price > 0 ? (
                              <span className="text-muted-foreground"> +{inr(o.price)}</span>
                            ) : null}
                          </button>
                          {on ? (
                            <div className="flex items-center gap-1 pr-1.5">
                              <button
                                type="button"
                                aria-label={`Fewer ${o.name}`}
                                disabled={n <= 1 && keepOne}
                                onClick={() => {
                                  if (n <= 1) {
                                    toggle(g.id, o.id, g.multiple, g.max, g.min);
                                    return;
                                  }
                                  setAddonQty((prev) => ({ ...prev, [key]: n - 1 }));
                                }}
                                className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card disabled:opacity-40"
                              >
                                <Minus className="h-4 w-4" />
                              </button>
                              <span className="w-6 text-center text-sm font-semibold tabular-nums">
                                {n}
                              </span>
                              <button
                                type="button"
                                aria-label={`More ${o.name}`}
                                onClick={() => setAddonQty((prev) => ({ ...prev, [key]: n + 1 }))}
                                className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card"
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}

              <section>
                <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Kitchen note
                </p>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. less spicy, no onion"
                  rows={2}
                />
              </section>
            </div>
            <div className="flex items-center gap-3 border-t border-border p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <QtyStepper value={qty} onChange={setQty} min={1} size="lg" editable />
              <Button
                className="h-12 flex-1 text-base"
                disabled={!valid}
                onClick={() => {
                  onAdd({
                    itemId: item.id,
                    qty,
                    variantId: variant?.id,
                    variantName: variant?.name,
                    unitPrice: base,
                    addons,
                    note: note.trim() ? note.trim() : undefined,
                  });
                  onClose();
                }}
              >
                Add · {inr(total)}
              </Button>
            </div>
          </>
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}
