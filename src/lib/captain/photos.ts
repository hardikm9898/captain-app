import { useSyncExternalStore } from "react";
import { http } from "@/lib/exe/client";
import { getBaseUrl } from "@/lib/exe/discovery";

// Menu photos (owner 2026-10-09). A menu item's photo is a BillerPe library
// photo; the outlet PC keeps a copy, so the Captain App loads it from the PC
// over the restaurant's Wi-Fi (works without internet). Lists use the small
// copy. The outlet chooses whether photos show while ordering (on by default).

const FILE = /\/menu-photos\/([a-z0-9-]+?)(-t)?\.webp$/;

export function photoSrc(url: string | null | undefined, small = true): string | undefined {
  if (!url) return undefined;
  const m = url.match(FILE);
  if (m) return `${getBaseUrl()}/menu-photos/${m[1]}${small ? "-t" : ""}.webp`;
  return /^https?:\/\//.test(url) ? url : undefined;
}

let on = true;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded) return;
  loaded = true;
  http
    .get<{ billingPhotos: boolean }>("/photos/prefs")
    .then((p) => {
      on = p.billingPhotos !== false;
      listeners.forEach((fn) => fn());
    })
    .catch(() => {
      // An older PC (no /photos yet): photos stay on; ask again next time.
      loaded = false;
    });
}

export function useMenuPhotos() {
  load();
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    () => on,
  );
}

export function initialTone(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 45% 88%)`;
}
