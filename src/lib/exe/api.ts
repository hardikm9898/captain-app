// Typed endpoint functions - ONLY routes that exist on billerpe-local-exe
// (routes/index.js). Raw row shapes match the exe's Sequelize models; the
// adapters in lib/captain/mappers.ts turn them into the prototype's types.

import { http } from "./client";
import { getDeviceId } from "./discovery";

// ---------- auth ----------
export type LoginResult = { message?: string; token?: string };

// client: "captain" tells the exe this login is from the Captain App, not
// a Web POS terminal - it gates sign-in to the Captain role and evicts any
// other device's session for this user (see controller/auth.js's
// captainAppGate/issueSession). Web POS's own login calls omit this, so
// its normal multi-terminal, multi-tab sessions are unaffected.
export const authApi = {
  pinLogin: (mobile: string, pin: string) =>
    http.post<LoginResult>(
      "/pinLogin",
      { mobile, pin, device_id: getDeviceId(), client: "captain" },
      { skipAuthRedirect: true },
    ),
  restaurantLogin: (mobile: string, password: string) =>
    http.post<LoginResult>(
      "/restaurantLogin",
      { mobile, password, device_id: getDeviceId(), client: "captain" },
      { skipAuthRedirect: true },
    ),
};

// ---------- staff / hotel ----------
export type RawHotelUser = {
  id: number;
  name: string;
  email: string | null;
  number: string;
  active: boolean;
  role_mst?: { role_cd: number; role_name: string } | null;
};

export type RawServiceCharge = {
  id: number;
  active: boolean;
  service_charge_type: "fixed" | "percentage";
  service_charge_value: number;
  calculation_on: "core" | "total";
  service_charge_automatic: unknown;
  calculation_on_tax: boolean;
  greater_less: "1" | "2" | "3";
  greater_less_amount: number;
};

export type RawHotel = {
  id: number;
  hotel_name: string;
  address1: string | null;
  address2: string | null;
  contact1?: string | null;
  invoiceFormateIncGst: boolean;
  currency?: string;
  hms_serviceCharge_mst?: RawServiceCharge | null;
};

// ---------- customers ----------
export type RawCustomer = { id: number; number: string; name: string; address: string; gstin: string };

export const customerApi = {
  // Saved customers whose mobile contains `digits` (controller/customer.js).
  searchByMobile: (digits: string) =>
    http.get<{ numbers: RawCustomer[]; total: number }>(
      `/customer/getAll?limit=8&search=${encodeURIComponent(digits)}`,
    ),
};

export const hotelApi = {
  getSingle: () => http.get<RawHotel>("/singleHotel"),
  getUsers: () => http.get<{ hotelUsers: RawHotelUser[] }>("/offlineHotelUser"),
  getCurrentUser: () => http.get<{ access: RawHotelUser }>("/getUserAccess"),
};

export type RawTaxType = {
  id: number;
  tax_name: string;
  tax_value: "fix" | "pr";
  amount: number;
  active: boolean;
  /** Scoping the bill engine honours - empty/absent means "applies to all". */
  order_type?: unknown;
  table_categ_ids?: unknown;
  menu_ids?: unknown;
};
export const taxApi = {
  getAll: () => http.get<{ taxtTypes: RawTaxType[] }>("/taxType/tax"),
};

// hms_bill_charge_mst - the packaging charge rule (delivery is switched off
// product-wide). Same rule shape as the service charge under different
// column names; the bill engine evaluates both identically.
export type RawBillChargeRule = {
  id: number;
  rule_for: "delivery" | "packaging";
  active: boolean;
  charge_type: "fixed" | "percentage";
  charge_value: number;
  calculation_on: "core" | "total";
  charge_automatic?: unknown;
  calculation_on_tax: boolean;
  greater_less: "1" | "2" | "3";
  greater_less_amount: number;
};
export const billChargeApi = {
  getAll: () => http.get<{ rules: RawBillChargeRule[] }>("/billChargeRule"),
};

// ---------- tables ----------
export type RawTableCategory = {
  id: number;
  table_catag_nm: string;
  type: "T" | "R";
  active: boolean;
};
export type RawTable = {
  id: number;
  table_name: string;
  capacity: number | null;
  table_status: "R" | "F" | "P" | "H" | "B";
  active: boolean;
  type: "T" | "R";
  table_catag_id: number;
  reserved_name?: string | null;
  reserved_number?: string | null;
};

export const tableApi = {
  getTables: () => http.get<{ tables: RawTable[] }>("/table"),
  getCategories: () => http.get<{ tableCatagories: RawTableCategory[] }>("/getTableCatagories"),
  // Server decides merge vs transfer: if tableId2 already has an active
  // order it folds the source order in, otherwise it re-seats it.
  moveTable: (params: { tableId1: number; tableId2: number; orderId: number }) =>
    http.post<{ message?: string; orderId: number }>("/moveTable", params),
};

// ---------- menu ----------
export type RawMenuCategory = { id: number; menu_categ_nm: string; active: boolean; rank?: number };
export type RawMenuItemVariant = {
  id: number;
  variants_name: string;
  hms_menu_variant_mst?: { variant_price: number };
};
export type RawAddonOption = { id: number; addon_name: string; price: number; attributes?: string };
export type RawAddonGroup = {
  id: number;
  department_name: string;
  maximum_allowed_addon: number;
  minimum_allowed_addon: number;
  singleSelection: boolean;
  active?: boolean;
  hms_addon_msts?: RawAddonOption[];
};
export type RawMenuItem = {
  id: number;
  item_name: string;
  price: string | number;
  favorite: boolean;
  active: boolean;
  sub_categories: string;
  foodImage: string | null;
  menu_categ_id: number;
  gst_type?: "S" | "G";
  variantData?: RawMenuItemVariant[];
  addonDepartmentData?: RawAddonGroup[];
};
export type RawKitchen = {
  id: number;
  kitchen_name: string;
  menu_categ_ids: unknown;
  table_ids: unknown;
};

export const menuApi = {
  getCategories: () => http.get<{ catagories: RawMenuCategory[] }>("/catagories/%25"),
  getItemsWithVariants: () => http.get<{ menu: RawMenuItem[] }>("/menuShowWithVariants"),
  getAddonGroups: () => http.get<{ addons: RawAddonGroup[] }>("/addon"),
  getKitchens: () => http.get<{ kitchen: RawKitchen[] }>("/kitchen/kitchens"),
};

// ---------- orders ----------
export type RawOrderLine = {
  id: number;
  qty: number;
  price: number;
  variant_id: number | null;
  variant_name: string | null;
  addons: unknown;
  comment: string | null;
  MenuId: number;
  kotNumber: number;
  status: "kot" | "in-progress" | "delivered";
  payment_status: string;
  /** Set by POST /kotReady once kitchen marks this round ready on the Web POS Kitchen Display. */
  ready: boolean;
  /** HotelUser id of whoever fired this line's round - POST /kotItemRemove's permission check. */
  firedBy: number | null;
  createdAt: string;
  updatedAt: string;
  hms_menu_mst?: { id: number; item_name?: string; menu_categ_id?: number } | null;
};
export type RawOrder = {
  id: number;
  bill_no: string;
  order_type: "dinin" | "pickup" | "delivery";
  payment: string;
  status: "dispatch" | "in-progress" | "hold" | "success";
  totalAmount: number;
  gst: number;
  grandAmount: number;
  totalDiscount: number;
  discount_reason: string;
  /** Discount INPUT the exe recomputes from ("pr" = percent of subtotal). */
  discount_type?: "fix" | "pr" | null;
  discount_value?: number | null;
  service_charge: number;
  packaging_charge?: number | null;
  /** Explicit per-order packaging override; null when the rule applies. */
  packaging_override?: number | null;
  roundOff?: number | null;
  business_date: string;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
  hotelUserId: number | null;
  TableId: number | null;
  hms_table_mst?: { id: number; table_name: string } | null;
  hms_user_master?: { name?: string; number?: string; address?: string; gstin?: string } | null;
  hms_orderDetails: RawOrderLine[];
};

export type KotCartAddon = { id: number; addon_name: string; price: number; qty: number };
export type KotCartItem = {
  id: number;
  qty: number;
  price: number;
  discount: number;
  addons: { id: number; department_name: string; hms_addon_msts: KotCartAddon[] }[];
  comment: string;
  menu_categ_id: number;
  variantData?: { id: number; variants_name: string } | null;
  kotNumber?: number;
};
export type RawCartTax = {
  id: number;
  amount: number;
  tax_type: string;
  tax_value: number;
  tax: number;
};
export type CartPayload = {
  gst: number;
  totalDiscount: number;
  grandAmount: number;
  myAmount: number;
  service_charger: number;
  delivery_charge: number;
  packaging_charge: number;
  // Discount fields are DELIBERATELY optional and never sent by this app.
  // The exe treats the presence of `discount_type` as "this client owns the
  // discount" and would otherwise clear a discount the cashier applied on
  // the Web POS (billerpe-local-exe/helpers/orderTotals.js#discountFromCart).
  discount_reason?: string;
  discount_type?: "fix" | "pr";
  discount_value?: number;
  taxes: RawCartTax[];
  items: [{ status: "H"; menuItems: KotCartItem[] }];
};
export type OrderPayload = {
  order_type: "dinin" | "pickup";
  order_id?: number;
  table_id?: number;
  tableNumber?: string;
  userName?: string;
  mobile?: string;
  gstin?: string;
  address?: string;
  cart: CartPayload;
};

export type KotRoutingEntry = {
  printer: { id: number; printer_name: string };
  printerSize: string;
  items: KotCartItem[];
};

export const orderApi = {
  getActive: () => http.get<{ order: RawOrder[] }>("/pickupOrder"),
  getOne: (id: number) => http.get<{ order: RawOrder }>(`/order/${id}`),
  getSettled: (page = 1, limit = 50) =>
    http.get<{ order: RawOrder[]; total: number }>(`/searchOrder/all?page=${page}&limit=${limit}`),
  kot: (payload: OrderPayload) =>
    http.post<{
      message?: string;
      kotInfo: {
        order_id: number;
        bill_no?: string;
        data: KotRoutingEntry[];
        /** Authoritative totals the exe just stored for this order. */
        totals?: { grandAmount: number; subtotal: number; tax: number; service: number };
      };
    }>("/kotOrder", payload),
  hold: (payload: OrderPayload) =>
    http.post<{ message?: string; orderId: number; bill_no?: string }>("/holdOrder", payload),
  // Dine-in "generate bill": table -> P (Bill Generated). Must carry EVERY
  // line (all rounds, with kotNumber) - the exe rebuilds OrderDetails from it.
  adminOrder: (payload: OrderPayload) =>
    http.post<{ message?: string; orderId?: number; bill_no?: string }>("/adminOrder", payload),
  remove: (id: number, free: boolean) =>
    http.post<{ message?: string }>("/orderRemove", { id, ...(free ? { free: "free" } : {}) }),
  // Deletes one line from an already-fired-but-not-yet-delivered KOT round.
  // The exe itself enforces who's allowed (whoever fired that round, or a
  // Manager/Owner) - a 403 here means this captain genuinely isn't allowed,
  // not a bug to retry.
  removeLine: (orderId: number, lineId: number) =>
    http.post<{ message?: string }>("/kotItemRemove", { order_id: orderId, line_id: lineId }),
};

// ---------- reservations (exe relays to the cloud) ----------
export type RawReservation = {
  booking_id: number;
  name: string;
  email: string;
  number: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  no_of_person: number;
  table_name: ({ id: number; table_name: string } | null)[] | null;
};
export const reservationApi = {
  getAll: () => http.get<{ bookings: RawReservation[] }>("/getBookingData", { timeoutMs: 12000 }),
};

// ---------- sync / connection ----------
// Deliberately narrow: only the real, captain-actionable signal (the exe's
// own 3-day max-offline-duration block, GET /localSyncStatus). GET
// /localServerStatus also exists and reports the exe's own cloud-push job
// (pendingOrderCount, lastError) - that's a separate, exe-internal concern
// this app never surfaces: a captain can't act on the local server's cloud
// connectivity, and this app never talks to the cloud through it either.
export type RawSyncStatus = {
  lastSuccessfulSyncAt: string;
  maxOfflineDays: number;
  daysSinceSync: number;
  transactionsBlocked: boolean;
};
export const statusApi = {
  syncStatus: () => http.get<RawSyncStatus>("/localSyncStatus", { timeoutMs: 6000 }),
};
