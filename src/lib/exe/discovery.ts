// Finding the outlet's local server on the LAN. Mirrors billerpe-pos-pro-v2's
// checkLocalServerHealth: 1) the address that worked last time, 2) the fixed
// mDNS hostname the exe advertises (services/lanDiscovery.js), 3) the
// build-time default, 4) whatever the captain typed manually. /health is the
// exe's one unauthenticated endpoint, safe to hit before any login exists.

const LAST_KNOWN_GOOD_KEY = "billerpe.captain.exeBaseUrl";
// The exe PC this handset works with (its /health deviceId). The search for
// a moved server accepts only this PC: a session belongs to the exe that
// issued it, and a shared Wi-Fi can carry another outlet's exe too.
const SERVER_DEVICE_KEY = "billerpe.captain.exeDeviceId";
const MDNS_HOSTNAME_URL = "http://billerpe-local-server.local:4100";
const DEFAULT_URL: string =
  (import.meta.env["VITE_EXE_BASE_URL"] as string | undefined) ?? "http://localhost:4100";

function readCached(): string | null {
  try {
    return window.localStorage.getItem(LAST_KNOWN_GOOD_KEY);
  } catch {
    return null;
  }
}

let baseUrl: string = readCached() ?? DEFAULT_URL;

export function getBaseUrl(): string {
  return baseUrl;
}

export function getCachedBaseUrl(): string | null {
  return readCached();
}

export function setBaseUrl(url: string, info?: HealthInfo | null) {
  baseUrl = url.replace(/\/$/, "");
  try {
    window.localStorage.setItem(LAST_KNOWN_GOOD_KEY, baseUrl);
    if (info?.deviceId) window.localStorage.setItem(SERVER_DEVICE_KEY, info.deviceId);
  } catch {
    // ignore - next launch just re-discovers
  }
}

export function getServerDeviceId(): string | null {
  try {
    return window.localStorage.getItem(SERVER_DEVICE_KEY);
  } catch {
    return null;
  }
}

// Remembers which exe PC answered at the current address (older installs
// never stored it), so a later search can recognise that same PC.
export function rememberServerDevice(info: HealthInfo | null) {
  if (!info?.deviceId) return;
  try {
    if (!window.localStorage.getItem(SERVER_DEVICE_KEY)) {
      window.localStorage.setItem(SERVER_DEVICE_KEY, info.deviceId);
    }
  } catch {
    // ignore
  }
}

export type HealthInfo = {
  ok: boolean;
  service?: string;
  registered?: boolean;
  deviceId?: string;
};

export async function pingHealth(url: string, timeoutMs = 3000): Promise<HealthInfo | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${url.replace(/\/$/, "")}/health`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as HealthInfo | null;
    return body && body.ok ? body : null;
  } catch {
    return null;
  }
}

/** Probes cache -> mDNS -> default -> this network. Leaves getBaseUrl() pointing at whichever answered. */
export async function discoverServer(
  timeoutMs = 3000,
  { scan = true }: { scan?: boolean } = {},
): Promise<HealthInfo | null> {
  const cached = readCached();
  if (cached) {
    const info = await pingHealth(cached, timeoutMs);
    if (info) {
      baseUrl = cached;
      rememberServerDevice(info);
      return info;
    }
  }
  const viaMdns = await pingHealth(MDNS_HOSTNAME_URL, Math.max(timeoutMs, 5000));
  if (viaMdns) {
    setBaseUrl(MDNS_HOSTNAME_URL, viaMdns);
    return viaMdns;
  }
  const viaDefault = await pingHealth(DEFAULT_URL, timeoutMs);
  if (viaDefault) {
    setBaseUrl(DEFAULT_URL, viaDefault);
    return viaDefault;
  }
  // The PC most likely got a new address from the router overnight.
  return scan ? ((await findMovedServer())?.info ?? null) : null;
}

function parseIpv4Url(url: string | null) {
  const m = url
    ? /^https?:\/\/(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?::(\d+))?/.exec(url)
    : null;
  if (!m) return null;
  return { prefix: `${m[1]}.${m[2]}.${m[3]}.`, last: Number(m[4]), port: m[5] ?? "4100" };
}

/**
 * The outlet PC's IP changed (a router hands out addresses again after a
 * restart) and the saved address is dead. Android cannot resolve the exe's
 * .local name, so the only way back used to be typing the new IP. This
 * looks for the same exe on the same network: the mDNS name first, then
 * every address of the saved address's /24 on the same port, nearest first.
 *
 * Only the exe PC this handset was using is accepted (its /health deviceId),
 * so the signed-in session stays valid and a neighbouring outlet's exe on a
 * shared Wi-Fi is never picked. A handset that never stored that id (first
 * connect) accepts the network's only registered exe, never one of several.
 */
export async function findMovedServer(): Promise<{ url: string; info: HealthInfo } | null> {
  const expected = getServerDeviceId();
  const isOurs = (info: HealthInfo | null) =>
    !!info && (expected ? info.deviceId === expected : info.registered !== false);

  const viaMdns = await pingHealth(MDNS_HOSTNAME_URL, 3000);
  if (viaMdns && expected && isOurs(viaMdns)) {
    setBaseUrl(MDNS_HOSTNAME_URL, viaMdns);
    return { url: MDNS_HOSTNAME_URL, info: viaMdns };
  }

  const saved = parseIpv4Url(readCached() ?? baseUrl);
  if (!saved) return null;
  const hosts = Array.from({ length: 254 }, (_, i) => i + 1)
    .filter((n) => n !== saved.last)
    .sort((a, b) => Math.abs(a - saved.last) - Math.abs(b - saved.last));
  const found: { url: string; info: HealthInfo }[] = [];
  let next = 0;
  const worker = async () => {
    // With a known PC the first match ends the search; otherwise every
    // address is checked so a second exe is noticed.
    while (next < hosts.length && !(expected && found.length)) {
      const url = `http://${saved.prefix}${hosts[next++]}:${saved.port}`;
      const info = await pingHealth(url, 1500);
      if (info && info.service === "billerpe-local-exe" && isOurs(info)) found.push({ url, info });
    }
  };
  await Promise.all(Array.from({ length: 32 }, worker));
  const pick = expected ? found[0] : found.length === 1 ? found[0] : undefined;
  if (!pick) return null;
  setBaseUrl(pick.url, pick.info);
  return pick;
}

/** Manual override from the login screen: "192.168.1.12:4100", "192.168.1.12" or a full URL. */
export async function setManualServerAddress(hostOrUrl: string): Promise<HealthInfo | null> {
  const trimmed = hostOrUrl.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`;
  const noSlash = withScheme.replace(/\/$/, "");
  const normalized = /:\d+$/.test(noSlash) ? noSlash : `${noSlash}:4100`;
  const info = await pingHealth(normalized, 4000);
  if (!info) return null;
  setBaseUrl(normalized, null);
  return info;
}

/** True when `info` is a different exe PC from the one this handset used. */
export function isDifferentServer(info: HealthInfo | null): boolean {
  const expected = getServerDeviceId();
  return !!(info?.deviceId && expected && info.deviceId !== expected);
}

/** After the captain confirms a switch to another PC: that PC is now "ours". */
export function adoptServer(info: HealthInfo | null) {
  if (!info?.deviceId) return;
  try {
    window.localStorage.setItem(SERVER_DEVICE_KEY, info.deviceId);
  } catch {
    // ignore
  }
}

/** Quick reachability check of the currently selected address only. */
export async function pingCurrent(timeoutMs = 3000): Promise<HealthInfo | null> {
  return pingHealth(baseUrl, timeoutMs);
}

// This handset's own random per-install id, sent as `device_id` on login -
// the exe only uses it as the per-device session key.
const DEVICE_ID_KEY = "billerpe.captain.deviceId";
export function getDeviceId(): string {
  try {
    let id = window.localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
              const r = (Math.random() * 16) | 0;
              return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
            });
      window.localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return "captain-handset";
  }
}
