"use client";

// Pestaña Logística — artículos que viajan SOLOS (sin caja). Auditoría
// Shipping V2, punto 2: un solo lugar para lo logístico de todo. Desde cada
// fila se anotan rastreos con su transportista, casillero, costos, el origen,
// o se mete el artículo en una caja abierta. Lo que falta se ve de un vistazo.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ShippingV2Item, ShippingV2Proveedor } from "@/types/shipping-v2";
import { getShippingV2ProveedorLabel } from "@/lib/shipping-v2/provider-labels";
import { esProveedorLogistico } from "@/lib/shipping-v2/provider-types";
import { buildTrackingUrl } from "@/lib/shipping-v2/tracking";
import { ORIGEN_EXTRANJERO, ORIGEN_LOCAL, origenSegunZona, pendientesLogisticos } from "@/lib/shipping-v2/item-origen";

export type CajaAbiertaLogistica = {
  id: string;
  codigo: string;
  nombre: string;
  proveedorResponsableId?: string;
  proveedorLogisticoEcId?: string;
};

type Props = {
  items: ShippingV2Item[];
  proveedores: ShippingV2Proveedor[];
  cajasAbiertas: CajaAbiertaLogistica[];
  canEdit: boolean;
  canAddToPacking: boolean;
};

const inputClass = "h-8 w-full rounded-lg border border-[#3A3A36] bg-[#151515] px-2.5 text-[13px] text-[#F5F5F5] outline-none placeholder:text-[#696A64] focus:border-[#D7FF4F]/70";

function dinero(v: number | null | undefined) {
  return typeof v === "number" ? `$${v.toFixed(2)}` : "—";
}

function texto(v?: string | null) {
  return String(v ?? "").trim();
}

function Rastreo({ numero, transportista }: { numero?: string; transportista?: ShippingV2Proveedor }) {
  if (!texto(numero)) return <span className="text-[#696A64]">—</span>;
  const url = buildTrackingUrl(transportista, numero);
  return (
    <span className="block min-w-0">
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="break-all font-semibold text-[#D7FF4F] hover:underline">{numero}</a>
      ) : (
        <span className="break-all text-[#F5F5F5]">{numero}</span>
      )}
      {transportista ? <span className="block text-[11px] text-[#8F908A]">{getShippingV2ProveedorLabel(transportista)}</span> : null}
    </span>
  );
}

function Fila({ item, proveedores, cajasAbiertas, canEdit, canAddToPacking }: { item: ShippingV2Item } & Omit<Props, "items">) {
  const router = useRouter();
  const porId = new Map(proveedores.map((p) => [p.id, p]));
  const extranjero = item.origenArticulo === ORIGEN_EXTRANJERO;
  const pendientes = pendientesLogisticos(item);
  const [abierto, setAbierto] = useState(false);
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
    flete: item.fleteAsignadoRegistro?.toString() ?? "",
    arancel: item.arancelAsignadoRegistro?.toString() ?? "",
    otrosCostos: item.otrosCostosAsignadosRegistro?.toString() ?? "",
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
    cambio("flete", item.fleteAsignadoRegistro?.toString() ?? "");
    cambio("arancel", item.arancelAsignadoRegistro?.toString() ?? "");
    cambio("otrosCostos", item.otrosCostosAsignadosRegistro?.toString() ?? "");
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
      setAbierto(false);
      router.refresh();
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : "Error inesperado.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <tr className="border-t border-[#3A3A36]/80 align-top hover:bg-[#1E1F1C]">
        <td className="px-3 py-2.5">
          <Link href={`/shipping-v2/items/${item.id}`} className="font-semibold text-[#D7FF4F] hover:underline">{item.sku || "—"}</Link>
          <p className="max-w-[16rem] truncate text-[12px] text-[#A7A7A7]" title={item.nombre}>{item.nombre}</p>
        </td>
        <td className="px-3 py-2.5 text-[12px] text-[#F5F5F5]">
          {item.origenArticulo === ORIGEN_EXTRANJERO ? "Extranjero" : "Local"}
          <span className="block text-[11px] text-[#8F908A]">{item.proveedorNombre || "Sin proveedor"}</span>
          {extranjero && item.proveedorLogisticoNombre ? <span className="block text-[11px] text-[#8F908A]">Casillero: {item.proveedorLogisticoNombre}</span> : null}
        </td>
        <td className="px-3 py-2.5 text-[12px]">
          {extranjero
            ? <Rastreo numero={item.trackingHaciaIntermediario} transportista={porId.get(item.transportistaOrigenId || "")} />
            : <span className="text-[#696A64]">No aplica</span>}
        </td>
        <td className="px-3 py-2.5 text-[12px]">
          <Rastreo
            numero={extranjero ? item.trackingDesdeIntermediario : item.trackingDirecto}
            transportista={porId.get(item.transportistaEcuadorId || "")}
          />
        </td>
        <td className="px-3 py-2.5 text-[12px] tabular-nums text-[#A7A7A7]">
          <span className="block">Flete {dinero(item.fleteAsignadoRegistro)}</span>
          {extranjero ? <span className="block">Arancel {dinero(item.arancelAsignadoRegistro)}</span> : null}
          {item.otrosCostosAsignadosRegistro != null ? <span className="block">Otros {dinero(item.otrosCostosAsignadosRegistro)}</span> : null}
        </td>
        <td className="px-3 py-2.5 text-[12px] text-[#F5F5F5]">{item.estado || "—"}</td>
        <td className="px-3 py-2.5">
          {pendientes.length ? (
            <div className="flex flex-wrap gap-1">
              {pendientes.map((p) => (
                <span key={p} className="rounded-full border border-[#F4C95B]/35 bg-[#F4C95B]/10 px-2 py-0.5 text-[11px] font-semibold text-[#F4C95B]">Falta {p.toLowerCase()}</span>
              ))}
            </div>
          ) : (
            <span className="rounded-full border border-[#7BE495]/35 bg-[#7BE495]/10 px-2 py-0.5 text-[11px] font-semibold text-[#9FEFB3]">Completo</span>
          )}
        </td>
        <td className="px-3 py-2.5 text-right">
          {canEdit || canAddToPacking ? (
            <button
              type="button"
              onClick={() => setAbierto((v) => !v)}
              aria-expanded={abierto}
              className="rounded-lg border border-[#3A3A36] px-3 py-1.5 text-[12px] font-bold text-[#F5F5F5] transition hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F]"
            >
              {abierto ? "Cerrar" : "Gestionar"}
            </button>
          ) : null}
        </td>
      </tr>
      {abierto ? (
        <tr className="border-t border-[#30312D] bg-[#121310]">
          <td colSpan={8} className="px-3 py-3">
            <div className="grid gap-3 lg:grid-cols-4">
              {canEdit ? (
                <>
                  <label className="space-y-1">
                    <span className="text-[11px] font-semibold uppercase text-[#A7A7A7]">Origen</span>
                    <select value={f.origenArticulo} onChange={(e) => setF({ ...f, origenArticulo: e.target.value })} className={inputClass}>
                      <option value={ORIGEN_EXTRANJERO}>Proveedor extranjero</option>
                      <option value={ORIGEN_LOCAL}>Proveedor local</option>
                    </select>
                  </label>
                  {fExtranjero ? (
                    <>
                      <label className="space-y-1">
                        <span className="text-[11px] font-semibold uppercase text-[#A7A7A7]">Casillero</span>
                        <select value={f.proveedorLogisticoId} onChange={(e) => setF({ ...f, proveedorLogisticoId: e.target.value })} className={inputClass}>
                          <option value="">Sin casillero</option>
                          {casilleros.map((p) => <option key={p.id} value={p.id}>{getShippingV2ProveedorLabel(p)}</option>)}
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className="text-[11px] font-semibold uppercase text-[#A7A7A7]">Rastreo al casillero</span>
                        <input value={f.trackingHaciaIntermediario} onChange={(e) => setF({ ...f, trackingHaciaIntermediario: e.target.value })} className={inputClass} />
                      </label>
                      <label className="space-y-1">
                        <span className="text-[11px] font-semibold uppercase text-[#A7A7A7]">Transportista al casillero</span>
                        <select value={f.transportistaOrigenId} onChange={(e) => setF({ ...f, transportistaOrigenId: e.target.value })} className={inputClass}>
                          <option value="">—</option>
                          {(transportistasOrigen.length ? transportistasOrigen : logisticos).map((p) => <option key={p.id} value={p.id}>{getShippingV2ProveedorLabel(p)}</option>)}
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className="text-[11px] font-semibold uppercase text-[#A7A7A7]">Rastreo a Ecuador</span>
                        <input value={f.trackingDesdeIntermediario} onChange={(e) => setF({ ...f, trackingDesdeIntermediario: e.target.value })} className={inputClass} />
                      </label>
                    </>
                  ) : (
                    <label className="space-y-1">
                      <span className="text-[11px] font-semibold uppercase text-[#A7A7A7]">Rastreo</span>
                      <input value={f.trackingDirecto} onChange={(e) => setF({ ...f, trackingDirecto: e.target.value })} className={inputClass} />
                    </label>
                  )}
                  <label className="space-y-1">
                    <span className="text-[11px] font-semibold uppercase text-[#A7A7A7]">{fExtranjero ? "Transportista en Ecuador" : "Transportista"}</span>
                    <select value={f.transportistaEcuadorId} onChange={(e) => setF({ ...f, transportistaEcuadorId: e.target.value })} className={inputClass}>
                      <option value="">—</option>
                      {(transportistasEcuador.length ? transportistasEcuador : logisticos).map((p) => <option key={p.id} value={p.id}>{getShippingV2ProveedorLabel(p)}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] font-semibold uppercase text-[#A7A7A7]">Flete total ($)</span>
                    <input type="number" min="0" step="0.01" value={f.flete} onChange={(e) => setF({ ...f, flete: e.target.value })} className={inputClass} />
                  </label>
                  {fExtranjero ? (
                    <label className="space-y-1">
                      <span className="text-[11px] font-semibold uppercase text-[#A7A7A7]">Arancel total ($)</span>
                      <input type="number" min="0" step="0.01" value={f.arancel} onChange={(e) => setF({ ...f, arancel: e.target.value })} className={inputClass} />
                    </label>
                  ) : null}
                  <label className="space-y-1">
                    <span className="text-[11px] font-semibold uppercase text-[#A7A7A7]">Otros costos ($)</span>
                    <input type="number" min="0" step="0.01" value={f.otrosCostos} onChange={(e) => setF({ ...f, otrosCostos: e.target.value })} className={inputClass} />
                  </label>
                </>
              ) : null}
              {canAddToPacking ? (
                <label className="space-y-1 lg:col-span-2">
                  <span className="text-[11px] font-semibold uppercase text-[#A7A7A7]">Meter en una caja abierta</span>
                  <select value={f.cajaId} onChange={(e) => setF({ ...f, cajaId: e.target.value })} className={inputClass}>
                    <option value="">{cajas.length ? "No, sigue viajando solo" : "No hay cajas abiertas de este proveedor o casillero"}</option>
                    {cajas.map((c) => <option key={c.id} value={c.id}>{c.codigo}{c.nombre ? ` · ${c.nombre}` : ""}</option>)}
                  </select>
                </label>
              ) : null}
            </div>
            <p className="mt-2 text-[12px] text-[#8F908A]">
              Los costos son el total del envío de este artículo; el sistema los reparte por unidad. Al escribir un rastreo el artículo pasa solo a “En tránsito”. Si entra a una caja, desde ahí la caja gobierna sus rastreos y costos.
            </p>
            {mensaje ? <p className="mt-2 text-[12px] text-[#FFB07A]">{mensaje}</p> : null}
            <div className="mt-2 flex justify-end gap-2">
              <button type="button" onClick={() => setAbierto(false)} className="rounded-lg border border-[#3A3A36] px-3 py-1.5 text-[12px] font-semibold text-[#F5F5F5]">Cancelar</button>
              <button type="button" disabled={guardando} onClick={guardar} className="rounded-lg border border-[#D7FF4F] bg-[#D7FF4F] px-3 py-1.5 text-[12px] font-black text-[#151515] disabled:opacity-60">
                {guardando ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

export function ShippingV2SueltosEnCamino(props: Props) {
  const { items } = props;
  const conPendientes = items.filter((i) => pendientesLogisticos(i).length > 0).length;
  return (
    <section className="overflow-hidden rounded-xl border border-[#30312D] bg-[#171814] shadow-2xl shadow-black/25">
      <div className="flex flex-col gap-1 border-b border-[#30312D] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-[#F5F5F5]">Artículos que viajan solos</h2>
          <p className="text-[13px] text-[#A7A7A7]">Vienen de afuera, todavía no llegan y no van en una caja.</p>
        </div>
        <p className="text-[13px] font-semibold text-[#F4C95B]">{conPendientes ? `${conPendientes} con datos pendientes` : items.length ? "Todo completo" : ""}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="bg-[#20211D] text-[12px] uppercase text-[#A7A7A7]">
            <tr>
              {["Artículo", "Origen", "Rastreo al casillero", "Rastreo en Ecuador", "Costos", "Etapa", "Qué falta", ""].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => <Fila key={item.id} item={item} {...props} />)}
            {items.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-sm text-[#8F908A]">No hay artículos viajando solos en este momento.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
