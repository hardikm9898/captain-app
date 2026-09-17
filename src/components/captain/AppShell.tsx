import { Link, useRouterState } from "@tanstack/react-router";
import { Bell, CalendarClock, LayoutGrid, ReceiptText, Soup, User } from "lucide-react";
import type { ReactNode } from "react";
import { BlockingConnectionModal, ConnectionStrip } from "./ConnectionStrip";
import { useCaptain } from "@/lib/captain/store";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/", label: "Tables", icon: LayoutGrid },
  { to: "/status", label: "Status", icon: Soup },
  { to: "/orders", label: "Orders", icon: ReceiptText },
  { to: "/reservations", label: "Bookings", icon: CalendarClock },
  { to: "/notifications", label: "Alerts", icon: Bell },
  { to: "/profile", label: "Profile", icon: User },
] as const;

// Phone-first shell. On tablets the same column simply widens (max-w-3xl →
// max-w-5xl at lg) so grids get more columns without changing the design.
export const SHELL_WIDTH = "max-w-3xl lg:max-w-5xl";

export function AppShell({
  children,
  hideNav,
  header,
}: {
  children: ReactNode;
  hideNav?: boolean;
  header?: ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { unreadCount } = useCaptain();

  return (
    <div className={cn("mx-auto flex min-h-screen w-full flex-col bg-background", SHELL_WIDTH)}>
      <div className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur pt-[env(safe-area-inset-top)]">
        <ConnectionStrip />
        {header}
      </div>
      <main className={cn("flex-1 px-4 pt-3 md:px-6", hideNav ? "pb-6" : "pb-24")}>{children}</main>
      {hideNav ? null : (
        <nav
          className={cn(
            "fixed bottom-0 left-1/2 z-30 w-full -translate-x-1/2 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur",
            SHELL_WIDTH,
          )}
        >
          <ul className="grid grid-cols-6">
            {nav.map((item) => {
              const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className={cn(
                      "flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition md:flex-row md:justify-center md:gap-2 md:py-3 md:text-xs",
                      active ? "text-brand" : "text-muted-foreground",
                    )}
                  >
                    <span className="relative">
                      <Icon className="h-5 w-5" />
                      {item.to === "/notifications" && unreadCount > 0 ? (
                        <span className="absolute -top-1 -right-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[9px] font-bold text-brand-foreground">
                          {unreadCount}
                        </span>
                      ) : null}
                    </span>
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
      <BlockingConnectionModal />
    </div>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  right,
  back,
}: {
  title: string;
  subtitle?: ReactNode;
  right?: ReactNode;
  back?: ReactNode;
}) {
  return (
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 md:px-6">
      <div className="flex min-w-0 items-center gap-2">
        {back}
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold">{title}</h1>
          {subtitle ? (
            <div className="truncate text-xs text-muted-foreground [&_button]:text-brand [&_button]:font-medium">
              {subtitle}
            </div>
          ) : null}
        </div>
      </div>
      {right}
    </header>
  );
}
