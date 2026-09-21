import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, ArrowRight, ShoppingBag } from "lucide-react";
import { AppShell, ScreenHeader } from "@/components/captain/AppShell";
import { Button } from "@/components/ui/button";
import {
  CustomerFields,
  customerErrors,
  EMPTY_CUSTOMER,
  type CustomerValues,
} from "@/components/captain/CustomerForm";
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
  const [customer, setCustomer] = useState<CustomerValues>(EMPTY_CUSTOMER);
  const [showErrors, setShowErrors] = useState(false);

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

        <div className="mt-5">
          <CustomerFields
            value={customer}
            onChange={setCustomer}
            showErrors={showErrors}
            autoFocus
          />
        </div>

        <Button
          className="mt-6 h-14 w-full text-base"
          disabled={blocked}
          onClick={() => {
            const errors = customerErrors(customer);
            if (errors.mobile || errors.gstin) {
              setShowErrors(true);
              return;
            }
            const order = startTakeaway({
              customerName: customer.name.trim(),
              mobile: customer.mobile,
              address: customer.address.trim(),
              gstin: customer.gstin,
            });
            navigate({ to: "/order/$orderId", params: { orderId: order.id } });
          }}
        >
          Continue to menu <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </AppShell>
  );
}
