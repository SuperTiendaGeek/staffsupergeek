import Link from "next/link";

// Pestañas de Administrar (10E-C, 18-nov-2026): Proveedores · Pantalla del
// cliente · (luego) Pagos en línea.
const TABS = [
  { href: "/admin/proveedores", label: "Proveedores" },
  { href: "/admin/pantalla-cliente", label: "Pantalla del cliente" },
] as const;

export function AdminTabs({ activa }: { activa: (typeof TABS)[number]["href"] }) {
  return (
    <nav aria-label="Secciones de Administrar" className="flex gap-1 border-b border-[#2C2D29]">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.href === activa ? "page" : undefined}
          className={`-mb-px h-8 border-b-2 px-3 text-[13px] font-semibold leading-8 transition-colors ${t.href === activa ? "border-[#D7FF4F] text-[#F0F0EC]" : "border-transparent text-[#B5B5AE] hover:text-[#F0F0EC]"}`}>
          {t.label}
        </Link>
      ))}
      <span className="h-8 px-3 text-[13px] font-semibold leading-8 text-[#6E6E68]" title="Llega después">Pagos en línea · pronto</span>
    </nav>
  );
}
