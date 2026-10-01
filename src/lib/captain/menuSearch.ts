import type { MenuItem } from "./types";

// The Web POS's item search (billerpe-pos-pro-v2 src/lib/menuSearch.ts), so
// typing a short code finds the same dish on the phone as at the counter
// (owner list 2026-09-30 #11). Ranked, best first:
//   1. short code or barcode exactly equal to what was typed
//   2. short code starting with it
//   3. item name starting with it, or any word in the name starting with it
//   4. item name containing it

/** The exe stores "all" for an item saved without a short code - not a code anybody typed. */
export function itemShortCode(code: string | null | undefined): string | undefined {
  const v = (code ?? "").trim();
  return !v || v.toLowerCase() === "all" ? undefined : v;
}

export function searchMenuItems<T extends Pick<MenuItem, "name" | "shortCode" | "barcode">>(
  items: T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  const ranked: { item: T; rank: number; index: number }[] = [];
  items.forEach((item, index) => {
    const code = (item.shortCode ?? "").toLowerCase();
    const barcode = (item.barcode ?? "").trim().toLowerCase();
    const name = item.name.toLowerCase();
    let rank = 0;
    if ((code && code === q) || (barcode && barcode === q)) rank = 1;
    else if (code && code.startsWith(q)) rank = 2;
    else if (name.startsWith(q) || name.split(/[\s\-/(]+/).some((w) => w.startsWith(q))) rank = 3;
    else if (name.includes(q)) rank = 4;
    if (rank) ranked.push({ item, rank, index });
  });
  ranked.sort((a, b) => a.rank - b.rank || a.index - b.index);
  return ranked.map((r) => r.item);
}
