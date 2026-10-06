"use client";

// Recepción → "Por llegar" (auditoría Shipping V2, punto 2). En un solo lugar:
//   · las cajas que vienen en camino: "Llegó la caja" y luego sus artículos
//     aparecen abajo para confirmarlos uno por uno, como siempre;
//   · los artículos que viajan solos: "Llegó" los marca recibidos directo.
// Antes una caja solo se podía dar por llegada desde su propia pantalla, y lo
// que llegaba directo de un proveedor local nunca aparecía (LAP-000110).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ShippingV2Item, ShippingV2Packing } from "@/types/shipping-v2";
import { ORIGEN_EXTRANJERO } from "@/lib/shipping-v2/item-origen";

type Props = {
  cajas: ShippingV2Packing[];
  sueltos: ShippingV2Item[];
  puedeRecibirCajas: boolean;
};

function rastreos(item: ShippingV2Item) {
  return [item.trackingHaciaIntermediario, item.trackingDesdeIntermediario, item.trackingDirecto].filter((t) => String(t ?? "").trim());
}

export function ShippingV2PorLlegar({ cajas, sueltos, puedeRecibirCajas }: Props) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [abierto, setAbierto] = useState(true);
  const total = cajas.length + sueltos.length;

  async function llegoCaja(caja: ShippingV2Packing) {
    setOcupado(caja.id);
    setMensaje("");
    try {
      const r = await fetch(`/api/shipping-v2/packings/${caja.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark-received" }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.success) throw new Error(String(j.error || "No se pudo marcar la caja como llegada."));
      setMensaje(`Caja ${caja.packingId} recibida. Sus artículos aparecen abajo para confirmarlos uno por uno.`);
      router.refresh();
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : "Error inesperado.");
    } finally {
      setOcupado("");
    }
  }

  async function llegoArticulo(item: ShippingV2Item) {
    setOcupado(item.id);
    setMensaje("");
    try {
      const r = await fetch(`/api/shipping-v2/recepcion/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "received", value: true }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.success) throw new Error(String(j.error || "No se pudo marcar como llegado."));
      setMensaje(`${item.sku} recibido.`);
      router.refresh();
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : "Error inesperado.");
    } finally {
      setOcupado("");
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-[#30312D] bg-[#171814] shadow-2xl shadow-black/25">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center justify-between gap-3 border-b border-[#30312D] px-3 py-2.5 text-left"
      >
        <span>
          <span className="block text-base font-semibold text-[#F5F5F5]">Por llegar</span>
          <span className="block text-[13px] text-[#A7A7A7]">
            {total ? `${cajas.length} caja${cajas.length === 1 ? "" : "s"} en tránsito y ${sueltos.length} artículo${sueltos.length === 1 ? "" : "s"} suelto${sueltos.length === 1 ? "" : "s"}.` : "No hay nada en camino."}
          </span>
        </span>
        <span className="text-[13px] font-semibold text-[#D7FF4F]">{abierto ? "Ocultar" : "Mostrar"}</span>
      </button>
      {abierto && total ? (
        <div className="divide-y divide-[#30312D]">
          {mensaje ? <p className="px-3 py-2 text-[13px] text-[#F4C95B]">{mensaje}</p> : null}
          {cajas.map((caja) => (
            <div key={caja.id} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#F5F5F5]">
                  <span className="mr-2 rounded-full border border-[#8B73FF]/35 bg-[#8B73FF]/10 px-2 py-0.5 text-[11px] font-bold text-[#C9BFFF]">Caja</span>
                  <Link href={`/shipping-v2/packings/${caja.id}`} className="text-[#D7FF4F] hover:underline">{caja.packingId}</Link>
                  {caja.nombre ? <span className="ml-2 text-[#A7A7A7]">{caja.nombre}</span> : null}
                </p>
                <p className="mt-0.5 text-[12px] text-[#8F908A]">
                  {caja.itemCount} artículo{caja.itemCount === 1 ? "" : "s"}
                  {caja.trackingEc ? ` · Rastreo Ecuador: ${caja.trackingEc}` : caja.trackingUsa ? ` · Rastreo: ${caja.trackingUsa}` : " · Sin rastreo"}
                  {caja.proveedorResponsableNombre ? ` · ${caja.proveedorResponsableNombre}` : ""}
                </p>
              </div>
              {puedeRecibirCajas ? (
                <button
                  type="button"
                  disabled={ocupado === caja.id}
                  onClick={() => llegoCaja(caja)}
                  className="rounded-lg border border-[#D7FF4F] bg-[#D7FF4F] px-3 py-1.5 text-[12px] font-black text-[#151515] disabled:opacity-60"
                >
                  {ocupado === caja.id ? "Guardando..." : "Llegó la caja"}
                </button>
              ) : null}
            </div>
          ))}
          {sueltos.map((item) => {
            const nums = rastreos(item);
            return (
              <div key={item.id} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#F5F5F5]">
                    <span className="mr-2 rounded-full border border-[#4FC3FF]/35 bg-[#4FC3FF]/10 px-2 py-0.5 text-[11px] font-bold text-[#BDEAFF]">
                      {item.origenArticulo === ORIGEN_EXTRANJERO ? "Extranjero" : "Local"}
                    </span>
                    <Link href={`/shipping-v2/items/${item.id}`} className="text-[#D7FF4F] hover:underline">{item.sku}</Link>
                    <span className="ml-2 text-[#A7A7A7]">{item.nombre}</span>
                  </p>
                  <p className="mt-0.5 text-[12px] text-[#8F908A]">
                    {item.proveedorNombre || "Sin proveedor"} · {item.estado || "—"} · {nums.length ? `Rastreo: ${nums.join(" / ")}` : "Sin rastreo"}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={ocupado === item.id}
                  onClick={() => llegoArticulo(item)}
                  className="rounded-lg border border-[#D7FF4F] bg-[#D7FF4F] px-3 py-1.5 text-[12px] font-black text-[#151515] disabled:opacity-60"
                >
                  {ocupado === item.id ? "Guardando..." : "Llegó"}
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
