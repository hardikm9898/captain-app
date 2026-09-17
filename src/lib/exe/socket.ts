// Live "something changed" feed from the exe (connection/socket.js emits
// `webChange { orderId }` on every order mutation from any terminal). Auth is
// the same bearer JWT REST uses, passed in socket.io's handshake `auth` -
// the exe's socketAuth accepts it alongside its cookie.
import { io, type Socket } from "socket.io-client";
import { getBaseUrl } from "./discovery";
import { getStoredToken } from "./client";

export function connectChangeFeed(handlers: {
  onChange: (
    orderId: number,
    event: { tableId?: number | null | undefined; action?: string | undefined },
  ) => void;
  /** Kitchen marked a fired round ready on the Web POS Kitchen Display - see billerpe-local-exe/controller/kot.js#markKotReady. */
  onKotReady?: (orderId: number, kotNumber: number) => void;
  /** Table status/structure changed with no single order behind it (move, reservation hold, edit). */
  onTableChange?: (tableIds: number[], action?: string) => void;
  /** Config (menu/tax/settings/users) changed on the exe - edited locally or pulled from the cloud. */
  onConfigChange?: (entities: string[]) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  /** This user logged in on another device - single-device policy, controller/auth.js#issueSession. */
  onForceLogout?: (reason?: string) => void;
}): () => void {
  const token = getStoredToken();
  if (!token) return () => {};
  const socket: Socket = io(getBaseUrl(), {
    transports: ["websocket"],
    auth: { token },
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 15000,
  });
  socket.on("connect", () => handlers.onConnect?.());
  socket.on("disconnect", () => handlers.onDisconnect?.());
  socket.on("webChange", (data: { orderId?: number; tableId?: number | null; action?: string }) => {
    if (data && typeof data.orderId === "number") {
      handlers.onChange(data.orderId, { tableId: data.tableId, action: data.action });
    }
  });
  socket.on("tableChange", (data: { tableIds?: number[]; action?: string }) => {
    if (data && Array.isArray(data.tableIds)) handlers.onTableChange?.(data.tableIds, data.action);
  });
  socket.on("configChange", (data: { entities?: string[] }) => {
    if (data && Array.isArray(data.entities)) handlers.onConfigChange?.(data.entities);
  });
  socket.on("kotReady", (data: { orderId?: number; kotNumber?: number }) => {
    if (data && typeof data.orderId === "number" && typeof data.kotNumber === "number") {
      handlers.onKotReady?.(data.orderId, data.kotNumber);
    }
  });
  socket.on("forceLogout", (data: { reason?: string }) => {
    handlers.onForceLogout?.(data?.reason);
  });
  return () => {
    socket.removeAllListeners();
    socket.close();
  };
}
