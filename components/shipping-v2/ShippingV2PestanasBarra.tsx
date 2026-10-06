"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { pendienteDePestana, pestanaDeRuta, type PestanaShipping, type ResumenPestanas } from "@/lib/shipping-v2/pestanas";

export function ShippingV2PestanasBarra({ pestanas, puedeRegistrar }: { pestanas: PestanaShipping[]; puedeRegistrar: boolean }) {
  const pathname = usePathname() ?? "";
  const activa = pathname.startsWith("/shipping-v2/items/nuevo") ? null : pestanaDeRuta(pathname);
  const [resumen, setResumen] = useState<ResumenPestanas | null>(null);

  useEffect(() => {
    let cancelado = false;
    fetch("/api/shipping-v2/pestanas", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!cancelado && j?.data) setResumen(j.data as ResumenPestanas); })
      .catch(() => { /* los conteos son una ayuda; sin ellos la barra sigue funcionando */ });
    return () => { cancelado = true; };
  }, [pathname]);

  return (
    <nav aria-label="Secciones de Shipping V2" className="rounded-xl border border-[#30312D] bg-[#11120F] p-1.5">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <div className="flex min-w-0 flex-1 flex-wrap gap-1">
          {pestanas.map((p) => {
            const esActiva = activa === p.key;
            const pendiente = pendienteDePestana(p.key, resumen);
            return (
              <Link
                key={p.key}
                href={p.href}
                aria-current={esActiva ? "page" : undefined}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${esActiva ? "bg-[#D7FF4F] text-[#151515]" : "text-[#D5D5D0] hover:bg-[#1E1F1C] hover:text-[#F5F5F5]"}`}
              >
                {p.label}
                {pendiente ? (
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${esActiva ? "bg-[#151515]/15 text-[#151515]" : "bg-[#F4C95B]/15 text-[#F4C95B]"}`}>
                    {pendiente}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
        {puedeRegistrar ? (
          <Link
            href="/shipping-v2/items/nuevo"
            aria-current={pathname.startsWith("/shipping-v2/items/nuevo") ? "page" : undefined}
            className="rounded-lg border border-[#D7FF4F] px-3 py-2 text-sm font-black text-[#D7FF4F] transition hover:bg-[#D7FF4F] hover:text-[#151515]"
          >
            + Registrar artículo
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
