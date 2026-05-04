import type { ComponentPropsWithoutRef } from "react";
import { cn } from "./utils";

type CardVariant = "base" | "compact" | "side";

type CardProps = ComponentPropsWithoutRef<"section"> & {
  variant?: CardVariant;
};

const variantClasses: Record<CardVariant, string> = {
  base: "sg-card p-5 sm:p-6",
  compact:
    "rounded-[var(--sg-radius-md)] border border-[var(--sg-border)] bg-[var(--sg-card)] p-4 shadow-[var(--sg-shadow-card)]",
  side: "sg-card min-h-full p-5 sm:p-6",
};

export function Card({ variant = "base", className, ...props }: CardProps) {
  return <section className={cn(variantClasses[variant], className)} {...props} />;
}

export function CompactCard(props: Omit<CardProps, "variant">) {
  return <Card variant="compact" {...props} />;
}

export function SidePanel(props: Omit<CardProps, "variant">) {
  return <Card variant="side" {...props} />;
}

