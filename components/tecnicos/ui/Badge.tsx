import type { ComponentPropsWithoutRef } from "react";
import { cn } from "./utils";

type BadgeTone = "neutral" | "lime" | "success" | "warning" | "danger" | "info";

type BadgeProps = ComponentPropsWithoutRef<"span"> & {
  tone?: BadgeTone;
};

const toneClasses: Record<BadgeTone, string> = {
  neutral:
    "border-[var(--sg-border)] bg-[var(--sg-card-elevated)] text-[var(--sg-text-secondary)]",
  lime: "border-[var(--sg-lime)] bg-[var(--sg-lime-soft)] text-[var(--sg-lime)]",
  success: "border-[var(--sg-success)] bg-[var(--sg-success-soft)] text-[var(--sg-success)]",
  warning: "border-[var(--sg-warning)] bg-[var(--sg-warning-soft)] text-[var(--sg-warning)]",
  danger: "border-[var(--sg-danger)] bg-[var(--sg-danger-soft)] text-[var(--sg-danger)]",
  info: "border-[var(--sg-info)] bg-[var(--sg-info-soft)] text-[var(--sg-info)]",
};

export function Badge({ tone = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold leading-none",
        toneClasses[tone],
        className
      )}
      {...props}
    />
  );
}

export function StatusBadge(props: BadgeProps) {
  return <Badge tone="lime" {...props} />;
}

