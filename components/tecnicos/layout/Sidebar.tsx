import Link from "next/link";
import { useMemo } from "react";

type SidebarProps = {
  active?: "ordenes" | "clientes" | "tecnicos" | "configuracion";
};

const navItems: { key: SidebarProps["active"]; label: string; href?: string }[] = [
  { key: "configuracion", label: "Dashboard", href: "/dashboard" },
  { key: "ordenes", label: "Ordenes", href: "/tecnicos/ordenes" },
  { key: "clientes", label: "Clientes", href: "/tecnicos/clientes" },
  { key: "tecnicos", label: "Tecnicos" },
];

export function Sidebar({ active }: SidebarProps) {
  const current = useMemo(() => active ?? null, [active]);

  return (
    <aside className="sticky top-0 z-30 w-full border-b border-zinc-900/70 bg-[#0f0f0f] shadow-[0_8px_28px_rgba(0,0,0,0.35)] lg:fixed lg:inset-y-0 lg:left-0 lg:w-[264px] lg:border-b-0 lg:border-r lg:shadow-[8px_0_32px_rgba(0,0,0,0.55)]">
      <div className="flex h-20 items-center border-b border-zinc-900/70 bg-gradient-to-r from-[#1d1c1c] via-[#141414] to-[#0e0e0e] px-4 sm:px-7 lg:h-24">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-content-center rounded-xl bg-[#e3fc02] text-xl font-black tracking-tight text-black shadow-[0_10px_25px_rgba(227,252,2,0.35)]">
            SG
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-lg font-semibold tracking-tight text-white">SUPER GEEK</span>
            <span className="text-xs text-zinc-400">App de Tecnicos</span>
          </div>
        </div>
      </div>
      <nav className="flex gap-2 overflow-x-auto px-4 py-3 text-sm lg:block lg:space-y-1.5 lg:overflow-visible lg:py-6">
        {navItems.map((item) => {
          const isActive = current === item.key;
          const className =
            "flex min-w-max items-center gap-3 rounded-lg border px-3.5 py-3 font-medium transition lg:w-full " +
            (isActive
              ? "border-[#e3fc02]/80 bg-[#e3fc02]/15 text-white shadow-inner shadow-[#e3fc02]/15"
              : "border-transparent text-zinc-300 hover:border-zinc-800 hover:bg-zinc-900/60 hover:text-white");

          const content = (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-[#e3fc02] opacity-80" />
              <span className="flex-1">{item.label}</span>
              {!item.href && (
                <span className="text-[10px] uppercase tracking-wide text-zinc-500">Prox.</span>
              )}
            </>
          );

          return item.href ? (
            <Link key={item.key} href={item.href} className={className}>
              {content}
            </Link>
          ) : (
            <button key={item.key} type="button" className={className} disabled>
              {content}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
