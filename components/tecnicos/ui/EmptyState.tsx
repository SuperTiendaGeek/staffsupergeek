import type { ReactNode } from "react";
import { cn } from "./utils";

type EmptyStateProps = {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--sg-radius-md)] border border-dashed border-[var(--sg-border)] bg-[var(--sg-card)] px-5 py-7 text-center",
        className
      )}
    >
      {icon ? (
        <div className="mx-auto mb-4 inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--sg-border)] bg-[var(--sg-panel)] text-[var(--sg-text-muted)]">
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-semibold leading-6 text-[var(--sg-text-primary)]">{title}</p>
      {description ? (
        <p className="mt-1 text-sm leading-6 text-[var(--sg-text-secondary)]">{description}</p>
      ) : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
