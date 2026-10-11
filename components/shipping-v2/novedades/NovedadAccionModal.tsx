"use client";

// Ventana de cada acción sobre una novedad (punto 8). La usan la pestaña
// Novedades y la ficha del artículo. Valida con las mismas reglas que el
// servidor (lib/shipping-v2/novedades.ts); el servidor vuelve a validar.

import { useState } from "react";
import {
  esPerdidoEnTienda,
  esResponsableProveedor,
  getDecisionConfig,
  getDecisionesPermitidas,
  SHIPPING_V2_PROPUESTAS_PROVEEDOR,
  validarAccionNovedad,
  type ShippingV2NovedadAccionConfig,
  type ShippingV2NovedadRol,
  type ValoresAccionNovedad,
} from "@/lib/shipping-v2/novedades";
import type { ShippingV2Item, ShippingV2Novedad } from "@/types/shipping-v2";

const INPUT = "h-8 w-full rounded-lg border border-[#3A3A36] bg-[#11120F] px-2.5 text-[13px] text-[#F5F5F5] placeholder:text-[#5A5B57] outline-none focus:border-[#D7FF4F]/60";
const LABEL = "text-[11px] font-semibold uppercase tracking-normal text-[#8F908A]";

function display(value?: string | number | null) {
  if (value === null || value === undefined) return "—";
  const text = String(value).trim();
  return text || "—";
}

export type ResultadoAccionNovedad = { novedad: ShippingV2Novedad | null; item: ShippingV2Item | null; mensaje: string };

/** Llama al servidor. Lanza el error con el mensaje listo para mostrar. */
export async function ejecutarAccionNovedad(novedadId: string, accion: string, valores: ValoresAccionNovedad): Promise<ResultadoAccionNovedad> {
  const response = await fetch(`/api/shipping-v2/novedades/${novedadId}/transicion`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accion, valores }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) throw new Error(String(payload.error || "No se pudo actualizar la novedad."));
  return {
    novedad: (payload?.data?.novedad as ShippingV2Novedad) ?? null,
    item: (payload?.data?.item as ShippingV2Item) ?? null,
    mensaje: String(payload?.data?.mensaje || ""),
  };
}

/** Ventana de cada acción. Solo pide lo que esa acción necesita. */
export function NovedadAccionModal({
  novedad,
  accion,
  rol,
  canEditItems,
  busy,
  mensaje,
  onCancel,
  onSubmit,
}: {
  novedad: ShippingV2Novedad;
  accion: ShippingV2NovedadAccionConfig;
  rol: ShippingV2NovedadRol;
  canEditItems: boolean;
  busy: boolean;
  mensaje: string;
  onCancel: () => void;
  onSubmit: (valores: ValoresAccionNovedad) => void;
}) {
  const conProveedor = esResponsableProveedor(novedad.responsable);
  const decisiones = getDecisionesPermitidas({ tipo: novedad.tipo, isSiteAdmin: rol === "admin" })
    .filter((d) => d.valor !== "Se vende con descuento" || canEditItems);
  const [texto, setTexto] = useState("");
  const [decision, setDecision] = useState("");
  const [propuesta, setPropuesta] = useState(accion.accion === "resolver" ? novedad.solucion || "" : "");
  const [precio, setPrecio] = useState("");
  const [cantidad, setCantidad] = useState(novedad.itemCantidad ? String(novedad.itemCantidad) : "1");
  const [comoAparecio, setComoAparecio] = useState("");
  const [pendiente, setPendiente] = useState(false);
  const [desbloquear, setDesbloquear] = useState(false);
  const [montoReclamado, setMontoReclamado] = useState("");
  const [montoRecuperado, setMontoRecuperado] = useState("");
  const [errorLocal, setErrorLocal] = useState("");

  const dec = getDecisionConfig(decision);
  const num = (v: string) => (v.trim() === "" ? undefined : Number(v));
  const valores: ValoresAccionNovedad = {
    texto,
    decision: decision || undefined,
    propuesta: propuesta || undefined,
    precio: dec?.pidePrecio ? num(precio) : undefined,
    cantidad: dec?.pideCantidad ? num(cantidad) : undefined,
    comoAparecio: comoAparecio || undefined,
    pendienteProveedor: pendiente,
    desbloquear,
    montoReclamado: num(montoReclamado),
    montoRecuperado: num(montoRecuperado),
  };

  const esResolver = accion.accion === "resolver";
  const esRespuesta = accion.accion === "responder" || accion.accion === "registrar-respuesta";
  const pideMotivo = accion.accion === "desbloquear" || accion.accion === "reabrir";
  const pideTexto = esResolver || esRespuesta || accion.accion === "contestar" || pideMotivo || accion.accion === "cumplida";
  const etiquetaTexto = esResolver ? "Qué se hizo" : esRespuesta ? "Respuesta del proveedor" : accion.accion === "contestar" ? "Mensaje para el proveedor" : pideMotivo ? "Motivo" : "Nota (opcional)";
  const perdidoAparecio = esPerdidoEnTienda(novedad.tipo) && decision === "No requiere solución";

  function enviar() {
    const v = validarAccionNovedad({ accion: accion.accion, novedad, rol, valores });
    if (!v.ok) { setErrorLocal(v.motivo); return; }
    setErrorLocal("");
    onSubmit(valores);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#3A3A36] bg-[#151613] p-4 shadow-2xl shadow-black/60">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-base font-semibold text-[#F5F5F5]">{accion.label}</h3>
          <span className="truncate text-[12px] text-[#8F908A]">{display(novedad.itemSku)} · {display(novedad.tipo)}</span>
        </div>

        {accion.accion === "bloquear" ? (
          <p className="mt-2 text-[13px] text-[#C9C9C4]">El artículo no se podrá reservar ni vender. Solo un Administrador puede desbloquearlo.</p>
        ) : null}

        {esResolver ? (
          <div className="mt-3">
            <span className={LABEL}>Qué pasa con el artículo</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {decisiones.map((d) => (
                <button
                  key={d.valor}
                  type="button"
                  title={d.ayuda}
                  onClick={() => setDecision(d.valor)}
                  className={`rounded-lg border px-2.5 py-1 text-[12px] font-semibold transition ${
                    decision === d.valor
                      ? d.soloAdmin ? "border-[#FF914D] bg-[#FF914D]/15 text-[#FFB07A]" : "border-[#D7FF4F] bg-[#D7FF4F]/12 text-[#D7FF4F]"
                      : "border-[#3A3A36] bg-[#11120F] text-[#A7A7A7] hover:text-[#F5F5F5]"
                  }`}
                >
                  {d.valor}
                </button>
              ))}
            </div>
            {dec ? <p className="mt-1 text-[11px] text-[#8F908A]">{dec.ayuda}</p> : null}

            {dec?.pidePrecio || dec?.pideCantidad ? (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {dec.pidePrecio ? (
                  <label><span className={LABEL}>Nuevo precio de venta</span>
                    <input type="number" min="0" step="0.01" value={precio} onChange={(e) => setPrecio(e.target.value)} className={`mt-1 ${INPUT}`} />
                  </label>
                ) : null}
                {dec.pideCantidad ? (
                  <label><span className={LABEL}>Unidades{novedad.itemCantidad ? ` (de ${novedad.itemCantidad})` : ""}</span>
                    <input type="number" min="1" step="1" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className={`mt-1 ${INPUT}`} />
                  </label>
                ) : null}
              </div>
            ) : null}

            {perdidoAparecio ? (
              <label className="mt-2 block"><span className={LABEL}>Dónde o cómo apareció</span>
                <input value={comoAparecio} onChange={(e) => setComoAparecio(e.target.value)} placeholder="Estaba en la bodega, en la caja de cables" className={`mt-1 ${INPUT}`} />
              </label>
            ) : null}
          </div>
        ) : null}

        {(esResolver && conProveedor) || esRespuesta ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className={esRespuesta ? "col-span-2" : ""}><span className={LABEL}>{esRespuesta ? "Propone" : "Lo que ofreció el proveedor"}</span>
              <select value={propuesta} onChange={(e) => setPropuesta(e.target.value)} className={`mt-1 ${INPUT} font-semibold`}>
                <option value="">{esRespuesta ? "Sin propuesta todavía" : "—"}</option>
                {SHIPPING_V2_PROPUESTAS_PROVEEDOR.map((p) => <option key={p.valor} value={p.valor}>{p.label}</option>)}
              </select>
            </label>
            {esResolver ? (
              <label><span className={LABEL}>Monto reclamado</span>
                <input type="number" min="0" step="0.01" value={montoReclamado} onChange={(e) => setMontoReclamado(e.target.value)} className={`mt-1 ${INPUT}`} />
              </label>
            ) : null}
          </div>
        ) : null}

        {pideTexto ? (
          <label className="mt-3 block"><span className={LABEL}>{etiquetaTexto}</span>
            <textarea
              value={texto}
              onChange={(e) => { setTexto(e.target.value); if (errorLocal) setErrorLocal(""); }}
              rows={3}
              className="mt-1 w-full rounded-lg border border-[#3A3A36] bg-[#11120F] px-2.5 py-2 text-[13px] text-[#F5F5F5] placeholder:text-[#5A5B57] outline-none focus:border-[#D7FF4F]/60"
            />
          </label>
        ) : null}

        {(esResolver && conProveedor) || accion.accion === "cumplida" ? (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label><span className={LABEL}>Monto recuperado</span>
              <input type="number" min="0" step="0.01" value={montoRecuperado} onChange={(e) => setMontoRecuperado(e.target.value)} className={`mt-1 ${INPUT}`} />
            </label>
            {esResolver ? (
              <label className="flex cursor-pointer items-end gap-2 pb-1.5" title="Por ejemplo: el reemplazo o el reembolso todavía no llegan. Queda “En solución”.">
                <input type="checkbox" checked={pendiente} onChange={(e) => setPendiente(e.target.checked)} className="h-4 w-4 accent-[#D7FF4F]" />
                <span className="text-[12px] font-semibold text-[#F5F5F5]">Falta que el proveedor cumpla</span>
              </label>
            ) : null}
          </div>
        ) : null}

        {esResolver && rol === "admin" && novedad.bloqueaVenta ? (
          <label className="mt-2 flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={desbloquear} onChange={(e) => setDesbloquear(e.target.checked)} className="h-4 w-4 accent-[#FF914D]" />
            <span className="text-[12px] font-semibold text-[#FFB07A]">Desbloquear también la venta</span>
          </label>
        ) : null}
        {esResolver && rol !== "admin" && novedad.bloqueaVenta ? (
          <p className="mt-2 text-[11px] text-[#8F908A]">La venta seguirá bloqueada hasta que un Administrador la desbloquee.</p>
        ) : null}

        {errorLocal || mensaje ? <p className="mt-2 text-sm font-semibold text-[#FFB07A]">{errorLocal || mensaje}</p> : null}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" disabled={busy} onClick={onCancel} className="h-9 rounded-lg border border-[#3A3A36] bg-[#20211D] px-3 text-sm font-semibold text-[#F5F5F5] disabled:opacity-50">Cancelar</button>
          <button type="button" disabled={busy} onClick={enviar} className="h-9 rounded-lg border border-[#D7FF4F] bg-[#D7FF4F] px-3 text-sm font-bold text-[#151515] transition hover:brightness-105 disabled:opacity-50">
            {busy ? "Guardando..." : accion.label}
          </button>
        </div>
      </div>
    </div>
  );
}

