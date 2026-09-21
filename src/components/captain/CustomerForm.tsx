import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { customerApi } from "@/lib/exe/api";
import { cn } from "@/lib/utils";

// Same customer form as the Web POS (billerpe-pos-pro-v2
// components/billing/customer-details-dialog.tsx): mobile first with saved
// customers suggested as you type, then name, address and GSTIN.

export type CustomerValues = { mobile: string; name: string; address: string; gstin: string };
export const EMPTY_CUSTOMER: CustomerValues = { mobile: "", name: "", address: "", gstin: "" };

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function customerErrors(v: CustomerValues) {
  return {
    mobile: v.mobile.length !== 10 ? "Enter a 10-digit mobile number" : null,
    gstin: v.gstin && !GSTIN_PATTERN.test(v.gstin) ? "Enter a valid 15-character GSTIN" : null,
  };
}

type Suggestion = { id: number; mobile: string; name: string; address: string; gstin: string };

export function CustomerFields({
  value,
  onChange,
  showErrors,
  autoFocus,
}: {
  value: CustomerValues;
  onChange: (v: CustomerValues) => void;
  showErrors?: boolean;
  autoFocus?: boolean;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [listOpen, setListOpen] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const errors = customerErrors(value);

  // Saved customers whose number contains what was typed, from the exe.
  useEffect(() => {
    const digits = value.mobile;
    if (digits.length < 3) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      customerApi
        .searchByMobile(digits)
        .then(({ numbers }) => {
          if (cancelled) return;
          const found = numbers
            .filter((c) => c.number)
            .map((c) => ({
              id: c.id,
              mobile: String(c.number).replace(/\D/g, "").slice(-10),
              name: c.name ?? "",
              address: c.address ?? "",
              gstin: (c.gstin ?? "").toUpperCase(),
            }));
          setSuggestions(found);
          // A full number that is a saved customer fills in by itself - but
          // never over details already typed.
          const exact = found.find((c) => c.mobile === digits);
          if (digits.length === 10 && exact && !value.name && !value.address && !value.gstin) {
            onChange({ ...value, name: exact.name, address: exact.address, gstin: exact.gstin });
            setListOpen(false);
          }
        })
        .catch(() => {
          // Suggestions only.
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // Only the number drives the look-up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.mobile]);

  const visible = listOpen ? suggestions.filter((c) => c.mobile !== value.mobile).slice(0, 6) : [];

  const choose = (c: Suggestion) => {
    onChange({ mobile: c.mobile, name: c.name, address: c.address, gstin: c.gstin });
    setListOpen(false);
    requestAnimationFrame(() => nameRef.current?.focus());
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="cust-mobile">Mobile number</Label>
        <div className="relative">
          <Input
            id="cust-mobile"
            className="num h-12"
            autoFocus={autoFocus}
            autoComplete="off"
            inputMode="numeric"
            placeholder="10-digit mobile number"
            value={value.mobile}
            onFocus={() => setListOpen(true)}
            onBlur={() => setTimeout(() => setListOpen(false), 150)}
            onChange={(e) => {
              onChange({ ...value, mobile: e.target.value.replace(/\D/g, "").slice(0, 10) });
              setListOpen(true);
            }}
          />
          {visible.length ? (
            <ul
              data-customer-suggestions
              className="absolute inset-x-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-2xl border border-border bg-popover p-1 shadow-lg"
            >
              {visible.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(c)}
                    className="flex w-full flex-col rounded-xl px-3 py-2 text-left active:bg-secondary"
                  >
                    <span className="flex w-full items-center justify-between gap-2 text-sm">
                      <span className="num font-medium">{c.mobile}</span>
                      <span className="truncate">{c.name || "—"}</span>
                    </span>
                    {c.address || c.gstin ? (
                      <span className="truncate text-xs text-muted-foreground">
                        {[c.address, c.gstin].filter(Boolean).join(" · ")}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {showErrors && errors.mobile ? (
          <p className="text-xs text-destructive">{errors.mobile}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cust-name">Name</Label>
        <Input
          id="cust-name"
          ref={nameRef}
          className="h-12"
          autoComplete="off"
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          placeholder="Customer name"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cust-address">Address</Label>
        <Input
          id="cust-address"
          className="h-12"
          autoComplete="off"
          value={value.address}
          onChange={(e) => onChange({ ...value, address: e.target.value })}
          placeholder="Optional"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cust-gstin">GSTIN</Label>
        <Input
          id="cust-gstin"
          className={cn("num h-12 uppercase")}
          autoComplete="off"
          maxLength={15}
          value={value.gstin}
          onChange={(e) =>
            onChange({ ...value, gstin: e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, "") })
          }
          placeholder="Optional - for a GST bill"
        />
        {showErrors && errors.gstin ? (
          <p className="text-xs text-destructive">{errors.gstin}</p>
        ) : null}
      </div>
    </div>
  );
}

export function CustomerDetailsDialog({
  open,
  onOpenChange,
  initial,
  onSave,
  onClear,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: { [K in keyof CustomerValues]?: string | undefined };
  onSave: (v: CustomerValues) => void;
  onClear?: () => void;
}) {
  const [value, setValue] = useState<CustomerValues>(EMPTY_CUSTOMER);
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValue({
      mobile: (initial.mobile ?? "").replace(/\D/g, "").slice(-10),
      name: initial.name ?? "",
      address: initial.address ?? "",
      gstin: (initial.gstin ?? "").toUpperCase(),
    });
    setShowErrors(false);
    // Only when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = () => {
    const errors = customerErrors(value);
    if (errors.mobile || errors.gstin) {
      setShowErrors(true);
      return;
    }
    onSave({ ...value, name: value.name.trim(), address: value.address.trim() });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle>Customer details</DialogTitle>
          <DialogDescription>
            Start with the mobile number - saved customers appear as you type.
          </DialogDescription>
        </DialogHeader>
        <CustomerFields value={value} onChange={setValue} showErrors={showErrors} autoFocus />
        <DialogFooter className="gap-2">
          {onClear && initial.mobile ? (
            <Button
              variant="outline"
              className="h-12"
              onClick={() => {
                onClear();
                onOpenChange(false);
              }}
            >
              Remove customer
            </Button>
          ) : null}
          <Button data-customer-save className="h-12" onClick={save}>
            Save customer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
