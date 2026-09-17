// Finding the outlet's local server on the LAN. Mirrors billerpe-pos-pro-v2's
// checkLocalServerHealth: 1) the address that worked last time, 2) the fixed
// mDNS hostname the exe advertises (services/lanDiscovery.js), 3) the
// build-time default, 4) whatever the captain typed manually. /health is the
// exe's one unauthenticated endpoint, safe to hit before any login exists.

const LAST_KNOWN_GOOD_KEY = "billerpe.captain.exeBaseUrl";
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

export function setBaseUrl(url: string) {
  baseUrl = url.replace(/\/$/, "");
  try {
    window.localStorage.setItem(LAST_KNOWN_GOOD_KEY, baseUrl);
  } catch {
    // ignore - next launch just re-discovers
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

/** Probes cache -> mDNS -> default. Leaves getBaseUrl() pointing at whichever answered. */
export async function discoverServer(timeoutMs = 3000): Promise<HealthInfo | null> {
  const cached = readCached();
  if (cached) {
    const info = await pingHealth(cached, timeoutMs);
    if (info) {
      baseUrl = cached;
      return info;
    }
  }
  const viaMdns = await pingHealth(MDNS_HOSTNAME_URL, Math.max(timeoutMs, 5000));
  if (viaMdns) {
    setBaseUrl(MDNS_HOSTNAME_URL);
    return viaMdns;
  }
  const viaDefault = await pingHealth(DEFAULT_URL, timeoutMs);
  if (viaDefault) {
    setBaseUrl(DEFAULT_URL);
    return viaDefault;
  }
  return null;
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
  setBaseUrl(normalized);
  return info;
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
