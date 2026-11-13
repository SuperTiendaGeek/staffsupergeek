"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Wrench, Plus, Clock } from "lucide-react";
import type { OperacionListado } from "@/types/operaciones";
import { resolverEstadoCobroTablero } from "@/lib/operaciones/cobro";
import { resolverAlertaGestion, type NivelAlertaGestion } from "@/lib/operaciones/vencimiento";
import { NuevaOperacionModal } from "./NuevaOperacionModal";
import { LiberarPedidoModal } from "./RetiroPedido";
import { ESTADOS_PEDIDO, estadoComercial, textoFechaHora, vigencia } from "@/lib/pedidos-especiales/reglas";

// Punto 10A-2: el tablero muestra el estado COMERCIAL del pedido (lo
// logístico lo dice el chip de compra; el dinero, la cuenta). Los estados
// viejos caen en su columna equivalente (estadoComercial).
const COLUMNAS = ESTADOS_PEDIDO.filter((e) => e !== "Cancelado");

// Mismos colores que ESTADO_COLOR (Requerimiento/Aprobado/Rechazado): el
// contenedor de una cotización "Cotizado" avisa con el mismo código de
// semáforo cuánto lleva esperando respuesta del cliente.
const ALERTA_GESTION_COLOR: Record<NivelAlertaGestion, string> = {
  nueva: "#D7FF4F",
  atencion: "#F0C75E",
  urgente: "#FF5A4F",
};

const ESTADO_COLOR: Record<string, string> = {
  Cotizando: "#D7FF4F",
  "Esperando al cliente": "#78B7FF",
  Aceptado: "#F0C75E",
  Cancelado: "#FF5A4F",
  Requerimiento: "#D7FF4F",
  Cotizado: "#78B7FF",
  Aprobado: "#F0C75E",
  Pedido: "#4FD1C5",
  Entregado: "#56E3A4",
  Rechazado: "#FF5A4F",
};

const money = (n: number) =>
  n.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// No hay campo "Fecha" propio en "Operación Comercial" — se deriva del
// createdTime del registro de Airtable (ver OperacionListado.fechaCreacion).
function formatFecha(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" });
}

// Presentación del estado de cobro. La DECISIÓN vive en lib/operaciones/cobro
// (pura y testeada); acá solo se traduce a etiqueta y color.
function moneyBadge(op: OperacionListado): { label: string; color: string } {
  const { estado, monto } = resolverEstadoCobroTablero({
    // Estados del pedido especial → su equivalente viejo para el chip de cobro.
    estado: ({ Cancelado: "Rechazado", Aceptado: "Aprobado", Cotizando: "Requerimiento", "Esperando al cliente": "Cotizado" } as Record<string, string>)[op.estado] ?? op.estado,
    totalCotizado: op.totalCotizado,
    totalAbonado: op.totalAbonado,
    tieneOpciones: op.tieneOpciones,
    tieneOrden: op.tieneOrden,
    cuenta: op.cuenta,
  });

  switch (estado) {
    case "rechazada-con-abono":
      return { label: `Rechazada · $${money(monto)} por devolver`, color: "#FF5A4F" };
    case "rechazada":
      return { label: "Rechazada", color: "#6B7280" };
    case "sin-cotizar-con-abono":
      return { label: `Abonado $${money(monto)} · sin cotizar`, color: "#F0C75E" };
    case "sin-cotizar":
      return { label: "Sin cotizar", color: "#6B7280" };
    case "opciones-sin-elegir":
      return { label: "Opciones enviadas", color: "#78B7FF" };
    case "por-cobrar":
      return { label: `Por cobrar $${money(monto)}`, color: "#FF9F4F" };
    case "saldo-parcial":
      return { label: `Saldo $${money(monto)}`, color: "#F0C75E" };
    case "a-favor":
      return { label: `A favor $${money(monto)}`, color: "#4FD1C5" };
    case "pagado":
      return { label: "Pagado", color: "#56E3A4" };
  }
}

function OperacionCard({ op }: { op: OperacionListado }) {
  const money = moneyBadge(op);
  // Solo Requerimiento y Cotizado alertan — ver resolverAlertaGestion.
  const alerta = resolverAlertaGestion({ estado: op.estado, ultimaActualizacion: op.ultimaActualizacion });
  const alertaColor = alerta ? ALERTA_GESTION_COLOR[alerta.nivel] : null;

  return (
    <Link
      href={`/operaciones/${op.id}`}
      className="block rounded-lg border p-3 flex flex-col gap-2 transition hover:brightness-110"
      style={
        alertaColor
          ? { borderColor: `${alertaColor}55`, background: `${alertaColor}0D` }
          : { borderColor: "#3A3A36", background: "#1A1B18" }
      }
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-mono text-[#6B6B66]">{op.codigo}</span>
        {op.tieneOrden && (
          <Wrench size={12} className="mt-0.5 shrink-0 text-[#78B7FF]" aria-label="Tiene orden de reparación" />
        )}
      </div>
      <p className="text-sm font-medium leading-snug text-[#F0F0EC] line-clamp-2">
        {op.productoSolicitado}
      </p>
      <p className="text-xs text-[#8A8A80] truncate">{op.clienteNombre}</p>
      {op.fechaCreacion && (
        <p className="text-[11px] text-[#6B6B66]">{formatFecha(op.fechaCreacion)}</p>
      )}
      {op.estado === "Esperando al cliente" && op.cotizacionVence && (() => {
        // Punto 10A-2: vigencia de la cotización (72 h por defecto).
        const v = vigencia(op.cotizacionVence);
        const color = v === "vencida" ? "#FF5A4F" : v === "por_vencer" ? "#F0C75E" : "#78B7FF";
        return (
          <span className="inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: `${color}22`, color }}>
            <Clock size={10} />
            {v === "vencida" ? "Cotización vencida" : `Vale hasta ${textoFechaHora(op.cotizacionVence)}`}
          </span>
        );
      })()}
      {op.hito && (
        // Punto 10B: dónde va el pedido (y si hay que hablar con el cliente).
        <span className="flex flex-wrap gap-1">
          <span className="inline-flex w-fit items-center rounded-full bg-[#78B7FF]/15 px-2 py-0.5 text-[10px] font-semibold text-[#78B7FF]">{op.hito.titulo}</span>
          {op.hito.aviso && (
            <span className="inline-flex w-fit items-center rounded-full bg-[#FFB547]/15 px-2 py-0.5 text-[10px] font-semibold text-[#FFB547]">{op.hito.aviso}</span>
          )}
        </span>
      )}
      {(op.recargo ?? 0) > 0.005 && (
        // Punto 10C-3b: recargo del 10 % sumado al día 7 sin retirar.
        <span className="inline-flex w-fit items-center rounded-full bg-[#FFB547]/15 px-2 py-0.5 text-[10px] font-semibold text-[#FFB547]">Recargo ${(op.recargo ?? 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      )}
      {alerta && alerta.nivel !== "nueva" && (
        <span
          className="inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ background: `${alertaColor}22`, color: alertaColor ?? undefined }}
        >
          <Clock size={10} />
          {alerta.dias} {alerta.dias === 1 ? "día" : "días"} sin gestión
        </span>
      )}
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ background: `${money.color}22`, color: money.color }}
          title={op.cuenta?.deLaOrden ? "Cuenta completa de la orden (orden + pedidos)" : undefined}
        >
          {money.label}
        </span>
        {op.totalCotizado !== null && op.totalCotizado > 0 && (
          <span className="text-[11px] tabular-nums text-[#6B6B66]">
            ${op.totalCotizado.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        )}
      </div>
    </Link>
  );
}

type Props = {
  initialItems: OperacionListado[];
  /** Punto 10C-3b: solo el administrador ve "Por liberar" y libera. */
  esAdmin?: boolean;
};

export function OperacionesBoardClient({ initialItems, esAdmin = false }: Props) {
  const router = useRouter();
  const [showRechazado, setShowRechazado] = useState(false);
  const [nuevaModalOpen, setNuevaModalOpen] = useState(false);
  const [verPorLiberar, setVerPorLiberar] = useState(false);
  const [liberando, setLiberando] = useState<OperacionListado | null>(null);
  const porLiberar = useMemo(() => (esAdmin ? initialItems.filter((o) => o.porLiberar) : []), [initialItems, esAdmin]);

  const grouped = useMemo(() => {
    const map = new Map<string, OperacionListado[]>();
    for (const estado of ESTADOS_PEDIDO) map.set(estado, []);
    for (const item of initialItems) map.get(estadoComercial(item.estado))!.push(item);
    return map;
  }, [initialItems]);

  const visibleColumns = useMemo(() => {
    const cols: string[] = [...COLUMNAS];
    if (showRechazado) cols.push("Cancelado");
    return cols;
  }, [showRechazado]);

  const rechazadosCount = grouped.get("Cancelado")?.length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      {nuevaModalOpen && (
        <NuevaOperacionModal onClose={() => setNuevaModalOpen(false)} />
      )}

      {liberando && (
        <LiberarPedidoModal pedidoId={liberando.id} codigo={liberando.codigo} articulo={liberando.productoSolicitado}
          pagado={liberando.totalAbonado ?? 0} onCerrar={() => setLiberando(null)}
          onLiberado={() => { setLiberando(null); router.refresh(); }} />
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
        <button
          onClick={() => setShowRechazado((v) => !v)}
          className={`inline-flex h-7 items-center rounded-full border px-3 text-xs font-medium transition ${
            showRechazado
              ? "border-[#FF5A4F] bg-[#FF5A4F]/10 text-[#FF5A4F]"
              : "border-[#3A3A36] text-[#8A8A80] hover:border-[#5A5A56] hover:text-[#A0A09A]"
          }`}
        >
          Cancelados
          {rechazadosCount > 0 && (
            <span className="ml-1.5 rounded-full bg-[#3A3A36]/60 px-1 text-[10px] font-bold">
              {rechazadosCount}
            </span>
          )}
        </button>
        {porLiberar.length > 0 && (
          // Punto 10C-3b: pedidos que llegaron hace más de 3 meses y nadie retiró.
          <button
            onClick={() => setVerPorLiberar((v) => !v)}
            className={`inline-flex h-7 items-center rounded-full border px-3 text-xs font-medium transition ${
              verPorLiberar
                ? "border-[#FFB547] bg-[#FFB547]/10 text-[#FFB547]"
                : "border-[#FFB547]/40 text-[#FFB547] hover:border-[#FFB547]"
            }`}
          >
            Por liberar · {porLiberar.length}
          </button>
        )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setNuevaModalOpen(true)}
            className="inline-flex h-7 items-center gap-1 rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-3 text-xs font-bold text-[#10110E] transition hover:brightness-105"
          >
            <Plus size={12} />
            Nuevo pedido
          </button>
          <button
            className="inline-flex h-7 items-center rounded-full border border-[#D7FF4F]/30 bg-[#D7FF4F]/5 px-3 text-xs font-medium text-[#D7FF4F]/70"
            disabled
          >
            Tablero
          </button>
          <button
            className="inline-flex h-7 cursor-not-allowed items-center rounded-full border border-[#3A3A36] px-3 text-xs text-[#4A4A46] opacity-50"
            disabled
            title="Próximamente"
          >
            Lista
          </button>
        </div>
      </div>

      {verPorLiberar && porLiberar.length > 0 ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3 pb-4 animate-[sg-entrada_180ms_ease-out]">
          {porLiberar.map((op) => (
            <div key={op.id} className="flex flex-col gap-2">
              <OperacionCard op={op} />
              <button
                type="button"
                onClick={() => setLiberando(op)}
                className="h-7 rounded-lg border border-[#3A3A36] text-xs font-semibold text-[#F0F0EC] transition hover:border-[#6A6A62]"
              >
                Liberar
              </button>
            </div>
          ))}
        </div>
      ) : (
      <div className="overflow-x-auto pb-4">
        <div
          className="flex gap-3"
          style={{ minWidth: `${visibleColumns.length * 252}px` }}
        >
          {visibleColumns.map((estado) => {
            const cards = grouped.get(estado) ?? [];
            const color = ESTADO_COLOR[estado] ?? "#8A8A80";
            return (
              <div key={estado} className="flex w-[240px] flex-none flex-col gap-2">
                <div
                  className="flex items-center gap-2 rounded-lg border px-3 py-2"
                  style={{
                    borderColor: `${color}33`,
                    background: `${color}0D`,
                  }}
                >
                  <span
                    className="h-2 w-2 flex-none rounded-full"
                    style={{ background: color }}
                  />
                  <span className="text-xs font-semibold" style={{ color }}>
                    {estado}
                  </span>
                  <span className="ml-auto rounded-full bg-[#252622]/80 px-1.5 py-0.5 text-[10px] font-bold text-[#6B6B66]">
                    {cards.length}
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  {cards.map((op) => (
                    <OperacionCard key={op.id} op={op} />
                  ))}
                  {cards.length === 0 && (
                    <div className="rounded-lg border border-dashed border-[#3A3A36]/50 px-3 py-4 text-center text-xs text-[#3A3A36]">
                      Sin operaciones
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      )}
    </div>
  );
}
