import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, BellRing, CalendarClock, CheckCheck, RefreshCw, Soup } from "lucide-react";
import { AppShell, ScreenHeader } from "@/components/captain/AppShell";
import { EmptyState } from "@/components/captain/States";
import { Button } from "@/components/ui/button";
import { elapsed } from "@/lib/captain/format";
import { useCaptain } from "@/lib/captain/store";
import { cn } from "@/lib/utils";
import type { AppNotification } from "@/lib/captain/types";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "Alerts — BillerPe Captain" },
      {
        name: "description",
        content:
          "Kitchen ready alerts, KOT acceptances, booking reminders and sync notices for captains.",
      },
    ],
  }),
  component: Notifications,
});

const iconFor = (kind: AppNotification["kind"]) =>
  kind === "item-ready"
    ? BellRing
    : kind === "kot-accepted"
      ? Soup
      : kind === "reservation"
        ? CalendarClock
        : RefreshCw;

function Notifications() {
  const { notifications, markNotificationRead, markAllNotificationsRead, unreadCount } =
    useCaptain();
  const list = notifications.slice().sort((a, b) => (a.time < b.time ? 1 : -1));

  return (
    <AppShell
      header={
        <ScreenHeader
          title="Alerts"
          subtitle={unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
          right={
            list.length > 0 ? (
              <Button variant="outline" className="h-10" onClick={markAllNotificationsRead}>
                <CheckCheck className="mr-1.5 h-4 w-4" /> Mark all
              </Button>
            ) : undefined
          }
        />
      }
    >
      {list.length === 0 ? (
        <EmptyState icon={Bell} title="No alerts yet" body="Kitchen and sync updates land here." />
      ) : (
        <div className="space-y-2 md:grid md:grid-cols-2 md:gap-2 md:space-y-0 md:items-start">
          {list.map((n) => {
            const Icon = iconFor(n.kind);
            const body = (
              <div
                className={cn(
                  "grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-2xl border p-4 text-left",
                  n.read ? "border-border bg-card" : "border-brand/40 bg-brand-soft",
                )}
              >
                <span
                  className={cn(
                    "grid h-10 w-10 shrink-0 place-items-center rounded-xl",
                    n.read
                      ? "bg-secondary text-muted-foreground"
                      : "bg-brand text-brand-foreground",
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold">{n.title}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {elapsed(n.time)} ago
                    </span>
                  </span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">{n.body}</span>
                </span>
              </div>
            );

            return n.orderId ? (
              <Link
                key={n.id}
                to="/order/$orderId"
                params={{ orderId: n.orderId }}
                onClick={() => markNotificationRead(n.id)}
                className="block"
              >
                {body}
              </Link>
            ) : (
              <button
                key={n.id}
                type="button"
                onClick={() => markNotificationRead(n.id)}
                className="block w-full"
              >
                {body}
              </button>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
