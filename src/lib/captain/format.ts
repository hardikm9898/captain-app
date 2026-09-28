import { cs, numLocale } from "./currency";

// Paise shown when there are any: with fractional quantities (2.55 x 99)
// a whole-rupee figure disagreed with the bill (252 vs 252.45). In the
// outlet's currency (lib/captain/currency.ts), not always the rupee.
export const inr = (n: number) => `${cs()}${n.toLocaleString(numLocale(), { maximumFractionDigits: 2 })}`;

export const elapsed = (iso: string) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
};

export const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });

export const dateOf = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

// An addon as the cart and bill show it: "Cheese ×2" (the quantity used to be
// dropped - owner report, 2026-09-28). One stays just its name.
export const addonLabel = (a: { name: string; qty?: number | undefined }) =>
  (a.qty ?? 1) > 1 ? `${a.name} ×${a.qty}` : a.name;
