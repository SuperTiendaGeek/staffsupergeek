import Link from "next/link";
import type { ReactNode } from "react";

type DataGridLinkCellProps = {
  href: string;
  title?: string;
  children: ReactNode;
  className?: string;
};

export const dataGridCellClass = "min-w-0 truncate whitespace-nowrap px-4 py-3";

export const dataGridBadgeClass =
  "inline-flex max-w-full items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold";

export function formatDataGridCode(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "-";
  return trimmed.split("-").at(-1) || trimmed;
}

export function DataGridLinkCell({ href, title, children, className = "" }: DataGridLinkCellProps) {
  return (
    <Link href={href} title={title} className={`${dataGridCellClass} block ${className}`}>
      {children}
    </Link>
  );
}
