import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "lime" | "yellow" | "purple" | "orange" | "neutral";
export type StaffDensity = "default" | "compact";

export const STAFF_DEFAULT_DENSITY: StaffDensity = "compact";

const toneStyles: Record<Tone, { text: string; border: string; bg: string; accent: string }> = {
  lime: { text: "text-[#D7FF4F]", border: "border-[#D7FF4F]/35", bg: "bg-[#D7FF4F]/10", accent: "bg-[#D7FF4F]" },
  yellow: { text: "text-[#F4E85B]", border: "border-[#F4E85B]/35", bg: "bg-[#F4E85B]/10", accent: "bg-[#F4E85B]" },
  purple: { text: "text-[#B7A8FF]", border: "border-[#8B73FF]/35", bg: "bg-[#8B73FF]/10", accent: "bg-[#8B73FF]" },
  orange: { text: "text-[#FFB07A]", border: "border-[#FF914D]/35", bg: "bg-[#FF914D]/10", accent: "bg-[#FF914D]" },
  neutral: { text: "text-[#F5F5F5]", border: "border-[#3A3A36]", bg: "bg-[#1E1F1C]", accent: "bg-[#A7A7A7]" },
};

export function staffButtonClass(variant: "primary" | "secondary" = "secondary", density: StaffDensity = STAFF_DEFAULT_DENSITY) {
  return cn(
    "inline-flex items-center justify-center rounded-full border text-center font-bold transition focus:outline-none focus:ring-2 focus:ring-[#D7FF4F]/30 disabled:cursor-not-allowed disabled:opacity-60",
    density === "compact" ? "h-8 px-3 text-sm" : "h-11 px-5 text-sm",
    variant === "primary"
      ? "border-[#D7FF4F] bg-[#D7FF4F] text-[#151515] hover:brightness-105"
      : "border-[#3A3A36] bg-[#252622] text-[#F5F5F5] hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F]"
  );
}

export function StaffButton({
  variant = "secondary",
  density = STAFF_DEFAULT_DENSITY,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary"; density?: StaffDensity }) {
  return <button className={cn(staffButtonClass(variant, density), className)} {...props} />;
}

export function StaffBadge({
  children,
  tone = "neutral",
  density = STAFF_DEFAULT_DENSITY,
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  density?: StaffDensity;
  className?: string;
}) {
  const styles = toneStyles[tone];
  return (
    <span className={cn("inline-flex items-center rounded-full border font-bold uppercase tracking-normal", density === "compact" ? "h-6 px-2.5 text-[12px]" : "h-7 px-3 text-[13px]", styles.border, styles.bg, styles.text, className)}>
      {children}
    </span>
  );
}

export function StaffStatCard({
  label,
  value,
  tone = "neutral",
  featured = false,
  density = STAFF_DEFAULT_DENSITY,
}: {
  label: string;
  value: number | string;
  tone?: Tone;
  featured?: boolean;
  density?: StaffDensity;
}) {
  const styles = toneStyles[tone];
  return (
    <article
      className={cn(
        "relative overflow-hidden border shadow-lg shadow-black/15",
        density === "compact" ? "rounded-[0.85rem] px-3 py-2" : "rounded-[1rem] px-3.5 py-3",
        featured ? "border-[#D7FF4F]/45 bg-[#D7FF4F] text-[#151515] lg:col-span-2" : "border-[#3A3A36] bg-[#252622] text-[#F5F5F5]"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className={cn("font-semibold uppercase tracking-normal", density === "compact" ? "text-[12px]" : "text-[13px]", featured ? "text-[#151515]/70" : "text-[#A7A7A7]")}>{label}</p>
          <p className={cn("font-semibold leading-none tabular-nums", density === "compact" ? "mt-0.5 text-xl" : "mt-1 text-2xl", featured ? "text-[#151515]" : styles.text)}>{value}</p>
        </div>
        <span className={cn("shrink-0 rounded-full", density === "compact" ? "h-2 w-2" : "h-2.5 w-2.5", featured ? "bg-[#151515]/50" : styles.accent)} />
      </div>
    </article>
  );
}

export function StaffPageHeader({
  eyebrow,
  title,
  description,
  actions,
  density = STAFF_DEFAULT_DENSITY,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  density?: StaffDensity;
}) {
  return (
    <section className={cn("border border-[#3A3A36] bg-[#1E1F1C] shadow-xl shadow-black/20", density === "compact" ? "rounded-[1rem] px-3 py-2.5" : "rounded-[1.25rem] px-4 py-3.5")}>
      <div className={cn("flex flex-col lg:flex-row lg:items-center lg:justify-between", density === "compact" ? "gap-2" : "gap-3")}>
        <div className="min-w-0">
          {eyebrow ? <div className={cn("flex flex-wrap items-center", density === "compact" ? "mb-1 gap-1.5" : "mb-2 gap-2")}>{eyebrow}</div> : null}
          <h2 className={cn("font-semibold leading-tight text-[#F5F5F5]", density === "compact" ? "text-lg" : "text-xl")}>{title}</h2>
          {description ? <p className={cn("text-[#A7A7A7]", density === "compact" ? "mt-0.5 text-sm leading-5" : "mt-1 text-sm leading-5")}>{description}</p> : null}
        </div>
        {actions ? <div className={cn("flex shrink-0 flex-wrap items-center", density === "compact" ? "gap-1.5" : "gap-2")}>{actions}</div> : null}
      </div>
    </section>
  );
}

export function StaffFilterPanel({ children, className = "", density = STAFF_DEFAULT_DENSITY }: { children: ReactNode; className?: string; density?: StaffDensity }) {
  return (
    <section className={cn("border border-[#3A3A36] bg-[#1E1F1C] shadow-xl shadow-black/15", density === "compact" ? "rounded-[1rem] p-2.5" : "rounded-[1.25rem] p-3.5", className)}>
      {children}
    </section>
  );
}

export function StaffDataTable({
  title,
  meta,
  badge,
  children,
  density = STAFF_DEFAULT_DENSITY,
}: {
  title: ReactNode;
  meta?: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
  density?: StaffDensity;
}) {
  return (
    <section className={cn("overflow-hidden border border-[#3A3A36] bg-[#252622] shadow-xl shadow-black/25", density === "compact" ? "rounded-[1rem]" : "rounded-[1.25rem]")}>
      <div className={cn("flex flex-col border-b border-[#3A3A36] bg-[#30312D] sm:flex-row sm:items-center sm:justify-between", density === "compact" ? "gap-1.5 px-3 py-2" : "gap-2 px-4 py-3")}>
        <div className="min-w-0">
          <h2 className={cn("font-semibold text-[#F5F5F5]", density === "compact" ? "text-base" : "text-base")}>{title}</h2>
          {meta ? <p className={cn("text-[#A7A7A7]", density === "compact" ? "mt-0 text-[13px]" : "mt-0.5 text-sm")}>{meta}</p> : null}
        </div>
        {badge}
      </div>
      {children}
    </section>
  );
}

export function StaffModal({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <article className={cn("max-h-[92vh] w-full max-w-[1800px] overflow-hidden rounded-[1.5rem] border border-[#3A3A36] bg-[#1E1F1C] shadow-2xl shadow-black/50", className)}>
      {children}
    </article>
  );
}
