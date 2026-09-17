import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  CloudOff,
  GitMerge,
  RefreshCw,
  ServerCrash,
  Timer,
  Wifi,
} from "lucide-react";
import { useState } from "react";
import { useCaptain } from "@/lib/captain/store";
import type { ConnectionState } from "@/lib/captain/types";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { LucideIcon } from "lucide-react";

const meta: Record<
  ConnectionState,
  { label: string; detail: string; icon: LucideIcon; cls: string }
> = {
  online: {
    label: "Online",
    detail: "Live with local server",
    icon: Wifi,
    cls: "bg-conn-online/12 text-conn-online",
  },
  offline: {
    label: "Offline",
    detail: "Handset has no network",
    icon: CloudOff,
    cls: "bg-conn-offline/12 text-conn-offline",
  },
  syncing: {
    label: "Syncing",
    detail: "Local server pushing orders to cloud",
    icon: RefreshCw,
    cls: "bg-conn-sync/15 text-conn-sync",
  },
  "sync-error": {
    label: "Sync error",
    detail: "Retrying — orders still safe",
    icon: AlertTriangle,
    cls: "bg-conn-error/12 text-conn-error",
  },
  conflict: {
    label: "Conflict",
    detail: "One order edited on another device",
    icon: GitMerge,
    cls: "bg-conn-sync/15 text-conn-sync",
  },
  "local-server-down": {
    label: "Local server down",
    detail: "New orders blocked",
    icon: ServerCrash,
    cls: "bg-conn-error/15 text-conn-error",
  },
  "offline-limit-exceeded": {
    label: "Offline limit reached",
    detail: "3-day offline maximum hit",
    icon: Timer,
    cls: "bg-conn-error/15 text-conn-error",
  },
};

export function ConnectionStrip() {
  const { connection, recheckConnection, sync } = useCaptain();
  const [checking, setChecking] = useState(false);
  const m = meta[connection];
  const Icon = m.icon;
  const host = sync.serverUrl.replace(/^https?:\/\//, "");

  return (
    <button
      type="button"
      onClick={async () => {
        setChecking(true);
        await recheckConnection();
        setChecking(false);
      }}
      className={cn(
        "flex w-full items-center gap-2 px-4 py-1.5 text-left text-[11px] font-medium",
        m.cls,
      )}
      aria-label={`Connection: ${m.label}. Tap to check again.`}
    >
      <Icon
        className={cn(
          "h-3.5 w-3.5 shrink-0",
          (connection === "syncing" || checking) && "animate-spin",
        )}
      />
      <span className="font-semibold">{m.label}</span>
      <span className="min-w-0 truncate opacity-80">· {m.detail}</span>
      <span className="ml-auto shrink-0 truncate opacity-60 max-w-[40%]">{host}</span>
    </button>
  );
}

export function BlockingConnectionModal() {
  const { connection, recheckConnection, blocked, sync } = useCaptain();
  const [checking, setChecking] = useState(false);
  const m = meta[connection];

  return (
    <AnimatePresence>
      {blocked ? (
        <Dialog open>
          <DialogContent className="max-w-sm rounded-3xl">
            <motion.div initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
              <DialogHeader>
                <div className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-full bg-destructive/10 text-destructive">
                  <m.icon className="h-6 w-6" />
                </div>
                <DialogTitle className="text-center">{m.label}</DialogTitle>
                <DialogDescription className="text-center">
                  {connection === "local-server-down"
                    ? `This handset can't reach the outlet's local BillerPe server at ${sync.serverUrl.replace(/^https?:\/\//, "")}, so new orders and KOTs are paused. Existing orders stay safe on the server.`
                    : `The local server has been offline past the ${sync.maxOfflineDays}-day maximum offline duration. It must reconnect to the internet and sync before new orders can be taken.`}
                </DialogDescription>
              </DialogHeader>
              <div className="mt-4 space-y-2">
                <Button
                  className="h-12 w-full"
                  disabled={checking}
                  onClick={async () => {
                    setChecking(true);
                    await recheckConnection();
                    setChecking(false);
                  }}
                >
                  <RefreshCw className={cn("mr-2 h-4 w-4", checking && "animate-spin")} />{" "}
                  {checking ? "Checking…" : "Retry connection"}
                </Button>
                {connection === "local-server-down" ? (
                  <p className="text-center text-[11px] text-muted-foreground">
                    Wrong address? Log out and use “Change server address” on the login screen.
                  </p>
                ) : null}
              </div>
            </motion.div>
          </DialogContent>
        </Dialog>
      ) : null}
    </AnimatePresence>
  );
}
