import Link from "next/link";

type SidebarProps = {
  active?: "ordenes" | "clientes" | "catalogo-repuestos" | "catalogo-servicios" | "configuracion";
};

const navItems: { key: SidebarProps["active"]; label: string; href?: string }[] = [
  { key: "configuracion", label: "Dashboard", href: "/dashboard" },
  { key: "ordenes", label: "Órdenes", href: "/tecnicos/ordenes" },
  { key: "clientes", label: "Clientes", href: "/tecnicos/clientes" },
  { key: "catalogo-repuestos", label: "Catálogo Repuestos", href: "/tecnicos/catalogo-repuestos" },
  { key: "catalogo-servicios", label: "Catálogo Servicios", href: "/tecnicos/catalogo-servicios" },
];

export function Sidebar({ active }: SidebarProps) {
  const current = active ?? null;

  return (
    <aside className="sticky top-0 z-30 w-full border-b border-zinc-900/70 bg-[#0f0f0f] shadow-[0_8px_28px_rgba(0,0,0,0.35)] lg:fixed lg:inset-y-0 lg:left-0 lg:w-[220px] lg:border-b-0 lg:border-r lg:shadow-[8px_0_32px_rgba(0,0,0,0.55)]">
      <div className="flex h-16 items-center border-b border-zinc-900/70 bg-gradient-to-r from-[#1b1a1a] via-[#141414] to-[#0e0e0e] px-4 lg:h-[68px] lg:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="grid h-10 w-10 shrink-0 place-content-center rounded-lg bg-[#e3fc02] text-lg font-black tracking-tight text-black shadow-[0_8px_20px_rgba(227,252,2,0.25)]">
            SG
          </div>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-base font-semibold tracking-tight text-white">SUPER GEEK</span>
            <span className="truncate text-[11px] text-zinc-400">App de Técnicos</span>
          </div>
        </div>
      </div>
      <nav className="flex gap-2 overflow-x-auto px-3 py-2.5 text-sm lg:block lg:space-y-1 lg:overflow-visible lg:px-2.5 lg:py-4 lg:text-[13px]">
        {navItems.map((item) => {
          const isActive = current === item.key;
          const className =
            "flex min-w-max items-center rounded-lg border border-l-2 px-3 py-2.5 font-medium transition lg:w-full lg:min-w-0 lg:px-2.5 " +
            (isActive
              ? "border-[#e3fc02]/50 border-l-[#e3fc02] bg-[#e3fc02]/12 text-white shadow-inner shadow-[#e3fc02]/10"
              : "border-transparent border-l-transparent text-zinc-300 hover:border-zinc-800 hover:border-l-zinc-700 hover:bg-zinc-900/60 hover:text-white");

          const content = (
            <>
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
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
