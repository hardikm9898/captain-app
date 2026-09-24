import { useEffect, useMemo, useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { QtyStepper } from "./QtyStepper";
import { inr } from "@/lib/captain/format";
import type { MenuItem } from "@/lib/captain/types";
import type { NewLineInput } from "@/lib/captain/store";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

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
        .map((o) => ({ id: o.id, groupId: g.id, name: o.name, price: o.price })),
    );
  }, [item, selected]);

  const unit = base + addons.reduce((s, a) => s + a.price, 0);

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
                  <div className="flex flex-wrap gap-2">
                    {g.options.map((o) => {
                      const on = (selected[g.id] ?? []).includes(o.id);
                      return (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => toggle(g.id, o.id, g.multiple, g.max, g.min)}
                          className={cn(
                            "rounded-full border px-3.5 py-2 text-sm font-medium",
                            on
                              ? "border-brand bg-brand text-brand-foreground"
                              : "border-border bg-card",
                          )}
                        >
                          {o.name}
                          {o.price > 0 ? ` +${inr(o.price)}` : ""}
                        </button>
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
                Add · {inr(unit * qty)}
              </Button>
            </div>
          </>
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}
