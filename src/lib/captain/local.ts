// Device-local persistence (WebView localStorage). Holds only what the local
// server has no column for: the un-fired cart round per order, guest counts,
// draft orders that have not reached the exe yet, the alert feed, cached
// staff/outlet for the login screen, and the signed-in captain.

import type { AppNotification, Captain, Order, OrderLine, Outlet } from "./types";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full/unavailable - the in-memory copy still drives the UI
  }
}
function remove(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

const K = {
  session: "billerpe.captain.session",
  lastCaptain: "billerpe.captain.last",
  staff: "billerpe.captain.staff",
  outlet: "billerpe.captain.outlet",
  drafts: "billerpe.captain.drafts",
  cart: "billerpe.captain.cart",
  guests: "billerpe.captain.guests",
  flags: "billerpe.captain.flags",
  notifications: "billerpe.captain.notifications",
  cancelled: "billerpe.captain.cancelled",
} as const;

export const sessionStore = {
  get: () => read<Captain | null>(K.session, null),
  set: (c: Captain | null) => (c ? write(K.session, c) : remove(K.session)),
  lastCaptainId: () => read<string | null>(K.lastCaptain, null),
  setLastCaptainId: (id: string) => write(K.lastCaptain, id),
};

export const staffCache = {
  get: () => read<Captain[]>(K.staff, []),
  set: (list: Captain[]) => write(K.staff, list),
};

export const outletCache = {
  get: () => read<Outlet | null>(K.outlet, null),
  set: (o: Outlet) => write(K.outlet, o),
};

/** Orders opened on this handset that the exe does not know yet (no KOT/hold fired). */
export const draftStore = {
  get: () => read<Record<string, Order>>(K.drafts, {}),
  set: (drafts: Record<string, Order>) => write(K.drafts, drafts),
};

/** The editable (un-fired) round's lines, keyed by order id (draft id or backend id). */
export const cartStore = {
  get: () => read<Record<string, OrderLine[]>>(K.cart, {}),
  set: (carts: Record<string, OrderLine[]>) => write(K.cart, carts),
};

/** Guest count + customer name per backend order id (the exe order has no guests column). */
export type OrderMeta = {
  guests?: number | undefined;
  customerName?: string | undefined;
  mobile?: string | undefined;
  openedAt?: string | undefined;
};
export const metaStore = {
  get: () => read<Record<string, OrderMeta>>(K.guests, {}),
  set: (m: Record<string, OrderMeta>) => write(K.guests, m),
};

/** Local-only flags: pickup orders whose bill was requested (no server state exists for that). */
export const flagStore = {
  get: () => read<{ billRequested: Record<string, string> }>(K.flags, { billRequested: {} }),
  set: (f: { billRequested: Record<string, string> }) => write(K.flags, f),
};

/** Cancelled orders are soft-deleted server-side and vanish from every list; keep a local record for Today's Orders. */
export const cancelledStore = {
  get: () => read<Order[]>(K.cancelled, []),
  set: (list: Order[]) => write(K.cancelled, list),
};

export const notificationStore = {
  get: () => read<AppNotification[]>(K.notifications, []),
  set: (list: AppNotification[]) => write(K.notifications, list.slice(0, 100)),
};

export function clearDeviceCaches() {
  [K.drafts, K.cart, K.guests, K.flags].forEach(remove);
}
