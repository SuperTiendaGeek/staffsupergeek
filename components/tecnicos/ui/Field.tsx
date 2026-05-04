import type {
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cn } from "./utils";

type FieldShellProps = {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  labelProps?: LabelHTMLAttributes<HTMLLabelElement>;
  children: ReactNode;
};

const fieldClass =
  "sg-focus-ring w-full rounded-[var(--sg-radius-md)] border border-[var(--sg-border)] bg-[var(--sg-card)] px-3 py-2 text-sm text-[var(--sg-text-primary)] transition placeholder:text-[var(--sg-text-muted)] focus:border-[var(--sg-lime)] disabled:cursor-not-allowed disabled:opacity-60";

export function FieldShell({
  label,
  hint,
  error,
  className,
  labelProps,
  children,
}: FieldShellProps) {
  return (
    <label className={cn("block space-y-1.5", className)} {...labelProps}>
      {label ? (
        <span className="block text-sm font-semibold text-[var(--sg-text-secondary)]">
          {label}
        </span>
      ) : null}
      {children}
      {error ? (
        <span className="block text-xs text-[var(--sg-danger)]">{error}</span>
      ) : hint ? (
        <span className="block text-xs text-[var(--sg-text-muted)]">{hint}</span>
      ) : null}
    </label>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldClass, "h-10", className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(fieldClass, "h-10", className)} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldClass, "min-h-24 resize-none", className)} {...props} />;
}
