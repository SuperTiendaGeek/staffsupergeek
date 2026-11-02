"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ETIQUETA_TIPO, type EventoHistorial, type GrupoHistorial, type Tono } from "@/lib/clientes/historial";

// Toda la historia del cliente en una sola lista (auditoría ops, punto 13C):
// cuentas, documentos, pagos y movimientos de su saldo a favor, lo más nuevo
// arriba. Un filtro segmentado; cada fila abre su orden o documento.

type Filtro = "todo" | GrupoHistorial;
const FILTROS: Array<{ id: Filtro; label: string }> = [
  { id: "todo", label: "Todo" },
  { id: "cuentas", label: "Cuentas" },
  { id: "documentos", label: "Documentos" },
  { id: "pagos", label: "Pagos" },
  { id: "saldo", label: "Saldo" },
];

const COLOR_GRUPO: Record<GrupoHistorial, string> = {
  cuentas: "border-[#D7FF4F]/35 text-[#D7FF4F]",
  documentos: "border-[#78b7ff]/40 text-[var(--sg-info)]",
  pagos: "border-[#56e3a4]/40 text-[var(--sg-success)]",
  saldo: "border-[#f0c75e]/45 text-[var(--sg-warning)]",
};

const COLOR_TONO: Record<Tono, string> = {
  ok: "text-[var(--sg-success)]",
  pendiente: "text-[var(--sg-warning)]",
  alerta: "text-[var(--sg-danger)]",
  neutro: "text-[#A7A7A7]",
  anulado: "text-[#A7A7A7]",
};

const dinero = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Math.abs(n));

/** Fecha en hora de Ecuador. Un "aaaa-mm-dd" suelto es ese día, no la medianoche UTC. */
export function fechaCorta(valor: string): string {
  if (!valor) return "—";
  const d = new Date(valor.length === 10 ? `${valor}T12:00:00-05:00` : valor);
  if (Number.isNaN(d.getTime())) return valor;
  return d.toLocaleDateString("es-EC", { timeZone: "America/Guayaquil", day: "2-digit", month: "short", year: "2-digit" });
}

function Monto({ e }: { e: EventoHistorial }) {
  if (e.monto === null) return <span />;
  const conSigno = e.grupo === "pagos" || e.grupo === "saldo";
  const negativo = e.monto < 0;
  return (
    <span className={`text-right tabular-nums font-semibold ${negativo ? "text-[#A7A7A7]" : "text-white"} ${e.tono === "anulado" ? "line-through" : ""}`}>
      {conSigno ? (negativo ? "−" : "+") : ""}
      {dinero(e.monto)}
    </span>
  );
}

export function HistorialCliente({ eventos }: { eventos: EventoHistorial[] }) {
  const [filtro, setFiltro] = useState<Filtro>("todo");
  const conteo = useMemo(() => {
    const c: Record<Filtro, number> = { todo: eventos.length, cuentas: 0, documentos: 0, pagos: 0, saldo: 0 };
    for (const e of eventos) c[e.grupo]++;
    return c;
  }, [eventos]);
  const visibles = filtro === "todo" ? eventos : eventos.filter((e) => e.grupo === filtro);

  return (
    <section className="space-y-2 rounded-[1rem] border border-[#3A3A36] bg-[#252622] p-3 shadow-xl shadow-black/20 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-extrabold text-white">Historial</h3>
        <div role="tablist" className="flex max-w-full gap-0.5 overflow-x-auto rounded-full border border-[#3A3A36] bg-[#1E1F1C] p-0.5">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filtro === f.id}
              disabled={conteo[f.id] === 0 && f.id !== "todo"}
              onClick={() => setFiltro(f.id)}
              className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold transition disabled:opacity-35 ${
                filtro === f.id ? "bg-[#D7FF4F] text-[#10110E]" : "text-[#CFCFCB] hover:text-white"
              }`}
            >
              {f.label}
              <span className={`ml-1 tabular-nums ${filtro === f.id ? "text-[#10110E]/60" : "text-[#A7A7A7]"}`}>{conteo[f.id]}</span>
            </button>
          ))}
        </div>
      </div>

      {visibles.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[#3A3A36] bg-[#1E1F1C] px-4 py-5 text-sm text-[#A7A7A7]">Sin movimientos.</p>
      ) : (
        <ul key={filtro} className="divide-y divide-[#3A3A36] overflow-hidden rounded-lg border border-[#3A3A36] bg-[#1E1F1C]">
          {visibles.map((e, i) => {
            const fila = (
              <div
                className={`grid grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-x-2.5 px-3 py-2 text-sm sm:grid-cols-[68px_64px_156px_minmax(0,1fr)_104px_88px] ${
                  e.tono === "anulado" ? "opacity-55" : ""
                } ${e.href ? "transition hover:bg-[#2D2E2A]" : ""}`}
              >
                <span className={`inline-flex justify-center rounded-full border px-1.5 py-px text-[10px] font-bold uppercase tracking-wide sm:order-2 ${COLOR_GRUPO[e.grupo]}`}>
                  {ETIQUETA_TIPO[e.tipo]}
                </span>
                <span className="hidden text-xs tabular-nums text-[#A7A7A7] sm:order-1 sm:block">{fechaCorta(e.fecha)}</span>
                {/* Móvil: código, detalle y estado en un bloque. */}
                <span className="min-w-0 sm:hidden">
                  <span className={`block truncate font-semibold text-white ${e.tono === "anulado" ? "line-through" : ""}`}>{e.codigo}</span>
                  <span className="block truncate text-[11px] text-[#A7A7A7]">
                    {fechaCorta(e.fecha)}
                    {e.estado && <span className={`ml-1 font-semibold ${COLOR_TONO[e.tono]}`}>{e.estado}</span>}
                    {e.detalle && ` · ${e.detalle}`}
                  </span>
                </span>
                <span className={`hidden truncate font-semibold text-white sm:order-3 sm:block ${e.tono === "anulado" ? "line-through" : ""}`}>{e.codigo}</span>
                <span className="hidden truncate text-[#CFCFCB] sm:order-4 sm:block" title={e.detalle}>{e.detalle}</span>
                <span className={`hidden truncate text-xs font-semibold sm:order-5 sm:block ${COLOR_TONO[e.tono]}`}>{e.estado}</span>
                <span className="sm:order-6"><Monto e={e} /></span>
              </div>
            );
            return (
              <li
                key={`${e.tipo}-${e.id}`}
                className="animate-[sg-entrada_180ms_ease-out_both]"
                style={{ animationDelay: `${Math.min(i, 12) * 18}ms` }}
              >
                {e.href ? <Link href={e.href} className="block">{fila}</Link> : fila}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
