import { CalendarPlus, CreditCard, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useCaptain } from "@/lib/captain/store";
import { describeError } from "@/lib/exe/client";
import { planApi, refreshPlan, setPlan, usePlan } from "@/lib/exe/plan";

// The outlet's BillerPe plan (owner 2026-10-08): when it ends the whole
// software locks, this app included. The lock covers every screen with the
// renewal payment link, ONE "Extend 1 day" and "I have paid". The exe
// decides (billerpe-local-exe helpers/planLock.js); see lib/exe/plan.ts.

const CHECK_MS = 5 * 60 * 1000;

async function openPay(setError: (e: string | null) => void) {
  try {
    const r = await planApi.pay();
    // Capacitor opens an outside link in the phone's browser.
    window.open(r.url, "_blank");
  } catch (e) {
    setError(describeError(e));
  }
}

export function PlanLock() {
  const { captain } = useCaptain();
  const plan = usePlan();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!captain) {
      setPlan(null);
      return;
    }
    void refreshPlan();
    const id = setInterval(() => void refreshPlan(), CHECK_MS);
    return () => clearInterval(id);
  }, [captain]);

  if (!captain || !plan?.locked) return null;

  const run = async (kind: string, fn: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    setNote(null);
    try {
      await fn();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy("");
    }
  };
  const unlocked = (p: typeof plan) => {
    setPlan(p);
    // Reload so every screen fetches what it was refused while locked.
    if (!p.locked) window.location.reload();
  };

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="BillerPe plan ended"
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-background px-5 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]"
    >
      <div className="w-full max-w-sm py-8 text-center">
        <h1 className="text-xl font-bold text-foreground">Your BillerPe plan has ended</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {plan.message || "The software is locked until the plan is renewed."}
        </p>
        {plan.outlet ? <p className="mt-1 text-sm font-semibold text-foreground">{plan.outlet}</p> : null}
        <div className="mt-6 flex flex-col gap-3">
          <Button
            size="lg"
            className="h-12"
            disabled={!!busy}
            onClick={() =>
              void run("pay", async () => {
                await openPay(setError);
                setNote('After paying, come back and press "I have paid".');
              })
            }
          >
            {busy === "pay" ? <Loader2 className="animate-spin" /> : <CreditCard />} Renew now (pay online)
          </Button>
          {plan.canExtend ? (
            <Button
              size="lg"
              variant="outline"
              className="h-12"
              disabled={!!busy}
              onClick={() => void run("extend", async () => unlocked(await planApi.extend()))}
            >
              {busy === "extend" ? <Loader2 className="animate-spin" /> : <CalendarPlus />} Extend 1 day (once)
            </Button>
          ) : (
            <p className="text-xs font-semibold text-muted-foreground">The 1-day extension is already used.</p>
          )}
          <Button
            size="lg"
            variant="outline"
            className="h-12"
            disabled={!!busy}
            onClick={() =>
              void run("check", async () => {
                const p = await planApi.check();
                unlocked(p);
                if (p.locked) setNote("Not renewed yet. After paying online it unlocks within a minute.");
              })
            }
          >
            {busy === "check" ? <Loader2 className="animate-spin" /> : <RefreshCw />} I have paid: check again
          </Button>
        </div>
        {error ? (
          <p role="alert" className="mt-4 text-sm font-semibold text-destructive">
            {error}
          </p>
        ) : null}
        {note ? <p className="mt-4 text-sm text-muted-foreground">{note}</p> : null}
        <p className="mt-6 text-xs text-muted-foreground">
          Bills already made are safe. The owner or manager can renew; call BillerPe support for help.
        </p>
      </div>
    </div>
  );
}

/** While the 1-day extension runs: a strip under the connection strip. */
export function PlanBanner() {
  const plan = usePlan();
  const [error, setError] = useState<string | null>(null);
  if (!plan || plan.locked || !plan.inGrace) return null;
  return (
    <div role="status" className="flex items-center gap-2 bg-brand px-4 py-2 text-xs font-semibold text-brand-foreground">
      <span className="flex-1">{error || plan.message || "Extended by 1 day. Renew now to keep using BillerPe."}</span>
      <button
        type="button"
        onClick={() => void openPay(setError)}
        className="shrink-0 rounded-full bg-brand-foreground px-3 py-1 text-[11px] font-bold text-brand"
      >
        Renew now
      </button>
    </div>
  );
}
