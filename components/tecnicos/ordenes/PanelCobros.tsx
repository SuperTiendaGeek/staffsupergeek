"use client";

// Panel "Cobros y documentos" de /tecnicos/ordenes.
//
// Responde en un vistazo, con contadores que filtran la lista:
//   · órdenes con cargos con / sin documento emitido,
//   · aprobadas que todavía deben dinero (con abonos parciales o sin ninguno),
//   · entregadas sin documento y entregadas con saldo.
//
// Las reglas (qué cuenta en cada categoría) viven en lib/tecnicos/cobros/
// reglas.ts, compartidas con el servidor: el contador y la lista filtrada
// salen de la misma definición y no pueden discrepar.
//
// Se carga aparte de la lista paginada, para no hacerla más lenta.

import Link from "next/link";
import { useEffect, useState } from "react";
import { CATEGORIAS, type CategoriaCobro, type OrdenCobro, type ResumenCobros } from "@/lib/tecnicos/cobros/reglas";

// Inicio de facturación electrónica en producción (bitácora del corte,
// 14-ago-2026). Antes de esa fecha ninguna orden podía tener documento en el
// portal, así que incluirlas por defecto solo inflaría "sin documento".
const INICIO_FACTURACION = "2026-08-14";

type Rango = "facturacion" | "30dias" | "todo";

const RANGOS: Array<{ id: Rango; label: string }> = [
  { id: "facturacion", label: "Desde facturación (14 ago)" },
  { id: "30dias",      label: "Últimos 30 días" },
  { id: "todo",        label: "Todo el historial" },
];

// Para el subtítulo: deja claro que el rango filtra por FECHA DE INGRESO de
// la orden (no es un límite de lectura: "Todo el historial" trae las 480+).
const RANGO_TEXTO: Record<Rango, string> = {
  facturacion: "desde el 14 ago",
  "30dias":    "en los últimos 30 días",
  todo:        "en todo el historial",
};

function desdeDe(rango: Rango): string | null {
  if (rango === "facturacion") return INICIO_FACTURACION;
  if (rango === "30dias") {
    const d = new Date(Date.now() - 30 * 86400000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return null;
}

const mon = (n: number) => `$${n.toFixed(2)}`;
const fecha = (iso: string) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

type Tono = "lima" | "ok" | "warn" | "danger";
const TONO: Record<Tono, { valor: string; activo: string; hover: string }> = {
  lima:   { valor: "text-[var(--sg-lime)]",    activo: "border-[var(--sg-lime)] bg-[var(--sg-lime-soft)]",       hover: "hover:border-[var(--sg-lime)]" },
  ok:     { valor: "text-[var(--sg-success)]", activo: "border-[var(--sg-success)] bg-[var(--sg-success-soft)]", hover: "hover:border-[var(--sg-success)]" },
  warn:   { valor: "text-[var(--sg-warning)]", activo: "border-[var(--sg-warning)] bg-[var(--sg-warning-soft)]", hover: "hover:border-[var(--sg-warning)]" },
  danger: { valor: "text-[var(--sg-danger)]",  activo: "border-[var(--sg-danger)] bg-[var(--sg-danger-soft)]",   hover: "hover:border-[var(--sg-danger)]" },
};

// Tres grupos = las tres preguntas. El orden y los tonos dicen qué urge.
const GRUPOS: Array<{ titulo: string; items: Array<{ cat: CategoriaCobro; tono: Tono; etiqueta: string }> }> = [
  {
    titulo: "Documentos",
    items: [
      { cat: "con_documento", tono: "ok",   etiqueta: "Con documento" },
      { cat: "sin_documento", tono: "warn", etiqueta: "Sin documento" },
    ],
  },
  {
    titulo: "Aprobadas con saldo",
    items: [
      { cat: "por_cobrar_parcial",    tono: "warn",   etiqueta: "Con abonos parciales" },
      { cat: "por_cobrar_sin_abonos", tono: "danger", etiqueta: "Sin ningún abono" },
    ],
  },
  {
    titulo: "Entregadas",
    items: [
      { cat: "entregadas_sin_documento", tono: "warn",   etiqueta: "Sin documento" },
      { cat: "entregadas_por_cobrar",    tono: "danger", etiqueta: "Con saldo" },
    ],
  },
  {
    titulo: "Revisar",
    items: [
      { cat: "presupuesto_sin_respuesta", tono: "lima", etiqueta: "Presupuestos sin respuesta" },
      { cat: "abonos_sin_respaldo",       tono: "lima", etiqueta: "Abonos sin cargos o de más" },
    ],
  },
];

const ESTADO_COBRO_LABEL: Record<OrdenCobro["estadoCobro"], { texto: string; clase: string }> = {
  sin_cargos:    { texto: "Sin cargos",      clase: "text-[var(--sg-text-muted)]" },
  documentada:   { texto: "Documentada",     clase: "text-[var(--sg-success)]" },
  pagada:        { texto: "Pagada · falta documento", clase: "text-[var(--sg-warning)]" },
  abono_parcial: { texto: "Abono parcial",   clase: "text-[var(--sg-warning)]" },
  sin_abonos:    { texto: "Sin abonos",      clase: "text-[var(--sg-danger)]" },
  saldo_a_favor: { texto: "Saldo a favor",   clase: "text-[var(--sg-info)]" },
};

export function PanelCobros({ onFiltroActivo }: { onFiltroActivo?: (activo: boolean) => void }) {
  const [rango, setRango] = useState<Rango>("facturacion");
  const [categoria, setCategoria] = useState<CategoriaCobro | null>(null);
  const [datos, setDatos] = useState<{ resumen: ResumenCobros; ordenes: OrdenCobro[] } | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setCargando(true);
    setError(null);
    const desde = desdeDe(rango);
    fetch(`/api/tecnicos/ordenes/cobros${desde ? `?desde=${desde}` : ""}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((j) => {
        if (!j.success) throw new Error(j.error || "No se pudo cargar el control de cobros");
        setDatos(j.data);
      })
      .catch((e) => { if (!(e instanceof DOMException && e.name === "AbortError")) setError(e instanceof Error ? e.message : "Error"); })
      .finally(() => { if (!ctrl.signal.aborted) setCargando(false); });
    return () => ctrl.abort();
  }, [rango, recarga]);

  function elegir(cat: CategoriaCobro) {
    const nueva = categoria === cat ? null : cat;
    setCategoria(nueva);
    onFiltroActivo?.(nueva !== null);
  }

  function limpiar() {
    setCategoria(null);
    onFiltroActivo?.(false);
  }

  const filtradas = categoria && datos ? datos.ordenes.filter(CATEGORIAS[categoria].pertenece) : [];

  return (
    <section className="w-full space-y-2.5 rounded-[1rem] border border-[#3A3A36] bg-[#252622] p-3 shadow-xl shadow-black/20">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div>
          <h2 className="text-sm font-extrabold uppercase tracking-[0.14em] text-white">Cobros y documentos</h2>
          <p className="text-[11px] text-[var(--sg-text-muted)]">
            {datos
              ? `${datos.resumen.totalOrdenes} órdenes ingresadas ${RANGO_TEXTO[rango]} · ${datos.resumen.conCargos} con cargos`
              : "Órdenes con cargos, abonos y documento emitido"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {RANGOS.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => { setRango(r.id); limpiar(); }}
              className={`h-7 rounded-full border px-3 text-[11px] font-semibold transition ${
                rango === r.id
                  ? "border-[#D7FF4F] bg-[#D7FF4F] text-[#10110E]"
                  : "border-[#3A3A36] bg-[#1E1F1C] text-[#A7A7A7] hover:border-[#D7FF4F]/50 hover:text-[#F5F5F5]"
              }`}
            >
              {r.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setRecarga((n) => n + 1)}
            title="Recalcular"
            className="h-7 rounded-full border border-[#3A3A36] bg-[#1E1F1C] px-2.5 text-[11px] text-[#A7A7A7] hover:border-[#D7FF4F]/50 hover:text-[#F5F5F5]"
          >
            ↻
          </button>
        </div>
      </div>

      {error && <p className="px-1 text-sm text-red-400">{error}</p>}

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {GRUPOS.map((g) => (
          <div key={g.titulo} className="rounded-lg border border-[var(--sg-border)] bg-[var(--sg-panel)] p-2">
            <p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-wider text-[var(--sg-text-muted)]">{g.titulo}</p>
            <div className={`grid gap-1.5 ${g.items.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
              {g.items.map(({ cat, tono, etiqueta }) => {
                const c = datos?.resumen.categorias[cat];
                const activo = categoria === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    disabled={cargando || !datos}
                    onClick={() => elegir(cat)}
                    title={CATEGORIAS[cat].ayuda}
                    aria-pressed={activo}
                    className={`rounded-lg border px-2.5 py-2 text-left transition disabled:opacity-60 ${
                      activo ? TONO[tono].activo : `border-[var(--sg-border)] bg-[var(--sg-card)] ${TONO[tono].hover}`
                    }`}
                  >
                    <span className="block min-h-[2.1em] text-[11px] font-semibold leading-tight text-[var(--sg-text-secondary)]">{etiqueta}</span>
                    <span className="mt-0.5 flex items-baseline justify-between gap-2">
                      <span className={`text-xl font-extrabold leading-none ${TONO[tono].valor}`}>
                        {cargando || !c ? "…" : c.cantidad}
                      </span>
                      {!cargando && c && c.monto > 0 && (
                        <span className="text-[11px] font-semibold tabular-nums text-[var(--sg-text-muted)]">{mon(c.monto)}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {categoria && datos && (
        <div className="space-y-2">
          <div className="flex flex-col gap-2 rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-[#CFCFCB]">
              <span className="font-semibold text-[#F5F5F5]">{CATEGORIAS[categoria].titulo}</span>
              <span className="text-[#A7A7A7]"> — {CATEGORIAS[categoria].ayuda} ({filtradas.length})</span>
            </p>
            <button
              type="button"
              onClick={limpiar}
              className="inline-flex h-8 items-center justify-center rounded-full border border-[#3A3A36] bg-[#252622] px-3 text-xs font-semibold text-[#CFCFCB] transition hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F]"
            >
              Volver a la lista completa
            </button>
          </div>

          {filtradas.length === 0 ? (
            <p className="px-1 text-sm text-[#A7A7A7]">Ninguna orden en esta categoría.</p>
          ) : (
            <div className="w-full overflow-x-auto rounded-lg border border-[#3A3A36] bg-[#252622]">
              <div className="grid min-w-[1040px] grid-cols-[90px_minmax(130px,1fr)_minmax(180px,1.4fr)_140px_80px_80px_90px_minmax(210px,1.2fr)] border-b border-[#3A3A36] bg-[#30312D] px-3 py-2 text-[11px] uppercase tracking-wide text-[#A7A7A7]">
                <span>ID</span><span>Cliente</span><span>Equipo</span><span>Estado</span>
                <span className="text-right">Total</span><span className="text-right">Abonado</span>
                <span className="text-right">Por cobrar</span><span className="pl-3">Documento</span>
              </div>
              <div className="divide-y divide-[#3A3A36]">
                {filtradas.map((o) => (
                  <Link
                    key={o.recordId}
                    href={`/tecnicos/ordenes/${encodeURIComponent(o.recordId)}`}
                    className="grid min-w-[1040px] grid-cols-[90px_minmax(130px,1fr)_minmax(180px,1.4fr)_140px_80px_80px_90px_minmax(210px,1.2fr)] items-center px-3 py-2 text-sm text-[#CFCFCB] transition hover:bg-[#2D2E2A]"
                  >
                    <span className="font-semibold text-white">{o.idVisible}</span>
                    <span className="truncate">{o.cliente || "—"}</span>
                    <span className="truncate pr-3">{o.equipo || "—"}</span>
                    <span className="truncate text-xs">
                      {o.estado}
                      <span className="block text-[10px] text-[#777]">{fecha(o.fechaIngreso)}</span>
                    </span>
                    <span className="text-right tabular-nums">{mon(o.totalCuenta)}</span>
                    <span className="text-right tabular-nums text-[#A7A7A7]">{mon(o.totalAbonado)}</span>
                    <span className={`text-right font-bold tabular-nums ${o.porCobrar > 0 ? "text-[var(--sg-danger)]" : "text-[var(--sg-success)]"}`}>
                      {mon(o.porCobrar)}
                    </span>
                    <span className="break-all pl-3 text-xs leading-snug">
                      {o.documento ? (
                        <span className="text-[var(--sg-success)]">
                          {o.documento.tipo === "factura" ? "Factura" : "Recibo"} {o.documento.numero || ""}
                        </span>
                      ) : o.documentoNoEmitido ? (
                        <span className="text-[var(--sg-warning)]">Factura {o.documentoNoEmitido.estado.toLowerCase()}</span>
                      ) : (
                        <span className={ESTADO_COBRO_LABEL[o.estadoCobro].clase}>{ESTADO_COBRO_LABEL[o.estadoCobro].texto}</span>
                      )}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
