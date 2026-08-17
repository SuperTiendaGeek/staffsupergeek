"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Wrench, DollarSign, Phone, Mail, Package, CheckCircle, Circle, XCircle, ExternalLink, Plus, Pencil, Star, StarOff, Trash2, AlertTriangle, ChevronLeft, ChevronRight, RotateCcw, Box, MessageCircle } from "lucide-react";
import type { OperacionDetalle, OpcionDetalle, AbonoDetalle, AirtableAttachment } from "@/types/operaciones";
import { ESTADOS_TABLERO, ESTADOS_OPERACION } from "@/types/operaciones";
import type { CuentaUnificada } from "@/types/cuenta-unificada";
import { CuentaUnificadaPanel } from "@/components/cuenta-unificada/CuentaUnificadaPanel";
import { RegistrarAbonoModal } from "./RegistrarAbonoModal";
import { VincularOrdenModal } from "./VincularOrdenModal";
import { OpcionModal } from "./OpcionModal";
import {
  construirMensajeOpcionCotizada,
  construirMensajeOpcionesCotizadas,
  construirUrlWhatsApp,
} from "@/lib/operaciones/whatsappCotizacion";

const ESTADO_COLOR: Record<string, string> = {
  Requerimiento: "#D7FF4F",
  Cotizado: "#78B7FF",
  Aprobado: "#F0C75E",
  Pedido: "#4FD1C5",
  Entregado: "#56E3A4",
  Rechazado: "#FF5A4F",
};

const ESTADO_OPCION_COLOR: Record<string, string> = {
  Disponible: "#78B7FF",
  "Ofrecida al cliente": "#D7FF4F",
  Seleccionada: "#56E3A4",
  Descartada: "#6B7280",
  "No Disponible": "#FF5A4F",
};

function fmt(n: number | null): string {
  if (n === null) return "—";
  return n.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function thumbnailUrl(att: AirtableAttachment): string {
  const t = att.thumbnails as { large?: { url?: string } } | undefined;
  return t?.large?.url ?? att.url;
}

// ── Estado Pipeline ─────────────────────────────────────────────────────────

function EstadoPipeline({ estado }: { estado: string }) {
  const isRechazado = estado === "Rechazado";
  const currentIndex = isRechazado ? -1 : ESTADOS_TABLERO.indexOf(estado as typeof ESTADOS_TABLERO[number]);

  return (
    <div className="flex flex-col gap-2">
      {isRechazado && (
        <div
          className="w-fit rounded-full border px-3 py-1 text-xs font-semibold"
          style={{ borderColor: "#FF5A4F44", background: "#FF5A4F11", color: "#FF5A4F" }}
        >
          Rechazado
        </div>
      )}
      <div className="flex items-center gap-0 overflow-x-auto">
        {ESTADOS_TABLERO.map((e, i) => {
          const isPast = !isRechazado && i < currentIndex;
          const isCurrent = !isRechazado && i === currentIndex;
          const isFuture = isRechazado || i > currentIndex;
          const color = isCurrent ? (ESTADO_COLOR[e] ?? "#8A8A80") : isPast ? "#56E3A4" : "#3A3A36";

          return (
            <div key={e} className="flex items-center">
              <div className="flex flex-col items-center gap-1">
                {isPast ? (
                  <CheckCircle size={16} style={{ color: "#56E3A4" }} />
                ) : isCurrent ? (
                  <Circle size={16} fill={color} style={{ color }} />
                ) : (
                  <Circle size={16} style={{ color: "#3A3A36" }} />
                )}
                <span
                  className="whitespace-nowrap text-[10px] font-medium"
                  style={{ color: isFuture ? "#4A4A46" : isCurrent ? color : "#56E3A4" }}
                >
                  {e}
                </span>
              </div>
              {i < ESTADOS_TABLERO.length - 1 && (
                <div
                  className="mb-4 h-px w-6 flex-none sm:w-10"
                  style={{ background: isPast ? "#56E3A430" : "#2A2A26" }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Cambiar Estado ───────────────────────────────────────────────────────────

type CambiarEstadoBarProps = {
  operacionId: string;
  estado: string;
  opcionElegidaId: string | null;
  onSuccess: () => void;
};

function CambiarEstadoBar({ operacionId, estado, opcionElegidaId, onSuccess }: CambiarEstadoBarProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showReactivar, setShowReactivar] = useState(false);

  const isRechazado = estado === "Rechazado";
  const currentIdx = ESTADOS_TABLERO.indexOf(estado as (typeof ESTADOS_TABLERO)[number]);
  const prevEstado = !isRechazado && currentIdx > 0 ? ESTADOS_TABLERO[currentIdx - 1] : null;
  const nextEstado = !isRechazado && currentIdx >= 0 && currentIdx < ESTADOS_TABLERO.length - 1
    ? ESTADOS_TABLERO[currentIdx + 1]
    : null;
  const nextIsAprobado = nextEstado === "Aprobado";
  const canAdvance = !!nextEstado && !(nextIsAprobado && !opcionElegidaId);

  async function cambiarEstado(nuevoEstado: string) {
    if (nuevoEstado === "Aprobado" && !opcionElegidaId) {
      setError("Selecciona una Opción Elegida antes de pasar a Aprobado.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/operaciones/${operacionId}/estado`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: nuevoEstado }),
      });
      const d = (await res.json()) as { success: boolean; error?: string };
      if (!res.ok || !d.success) { setError(d.error ?? "Error al cambiar estado."); return; }
      setShowReactivar(false);
      onSuccess();
    } catch {
      setError("Error de conexión.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-2 border-t border-[#3A3A36] pt-4">
      {error && (
        <div className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          <AlertTriangle size={12} /> {error}
        </div>
      )}

      {isRechazado ? (
        /* Reactivar desde Rechazado */
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[#6B6B66]">Operación rechazada.</span>
          {!showReactivar ? (
            <button
              type="button"
              onClick={() => setShowReactivar(true)}
              disabled={loading}
              className="inline-flex items-center gap-1 text-xs text-[#78B7FF] transition hover:underline disabled:opacity-50"
            >
              <RotateCcw size={11} /> Reactivar
            </button>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {ESTADOS_TABLERO.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => cambiarEstado(e)}
                  disabled={loading}
                  className="rounded-full border border-[#3A3A36] px-2.5 py-1 text-xs text-[#C0C0BC] transition hover:border-[#78B7FF]/50 hover:text-[#78B7FF] disabled:opacity-40"
                >
                  {e}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowReactivar(false)}
                className="text-xs text-[#4A4A46] transition hover:text-[#6B6B66]"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Flujo normal */
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {prevEstado ? (
              <button
                type="button"
                onClick={() => cambiarEstado(prevEstado)}
                disabled={loading}
                className="inline-flex items-center gap-1 rounded-full border border-[#3A3A36] px-3 py-1.5 text-xs text-[#8A8A80] transition hover:border-[#5A5A56] hover:text-[#F0F0EC] disabled:opacity-40"
              >
                <ChevronLeft size={12} /> {prevEstado}
              </button>
            ) : (
              <div className="h-7 w-1" />
            )}
          </div>

          <div className="flex items-center gap-2">
            {nextIsAprobado && !opcionElegidaId && (
              <span className="text-[11px] text-amber-400">⚠ Elige una opción primero</span>
            )}
            {nextEstado && (
              <button
                type="button"
                onClick={() => cambiarEstado(nextEstado)}
                disabled={loading || !canAdvance}
                className="inline-flex items-center gap-1 rounded-full border border-[#D7FF4F] bg-[#D7FF4F]/10 px-3 py-1.5 text-xs font-semibold text-[#D7FF4F] transition hover:bg-[#D7FF4F]/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? (
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#D7FF4F]/30 border-t-[#D7FF4F]" />
                ) : (
                  <>{nextEstado} <ChevronRight size={12} /></>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Marcar rechazado — solo en flujo activo y si no es el último */}
      {!isRechazado && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => cambiarEstado("Rechazado")}
            disabled={loading}
            className="text-[11px] text-[#4A4A46] transition hover:text-[#FF5A4F] disabled:opacity-40"
          >
            Marcar como rechazado
          </button>
        </div>
      )}
    </div>
  );
}

// ── Opción Card ──────────────────────────────────────────────────────────────

type OpcionCardProps = {
  opcion: OpcionDetalle;
  opcionElegidaId: string | null;
  whatsappUrl: string | null;
  onEditar: (op: OpcionDetalle) => void;
  onElegir: (opcionId: string) => Promise<void>;
  onQuitarElegida: () => Promise<void>;
};

function OpcionCard({ opcion, opcionElegidaId, whatsappUrl, onEditar, onElegir, onQuitarElegida }: OpcionCardProps) {
  const [actioning, setActioning] = useState(false);
  const estadoColor = ESTADO_OPCION_COLOR[opcion.estadoOpcion] ?? "#6B7280";

  async function handleElegir() {
    setActioning(true);
    try { await onElegir(opcion.id); } finally { setActioning(false); }
  }
  async function handleQuitar() {
    setActioning(true);
    try { await onQuitarElegida(); } finally { setActioning(false); }
  }

  return (
    <div
      className={`flex min-w-[280px] max-w-[320px] flex-none flex-col gap-3 rounded-xl border p-4 ${
        opcion.esElegida ? "border-[#56E3A4]/40 bg-[#56E3A4]/5" : "border-[#3A3A36] bg-[#1A1B18]"
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          {opcion.esElegida && (
            <span className="w-fit rounded-full bg-[#56E3A4]/15 px-2 py-0.5 text-[10px] font-bold text-[#56E3A4]">
              OPCIÓN ELEGIDA
            </span>
          )}
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-medium w-fit"
            style={{ background: `${estadoColor}18`, color: estadoColor }}
          >
            {opcion.estadoOpcion}
          </span>
        </div>
        {opcion.proveedorNombre && (
          <span className="shrink-0 text-xs font-medium text-[#8A8A80]">{opcion.proveedorNombre}</span>
        )}
      </div>

      {/* Product description */}
      <p className="text-sm font-medium leading-snug text-[#F0F0EC]">{opcion.productoDescripcion}</p>

      {/* Timing */}
      {opcion.tiempoEstimado && (
        <p className="text-xs text-[#6B6B66]">Entrega estimada: {opcion.tiempoEstimado}</p>
      )}

      {/* Pricing */}
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-[#252622] px-3 py-2 text-center">
        <div>
          <p className="text-[10px] text-[#6B6B66]">Costo</p>
          <p className="text-xs font-semibold text-[#F0F0EC]">${fmt(opcion.costoRealTotal ?? opcion.costoProveedor)}</p>
        </div>
        <div>
          <p className="text-[10px] text-[#6B6B66]">Precio</p>
          <p className="text-xs font-bold text-[#D7FF4F]">${fmt(opcion.precioVentaCliente)}</p>
        </div>
        <div>
          <p className="text-[10px] text-[#6B6B66]">Margen</p>
          <p className="text-xs font-semibold text-[#56E3A4]">${fmt(opcion.gananciaEstimada)}</p>
        </div>
      </div>

      {/* Fotos */}
      {opcion.fotos.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto">
          {opcion.fotos.slice(0, 4).map((foto, i) => (
            <a
              key={foto.id ?? i}
              href={foto.url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 overflow-hidden rounded-md border border-[#3A3A36]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumbnailUrl(foto)}
                alt={foto.filename ?? `Foto ${i + 1}`}
                className="h-14 w-14 object-cover"
              />
            </a>
          ))}
          {opcion.fotos.length > 4 && (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-[#3A3A36] bg-[#252622] text-xs text-[#6B6B66]">
              +{opcion.fotos.length - 4}
            </div>
          )}
        </div>
      )}

      {/* Nota para cliente */}
      {opcion.notaParaCliente && (
        <div className="rounded-lg bg-[#D7FF4F]/5 px-3 py-2">
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#D7FF4F]/60">Para el cliente</p>
          <p className="whitespace-pre-wrap text-xs text-[#D7FF4F]/90">{opcion.notaParaCliente}</p>
        </div>
      )}

      {/* Nota interna */}
      {opcion.notaInterna && (
        <div className="rounded-lg bg-[#78B7FF]/5 px-3 py-2">
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#78B7FF]/60">Nota interna</p>
          <p className="whitespace-pre-wrap text-xs italic text-[#78B7FF]/80">{opcion.notaInterna}</p>
        </div>
      )}

      {/* URL proveedor */}
      {opcion.urlProveedor && (
        <a
          href={opcion.urlProveedor}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-[#6B6B66] underline-offset-2 hover:text-[#8A8A80] hover:underline"
        >
          <ExternalLink size={11} />
          Ver en proveedor
        </a>
      )}

      {/* Actions */}
      <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-[#3A3A36] pt-3">
        {whatsappUrl ? (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-full border border-[#25D366]/40 bg-[#25D366]/5 px-2.5 py-1 text-[11px] font-medium text-[#56E3A4] transition hover:border-[#25D366]/70 hover:bg-[#25D366]/10"
            title="Enviar esta opción por WhatsApp"
          >
            <MessageCircle size={10} /> WhatsApp
          </a>
        ) : (
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-1 rounded-full border border-[#3A3A36] px-2.5 py-1 text-[11px] font-medium text-[#6B6B66] opacity-50"
            title="Agrega un teléfono al cliente para enviar por WhatsApp"
          >
            <MessageCircle size={10} /> WhatsApp
          </button>
        )}
        <button
          type="button"
          onClick={() => onEditar(opcion)}
          disabled={actioning}
          className="inline-flex items-center gap-1 rounded-full border border-[#3A3A36] px-2.5 py-1 text-[11px] font-medium text-[#8A8A80] transition hover:border-[#5A5A56] hover:text-[#F0F0EC] disabled:opacity-40"
        >
          <Pencil size={10} /> Editar
        </button>
        {opcion.id === opcionElegidaId ? (
          <button
            type="button"
            onClick={handleQuitar}
            disabled={actioning}
            className="inline-flex items-center gap-1 rounded-full border border-[#FF5A4F]/40 px-2.5 py-1 text-[11px] font-medium text-[#FF5A4F] transition hover:border-[#FF5A4F]/70 disabled:opacity-40"
          >
            <StarOff size={10} /> Quitar elegida
          </button>
        ) : (
          <button
            type="button"
            onClick={handleElegir}
            disabled={actioning}
            className="inline-flex items-center gap-1 rounded-full border border-[#56E3A4]/40 px-2.5 py-1 text-[11px] font-medium text-[#56E3A4] transition hover:border-[#56E3A4]/70 disabled:opacity-40"
          >
            <Star size={10} /> Elegir
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

type Props = {
  operacion: OperacionDetalle;
  cuentaUnificada: CuentaUnificada | null;
};

export function OperacionDetalleClient({ operacion, cuentaUnificada }: Props) {
  const router = useRouter();
  const [abonoModalOpen, setAbonoModalOpen] = useState(false);
  const [vincularModalOpen, setVincularModalOpen] = useState(false);
  const [desvinculandoOrden, setDesvinculandoOrden] = useState(false);
  const [confirmarDesvincular, setConfirmarDesvincular] = useState(false);
  const [opcionModalOpen, setOpcionModalOpen] = useState(false);
  const [opcionEditing, setOpcionEditing] = useState<OpcionDetalle | null>(null);
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [accionError, setAccionError] = useState("");

  const estadoColor = ESTADO_COLOR[operacion.estado] ?? "#8A8A80";
  const whatsappTodasUrl = operacion.opciones.length > 0
    ? construirUrlWhatsApp(
        operacion.clienteTelefono,
        construirMensajeOpcionesCotizadas({ operacion, opciones: operacion.opciones })
      )
    : null;

  function handleAbonoSuccess() {
    setAbonoModalOpen(false);
    router.refresh();
  }

  function handleVincularSuccess() {
    setVincularModalOpen(false);
    router.refresh();
  }

  async function handleDesvincular() {
    setDesvinculandoOrden(true);
    try {
      const res = await fetch(`/api/operaciones/${operacion.id}/orden`, { method: "DELETE" });
      if (res.ok) { setConfirmarDesvincular(false); router.refresh(); }
    } finally {
      setDesvinculandoOrden(false);
    }
  }

  function handleEstadoSuccess() {
    router.refresh();
  }

  function handleOpcionSuccess() {
    setOpcionModalOpen(false);
    setOpcionEditing(null);
    router.refresh();
  }

  async function handleElegir(opcionId: string) {
    await fetch(`/api/operaciones/${operacion.id}/opcion-elegida`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opcionId }),
    });
    router.refresh();
  }

  async function handleQuitarElegida() {
    await fetch(`/api/operaciones/${operacion.id}/opcion-elegida`, { method: "DELETE" });
    router.refresh();
  }

  async function handleEliminar() {
    setEliminando(true);
    setAccionError("");
    try {
      const res = await fetch(`/api/operaciones/${operacion.id}`, { method: "DELETE" });
      const d = (await res.json()) as { success: boolean; error?: string };
      if (!res.ok || !d.success) { setAccionError(d.error ?? "Error al eliminar."); return; }
      router.push("/operaciones");
    } catch {
      setAccionError("Error de conexión.");
    } finally {
      setEliminando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Back link */}
      <Link
        href="/operaciones"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-[#8A8A80] transition hover:text-[#F0F0EC]"
      >
        <ArrowLeft size={14} />
        Operaciones Comerciales
      </Link>

      {/* Header card */}
      <div className="rounded-xl border border-[#3A3A36] bg-[#1E1F1C] p-4 sm:p-5">
        <div className="flex flex-wrap items-start gap-2 mb-3">
          <span className="font-mono text-sm font-bold text-[#F0F0EC]">{operacion.codigo}</span>
          {operacion.categoria && (
            <span className="rounded-full bg-[#3A3A36]/60 px-2 py-0.5 text-[10px] text-[#8A8A80]">
              {operacion.categoria}
            </span>
          )}
          <span
            className="rounded-full border px-2 py-0.5 text-[10px] font-semibold ml-auto"
            style={{ borderColor: `${estadoColor}44`, background: `${estadoColor}11`, color: estadoColor }}
          >
            {operacion.estado}
          </span>
        </div>

        <h2 className="mb-4 text-lg font-semibold text-[#F5F5F5] sm:text-xl">
          {operacion.productoSolicitado}
        </h2>

        <EstadoPipeline estado={operacion.estado} />
        <CambiarEstadoBar
          operacionId={operacion.id}
          estado={operacion.estado}
          opcionElegidaId={operacion.opcionElegidaId}
          onSuccess={handleEstadoSuccess}
        />

        {/* Client & flags */}
        <div className="mt-4 flex flex-wrap gap-4 border-t border-[#3A3A36] pt-4">
          <div className="flex flex-col gap-1">
            <p className="text-[10px] uppercase tracking-wide text-[#4A4A46]">Cliente</p>
            <p className="text-sm font-medium text-[#F0F0EC]">{operacion.clienteNombre || "—"}</p>
            {operacion.clienteCedula && (
              <p className="text-xs text-[#6B6B66]">CI {operacion.clienteCedula}</p>
            )}
          </div>
          {operacion.clienteTelefono && (
            <div className="flex flex-col gap-1">
              <p className="text-[10px] uppercase tracking-wide text-[#4A4A46]">Teléfono</p>
              <a
                href={`tel:${operacion.clienteTelefono}`}
                className="inline-flex items-center gap-1 text-sm text-[#78B7FF] hover:underline"
              >
                <Phone size={12} />
                {operacion.clienteTelefono}
              </a>
            </div>
          )}
          {operacion.clienteCorreo && (
            <div className="flex flex-col gap-1">
              <p className="text-[10px] uppercase tracking-wide text-[#4A4A46]">Correo</p>
              <a
                href={`mailto:${operacion.clienteCorreo}`}
                className="inline-flex items-center gap-1 text-sm text-[#78B7FF] hover:underline"
              >
                <Mail size={12} />
                {operacion.clienteCorreo}
              </a>
            </div>
          )}
          <div className="flex flex-wrap gap-2 sm:ml-auto sm:items-end">
            {operacion.requiereInstalacion && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#78B7FF]/10 px-2 py-0.5 text-[10px] font-medium text-[#78B7FF]">
                <Wrench size={10} /> Requiere instalación
              </span>
            )}
            {operacion.equipoEnTienda && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#56E3A4]/10 px-2 py-0.5 text-[10px] font-medium text-[#56E3A4]">
                <Package size={10} /> Equipo en tienda
              </span>
            )}
          </div>
        </div>

        {/* Description */}
        {operacion.descripcionRequerimiento && (
          <div className="mt-3 rounded-lg bg-[#252622] px-3 py-2.5">
            <p className="mb-1 text-[10px] uppercase tracking-wide text-[#4A4A46]">Descripción del requerimiento</p>
            <p className="whitespace-pre-wrap text-sm text-[#C0C0BC]">{operacion.descripcionRequerimiento}</p>
          </div>
        )}
      </div>

      {/* Opciones */}
      <section className="rounded-xl border border-[#3A3A36] bg-[#1E1F1C] p-4 sm:p-5">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-semibold text-[#F0F0EC]">
            Opciones cotizadas{" "}
            {operacion.opciones.length > 0 && (
              <span className="font-normal text-[#6B6B66]">({operacion.opciones.length})</span>
            )}
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            {operacion.opciones.length > 0 && (
              whatsappTodasUrl ? (
                <a
                  href={whatsappTodasUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-full border border-[#25D366]/40 bg-[#25D366]/5 px-3 py-1.5 text-xs font-medium text-[#56E3A4] transition hover:border-[#25D366]/70 hover:bg-[#25D366]/10"
                  title="Enviar todas las opciones por WhatsApp"
                >
                  <MessageCircle size={11} /> Enviar todas
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="inline-flex items-center gap-1 rounded-full border border-[#3A3A36] px-3 py-1.5 text-xs font-medium text-[#6B6B66] opacity-50"
                  title="Agrega un teléfono al cliente para enviar por WhatsApp"
                >
                  <MessageCircle size={11} /> Enviar todas
                </button>
              )
            )}
            <button
              type="button"
              onClick={() => { setOpcionEditing(null); setOpcionModalOpen(true); }}
              className="inline-flex items-center gap-1 rounded-full border border-[#D7FF4F]/40 bg-[#D7FF4F]/5 px-3 py-1.5 text-xs font-medium text-[#D7FF4F] transition hover:border-[#D7FF4F]/70 hover:bg-[#D7FF4F]/10"
            >
              <Plus size={11} /> Agregar opción
            </button>
          </div>
        </div>
        {operacion.opciones.length > 0 ? (
          <div className="overflow-x-auto pb-2">
            <div className="flex gap-3">
              {operacion.opciones.map((op) => (
                <OpcionCard
                  key={op.id}
                  opcion={op}
                  opcionElegidaId={operacion.opcionElegidaId}
                  whatsappUrl={construirUrlWhatsApp(
                    operacion.clienteTelefono,
                    construirMensajeOpcionCotizada({ operacion, opcion: op })
                  )}
                  onEditar={(o) => { setOpcionEditing(o); setOpcionModalOpen(true); }}
                  onElegir={handleElegir}
                  onQuitarElegida={handleQuitarElegida}
                />
              ))}
            </div>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-[#3A3A36]/50 px-4 py-4 text-center text-sm text-[#4A4A46]">
            Sin opciones cotizadas aún
          </p>
        )}
      </section>

      {/* Artículos físicos en inventario. Son varios cuando la operación
          generó más de un artículo; antes solo se veía el primero. */}
      {operacion.articulosFisicos.length > 0 && (
        <section className="rounded-xl border border-[#56E3A4]/25 bg-[#56E3A4]/5 p-4 sm:p-5">
          <div className="mb-2 flex items-center gap-1.5">
            <Box size={13} className="text-[#56E3A4]" />
            <h3 className="text-sm font-semibold text-[#56E3A4]">
              {operacion.articulosFisicos.length === 1
                ? "Artículo en inventario"
                : `Artículos en inventario (${operacion.articulosFisicos.length})`}
            </h3>
          </div>
          <div className="flex flex-col gap-3">
            {operacion.articulosFisicos.map((articulo) => (
              <div key={articulo.id} className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <p className="text-sm font-medium text-[#F0F0EC]">{articulo.nombre}</p>
                  <span className="w-fit rounded-full bg-[#56E3A4]/15 px-2 py-0.5 text-[11px] font-medium text-[#56E3A4]">
                    {articulo.estadoItem}
                  </span>
                </div>
                <Link
                  href={`/shipping-v2/items/${articulo.id}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#56E3A4]/30 bg-[#56E3A4]/10 px-3 py-1.5 text-xs font-medium text-[#56E3A4] transition hover:border-[#56E3A4]/60 hover:bg-[#56E3A4]/20"
                >
                  Ver en Shipping <ExternalLink size={11} />
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Orden vinculada */}
      {operacion.ordenVinculada ? (
        <section className="rounded-xl border border-[#3A3A36] bg-[#1E1F1C] p-4 sm:p-5">
          <h3 className="mb-3 text-sm font-semibold text-[#F0F0EC]">Orden de reparación vinculada</h3>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/tecnicos/ordenes/${operacion.ordenVinculada.id}`}
              className="inline-flex items-center gap-2 rounded-lg border border-[#78B7FF]/30 bg-[#78B7FF]/5 px-4 py-3 text-sm font-medium text-[#78B7FF] transition hover:border-[#78B7FF]/50 hover:bg-[#78B7FF]/10"
            >
              <Wrench size={14} />
              {operacion.ordenVinculada.codigoOrden}
              <ExternalLink size={12} className="ml-auto opacity-60" />
            </Link>

            {/* Desvincular */}
            {!confirmarDesvincular ? (
              <button
                type="button"
                onClick={() => setConfirmarDesvincular(true)}
                className="text-xs text-[#4A4A46] underline-offset-2 transition hover:text-[#FF5A4F] hover:underline"
              >
                Desvincular
              </button>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-[#FF5A4F]/30 bg-[#FF5A4F]/5 px-3 py-1.5">
                <span className="text-xs text-[#FF5A4F]">¿Confirmar?</span>
                <button
                  type="button"
                  onClick={handleDesvincular}
                  disabled={desvinculandoOrden}
                  className="text-xs font-semibold text-[#FF5A4F] transition hover:brightness-110 disabled:opacity-50"
                >
                  {desvinculandoOrden ? "Desvinculando…" : "Sí, desvincular"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmarDesvincular(false)}
                  disabled={desvinculandoOrden}
                  className="text-xs text-[#6B6B66] transition hover:text-[#8A8A80]"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
          {operacion.codigoPedido && (
            <p className="mt-2 text-xs text-[#6B6B66]">Código de pedido: {operacion.codigoPedido}</p>
          )}
          {operacion.estadoInstalacion && (
            <p className="mt-1 text-xs text-[#6B6B66]">Estado instalación: {operacion.estadoInstalacion}</p>
          )}
        </section>
      ) : operacion.clienteId && (
        <section className="rounded-xl border border-dashed border-[#3A3A36] bg-[#1E1F1C] p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-[#6B6B66]">Sin orden de reparación vinculada</p>
            <button
              type="button"
              onClick={() => setVincularModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#78B7FF]/40 bg-[#78B7FF]/5 px-3 py-1.5 text-xs font-medium text-[#78B7FF] transition hover:border-[#78B7FF]/60 hover:bg-[#78B7FF]/10"
            >
              <Wrench size={11} />
              Vincular orden
            </button>
          </div>
        </section>
      )}

      {/* Cuenta del cliente — cuenta unificada (Fase 11 etapa 3): una sola
          fuente para el total/abonado/saldo, en vez del rollup de la
          Operación (que no sabe de la Orden vinculada) ni del recálculo en
          JS que excluía anulados por su cuenta. */}
      <section className="rounded-xl border border-[#3A3A36] bg-[#1E1F1C] p-4 sm:p-5">
        <h3 className="mb-4 text-sm font-semibold text-[#F0F0EC]">Cuenta del cliente</h3>

        {cuentaUnificada ? (
          <div className="mb-4">
            <CuentaUnificadaPanel cuenta={cuentaUnificada} origenTipo="operacion" />
          </div>
        ) : (
          <p className="mb-4 rounded-lg border border-dashed border-[#3A3A36]/50 px-4 py-4 text-center text-sm text-[#4A4A46]">
            No se pudo cargar la cuenta unificada.
          </p>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setAbonoModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#D7FF4F] bg-[#D7FF4F]/10 px-4 py-2 text-sm font-medium text-[#D7FF4F] transition hover:bg-[#D7FF4F]/20"
          >
            <DollarSign size={13} />
            Registrar abono
          </button>
          <button
            disabled
            className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-full border border-[#3A3A36] px-4 py-2 text-sm text-[#6B6B66]/60 opacity-60"
            title="Próximamente"
          >
            <XCircle size={13} />
            Facturar
          </button>
        </div>
      </section>

      {/* Observación interna */}
      {operacion.observacionInterna && (
        <section className="rounded-xl border border-[#3A3A36] bg-[#1E1F1C] p-4">
          <p className="mb-1 text-[10px] uppercase tracking-wide text-[#4A4A46]">Observación interna</p>
          <p className="whitespace-pre-wrap text-sm italic text-[#8A8A80]">{operacion.observacionInterna}</p>
        </section>
      )}

      {/* Zona peligrosa: eliminar — solo cuando no hay abonos */}
      {operacion.abonos.length === 0 && operacion.estado !== "Rechazado" && (
        <section className="rounded-xl border border-[#FF5A4F]/20 bg-[#FF5A4F]/5 p-4">
          <div className="mb-3 flex items-center gap-1.5">
            <AlertTriangle size={13} className="text-[#FF5A4F]/70" />
            <span className="text-xs font-semibold uppercase tracking-wide text-[#FF5A4F]/70">Zona peligrosa</span>
          </div>
          {accionError && (
            <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{accionError}</div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px]">
              <p className="text-sm font-medium text-[#F0F0EC]">Eliminar operación</p>
              <p className="text-xs text-[#6B6B66]">Se eliminarán también todas las opciones cotizadas. Esta acción es irreversible.</p>
            </div>
            {!confirmarEliminar ? (
              <button
                type="button"
                onClick={() => setConfirmarEliminar(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#FF5A4F]/50 px-3 py-1.5 text-sm font-medium text-[#FF5A4F] transition hover:border-[#FF5A4F] hover:bg-[#FF5A4F]/10"
              >
                <Trash2 size={12} /> Eliminar
              </button>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-[#FF5A4F]/30 bg-[#FF5A4F]/10 px-3 py-1.5">
                <span className="text-xs text-[#FF5A4F]">¿Eliminar definitivamente?</span>
                <button
                  type="button"
                  onClick={handleEliminar}
                  disabled={eliminando}
                  className="text-xs font-bold text-[#FF5A4F] transition hover:brightness-110 disabled:opacity-50"
                >
                  {eliminando ? "Eliminando…" : "Sí, eliminar"}
                </button>
                <button
                  type="button"
                  onClick={() => { setConfirmarEliminar(false); setAccionError(""); }}
                  disabled={eliminando}
                  className="text-xs text-[#6B6B66] transition hover:text-[#8A8A80]"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Modals */}
      {abonoModalOpen && (
        <RegistrarAbonoModal
          operacionId={operacion.id}
          ordenId={operacion.ordenVinculada?.id ?? null}
          onClose={() => setAbonoModalOpen(false)}
          onSuccess={handleAbonoSuccess}
        />
      )}
      {vincularModalOpen && operacion.clienteId && (
        <VincularOrdenModal
          operacionId={operacion.id}
          clienteId={operacion.clienteId}
          onClose={() => setVincularModalOpen(false)}
          onSuccess={handleVincularSuccess}
        />
      )}
      {opcionModalOpen && (
        <OpcionModal
          operacionId={operacion.id}
          opcion={opcionEditing}
          onClose={() => { setOpcionModalOpen(false); setOpcionEditing(null); }}
          onSuccess={handleOpcionSuccess}
        />
      )}
    </div>
  );
}
