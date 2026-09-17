// Bill maths - a thin adapter over the shared engine (./billEngine.ts), which
// is a literal port of billerpe-local-exe/helpers/billEngine.js. The exe is
// the authority: it recomputes and persists an order's totals on every
// mutation, so this only ever previews the captain's own not-yet-fired
// round. Screens keep calling `orderTotals(order)` exactly like the
// prototype; the store feeds live settings in via setBillSettings().

import type {
  RawBillChargeRule,
  RawCartTax,
  RawServiceCharge,
  RawTableCategory,
  RawTaxType,
} from "@/lib/exe/api";
import { computeBill, engineLineTotal, type EngineChargeRule, type EngineTax } from "./billEngine";
import type { KotRound, MenuItem, Order, OrderLine, RestaurantTable } from "./types";

export type TaxRule = EngineTax;
export type ChargeRule = EngineChargeRule;
export type BillSettings = {
  taxRules: TaxRule[];
  serviceCharge: ChargeRule | null;
  packagingRule: ChargeRule | null;
  gstOn: boolean;
  /** Table -> area, so a tax rule scoped to table categories can resolve the order's table. */
  tables: Pick<RestaurantTable, "id" | "areaId">[];
  /** Area id -> the real table-category id on the exe (they are the same id). */
  menuItems: Pick<MenuItem, "id" | "categoryId">[];
};

export type BillTotals = {
  subtotal: number;
  discount: number;
  service: number;
  packaging: number;
  taxLines: { id: number | string; name: string; amount: number; rate: string }[];
  tax: number;
  /** Signed delta applied to reach `total` from the raw paise-precision sum. */
  roundOff: number;
  total: number;
  items: number;
};

const DEFAULT_SETTINGS: BillSettings = {
  taxRules: [],
  serviceCharge: null,
  packagingRule: null,
  gstOn: true,
  tables: [],
  menuItems: [],
};

let settings: BillSettings = DEFAULT_SETTINGS;

export function setBillSettings(next: Partial<BillSettings>) {
  settings = { ...settings, ...next };
}
export function getBillSettings(): BillSettings {
  return settings;
}

function parseIdArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v) as unknown;
      return Array.isArray(parsed) ? parsed.map((x) => String(x)) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseTypeArray(v: unknown): string[] {
  return parseIdArray(v);
}

export function mapTaxRule(t: RawTaxType): TaxRule {
  return {
    id: t.id,
    name: t.tax_name,
    type: t.tax_value === "fix" ? "fix" : "pr",
    rate: Number(t.amount) || 0,
    active: Boolean(t.active),
    orderTypes: parseTypeArray(t.order_type),
    tableCategIds: parseIdArray(t.table_categ_ids),
    menuIds: parseIdArray(t.menu_ids),
  };
}

export function mapServiceCharge(sc: RawServiceCharge | null | undefined): ChargeRule | null {
  if (!sc) return null;
  return {
    active: Boolean(sc.active),
    type: sc.service_charge_type === "fixed" ? "fixed" : "percentage",
    value: Number(sc.service_charge_value) || 0,
    calculationOn: sc.calculation_on === "total" ? "total" : "core",
    orderTypes: parseTypeArray(sc.service_charge_automatic),
    taxOnCharge: Boolean(sc.calculation_on_tax),
    condition: sc.greater_less === "1" ? "1" : sc.greater_less === "2" ? "2" : "3",
    threshold: Number(sc.greater_less_amount) || 0,
  };
}

/** hms_bill_charge_mst (rule_for "packaging") - same shape under different column names. */
export function mapChargeRule(rule: RawBillChargeRule | null | undefined): ChargeRule | null {
  if (!rule) return null;
  return {
    active: Boolean(rule.active),
    type: rule.charge_type === "fixed" ? "fixed" : "percentage",
    value: Number(rule.charge_value) || 0,
    calculationOn: rule.calculation_on === "total" ? "total" : "core",
    orderTypes: parseTypeArray(rule.charge_automatic),
    taxOnCharge: Boolean(rule.calculation_on_tax),
    condition: rule.greater_less === "1" ? "1" : rule.greater_less === "2" ? "2" : "3",
    threshold: Number(rule.greater_less_amount) || 0,
  };
}

/** Area ids ARE the exe's table-category ids (mappers.ts maps them straight through). */
export function mapTableAreas(_areas: RawTableCategory[]): void {
  // kept for symmetry with the other mappers; nothing to transform
}

export function lineTotal(line: OrderLine) {
  // `unitPrice` already includes this line's addons (see types.ts), so the
  // engine is given the base price plus the addon list rather than double
  // counting - same figure the exe computes from the persisted row.
  return engineLineTotal({
    qty: line.qty,
    price: line.basePrice,
    addons: line.addons.map((a) => ({ price: a.price, qty: a.qty })),
    menuId: line.itemId,
  });
}

export function currentRoundOf(order: Order): KotRound | undefined {
  return order.rounds.find((r) => !r.firedAt);
}

export function orderTotals(order: Order): BillTotals {
  const lines = order.rounds.flatMap((r) => r.lines);
  const tableId = order.tableIds[0];
  const tableCategId = tableId
    ? (settings.tables.find((t) => t.id === tableId)?.areaId ?? null)
    : null;
  const totals = computeBill({
    lines: lines.map((l) => ({
      qty: l.qty,
      price: l.basePrice,
      addons: l.addons.map((a) => ({ price: a.price, qty: a.qty })),
      menuId: l.itemId,
    })),
    orderType: order.type === "takeaway" ? "pickup" : "dinin",
    tableCategId,
    // The exe stores the discount INPUT ("pr" 10 = ten percent), so a
    // percent discount applied on the Web POS keeps recomputing correctly
    // here as the captain adds items, instead of freezing at a stale
    // amount. The Captain App itself never sets a discount.
    discount:
      order.discountType === "pr" && (order.discountValue ?? 0) > 0
        ? { type: "pr", value: order.discountValue ?? 0 }
        : { type: "fix", value: order.discount || 0 },
    packagingOverride: order.packagingOverride,
    config: {
      gstOn: settings.gstOn,
      taxTypes: settings.taxRules,
      serviceCharge: settings.serviceCharge,
      packagingRule: settings.packagingRule,
    },
  });
  return {
    subtotal: totals.subtotal,
    discount: totals.discount,
    service: totals.service,
    packaging: totals.packaging,
    taxLines: totals.taxLines.map((t) => ({
      id: t.id,
      name: t.name,
      amount: t.amount,
      rate: t.tax_type === "pr" ? `${t.tax_value}%` : "flat",
    })),
    tax: totals.tax,
    roundOff: totals.roundOff,
    total: totals.grandAmount,
    items: totals.items,
  };
}

/** cart.taxes payload the exe persists as OrderTax rows. The exe recomputes
 * these itself from its own config (helpers/orderTotals.js) - this is sent
 * only so older exe builds still get real tax rows. */
export function buildCartTaxes(totals: BillTotals): RawCartTax[] {
  return totals.taxLines.map((tx) => {
    const rule = settings.taxRules.find((r) => String(r.id) === String(tx.id));
    return {
      id: Number(tx.id),
      amount: tx.amount,
      tax_type: rule?.type === "fix" ? "fix" : "pr",
      tax_value: rule?.rate ?? tx.amount,
      tax: rule?.rate ?? tx.amount,
    };
  });
}
