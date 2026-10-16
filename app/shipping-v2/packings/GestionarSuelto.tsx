"use client";

// Logística → un artículo que viaja SOLO (sin caja). Auditoría Shipping V2,
// punto 2, y fase 2 del punto 9 (15-oct-2026): se abre desde su fila en la
// lista única de Logística. Aquí se anotan rastreos con su transportista,
// casillero y origen, o se mete el artículo en una caja abierta; abajo, sus
// "Costos Logísticos" (flete, arancel, otros), que nacen del pago (9c).

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ShippingV2Item, ShippingV2Proveedor } from "@/types/shipping-v2";
import { CostosTraerlo } from "@/components/shipping-v2/CostosTraerlo";
import { getShippingV2ProveedorLabel } from "@/lib/shipping-v2/provider-labels";
import { esProveedorLogistico } from "@/lib/shipping-v2/provider-types";
import { buildTrackingUrl } from "@/lib/shipping-v2/tracking";
import { ORIGEN_EXTRANJERO, ORIGEN_LOCAL, origenSegunZona } from "@/lib/shipping-v2/item-origen";

export type CajaAbiertaLogistica = {
  id: string;
  codigo: string;
  nombre: string;
  proveedorResponsableId?: string;
  proveedorLogisticoEcId?: string;
};

const inputClass = "h-8 w-full rounded-md border border-[#3A3A36] bg-[#151515] px-2 text-[13px] text-[#F5F5F5] outline-none placeholder:text-[#696A64] focus:border-[#D7FF4F]/70";
const etiqueta = "mb-0.5 block text-[10.5px] font-semibold uppercase tracking-wide text-[#8F908A]";

function texto(v?: string | null) {
  return String(v ?? "").trim();
}

/** Número de rastreo con su enlace (si el transportista tiene plantilla) y el nombre del transportista. */
/**
 * Un número de rastreo con su enlace. `compacto` (lista de Logística): una sola
 * línea cortada con …; el transportista y el número completo van en la ayuda.
 */
export function Rastreo({ numero, transportista, prefijo, nombre, compacto = false, extra }: { numero?: string; transportista?: ShippingV2Proveedor; prefijo?: string; nombre?: string; compacto?: boolean; extra?: string }) {
  if (!texto(numero)) return null;
  const url = buildTrackingUrl(transportista, numero);
  const quien = transportista ? getShippingV2ProveedorLabel(transportista) : nombre;
  if (compacto) {
    const ayuda = [`${prefijo ? `${prefijo} ` : ""}${numero}${quien ? ` · ${quien}` : ""}`, extra].filter(Boolean).join("\n");
    return (
      <span className="flex min-w-0 items-baseline gap-1 whitespace-nowrap leading-4" title={ayuda}>
        {prefijo ? <span className="shrink-0 text-[10px] font-semibold text-[#8F908A]">{prefijo}</span> : null}
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" className="min-w-0 truncate font-semibold text-[#D7FF4F] hover:underline">{numero}</a>
        ) : (
          <span className="min-w-0 truncate text-[#E6E6E1]">{numero}</span>
        )}
        {extra ? <span className="shrink-0 text-[10.5px] font-semibold text-[#8F908A]">+1</span> : null}
      </span>
    );
  }
  return (
    <span className="block min-w-0 whitespace-nowrap leading-4">
      {prefijo ? <span className="mr-1 text-[10.5px] font-semibold text-[#8F908A]">{prefijo}</span> : null}
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="font-semibold text-[#D7FF4F] hover:underline">{numero}</a>
      ) : (
        <span className="text-[#E6E6E1]">{numero}</span>
      )}
      {quien ? <span className="ml-1 text-[11px] text-[#8F908A]">{quien}</span> : null}
    </span>
  );
}

export function GestionarSuelto({ item, proveedores, cajasAbiertas, canEdit, canAddToPacking, canViewCosts, onCerrar }: {
  item: ShippingV2Item;
  proveedores: ShippingV2Proveedor[];
  cajasAbiertas: CajaAbiertaLogistica[];
  canEdit: boolean;
  canAddToPacking: boolean;
  canViewCosts: boolean;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [f, setF] = useState({
    origenArticulo: item.origenArticulo || "",
    proveedorLogisticoId: item.proveedorLogisticoId || "",
    trackingHaciaIntermediario: item.trackingHaciaIntermediario || "",
    transportistaOrigenId: item.transportistaOrigenId || "",
    trackingDesdeIntermediario: item.trackingDesdeIntermediario || "",
    transportistaEcuadorId: item.transportistaEcuadorId || "",
    trackingDirecto: item.trackingDirecto || "",
    cajaId: "",
  });

  const activos = proveedores.filter((p) => (p.estado || "").toLowerCase() === "activo");
  const casilleros = activos.filter((p) => p.esCasillero === true);
  const logisticos = activos.filter((p) => esProveedorLogistico(p));
  const transportistasOrigen = logisticos.filter((p) => p.esCasillero !== true && origenSegunZona(p.paisZonaLogistica) === ORIGEN_EXTRANJERO);
  const transportistasEcuador = logisticos.filter((p) => p.esCasillero === true || origenSegunZona(p.paisZonaLogistica) === ORIGEN_LOCAL);
  const fExtranjero = f.origenArticulo === ORIGEN_EXTRANJERO;
  const cajas = cajasAbiertas.filter((caja) => {
    const ids = new Set([caja.proveedorResponsableId, caja.proveedorLogisticoEcId].filter(Boolean));
    if (!ids.size) return true;
    return (item.proveedorId && ids.has(item.proveedorId)) || (f.proveedorLogisticoId && ids.has(f.proveedorLogisticoId));
  });

  async function guardar() {
    setGuardando(true);
    setMensaje("");
    const body: Record<string, unknown> = {};
    if (f.origenArticulo !== (item.origenArticulo || "")) body.origenArticulo = f.origenArticulo;
    const cambio = (key: keyof typeof f, actual: string) => { if (f[key] !== actual) body[key] = f[key]; };
    if (fExtranjero) {
      cambio("proveedorLogisticoId", item.proveedorLogisticoId || "");
      cambio("trackingHaciaIntermediario", item.trackingHaciaIntermediario || "");
      cambio("transportistaOrigenId", item.transportistaOrigenId || "");
      cambio("trackingDesdeIntermediario", item.trackingDesdeIntermediario || "");
    } else {
      cambio("trackingDirecto", item.trackingDirecto || "");
    }
    cambio("transportistaEcuadorId", item.transportistaEcuadorId || "");
    try {
      if (Object.keys(body).length) {
        const r = await fetch(`/api/shipping-v2/items/${item.id}/llegada`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.success) throw new Error(String(j.error || "No se pudo guardar."));
      }
      if (f.cajaId) {
        const r = await fetch(`/api/shipping-v2/packings/${f.cajaId}/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemIds: [item.id] }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.success) throw new Error(String(j.error || "Se guardó lo demás, pero no se pudo meter en la caja."));
      }
      onCerrar();
      router.refresh();
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : "Error inesperado.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-2">
      {canEdit || canAddToPacking ? (
        <div className="rounded-md border border-[#2A2B26] bg-[#151612] p-2">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-12">
            {canEdit ? (
              <>
                <label className="xl:col-span-2">
                  <span className={etiqueta}>Origen</span>
                  <select value={f.origenArticulo} onChange={(e) => setF({ ...f, origenArticulo: e.target.value })} className={inputClass}>
                    <option value={ORIGEN_EXTRANJERO}>Proveedor extranjero</option>
                    <option value={ORIGEN_LOCAL}>Proveedor local</option>
                  </select>
                </label>
                {fExtranjero ? (
                  <>
                    <label className="xl:col-span-2">
                      <span className={etiqueta}>Casillero</span>
                      <select value={f.proveedorLogisticoId} onChange={(e) => setF({ ...f, proveedorLogisticoId: e.target.value })} className={inputClass}>
                        <option value="">Sin casillero</option>
                        {casilleros.map((p) => <option key={p.id} value={p.id}>{getShippingV2ProveedorLabel(p)}</option>)}
                      </select>
                    </label>
                    <label className="xl:col-span-2">
                      <span className={etiqueta}>Rastreo → casillero</span>
                      <input value={f.trackingHaciaIntermediario} onChange={(e) => setF({ ...f, trackingHaciaIntermediario: e.target.value })} className={inputClass} />
                    </label>
                    <label className="xl:col-span-2">
                      <span className={etiqueta}>Transportista → casillero</span>
                      <select value={f.transportistaOrigenId} onChange={(e) => setF({ ...f, transportistaOrigenId: e.target.value })} className={inputClass}>
                        <option value="">—</option>
                        {(transportistasOrigen.length ? transportistasOrigen : logisticos).map((p) => <option key={p.id} value={p.id}>{getShippingV2ProveedorLabel(p)}</option>)}
                      </select>
                    </label>
                    <label className="xl:col-span-2">
                      <span className={etiqueta}>Rastreo → Ecuador</span>
                      <input value={f.trackingDesdeIntermediario} onChange={(e) => setF({ ...f, trackingDesdeIntermediario: e.target.value })} className={inputClass} />
                    </label>
                  </>
                ) : (
                  <label className="xl:col-span-4">
                    <span className={etiqueta}>Rastreo</span>
                    <input value={f.trackingDirecto} onChange={(e) => setF({ ...f, trackingDirecto: e.target.value })} className={inputClass} />
                  </label>
                )}
                <label className="xl:col-span-2">
                  <span className={etiqueta}>{fExtranjero ? "Transportista Ecuador" : "Transportista"}</span>
                  <select value={f.transportistaEcuadorId} onChange={(e) => setF({ ...f, transportistaEcuadorId: e.target.value })} className={inputClass}>
                    <option value="">—</option>
                    {(transportistasEcuador.length ? transportistasEcuador : logisticos).map((p) => <option key={p.id} value={p.id}>{getShippingV2ProveedorLabel(p)}</option>)}
                  </select>
                </label>
              </>
            ) : null}
            {canAddToPacking ? (
              <label className="xl:col-span-4">
                <span className={etiqueta}>Meter en una caja abierta</span>
                <select value={f.cajaId} onChange={(e) => setF({ ...f, cajaId: e.target.value })} className={inputClass}>
                  <option value="">{cajas.length ? "No, sigue viajando solo" : "No hay cajas abiertas de este proveedor o casillero"}</option>
                  {cajas.map((c) => <option key={c.id} value={c.id}>{c.codigo}{c.nombre ? ` · ${c.nombre}` : ""}</option>)}
                </select>
              </label>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-[#8F908A]" title="Si entra a una caja, desde ahí la caja gobierna sus rastreos y costos.">Con un rastreo pasa solo a “En tránsito”.</span>
            {mensaje ? <span className="text-[12px] text-[#FFB07A]">{mensaje}</span> : null}
            <div className="ml-auto flex gap-1.5">
              <button type="button" onClick={onCerrar} className="h-8 rounded-md border border-[#3A3A36] px-3 text-[12px] font-semibold text-[#B4B5AC] hover:text-[#F5F5F5]">Cancelar</button>
              <button type="button" disabled={guardando} onClick={guardar} className="h-8 rounded-md border border-[#D7FF4F] bg-[#D7FF4F] px-3 text-[12px] font-black text-[#151515] disabled:opacity-60">
                {guardando ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {canViewCosts ? <CostosTraerlo itemId={item.id} onPagado={() => router.refresh()} /> : null}
    </div>
  );
}
