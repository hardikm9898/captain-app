// Raw local-server rows -> prototype domain types. Status vocab follows the
// exe's own models: Table.table_status R/F/P/H/B, Order.status
// in-progress/hold/success, OrderDetails.status kot/in-progress/delivered.

import type {
  RawAddonGroup,
  RawHotelUser,
  RawKitchen,
  RawMenuCategory,
  RawMenuItem,
  RawOrder,
  RawOrderLine,
  RawReservation,
  RawTable,
  RawTableCategory,
} from "@/lib/exe/api";
import type {
  AddonGroup,
  Captain,
  KotRound,
  KotStatus,
  LineAddon,
  MenuCategory,
  MenuItem,
  Order,
  OrderLine,
  Reservation,
  RestaurantTable,
  TableArea,
  TableStatus,
} from "./types";

export const TABLE_STATUS: Record<RawTable["table_status"], TableStatus> = {
  F: "free",
  R: "running",
  P: "billed",
  H: "held",
  B: "reserved",
};

export function mapArea(c: RawTableCategory): TableArea {
  return { id: String(c.id), name: c.table_catag_nm };
}

export function mapTable(t: RawTable): RestaurantTable {
  return {
    id: String(t.id),
    name: t.table_name,
    areaId: String(t.table_catag_id),
    seats: t.capacity ?? 0,
    status: TABLE_STATUS[t.table_status] ?? "free",
    reservedName: t.reserved_name || undefined,
  };
}

export function mapCategory(c: RawMenuCategory): MenuCategory {
  return { id: String(c.id), name: c.menu_categ_nm };
}

export function mapAddonGroup(g: RawAddonGroup): AddonGroup {
  return {
    id: String(g.id),
    name: g.department_name,
    min: g.minimum_allowed_addon ?? 0,
    max: Math.max(1, g.maximum_allowed_addon ?? 1),
    multiple: !g.singleSelection,
    options: (g.hms_addon_msts ?? []).map((a) => ({
      id: String(a.id),
      name: a.addon_name,
      price: Number(a.price) || 0,
    })),
  };
}

// JSON-typed columns come back as real arrays on SQLite but as JSON-encoded
// strings on some rows pulled from the cloud - handle both.
export function parseJsonArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export type StationResolver = (categoryId: string | number | undefined) => string;

/** Kitchen name by menu category (KitchenSetting.menu_categ_ids), falling back to the first kitchen or "Kitchen". */
export function buildStationResolver(kitchens: RawKitchen[]): StationResolver {
  const byCategory = new Map<string, string>();
  kitchens.forEach((k) => {
    parseJsonArray(k.menu_categ_ids).forEach((id) => {
      const key = String(id);
      if (!byCategory.has(key)) byCategory.set(key, k.kitchen_name);
    });
  });
  const fallback = kitchens[0]?.kitchen_name ?? "Kitchen";
  return (categoryId) =>
    categoryId === undefined ? fallback : (byCategory.get(String(categoryId)) ?? fallback);
}

export function mapMenuItem(
  m: RawMenuItem,
  station: StationResolver,
  addonCatalog: Map<string, AddonGroup>,
): MenuItem {
  const dietary = (m.sub_categories ?? "").toLowerCase();
  const variants = (m.variantData ?? [])
    .map((v) => ({
      id: String(v.id),
      name: v.variants_name,
      price: Number(v.hms_menu_variant_mst?.variant_price ?? 0) || Number(m.price) || 0,
    }))
    .filter((v) => v.name);
  const addonGroups = (m.addonDepartmentData ?? [])
    .filter((g) => g.active !== false)
    .map((g) => addonCatalog.get(String(g.id)) ?? mapAddonGroup(g))
    .filter((g) => g.options.length > 0);
  return {
    id: String(m.id),
    name: m.item_name,
    categoryId: String(m.menu_categ_id),
    price: Number(m.price) || 0,
    veg: !dietary.includes("non"),
    favourite: Boolean(m.favorite),
    station: station(m.menu_categ_id),
    imageUrl: m.foodImage || undefined,
    ...(variants.length ? { variants } : {}),
    ...(addonGroups.length ? { addonGroups } : {}),
  };
}

/** OrderDetails.addons is department-grouped JSON (see Web POS parseOrderAddons); flatten it. */
export function parseLineAddons(raw: unknown): LineAddon[] {
  const out: LineAddon[] = [];
  for (const entry of parseJsonArray(raw)) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    const nested = rec["hms_addon_msts"];
    if (Array.isArray(nested)) {
      nested.forEach((a) => {
        if (!a || typeof a !== "object") return;
        const ad = a as Record<string, unknown>;
        out.push({
          name: typeof ad["addon_name"] === "string" ? ad["addon_name"] : "",
          price: Number(ad["price"]) || 0,
          qty: Number(ad["qty"]) || 1,
          id: ad["id"] !== undefined ? Number(ad["id"]) : undefined,
          groupId: rec["id"] !== undefined ? Number(rec["id"]) : undefined,
          groupName:
            typeof rec["department_name"] === "string" ? rec["department_name"] : undefined,
        });
      });
    } else if (typeof rec["name"] === "string") {
      out.push({
        name: rec["name"],
        price: Number(rec["price"]) || 0,
        qty: Number(rec["qty"]) || 1,
      });
    }
  }
  return out;
}

export function mapServerLine(
  l: RawOrderLine,
  station: StationResolver,
  menuName?: string,
): OrderLine {
  const addons = parseLineAddons(l.addons);
  const addonPerUnit = addons.reduce((s, a) => s + a.price * (a.qty ?? 1), 0);
  const base = Number(l.price) || 0;
  const categoryId = l.hms_menu_mst?.menu_categ_id;
  return {
    id: `l-${l.id}`,
    itemId: String(l.MenuId),
    name: l.hms_menu_mst?.item_name ?? menuName ?? "Item",
    variantName: l.variant_name || undefined,
    variantId: l.variant_id != null ? String(l.variant_id) : undefined,
    addons,
    note: l.comment || undefined,
    qty: Number(l.qty) || 0,
    unitPrice: base + addonPerUnit,
    basePrice: base,
    station: station(categoryId),
    categoryId: categoryId != null ? String(categoryId) : undefined,
    backendLineId: l.id,
    firedById: l.firedBy ?? undefined,
  };
}

const ROUND_STATUS: Record<RawOrderLine["status"], KotStatus> = {
  "in-progress": "pending",
  kot: "printed",
  delivered: "served",
};

/** Groups a raw order's fired lines (status kot/delivered) into KOT rounds by kotNumber. */
export function mapFiredRounds(raw: RawOrder, station: StationResolver): KotRound[] {
  const groups = new Map<number, RawOrderLine[]>();
  raw.hms_orderDetails
    .filter((l) => l.status !== "in-progress")
    .forEach((l) => {
      const no = l.kotNumber || 1;
      groups.set(no, [...(groups.get(no) ?? []), l]);
    });
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([no, lines]) => {
      const mapped = lines.map((l) => mapServerLine(l, station));
      const firedAt = lines.reduce(
        (min, l) => (l.createdAt && l.createdAt < min ? l.createdAt : min),
        lines[0]?.createdAt ?? raw.createdAt,
      );
      // A round is "served" only once every line in it has been delivered;
      // a bill-generated order marks all lines delivered, so it reads served.
      // "ready" is the item-ready signal kitchen sets via the Web POS
      // Kitchen Display (POST /kotReady) - every still-cooking line in the
      // round has to be flagged ready for the round itself to read ready.
      const allDelivered = lines.every((l) => l.status === "delivered");
      const allReady = !allDelivered && lines.every((l) => l.status !== "kot" || l.ready);
      const status: KotStatus = allDelivered
        ? "served"
        : allReady
          ? "ready"
          : ROUND_STATUS[lines[0]?.status ?? "kot"];
      return {
        no,
        firedAt,
        status,
        stations: Array.from(new Set(mapped.map((l) => l.station))),
        lines: mapped,
      };
    });
}

/** Un-fired ("in-progress", i.e. held) lines still sitting on the server. */
export function mapHeldLines(raw: RawOrder, station: StationResolver): OrderLine[] {
  return raw.hms_orderDetails
    .filter((l) => l.status === "in-progress")
    .map((l) => mapServerLine(l, station));
}

export function mapOrderStatus(raw: RawOrder): Order["status"] {
  if (raw.deleted) return "cancelled";
  if (raw.payment === "success") return "settled";
  if (raw.status === "hold") return "held";
  if (raw.status === "success") return "billed";
  return "running";
}

/** Server order -> prototype Order (rounds = fired rounds only; the editable round is added by the store). */
export function mapServerOrder(raw: RawOrder, station: StationResolver): Order {
  const tableId = raw.TableId != null ? String(raw.TableId) : undefined;
  return {
    id: String(raw.id),
    backendId: raw.id,
    billNo: raw.bill_no,
    type: raw.order_type === "pickup" ? "takeaway" : "dine-in",
    tableIds: tableId ? [tableId] : [],
    tableLabel: raw.hms_table_mst?.table_name ?? undefined,
    customerName: raw.hms_user_master?.name || undefined,
    mobile: raw.hms_user_master?.number || undefined,
    guests: 0,
    openedAt: raw.createdAt,
    status: mapOrderStatus(raw),
    discount: Number(raw.totalDiscount) || 0,
    // The discount INPUT, so a percent discount applied on the Web POS
    // keeps recomputing here as the captain adds items (totals.ts).
    ...(raw.discount_type ? { discountType: raw.discount_type } : {}),
    ...(raw.discount_value != null ? { discountValue: Number(raw.discount_value) } : {}),
    ...(raw.packaging_override != null
      ? { packagingOverride: Number(raw.packaging_override) }
      : {}),
    rounds: mapFiredRounds(raw, station),
    billRequestedAt: raw.status === "success" ? raw.updatedAt : undefined,
    serverTotal: Number(raw.grandAmount) || 0,
  };
}

export function mapCaptain(u: RawHotelUser): Captain {
  const role = u.role_mst?.role_name ?? "Captain";
  const roleLabel =
    role === "C"
      ? "Captain"
      : role === "A"
        ? "Admin"
        : role === "B"
          ? "Biller"
          : role === "S"
            ? "Super Admin"
            : role === "U"
              ? "Staff"
              : role;
  return { id: String(u.id), name: u.name, role: roleLabel, mobile: u.number };
}

export function mapReservation(r: RawReservation): Reservation {
  const tables = (r.table_name ?? []).filter((t): t is { id: number; table_name: string } => !!t);
  return {
    id: String(r.booking_id),
    customerName: r.name,
    partySize: r.no_of_person,
    tableIds: tables.map((t) => String(t.id)),
    tableLabels: tables.map((t) => t.table_name),
    time: r.start_time,
    endTime: r.end_time,
    date: r.booking_date,
    mobile: r.number,
  };
}

export function isToday(iso: string): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}
