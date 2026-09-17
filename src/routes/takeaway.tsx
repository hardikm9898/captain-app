import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, ArrowRight, ShoppingBag } from "lucide-react";
import { AppShell, ScreenHeader } from "@/components/captain/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCaptain } from "@/lib/captain/store";

export const Route = createFileRoute("/takeaway")({
  head: () => ({
    meta: [
      { title: "Take Away Order — BillerPe Captain" },
      {
        name: "description",
        content:
          "Start a pickup order with customer name and mobile, then use the same menu and KOT flow.",
      },
    ],
  }),
  component: TakeAway,
});

function TakeAway() {
  const { startTakeaway, blocked } = useCaptain();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");

  return (
    <AppShell
      hideNav
      header={
        <ScreenHeader
          title="Take Away"
          subtitle="Pickup order — no table needed"
          back={
            <Link to="/" className="grid h-10 w-10 place-items-center rounded-full bg-secondary">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          }
        />
      }
    >
      <div className="mx-auto w-full max-w-xl">
        <div className="flex items-start gap-3 rounded-3xl border border-border bg-card p-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand">
            <ShoppingBag className="h-5 w-5" />
          </div>
          <p className="text-sm text-muted-foreground">
            Capture who is picking up, then build the order with the same menu, cart and KOT flow as
            dine-in.
          </p>
        </div>

        <div className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ta-name">Customer name</Label>
            <Input
              id="ta-name"
              className="h-12"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Nirav Patel"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ta-mobile">Mobile number</Label>
            <Input
              id="ta-mobile"
              className="h-12"
              inputMode="tel"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              placeholder="98250 00000"
            />
          </div>
        </div>

        <Button
          className="mt-6 h-14 w-full text-base"
          disabled={blocked || name.trim().length < 2 || mobile.trim().length < 6}
          onClick={() => {
            const order = startTakeaway({ customerName: name.trim(), mobile: mobile.trim() });
            navigate({ to: "/order/$orderId", params: { orderId: order.id } });
          }}
        >
          Continue to menu <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </AppShell>
  );
}
