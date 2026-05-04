import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "icon";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
};

const baseClass =
  "sg-focus-ring inline-flex shrink-0 items-center justify-center gap-2 border font-semibold transition disabled:pointer-events-none disabled:opacity-60";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border-[var(--sg-lime)] bg-[var(--sg-lime)] text-[var(--sg-text-on-accent)] shadow-[0_10px_22px_rgba(227,252,2,0.20)] hover:brightness-95",
  secondary:
    "border-[var(--sg-border)] bg-[var(--sg-card)] text-[var(--sg-text-primary)] hover:border-[var(--sg-lime)] hover:bg-[var(--sg-card-elevated)]",
  ghost:
    "border-transparent bg-transparent text-[var(--sg-text-secondary)] hover:border-[var(--sg-border)] hover:bg-[var(--sg-card)] hover:text-[var(--sg-text-primary)]",
  danger:
    "border-[var(--sg-danger)] bg-[var(--sg-danger-soft)] text-[var(--sg-danger)] hover:brightness-110",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 rounded-[var(--sg-radius-sm)] px-3 text-xs",
  md: "h-11 rounded-[var(--sg-radius-md)] px-5 text-sm",
  icon: "h-9 w-9 rounded-[var(--sg-radius-sm)] p-0",
};

export function Button({
  variant = "secondary",
  size = "md",
  leftIcon,
  rightIcon,
  children,
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(baseClass, variantClasses[variant], sizeClasses[size], className)}
      {...props}
    >
      {leftIcon}
      {children}
      {rightIcon}
    </button>
  );
}

export function IconButton({
  "aria-label": ariaLabel,
  children,
  ...props
}: Omit<ButtonProps, "size" | "leftIcon" | "rightIcon"> & { "aria-label": string }) {
  return (
    <Button size="icon" aria-label={ariaLabel} {...props}>
      {children}
    </Button>
  );
}
