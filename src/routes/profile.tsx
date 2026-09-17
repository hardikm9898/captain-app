import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { LifeBuoy, LogOut, RefreshCw, ShieldCheck, Store, Wifi } from "lucide-react";
import { AppShell, ScreenHeader } from "@/components/captain/AppShell";
import { Button } from "@/components/ui/button";
import { orderTotals, useCaptain } from "@/lib/captain/store";
import { inr } from "@/lib/captain/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Captain Profile — BillerPe Captain" },
      {
        name: "description",
        content: "Captain shift summary, outlet details, local server status and secure logout.",
      },
    ],
  }),
  component: Profile,
});

const APP_VERSION = "1.0.0";

function Profile() {
  const { captain, logout, orders, connection, sync, outlet, recheckConnection } = useCaptain();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);

  const mine = orders.filter((o) => o.status !== "cancelled");
  const sales = mine.reduce(
    (s, o) => s + (o.status === "settled" ? (o.serverTotal ?? 0) : orderTotals(o).total),
    0,
  );
  const rounds = mine.reduce((s, o) => s + o.rounds.filter((r) => r.firedAt).length, 0);

  return (
    <AppShell header={<ScreenHeader title="Profile" subtitle="Shift summary and app settings" />}>
      <div className="rounded-3xl border border-border bg-card p-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-brand text-lg font-bold text-brand-foreground">
            {captain?.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-lg font-bold">{captain?.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {captain?.role} · {captain?.mobile}
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Stat label="Orders today" value={String(mine.length)} />
          <Stat label="KOT rounds" value={String(rounds)} />
          <Stat label="Sales" value={inr(sales)} />
        </div>
      </div>

      <div className="mt-4 rounded-3xl border border-border bg-card p-5">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Store className="h-4 w-4 text-brand" /> {outlet.name}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{outlet.outlet}</p>
        <p className="mt-1 text-xs text-muted-foreground">Device {outlet.deviceName}</p>
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-st-free" /> Menu, tables and bookings come from the
          outlet's BillerPe local server.
        </p>
      </div>

      <div className="mt-4 rounded-3xl border border-border bg-card p-5">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Wifi className="h-4 w-4 text-brand" /> Local server
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {sync.serverUrl.replace(/^https?:\/\//, "")}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <Info label="Status" value={connection.replace(/-/g, " ")} />
          <Info label="Offline limit" value={`${sync.maxOfflineDays} days`} />
        </div>
        <Button
          variant="outline"
          className="mt-3 h-11 w-full"
          disabled={checking}
          onClick={async () => {
            setChecking(true);
            await recheckConnection();
            setChecking(false);
            toast.success("Connection re-checked");
          }}
        >
          <RefreshCw className={cn("mr-2 h-4 w-4", checking && "animate-spin")} /> Check connection
        </Button>
      </div>

      <div className="mt-4 rounded-3xl border border-border bg-card p-5">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <LifeBuoy className="h-4 w-4 text-brand" /> Help & support
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          PIN changes and password resets are done by the outlet owner in the BillerPe Web POS
          (Users). For app issues contact BillerPe support.
        </p>
        <p className="mt-2 text-[11px] text-muted-foreground">BillerPe Captain v{APP_VERSION}</p>
      </div>

      <Button
        variant="outline"
        className="mt-4 h-12 w-full text-destructive"
        onClick={() => {
          logout();
          navigate({ to: "/login" });
        }}
      >
        <LogOut className="mr-2 h-4 w-4" /> Log out
      </Button>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-secondary px-2 py-3">
      <p className="truncate text-sm font-bold">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-secondary px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="truncate font-semibold capitalize">{value}</p>
    </div>
  );
}
