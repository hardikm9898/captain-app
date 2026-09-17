import { Loader2, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card/60 px-6 py-12 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-secondary text-muted-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="font-semibold">{title}</p>
        {body ? <p className="mt-1 text-sm text-muted-foreground">{body}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}…
    </div>
  );
}

export function ErrorState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-5 text-center">
      <p className="font-semibold text-destructive">{title}</p>
      {body ? <p className="mt-1 text-sm text-muted-foreground">{body}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
