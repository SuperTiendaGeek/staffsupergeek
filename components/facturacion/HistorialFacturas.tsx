"use client";

import { useCallback, useEffect, useRef, useState, Fragment } from "react";
import Link from "next/link";
import { CorregirFacturaModal } from "@/components/facturacion/CorregirFacturaModal";
import { evaluarCorreccion } from "@/lib/facturacion/reglas/correccion";
import type { FacturaHistorial, EstadoFactura, EstadoCorreo, EstadoSincronizacionInventario } from "@/lib/facturacion/airtable/facturas";

// ─── Etiquetas visuales (solo UI, no tocan valores internos) ─────────────────

const ESTADO_LABEL: Record<EstadoFactura, string> = {
  AUTORIZADO:      "Autorizada",
  DEVUELTA:        "Devuelta",
  "NO AUTORIZADO": "No autorizada",
  PENDIENTE:       "En procesamiento",
  RECIBIDA:        "En procesamiento",
  BORRADOR:        "Borrador",
  ANULADA:         "Anulada",
};

const ESTADO_COLOR: Record<EstadoFactura, string> = {
  AUTORIZADO:      "bg-emerald-900/40 text-emerald-300 border-emerald-700/50",
  DEVUELTA:        "bg-red-900/40 text-red-300 border-red-700/50",
  "NO AUTORIZADO": "bg-red-900/40 text-red-300 border-red-700/50",
  PENDIENTE:       "bg-yellow-900/40 text-yellow-300 border-yellow-700/50",
  RECIBIDA:        "bg-yellow-900/40 text-yellow-300 border-yellow-700/50",
  BORRADOR:        "bg-[#2A2A22] text-[#A7A7A7] border-[#3A3A36]",
  ANULADA:         "bg-[#2A2A22] text-[#666] border-[#3A3A36]",
};

const CORREO_LABEL: Record<EstadoCorreo, string> = {
  ENVIADO:    "Enviado",
  ERROR:      "Error",
  NO_ENVIADO: "No enviado",
};
const CORREO_COLOR: Record<EstadoCorreo, string> = {
  ENVIADO:    "text-emerald-400",
  ERROR:      "text-red-400",
  NO_ENVIADO: "text-[#555]",
};

// Estados en los que el SRI todavía no ha dado una respuesta definitiva. En
// estos NUNCA se reenvía el comprobante: ya está en el SRI con su número y su
// clave. Solo se vuelve a consultar.
const ESTADOS_SIN_RESOLVER = new Set(["PENDIENTE", "RECIBIDA", "EN PROCESAMIENTO"]);

const AMBIENTE_COLOR: Record<string, string> = {
  PRUEBAS:    "bg-yellow-900/30 text-yellow-400 border-yellow-700/40",
  PRODUCCIÓN: "bg-blue-900/30 text-blue-300 border-blue-700/40",
};

// Sincronización de inventario (Fase 16 PR3) — N/A es el caso normal de
// mostrador, no se muestra nada especial. PENDIENTE/ERROR sí necesitan
// llamar la atención (proceso interrumpido o fallido).
const SYNC_LABEL: Record<EstadoSincronizacionInventario, string> = {
  "N/A":       "",
  PENDIENTE:   "Sincronización de inventario interrumpida",
  OK:          "Inventario sincronizado",
  ERROR:       "Error al sincronizar inventario",
};
const SYNC_COLOR: Record<EstadoSincronizacionInventario, string> = {
  "N/A":       "",
  PENDIENTE:   "text-yellow-300",
  OK:          "text-emerald-400",
  ERROR:       "text-red-400",
};

// ─── Tipos ────────────────────────────────────────────────────────────────────

type ListadoResponse = {
  facturas: FacturaHistorial[];
  offset?:  string;
  total:    number;
  suma:     number;
};

type Filtros = {
  fechaDesde: string;
  fechaHasta: string;
  cliente:    string;
  numero:     string;
  estado:     string;
  ambiente:   string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const mon  = (n: number) => `$${n.toFixed(2)}`;
const fmt  = (iso: string) => iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—";

// ─── Forma de pago ────────────────────────────────────────────────────────────

const FORMA_PAGO_LABEL: Record<string, string> = {
  "01": "Efectivo",
  "15": "Compensación de deudas",
  "16": "Tarjeta de débito",
  "17": "Dinero electrónico",
  "18": "Tarjeta prepago",
  "19": "Tarjeta de crédito",
  "20": "Otros (sist. financiero)",
  "21": "Endoso de títulos",
};

// ─── Parser de lineasJson (multi-versión) ─────────────────────────────────────
//
// v2  → { version:2, detalles: DetalleFactura[], formaPago?, infoAdicional? }
//        emitidas a partir de esta versión del código
// v1  → { version:1, lineas: LineaDetalle[], formaPago, ... }
//        borradores guardados desde el formulario
// legacy → DetalleFactura[]  (facturas autorizadas antes del v2)

type ItemDisplay = {
  codigo:         string;
  descripcion:    string;
  unidad:         string;
  cantidad:       number;
  precioUnitario: number;
  descuento:      number;
  ivaPct:         number;  // e.g. 15 | 0
  total:          number;  // precioTotalSinImpuesto (sin IVA, igual que SRI)
};

type ParsedLineas = {
  items:          ItemDisplay[];
  formaPago?:     string;  // código SRI "01" | "16" | …
  infoAdicional?: Array<{ nombre: string; valor: string }>;
};

const TARIFA_PCT: Record<string, number> = { "4": 15, "2": 0, "1": 0, "0": 0 };

function mapDetalleSri(d: Record<string, unknown>): ItemDisplay {
  const impuestos = Array.isArray(d.impuestos)
    ? (d.impuestos as Array<{ tarifa?: number }>)
    : [];
  const ivaPct = impuestos[0]?.tarifa ?? 0;
  const cant   = typeof d.cantidad       === "number" ? d.cantidad       : 0;
  const precio = typeof d.precioUnitario === "number" ? d.precioUnitario : 0;
  const desc   = typeof d.descuento      === "number" ? d.descuento      : 0;
  const total  = typeof d.precioTotalSinImpuesto === "number"
    ? d.precioTotalSinImpuesto
    : Math.round((cant * precio - desc) * 100) / 100;
  return {
    codigo:         typeof d.codigoPrincipal === "string" ? d.codigoPrincipal : "",
    descripcion:    typeof d.descripcion     === "string" ? d.descripcion     : "",
    unidad:         typeof d.unidadMedida    === "string" ? d.unidadMedida    : "",
    cantidad:       cant,
    precioUnitario: precio,
    descuento:      desc,
    ivaPct,
    total,
  };
}

function mapLineaDetalle(l: Record<string, unknown>): ItemDisplay {
  const ivaPct = TARIFA_PCT[l.tarifaIva as string] ?? 0;
  const cant   = typeof l.cantidad       === "number" ? l.cantidad       : 0;
  const precio = typeof l.precioUnitario === "number" ? l.precioUnitario : 0;
  const desc   = typeof l.descuento      === "number" ? l.descuento      : 0;
  return {
    codigo:         typeof l.codigoPrincipal === "string" ? l.codigoPrincipal : "",
    descripcion:    typeof l.descripcion     === "string" ? l.descripcion     : "",
    unidad:         typeof l.unidadMedida    === "string" ? l.unidadMedida    : "",
    cantidad:       cant,
    precioUnitario: precio,
    descuento:      desc,
    ivaPct,
    total: Math.round((cant * precio - desc) * 100) / 100,
  };
}

function parsearLineasJson(raw: string): ParsedLineas | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);

    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;

      // v2: factura emitida con payload completo
      if (obj.version === 2 && Array.isArray(obj.detalles)) {
        return {
          items: (obj.detalles as Record<string, unknown>[]).map(mapDetalleSri),
          formaPago: typeof obj.formaPago === "string" ? obj.formaPago : undefined,
          infoAdicional: Array.isArray(obj.infoAdicional)
            ? (obj.infoAdicional as Array<{ nombre: string; valor: string }>)
            : undefined,
        };
      }

      // v1: borrador guardado desde el formulario
      if (obj.version === 1 && Array.isArray(obj.lineas)) {
        return {
          items: (obj.lineas as Record<string, unknown>[]).map(mapLineaDetalle),
          formaPago: typeof obj.formaPago === "string" ? obj.formaPago : undefined,
        };
      }
    }

    // legacy: array bare de DetalleFactura (facturas autorizadas antes del v2)
    if (Array.isArray(parsed)) {
      return { items: (parsed as Record<string, unknown>[]).map(mapDetalleSri) };
    }

    return null;
  } catch {
    return null;
  }
}

function Badge({ cls, text }: { cls: string; text: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {text}
    </span>
  );
}

function SpinnerIcon() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
    </svg>
  );
}

// ─── Panel de detalle ─────────────────────────────────────────────────────────

function DetallePanel({
  factura,
  onClose,
  onRefresh,
}: {
  factura: FacturaHistorial;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [accion, setAccion] = useState<string | null>(null);
  // ¿Está abierto el modal de corrección? La factura ya viene por prop.
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [msg, setMsg]       = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  // El cierre por "clic afuera" solo cuenta si el clic empieza Y termina en
  // el fondo — evita que seleccionar texto en el panel lo cierre al soltar
  // el mouse un pixel fuera de él.
  const [mouseDownEnFondo, setMouseDownEnFondo] = useState(false);

  const ESTADOS_REINTENTABLES = new Set(["PENDIENTE", "RECIBIDA", "DEVUELTA"]);
  const lineasData = parsearLineasJson(factura.lineasJson);

  async function doAccion(url: string, label: string, body?: Record<string, unknown>) {
    setAccion(label); setMsg(null); setErrMsg(null);
    try {
      const r = await fetch(url, body
        ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
        : { method: "POST" });
      const d = await r.json();
      if (d.success) { setMsg(`${label} completado`); onRefresh(); }
      else setErrMsg(d.error ?? "Error desconocido");
    } catch { setErrMsg("Error de red"); }
    finally  { setAccion(null); }
  }

  async function doDelete() {
    if (!confirm("¿Eliminar este borrador? Esta acción no se puede deshacer.")) return;
    setAccion("Eliminando"); setMsg(null); setErrMsg(null);
    try {
      const r = await fetch(`/api/facturacion/historial/${factura.recordId}`, { method: "DELETE" });
      const d = await r.json();
      if (d.success) { onClose(); onRefresh(); }
      else setErrMsg(d.error ?? "Error al eliminar");
    } catch { setErrMsg("Error de red"); }
    finally  { setAccion(null); }
  }

  function Copied({ value }: { value: string }) {
    const [copied, setCopied] = useState(false);
    return (
      <button
        onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
        className="ml-1 rounded border border-[#3A3A36] px-1.5 py-0.5 text-[10px] text-[#A7A7A7] hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F]"
      >
        {copied ? "Copiado" : "Copiar"}
      </button>
    );
  }

  const claveUrl = factura.tieneRide ? `/api/facturacion/ride/${factura.claveAcceso}` : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-end bg-black/60"
      onMouseDown={(e) => setMouseDownEnFondo(e.target === e.currentTarget)}
      onClick={(e) => { if (mouseDownEnFondo && e.target === e.currentTarget) onClose(); }}
    >
      <div className="h-full w-full max-w-xl overflow-y-auto bg-[#1A1A16] border-l border-[#2A2A22] p-6 flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-[#666] mb-0.5">Número de factura</p>
            <p className="text-lg font-bold text-[#F5F5F5]">{factura.numeroFactura || "BORRADOR"}</p>
          </div>
          <button onClick={onClose} className="text-[#666] hover:text-[#F5F5F5] text-xl leading-none">✕</button>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-2">
          <Badge cls={ESTADO_COLOR[factura.estado]}   text={ESTADO_LABEL[factura.estado]} />
          <Badge cls={AMBIENTE_COLOR[factura.ambiente] ?? ""} text={factura.ambiente} />
          <span className={`text-xs ${CORREO_COLOR[factura.estadoCorreo]}`}>
            ✉ Correo: {CORREO_LABEL[factura.estadoCorreo]}
          </span>
        </div>

        {/* Adjuntos pendientes */}
        {factura.estado === "AUTORIZADO" && !factura.tieneXml && (
          <div className="rounded-xl border border-yellow-700/50 bg-yellow-900/20 px-3 py-2.5 flex items-start gap-2">
            <span className="text-yellow-400 text-base leading-none mt-0.5">⚠</span>
            <div>
              <p className="text-sm font-semibold text-yellow-300">Adjuntos pendientes</p>
              <p className="text-xs text-yellow-200/70 mt-0.5">
                XML y/o RIDE no subidos a Airtable. El comprobante autorizado está respaldado en disco.
              </p>
            </div>
          </div>
        )}

        {/* Sincronización de inventario (Fase 16 PR3) — solo facturas del
            gancho con PENDIENTE (proceso interrumpido) o ERROR muestran
            aviso; N/A (mostrador) y OK no necesitan nada aquí. */}
        {(factura.sincronizacionInventario === "PENDIENTE" || factura.sincronizacionInventario === "ERROR") && (
          <div className={`rounded-xl border px-3 py-2.5 flex items-start gap-2 ${
            factura.sincronizacionInventario === "ERROR"
              ? "border-red-700/50 bg-red-900/20"
              : "border-yellow-700/50 bg-yellow-900/20"
          }`}>
            <span className={`text-base leading-none mt-0.5 ${factura.sincronizacionInventario === "ERROR" ? "text-red-400" : "text-yellow-400"}`}>⚠</span>
            <div className="flex-1">
              <p className={`text-sm font-semibold ${SYNC_COLOR[factura.sincronizacionInventario]}`}>
                {SYNC_LABEL[factura.sincronizacionInventario]}
              </p>
              {factura.errorSincronizacion && (
                <p className="text-xs text-red-200/70 mt-0.5 break-words">{factura.errorSincronizacion}</p>
              )}
              <button
                disabled={!!accion}
                onClick={() => doAccion(`/api/facturacion/historial/${factura.recordId}/sincronizar`, "Sincronizar inventario")}
                className="mt-2 rounded-full border border-yellow-700/50 px-3 py-1.5 text-xs text-yellow-300 hover:border-yellow-400 disabled:opacity-40 flex items-center gap-1"
              >
                {accion === "Sincronizar inventario" ? <><SpinnerIcon /> Sincronizando…</> : "↺ Reintentar sincronización"}
              </button>
            </div>
          </div>
        )}

        {/* Datos cliente */}
        <section>
          <p className="text-xs font-semibold text-[#666] uppercase tracking-wider mb-2">Cliente</p>
          <div className="rounded-xl border border-[#2A2A22] bg-[#151510] p-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-[#666]">Nombre</dt>
            <dd className="text-[#F5F5F5]">{factura.clienteNombre}</dd>
            <dt className="text-[#666]">Identificación</dt>
            <dd className="text-[#F5F5F5]">{factura.clienteIdentificacion}</dd>
            {factura.clienteCorreo && <>
              <dt className="text-[#666]">Correo</dt>
              <dd className="text-[#F5F5F5] truncate">{factura.clienteCorreo}</dd>
            </>}
            <dt className="text-[#666]">Fecha emisión</dt>
            <dd className="text-[#F5F5F5]">{fmt(factura.fechaEmision)}</dd>
          </div>
        </section>

        {/* Totales */}
        <section>
          <p className="text-xs font-semibold text-[#666] uppercase tracking-wider mb-2">Totales</p>
          <div className="rounded-xl border border-[#2A2A22] bg-[#151510] p-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-[#666]">Subtotal</dt>
            <dd className="text-[#F5F5F5]">{mon(factura.subtotal)}</dd>
            <dt className="text-[#666]">IVA</dt>
            <dd className="text-[#F5F5F5]">{mon(factura.iva)}</dd>
            <dt className="text-[#666] font-semibold">Total</dt>
            <dd className="text-[#D7FF4F] font-bold">{mon(factura.total)}</dd>
          </div>
        </section>

        {/* Detalle / Ítems */}
        <section>
          <p className="text-xs font-semibold text-[#666] uppercase tracking-wider mb-2">Detalle / Ítems</p>
          {!lineasData ? (
            <p className="text-xs text-[#555] italic px-1">
              Detalle de ítems no disponible (factura emitida antes de esta versión)
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[#2A2A22] bg-[#151510]">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#2A2A22] text-[#555] uppercase tracking-wider">
                    <th className="py-1.5 px-2 text-left font-semibold">Cód.</th>
                    <th className="py-1.5 px-2 text-left font-semibold min-w-[120px]">Descripción</th>
                    <th className="py-1.5 px-2 text-right font-semibold">Cant.</th>
                    <th className="py-1.5 px-2 text-right font-semibold">P.Unit.</th>
                    <th className="py-1.5 px-2 text-right font-semibold">Desc.</th>
                    <th className="py-1.5 px-2 text-center font-semibold">IVA</th>
                    <th className="py-1.5 px-2 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E1E1A]">
                  {lineasData.items.map((item, i) => (
                    <tr key={i}>
                      <td className="py-1.5 px-2 text-[#666] font-mono">{item.codigo || "—"}</td>
                      <td className="py-1.5 px-2 text-[#F5F5F5]">{item.descripcion}</td>
                      <td className="py-1.5 px-2 text-right text-[#A7A7A7]">{item.cantidad}</td>
                      <td className="py-1.5 px-2 text-right text-[#A7A7A7]">${item.precioUnitario.toFixed(2)}</td>
                      <td className="py-1.5 px-2 text-right text-[#A7A7A7]">
                        {item.descuento > 0 ? `-$${item.descuento.toFixed(2)}` : "—"}
                      </td>
                      <td className="py-1.5 px-2 text-center text-[#A7A7A7]">{item.ivaPct}%</td>
                      <td className="py-1.5 px-2 text-right text-[#D7FF4F] font-semibold">${item.total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Forma de pago */}
        {lineasData?.formaPago && (
          <section>
            <p className="text-xs font-semibold text-[#666] uppercase tracking-wider mb-2">Forma de pago</p>
            <div className="rounded-xl border border-[#2A2A22] bg-[#151510] px-3 py-2 text-sm text-[#F5F5F5]">
              {FORMA_PAGO_LABEL[lineasData.formaPago] ?? lineasData.formaPago}
            </div>
          </section>
        )}

        {/* Información adicional (Vendedor, observaciones, etc.) */}
        {lineasData?.infoAdicional && lineasData.infoAdicional.length > 0 && (
          <section>
            <p className="text-xs font-semibold text-[#666] uppercase tracking-wider mb-2">Información adicional</p>
            <div className="rounded-xl border border-[#2A2A22] bg-[#151510] p-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              {lineasData.infoAdicional.map((f, i) => (
                <Fragment key={i}>
                  <dt className="text-[#666]">{f.nombre}</dt>
                  <dd className="text-[#F5F5F5]">{f.valor}</dd>
                </Fragment>
              ))}
            </div>
          </section>
        )}

        {/* Autorización */}
        {factura.numeroAutorizacion && (
          <section>
            <p className="text-xs font-semibold text-[#666] uppercase tracking-wider mb-2">Autorización SRI</p>
            <div className="rounded-xl border border-[#2A2A22] bg-[#151510] p-3 space-y-2 text-sm">
              <div>
                <p className="text-[#666] text-xs mb-0.5">Número de autorización</p>
                <div className="flex items-center gap-1">
                  <p className="text-[#F5F5F5] font-mono text-xs break-all">{factura.numeroAutorizacion}</p>
                  <Copied value={factura.numeroAutorizacion} />
                </div>
              </div>
              <div>
                <p className="text-[#666] text-xs mb-0.5">Clave de acceso</p>
                <div className="flex items-center gap-1">
                  <p className="text-[#F5F5F5] font-mono text-xs break-all">{factura.claveAcceso}</p>
                  <Copied value={factura.claveAcceso} />
                </div>
              </div>
              {factura.fechaAutorizacion && (
                <div>
                  <p className="text-[#666] text-xs mb-0.5">Fecha de autorización</p>
                  <p className="text-[#F5F5F5] text-xs">{factura.fechaAutorizacion.slice(0, 19).replace("T", " ")}</p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Mensajes SRI */}
        {factura.mensajesSri && (
          <section>
            <p className="text-xs font-semibold text-[#666] uppercase tracking-wider mb-2">Respuesta SRI</p>
            <pre className="rounded-xl border border-[#2A2A22] bg-[#151510] p-3 text-xs text-[#A7A7A7] whitespace-pre-wrap break-all overflow-auto max-h-40">
              {factura.mensajesSri}
            </pre>
          </section>
        )}

        {/* Feedback acciones */}
        {msg    && <p className="rounded-lg bg-emerald-900/30 border border-emerald-700/40 px-3 py-2 text-sm text-emerald-300">{msg}</p>}
        {errMsg && <p className="rounded-lg bg-red-900/30 border border-red-700/40 px-3 py-2 text-sm text-red-300">{errMsg}</p>}

        {/* Acciones */}
        <section>
          <p className="text-xs font-semibold text-[#666] uppercase tracking-wider mb-2">Acciones</p>
          <div className="flex flex-wrap gap-2">
            {/* Descargar XML */}
            {factura.tieneXml && (
              <a
                href={`/api/facturacion/xml/${factura.claveAcceso}`}
                download={`${factura.claveAcceso}.xml`}
                className="rounded-full border border-[#3A3A36] px-3 py-1.5 text-xs text-[#A7A7A7] hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F]"
              >
                ↓ XML
              </a>
            )}

            {/* Descargar RIDE */}
            {claveUrl && (
              <a
                href={claveUrl}
                target="_blank"
                rel="noopener"
                className="rounded-full border border-[#3A3A36] px-3 py-1.5 text-xs text-[#A7A7A7] hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F]"
              >
                ↓ RIDE PDF
              </a>
            )}

            {/* Reenviar correo */}
            {factura.estado === "AUTORIZADO" && factura.clienteCorreo && (
              <button
                disabled={!!accion}
                onClick={() => doAccion(`/api/facturacion/historial/${factura.recordId}/reenviar`, "Reenviar correo")}
                className="rounded-full border border-[#3A3A36] px-3 py-1.5 text-xs text-[#A7A7A7] hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F] disabled:opacity-40 flex items-center gap-1"
              >
                {accion === "Reenviar correo" ? <><SpinnerIcon /> Enviando…</> : "✉ Reenviar correo"}
              </button>
            )}

            {/* Nota de crédito (Fase 18) — solo sobre facturas autorizadas
                con líneas guardadas. Las reglas duras (consumidor final,
                plazo, tope acreditable) las evalúa la pantalla destino
                contra el servidor; aquí solo se decide si mostrar el acceso. */}
            {factura.estado === "AUTORIZADO" && factura.lineasJson && (
              <Link
                href={`/facturacion/nota-credito/${factura.recordId}`}
                className="rounded-full border border-[#3A3A36] px-3 py-1.5 text-xs text-[#A7A7A7] hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F]"
              >
                ↩ Nota de crédito
              </Link>
            )}

            {/* Solicitar anulación (Fase 18) — registra la intención de anular
                en el portal SRI. El servidor bloquea consumidor final y fuera
                de plazo. */}
            {factura.estado === "AUTORIZADO" && (
              <button
                disabled={!!accion}
                onClick={() => doAccion(`/api/facturacion/anulaciones/${factura.recordId}`, "Solicitar anulación", { accion: "solicitar" })}
                className="rounded-full border border-[#3A3A36] px-3 py-1.5 text-xs text-[#A7A7A7] hover:border-red-500/60 hover:text-red-300 disabled:opacity-40"
              >
                {accion === "Solicitar anulación" ? "Registrando…" : "⊘ Solicitar anulación"}
              </button>
            )}

            {/* Corregir y reenviar — solo en facturas rechazadas y del mismo
                día. Pasado el día, la clave de acceso (que lleva la fecha
                dentro) ya no sirve y hay que emitir una nueva. */}
            {evaluarCorreccion({
              estado:       factura.estado,
              fechaEmision: new Date(`${factura.fechaEmision}T00:00:00`),
              ahora:        new Date(),
            }).modo === "reenviar-misma" && (
              <button
                disabled={!!accion}
                onClick={() => setCorrigiendo(true)}
                className="rounded-full border border-[#D7FF4F]/60 px-3 py-1.5 text-xs font-bold text-[#D7FF4F] hover:bg-[#D7FF4F]/10 disabled:opacity-40"
              >
                ✎ Corregir y reenviar
              </button>
            )}

            {/* Consultar estado — para las que el SRI todavía no resolvió.
                NO reenvía nada: solo vuelve a preguntar por la misma clave de
                acceso. Reenviar aquí duplicaría un comprobante que ya existe
                en el SRI. */}
            {ESTADOS_SIN_RESOLVER.has(factura.estado) && (
              <button
                disabled={!!accion}
                onClick={() => doAccion(`/api/facturacion/historial/${factura.recordId}/consultar-estado`, "Consultar estado")}
                className="rounded-full border border-sky-700/50 px-3 py-1.5 text-xs text-sky-300 hover:border-sky-400 disabled:opacity-40 flex items-center gap-1"
              >
                {accion === "Consultar estado" ? <><SpinnerIcon /> Consultando al SRI…</> : "⟳ Consultar estado"}
              </button>
            )}

            {/* Reintentar SRI */}
            {ESTADOS_REINTENTABLES.has(factura.estado) && factura.lineasJson && (
              <button
                disabled={!!accion}
                onClick={() => doAccion(`/api/facturacion/historial/${factura.recordId}/reintentar`, "Reintentar")}
                className="rounded-full border border-yellow-700/50 px-3 py-1.5 text-xs text-yellow-300 hover:border-yellow-400 disabled:opacity-40 flex items-center gap-1"
              >
                {accion === "Reintentar" ? <><SpinnerIcon /> Enviando al SRI…</> : "↺ Reintentar al SRI"}
              </button>
            )}

            {/* Abrir borrador */}
            {factura.estado === "BORRADOR" && (
              <Link
                href={`/facturacion/nueva?borrador=${factura.recordId}`}
                className="rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-3 py-1.5 text-xs font-bold text-[#151515] hover:brightness-105"
              >
                ✏ Abrir borrador
              </Link>
            )}

            {/* Eliminar borrador */}
            {factura.estado === "BORRADOR" && (
              <button
                disabled={!!accion}
                onClick={doDelete}
                className="rounded-full border border-red-700/50 px-3 py-1.5 text-xs text-red-400 hover:border-red-400 disabled:opacity-40"
              >
                {accion === "Eliminando" ? <SpinnerIcon /> : "🗑 Eliminar borrador"}
              </button>
            )}
          </div>
        </section>
      </div>

      {/* Corregir y reenviar ESTA misma factura: mismo número, misma clave. */}
      {corrigiendo && (
        <CorregirFacturaModal
          factura={{
            recordId:                  factura.recordId,
            numeroFactura:             factura.numeroFactura,
            claveAcceso:               factura.claveAcceso,
            fechaEmision:              factura.fechaEmision,
            estado:                    factura.estado,
            total:                     factura.total,
            clienteNombre:             factura.clienteNombre,
            clienteIdentificacion:     factura.clienteIdentificacion,
            clienteTipoIdentificacion: factura.clienteTipoIdentificacion,
            clienteCorreo:             factura.clienteCorreo,
            mensajesSri:               factura.mensajesSri,
          }}
          onClose={() => setCorrigiendo(false)}
          onCorregida={() => { setCorrigiendo(false); onRefresh(); }}
        />
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

const EMPTY_FILTROS: Filtros = {
  fechaDesde: "", fechaHasta: "", cliente: "", numero: "", estado: "", ambiente: "",
};

export function HistorialFacturas(
  { esAdmin = false, ambiente = "1" }: { esAdmin?: boolean; ambiente?: "1" | "2" } = {}
) {
  // El ambiente llega del servidor (SRI_AMBIENTE). Antes esta pantalla decía
  // "PRUEBAS" escrito a mano: el día del cutover habría seguido diciéndolo con
  // facturas reales delante — hallazgo M-2 de la auditoría.
  const esProduccion = ambiente === "2";
  const [filtros, setFiltros]     = useState<Filtros>(EMPTY_FILTROS);
  const [aplicados, setAplicados] = useState<Filtros>(EMPTY_FILTROS);
  const [facturas, setFacturas]   = useState<FacturaHistorial[]>([]);
  const [offset, setOffset]       = useState<string | undefined>(undefined);
  const [hayMas, setHayMas]       = useState(false);
  const [suma, setSuma]           = useState(0);
  const [cargando, setCargando]   = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [detalle, setDetalle]     = useState<FacturaHistorial | null>(null);
  const debounceRef               = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cargar = useCallback(async (f: Filtros, append = false, cursor?: string) => {
    setCargando(true); setError(null);
    const params = new URLSearchParams();
    if (f.fechaDesde) params.set("fechaDesde", f.fechaDesde);
    if (f.fechaHasta) params.set("fechaHasta", f.fechaHasta);
    if (f.cliente)    params.set("cliente",    f.cliente.toLowerCase());
    if (f.numero)     params.set("numero",     f.numero);
    if (f.estado)     params.set("estado",     f.estado);
    if (f.ambiente)   params.set("ambiente",   f.ambiente);
    if (cursor)       params.set("offset",     cursor);

    try {
      const r = await fetch(`/api/facturacion/historial?${params}`);
      const d = await r.json() as { success: boolean; data?: { facturas: FacturaHistorial[]; offset?: string; suma: number }; error?: string };
      if (!d.success) { setError(d.error ?? "Error"); return; }
      const { facturas: nuevas, offset: nextOffset, suma: s } = d.data!;
      setFacturas(prev => append ? [...prev, ...nuevas] : nuevas);
      setOffset(nextOffset);
      setHayMas(!!nextOffset);
      if (!append) setSuma(s);
      else setSuma(prev => prev + s);
    } catch { setError("Error de red"); }
    finally  { setCargando(false); }
  }, []);

  // Carga inicial
  useEffect(() => { cargar(EMPTY_FILTROS); }, [cargar]);

  // Búsqueda con debounce para campos de texto
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setAplicados(filtros);
      cargar(filtros);
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [filtros, cargar]);

  function setF(key: keyof Filtros, value: string) {
    setFiltros(prev => ({ ...prev, [key]: value }));
  }

  function limpiar() { setFiltros(EMPTY_FILTROS); }

  function cargarMas() { cargar(aplicados, true, offset); }

  function refreshDetalle() {
    cargar(aplicados);
    if (detalle) {
      // Recargar el registro del detalle
      fetch(`/api/facturacion/historial/${detalle.recordId}`)
        .then(r => r.json())
        .then(d => { if (d.success) setDetalle(d.data); });
    }
  }

  const hayFiltros = Object.values(filtros).some(v => v !== "");
  const totalFiltrado = facturas.reduce((s, f) => s + f.total, 0);

  return (
    <div className="min-h-screen bg-[#151510] text-[#F5F5F5] p-4 md:p-6">
      {/* Cabecera */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#D7FF4F]">Historial de Facturas</h1>
          <p className="text-sm text-[#666] mt-0.5">
            Facturas Electrónicas ·{" "}
            <span className={esProduccion ? "text-[#D7FF4F] font-bold" : "text-yellow-400 font-bold"}>
              {esProduccion ? "PRODUCCIÓN" : "PRUEBAS"}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Solo administrador: cambiar la firma cambia con qué identidad
              tributaria se emite todo. La pantalla vuelve a redirigir si
              alguien llega por URL sin ser admin. */}
          {esAdmin && (
            <Link
              href="/facturacion/firma"
              className="rounded-full border border-[#3A3A36] px-4 py-2 text-sm text-[#A7A7A7] hover:border-[#D7FF4F]/60 hover:text-[#F5F5F5]"
            >
              Firma electrónica
            </Link>
          )}
          <Link
            href="/facturacion/anulaciones"
            className="rounded-full border border-[#3A3A36] px-4 py-2 text-sm text-[#A7A7A7] hover:border-red-500/60 hover:text-red-300"
          >
            Anulaciones
          </Link>
          <Link
            href="/facturacion/nota-credito/historial"
            className="rounded-full border border-[#3A3A36] px-4 py-2 text-sm text-[#A7A7A7] hover:border-[#D7FF4F]/60 hover:text-[#F5F5F5]"
          >
            Notas de crédito
          </Link>
          <Link
            href="/facturacion"
            className="rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-4 py-2 text-sm font-bold text-[#151515] hover:brightness-105"
          >
            + Nueva factura
          </Link>
        </div>
      </div>

      {/* Filtros */}
      <div className="rounded-xl border border-[#2A2A22] bg-[#1A1A16] p-4 mb-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <input
            type="date"
            value={filtros.fechaDesde}
            onChange={e => setF("fechaDesde", e.target.value)}
            placeholder="Desde"
            className="col-span-1 rounded-lg border border-[#2A2A22] bg-[#151510] px-3 py-1.5 text-sm text-[#F5F5F5] placeholder-[#555] focus:border-[#D7FF4F]/50 focus:outline-none"
          />
          <input
            type="date"
            value={filtros.fechaHasta}
            onChange={e => setF("fechaHasta", e.target.value)}
            placeholder="Hasta"
            className="col-span-1 rounded-lg border border-[#2A2A22] bg-[#151510] px-3 py-1.5 text-sm text-[#F5F5F5] placeholder-[#555] focus:border-[#D7FF4F]/50 focus:outline-none"
          />
          <input
            type="text"
            value={filtros.cliente}
            onChange={e => setF("cliente", e.target.value)}
            placeholder="Cliente o cédula…"
            className="col-span-1 rounded-lg border border-[#2A2A22] bg-[#151510] px-3 py-1.5 text-sm text-[#F5F5F5] placeholder-[#555] focus:border-[#D7FF4F]/50 focus:outline-none"
          />
          <input
            type="text"
            value={filtros.numero}
            onChange={e => setF("numero", e.target.value)}
            placeholder="Nº factura…"
            className="col-span-1 rounded-lg border border-[#2A2A22] bg-[#151510] px-3 py-1.5 text-sm text-[#F5F5F5] placeholder-[#555] focus:border-[#D7FF4F]/50 focus:outline-none"
          />
          <select
            value={filtros.estado}
            onChange={e => setF("estado", e.target.value)}
            className="col-span-1 rounded-lg border border-[#2A2A22] bg-[#151510] px-3 py-1.5 text-sm text-[#F5F5F5] focus:border-[#D7FF4F]/50 focus:outline-none"
          >
            <option value="">Todos los estados</option>
            <option value="AUTORIZADO">Autorizada</option>
            <option value="DEVUELTA">Devuelta</option>
            <option value="NO AUTORIZADO">No autorizada</option>
            <option value="PENDIENTE">En procesamiento</option>
            <option value="BORRADOR">Borrador</option>
            <option value="ANULADA">Anulada</option>
          </select>
          <select
            value={filtros.ambiente}
            onChange={e => setF("ambiente", e.target.value)}
            className="col-span-1 rounded-lg border border-[#2A2A22] bg-[#151510] px-3 py-1.5 text-sm text-[#F5F5F5] focus:border-[#D7FF4F]/50 focus:outline-none"
          >
            <option value="">Todos los ambientes</option>
            <option value="PRUEBAS">Pruebas</option>
            <option value="PRODUCCIÓN">Producción</option>
          </select>
        </div>
        {hayFiltros && (
          <button
            onClick={limpiar}
            className="mt-2 text-xs text-[#666] hover:text-[#A7A7A7] underline"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Resumen del periodo */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-xl border border-[#2A2A22] bg-[#1A1A16] p-3">
          <p className="text-xs text-[#666]">Facturas en pantalla</p>
          <p className="text-2xl font-bold text-[#F5F5F5]">{facturas.length}</p>
        </div>
        <div className="rounded-xl border border-[#2A2A22] bg-[#1A1A16] p-3">
          <p className="text-xs text-[#666]">Total facturado</p>
          <p className="text-2xl font-bold text-[#D7FF4F]">{mon(totalFiltrado)}</p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-700/40 bg-red-900/20 px-4 py-3 text-sm text-red-300 mb-4">
          {error}
        </div>
      )}

      {/* Tabla */}
      <div className="rounded-xl border border-[#2A2A22] bg-[#1A1A16] overflow-hidden">
        {/* Header tabla */}
        <div className="hidden md:grid grid-cols-[1fr_2fr_1.5fr_80px_auto_auto_80px] gap-3 px-4 py-2 border-b border-[#2A2A22] text-xs font-semibold text-[#555] uppercase tracking-wider">
          <span>Fecha</span>
          <span>Número</span>
          <span>Cliente</span>
          <span className="text-right">Total</span>
          <span>Estado SRI</span>
          <span>Correo</span>
          <span>Ambiente</span>
        </div>

        {cargando && facturas.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-[#555]">
            <SpinnerIcon />
            <span className="ml-2 text-sm">Cargando facturas…</span>
          </div>
        ) : facturas.length === 0 ? (
          <div className="py-16 text-center text-sm text-[#555]">
            {hayFiltros ? "No hay facturas que coincidan con los filtros." : "Aún no hay facturas registradas."}
          </div>
        ) : (
          facturas.map((f) => (
            <button
              key={f.recordId}
              onClick={() => setDetalle(f)}
              className="w-full text-left md:grid grid-cols-[1fr_2fr_1.5fr_80px_auto_auto_80px] gap-3 px-4 py-3 border-b border-[#2A2A22] last:border-0 hover:bg-[#1F1F1A] transition-colors group"
            >
              {/* Mobile layout */}
              <div className="md:hidden flex justify-between items-start mb-1">
                <span className="text-sm font-mono text-[#A7A7A7]">{f.numeroFactura || "BORRADOR"}</span>
                <span className="flex items-center gap-1">
                  {(f.sincronizacionInventario === "PENDIENTE" || f.sincronizacionInventario === "ERROR") && (
                    <span title={SYNC_LABEL[f.sincronizacionInventario]} className={SYNC_COLOR[f.sincronizacionInventario]}>⚠</span>
                  )}
                  <Badge cls={ESTADO_COLOR[f.estado]} text={ESTADO_LABEL[f.estado]} />
                </span>
              </div>
              <div className="md:hidden flex justify-between items-center">
                <span className="text-xs text-[#666]">{f.clienteNombre} · {fmt(f.fechaEmision)}</span>
                <span className="text-sm font-bold text-[#D7FF4F]">{mon(f.total)}</span>
              </div>

              {/* Desktop layout */}
              <span className="hidden md:block text-sm text-[#A7A7A7]">{fmt(f.fechaEmision)}</span>
              <span className="hidden md:block text-sm font-mono text-[#F5F5F5] group-hover:text-[#D7FF4F]">{f.numeroFactura || <em className="text-[#555] not-italic">borrador</em>}</span>
              <span className="hidden md:block text-sm text-[#A7A7A7] truncate">{f.clienteNombre}</span>
              <span className="hidden md:block text-sm font-bold text-[#D7FF4F] text-right">{mon(f.total)}</span>
              <span className="hidden md:flex items-center gap-1.5">
                <Badge cls={ESTADO_COLOR[f.estado]} text={ESTADO_LABEL[f.estado]} />
                {(f.sincronizacionInventario === "PENDIENTE" || f.sincronizacionInventario === "ERROR") && (
                  <span title={SYNC_LABEL[f.sincronizacionInventario]} className={SYNC_COLOR[f.sincronizacionInventario]}>⚠</span>
                )}
              </span>
              <span className={`hidden md:block text-xs ${CORREO_COLOR[f.estadoCorreo]}`}>
                {CORREO_LABEL[f.estadoCorreo]}
              </span>
              <span className="hidden md:flex items-center">
                <Badge cls={AMBIENTE_COLOR[f.ambiente] ?? ""} text={f.ambiente} />
              </span>
            </button>
          ))
        )}

        {/* Cargar más */}
        {hayMas && (
          <div className="px-4 py-3 border-t border-[#2A2A22]">
            <button
              onClick={cargarMas}
              disabled={cargando}
              className="text-xs text-[#666] hover:text-[#A7A7A7] disabled:opacity-40 flex items-center gap-1"
            >
              {cargando ? <><SpinnerIcon /> Cargando…</> : "Cargar más →"}
            </button>
          </div>
        )}
      </div>

      {/* Panel de detalle */}
      {detalle && (
        <DetallePanel
          factura={detalle}
          onClose={() => setDetalle(null)}
          onRefresh={refreshDetalle}
        />
      )}

    </div>
  );
}
