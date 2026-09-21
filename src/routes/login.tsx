import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Delete, KeyRound, Lock, Server, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { lastCaptainId, useCaptain } from "@/lib/captain/store";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ConnectionStrip } from "@/components/captain/ConnectionStrip";
import { describeError } from "@/lib/exe/client";
import { getBaseUrl, setManualServerAddress } from "@/lib/exe/discovery";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Captain Login — BillerPe Captain" },
      {
        name: "description",
        content: "Sign in to BillerPe Captain with a password or a quick PIN on a shared handset.",
      },
    ],
  }),
  component: LoginScreen,
});

type Mode = "pin" | "password";

function LoginScreen() {
  const { captains, captain, login, outlet, connection, recheckConnection } = useCaptain();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>(captains.length ? "pin" : "password");
  const [selectedId, setSelectedId] = useState<string | null>(captains[0]?.id ?? null);
  const [pinMobile, setPinMobile] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [pwMobile, setPwMobile] = useState("");
  const [password, setPassword] = useState("");
  const [serverOpen, setServerOpen] = useState(false);
  const [serverAddress, setServerAddress] = useState("");
  type Field = "server" | "mobile" | "password";
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const clearError = (key: Field) =>
    setErrors((e) => {
      if (!(key in e)) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
  // Shows every problem under its field and focuses the first one.
  const showProblems = (found: Partial<Record<Field, string>>) => {
    setErrors(found);
    const first = Object.keys(found)[0];
    if (!first) return true;
    toast.error("Please complete the highlighted fields", {
      description: Object.values(found).join(" · "),
    });
    requestAnimationFrame(() => document.getElementById(first)?.focus());
    return false;
  };

  // Pre-select the captain who last used this handset - only when the staff
  // list itself changes, never in response to the captain tapping a chip.
  useEffect(() => {
    const last = lastCaptainId();
    setSelectedId((current) => {
      if (current && captains.some((c) => c.id === current)) return current;
      if (last && captains.some((c) => c.id === last)) return last;
      return captains[0]?.id ?? null;
    });
  }, [captains]);

  useEffect(() => {
    if (captain) navigate({ to: "/", replace: true });
  }, [captain, navigate]);

  const selected = captains.find((c) => c.id === selectedId);
  const mobileForPin = selected?.mobile ?? pinMobile.trim();

  const finish = async (input: Parameters<typeof login>[0]) => {
    setBusy(true);
    try {
      const who = await login(input);
      toast.success(`Welcome, ${who.name}`);
      navigate({ to: "/", replace: true });
    } catch (err) {
      toast.error(describeError(err, "Could not sign in"));
      setPin("");
    } finally {
      setBusy(false);
    }
  };

  const press = (digit: string) => {
    if (busy) return;
    const next = (pin + digit).slice(0, 6);
    setPin(next);
    if (next.length === 4) {
      if (!mobileForPin) {
        toast.error("Pick who's on shift (or enter a mobile number) first");
        setPin("");
        return;
      }
      void finish({ mode: "pin", mobile: mobileForPin, pin: next });
    }
  };

  const serverDown = connection === "local-server-down";
  const host = getBaseUrl().replace(/^https?:\/\//, "");

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <ConnectionStrip />
      <div className="flex flex-1 flex-col px-5 pt-8 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand text-lg font-bold text-brand-foreground">
            Bp
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold">BillerPe Captain</h1>
            <p className="truncate text-xs text-muted-foreground">Table-side ordering</p>
          </div>
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-border bg-card p-3">
          <Store className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          <div className="min-w-0 flex-1 text-xs">
            <p className="truncate font-semibold">{outlet.name}</p>
            <p className="truncate text-muted-foreground">
              {outlet.outlet} · {outlet.deviceName}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setServerOpen((o) => !o)}
            className="flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2 py-1 text-[10px] font-medium text-muted-foreground"
          >
            <Server className="h-3 w-3" /> {host}
          </button>
        </div>

        {serverOpen || serverDown ? (
          <div className="mt-3 space-y-2 rounded-2xl border border-dashed border-border bg-card p-3">
            <Label htmlFor="server" className="text-xs" required>
              Local server address {serverDown ? "· not reachable" : ""}
            </Label>
            <p className="text-[11px] text-muted-foreground">
              Shown on the server PC's BillerPe dashboard under “Network”, e.g. 192.168.1.12:4100.
            </p>
            <div className="flex gap-2">
              <Input
                id="server"
                className="h-11"
                value={serverAddress}
                aria-invalid={!!errors.server || undefined}
                onChange={(e) => {
                  setServerAddress(e.target.value);
                  clearError("server");
                }}
                placeholder="192.168.1.12:4100"
                inputMode="url"
              />
              <Button
                className="h-11"
                disabled={busy}
                onClick={async () => {
                  if (
                    !showProblems(
                      serverAddress.trim() ? {} : { server: "Enter the server address" },
                    )
                  )
                    return;
                  setBusy(true);
                  const ok = await setManualServerAddress(serverAddress);
                  setBusy(false);
                  if (ok) {
                    toast.success("Connected to the local server");
                    setServerOpen(false);
                    void recheckConnection();
                  } else toast.error("Could not reach that address");
                }}
              >
                Connect
              </Button>
            </div>
            {errors.server ? <p className="text-xs text-destructive">{errors.server}</p> : null}
          </div>
        ) : null}

        <div className="mt-5 grid grid-cols-2 gap-1 rounded-full bg-secondary p-1">
          {(
            [
              ["pin", "PIN", KeyRound],
              ["password", "Password", Lock],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-full py-2.5 text-sm font-semibold transition",
                mode === value ? "bg-card text-brand shadow-sm" : "text-muted-foreground",
              )}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {mode === "pin" ? (
          <div className="mt-5 flex flex-1 flex-col">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Who's on shift?
            </p>
            {captains.length ? (
              <div className="no-scrollbar -mx-5 mt-2 flex gap-2 overflow-x-auto px-5">
                {captains.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(c.id);
                      setPin("");
                    }}
                    className={cn(
                      "shrink-0 rounded-2xl border px-3 py-2 text-left",
                      selectedId === c.id ? "border-brand bg-brand-soft" : "border-border bg-card",
                    )}
                  >
                    <p className="text-sm font-semibold">{c.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {c.role}
                      {lastCaptainId() === c.id ? " · last used" : ""}
                    </p>
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-2 space-y-1.5">
                <Input
                  id="pin-mobile"
                  className="h-12"
                  inputMode="tel"
                  maxLength={10}
                  value={pinMobile}
                  onChange={(e) => setPinMobile(e.target.value.replace(/\D/g, ""))}
                  placeholder="Your registered mobile number"
                />
                <p className="text-[11px] text-muted-foreground">
                  Staff names appear here after the first sign-in on this handset.
                </p>
              </div>
            )}

            <div className="mt-6 flex justify-center gap-3">
              {[0, 1, 2, 3].map((i) => (
                <motion.span
                  key={i}
                  animate={{ scale: pin.length === i + 1 ? [1, 1.25, 1] : 1 }}
                  className={cn(
                    "h-3.5 w-3.5 rounded-full",
                    i < pin.length ? "bg-brand" : "bg-border",
                  )}
                />
              ))}
            </div>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              {busy
                ? "Checking PIN…"
                : selected
                  ? `Enter the 4-digit PIN for ${selected.name}`
                  : "Enter your 4-digit quick login PIN"}
            </p>

            <div className="mx-auto mt-6 grid w-full max-w-xs grid-cols-3 gap-3">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <PadKey key={d} onClick={() => press(d)}>
                  {d}
                </PadKey>
              ))}
              <PadKey onClick={() => setPin("")} muted>
                Clear
              </PadKey>
              <PadKey onClick={() => press("0")}>0</PadKey>
              <PadKey onClick={() => setPin(pin.slice(0, -1))} muted>
                <Delete className="h-5 w-5" />
              </PadKey>
            </div>
          </div>
        ) : null}

        {mode === "password" ? (
          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const found: Partial<Record<Field, string>> = {};
              if (!/^\d{10}$/.test(pwMobile.trim()))
                found.mobile = "Enter your 10-digit mobile number";
              if (!password) found.password = "Password is required";
              if (!showProblems(found)) return;
              void finish({ mode: "password", mobile: pwMobile.trim(), password });
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="mobile" required>
                Mobile number
              </Label>
              <Input
                id="mobile"
                className="h-12"
                inputMode="tel"
                maxLength={10}
                value={pwMobile}
                aria-invalid={!!errors.mobile || undefined}
                onChange={(e) => {
                  setPwMobile(e.target.value.replace(/\D/g, ""));
                  clearError("mobile");
                }}
                placeholder="10-digit mobile number"
                autoComplete="username"
              />
              {errors.mobile ? <p className="text-xs text-destructive">{errors.mobile}</p> : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" required>
                Password
              </Label>
              <Input
                id="password"
                type="password"
                className="h-12"
                value={password}
                aria-invalid={!!errors.password || undefined}
                onChange={(e) => {
                  setPassword(e.target.value);
                  clearError("password");
                }}
                autoComplete="current-password"
              />
              {errors.password ? (
                <p className="text-xs text-destructive">{errors.password}</p>
              ) : null}
            </div>
            <Button type="submit" className="h-13 w-full text-base" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </Button>
            <button
              type="button"
              className="w-full text-center text-sm font-medium text-brand"
              onClick={() =>
                toast.info("Ask the outlet owner to reset your password from the BillerPe Web POS")
              }
            >
              Forgot password?
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}

function PadKey({
  children,
  onClick,
  muted,
}: {
  children: React.ReactNode;
  onClick: () => void;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "grid h-16 place-items-center rounded-2xl border border-border text-xl font-semibold transition active:scale-95",
        muted ? "bg-secondary text-sm text-muted-foreground" : "bg-card",
      )}
    >
      {children}
    </button>
  );
}
