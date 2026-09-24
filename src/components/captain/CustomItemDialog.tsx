import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useCaptain } from "@/lib/captain/store";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sanitizeQtyInput } from "@/lib/captain/qty";

// A one-off item that is not on the menu (issue list 2026-09-24, issue 6).
// It is taxed like the rest of the order, and with more than one KOT printer
// or kitchen display the captain picks where it goes (owner rule) - with one
// of each it simply goes there.
export function CustomItemDialog({
  orderId,
  open,
  onOpenChange,
}: {
  orderId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { addCustomLine, kotPrinters, kitchens } = useCaptain();
  const askPrinter = kotPrinters.length > 1;
  const askKitchen = kitchens.length > 1;
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("1");
  const [printerId, setPrinterId] = useState("");
  const [kitchenId, setKitchenId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setName("");
      setPrice("");
      setQty("1");
      setPrinterId("");
      setKitchenId("");
      setError("");
    }
  }, [open]);

  const add = () => {
    const p = Number(price);
    const q = Number(qty);
    if (!name.trim()) return setError("Enter the item name");
    if (!(p > 0)) return setError("Price must be more than ₹0");
    if (!(q > 0)) return setError("Quantity must be more than 0");
    if (askPrinter && !printerId) return setError("Choose which KOT printer prints this item");
    if (askKitchen && !kitchenId) return setError("Choose which kitchen display shows this item");
    addCustomLine(orderId, {
      name,
      price: p,
      qty: q,
      routePrinterId: printerId ? Number(printerId) : undefined,
      routeKitchenId: kitchenId ? Number(kitchenId) : undefined,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-3xl">
        <DialogHeader>
          <DialogTitle>Custom item</DialogTitle>
          <DialogDescription>For something that isn't on the menu.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="custom-name" required>
              Item name
            </Label>
            <Input
              id="custom-name"
              className="h-11"
              value={name}
              placeholder="e.g. Birthday cake plating"
              onChange={(e) => {
                setName(e.target.value);
                setError("");
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="custom-price" required>
                Price (₹)
              </Label>
              <Input
                id="custom-price"
                className="h-11"
                inputMode="decimal"
                value={price}
                placeholder="0"
                onChange={(e) => {
                  setPrice(e.target.value.replace(/[^\d.]/g, ""));
                  setError("");
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="custom-qty" required>
                Qty
              </Label>
              <Input
                id="custom-qty"
                className="h-11"
                inputMode="decimal"
                value={qty}
                onChange={(e) => {
                  setQty(sanitizeQtyInput(e.target.value));
                  setError("");
                }}
              />
            </div>
          </div>
          {askPrinter ? (
            <div className="space-y-1.5">
              <Label required>KOT printer</Label>
              <Select
                value={printerId}
                onValueChange={(v) => {
                  setPrinterId(v);
                  setError("");
                }}
              >
                <SelectTrigger className="h-11" aria-label="KOT printer">
                  <SelectValue placeholder="Choose printer" />
                </SelectTrigger>
                <SelectContent>
                  {kotPrinters.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {askKitchen ? (
            <div className="space-y-1.5">
              <Label required>Kitchen display</Label>
              <Select
                value={kitchenId}
                onValueChange={(v) => {
                  setKitchenId(v);
                  setError("");
                }}
              >
                <SelectTrigger className="h-11" aria-label="Kitchen display">
                  <SelectValue placeholder="Choose kitchen" />
                </SelectTrigger>
                <SelectContent>
                  {kitchens.map((k) => (
                    <SelectItem key={k.id} value={String(k.id)}>
                      {k.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <Button className="h-12 w-full" onClick={add}>
            <Plus className="mr-1 h-4 w-4" /> Add to order
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
