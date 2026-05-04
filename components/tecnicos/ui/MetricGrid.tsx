import type { ReactNode } from "react";
import { cn } from "./utils";

type MetricTone = "neutral" | "muted" | "lime" | "warning" | "success" | "danger";

export type MetricGridItem = {
  label: ReactNode;
  value: ReactNode;
  tone?: MetricTone;
};

type MetricGridProps = {
  items: MetricGridItem[];
  columns?: 2 | 3;
  className?: string;
};

const toneClasses: Record<MetricTone, string> = {
  neutral: "text-[var(--sg-text-primary)]",
  muted: "text-[var(--sg-text-muted)]",
  lime: "text-[var(--sg-lime)]",
  warning: "text-[var(--sg-warning)]",
  success: "text-[var(--sg-success)]",
  danger: "text-[var(--sg-danger)]",
};

export function MetricGrid({ items, columns = 3, className }: MetricGridProps) {
  const emptySlots = (columns - (items.length % columns)) % columns;

  return (
    <div
      className={cn(
        "grid gap-px overflow-hidden rounded-[var(--sg-radius-md)] border border-[var(--sg-border)] bg-[var(--sg-divider)]",
        columns === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3",
        className
      )}
    >
      {items.map((item, index) => (
        <div
          key={index}
          className="bg-[var(--sg-card)] px-4 py-4"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sg-text-secondary)]">
            {item.label}
          </p>
          <p
            className={cn(
              "mt-2 text-2xl font-extrabold leading-none",
              toneClasses[item.tone ?? "neutral"]
            )}
          >
            {item.value}
          </p>
        </div>
      ))}
      {Array.from({ length: emptySlots }).map((_, index) => (
        <div
          key={`empty-${index}`}
          className="hidden bg-[var(--sg-card)] sm:block"
          aria-hidden="true"
        />
      ))}
    </div>
  );
}
