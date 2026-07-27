"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { Wrench, Plus } from "lucide-react";
import type { OperacionListado } from "@/types/operaciones";
import { ESTADOS_TABLERO } from "@/types/operaciones";
import { resolverEstadoCobro } from "@/lib/operaciones/cobro";
import { NuevaOperacionModal } from "./NuevaOperacionModal";

const ESTADO_COLOR: Record<string, string> = {
  Requerimiento: "#D7FF4F",
  Cotizado: "#78B7FF",
  Aprobado: "#F0C75E",
  Pedido: "#4FD1C5",
  Entregado: "#56E3A4",
  Rechazado: "#FF5A4F",
};

const money = (n: number) =>
  n.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Presentación del estado de cobro. La DECISIÓN vive en lib/operaciones/cobro
// (pura y testeada); acá solo se traduce a etiqueta y color.
function moneyBadge(op: OperacionListado): { label: string; color: string } {
  const { estado, monto } = resolverEstadoCobro({
    estado: op.estado,
    totalCotizado: op.totalCotizado,
    totalAbonado: op.totalAbonado,
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
  return (
    <Link
      href={`/operaciones/${op.id}`}
      className="block rounded-lg border border-[#3A3A36] bg-[#1A1B18] p-3 flex flex-col gap-2 transition hover:border-[#5A5A56] hover:bg-[#202119]"
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
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ background: `${money.color}22`, color: money.color }}
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
};

export function OperacionesBoardClient({ initialItems }: Props) {
  const [showRechazado, setShowRechazado] = useState(false);
  const [nuevaModalOpen, setNuevaModalOpen] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<string, OperacionListado[]>();
    for (const estado of [...ESTADOS_TABLERO, "Rechazado"]) {
      map.set(estado, []);
    }
    for (const item of initialItems) {
      const bucket = map.get(item.estado);
      if (bucket) {
        bucket.push(item);
      } else {
        map.get("Requerimiento")!.push(item);
      }
    }
    return map;
  }, [initialItems]);

  const visibleColumns = useMemo(() => {
    const cols: string[] = [...ESTADOS_TABLERO];
    if (showRechazado) cols.push("Rechazado");
    return cols;
  }, [showRechazado]);

  const rechazadosCount = grouped.get("Rechazado")?.length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      {nuevaModalOpen && (
        <NuevaOperacionModal onClose={() => setNuevaModalOpen(false)} />
      )}

      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => setShowRechazado((v) => !v)}
          className={`inline-flex h-7 items-center rounded-full border px-3 text-xs font-medium transition ${
            showRechazado
              ? "border-[#FF5A4F] bg-[#FF5A4F]/10 text-[#FF5A4F]"
              : "border-[#3A3A36] text-[#8A8A80] hover:border-[#5A5A56] hover:text-[#A0A09A]"
          }`}
        >
          Rechazados
          {rechazadosCount > 0 && (
            <span className="ml-1.5 rounded-full bg-[#3A3A36]/60 px-1 text-[10px] font-bold">
              {rechazadosCount}
            </span>
          )}
        </button>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setNuevaModalOpen(true)}
            className="inline-flex h-7 items-center gap-1 rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-3 text-xs font-bold text-[#10110E] transition hover:brightness-105"
          >
            <Plus size={12} />
            Nueva operación
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
    </div>
  );
}
