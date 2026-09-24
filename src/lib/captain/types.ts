// Prototype domain types (captain-app-prototype/src/lib/captain/types.ts),
// extended with the few fields the real local server needs to round-trip
// (backend ids, base prices, addon ids). Every screen keeps reading the
// same field names it did in the prototype.

export type TableStatus = "free" | "held" | "running" | "billed" | "reserved";
export type KotStatus =
  "pending" | "printed" | "accepted" | "preparing" | "ready" | "served" | "cancelled";
export type ConnectionState =
  | "online"
  | "offline"
  | "syncing"
  | "sync-error"
  | "conflict"
  | "local-server-down"
  | "offline-limit-exceeded";

export type TableArea = { id: string; name: string };

export type RestaurantTable = {
  id: string;
  name: string;
  areaId: string;
  seats: number;
  status: TableStatus;
  reservedToday?: string | undefined;
  reservedName?: string | undefined;
  mergedInto?: string | undefined;
};

export type AddonOption = { id: string; name: string; price: number };
export type AddonGroup = {
  id: string;
  name: string;
  min: number;
  max: number;
  multiple: boolean;
  options: AddonOption[];
};
export type Variant = { id: string; name: string; price: number };

export type MenuCategory = { id: string; name: string; menuId?: string | undefined };

/** One of the outlet's menus. Which one an order starts on follows the same
 * rule as the Web POS (billerpe-pos-pro-v2 store.tsx#resolveMenu). */
export type MenuCatalog = {
  id: string;
  name: string;
  isDefault: boolean;
  /** empty = not scoped by table area */
  tableCategoryIds: string[];
  /** "Dine-in" / "Pickup"; empty = not scoped by order type */
  orderTypes: string[];
};

export type MenuItem = {
  id: string;
  name: string;
  categoryId: string;
  price: number;
  veg: boolean;
  favourite?: boolean | undefined;
  station: string;
  imageUrl?: string | undefined;
  variants?: Variant[] | undefined;
  addonGroups?: AddonGroup[] | undefined;
};

export type LineAddon = {
  name: string;
  price: number;
  /** Real hms_addon_mst id + its department, needed to send the line back to the exe. */
  id?: number | undefined;
  groupId?: number | undefined;
  groupName?: string | undefined;
  qty?: number | undefined;
};

export type OrderLine = {
  id: string;
  itemId: string;
  name: string;
  variantName?: string | undefined;
  variantId?: string | undefined;
  addons: LineAddon[];
  note?: string | undefined;
  qty: number;
  /** Price per unit INCLUDING addons (what the prototype always displayed). */
  unitPrice: number;
  /** Price per unit before addons (base or variant price) - what the exe stores as `price`. */
  basePrice: number;
  station: string;
  categoryId?: string | undefined;
  /** Fired (not local-draft) lines only: the exe's own row id, needed to target a delete. */
  backendLineId?: number | undefined;
  /** Which captain (HotelUser id) fired this line - deletion is restricted to them or a Manager/Owner. */
  firedById?: number | undefined;
  /** Added by the captain, not on the menu ("Custom item"). */
  custom?: boolean | undefined;
  /** A custom item's chosen KOT printer / KDS kitchen - only asked when the outlet has more than one. */
  routePrinterId?: number | undefined;
  routeKitchenId?: number | undefined;
};

/** Where a custom item can be sent (exe KOT printers / KDS kitchens). */
export type Station = { id: number; name: string };

export type KotRound = {
  no: number;
  firedAt?: string | undefined;
  status: KotStatus;
  stations: string[];
  lines: OrderLine[];
};

export type OrderStatus = "running" | "held" | "billed" | "cancelled" | "settled";

export type Order = {
  id: string;
  type: "dine-in" | "takeaway";
  tableIds: string[];
  customerName?: string | undefined;
  mobile?: string | undefined;
  address?: string | undefined;
  gstin?: string | undefined;
  guests: number;
  openedAt: string;
  status: OrderStatus;
  /** Resolved discount amount as the exe last stored it (display only). */
  discount: number;
  /** The discount INPUT the exe recomputes from - "pr" means discountValue
   * is a percentage of the subtotal, so it stays correct as the captain
   * adds items. Set on the Web POS; the Captain App never changes it. */
  discountType?: "fix" | "pr" | undefined;
  discountValue?: number | undefined;
  /** Explicit per-order packaging override set on the Web POS, if any. */
  packagingOverride?: number | undefined;
  rounds: KotRound[];
  billRequestedAt?: string | undefined;
  /** hms_order_mst.id on the local server - undefined while the order is still a device-side draft. */
  backendId?: number | undefined;
  billNo?: string | undefined;
  /** Table label as the server knows it (survives even when the table list is stale). */
  tableLabel?: string | undefined;
  /** Frozen totals for settled history rows (no live recompute needed). */
  serverTotal?: number | undefined;
};

export type Reservation = {
  id: string;
  customerName: string;
  partySize: number;
  tableIds: string[];
  tableLabels: string[];
  time: string;
  endTime?: string | undefined;
  date: string;
  mobile: string;
};

export type AppNotification = {
  id: string;
  kind: "item-ready" | "kot-accepted" | "reservation" | "sync";
  title: string;
  body: string;
  time: string;
  read: boolean;
  orderId?: string | undefined;
};

export type Captain = { id: string; name: string; role: string; mobile: string };

export type Outlet = {
  name: string;
  outlet: string;
  deviceName: string;
  currency: string;
};
