import {
  Outlet,
  Link,
  createRootRoute,
  useRouter,
  useRouterState,
  useNavigate,
  HeadContent,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import { CaptainProvider, useCaptain } from "@/lib/captain/store";
import { Toaster } from "@/components/ui/sonner";
import { LoadingState } from "@/components/captain/States";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try again or head back to the tables.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { title: "BillerPe Captain — Table-side Ordering" },
      {
        name: "description",
        content:
          "BillerPe Captain is the phone-first table-side ordering companion for restaurant captains.",
      },
      { name: "theme-color", content: "#c0392b" },
    ],
  }),
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function AuthGate({ children }: { children: ReactNode }) {
  const { captain, restored } = useCaptain();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  useEffect(() => {
    if (!restored) return;
    if (!captain && pathname !== "/login") {
      navigate({ to: "/login", replace: true });
    }
    if (captain && pathname === "/login") {
      navigate({ to: "/", replace: true });
    }
  }, [restored, captain, pathname, navigate]);

  if (!restored) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <LoadingState label="Starting BillerPe Captain" />
      </div>
    );
  }
  if (!captain && pathname !== "/login") return null;

  return <>{children}</>;
}

function RootComponent() {
  return (
    <CaptainProvider>
      <HeadContent />
      <AuthGate>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
      </AuthGate>
      <Toaster position="top-center" />
    </CaptainProvider>
  );
}
