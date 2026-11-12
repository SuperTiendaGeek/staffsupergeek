"use client";

// Punto 10A-2 — Cotización de un PEDIDO ESPECIAL (Operaciones).
// Las opciones son líneas del mismo Presupuesto de las órdenes. Flujo:
// + Opción → Enviar cotización (72 h) → Aceptar en tienda (+ abono) → Logística compra.
// Reglas de diseño: docs/REGLAS_UX_UI.md (compacto, uso n.º 100).

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Check, Clock, Copy, ExternalLink, Link2, Loader2, Pencil, Plus, Send, Trash2, X } from "lucide-react";
import { ProveedorSelector } from "./OpcionModal";
import type { ProveedorBusqueda } from "@/types/operaciones";
import {
  confirmacionesPorOpcion, mensajeCotizacion, resumenAnticipo, textoAnticipo, textoFechaHora, totalElegido,
  VIGENCIA_DIAS_MAX, VIGENCIA_DIAS_MIN,
} from "@/lib/pedidos-especiales/reglas";
import { construirUrlWhatsApp } from "@/lib/operaciones/whatsappCotizacion";

type Linea = {
  id: string; descripcion: string; cantidad: number; precioUnitario: number; estado: string;
  costoProveedor: number | null; tiempoEstimado: string; categoria: string; notaCliente?: string;
  grupoAlternativas?: string; proveedorId: string | null; urlProveedor: string;
};
type Solicitud = { id: string; lineaId: string | null; estado: string; codigo: string; situacion: { texto: string; tono: string } };
type Vista = {
  id: string; codigo: string; estado: string; vence: string; vigencia: "sin_fecha" | "vigente" | "por_vencer" | "vencida";
  aceptadoEn: string; aceptadoPor: string; aceptadoVia: string;
  lineas: Linea[]; solicitudes: Solicitud[];
  anticipo: { total: number; anticipo: number; pagado: number; faltaAnticipo: number; faltaTotal: number; cubierto: boolean };
  cancelacion: { opciones: string[]; piezaQuedaEnTienda: boolean; texto: string };
  /** Página del pedido para el cliente (10A-3); "" hasta el primer envío. */
  enlace: string;
  /** Lo que el cliente eligió en el enlace y aún no paga. */
  eleccionCliente: { fecha: string; elegidas: string[] } | null;
  /** proveedorId → nombre. */
  proveedores: Record<string, string>;
  /** Punto 10B: pasos del pedido aceptado (null antes de aceptar). */
  seguimiento: Seguimiento | null;
};
type Hito = { clave: string; titulo: string; estado: "hecho" | "actual" | "pendiente"; fecha: string; manual: boolean };
type Seguimiento = {
  hitos: Hito[];
  actual: Hito | null;
  siguienteManual: { clave: string; titulo: string } | null;
  llegada: { desde: string; hasta: string; texto: string; corregida: boolean } | null;
  retraso: boolean;
  aviso: string | null;
  avisoInterno: { nota: string; por: string; fecha: string } | null;
};

const usd = (n: number) => `$${(Math.round(n * 100) / 100).toFixed(2)}`;
const input = "w-full rounded-lg border border-[#3A3A36] bg-[#252622] px-2.5 py-2 text-sm text-[#F0F0EC] outline-none transition focus:border-[#D7FF4F]/60";
const btn = "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50";
const TONO: Record<string, string> = {
  exito: "border-[#56E3A4]/40 bg-[#56E3A4]/10 text-[#56E3A4]",
  aviso: "border-[#FFB547]/40 bg-[#FFB547]/10 text-[#FFB547]",
  peligro: "border-[#FF5A4F]/40 bg-[#FF5A4F]/10 text-[#FF5A4F]",
  info: "border-[#78B7FF]/40 bg-[#78B7FF]/10 text-[#78B7FF]",
  neutro: "border-[#3A3A36] bg-[#252622] text-[#A0A09A]",
};

export function CotizacionPedido({
  operacionId, clienteNombre, clienteTelefono, onCambio, onAbrirAbono, recargar = 0,
}: {
  operacionId: string;
  clienteNombre: string;
  clienteTelefono: string;
  /** Refresca la pantalla (cuenta, estado). */
  onCambio: () => void;
  /** Abre "Registrar abono" con el monto sugerido (aceptar en tienda = un paso). */
  onAbrirAbono: (monto: number) => void;
  /** Cambia cuando se registra un abono afuera (puede confirmar el pedido). */
  recargar?: number;
}) {
  const [vista, setVista] = useState<Vista | null>(null);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [editando, setEditando] = useState<Linea | "nueva" | null>(null);
  const [aceptando, setAceptando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [dias, setDias] = useState(3);
  const [copiado, setCopiado] = useState<"" | "mensaje" | "enlace">("");
  // Causa → efecto (REGLAS_UX_UI): la fila que cambió destella, la que se
  // quita sale hacia la derecha, la vigencia renovada destella.
  const [resaltar, setResaltar] = useState<Set<string>>(new Set());
  const [saliendo, setSaliendo] = useState<string | null>(null);
  const marcar = (ids: string[]) => { setResaltar(new Set(ids)); setTimeout(() => setResaltar(new Set()), 950); };

  const cargar = useCallback(async () => {
    const r = await fetch(`/api/operaciones/${operacionId}/pedido`, { cache: "no-store" });
    const j = (await r.json()) as { success: boolean; data?: Vista; error?: string };
    if (j.success && j.data) { setVista(j.data); setError(""); } else setError(j.error ?? "No se pudo leer el pedido.");
  }, [operacionId]);
  useEffect(() => { void cargar(); }, [cargar, recargar]);

  async function accion(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    setOcupado(true); setError("");
    try {
      const r = await fetch(`/api/operaciones/${operacionId}/pedido`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const j = (await r.json()) as { success: boolean; data?: Record<string, unknown>; error?: string };
      if (!j.success) { setError(j.error ?? "No se pudo completar."); return null; }
      await cargar();
      onCambio();
      return j.data ?? {};
    } catch {
      setError("Error de conexión."); return null;
    } finally {
      setOcupado(false);
    }
  }

  function copiar(que: "mensaje" | "enlace", textoACopiar: string) {
    void navigator.clipboard.writeText(textoACopiar).then(() => { setCopiado(que); setTimeout(() => setCopiado(""), 1500); });
  }

  const propuestas = useMemo(() => (vista?.lineas ?? []).filter((l) => l.estado === "Propuesta"), [vista]);
  const mensaje = useMemo(() => vista ? mensajeCotizacion({
    cliente: clienteNombre, codigo: vista.codigo, vence: vista.vence, enlace: vista.enlace || undefined,
    lineas: propuestas.map((l) => ({ descripcion: l.descripcion, cantidad: l.cantidad, precioUnitario: l.precioUnitario, notaCliente: l.notaCliente, esAlternativa: !!l.grupoAlternativas })),
  }) : "", [vista, propuestas, clienteNombre]);
  const waUrl = mensaje ? construirUrlWhatsApp(clienteTelefono, mensaje) : null;
  // Cuánto paga el cliente para confirmar cada opción (regla de tramos, con
  // los adicionales incluidos): se ve en la tabla, no se calcula de cabeza.
  const confirmaciones = useMemo(() => confirmacionesPorOpcion(propuestas.map((l) => ({
    id: l.id, cantidad: l.cantidad, precioUnitario: l.precioUnitario, esAlternativa: !!l.grupoAlternativas,
  }))), [propuestas]);
  const confirmacionDe = (id: string | null) => confirmaciones.find((c) => c.lineaId === id) ?? null;
  // Alternativas primero (el cliente elige una), luego lo que se suma.
  const ordenadas = useMemo(() => {
    const ls = vista?.lineas ?? [];
    return [...ls.filter((l) => l.grupoAlternativas), ...ls.filter((l) => !l.grupoAlternativas)];
  }, [vista]);
  const nAlt = ordenadas.filter((l) => l.grupoAlternativas).length;
  const nExtra = ordenadas.length - nAlt;
  const conEncabezados = nAlt > 1 || (nAlt > 0 && nExtra > 0);

  if (!vista) {
    return (
      <section className="rounded-xl border border-[#3A3A36] bg-[#1E1F1C] p-4">
        {error ? <p className="text-xs text-[#FF5A4F]">{error}</p> : <Loader2 size={14} className="animate-spin text-[#6B6B66]" />}
      </section>
    );
  }

  const cotizable = vista.estado === "Cotizando" || vista.estado === "Esperando al cliente";
  const solicitudDe = (lineaId: string) => vista.solicitudes.filter((s) => s.lineaId === lineaId && s.estado !== "Cancelada").pop() ?? null;

  return (
    <>
    {vista.seguimiento && (
      <SeguimientoCard
        s={vista.seguimiento}
        ocupado={ocupado}
        onAccion={(tipo, datos = {}) => accion({ accion: "seguimiento", tipo, ...datos })}
      />
    )}
    <section className="rounded-xl border border-[#3A3A36] bg-[#1E1F1C] p-4 sm:p-5 animate-[sg-entrada_180ms_ease-out]">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-[#F0F0EC]">Cotización</h3>
        <span key={vista.vence} style={resaltar.has("vigencia") ? { animation: "sg-destello 900ms ease-out" } : undefined} className="rounded-full">
          <ChipVigencia vista={vista} />
        </span>
        {vista.enlace && (
          <button type="button" onClick={() => copiar("enlace", vista.enlace)} title="Página del pedido para el cliente"
            className={`${btn} border-[#3A3A36] text-[#A0A09A] hover:text-[#F0F0EC]`}>
            {copiado === "enlace" ? <Check size={12} /> : <Link2 size={12} />} {copiado === "enlace" ? "Copiado" : "Enlace"}
          </button>
        )}
        {vista.enlace && (
          <a href={vista.enlace} target="_blank" rel="noreferrer" title="Abrir la página que ve el cliente"
            className={`${btn} border-[#3A3A36] text-[#A0A09A] hover:text-[#F0F0EC]`}>
            <ExternalLink size={12} /> Ver como cliente
          </a>
        )}
        {vista.estado === "Aceptado" && (
          <span className="text-[11px] text-[#6B6B66]">
            Aceptado {vista.aceptadoVia === "En tienda" ? "en tienda" : "por el enlace"} · {vista.aceptadoEn ? textoFechaHora(vista.aceptadoEn) : ""} · {vista.aceptadoPor}
          </span>
        )}
        {cotizable && (
          <button type="button" onClick={() => setEditando("nueva")} disabled={ocupado} className={`${btn} ml-auto border-[#D7FF4F]/50 text-[#D7FF4F] hover:bg-[#D7FF4F]/10`}>
            <Plus size={12} /> Opción
          </button>
        )}
      </div>

      {vista.lineas.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[#3A3A36] px-3 py-4 text-center text-xs text-[#6B6B66]">Sin opciones</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-[#4A4A46]">
                <th className="pb-1.5 font-medium">Opción</th>
                <th className="pb-1.5 text-right font-medium">Cant.</th>
                <th className="pb-1.5 text-right font-medium">Total</th>
                <th className="pb-1.5 text-right font-medium" title="Interno: no lo ve el cliente">Costo</th>
                <th className="pb-1.5 pl-3 font-medium">Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {ordenadas.map((l, idx) => {
                const sol = solicitudDe(l.id);
                const rechazada = l.estado === "Rechazada";
                const conf = l.estado === "Propuesta" && l.grupoAlternativas ? confirmacionDe(l.id) : null;
                const perdida = l.costoProveedor != null && l.costoProveedor > l.precioUnitario;
                const encabezado = conEncabezados && (idx === 0 || (idx === nAlt && nExtra > 0))
                  ? (l.grupoAlternativas ? (nAlt > 1 ? "Elige una" : "Opción") : "Se suma a la elección")
                  : null;
                return (
                  <Fragment key={l.id}>
                  {encabezado && (
                    <tr><td colSpan={6} className="pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-[#8A8A80]">{encabezado}</td></tr>
                  )}
                  <tr
                    className={`border-t border-[#2A2B27] transition-opacity duration-500 ${rechazada ? "opacity-45" : ""}`}
                    style={saliendo === l.id ? { animation: "sg-salida 180ms ease-in forwards" } : resaltar.has(l.id) ? { animation: "sg-entrada 180ms ease-out, sg-destello 900ms ease-out" } : undefined}>
                    <td className="py-2 pr-2">
                      <p className="text-[#F0F0EC]">{l.descripcion}</p>
                      <p className="text-[11px] text-[#6B6B66]">
                        {[l.tiempoEstimado, l.notaCliente ? `“${l.notaCliente}”` : ""].filter(Boolean).join(" · ")}
                      </p>
                      {l.estado === "Propuesta" && (!l.proveedorId || !l.categoria) && (
                        <button type="button" onClick={() => setEditando(l)} className="mt-0.5 text-[11px] font-semibold text-[#FFB547] hover:underline">
                          Falta {!l.proveedorId ? "proveedor" : "categoría"}
                        </button>
                      )}
                      {conf && (
                        <p className="mt-0.5 text-[11px] font-semibold text-[#F0C75E]" title={nExtra ? `Total con lo que se suma: ${usd(conf.total)}` : undefined}>
                          {conf.pagoCompleto ? `Pago completo ${usd(conf.total)}` : `Confirma con ${usd(conf.paraConfirmar)} · resto ${usd(conf.alRetirar)}`}
                        </p>
                      )}
                    </td>
                    <td className="py-2 text-right text-[#C0C0BC]">{l.cantidad}</td>
                    <td className="py-2 text-right font-semibold text-[#F0F0EC]">{usd(l.precioUnitario * l.cantidad)}</td>
                    <td className={`py-2 text-right text-[11px] ${perdida ? "font-semibold text-[#FF5A4F]" : "text-[#6B6B66]"}`} title={perdida ? "El precio es menor que el costo" : undefined}>
                      {l.costoProveedor != null ? usd(l.costoProveedor * l.cantidad) : "—"}
                    </td>
                    <td className="py-2 pl-3">
                      {sol
                        ? <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${TONO[sol.situacion.tono] ?? TONO.neutro}`}>{sol.situacion.texto}</span>
                        : <span className="text-[11px] text-[#8A8A80]">{rechazada ? "No elegida" : l.estado === "Propuesta" ? "Propuesta" : l.estado}</span>}
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      {cotizable && l.estado === "Propuesta" && (
                        <>
                          <button type="button" title="Editar" onClick={() => setEditando(l)} className="p-1 text-[#6B6B66] hover:text-[#F0F0EC]"><Pencil size={13} /></button>
                          <button type="button" title="Quitar" disabled={ocupado} onClick={() => { setSaliendo(l.id); setTimeout(() => { void accion({ accion: "quitar", lineaId: l.id }).finally(() => setSaliendo(null)); }, 180); }} className="p-1 text-[#6B6B66] hover:text-[#FF5A4F]"><Trash2 size={13} /></button>
                        </>
                      )}
                    </td>
                  </tr>
                  </Fragment>
                );
              })}
              {nAlt === 0 && confirmacionDe(null) && (() => {
                const c = confirmacionDe(null)!;
                return (
                  <tr className="border-t border-[#2A2B27]">
                    <td colSpan={6} className="py-2 text-right text-[11px] font-semibold text-[#F0C75E]">
                      Total {usd(c.total)} · {c.pagoCompleto ? "pago completo para confirmar" : `confirma con ${usd(c.paraConfirmar)} · resto ${usd(c.alRetirar)}`}
                    </td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
      )}

      {cotizable && vista.eleccionCliente && (() => {
        // Eligió en el enlace y falta su pago: el abono lo confirma solo.
        const el = vista.eleccionCliente;
        const total = totalElegido(vista.lineas, el.elegidas);
        const r = resumenAnticipo(total, vista.anticipo.pagado);
        const nombres = vista.lineas.filter((l) => el.elegidas.includes(l.id)).map((l) => l.descripcion).join(" + ");
        return (
          <p key={el.fecha} className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-[#FFB547]/40 bg-[#FFB547]/10 px-3 py-2 text-xs text-[#FFB547] animate-[sg-destello_900ms_ease-out]">
            <span className="font-semibold">Eligió en el enlace:</span>
            <span className="text-[#F0F0EC]">{nombres} · {usd(total)}</span>
            <span className="text-[#C0C0BC]">{textoFechaHora(el.fecha)}</span>
            {r.cubierto
              ? <span className="font-semibold text-[#56E3A4]">Pago cubierto</span>
              : <button type="button" onClick={() => onAbrirAbono(r.faltaAnticipo)} className="ml-auto font-semibold text-[#D7FF4F] hover:underline">Falta {usd(r.faltaAnticipo)} · Registrar abono</button>}
          </p>
        );
      })()}

      {vista.estado === "Aceptado" && vista.anticipo.total > 0 && (
        <p key={vista.anticipo.pagado} className="mt-3 rounded-lg bg-[#252622] px-3 py-2 text-xs text-[#C0C0BC] animate-[sg-destello_900ms_ease-out]">
          Total {usd(vista.anticipo.total)} · anticipo {usd(vista.anticipo.anticipo)} · pagado {usd(vista.anticipo.pagado)}
          {vista.anticipo.cubierto
            ? <span className="ml-1 font-semibold text-[#56E3A4]">· anticipo cubierto</span>
            : <button type="button" onClick={() => onAbrirAbono(vista.anticipo.faltaAnticipo)} className="ml-2 font-semibold text-[#D7FF4F] hover:underline">Falta {usd(vista.anticipo.faltaAnticipo)} · Registrar abono</button>}
        </p>
      )}

      {error && <p className="mt-3 rounded-lg border border-[#FF5A4F]/40 bg-[#FF5A4F]/10 px-3 py-2 text-xs text-[#FF5A4F] animate-[sg-sacudir_300ms_ease-out]">{error}</p>}

      {cotizable && propuestas.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#2A2B27] pt-3">
          <label className="flex items-center gap-1.5 text-xs text-[#8A8A80]">
            Vale
            <select value={dias} onChange={(e) => setDias(Number(e.target.value))} className="rounded-md border border-[#3A3A36] bg-[#252622] px-1.5 py-1 text-xs text-[#F0F0EC]">
              {Array.from({ length: VIGENCIA_DIAS_MAX - VIGENCIA_DIAS_MIN + 1 }, (_, i) => i + VIGENCIA_DIAS_MIN).map((d) => (
                <option key={d} value={d}>{d === 3 ? "72 h" : `${d} ${d === 1 ? "día" : "días"}`}</option>
              ))}
            </select>
          </label>
          <button type="button" disabled={ocupado} onClick={() => { void accion({ accion: "enviar", dias }).then((r) => { if (r) marcar(["vigencia"]); }); }} className={`${btn} border-[#78B7FF]/50 text-[#78B7FF] hover:bg-[#78B7FF]/10`}>
            <Send size={12} /> {vista.estado === "Esperando al cliente" ? "Renovar" : "Enviar cotización"}
          </button>
          {vista.estado === "Esperando al cliente" && vista.vigencia !== "vencida" && (
            <>
              {waUrl && <a href={waUrl} target="_blank" rel="noreferrer" className={`${btn} border-[#56E3A4]/50 text-[#56E3A4] hover:bg-[#56E3A4]/10`}>WhatsApp</a>}
              <button type="button" onClick={() => copiar("mensaje", mensaje)} className={`${btn} border-[#3A3A36] text-[#A0A09A] hover:text-[#F0F0EC]`}>
                {copiado === "mensaje" ? <Check size={12} /> : <Copy size={12} />} {copiado === "mensaje" ? "Copiado" : "Copiar mensaje"}
              </button>
            </>
          )}
          <button type="button" disabled={ocupado || vista.vigencia === "vencida"} onClick={() => setAceptando(true)}
            title={vista.vigencia === "vencida" ? "La cotización venció: renuévala primero." : undefined}
            className={`${btn} ml-auto border-[#D7FF4F] bg-[#D7FF4F] text-[#10110E] hover:brightness-105`}>
            <Check size={12} /> Aceptar en tienda
          </button>
        </div>
      )}

      {vista.estado !== "Entregado" && vista.estado !== "Cancelado" && (
        <div className="mt-2 text-right">
          <button type="button" onClick={() => setCancelando(true)} className="text-[11px] text-[#6B6B66] hover:text-[#FF5A4F]">Cancelar pedido</button>
        </div>
      )}

      {editando && (
        <AlternativaModal
          linea={editando === "nueva" ? null : editando}
          proveedorActual={editando !== "nueva" && editando.proveedorId ? { id: editando.proveedorId, nombre: vista.proveedores[editando.proveedorId] ?? "Proveedor" } : null}
          ocupado={ocupado}
          onClose={() => setEditando(null)}
          onGuardar={async (datos) => {
            const ok = await accion(editando === "nueva" ? { accion: "agregar", ...datos } : { accion: "editar", lineaId: editando.id, ...datos });
            if (!ok) return;
            marcar([editando === "nueva" ? String((ok as { id?: string }).id ?? "") : editando.id]);
            setEditando(null);
          }}
        />
      )}
      {aceptando && (
        <AceptarModal
          lineas={propuestas}
          preseleccion={vista.eleccionCliente?.elegidas ?? null}
          ocupado={ocupado}
          pagado={vista.anticipo.pagado}
          onClose={() => setAceptando(false)}
          onAceptar={async (elegidas) => {
            const r = await accion({ accion: "aceptar", elegidas });
            if (!r) return;
            setAceptando(false);
            marcar(elegidas);
            const ant = (r.anticipo ?? null) as { faltaAnticipo?: number } | null;
            if (ant?.faltaAnticipo && ant.faltaAnticipo > 0) onAbrirAbono(ant.faltaAnticipo);
          }}
        />
      )}
      {cancelando && (
        <CancelarModal texto={vista.cancelacion.texto} pagado={vista.anticipo.pagado} ocupado={ocupado} onClose={() => setCancelando(false)}
          onCancelar={async (motivo) => { if (await accion({ accion: "cancelar", motivo })) setCancelando(false); }} />
      )}
    </section>
    </>
  );
}

function ChipVigencia({ vista }: { vista: Vista }) {
  if (vista.estado === "Cotizando") return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${TONO.neutro}`}>Sin enviar</span>;
  if (vista.estado !== "Esperando al cliente" || !vista.vence) return null;
  const tono = vista.vigencia === "vencida" ? TONO.peligro : vista.vigencia === "por_vencer" ? TONO.aviso : TONO.info;
  const t = vista.vigencia === "vencida" ? "Vencida" : `Vale hasta ${textoFechaHora(vista.vence)}`;
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tono}`}><Clock size={10} /> {t}</span>;
}

function Modal({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 px-4 py-8 animate-[sg-velo_160ms_ease-out]" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-[#3A3A36] bg-[#1E1F1C] p-4 shadow-2xl animate-[sg-modal_200ms_cubic-bezier(0.2,0.8,0.2,1)]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-[#F0F0EC]">{titulo}</h4>
          <button type="button" onClick={onClose} className="text-[#6B6B66] hover:text-[#F0F0EC]"><X size={15} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AlternativaModal({ linea, proveedorActual, ocupado, onClose, onGuardar }: {
  linea: Linea | null; proveedorActual: ProveedorBusqueda | null; ocupado: boolean; onClose: () => void; onGuardar: (d: Record<string, unknown>) => Promise<void>;
}) {
  const [descripcion, setDescripcion] = useState(linea?.descripcion ?? "");
  const [cantidad, setCantidad] = useState(String(linea?.cantidad ?? 1));
  const [precio, setPrecio] = useState(linea ? String(linea.precioUnitario) : "");
  const [costo, setCosto] = useState(linea?.costoProveedor != null ? String(linea.costoProveedor) : "");
  const [proveedor, setProveedor] = useState<ProveedorBusqueda | null>(proveedorActual);
  const [categoria, setCategoria] = useState(linea?.categoria ?? "");
  const [categorias, setCategorias] = useState<string[]>([]);
  const [url, setUrl] = useState(linea?.urlProveedor ?? "");
  const [tiempo, setTiempo] = useState(linea?.tiempoEstimado ?? "");
  const [nota, setNota] = useState(linea?.notaCliente ?? "");
  const [esAlternativa, setEsAlternativa] = useState(linea ? !!linea.grupoAlternativas : true);
  useEffect(() => {
    fetch("/api/operaciones/categorias").then((r) => r.json()).then((j: { success?: boolean; data?: string[] }) => setCategorias(j.data ?? [])).catch(() => {});
  }, [linea]);
  const n = Number(cantidad) || 0, p = Number(precio.replace(",", ".")) || 0, c = Number(costo.replace(",", ".")) || 0;

  return (
    <Modal titulo={linea ? "Editar opción" : "Nueva opción"} onClose={onClose}>
      <div className="space-y-2.5">
        <input className={input} placeholder="Descripción" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} autoFocus />
        <div className="grid grid-cols-3 gap-2">
          <input className={input} inputMode="numeric" placeholder="Cant." value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
          <input className={input} inputMode="decimal" placeholder="Precio c/u" value={precio} onChange={(e) => setPrecio(e.target.value)} />
          <input className={input} inputMode="decimal" placeholder="Costo c/u" value={costo} onChange={(e) => setCosto(e.target.value)} title="Interno" />
        </div>
        {/* Datos internos de compra: también al editar (las opciones migradas llegan sin proveedor). */}
        <>
            <ProveedorSelector initial={proveedorActual} onChange={setProveedor} disabled={ocupado} />
            <div className="grid grid-cols-2 gap-2">
              <select className={input} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                <option value="">Categoría…</option>
                {categorias.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
              <input className={input} placeholder="Tiempo de llegada" value={tiempo} onChange={(e) => setTiempo(e.target.value)} />
            </div>
            <input className={input} placeholder="URL proveedor" value={url} onChange={(e) => setUrl(e.target.value)} />
        </>
        <input className={input} placeholder="Nota al cliente" value={nota} onChange={(e) => setNota(e.target.value)} />
        <div className="flex gap-1 rounded-lg border border-[#3A3A36] p-0.5 text-xs">
          {[true, false].map((v) => (
            <button key={String(v)} type="button" onClick={() => setEsAlternativa(v)} title={v ? "El cliente elige una" : "Se suma al total"}
              className={`flex-1 rounded-md px-2 py-1.5 font-semibold transition ${esAlternativa === v ? "bg-[#D7FF4F] text-[#10110E]" : "text-[#8A8A80] hover:text-[#F0F0EC]"}`}>
              {v ? "Elige una" : "Se suma"}
            </button>
          ))}
        </div>
        <p className="text-right text-xs text-[#8A8A80]">
          Total {usd(n * p)}
          {c > 0 && <span className={p < c ? "font-semibold text-[#FF5A4F]" : ""}>{` · margen ${usd(n * (p - c))}`}</span>}
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={`${btn} border-[#3A3A36] text-[#A0A09A]`}>Cancelar</button>
          <button type="button" disabled={ocupado} className={`${btn} border-[#D7FF4F] bg-[#D7FF4F] text-[#10110E]`}
            onClick={() => void onGuardar(linea
              ? { descripcion, cantidad: n, precioUnitario: p, notaCliente: nota, esAlternativa, costoProveedor: costo ? c : null, proveedorId: proveedor?.id ?? "", categoria, urlProveedor: url, tiempoEstimado: tiempo }
              : { descripcion, cantidad: n, precioUnitario: p, costoProveedor: costo ? c : null, proveedorId: proveedor?.id ?? "", categoria, urlProveedor: url, tiempoEstimado: tiempo, notaCliente: nota, esAlternativa })}>
            {ocupado ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Guardar
          </button>
        </div>
      </div>
    </Modal>
  );
}

function AceptarModal({ lineas, preseleccion, pagado, ocupado, onClose, onAceptar }: {
  lineas: Linea[]; preseleccion: string[] | null; pagado: number; ocupado: boolean; onClose: () => void; onAceptar: (elegidas: string[]) => Promise<void>;
}) {
  const alternativas = lineas.filter((l) => l.grupoAlternativas);
  const adicionales = lineas.filter((l) => !l.grupoAlternativas);
  // Si el cliente ya eligió en el enlace, se parte de su elección.
  const [alt, setAlt] = useState<string | null>(
    alternativas.find((a) => preseleccion?.includes(a.id))?.id ?? (alternativas.length === 1 ? alternativas[0].id : null),
  );
  const [extras, setExtras] = useState<Set<string>>(() => new Set(adicionales.map((l) => l.id)));
  const elegidas = [...(alt ? [alt] : []), ...extras];
  const total = totalElegido(lineas, elegidas);
  const r = resumenAnticipo(total, pagado);

  return (
    <Modal titulo="Aceptar en tienda" onClose={onClose}>
      <div className="space-y-1.5">
        {alternativas.map((l) => (
          <label key={l.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${alt === l.id ? "border-[#D7FF4F]/60 bg-[#D7FF4F]/5" : "border-[#3A3A36]"}`}>
            <input type="radio" name="alt" checked={alt === l.id} onChange={() => setAlt(l.id)} className="accent-[#D7FF4F]" />
            <span className="flex-1 text-[#F0F0EC]">{l.descripcion}{l.cantidad > 1 ? ` ×${l.cantidad}` : ""}</span>
            <span className="font-semibold text-[#F0F0EC]">{usd(l.precioUnitario * l.cantidad)}</span>
          </label>
        ))}
        {adicionales.map((l) => (
          <label key={l.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-[#3A3A36] px-3 py-2 text-sm">
            <input type="checkbox" checked={extras.has(l.id)} className="accent-[#D7FF4F]"
              onChange={(e) => setExtras((s) => { const x = new Set(s); if (e.target.checked) x.add(l.id); else x.delete(l.id); return x; })} />
            <span className="flex-1 text-[#F0F0EC]">{l.descripcion}{l.cantidad > 1 ? ` ×${l.cantidad}` : ""}</span>
            <span className="font-semibold text-[#F0F0EC]">{usd(l.precioUnitario * l.cantidad)}</span>
          </label>
        ))}
      </div>
      <div className="mt-3 rounded-lg bg-[#252622] px-3 py-2 text-xs text-[#C0C0BC]">
        <p>Total <span className="font-semibold text-[#F0F0EC]">{usd(total)}</span> · {total > 0 ? textoAnticipo(total) : "elige qué acepta"}</p>
        {pagado > 0 && <p className="mt-0.5 text-[#8A8A80]">Ya pagó {usd(pagado)}: falta {usd(r.faltaAnticipo)} de anticipo.</p>}
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onClose} className={`${btn} border-[#3A3A36] text-[#A0A09A]`}>Cancelar</button>
        <button type="button" disabled={ocupado || elegidas.length === 0} onClick={() => void onAceptar(elegidas)} className={`${btn} border-[#D7FF4F] bg-[#D7FF4F] text-[#10110E]`}>
          {ocupado ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Aceptar{r.faltaAnticipo > 0 ? " y cobrar" : ""}
        </button>
      </div>
    </Modal>
  );
}

function CancelarModal({ texto, pagado, ocupado, onClose, onCancelar }: {
  texto: string; pagado: number; ocupado: boolean; onClose: () => void; onCancelar: (motivo: string) => Promise<void>;
}) {
  const [motivo, setMotivo] = useState("");
  return (
    <Modal titulo="Cancelar pedido" onClose={onClose}>
      <p className="mb-2 text-xs text-[#C0C0BC]">{texto}</p>
      {pagado > 0 && <p className="mb-2 text-xs text-[#FFB547]">Primero resuelve lo pagado en “Cuenta del cliente” (saldo a favor o devolver).</p>}
      <input className={input} placeholder="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onClose} className={`${btn} border-[#3A3A36] text-[#A0A09A]`}>Volver</button>
        <button type="button" disabled={ocupado || !motivo.trim()} onClick={() => void onCancelar(motivo)} className={`${btn} border-[#FF5A4F]/60 text-[#FF5A4F] hover:bg-[#FF5A4F]/10`}>Cancelar pedido</button>
      </div>
    </Modal>
  );
}

// ─── Seguimiento (punto 10B) ─────────────────────────────────────────────────
// Los pasos los dice Shipping V2 (compra, rastreo, caja, flete, Recepción); el
// empleado solo marca lo que Shipping no registra ("Siguiente"), corrige la
// llegada estimada o avisa "Necesitamos hablar contigo" (nota interna).

const fechaCorta = (iso: string) => {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t - 5 * 3_600_000);
  return `${d.getUTCDate()}-${["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][d.getUTCMonth()]}`;
};

function SeguimientoCard({ s, ocupado, onAccion }: {
  s: Seguimiento;
  ocupado: boolean;
  onAccion: (tipo: string, datos?: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
}) {
  const [editLlegada, setEditLlegada] = useState(false);
  const [desde, setDesde] = useState(s.llegada?.desde ?? "");
  const [hasta, setHasta] = useState(s.llegada?.hasta ?? "");
  const [avisando, setAvisando] = useState(false);
  const [nota, setNota] = useState("");
  const total = s.hitos.length;

  return (
    <section className="rounded-xl border border-[#3A3A36] bg-[#1E1F1C] p-4 sm:p-5 animate-[sg-entrada_180ms_ease-out]">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-[#F0F0EC]">Seguimiento</h3>
        {s.llegada && !editLlegada && (
          <button type="button" onClick={() => setEditLlegada(true)} title="Corregir la llegada estimada"
            className="inline-flex items-center gap-1 text-xs text-[#A0A09A] hover:text-[#F0F0EC]">
            Llega aprox. {s.llegada.texto}{s.llegada.corregida ? " ·  corregida" : ""} <Pencil size={11} />
          </button>
        )}
        {!s.llegada && !editLlegada && (
          <button type="button" onClick={() => setEditLlegada(true)} className="text-xs text-[#6B6B66] hover:text-[#F0F0EC]">+ Llegada estimada</button>
        )}
        {editLlegada && (
          <span className="flex flex-wrap items-center gap-1.5 text-xs animate-[sg-entrada_150ms_ease-out]">
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="rounded-md border border-[#3A3A36] bg-[#252622] px-1.5 py-1 text-xs text-[#F0F0EC]" aria-label="Desde" />
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="rounded-md border border-[#3A3A36] bg-[#252622] px-1.5 py-1 text-xs text-[#F0F0EC]" aria-label="Hasta" />
            <button type="button" disabled={ocupado} onClick={() => { void onAccion("llegada", { desde, hasta }).then((r) => { if (r) setEditLlegada(false); }); }} className={`${btn} border-[#D7FF4F]/50 text-[#D7FF4F]`}><Check size={12} /></button>
            {s.llegada?.corregida && <button type="button" disabled={ocupado} onClick={() => { void onAccion("llegada_auto").then((r) => { if (r) setEditLlegada(false); }); }} className="text-[11px] text-[#8A8A80] hover:text-[#F0F0EC]">Automática</button>}
            <button type="button" onClick={() => setEditLlegada(false)} className="p-1 text-[#6B6B66] hover:text-[#F0F0EC]" aria-label="Cerrar"><X size={12} /></button>
          </span>
        )}
        {s.retraso && <span className="rounded-full bg-[#FFB547]/15 px-2 py-0.5 text-[10px] font-semibold text-[#FFB547]">Con retraso</span>}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {s.avisoInterno ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#FFB547]/40 bg-[#FFB547]/10 px-2.5 py-1 text-[11px] font-semibold text-[#FFB547]" title={`${s.avisoInterno.nota} · ${s.avisoInterno.por}`}>
              Hablar con el cliente: <span className="max-w-[16rem] truncate font-normal text-[#F0F0EC]">{s.avisoInterno.nota}</span>
              <button type="button" disabled={ocupado} onClick={() => void onAccion("quitar_aviso")} className="text-[#A0A09A] hover:text-[#F0F0EC]" aria-label="Quitar aviso"><X size={11} /></button>
            </span>
          ) : avisando ? (
            <span className="flex items-center gap-1.5 animate-[sg-entrada_150ms_ease-out]">
              <input autoFocus value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota interna" className="w-48 rounded-md border border-[#3A3A36] bg-[#252622] px-2 py-1 text-xs text-[#F0F0EC]" />
              <button type="button" disabled={ocupado || !nota.trim()} onClick={() => { void onAccion("aviso", { nota }).then((r) => { if (r) { setAvisando(false); setNota(""); } }); }} className={`${btn} border-[#FFB547]/50 text-[#FFB547]`}>Avisar</button>
              <button type="button" onClick={() => setAvisando(false)} className="p-1 text-[#6B6B66]" aria-label="Cerrar"><X size={12} /></button>
            </span>
          ) : (
            <button type="button" onClick={() => setAvisando(true)} title="El cliente verá: Necesitamos hablar contigo" className={`${btn} border-[#3A3A36] text-[#A0A09A] hover:text-[#F0F0EC]`}>Hablar con el cliente</button>
          )}
          {s.actual?.manual && (
            <button type="button" disabled={ocupado} onClick={() => void onAccion("deshacer")} className="text-[11px] text-[#6B6B66] hover:text-[#F0F0EC]">Deshacer</button>
          )}
          {s.siguienteManual && (
            <button type="button" disabled={ocupado} onClick={() => void onAccion("siguiente")}
              className={`${btn} border-[#D7FF4F] bg-[#D7FF4F] text-[#10110E] hover:brightness-105`}>
              {ocupado ? <Loader2 size={12} className="animate-spin" /> : null} Siguiente: {s.siguienteManual.titulo}
            </button>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <ol className="grid min-w-[640px] gap-0" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}>
          {s.hitos.map((h, i) => (
            <li key={h.clave} className="flex flex-col gap-1.5">
              <div className="flex items-center">
                <span className={`h-3 w-3 shrink-0 rounded-full transition-colors duration-300 ${h.estado === "hecho" ? "bg-[#56E3A4]" : h.estado === "actual" ? "bg-[#D7FF4F] animate-[sg-pulso_1.8s_ease-out_infinite]" : "border-2 border-[#4A4A45]"}`} />
                {i < total - 1 && <span className={`ml-1 h-0.5 flex-1 transition-colors duration-500 ${h.estado === "hecho" ? "bg-[#56E3A4]" : "bg-[#3A3A36]"}`} />}
              </div>
              <span key={`${h.clave}-${h.estado}`} className={`pr-2 text-[11px] leading-tight ${h.estado === "actual" ? "font-bold text-[#D7FF4F] animate-[sg-destello_900ms_ease-out]" : h.estado === "hecho" ? "text-[#F0F0EC]" : "text-[#6B6B66]"}`}>
                {h.titulo}{h.manual ? " ·" : ""}
              </span>
              <span className="text-[10px] text-[#6B6B66]">{h.fecha ? fechaCorta(h.fecha) : ""}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
