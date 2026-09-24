// Exe-backed replacement for the prototype's mock store. Same `useCaptain()`
// contract the screens were written against; every read/write goes to
// billerpe-local-exe (lib/exe/*), never to the cloud. Device-local state
// (drafts, un-fired cart round, guest counts, alerts) lives in lib/captain/local.ts.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  authApi,
  billChargeApi,
  hotelApi,
  menuApi,
  orderApi,
  reservationApi,
  statusApi,
  tableApi,
  taxApi,
  type KotCartItem,
  type OrderPayload,
  type RawOrder,
} from "@/lib/exe/api";
import {
  ApiError,
  UnauthorizedError,
  describeError,
  getStoredToken,
  setStoredToken,
  setUnauthorizedHandler,
} from "@/lib/exe/client";
import {
  discoverServer,
  findMovedServer,
  getBaseUrl,
  pingCurrent,
  rememberServerDevice,
} from "@/lib/exe/discovery";
import { connectChangeFeed } from "@/lib/exe/socket";
import { roundQty } from "@/lib/captain/qty";
import {
  buildStationResolver,
  isToday,
  mapAddonGroup,
  mapArea,
  mapCaptain,
  mapCategory,
  mapMenuCatalog,
  mapHeldLines,
  mapMenuItem,
  mapReservation,
  mapServerOrder,
  mapTable,
  type StationResolver,
} from "./mappers";
import {
  cancelledStore,
  cartStore,
  draftStore,
  flagStore,
  metaStore,
  notificationStore,
  outletCache,
  sessionStore,
  staffCache,
  type OrderMeta,
} from "./local";
import {
  buildCartTaxes,
  currentRoundOf,
  lineTotal,
  mapChargeRule,
  mapServiceCharge,
  mapTaxRule,
  orderTotals,
  setBillSettings,
} from "./totals";
import { playOrderReadyBell } from "./sound";
import type {
  AddonGroup,
  AppNotification,
  Captain,
  ConnectionState,
  KotRound,
  MenuCategory,
  MenuItem,
  Order,
  OrderLine,
  Outlet,
  Reservation,
  MenuCatalog,
  RestaurantTable,
  Station,
  TableArea,
} from "./types";

export { orderTotals, lineTotal, currentRoundOf } from "./totals";

export type CustomLineInput = {
  name: string;
  price: number;
  qty: number;
  routePrinterId?: number | undefined;
  routeKitchenId?: number | undefined;
};

export type NewLineInput = {
  itemId: string;
  qty: number;
  variantId?: string | undefined;
  variantName?: string | undefined;
  unitPrice: number;
  addons: { id?: string | undefined; groupId?: string | undefined; name: string; price: number }[];
  note?: string | undefined;
};

/** `orderId` is the id the order has AFTER the fire - a draft becomes its real server id. */
export type KotResult = { round: number; items: number; stations: string[]; orderId: string };

export type SyncInfo = {
  lastSuccessfulSyncAt: string | null;
  maxOfflineDays: number;
  serverUrl: string;
};

type State = {
  captain: Captain | null;
  restored: boolean;
  booting: boolean;
  refreshing: boolean;
  connection: ConnectionState;
  sync: SyncInfo;
  tables: RestaurantTable[];
  areas: TableArea[];
  categories: MenuCategory[];
  menu: MenuItem[];
  serverOrders: Order[];
  heldLines: Record<string, OrderLine[]>;
  settled: Order[];
  drafts: Record<string, Order>;
  /** KOT printers and KDS kitchens a custom item can be sent to. */
  kotPrinters: Station[];
  kitchens: Station[];
  /** The outlet's menus; more than one lets the captain switch an order's menu. */
  menus: MenuCatalog[];
  carts: Record<string, OrderLine[]>;
  meta: Record<string, OrderMeta>;
  billRequested: Record<string, string>;
  cancelled: Order[];
  reservations: Reservation[];
  notifications: AppNotification[];
  outlet: Outlet;
  captains: Captain[];
};

export type LoginInput =
  | { mode: "pin"; mobile: string; pin: string }
  | { mode: "password"; mobile: string; password: string };

export type CustomerInput = {
  customerName?: string | undefined;
  mobile?: string | undefined;
  address?: string | undefined;
  gstin?: string | undefined;
};

type Ctx = Omit<State, "serverOrders" | "heldLines" | "settled" | "drafts" | "carts" | "meta"> & {
  orders: Order[];
  blocked: boolean;
  serverUrl: string;
  login: (input: LoginInput) => Promise<Captain>;
  logout: () => void;
  refresh: () => Promise<void>;
  recheckConnection: () => Promise<void>;
  orderForTable: (tableId: string) => Order | undefined;
  orderById: (id: string) => Order | undefined;
  tableById: (id: string) => RestaurantTable | undefined;
  startOrder: (input: { tableId: string; guests: number; customerName?: string }) => Order;
  /** Leaving an opened table with nothing added: forget the draft. */
  discardEmptyDraft: (orderId: string) => void;
  startTakeaway: (input: CustomerInput) => Order;
  /** Attach or change the order's customer; reaches the exe with the next KOT/bill. */
  setCustomer: (orderId: string, input: CustomerInput) => void;
  addLine: (orderId: string, line: NewLineInput) => void;
  /** A one-off item not on the menu - sent by name, taxed like the rest of the order. */
  addCustomLine: (orderId: string, input: CustomLineInput) => void;
  /** The menu this order is taking items from (null when the outlet has one menu). */
  menuForOrder: (order: Order) => MenuCatalog | null;
  setOrderMenu: (orderId: string, menuId: string) => void;
  updateLineQty: (orderId: string, lineId: string, qty: number) => void;
  setLineNote: (orderId: string, lineId: string, note: string) => void;
  fireKot: (orderId: string) => Promise<KotResult | null>;
  holdOrder: (orderId: string) => Promise<boolean>;
  requestBill: (orderId: string) => Promise<boolean>;
  setGuests: (orderId: string, guests: number) => void;
  cancelOrder: (orderId: string) => Promise<boolean>;
  /** Delete one line from an already-fired round. The exe itself enforces who may - see canRemoveLine. */
  removeLine: (orderId: string, line: OrderLine) => Promise<boolean>;
  /** Local, same-shape check the UI uses to decide whether to even show a delete control (the exe re-checks on the real call). */
  canRemoveLine: (line: OrderLine) => boolean;
  mergeTables: (sourceOrderId: string, targetTableId: string) => Promise<boolean>;
  transferTable: (orderId: string, targetTableId: string) => Promise<boolean>;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  unreadCount: number;
};

const CaptainContext = createContext<Ctx | null>(null);

const DEFAULT_OUTLET: Outlet = {
  name: "BillerPe Restaurant",
  outlet: "Local server",
  deviceName: "Captain Handset",
  currency: "₹",
};

let uid = Date.now() % 100000;
const nextId = (prefix: string) => `${prefix}${++uid}`;

const ACTIVE: Order["status"][] = ["running", "held", "billed"];

// A draft is the order a captain opened on this phone but never sent. One
// with nothing in its cart is just a table that was looked at.
function withoutEmptyDrafts(drafts: Record<string, Order>, carts: Record<string, OrderLine[]>) {
  return Object.fromEntries(Object.entries(drafts).filter(([id]) => (carts[id] ?? []).length > 0));
}

const lineSignature = (l: {
  itemId: string;
  variantName?: string | undefined;
  addons: { name: string }[];
  note?: string | undefined;
}) => `${l.itemId}|${l.variantName ?? ""}|${l.addons.map((a) => a.name).join(",")}|${l.note ?? ""}`;

export function CaptainProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(() => ({
    captain: null,
    restored: false,
    booting: false,
    refreshing: false,
    connection: "online",
    sync: {
      lastSuccessfulSyncAt: null,
      maxOfflineDays: 3,
      serverUrl: getBaseUrl(),
    },
    tables: [],
    areas: [],
    categories: [],
    menu: [],
    serverOrders: [],
    heldLines: {},
    settled: [],
    drafts: withoutEmptyDrafts(draftStore.get(), cartStore.get()),
    kotPrinters: [],
    kitchens: [],
    menus: [],
    carts: cartStore.get(),
    meta: metaStore.get(),
    billRequested: flagStore.get().billRequested,
    cancelled: cancelledStore.get(),
    reservations: [],
    notifications: notificationStore.get(),
    outlet: outletCache.get() ?? DEFAULT_OUTLET,
    captains: staffCache.get(),
  }));

  const stateRef = useRef(state);
  stateRef.current = state;
  const stationRef = useRef<StationResolver>(() => "Kitchen");
  const menuMapRef = useRef<Map<string, MenuItem>>(new Map());
  const patch = useCallback((fn: (s: State) => State) => setState(fn), []);

  // ---------- persistence side-effects ----------
  useEffect(() => draftStore.set(state.drafts), [state.drafts]);
  useEffect(() => cartStore.set(state.carts), [state.carts]);
  useEffect(() => metaStore.set(state.meta), [state.meta]);
  useEffect(() => flagStore.set({ billRequested: state.billRequested }), [state.billRequested]);
  useEffect(() => cancelledStore.set(state.cancelled), [state.cancelled]);
  useEffect(() => notificationStore.set(state.notifications), [state.notifications]);

  const pushNotification = useCallback(
    (n: Omit<AppNotification, "id" | "time" | "read"> & { id?: string }) =>
      patch((s) => {
        if (n.id && s.notifications.some((x) => x.id === n.id)) return s;
        const entry: AppNotification = {
          id: n.id ?? nextId("n"),
          kind: n.kind,
          title: n.title,
          body: n.body,
          time: new Date().toISOString(),
          read: false,
          orderId: n.orderId,
        };
        return { ...s, notifications: [entry, ...s.notifications].slice(0, 100) };
      }),
    [patch],
  );

  // ---------- loaders ----------
  const loadSettings = useCallback(async () => {
    const [hotel, taxes, charges] = await Promise.all([
      hotelApi.getSingle(),
      taxApi.getAll().catch(() => null),
      billChargeApi.getAll().catch(() => null),
    ]);
    setBillSettings({
      gstOn: hotel.invoiceFormateIncGst !== false,
      serviceCharge: mapServiceCharge(hotel.hms_serviceCharge_mst),
      packagingRule: mapChargeRule(charges?.rules?.find((r) => r.rule_for === "packaging") ?? null),
      ...(taxes ? { taxRules: taxes.taxtTypes.map(mapTaxRule) } : {}),
    });
    const outlet: Outlet = {
      name: hotel.hotel_name,
      outlet: [hotel.address1, hotel.address2].filter(Boolean).join(", ") || "Local server",
      deviceName: "Captain Handset",
      currency: hotel.currency || "₹",
    };
    outletCache.set(outlet);
    patch((s) => ({ ...s, outlet }));
  }, [patch]);

  const loadStaff = useCallback(async () => {
    const { hotelUsers } = await hotelApi.getUsers();
    const captains = hotelUsers.filter((u) => u.active).map(mapCaptain);
    staffCache.set(captains);
    patch((s) => ({ ...s, captains }));
  }, [patch]);

  const loadMenu = useCallback(async () => {
    const [cats, items, addons, kitchens, printers, catalogs] = await Promise.all([
      menuApi.getCategories(),
      menuApi.getItemsWithVariants(),
      menuApi.getAddonGroups().catch(() => ({ addons: [] })),
      menuApi.getKitchens().catch(() => ({ kitchen: [] })),
      menuApi.getPrinters().catch(() => ({ printerSettings: [] })),
      menuApi.getMenuCatalogs().catch(() => ({ menuCatalogs: [] })),
    ]);
    const station = buildStationResolver(kitchens.kitchen ?? []);
    stationRef.current = station;
    const addonCatalog = new Map<string, AddonGroup>();
    (addons.addons ?? []).forEach((g) => addonCatalog.set(String(g.id), mapAddonGroup(g)));
    const menu = items.menu
      .filter((m) => m.active !== false)
      .map((m) => mapMenuItem(m, station, addonCatalog));
    menuMapRef.current = new Map(menu.map((m) => [m.id, m]));
    setBillSettings({ menuItems: menu.map((m) => ({ id: m.id, categoryId: m.categoryId })) });
    const usedCategories = new Set(menu.map((m) => m.categoryId));
    const categories = cats.catagories
      .filter((c) => c.active !== false && usedCategories.has(String(c.id)))
      .sort((a, b) => (a.rank ?? a.id) - (b.rank ?? b.id))
      .map(mapCategory);
    const kotPrinters = (printers.printerSettings ?? [])
      .filter((p) => p.print_type === "K")
      .map((p) => ({ id: p.id, name: p.printer_name }));
    const kitchenList = (kitchens.kitchen ?? []).map((k) => ({ id: k.id, name: k.kitchen_name }));
    const menus = (catalogs.menuCatalogs ?? [])
      .filter((m) => m.active !== false)
      .map(mapMenuCatalog);
    patch((s) => ({ ...s, menu, categories, kotPrinters, kitchens: kitchenList, menus }));
  }, [patch]);

  const prevServerRef = useRef<
    Map<number, { rounds: number; status: Order["status"]; label: string; readyRounds?: number[] }>
  >(new Map());

  const applyServerOrders = useCallback(
    (raws: RawOrder[], settledRaws: RawOrder[] | null) => {
      const station = stationRef.current;
      const mapped = raws.map((r) => mapServerOrder(r, station));
      const held: Record<string, OrderLine[]> = {};
      raws.forEach((r) => {
        const lines = mapHeldLines(r, station);
        if (lines.length) held[String(r.id)] = lines;
      });
      // Alerts for changes made on OTHER terminals (this device's own
      // actions update prevServerRef before refreshing, so they don't fire here).
      const prev = prevServerRef.current;
      if (prev.size) {
        mapped.forEach((o) => {
          const p = o.backendId !== undefined ? prev.get(o.backendId) : undefined;
          const label =
            o.type === "takeaway"
              ? `Take Away · ${o.customerName ?? ""}`
              : `Table ${o.tableLabel ?? ""}`;
          if (!p) return;
          if (o.rounds.length > p.rounds) {
            pushNotification({
              id: `kot-${o.backendId}-${o.rounds.length}`,
              kind: "kot-accepted",
              title: `KOT round ${o.rounds.length} sent — ${label}`,
              body: "Sent from another terminal.",
              orderId: o.id,
            });
          }
          if (o.status === "billed" && p.status !== "billed") {
            pushNotification({
              id: `bill-${o.backendId}`,
              kind: "item-ready",
              title: `Bill generated — ${label}`,
              body: "Cashier has generated the bill for this order.",
              orderId: o.id,
            });
          }
          // Kitchen just marked a fired round ready (POST /kotReady, Web POS
          // Kitchen Display) - the one real cross-device "food's up" signal.
          // Names the actual items (not just a count) and rings the bell -
          // a captain on the far side of the floor needs to hear it, not
          // just eventually notice a badge.
          const readyBefore = new Set(p.readyRounds ?? []);
          o.rounds
            .filter((r) => r.status === "ready" && !readyBefore.has(r.no))
            .forEach((r) => {
              const roundItems = roundQty(r.lines.reduce((sum, l) => sum + l.qty, 0));
              const itemList = r.lines.map((l) => `${l.qty}× ${l.name}`).join(", ");
              pushNotification({
                id: `ready-${o.backendId}-${r.no}`,
                kind: "item-ready",
                title: `Food ready — ${label}`,
                body:
                  itemList ||
                  `Round ${r.no} (${roundItems} item${roundItems === 1 ? "" : "s"}) is ready to run out.`,
                orderId: o.id,
              });
              playOrderReadyBell();
              toast.success(`Food ready — ${label}`, { description: itemList, duration: 8000 });
            });
        });
      }
      prevServerRef.current = new Map(
        mapped
          .filter((o) => o.backendId !== undefined)
          .map((o) => [
            o.backendId!,
            {
              rounds: o.rounds.length,
              status: o.status,
              label: o.tableLabel ?? "",
              readyRounds: o.rounds.filter((r) => r.status === "ready").map((r) => r.no),
            },
          ]),
      );
      patch((s) => {
        const activeIds = new Set(mapped.map((o) => o.id));
        // A draft whose table now has a real order (fired from another device) is superseded.
        const drafts = Object.fromEntries(
          Object.entries(s.drafts).filter(
            ([, d]) =>
              d.type === "takeaway" || !mapped.some((o) => o.tableIds[0] === d.tableIds[0]),
          ),
        );
        // Carts for orders that no longer exist (settled/cancelled elsewhere) are dropped.
        const carts = Object.fromEntries(
          Object.entries(s.carts).filter(([id]) => activeIds.has(id) || id in drafts),
        );
        const settled = settledRaws
          ? settledRaws
              .filter((r) => isToday(r.createdAt) || isToday(r.updatedAt))
              .map((r) => mapServerOrder(r, station))
          : s.settled;
        return { ...s, serverOrders: mapped, heldLines: held, drafts, carts, settled };
      });
    },
    [patch, pushNotification],
  );

  const loadFloor = useCallback(
    async (withSettled = true) => {
      const [tablesRes, areasRes, activeRes, settledRes] = await Promise.all([
        tableApi.getTables(),
        tableApi.getCategories(),
        orderApi.getActive(),
        withSettled ? orderApi.getSettled(1, 50).catch(() => null) : Promise.resolve(null),
      ]);
      const tables = tablesRes.tables
        .filter((t) => t.active !== false && t.type !== "R")
        .map(mapTable);
      const areas = areasRes.tableCatagories
        .filter((a) => a.active !== false && a.type !== "R")
        .map(mapArea);
      // The bill engine resolves a table-category-scoped tax rule off this
      // list, so it has to stay in step with the floor.
      setBillSettings({ tables: tables.map((t) => ({ id: t.id, areaId: t.areaId })) });
      patch((s) => ({ ...s, tables, areas }));
      applyServerOrders(activeRes.order, settledRes ? settledRes.order : null);
    },
    [applyServerOrders, patch],
  );

  const loadReservations = useCallback(async () => {
    try {
      const { bookings } = await reservationApi.getAll();
      const today = bookings.map(mapReservation).filter((r) => isToday(r.time) || isToday(r.date));
      today.sort((a, b) => (a.time < b.time ? -1 : 1));
      patch((s) => ({ ...s, reservations: today }));
      const soon = Date.now() + 30 * 60_000;
      today.forEach((r) => {
        const t = new Date(r.time).getTime();
        if (t > Date.now() && t <= soon) {
          pushNotification({
            id: `res-${r.id}`,
            kind: "reservation",
            title: "Reservation arriving soon",
            body: `${r.customerName}, ${r.partySize} guests, table ${r.tableLabels.join(" + ")} at ${new Date(r.time).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })}.`,
          });
        }
      });
    } catch {
      // Bookings need the exe's cloud relay; a failure here must never block the floor.
    }
  }, [patch, pushNotification]);

  const refresh = useCallback(async () => {
    if (!getStoredToken()) return;
    patch((s) => ({ ...s, refreshing: true }));
    try {
      await loadFloor(true);
    } catch (err) {
      if (!(err instanceof UnauthorizedError))
        toast.error(describeError(err, "Could not refresh from the local server"));
    } finally {
      patch((s) => ({ ...s, refreshing: false }));
    }
  }, [loadFloor, patch]);

  const bootstrap = useCallback(async () => {
    patch((s) => ({ ...s, booting: true }));
    const results = await Promise.allSettled([
      loadSettings(),
      loadMenu(),
      loadFloor(true),
      loadStaff(),
    ]);
    void loadReservations();
    patch((s) => ({ ...s, booting: false }));
    const failed = results.find((r) => r.status === "rejected") as
      PromiseRejectedResult | undefined;
    if (failed && !(failed.reason instanceof UnauthorizedError)) {
      toast.error(describeError(failed.reason, "Could not load outlet data from the local server"));
    }
  }, [loadFloor, loadMenu, loadReservations, loadSettings, loadStaff, patch]);

  // ---------- session ----------
  const logout = useCallback(() => {
    setStoredToken(null);
    sessionStore.set(null);
    prevServerRef.current = new Map();
    patch((s) => ({ ...s, captain: null, serverOrders: [], heldLines: {}, settled: [] }));
  }, [patch]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      const wasIn = Boolean(stateRef.current.captain);
      logout();
      if (wasIn) toast.error("Session expired — please sign in again");
    });
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  useEffect(() => {
    const saved = sessionStore.get();
    if (saved && getStoredToken()) {
      patch((s) => ({ ...s, captain: saved, restored: true }));
      void bootstrap();
    } else {
      setStoredToken(null);
      patch((s) => ({ ...s, restored: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback<Ctx["login"]>(
    async (input) => {
      const res =
        input.mode === "pin"
          ? await authApi.pinLogin(input.mobile, input.pin)
          : await authApi.restaurantLogin(input.mobile, input.password);
      if (!res.token) throw new ApiError("Login did not return a session token");
      setStoredToken(res.token);
      const { access } = await hotelApi.getCurrentUser();
      const captain = mapCaptain(access);
      sessionStore.set(captain);
      sessionStore.setLastCaptainId(captain.id);
      patch((s) => ({ ...s, captain }));
      void bootstrap();
      return captain;
    },
    [bootstrap, patch],
  );

  // ---------- connection state ----------
  // A tap on "Search again" waits for a check already running, then runs
  // its own forced one - it is never silently ignored.
  const runningCheck = useRef<Promise<void> | null>(null);
  // Searching the network for a moved server pings up to 254 addresses, so
  // the 15s background check does it at most once a minute; a tap forces it.
  const lastServerSearch = useRef(0);
  const checkConnection = useCallback(
    async (force = false) => {
      if (runningCheck.current) {
        await runningCheck.current;
        if (!force) return;
      }
      const run = checkConnectionNow(force);
      runningCheck.current = run;
      try {
        await run;
      } finally {
        runningCheck.current = null;
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [patch, pushNotification, refresh],
  );

  const checkConnectionNow = async (force = false) => {
    let moved = false;
    let next: ConnectionState = "online";
    const syncPatch: Partial<SyncInfo> = { serverUrl: getBaseUrl() };
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      next = "offline";
    } else {
      // A session token is only valid on the exe that issued it, so a
      // signed-in handset never hops to a DIFFERENT server. It does follow
      // its own exe PC to a new address (findMovedServer accepts only that
      // PC's deviceId) - the outlet PC getting a new IP from the router used
      // to leave captains stuck on "Local server unreachable" with no way
      // out but logging out and typing the new IP.
      const searchDue = force || Date.now() - lastServerSearch.current > 60_000;
      let health = await pingCurrent(5000);
      if (!health && !getStoredToken()) {
        if (searchDue) lastServerSearch.current = Date.now();
        health = await discoverServer(2500, { scan: searchDue });
      }
      // One missed answer (Wi-Fi blip, the phone just woke up, the PC busy
      // for a moment) is not an outage. Only an already-down state is
      // re-declared on a single miss; otherwise ask twice more first, so
      // orders are never paused while the server is actually fine.
      if (!health && stateRef.current.connection !== "local-server-down") {
        for (const wait of [1500, 3000]) {
          await new Promise((r) => setTimeout(r, wait));
          health = await pingCurrent(5000);
          if (health) break;
        }
      }
      if (!health && getStoredToken() && searchDue) {
        lastServerSearch.current = Date.now();
        const found = await findMovedServer();
        if (found) {
          health = found.info;
          moved = true;
          syncPatch.serverUrl = getBaseUrl();
        }
      }
      if (health) rememberServerDevice(health);
      if (!health) next = "local-server-down";
      else if (getStoredToken()) {
        // Deliberately NOT deriving "syncing"/"sync-error" from the exe's
        // own cloud-push job (GET /localServerStatus's pendingOrderCount/
        // lastError) - that job is a separate, exe-internal concern this
        // app never talks to the cloud through, and a captain can't act on
        // it either way ("orders still safe" either way). Surfacing it as
        // a scary "Sync error" banner was flagged as wrong: it reported on
        // the local server's cloud connectivity, not on anything this app
        // itself connects to. Only the real, actionable, exe-enforced
        // 3-day max-offline-duration block is still checked here.
        try {
          const sync = await statusApi.syncStatus();
          syncPatch.lastSuccessfulSyncAt = sync.lastSuccessfulSyncAt;
          syncPatch.maxOfflineDays = sync.maxOfflineDays;
          if (sync.transactionsBlocked) next = "offline-limit-exceeded";
        } catch (err) {
          if (err instanceof UnauthorizedError) return;
        }
      }
    }
    const prev = stateRef.current.connection;
    if (moved) {
      pushNotification({
        kind: "sync",
        title: "Local server found",
        body: `The outlet PC moved to ${getBaseUrl().replace(/^https?:\/\//, "")} - reconnected.`,
      });
    }
    if (prev !== next) {
      if (next === "local-server-down" || next === "offline" || next === "offline-limit-exceeded") {
        pushNotification({
          kind: "sync",
          title:
            next === "offline"
              ? "Device offline"
              : next === "local-server-down"
                ? "Local server unreachable"
                : "Offline limit reached",
          body:
            next === "offline"
              ? "This handset lost its network. Reconnect to the outlet Wi-Fi."
              : next === "local-server-down"
                ? "New orders are paused until the BillerPe local server is reachable again."
                : "The local server has been offline past its maximum; new transactions are blocked.",
        });
      } else if (prev === "local-server-down" || prev === "offline") {
        pushNotification({
          kind: "sync",
          title: "Back online",
          body: "Connected to the local server again.",
        });
        void refresh();
      }
    }
    patch((s) => ({ ...s, connection: next, sync: { ...s.sync, ...syncPatch } }));
  };

  useEffect(() => {
    void checkConnection();
    const interval = setInterval(() => void checkConnection(), 15000);
    const onNet = () => void checkConnection();
    window.addEventListener("online", onNet);
    window.addEventListener("offline", onNet);
    return () => {
      clearInterval(interval);
      window.removeEventListener("online", onNet);
      window.removeEventListener("offline", onNet);
    };
  }, [checkConnection]);

  // ---------- live updates: socket + polling ----------
  const authed = Boolean(state.captain);
  const serverUrl = state.sync.serverUrl;
  useEffect(() => {
    if (!authed) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debounced = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void loadFloor(false).catch(() => {}), 500);
    };
    const disconnect = connectChangeFeed({
      onChange: debounced,
      onKotReady: debounced,
      onTableChange: debounced,
      onConnect: debounced,
      // Config edited centrally (or pulled from the cloud by the exe) now
      // arrives as an event, so the menu no longer has to be re-fetched on
      // a blind 5-minute timer to notice a price change.
      onConfigChange: (entities) => {
        if (
          entities.some(
            (e) =>
              e.startsWith("menu") ||
              e === "variants" ||
              e === "addons" ||
              e === "addonDepartments",
          )
        ) {
          void loadMenu().catch(() => {});
        }
        if (entities.some((e) => e.startsWith("table"))) void loadFloor(false).catch(() => {});
        if (entities.some((e) => e === "taxTypes" || e === "serviceCharge" || e === "hotel")) {
          void loadSettings().catch(() => {});
        }
      },
      onForceLogout: () => {
        logout();
        toast.error("Signed out", { description: "This account signed in on another device." });
      },
    });
    const poll = setInterval(() => void loadFloor(false).catch(() => {}), 20000);
    const menuPoll = setInterval(() => void loadMenu().catch(() => {}), 15 * 60_000);
    const resPoll = setInterval(() => void loadReservations(), 5 * 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") debounced();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disconnect();
      if (timer) clearTimeout(timer);
      clearInterval(poll);
      clearInterval(menuPoll);
      clearInterval(resPoll);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // serverUrl: the live feed reconnects to the exe's new address when the
    // outlet PC moved (checkConnectionNow).
  }, [authed, serverUrl, loadFloor, loadMenu, loadReservations, loadSettings, logout]);

  // ---------- derived orders ----------
  const orders = useMemo<Order[]>(() => {
    const withEditable = state.serverOrders.map((o) => {
      const meta = state.meta[o.id] ?? {};
      const editable = state.carts[o.id] ?? state.heldLines[o.id] ?? [];
      const rounds: KotRound[] = [...o.rounds];
      if (o.status === "running" || o.status === "held") {
        rounds.push({ no: rounds.length + 1, status: "pending", stations: [], lines: editable });
      }
      const billFlag = o.type === "takeaway" ? state.billRequested[o.id] : undefined;
      return {
        ...o,
        guests: meta.guests ?? o.guests,
        // Details the captain just entered win over the server's copy until
        // the next KOT/bill carries them there.
        customerName: meta.customerName ?? o.customerName,
        mobile: meta.mobile ?? o.mobile,
        address: meta.address ?? o.address,
        gstin: meta.gstin ?? o.gstin,
        status: billFlag && o.status === "running" ? ("billed" as const) : o.status,
        billRequestedAt: o.billRequestedAt ?? billFlag,
        rounds,
      };
    });
    const drafts = Object.values(state.drafts).map((d) => ({
      ...d,
      rounds: [{ no: 1, status: "pending" as const, stations: [], lines: state.carts[d.id] ?? [] }],
    }));
    const seen = new Set([...withEditable, ...drafts].map((o) => o.id));
    const history = [...state.settled, ...state.cancelled].filter((o) => !seen.has(o.id));
    return [...withEditable, ...drafts, ...history];
  }, [
    state.serverOrders,
    state.heldLines,
    state.carts,
    state.meta,
    state.drafts,
    state.settled,
    state.cancelled,
    state.billRequested,
  ]);

  const tables = useMemo<RestaurantTable[]>(() => {
    const reservedByTable = new Map<string, string>();
    state.reservations.forEach((r) => {
      const t = new Date(r.time);
      const label = Number.isNaN(t.getTime())
        ? r.time
        : t.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
      r.tableIds.forEach((id) => {
        if (!reservedByTable.has(id)) reservedByTable.set(id, label);
      });
    });
    return state.tables.map((t) => {
      const serverOrder = state.serverOrders.find(
        (o) => o.tableIds.includes(t.id) && ACTIVE.includes(o.status),
      );
      let status = t.status;
      if (serverOrder)
        status =
          serverOrder.status === "held"
            ? "held"
            : serverOrder.status === "billed"
              ? "billed"
              : "running";
      // Owner rule (2026-09-24): a table is Running / Hold / Bill only when
      // the exe has that order - after a KOT, a save or a hold. Opening a
      // table (and even items still in this phone's cart) used to mark it
      // Running on this handset, so a table merely looked at stayed
      // "Running" with nothing ordered.
      const reservedToday = reservedByTable.get(t.id);
      return { ...t, status, ...(reservedToday ? { reservedToday } : {}) };
    });
  }, [state.tables, state.serverOrders, state.reservations]);

  // ---------- payload helpers ----------
  const toKotItem = (l: OrderLine, kotNumber?: number): KotCartItem => {
    const menu = menuMapRef.current.get(l.itemId);
    const groups = new Map<string, KotCartItem["addons"][number]>();
    l.addons.forEach((a, i) => {
      const key = a.groupId !== undefined ? String(a.groupId) : `_${a.name}_${i}`;
      if (!groups.has(key)) {
        const groupName =
          a.groupName ?? menu?.addonGroups?.find((g) => g.id === String(a.groupId))?.name ?? "";
        groups.set(key, { id: a.groupId ?? 0, department_name: groupName, hms_addon_msts: [] });
      }
      groups.get(key)!.hms_addon_msts.push({
        id: a.id ?? 0,
        addon_name: a.name,
        price: a.price,
        qty: a.qty ?? 1,
      });
    });
    // A custom item has no menu id: it goes by name, and the exe files it
    // under a hidden menu row carrying that name (controller/kot.js), which
    // is what every screen, the KDS, the bill and the cloud then show.
    const menuId = Number(l.itemId);
    const identity =
      Number.isFinite(menuId) && menuId > 0 ? { id: menuId } : { custom: true, item_name: l.name };
    return {
      ...identity,
      ...(l.routePrinterId ? { route_printer_id: l.routePrinterId } : {}),
      ...(l.routeKitchenId ? { route_kitchen_id: l.routeKitchenId } : {}),
      qty: l.qty,
      price: l.basePrice,
      discount: 0,
      addons: [...groups.values()],
      comment: l.note ?? "",
      menu_categ_id: Number(l.categoryId ?? menu?.categoryId ?? 0),
      variantData: l.variantId
        ? { id: Number(l.variantId), variants_name: l.variantName ?? "" }
        : null,
      ...(kotNumber !== undefined ? { kotNumber } : {}),
    };
  };

  const buildPayload = (
    order: Order,
    items: KotCartItem[],
    includeOrderId: boolean,
  ): OrderPayload => {
    const totals = orderTotals(order);
    const tableId = order.tableIds[0];
    const table = tableId ? stateRef.current.tables.find((t) => t.id === tableId) : undefined;
    return {
      order_type: order.type === "takeaway" ? "pickup" : "dinin",
      ...(includeOrderId && order.backendId !== undefined ? { order_id: order.backendId } : {}),
      ...(order.type === "dine-in" && tableId
        ? { table_id: Number(tableId), tableNumber: table?.name ?? "" }
        : {}),
      ...(order.customerName ? { userName: order.customerName } : {}),
      ...(order.mobile ? { mobile: order.mobile } : {}),
      ...(order.gstin ? { gstin: order.gstin } : {}),
      ...(order.address ? { address: order.address } : {}),
      // Every figure here is a PREVIEW: the exe recomputes and stores the
      // authoritative totals from the persisted lines with the one shared
      // bill engine (helpers/orderTotals.js). Discount fields are
      // deliberately omitted - see CartPayload's own comment: sending them
      // would clear a discount the cashier applied on the Web POS.
      cart: {
        gst: totals.tax,
        totalDiscount: totals.discount,
        grandAmount: totals.total,
        myAmount: totals.subtotal,
        service_charger: totals.service,
        delivery_charge: 0,
        packaging_charge: totals.packaging,
        taxes: buildCartTaxes(totals),
        items: [{ status: "H", menuItems: items }],
      },
    };
  };

  const findOrder = (id: string) => orders.find((o) => o.id === id);

  // Stable: the order screen calls it from an effect cleanup.
  const discardEmptyDraft = useCallback(
    (orderId: string) => {
      patch((s) => {
        if (!s.drafts[orderId] || (s.carts[orderId] ?? []).length > 0) return s;
        const { [orderId]: _draft, ...drafts } = s.drafts;
        const { [orderId]: _cart, ...carts } = s.carts;
        const { [orderId]: _meta, ...meta } = s.meta;
        return { ...s, drafts, carts, meta };
      });
    },
    [patch],
  );
  const ordersRef = useRef(orders);
  ordersRef.current = orders;

  /** After a write that created a real order from a draft: move cart/meta over and drop the draft. */
  const promoteDraft = (draftId: string, backendId: number) => {
    const newId = String(backendId);
    patch((s) => {
      const { [draftId]: draft, ...drafts } = s.drafts;
      const { [draftId]: _cart, ...carts } = s.carts;
      const { [draftId]: draftMeta, ...meta } = s.meta;
      const merged: OrderMeta = {
        ...(draftMeta ?? {}),
        ...(draft
          ? {
              guests: draft.guests,
              customerName: draft.customerName,
              mobile: draft.mobile,
              address: draft.address,
              gstin: draft.gstin,
              openedAt: draft.openedAt,
            }
          : {}),
        ...(s.meta[newId] ?? {}),
      };
      return { ...s, drafts, carts, meta: { ...meta, [newId]: merged } };
    });
  };

  const blocked =
    state.connection === "local-server-down" || state.connection === "offline-limit-exceeded";
  const guard = () => {
    if (blocked) {
      toast.error("Local server unavailable — new order actions are paused");
      return true;
    }
    return false;
  };

  const editableLines = (orderId: string) =>
    stateRef.current.carts[orderId] ?? stateRef.current.heldLines[orderId] ?? [];

  const setEditable = (orderId: string, fn: (lines: OrderLine[]) => OrderLine[]) =>
    patch((s) => {
      const current = s.carts[orderId] ?? s.heldLines[orderId] ?? [];
      return { ...s, carts: { ...s.carts, [orderId]: fn(current) } };
    });

  const value: Ctx = {
    ...state,
    tables,
    orders,
    blocked,
    serverUrl: state.sync.serverUrl,
    login,
    logout,
    refresh,
    recheckConnection: () => checkConnection(true),
    orderForTable: (tableId) =>
      orders.find((o) => o.tableIds.includes(tableId) && ACTIVE.includes(o.status)),
    orderById: (id) => findOrder(id),
    tableById: (id) => tables.find((t) => t.id === id),

    startOrder: ({ tableId, guests, customerName }) => {
      const existing = orders.find(
        (o) => o.tableIds.includes(tableId) && ACTIVE.includes(o.status),
      );
      if (existing) return existing;
      const id = `draft-${tableId}`;
      const table = tables.find((t) => t.id === tableId);
      const order: Order = {
        id,
        type: "dine-in",
        tableIds: [tableId],
        tableLabel: table?.name,
        guests,
        customerName,
        openedAt: new Date().toISOString(),
        status: "running",
        discount: 0,
        rounds: [{ no: 1, status: "pending", stations: [], lines: [] }],
      };
      patch((s) => ({ ...s, drafts: { ...s.drafts, [id]: order } }));
      return order;
    },

    discardEmptyDraft,

    startTakeaway: ({ customerName, mobile, address, gstin }) => {
      const id = nextId("draft-ta-");
      const order: Order = {
        id,
        type: "takeaway",
        tableIds: [],
        customerName,
        mobile,
        address,
        gstin,
        guests: 1,
        openedAt: new Date().toISOString(),
        status: "running",
        discount: 0,
        rounds: [{ no: 1, status: "pending", stations: [], lines: [] }],
      };
      patch((s) => ({ ...s, drafts: { ...s.drafts, [id]: order } }));
      return order;
    },

    setCustomer: (orderId, { customerName, mobile, address, gstin }) => {
      const details = {
        customerName: customerName || undefined,
        mobile: mobile || undefined,
        address: address || undefined,
        gstin: gstin || undefined,
      };
      patch((s) =>
        s.drafts[orderId]
          ? { ...s, drafts: { ...s.drafts, [orderId]: { ...s.drafts[orderId], ...details } } }
          : { ...s, meta: { ...s.meta, [orderId]: { ...(s.meta[orderId] ?? {}), ...details } } },
      );
    },

    menuForOrder: (order) => {
      const menus = state.menus;
      if (menus.length < 2) return null;
      const chosen = state.meta[order.id]?.menuId;
      const byChoice = chosen ? menus.find((m) => m.id === chosen) : undefined;
      if (byChoice) return byChoice;
      // Same default as the Web POS (store.tsx#resolveMenu): a menu set up
      // for this table's area / order type, else the default menu.
      const table = order.tableIds[0]
        ? state.tables.find((t) => t.id === order.tableIds[0])
        : undefined;
      const type = order.type === "dine-in" ? "Dine-in" : "Pickup";
      const direct = menus.find((m) => {
        if (m.isDefault) return false;
        if (!m.tableCategoryIds.length && !m.orderTypes.length) return false;
        const tableOk =
          !m.tableCategoryIds.length || (!!table && m.tableCategoryIds.includes(table.areaId));
        const typeOk = !m.orderTypes.length || m.orderTypes.includes(type);
        return tableOk && typeOk;
      });
      return direct ?? menus.find((m) => m.isDefault) ?? menus[0] ?? null;
    },

    setOrderMenu: (orderId, menuId) =>
      patch((s) => ({
        ...s,
        meta: { ...s.meta, [orderId]: { ...(s.meta[orderId] ?? {}), menuId } },
      })),

    addCustomLine: (orderId, input) => {
      const name = input.name.trim();
      if (!name || !(input.price > 0) || !(input.qty > 0)) return;
      const kitchen = stateRef.current.kitchens.find((k) => k.id === input.routeKitchenId);
      setEditable(orderId, (lines) => [
        ...lines,
        {
          id: nextId("d"),
          itemId: nextId("custom-"),
          name,
          addons: [],
          qty: roundQty(input.qty),
          basePrice: input.price,
          unitPrice: input.price,
          station: kitchen?.name ?? stateRef.current.kitchens[0]?.name ?? "Kitchen",
          custom: true,
          routePrinterId: input.routePrinterId,
          routeKitchenId: input.routeKitchenId,
        },
      ]);
    },

    addLine: (orderId, input) => {
      const item = menuMapRef.current.get(input.itemId);
      if (!item) return;
      const addons = input.addons.map((a) => {
        const group = a.groupId ? item.addonGroups?.find((g) => g.id === a.groupId) : undefined;
        return {
          name: a.name,
          price: a.price,
          qty: 1,
          id: a.id ? Number(a.id) : undefined,
          groupId: a.groupId ? Number(a.groupId) : undefined,
          groupName: group?.name,
        };
      });
      const signature = lineSignature({
        itemId: input.itemId,
        variantName: input.variantName,
        addons,
        note: input.note,
      });
      setEditable(orderId, (lines) => {
        const match = lines.find((l) => lineSignature(l) === signature);
        if (match)
          return lines.map((l) =>
            l.id === match.id ? { ...l, qty: roundQty(l.qty + input.qty) } : l,
          );
        const line: OrderLine = {
          id: nextId("d"),
          itemId: input.itemId,
          name: item.name,
          variantName: input.variantName,
          variantId: input.variantId,
          addons,
          note: input.note,
          qty: input.qty,
          basePrice: input.unitPrice,
          unitPrice: input.unitPrice + addons.reduce((s, a) => s + a.price, 0),
          station: item.station,
          categoryId: item.categoryId,
        };
        return [...lines, line];
      });
    },

    updateLineQty: (orderId, lineId, qty) =>
      setEditable(orderId, (lines) => {
        const q = roundQty(qty);
        return q <= 0
          ? lines.filter((l) => l.id !== lineId)
          : lines.map((l) => (l.id === lineId ? { ...l, qty: q } : l));
      }),

    setLineNote: (orderId, lineId, note) =>
      setEditable(orderId, (lines) =>
        lines.map((l) => (l.id === lineId ? { ...l, note: note || undefined } : l)),
      ),

    fireKot: async (orderId) => {
      if (guard()) return null;
      const order = ordersRef.current.find((o) => o.id === orderId);
      const lines = editableLines(orderId);
      if (!order || lines.length === 0) return null;
      const roundNo = order.rounds.filter((r) => r.firedAt).length + 1;
      const items = roundQty(lines.reduce((s, l) => s + l.qty, 0));
      try {
        const res = await orderApi.kot(
          buildPayload(
            order,
            lines.map((l) => toKotItem(l)),
            true,
          ),
        );
        const backendId = res.kotInfo.order_id;
        const routed = (res.kotInfo.data ?? [])
          .map((d) => d.printer?.printer_name)
          .filter((n): n is string => Boolean(n));
        const stations = routed.length
          ? Array.from(new Set(routed))
          : Array.from(new Set(lines.map((l) => l.station)));
        if (order.backendId === undefined) promoteDraft(orderId, backendId);
        patch((s) => {
          const { [orderId]: _a, [String(backendId)]: _b, ...carts } = s.carts;
          const { [String(backendId)]: _h, ...heldLines } = s.heldLines;
          return { ...s, carts, heldLines };
        });
        const prev = prevServerRef.current.get(backendId);
        prevServerRef.current.set(backendId, {
          rounds: roundNo,
          status: "running",
          label: prev?.label ?? order.tableLabel ?? "",
        });
        const label =
          order.type === "takeaway"
            ? `Take Away · ${order.customerName ?? ""}`
            : `Table ${order.tableLabel ?? stateRef.current.tables.find((t) => t.id === order.tableIds[0])?.name ?? ""}`;
        pushNotification({
          kind: "kot-accepted",
          title: `KOT round ${roundNo} sent — ${label}`,
          body: `${items} item(s) routed to ${stations.join(", ")}.`,
          orderId: String(backendId),
        });
        // Awaited, unlike a plain fire-and-forget refresh: holdOrder and
        // requestBill both await this same call before returning, but this
        // one didn't - confirmed live as the cause of a pickup order still
        // reading "Hold" in the order list right after its KOT fired. The
        // backend does flip Order.status correctly (controller/kot.js's
        // addKotRoundToOrder); the local list just hadn't caught up yet.
        await loadFloor(false).catch(() => {});
        return { round: roundNo, items, stations, orderId: String(backendId) };
      } catch (err) {
        toast.error(describeError(err, "Could not send the KOT"));
        return null;
      }
    },

    holdOrder: async (orderId) => {
      if (guard()) return false;
      const order = ordersRef.current.find((o) => o.id === orderId);
      const lines = editableLines(orderId);
      if (!order || lines.length === 0) {
        toast.info("Add items before holding this order");
        return false;
      }
      try {
        const res = await orderApi.hold(
          buildPayload(
            order,
            lines.map((l) => toKotItem(l)),
            true,
          ),
        );
        if (order.backendId === undefined) promoteDraft(orderId, res.orderId);
        patch((s) => {
          const { [orderId]: _a, [String(res.orderId)]: _b, ...carts } = s.carts;
          return { ...s, carts };
        });
        const prev = prevServerRef.current.get(res.orderId);
        prevServerRef.current.set(res.orderId, {
          rounds: order.rounds.filter((r) => r.firedAt).length,
          status: "held",
          label: prev?.label ?? "",
        });
        await loadFloor(false).catch(() => {});
        return true;
      } catch (err) {
        toast.error(describeError(err, "Could not hold the order"));
        return false;
      }
    },

    requestBill: async (orderId) => {
      if (guard()) return false;
      const order = ordersRef.current.find((o) => o.id === orderId);
      if (!order) return false;
      const pending = currentRoundOf(order);
      if (pending && pending.lines.length > 0) {
        toast.error("Send the pending round as a KOT (or clear it) before requesting the bill");
        return false;
      }
      if (order.backendId === undefined) {
        toast.error("Nothing has been sent to the kitchen yet");
        return false;
      }
      try {
        const items = order.rounds
          .filter((r) => r.firedAt)
          .flatMap((r) => r.lines.map((l) => toKotItem(l, r.no)));
        await orderApi.adminOrder(buildPayload(order, items, true));
        prevServerRef.current.set(order.backendId, {
          rounds: order.rounds.filter((r) => r.firedAt).length,
          status: "billed",
          label: order.tableLabel ?? "",
        });
        await loadFloor(false).catch(() => {});
        return true;
      } catch (err) {
        toast.error(describeError(err, "Could not notify the cashier"));
        return false;
      }
    },

    setGuests: (orderId, guests) =>
      patch((s) => {
        const g = Math.max(1, guests);
        if (s.drafts[orderId]) {
          return { ...s, drafts: { ...s.drafts, [orderId]: { ...s.drafts[orderId]!, guests: g } } };
        }
        return { ...s, meta: { ...s.meta, [orderId]: { ...(s.meta[orderId] ?? {}), guests: g } } };
      }),

    cancelOrder: async (orderId) => {
      const order = ordersRef.current.find((o) => o.id === orderId);
      if (!order) return false;
      if (order.backendId === undefined) {
        patch((s) => {
          const { [orderId]: _d, ...drafts } = s.drafts;
          const { [orderId]: _c, ...carts } = s.carts;
          return { ...s, drafts, carts };
        });
        return true;
      }
      if (guard()) return false;
      try {
        await orderApi.remove(order.backendId, order.type === "dine-in");
        const record: Order = {
          ...order,
          status: "cancelled",
          rounds: order.rounds.filter((r) => r.firedAt),
        };
        prevServerRef.current.delete(order.backendId);
        patch((s) => {
          const { [orderId]: _c, ...carts } = s.carts;
          return {
            ...s,
            carts,
            cancelled: [record, ...s.cancelled.filter((c) => c.id !== record.id)].slice(0, 50),
          };
        });
        await loadFloor(false).catch(() => {});
        return true;
      } catch (err) {
        toast.error(describeError(err, "Could not cancel the order"));
        return false;
      }
    },

    // Mirrors the exe's own real check (controller/kot.js#removeKotLine) so
    // the delete control only even appears where it would actually be
    // allowed - the exe re-checks this itself regardless, so nothing here
    // is a real permission boundary on its own.
    canRemoveLine: (line) => {
      const captain = stateRef.current.captain;
      if (!captain || line.firedById === undefined) return false;
      const isManager = captain.role === "Manager" || captain.role === "Owner";
      const isOwnRound = String(line.firedById) === captain.id;
      return isManager || isOwnRound;
    },

    removeLine: async (orderId, line) => {
      const order = ordersRef.current.find((o) => o.id === orderId);
      if (!order || order.backendId === undefined || line.backendLineId === undefined) return false;
      if (guard()) return false;
      try {
        await orderApi.removeLine(order.backendId, line.backendLineId);
        toast.success(`Removed ${line.name} from the KOT`);
        await loadFloor(false).catch(() => {});
        return true;
      } catch (err) {
        toast.error(describeError(err, "Could not remove this item"));
        return false;
      }
    },

    // Prototype semantics: the OTHER table's order is folded into THIS order
    // and that table is freed. The exe's moveTable(orderId, tableId2) folds
    // `orderId` into whatever already runs on tableId2 - so we move the other
    // table's order onto this order's table.
    mergeTables: async (sourceOrderId, targetTableId) => {
      if (guard()) return false;
      const current = ordersRef.current.find((o) => o.id === sourceOrderId);
      const other = ordersRef.current.find(
        (o) => o.tableIds.includes(targetTableId) && ACTIVE.includes(o.status),
      );
      if (!current || !other || current.id === other.id) return false;
      if (current.status === "billed" || other.status === "billed") {
        toast.error("Bill already generated — merge is no longer possible");
        return false;
      }
      // A held order is never merged, either way - it can only be
      // transferred to a free table (owner rule, 2026-09-22; the exe refuses
      // it too - billerpe-local-exe/controller/table.js#destinationProblem).
      if (current.status === "held" || other.status === "held") {
        toast.error("Held orders can't be merged — transfer to a free table instead");
        return false;
      }
      const myTable = current.tableIds[0];
      if (!myTable) return false;
      if (other.backendId === undefined) {
        // Other table is only a device-side draft: fold its cart into ours.
        const otherLines = editableLines(other.id);
        setEditable(current.id, (lines) => [...lines, ...otherLines]);
        patch((s) => {
          const { [other.id]: _d, ...drafts } = s.drafts;
          const { [other.id]: _c, ...carts } = s.carts;
          return { ...s, drafts, carts };
        });
        value.setGuests(current.id, current.guests + other.guests);
        return true;
      }
      if (current.backendId === undefined) {
        toast.error("Send a KOT on this table first, then merge the other table into it");
        return false;
      }
      try {
        await tableApi.moveTable({
          tableId1: Number(targetTableId),
          tableId2: Number(myTable),
          orderId: other.backendId,
        });
        const otherCart = editableLines(other.id);
        if (otherCart.length) setEditable(current.id, (lines) => [...lines, ...otherCart]);
        patch((s) => {
          const { [other.id]: _c, ...carts } = s.carts;
          const guests =
            (s.meta[current.id]?.guests ?? current.guests) +
            (s.meta[other.id]?.guests ?? other.guests);
          return {
            ...s,
            carts,
            meta: { ...s.meta, [current.id]: { ...(s.meta[current.id] ?? {}), guests } },
          };
        });
        prevServerRef.current.delete(other.backendId);
        // The merged rounds land on this order - not a change made elsewhere.
        const mine = prevServerRef.current.get(current.backendId);
        prevServerRef.current.set(current.backendId, {
          rounds:
            (mine?.rounds ?? current.rounds.filter((r) => r.firedAt).length) +
            other.rounds.filter((r) => r.firedAt).length,
          status: mine?.status ?? current.status,
          label: mine?.label ?? current.tableLabel ?? "",
        });
        await loadFloor(false).catch(() => {});
        return true;
      } catch (err) {
        toast.error(describeError(err, "Could not merge the tables"));
        return false;
      }
    },

    transferTable: async (orderId, targetTableId) => {
      if (guard()) return false;
      const order = ordersRef.current.find((o) => o.id === orderId);
      if (!order) return false;
      if (
        ordersRef.current.some(
          (o) => o.tableIds.includes(targetTableId) && ACTIVE.includes(o.status),
        )
      )
        return false;
      if (order.status === "billed") {
        toast.error("Bill already generated — this order can no longer be moved");
        return false;
      }
      const target = tables.find((t) => t.id === targetTableId);
      if (order.backendId === undefined) {
        const newId = `draft-${targetTableId}`;
        patch((s) => {
          const { [orderId]: draft, ...drafts } = s.drafts;
          const { [orderId]: cart, ...carts } = s.carts;
          if (!draft) return s;
          return {
            ...s,
            drafts: {
              ...drafts,
              [newId]: { ...draft, id: newId, tableIds: [targetTableId], tableLabel: target?.name },
            },
            carts: cart ? { ...carts, [newId]: cart } : carts,
          };
        });
        return true;
      }
      const from = order.tableIds[0];
      if (!from) return false;
      try {
        await tableApi.moveTable({
          tableId1: Number(from),
          tableId2: Number(targetTableId),
          orderId: order.backendId,
        });
        await loadFloor(false).catch(() => {});
        return true;
      } catch (err) {
        toast.error(describeError(err, "Could not transfer the order"));
        return false;
      }
    },

    markNotificationRead: (id) =>
      patch((s) => ({
        ...s,
        notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
      })),
    markAllNotificationsRead: () =>
      patch((s) => ({ ...s, notifications: s.notifications.map((n) => ({ ...n, read: true })) })),
    unreadCount: state.notifications.filter((n) => !n.read).length,
  };

  return <CaptainContext.Provider value={value}>{children}</CaptainContext.Provider>;
}

export function useCaptain() {
  const ctx = useContext(CaptainContext);
  if (!ctx) throw new Error("useCaptain must be used inside CaptainProvider");
  return ctx;
}

export function lastCaptainId() {
  return sessionStore.lastCaptainId();
}
