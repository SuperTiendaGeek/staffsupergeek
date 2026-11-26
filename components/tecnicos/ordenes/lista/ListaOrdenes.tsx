"use client";

// Vista «Lista» de las órdenes (rediseño R8, tableros 19 y 20): cuatro bandejas.
//   Abiertas y Para baja: salen de la misma lectura que el tablero (sin consultas nuevas).
//   Entregadas y Reciclaje: se piden de 30 en 30 al abrir la bandeja.
//   Buscador: busca en TODAS las órdenes, en cualquier estado; cada fila se
//   distingue (reciclaje en rojo con basurero, entregada en gris con ✓).

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fechaCorta } from "@/lib/tecnicos/orden/etapas";
import { filasAbiertas, filasParaBaja, nombreEstado, pasaFiltro, tipoFila, type Bandeja, type FilaTablero, type FiltroTarjeta } from "@/lib/tecnicos/orden/tablero";
import { CHIP_ESTADO, CHIP_REPUESTOS, IconoEntregada, IconoReciclaje, Iniciales, PUNTO_NIVEL, TEXTO_NIVEL, type Responsables } from "./piezas";
import { EtiquetaPrueba } from "@/components/pruebas/EtiquetaPrueba";

type OrdenListado = {
  recordId: string;
  idVisible: string;
  clienteNombre: string;
  equipo: string;
  estadoActual: string;
  fechaIngreso: string;
  fechaEntrega?: string | null;
  estadoCambiadoEl?: string | null;
  responsableId?: string | null;
  /** Punto 16: solo llega al buscar (las bandejas no traen pruebas). */
  esPrueba?: boolean;
};

type Props = {
  filas: FilaTablero[] | null;
  /** No se pudo leer la lista de abiertas (se ofrece reintentar, no «Cargando…» para siempre). */
  fallo: boolean;
  onReintentar: () => void;
  responsables: Responsables;
  yo: string | null;
  filtro: FiltroTarjeta;
  buscar: string;
  bandeja: Bandeja;
  onBandeja: (b: Bandeja) => void;
  refresco: number;
};

const POR_PAGINA = 30;

const FILA = "grid items-center gap-3 border-t border-[#2C2D29] px-3.5 text-[12.5px] text-[#D6D6D0] transition-colors";
const CABECERA = "grid h-[30px] items-center gap-3 px-3.5 text-[11px] font-bold uppercase tracking-[0.04em] text-[#B5B5AE]";
const ESTILO_FILA = {
  normal: "hover:bg-[#252622]",
  baja: "shadow-[inset_3px_0_0_#FF7A70] hover:bg-[#252622]",
  entregada: "text-[#B5B5AE] hover:bg-[#252622]",
  reciclaje: "bg-[rgba(255,122,112,.08)] text-[#B5B5AE] shadow-[inset_3px_0_0_#FF7A70] hover:bg-[rgba(255,122,112,.13)]",
} as const;
const COLOR_CODIGO = { normal: "text-[#D7FF4F]", baja: "text-[#D7FF4F]", entregada: "text-[#C9C9C2]", reciclaje: "text-[#FF9C94]" } as const;

function Codigo({ codigo, tipo }: { codigo: string; tipo: keyof typeof ESTILO_FILA }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-extrabold tabular-nums ${COLOR_CODIGO[tipo]}`} title={tipo === "reciclaje" ? "En reciclaje" : tipo === "entregada" ? "Entregada" : undefined}>
      {tipo === "reciclaje" && <IconoReciclaje />}
      {tipo === "entregada" && <IconoEntregada />}
      {codigo}
    </span>
  );
}

function ChipEstado({ estado }: { estado: string }) {
  return <span className={`justify-self-start whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${CHIP_ESTADO[estado] ?? CHIP_ESTADO.Pendiente}`}>{nombreEstado(estado)}</span>;
}

function Pie({ mostradas, total, onMas, extra }: { mostradas: number; total: number | null; onMas?: () => void; extra?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 border-t border-[#2C2D29] px-3.5 py-2 text-xs text-[#B5B5AE]">
      {extra}
      <span className="ml-auto tabular-nums">{total === null ? `${mostradas}` : `${mostradas} de ${total}`}</span>
      {onMas && (
        <button type="button" onClick={onMas} className="h-7 rounded-lg border border-[#3A3A36] bg-[#252622] px-2.5 text-xs font-bold text-[#F0F0EC] hover:border-[#D7FF4F]/60">
          Ver {total === null ? "más" : `${Math.min(POR_PAGINA, Math.max(0, total - mostradas))} más`}
        </button>
      )}
    </div>
  );
}

/** Páginas de 30 de la ruta de órdenes (sin conteos: resumen=0). */
function usePaginas(params: string | null, refresco: number) {
  const [estado, setEstado] = useState<{ filas: OrdenListado[]; siguiente: string | null; cargando: boolean; error: string | null }>({ filas: [], siguiente: null, cargando: false, error: null });
  const [pedirMas, setPedirMas] = useState<string | null>(null);

  useEffect(() => {
    if (!params) return;
    const ctrl = new AbortController();
    setEstado({ filas: [], siguiente: null, cargando: true, error: null });
    fetch(`/api/tecnicos/ordenes?${params}&pageSize=${POR_PAGINA}&resumen=0`, { signal: ctrl.signal, cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!j.success) throw new Error(j.error || "No se pudieron cargar las órdenes.");
        setEstado({ filas: j.records ?? [], siguiente: j.nextOffset ?? null, cargando: false, error: null });
      })
      .catch((e) => { if (!(e instanceof DOMException && e.name === "AbortError")) setEstado({ filas: [], siguiente: null, cargando: false, error: e instanceof Error ? e.message : "Error" }); });
    return () => ctrl.abort();
  }, [params, refresco]);

  useEffect(() => {
    if (!params || !pedirMas) return;
    const ctrl = new AbortController();
    setEstado((s) => ({ ...s, cargando: true }));
    fetch(`/api/tecnicos/ordenes?${params}&pageSize=${POR_PAGINA}&resumen=0&offset=${encodeURIComponent(pedirMas)}`, { signal: ctrl.signal, cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!j.success) throw new Error(j.error || "No se pudieron cargar más órdenes.");
        setEstado((s) => ({ filas: [...s.filas, ...(j.records ?? [])], siguiente: j.nextOffset ?? null, cargando: false, error: null }));
      })
      .catch((e) => { if (!(e instanceof DOMException && e.name === "AbortError")) setEstado((s) => ({ ...s, cargando: false, error: e instanceof Error ? e.message : "Error" })); })
      .finally(() => setPedirMas(null));
    return () => ctrl.abort();
  }, [params, pedirMas]);

  return { ...estado, mas: estado.siguiente ? () => setPedirMas(estado.siguiente) : undefined };
}

export function ListaOrdenes({ filas, fallo, onReintentar, responsables, yo, filtro, buscar, bandeja, onBandeja, refresco }: Props) {
  const [conteos, setConteos] = useState<{ entregadas: number; reciclaje: number } | null>(null);
  const [verAbiertas, setVerAbiertas] = useState(POR_PAGINA);
  const [repuestos, setRepuestos] = useState<Record<string, { texto: string; tono: string }>>({});
  const q = buscar.trim();

  useEffect(() => {
    let vivo = true;
    fetch("/api/tecnicos/ordenes/conteos", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (vivo && j.success) setConteos(j.data); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [refresco]);

  const abiertas = useMemo(() => filasAbiertas(filas ?? []).filter((f) => pasaFiltro(f, filtro, yo)), [filas, filtro, yo]);
  const paraBaja = useMemo(() => filasParaBaja(filas ?? []), [filas]);

  // Chip de repuestos bajo pedido (Compras) solo para las filas visibles de «Abiertas», un momento después.
  const visibles = abiertas.slice(0, verAbiertas);
  const idsVisibles = !q && bandeja === "abiertas" ? visibles.map((f) => f.ordenId).join(",") : "";
  useEffect(() => {
    if (!idsVisibles) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/tecnicos/ordenes/repuestos?ids=${idsVisibles}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((j) => { if (j.success) setRepuestos((prev) => ({ ...prev, ...(j.data ?? {}) })); })
        .catch(() => {});
    }, 1200);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [idsVisibles]);

  const paramsServidor = q
    ? `q=${encodeURIComponent(q)}`
    : bandeja === "entregadas" ? `estado=${encodeURIComponent("Finalizado Entregado")}&orden=entrega`
      : bandeja === "reciclaje" ? `estado=${encodeURIComponent("Enviado a Reciclaje")}&orden=cambio`
        : null;
  const servidor = usePaginas(paramsServidor, refresco);

  const bandejas: Array<{ clave: Bandeja; nombre: string; n: number | null }> = [
    { clave: "abiertas", nombre: "Abiertas", n: filas ? filas.length : null },
    { clave: "baja", nombre: "Para baja", n: filas ? paraBaja.length : null },
    { clave: "entregadas", nombre: "Entregadas", n: conteos?.entregadas ?? null },
    { clave: "reciclaje", nombre: "Reciclaje", n: conteos?.reciclaje ?? null },
  ];

  const enBaja = new Set(paraBaja.map((f) => f.ordenId));

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Bandeja" className="inline-flex overflow-hidden rounded-lg border border-[#3A3A36]">
          {bandejas.map((b, i) => {
            const on = !q && bandeja === b.clave;
            return (
              <button key={b.clave} type="button" role="radio" aria-checked={on} onClick={() => onBandeja(b.clave)}
                className={`inline-flex h-[30px] items-center gap-1.5 whitespace-nowrap px-3 text-xs font-bold transition-colors ${i ? "border-l border-[#3A3A36]" : ""} ${on ? "bg-[rgba(215,255,79,.12)] text-[#D7FF4F]" : "bg-[#1E1F1C] text-[#B5B5AE] hover:text-[#F0F0EC]"}`}>
                {b.clave === "baja" && <span className="h-2 w-2 rounded-full bg-[#FF7A70]" />}
                {b.clave === "reciclaje" && <IconoReciclaje className="h-3 w-3" />}
                {b.nombre}
                <b className={`font-bold tabular-nums ${on ? "" : "text-[#8E8E87]"}`}>{b.n ?? "…"}</b>
              </button>
            );
          })}
        </div>
        {q && <span className="text-xs text-[#B5B5AE]">Resultados de «{q}» en todas las bandejas</span>}
      </div>

      <div className="w-full overflow-x-auto rounded-xl border border-[#3A3A36] bg-[#1E1F1C]">
        {q ? (
          <TablaServidor tipo="busqueda" datos={servidor} responsables={responsables} enBaja={enBaja} />
        ) : bandeja === "abiertas" ? (
          <>
            <div className={`${CABECERA} min-w-[900px] grid-cols-[84px_minmax(0,1.1fr)_minmax(0,1.3fr)_150px_70px_minmax(0,1.5fr)_30px_46px]`}>
              <span>Orden</span><span>Cliente</span><span>Equipo</span><span>Estado</span><span>Ingresó</span><span>Qué pasa</span><span>Resp.</span><span className="text-right">Hace</span>
            </div>
            {!filas ? <SinDatos fallo={fallo} onReintentar={onReintentar} />
              : !visibles.length ? <p className="border-t border-[#2C2D29] px-3.5 py-3 text-sm text-[#B5B5AE]">Ninguna orden en este filtro.</p>
                : visibles.map((f) => {
                  const nivel = f.baja ? (f.baja.nivel === "cumple" ? "atencion" : "porVencer") : f.nivel;
                  const tipo = tipoFila(f.estado, !!f.baja);
                  const rep = repuestos[f.ordenId];
                  return (
                    <Link key={f.ordenId} href={`/tecnicos/ordenes/${encodeURIComponent(f.ordenId)}`}
                      className={`${FILA} ${ESTILO_FILA[tipo]} h-[38px] min-w-[900px] grid-cols-[84px_minmax(0,1.1fr)_minmax(0,1.3fr)_150px_70px_minmax(0,1.5fr)_30px_46px]`}>
                      <Codigo codigo={f.codigo} tipo={tipo} />
                      <span className="truncate">{f.cliente || "—"}</span>
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate">{f.equipo || "—"}</span>
                        {rep && <span className={`shrink-0 whitespace-nowrap rounded-full border px-1.5 text-[10.5px] font-semibold animate-[sg-entrada_180ms_ease-out] ${CHIP_REPUESTOS[rep.tono] ?? CHIP_REPUESTOS.neutro}`} title="Repuestos bajo pedido de esta orden">{rep.texto}</span>}
                      </span>
                      <ChipEstado estado={f.estado} />
                      <span className="text-[#B5B5AE]">{fechaCorta(f.fechaIngreso)}</span>
                      <span className={`flex min-w-0 items-center gap-2 font-semibold ${TEXTO_NIVEL[nivel]}`}>
                        <span className={`h-2 w-2 shrink-0 rounded-full ${PUNTO_NIVEL[nivel]}`} />
                        <span className="truncate">{f.texto}{f.pospuestaHasta ? " · pospuesta" : ""}</span>
                      </span>
                      <Iniciales id={f.responsableId} responsables={responsables} />
                      <span className={`text-right font-bold tabular-nums ${TEXTO_NIVEL[nivel]}`}>{f.hace}</span>
                    </Link>
                  );
                })}
            {filas && abiertas.length > 0 && (
              <Pie mostradas={visibles.length} total={abiertas.length} onMas={visibles.length < abiertas.length ? () => setVerAbiertas((n) => n + POR_PAGINA) : undefined}
                extra={<span>Lo más urgente primero</span>} />
            )}
          </>
        ) : bandeja === "baja" ? (
          <>
            <div className={`${CABECERA} min-w-[900px] grid-cols-[84px_minmax(0,1.1fr)_minmax(0,1.3fr)_150px_140px_130px_30px]`}>
              <span>Orden</span><span>Cliente</span><span>Equipo</span><span>Estado</span>
              <span>Cuenta desde</span><span>Días</span><span>Resp.</span>
            </div>
            {!filas ? <SinDatos fallo={fallo} onReintentar={onReintentar} />
              : !paraBaja.length ? <p className="border-t border-[#2C2D29] px-3.5 py-3 text-sm text-[#B5B5AE]">Ninguna orden llega a 60 días.</p>
                : paraBaja.map((f) => {
                  const b = f.baja!;
                  const rojo = b.nivel === "cumple";
                  return (
                    <Link key={f.ordenId} href={`/tecnicos/ordenes/${encodeURIComponent(f.ordenId)}`}
                      className={`${FILA} ${ESTILO_FILA.baja} h-[38px] min-w-[900px] grid-cols-[84px_minmax(0,1.1fr)_minmax(0,1.3fr)_150px_140px_130px_30px]`}>
                      <Codigo codigo={f.codigo} tipo="baja" />
                      <span className="truncate">{f.cliente || "—"}</span>
                      <span className="truncate">{f.equipo || "—"}</span>
                      <ChipEstado estado={f.estado} />
                      <span className="text-[#B5B5AE]">{b.desde === "ingreso" ? "Ingreso" : "Completada"} · {fechaCorta(b.fecha)}</span>
                      {/* R8c: el color dice la política (rojo = cumple; ámbar = próxima, con lo que falta). */}
                      <span className={`whitespace-nowrap tabular-nums ${rojo ? "text-[#FF9C94]" : "text-[#FFB547]"}`}>
                        <b className="font-bold">{b.dias} d</b>{!rojo && <span className="font-semibold"> · faltan {b.faltan}</span>}
                      </span>
                      <Iniciales id={f.responsableId} responsables={responsables} />
                    </Link>
                  );
                })}
          </>
        ) : (
          <TablaServidor tipo={bandeja} datos={servidor} total={bandeja === "entregadas" ? conteos?.entregadas ?? null : conteos?.reciclaje ?? null} responsables={responsables} enBaja={enBaja} />
        )}
      </div>
    </div>
  );
}

function SinDatos({ fallo, onReintentar }: { fallo: boolean; onReintentar: () => void }) {
  return fallo ? (
    <p className="flex items-center gap-3 border-t border-[#2C2D29] px-3.5 py-3 text-sm">
      <span className="text-[#FF9C94]">No se pudieron leer las órdenes abiertas.</span>
      <button type="button" onClick={onReintentar} className="font-bold text-[#D7FF4F] hover:underline">Reintentar</button>
    </p>
  ) : <p className="border-t border-[#2C2D29] px-3.5 py-3 text-sm text-[#B5B5AE]">Cargando…</p>;
}

function TablaServidor({ tipo, datos, total = null, responsables, enBaja }: {
  tipo: "busqueda" | "entregadas" | "reciclaje";
  datos: ReturnType<typeof usePaginas>;
  total?: number | null;
  responsables: Responsables;
  enBaja: Set<string>;
}) {
  const fecha = tipo === "entregadas" ? "Entregada" : tipo === "reciclaje" ? "Pasó a reciclaje" : "Estado";
  const columnas = "min-w-[820px] grid-cols-[104px_minmax(0,1.1fr)_minmax(0,1.6fr)_70px_150px_30px]";
  return (
    <>
      <div className={`${CABECERA} ${columnas}`}>
        <span>Orden</span><span>Cliente</span><span>Equipo</span><span>Ingresó</span><span>{fecha}</span><span>Resp.</span>
      </div>
      {datos.error ? <p className="border-t border-[#2C2D29] px-3.5 py-3 text-sm text-[#FF9C94]">{datos.error}</p>
        : !datos.filas.length ? <p className="border-t border-[#2C2D29] px-3.5 py-3 text-sm text-[#B5B5AE]">{datos.cargando ? "Cargando…" : "Ninguna orden."}</p>
          : datos.filas.map((o) => {
            const t = tipoFila(o.estadoActual, enBaja.has(o.recordId));
            return (
              <Link key={o.recordId} href={`/tecnicos/ordenes/${encodeURIComponent(o.recordId)}`}
                className={`${FILA} ${ESTILO_FILA[t]} h-[38px] ${columnas}`}>
                <Codigo codigo={o.idVisible} tipo={t} />
                <span className="flex min-w-0 items-center gap-1.5"><span className="truncate">{o.clienteNombre || "—"}</span>{o.esPrueba && <EtiquetaPrueba />}</span>
                <span className="truncate">{o.equipo || "—"}</span>
                <span className="text-[#B5B5AE]">{fechaCorta(o.fechaIngreso)}</span>
                {tipo === "busqueda" ? <ChipEstado estado={o.estadoActual} />
                  : <span>{fechaCorta(tipo === "entregadas" ? o.fechaEntrega : o.estadoCambiadoEl) || "—"}</span>}
                <Iniciales id={o.responsableId ?? null} responsables={responsables} />
              </Link>
            );
          })}
      {datos.filas.length > 0 && (
        <Pie mostradas={datos.filas.length} total={total} onMas={datos.mas}
          extra={tipo === "busqueda" ? (datos.cargando ? <span>Buscando…</span> : undefined) : <span>La más reciente primero</span>} />
      )}
    </>
  );
}
