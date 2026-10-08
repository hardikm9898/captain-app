// The outlet's BillerPe plan as the exe knows it (billerpe-local-exe
// helpers/planLock.js, routes/plan.js). Owner 2026-10-08: when the plan ends
// the whole software locks - this app included - with the renewal payment
// link and ONE "Extend 1 day"; while that extra day runs, a banner says so.
// Any exe answer 402 "plan-expired" (client.ts) lands here.

import { useSyncExternalStore } from "react";

import { getStoredToken, http, setPlanLockedHandler } from "./client";

export type PlanState = {
  locked: boolean;
  outlet: string;
  endsAt: string | null;
  paidUntil: string | null;
  inGrace: boolean;
  graceUsed: boolean;
  canExtend: boolean;
  offlineExtension?: boolean;
  message: string | null;
};

let current: PlanState | null = null;
const listeners = new Set<() => void>();

export function setPlan(plan: PlanState | null) {
  current = plan;
  for (const fn of listeners) fn();
}

export function usePlan(): PlanState | null {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => current,
    () => null,
  );
}

setPlanLockedHandler((plan) => setPlan(plan as PlanState));

export const planApi = {
  status: () => http.get<PlanState>("/plan/status"),
  check: () => http.post<PlanState>("/plan/check", {}),
  extend: () => http.post<PlanState>("/plan/extend", {}),
  pay: () => http.post<{ url: string; amount: number; invoice: string }>("/plan/pay", {}),
};

/** Ask the exe (only when signed in: the plan route needs the session). */
export async function refreshPlan(): Promise<void> {
  if (!getStoredToken()) return;
  try {
    setPlan(await planApi.status());
  } catch {
    // an exe without routes/plan.js (before 1.1.7) or unreachable: no lock
  }
}
