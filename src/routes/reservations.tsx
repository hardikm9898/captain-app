import { createFileRoute } from "@tanstack/react-router";
import { CalendarClock, Phone, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell, ScreenHeader } from "@/components/captain/AppShell";
import { Chip, ChipRow } from "@/components/captain/Chip";
import { EmptyState } from "@/components/captain/States";
import { timeOf } from "@/lib/captain/format";
import { bookingMoment } from "@/lib/captain/mappers";
import { useCaptain } from "@/lib/captain/store";

export const Route = createFileRoute("/reservations")({
  head: () => ({
    meta: [
      { title: "Today's Bookings — BillerPe Captain" },
      {
        name: "description",
        content:
          "Read-only list of today's table reservations with party size, time and contact number.",
      },
    ],
  }),
  component: Reservations,
});

function Reservations() {
  const { reservations: all, tableById } = useCaptain();

  // Owner rule (list 2026-10-02 #2), same as the Web POS: Upcoming until the
  // booking's END time (one going on now included), soonest first; then
  // Ended, latest first. A clock tick moves a booking across on time.
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const [tab, setTab] = useState<"upcoming" | "ended">("upcoming");
  const { upcoming, ended } = useMemo(() => {
    const timed = all.map((r) => {
      const start = bookingMoment(r.date, r.time) ?? 0;
      let end = bookingMoment(r.date, r.endTime) ?? start;
      // 23:00 -> 01:00 runs past midnight (same rule as the exe).
      if (end < start) end += 24 * 60 * 60 * 1000;
      return { r, start, end };
    });
    return {
      upcoming: timed
        .filter((x) => x.end > clock)
        .sort((a, b) => a.start - b.start)
        .map((x) => x.r),
      ended: timed
        .filter((x) => x.end <= clock)
        .sort((a, b) => b.end - a.end)
        .map((x) => x.r),
    };
  }, [all, clock]);
  const reservations = tab === "upcoming" ? upcoming : ended;

  return (
    <AppShell header={<ScreenHeader title="Today's bookings" subtitle="Synced from Web POS" />}>
      <p className="rounded-2xl border border-border bg-secondary px-4 py-3 text-xs text-muted-foreground">
        Bookings are read-only here. Create or edit reservations from the BillerPe Web POS.
      </p>

      <ChipRow className="mt-3">
        <Chip active={tab === "upcoming"} onClick={() => setTab("upcoming")}>
          Upcoming ({upcoming.length})
        </Chip>
        <Chip active={tab === "ended"} onClick={() => setTab("ended")}>
          Ended ({ended.length})
        </Chip>
      </ChipRow>

      {reservations.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title={tab === "upcoming" ? "No upcoming bookings today" : "No ended bookings today"}
        />
      ) : (
        <div className="mt-3 space-y-2 md:grid md:grid-cols-2 xl:grid-cols-3 md:gap-2 md:space-y-0">
          {reservations.map((r) => (
            <div key={r.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{r.customerName}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" /> {r.partySize} pax
                    </span>
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3" /> {r.mobile}
                    </span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-st-reserved">
                    {timeOf(r.time)}
                    {r.endTime ? ` – ${timeOf(r.endTime)}` : ""}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Table{" "}
                    {r.tableIds.length
                      ? r.tableIds
                          .map((id, i) => tableById(id)?.name ?? r.tableLabels[i])
                          .filter(Boolean)
                          .join(" + ")
                      : r.tableLabels.join(" + ") || "—"}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
