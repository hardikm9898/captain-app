import { createFileRoute } from "@tanstack/react-router";
import { CalendarClock, Phone, Users } from "lucide-react";
import { AppShell, ScreenHeader } from "@/components/captain/AppShell";
import { EmptyState } from "@/components/captain/States";
import { timeOf } from "@/lib/captain/format";
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
  const { reservations, tableById } = useCaptain();

  return (
    <AppShell header={<ScreenHeader title="Today's bookings" subtitle="Synced from Web POS" />}>
      <p className="rounded-2xl border border-border bg-secondary px-4 py-3 text-xs text-muted-foreground">
        Bookings are read-only here. Create or edit reservations from the BillerPe Web POS.
      </p>

      {reservations.length === 0 ? (
        <EmptyState icon={CalendarClock} title="No bookings today" />
      ) : (
        <div className="mt-3 space-y-2 md:grid md:grid-cols-2 md:gap-2 md:space-y-0">
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
