"use client";

// Pestaña Kardex (auditoría Shipping V2, punto 12 · 24-oct-2026).
//
//  · Producto: el libro de un SKU con saldo corrido, cabecera (en tienda, en
//    camino, apartadas, última compra/venta, días en tienda) y filtro por
//    unidad (trazabilidad por serie).
//  · Movimientos: todo el inventario en un periodo, con atajos.
//  · Dados de baja: la mercadería que salió sin venderse, por causa.
//  · Resumen (Administrador): saldo inicial · entradas · ajustes · salidas ·
//    saldo final, e inventario a una fecha.
//
// Costos y valores solo los recibe el Administrador (los limpia el servidor).

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Download, Loader2, Printer, RotateCcw, Search, TriangleAlert, X } from "lucide-react";
import { KardexTabla } from "@/components/shipping-v2/kardex/KardexTabla";
import { cantidadTexto, descargarXlsx, dinero, enlaceDocumento, fechaCorta, serieCorta, textoDocumento } from "@/components/shipping-v2/kardex/kardex-formato";
import {
  conSaldo,
  gananciaDe,
  grupoDeMotivo,
  ordenarMovimientos,
  resumenProducto,
  type CausaBaja,
  type GrupoKardex,
  type MovimientoKardex,
} from "@/lib/shipping-v2/kardex";
import type { KardexProducto, KardexResumen } from "@/lib/shipping-v2/kardex-lectura";
import { crearTablaXlsx } from "@/lib/shipping-v2/hoja-xlsx";
import { prepareShippingV2ItemSearchIndex, searchShippingV2ItemIndex, type ShippingV2PreparedItemSearchEntry } from "@/lib/shipping-v2/item-search";
import type { ShippingV2ItemSearchEntry } from "@/types/shipping-v2";

export type VistaKardex = "producto" | "movimientos" | "bajas" | "resumen";

const boton = "inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#3A3B35] bg-[#1A1B17] px-3 text-[12.5px] font-semibold text-[#EDEDE7] transition hover:border-[#D7FF4F]/50 disabled:opacity-50";
const segmento = (activo: boolean) =>
  `h-8 whitespace-nowrap px-3 text-[12.5px] transition-colors ${activo ? "bg-[#D7FF4F] font-bold text-[#141510]" : "bg-[#151515] font-semibold text-[#B4B5AC] hover:text-[#EDEDE7]"}`;
const chip = (activo: boolean) =>
  `h-7 rounded-full border px-2.5 text-[12px] font-semibold transition-colors ${activo ? "border-[#D7FF4F]/50 bg-[#D7FF4F]/10 text-[#D7FF4F]" : "border-[#3A3B35] bg-[#151515] text-[#C9CAC1] hover:text-[#EDEDE7]"}`;
const campo = "h-8 rounded-lg border border-[#3A3B35] bg-[#151515] px-2.5 text-[12.5px] text-[#EDEDE7] outline-none focus:border-[#D7FF4F]/60";

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: "no-store", ...init });
  const j = await r.json().catch(() => ({ success: false, error: "Respuesta inválida." }));
  if (!j.success) throw new Error(j.error || "No se pudo cargar.");
  return j.data as T;
}

function ecuadorHoy(): string {
  return new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
}
function sumarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function inicioMes(dia: string, desplazar = 0): string {
  const d = new Date(`${dia.slice(0, 7)}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + desplazar);
  return d.toISOString().slice(0, 10);
}
/** "2026-10-01" (día en Ecuador) → instante ISO de su comienzo. */
function inicioDia(dia: string): string {
  return new Date(`${dia}T00:00:00-05:00`).toISOString();
}

type Periodo = "todo" | "hoy" | "7d" | "mes" | "mes-anterior" | "anio" | "rango";
const PERIODOS: Array<{ key: Periodo; label: string }> = [
  { key: "hoy", label: "Hoy" },
  { key: "7d", label: "7 días" },
  { key: "mes", label: "Este mes" },
  { key: "mes-anterior", label: "Mes anterior" },
  { key: "anio", label: "Este año" },
  { key: "todo", label: "Todo" },
  { key: "rango", label: "Rango" },
];
function rangoDe(p: Periodo, rango: { desde: string; hasta: string }): { desde?: string; hasta?: string } {
  const hoy = ecuadorHoy();
  switch (p) {
    case "hoy": return { desde: hoy, hasta: sumarDias(hoy, 1) };
    case "7d": return { desde: sumarDias(hoy, -6), hasta: sumarDias(hoy, 1) };
    case "mes": return { desde: inicioMes(hoy), hasta: inicioMes(hoy, 1) };
    case "mes-anterior": return { desde: inicioMes(hoy, -1), hasta: inicioMes(hoy) };
    case "anio": return { desde: `${hoy.slice(0, 4)}-01-01`, hasta: `${Number(hoy.slice(0, 4)) + 1}-01-01` };
    case "rango": return { desde: rango.desde || undefined, hasta: rango.hasta ? sumarDias(rango.hasta, 1) : undefined };
    default: return {};
  }
}

function SelectorPeriodo({ valor, onCambio, rango, onRango, opciones = PERIODOS }: {
  valor: Periodo; onCambio: (p: Periodo) => void; rango: { desde: string; hasta: string }; onRango: (r: { desde: string; hasta: string }) => void; opciones?: typeof PERIODOS;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <select aria-label="Periodo" value={valor} onChange={(e) => onCambio(e.target.value as Periodo)} className={campo}>
        {opciones.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
      </select>
      {valor === "rango" ? (
        <span className="inline-flex items-center gap-1 animate-[sg-entrada_160ms_ease-out]">
          <input type="date" aria-label="Desde" value={rango.desde} onChange={(e) => onRango({ ...rango, desde: e.target.value })} className={campo} />
          <span className="text-[#8F908A]">–</span>
          <input type="date" aria-label="Hasta" value={rango.hasta} onChange={(e) => onRango({ ...rango, hasta: e.target.value })} className={campo} />
        </span>
      ) : null}
    </span>
  );
}

function Aviso({ children, tono = "naranja" }: { children: ReactNode; tono?: "naranja" | "verde" }) {
  const c = tono === "verde" ? "border-[#7BE495]/30 bg-[#7BE495]/[0.08] text-[#CFF5D8]" : "border-[#FFB07A]/30 bg-[#FFB07A]/[0.08] text-[#FFD9BF]";
  return <div className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-[12.5px] animate-[sg-entrada_200ms_ease-out] ${c}`}>{children}</div>;
}

// ─────────────────────────────────────────────────────────────────────────────

export function ShippingV2KardexClient({ vistaInicial, qInicial, esAdministrador }: { vistaInicial: VistaKardex; qInicial: string; esAdministrador: boolean }) {
  const [vista, setVista] = useState<VistaKardex>(vistaInicial);
  const [q, setQ] = useState(qInicial);

  const irA = useCallback((v: VistaKardex, nuevoQ?: string) => {
    setVista(v);
    if (nuevoQ !== undefined) setQ(nuevoQ);
    const u = new URL(window.location.href);
    u.searchParams.set("vista", v);
    const qq = nuevoQ ?? q;
    if (v === "producto" && qq) u.searchParams.set("q", qq);
    else u.searchParams.delete("q");
    window.history.replaceState(null, "", u.toString());
  }, [q]);

  const vistas: Array<{ key: VistaKardex; label: string }> = [
    { key: "producto", label: "Producto" },
    { key: "movimientos", label: "Movimientos" },
    { key: "bajas", label: "Dados de baja" },
    ...(esAdministrador ? [{ key: "resumen" as const, label: "Resumen" }] : []),
  ];
  const barra = (
    <div role="tablist" aria-label="Vista del Kardex" className="inline-flex max-w-full overflow-x-auto rounded-lg border border-[#3A3B35]">
      {vistas.map((v, i) => (
        <button key={v.key} type="button" role="tab" aria-selected={vista === v.key} onClick={() => irA(v.key)} className={`${i ? "border-l border-[#3A3B35]" : ""} ${segmento(vista === v.key)}`}>
          {v.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-2.5 text-[#EDEDE7]">
      {vista === "producto" ? <VistaProducto barra={barra} q={q} onQ={(x) => irA("producto", x)} esAdministrador={esAdministrador} /> : null}
      {vista === "movimientos" ? <VistaMovimientos barra={barra} onAbrir={(sku) => irA("producto", sku)} /> : null}
      {vista === "bajas" ? <VistaBajas barra={barra} esAdministrador={esAdministrador} onAbrir={(sku) => irA("producto", sku)} /> : null}
      {vista === "resumen" && esAdministrador ? <VistaResumen barra={barra} onAbrir={(sku) => irA("producto", sku)} /> : null}
    </div>
  );
}

// ─── Buscador (SKU, serie o nombre; el lector de código de barras escribe y da Enter) ──

function BuscadorProducto({ valor, onElegir }: { valor: string; onElegir: (q: string) => void }) {
  const [texto, setTexto] = useState(valor);
  const [indice, setIndice] = useState<ShippingV2PreparedItemSearchEntry[] | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => setTexto(valor), [valor]);
  useEffect(() => {
    if (!valor) ref.current?.focus();
  }, [valor]);

  const cargarIndice = useCallback(() => {
    if (indice) return;
    fetch("/api/shipping-v2/items/search-index")
      .then((r) => r.json())
      .then((j) => setIndice(prepareShippingV2ItemSearchIndex((j.items ?? []) as ShippingV2ItemSearchEntry[])))
      .catch(() => setIndice([]));
  }, [indice]);

  // Un producto = un SKU: se juntan sus unidades en una sugerencia.
  const sugerencias = useMemo(() => {
    if (!indice || texto.trim().length < 2) return [];
    const vistos = new Map<string, { sku: string; nombre: string; unidades: number }>();
    for (const r of searchShippingV2ItemIndex(indice, texto, { limit: 40 }).results) {
      const sku = r.item.sku;
      const prev = vistos.get(sku);
      if (prev) prev.unidades += 1;
      else vistos.set(sku, { sku, nombre: r.item.nombre, unidades: 1 });
      if (vistos.size >= 8) break;
    }
    return [...vistos.values()];
  }, [indice, texto]);

  function elegir(v: string) {
    setAbierto(false);
    onElegir(v.trim());
  }

  return (
    <div className="relative min-w-[220px] flex-1">
      <label className="flex h-8 items-center gap-2 rounded-lg border border-[#3A3B35] bg-[#151515] px-2.5 focus-within:border-[#D7FF4F]/60">
        <Search className="h-3.5 w-3.5 text-[#8F908A]" aria-hidden="true" />
        <input
          ref={ref}
          value={texto}
          aria-label="SKU, serie o nombre"
          placeholder="SKU, serie o nombre"
          onFocus={() => { cargarIndice(); setAbierto(true); }}
          onBlur={() => setTimeout(() => setAbierto(false), 150)}
          onChange={(e) => { setTexto(e.target.value); setActivo(0); setAbierto(true); cargarIndice(); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActivo((a) => Math.min(a + 1, Math.max(sugerencias.length - 1, 0))); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActivo((a) => Math.max(a - 1, 0)); }
            else if (e.key === "Enter") {
              e.preventDefault();
              // Un código (SKU o serie escaneada) va directo; un nombre toma la sugerencia marcada.
              const t = texto.trim();
              const pareceCodigo = /^[A-Z]{2,4}-\d{3,}$/i.test(t) || (/\d/.test(t) && /^[A-Z0-9-]{5,}$/i.test(t));
              const s = sugerencias[activo];
              elegir(pareceCodigo || !s ? t : s.sku);
            } else if (e.key === "Escape") setAbierto(false);
          }}
          className="h-full min-w-0 flex-1 bg-transparent text-[12.5px] font-medium outline-none placeholder:text-[#6F706A]"
        />
        {texto ? (
          <button type="button" aria-label="Borrar" onClick={() => { setTexto(""); ref.current?.focus(); }} className="text-[#8F908A] hover:text-[#EDEDE7]"><X className="h-3.5 w-3.5" aria-hidden="true" /></button>
        ) : null}
      </label>
      {abierto && sugerencias.length ? (
        <div className="absolute left-0 right-0 top-9 z-30 overflow-hidden rounded-xl border border-[#3A3B35] bg-[#171814] shadow-xl shadow-black/40 animate-[sg-entrada_140ms_ease-out]">
          {sugerencias.map((s, i) => (
            <button key={s.sku} type="button" onMouseDown={(e) => { e.preventDefault(); elegir(s.sku); }} className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] ${i === activo ? "bg-[#D7FF4F]/[0.08]" : "hover:bg-white/[0.03]"}`}>
              <span className="font-mono font-semibold">{s.sku}</span>
              <span className="min-w-0 flex-1 truncate text-[#C9CAC1]">{s.nombre}</span>
              {s.unidades > 1 ? <span className="text-[11px] text-[#8F908A]">{s.unidades} reg.</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ─── Producto ────────────────────────────────────────────────────────────────

function VistaProducto({ barra, q, onQ, esAdministrador }: { barra: ReactNode; q: string; onQ: (q: string) => void; esAdministrador: boolean }) {
  const [datos, setDatos] = useState<KardexProducto | null | undefined>(undefined);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [unidad, setUnidad] = useState<string>("");
  const [periodo, setPeriodo] = useState<Periodo>("todo");
  const [rango, setRango] = useState({ desde: "", hasta: "" });
  const [verInfo, setVerInfo] = useState(true);
  const [verCostos, setVerCostos] = useState(true);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    if (!q) { setDatos(undefined); return; }
    let vivo = true;
    setCargando(true);
    setError("");
    pedir<KardexProducto | null>(`/api/shipping-v2/kardex?vista=producto&q=${encodeURIComponent(q)}`)
      .then((d) => { if (vivo) { setDatos(d); setUnidad(""); } })
      .catch((e) => vivo && setError(e instanceof Error ? e.message : "No se pudo cargar."))
      .finally(() => vivo && setCargando(false));
    return () => { vivo = false; };
  }, [q, recarga]);

  const { desde, hasta } = rangoDe(periodo, rango);
  const vista = useMemo(() => {
    if (!datos) return null;
    const porUnidad = (m: { registroId: string }) => !unidad || m.registroId === unidad;
    const todos = ordenarMovimientos(datos.movimientos.filter(porUnidad));
    const d0 = desde ? inicioDia(desde) : "";
    const d1 = hasta ? inicioDia(hasta) : "";
    const antes = d0 ? todos.filter((m) => m.fecha < d0) : [];
    const enPeriodo = todos.filter((m) => (!d0 || m.fecha >= d0) && (!d1 || m.fecha < d1));
    const saldoInicial = d0 ? { fecha: d0, cantidad: antes.reduce((s, m) => s + m.cantidad, 0), valor: Math.round(antes.reduce((s, m) => s + m.valor, 0) * 100) / 100 } : undefined;
    const info = datos.informativos.filter((i) => (!unidad || !i.registroId || i.registroId === unidad) && (!d0 || i.fecha >= d0) && (!d1 || i.fecha < d1));
    return { enPeriodo, saldoInicial, info, resumen: resumenProducto(datos.movimientos.filter(porUnidad)) };
  }, [datos, unidad, desde, hasta]);

  const difs = datos?.diferencias ?? [];

  function exportar() {
    if (!datos || !vista) return;
    const filas = conSaldo(vista.enPeriodo, vista.saldoInicial).map((m) => [
      fechaCorta(m.fecha), m.motivo, m.serie, textoDocumento(m, datos.codigos), m.contraparte,
      m.cantidad > 0 ? m.cantidad : "", m.cantidad < 0 ? -m.cantidad : "", m.saldo,
      ...(datos.verCostos ? [m.costoUnitario ?? "", m.valor, m.saldoValor, m.precioVenta ?? "", gananciaDe(m) ?? ""] : []),
      m.hechoPor, m.causa || m.nota,
    ]);
    const cols = [
      { titulo: "Fecha", ancho: 13 }, { titulo: "Motivo", ancho: 26 }, { titulo: "Serie", ancho: 14 }, { titulo: "Documento", ancho: 22 }, { titulo: "Cliente / Proveedor", ancho: 24 },
      { titulo: "Entra", ancho: 7 }, { titulo: "Sale", ancho: 7 }, { titulo: "Saldo", ancho: 7 },
      ...(datos.verCostos ? [{ titulo: "Costo u.", ancho: 10 }, { titulo: "Valor", ancho: 10 }, { titulo: "Saldo $", ancho: 11 }, { titulo: "Precio", ancho: 10 }, { titulo: "Ganancia", ancho: 10 }] : []),
      { titulo: "Quién", ancho: 18 }, { titulo: "Nota", ancho: 40 },
    ];
    descargarXlsx(crearTablaXlsx(`Kardex ${datos.sku}`, cols, filas), `kardex-${datos.sku}-${ecuadorHoy()}.xlsx`);
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        {barra}
        <BuscadorProducto valor={q} onElegir={onQ} />
        <button type="button" className={boton} onClick={exportar} disabled={!datos}><Download className="h-3.5 w-3.5" aria-hidden="true" />Excel</button>
        <button type="button" className={boton} onClick={() => window.print()} disabled={!datos}><Printer className="h-3.5 w-3.5" aria-hidden="true" />Imprimir</button>
      </div>

      {error ? <Aviso>{error}</Aviso> : null}
      {cargando ? <p className="flex items-center gap-2 px-1 py-6 text-[12.5px] text-[#8F908A]"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />Cargando…</p> : null}
      {!cargando && !q ? <p className="px-1 py-6 text-[12.5px] text-[#8F908A]">Escanea o escribe un SKU, una serie o un nombre.</p> : null}
      {!cargando && q && datos === null ? <Aviso>No se encontró «{q}».</Aviso> : null}

      {!cargando && datos && vista ? (
        <div className="space-y-2.5 animate-[sg-entrada_200ms_ease-out]">
          <section className="rounded-xl border border-[#30312D] bg-[#171814] px-3 py-2.5">
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
              <Link href={`/shipping-v2/items/${datos.unidades[0]?.id ?? ""}`} className="font-mono text-[17px] font-bold text-[#D7FF4F] hover:underline">{datos.sku}</Link>
              <span className="text-[14px] font-semibold">{datos.nombre}</span>
              <span className="text-[12px] text-[#8F908A]">{[datos.categoria, datos.condicion].filter(Boolean).join(" · ")}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] tabular-nums">
              <Dato etiqueta="En tienda" valor={datos.cabecera.enTienda} fuerte />
              <Dato etiqueta="En camino" valor={datos.cabecera.enCamino} />
              <Dato etiqueta="Apartadas" valor={datos.cabecera.apartadas} />
              <Dato etiqueta="Libres" valor={datos.cabecera.libres} />
              {datos.verCostos ? <Dato etiqueta="Valor a costo" valor={dinero(vista.resumen.valor)} fuerte /> : null}
              <Dato etiqueta="Última compra" valor={vista.resumen.ultimaCompra ? [fechaCorta(vista.resumen.ultimaCompra.fecha, false), vista.resumen.ultimaCompra.contraparte, datos.verCostos ? dinero(vista.resumen.ultimaCompra.costo) : ""].filter(Boolean).join(" · ") : "—"} />
              <Dato etiqueta="Última venta" valor={vista.resumen.ultimaVenta ? [fechaCorta(vista.resumen.ultimaVenta.fecha, false), vista.resumen.ultimaVenta.contraparte, datos.verCostos ? dinero(vista.resumen.ultimaVenta.precio) : ""].filter(Boolean).join(" · ") : "—"} />
              {vista.resumen.agotadoDesde ? <Dato etiqueta="Agotado desde" valor={fechaCorta(vista.resumen.agotadoDesde, false)} /> : null}
              {vista.resumen.diasEnTienda !== null ? <Dato etiqueta="Días en tienda" valor={`${vista.resumen.diasEnTienda} prom.`} /> : null}
            </div>
          </section>

          {difs.length ? (
            <CuadrarKardex diferencias={difs} unidades={datos.unidades} esAdministrador={esAdministrador} onHecho={() => setRecarga((n) => n + 1)} />
          ) : null}

          <div className="flex flex-wrap items-center gap-1.5 print:hidden">
            {datos.unidades.length > 1 ? (
              <>
                <span className="mr-0.5 text-[12px] text-[#8F908A]">Unidad</span>
                <button type="button" className={chip(!unidad)} onClick={() => setUnidad("")}>Todas</button>
                {datos.unidades.map((u) => (
                  <button key={u.id} type="button" className={chip(unidad === u.id)} onClick={() => setUnidad(u.id)} title={u.serie || u.estado}>
                    {u.serie ? `S/N ${serieCorta(u.serie)}` : u.esLote ? `Lote · ${u.enTienda || u.enCamino} u.` : "sin serie"}
                    {u.enCamino && !u.enTienda ? <span className="text-[#8F908A]"> · en camino</span> : u.salio ? <span className="text-[#8F908A]"> · {u.estado.toLowerCase() || "salió"}</span> : null}
                  </button>
                ))}
              </>
            ) : null}
            <span className="ml-auto inline-flex flex-wrap items-center gap-3">
              <SelectorPeriodo valor={periodo} onCambio={setPeriodo} rango={rango} onRango={setRango} />
              <label className="inline-flex items-center gap-1.5 text-[12px] text-[#B4B5AC]"><input type="checkbox" checked={verInfo} onChange={(e) => setVerInfo(e.target.checked)} />Apartados y en camino</label>
              {datos.verCostos ? <label className="inline-flex items-center gap-1.5 text-[12px] text-[#B4B5AC]"><input type="checkbox" checked={verCostos} onChange={(e) => setVerCostos(e.target.checked)} />Ajustes de costo</label> : null}
            </span>
          </div>

          <KardexTabla
            movimientos={vista.enPeriodo}
            informativos={vista.info}
            verCostos={datos.verCostos}
            mostrarInformativos={verInfo}
            mostrarAjustesCosto={verCostos}
            mostrarUnidad={datos.unidades.length > 1 || datos.unidades.some((u) => u.serie)}
            codigos={datos.codigos}
            saldoInicial={vista.saldoInicial}
            cuadra={unidad ? !difs.some((d) => d.registroId === unidad) : difs.length === 0}
            vacio="No hay movimientos en este periodo."
          />
        </div>
      ) : null}
    </>
  );
}

function Dato({ etiqueta, valor, fuerte }: { etiqueta: string; valor: ReactNode; fuerte?: boolean }) {
  return (
    <span className="whitespace-nowrap">
      <span className="text-[#8F908A]">{etiqueta} </span>
      <span className={fuerte ? "font-bold" : ""}>{valor}</span>
    </span>
  );
}

function CuadrarKardex({ diferencias, unidades, esAdministrador, onHecho }: {
  diferencias: KardexProducto["diferencias"]; unidades: KardexProducto["unidades"]; esAdministrador: boolean; onHecho: () => void;
}) {
  const [abierto, setAbierto] = useState<string>("");
  const [motivo, setMotivo] = useState("");
  const [estado, setEstado] = useState<"" | "guardando" | "listo">("");
  const [error, setError] = useState("");
  const serie = (id: string) => unidades.find((u) => u.id === id)?.serie;

  async function cuadrar(itemId: string) {
    setEstado("guardando");
    setError("");
    try {
      await pedir("/api/shipping-v2/kardex", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId, motivo }) });
      setEstado("listo");
      setTimeout(() => { setEstado(""); setAbierto(""); setMotivo(""); onHecho(); }, 700);
    } catch (e) {
      setEstado("");
      setError(e instanceof Error ? e.message : "No se pudo cuadrar.");
    }
  }

  return (
    <Aviso>
      <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="font-semibold">Kardex no cuadra</span>
      {diferencias.map((d) => (
        <span key={d.registroId} className="inline-flex flex-wrap items-center gap-1.5">
          <span>{serie(d.registroId) ? `S/N ${serieCorta(serie(d.registroId)!)}` : d.sku}: libro {d.libro} · inventario {d.inventario}</span>
          {abierto !== d.registroId ? (
            <Link href="/shipping-v2/control" className="h-7 rounded-md border border-[#FFB07A]/40 px-2 py-1 text-[12px] font-semibold hover:bg-[#FFB07A]/10" title="Si las unidades no cuadran, explícalo con su causa en Control → Revisión: el Kardex se corrige solo">Revisión</Link>
          ) : null}
          {esAdministrador && abierto !== d.registroId ? (
            <button type="button" className="h-7 rounded-md px-2 text-[12px] font-semibold text-[#FFD9BF]/80 underline-offset-2 hover:underline" onClick={() => setAbierto(d.registroId)} title="Solo el libro: deja un «Ajuste del Kardex» con tu motivo">Ajustar el Kardex</button>
          ) : null}
          {abierto === d.registroId ? (
            <span className="inline-flex flex-wrap items-center gap-1.5 animate-[sg-entrada_160ms_ease-out]">
              <input autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo" aria-label="Motivo" className={`${campo} w-56 text-[#EDEDE7]`} />
              <button type="button" disabled={motivo.trim().length < 5 || estado === "guardando"} onClick={() => cuadrar(d.registroId)} className="h-8 rounded-lg bg-[#D7FF4F] px-3 text-[12.5px] font-bold text-[#141510] disabled:opacity-50">
                {estado === "guardando" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : estado === "listo" ? "✓ Cuadrado" : `Dejar el libro en ${d.inventario}`}
              </button>
              <button type="button" aria-label="Cerrar" onClick={() => setAbierto("")} className="text-[#FFD9BF]/70 hover:text-[#FFD9BF]"><X className="h-3.5 w-3.5" aria-hidden="true" /></button>
            </span>
          ) : null}
        </span>
      ))}
      {error ? <span className="text-[12px] text-[#FFB07A]">{error}</span> : null}
    </Aviso>
  );
}

// ─── Movimientos ─────────────────────────────────────────────────────────────

const ATAJOS: Array<{ key: GrupoKardex | "todos"; label: string }> = [
  { key: "todos", label: "Todos" },
  { key: "ventas", label: "Ventas" },
  { key: "compras", label: "Compras" },
  { key: "devoluciones", label: "Devoluciones" },
  { key: "bajas", label: "Bajas" },
  { key: "ajustes", label: "Ajustes" },
  { key: "taller", label: "Taller" },
  { key: "costos", label: "Costos" },
  { key: "traslados", label: "Traslados" },
];

function normalizar(t: string) {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function VistaMovimientos({ barra, onAbrir }: { barra: ReactNode; onAbrir: (sku: string) => void }) {
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [rango, setRango] = useState({ desde: "", hasta: "" });
  const [datos, setDatos] = useState<{ movimientos: MovimientoKardex[]; verCostos: boolean } | null>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [grupo, setGrupo] = useState<GrupoKardex | "todos">("todos");
  const [texto, setTexto] = useState("");
  const [categoria, setCategoria] = useState("");
  const [ambito, setAmbito] = useState<"Mercadería" | "Activo">("Mercadería");
  const [limite, setLimite] = useState(100);

  const { desde, hasta } = rangoDe(periodo, rango);
  useEffect(() => {
    if (periodo === "rango" && (!rango.desde || !rango.hasta)) return;
    let vivo = true;
    setCargando(true);
    setError("");
    const p = new URLSearchParams({ vista: "movimientos" });
    if (desde) p.set("desde", desde);
    if (hasta) p.set("hasta", hasta);
    pedir<{ movimientos: MovimientoKardex[]; verCostos: boolean }>(`/api/shipping-v2/kardex?${p}`)
      .then((d) => vivo && setDatos(d))
      .catch((e) => vivo && setError(e instanceof Error ? e.message : "No se pudo cargar."))
      .finally(() => vivo && setCargando(false));
    return () => { vivo = false; };
  }, [desde, hasta, periodo, rango.desde, rango.hasta]);

  const base = useMemo(() => {
    const t = normalizar(texto.trim());
    return (datos?.movimientos ?? [])
      .filter((m) => m.ambito === ambito)
      .filter((m) => !categoria || m.categoria === categoria)
      .filter((m) => !t || normalizar([m.sku, m.nombre, m.serie, m.documento, m.contraparte, m.hechoPor, m.motivo, m.nota].join(" ")).includes(t));
  }, [datos, texto, categoria, ambito]);
  const conteos = useMemo(() => {
    const c: Record<string, number> = { todos: base.length };
    for (const m of base) c[grupoDeMotivo(m.motivo)] = (c[grupoDeMotivo(m.motivo)] ?? 0) + 1;
    return c;
  }, [base]);
  const filas = useMemo(() => ordenarMovimientos(base.filter((m) => grupo === "todos" || grupoDeMotivo(m.motivo) === grupo)).reverse(), [base, grupo]);
  const categorias = useMemo(() => [...new Set((datos?.movimientos ?? []).map((m) => m.categoria).filter(Boolean))].sort(), [datos]);
  const totales = useMemo(() => {
    let eu = 0, ev = 0, su = 0, sv = 0;
    for (const m of filas) {
      if (m.tipo === "Entrada") { eu += m.cantidad; ev += m.valor; }
      if (m.tipo === "Salida") { su -= m.cantidad; sv -= m.valor; }
    }
    return { eu, ev: Math.round(ev * 100) / 100, su, sv: Math.round(sv * 100) / 100 };
  }, [filas]);
  useEffect(() => setLimite(100), [grupo, texto, categoria, ambito, desde, hasta]);

  const verCostos = datos?.verCostos === true;
  function exportar() {
    const cols = [
      { titulo: "Fecha", ancho: 13 }, { titulo: "SKU", ancho: 12 }, { titulo: "Artículo", ancho: 36 }, { titulo: "Serie", ancho: 13 }, { titulo: "Motivo", ancho: 26 },
      { titulo: "Documento", ancho: 22 }, { titulo: "Cliente / Proveedor", ancho: 24 }, { titulo: "Cantidad", ancho: 9 },
      ...(verCostos ? [{ titulo: "Costo u.", ancho: 10 }, { titulo: "Valor", ancho: 10 }, { titulo: "Precio", ancho: 10 }, { titulo: "Ganancia", ancho: 10 }] : []),
      { titulo: "Quién", ancho: 18 }, { titulo: "Nota", ancho: 40 },
    ];
    const rows = filas.map((m) => [
      fechaCorta(m.fecha), m.sku, m.nombre, m.serie, m.motivo, textoDocumento(m), m.contraparte, m.cantidad,
      ...(verCostos ? [m.costoUnitario ?? "", m.valor, m.precioVenta ?? "", gananciaDe(m) ?? ""] : []),
      m.hechoPor, [m.causa, m.nota].filter(Boolean).join(" · "),
    ]);
    descargarXlsx(crearTablaXlsx("Movimientos", cols, rows), `kardex-movimientos-${ecuadorHoy()}.xlsx`);
  }

  const th = "px-2 py-1.5 text-left text-[10.5px] font-semibold uppercase tracking-wide text-[#8F908A] whitespace-nowrap";
  const td = "px-2 py-1.5 whitespace-nowrap";
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {barra}
        <label className="flex h-8 min-w-[160px] flex-1 items-center gap-2 rounded-lg border border-[#3A3B35] bg-[#151515] px-2.5 focus-within:border-[#D7FF4F]/60">
          <Search className="h-3.5 w-3.5 text-[#8F908A]" aria-hidden="true" />
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="SKU, serie, documento, cliente…" aria-label="Buscar" className="h-full min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-[#6F706A]" />
        </label>
        <SelectorPeriodo valor={periodo} onCambio={setPeriodo} rango={rango} onRango={setRango} />
        <select aria-label="Categoría" value={categoria} onChange={(e) => setCategoria(e.target.value)} className={campo}>
          <option value="">Categoría</option>
          {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="inline-flex overflow-hidden rounded-lg border border-[#3A3B35]" role="tablist" aria-label="Ámbito">
          <button type="button" role="tab" aria-selected={ambito === "Mercadería"} onClick={() => setAmbito("Mercadería")} className={segmento(ambito === "Mercadería")}>Mercadería</button>
          <button type="button" role="tab" aria-selected={ambito === "Activo"} onClick={() => setAmbito("Activo")} className={`border-l border-[#3A3B35] ${segmento(ambito === "Activo")}`}>Activos</button>
        </div>
        <button type="button" className={boton} onClick={exportar} disabled={!filas.length}><Download className="h-3.5 w-3.5" aria-hidden="true" />Excel</button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {ATAJOS.filter((a) => a.key === "todos" || conteos[a.key]).map((a) => (
          <button key={a.key} type="button" className={chip(grupo === a.key)} onClick={() => setGrupo(a.key)}>{a.label} · {conteos[a.key] ?? 0}</button>
        ))}
        <span className="ml-auto text-[12.5px] tabular-nums">
          <span className="text-[#7BE495]">Entra {totales.eu} u.{verCostos ? ` · ${dinero(totales.ev)}` : ""}</span>
          <span className="text-[#8F908A]"> · </span>
          <span className="text-[#FFB07A]">Sale {totales.su} u.{verCostos ? ` · ${dinero(totales.sv)}` : ""}</span>
        </span>
      </div>

      {error ? <Aviso>{error}</Aviso> : null}
      {cargando && !datos ? <p className="flex items-center gap-2 px-1 py-6 text-[12.5px] text-[#8F908A]"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />Cargando…</p> : null}
      {datos ? (
        <div className={`overflow-x-auto rounded-xl border border-[#30312D] bg-[#171814] transition-opacity ${cargando ? "opacity-60" : ""}`}>
          {filas.length ? (
            <table className="w-full min-w-[780px] border-collapse text-[12.5px]">
              <thead className="border-b border-[#30312D]">
                <tr>
                  <th className={th}>Fecha</th><th className={th}>SKU</th><th className={th}>Artículo</th><th className={th}>Motivo</th><th className={th}>Documento</th><th className={th}>Cliente / Prov.</th>
                  <th className={`${th} text-right`}>Cant.</th>{verCostos ? <th className={`${th} text-right`}>Costo</th> : null}<th className={th}>Quién</th>
                </tr>
              </thead>
              <tbody>
                {filas.slice(0, limite).map((m) => {
                  const href = enlaceDocumento(m);
                  const doc = textoDocumento(m);
                  const ganancia = verCostos ? gananciaDe(m) : null;
                  const sub = [m.serie ? `S/N ${serieCorta(m.serie)}` : "", m.causa, ganancia !== null ? `ganancia ${dinero(ganancia)}` : "", m.tipo === "Costo" || m.motivo === "Vendida fuera del sistema" || m.motivo === "Salida interna" ? m.nota : ""].filter(Boolean).join(" · ");
                  return (
                    <tr key={m.id ?? m.clave} className={`border-b border-[#252622] animate-[sg-entrada_160ms_ease-out] ${m.tipo === "Costo" ? "text-[#C9B6FF]" : ""}`}>
                      <td className={td}>{fechaCorta(m.fecha)}</td>
                      <td className={td}><button type="button" onClick={() => onAbrir(m.sku)} className="font-mono font-semibold text-[#D7FF4F] hover:underline">{m.sku}</button></td>
                      <td className={`${td} max-w-[140px] truncate text-[#B4B5AC]`} title={m.nombre}>{m.nombre}</td>
                      <td className={`${td} whitespace-normal`}>{m.motivo}{sub ? <span className="block max-w-[200px] truncate text-[11px] text-[#8F908A]" title={sub}>{sub}</span> : null}</td>
                      <td className={td}>{href && doc ? <Link href={href} className="text-[#D7FF4F] hover:underline">{doc}</Link> : <span className="text-[#B4B5AC]">{doc}</span>}</td>
                      <td className={`${td} max-w-[120px] truncate`} title={m.contraparte}>{m.contraparte}</td>
                      <td className={`${td} text-right tabular-nums ${m.cantidad > 0 ? "text-[#7BE495]" : m.cantidad < 0 ? "text-[#FFB07A]" : "text-[#8F908A]"}`}>{m.tipo === "Costo" ? "0" : cantidadTexto(m.cantidad)}</td>
                      {verCostos ? <td className={`${td} text-right tabular-nums`}>{m.tipo === "Costo" ? dinero(m.valor, { signo: true }) : dinero(m.costoUnitario)}</td> : null}
                      <td className={td}>{m.hechoPor.split(" ")[0]}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="px-3 py-6 text-center text-[12.5px] text-[#8F908A]">Sin movimientos con estos filtros.</p>
          )}
          {filas.length > limite ? (
            <div className="flex items-center justify-between border-t border-[#30312D] px-3 py-1.5 text-[12px] text-[#8F908A]">
              <span>1–{limite} de {filas.length}</span>
              <button type="button" className="font-semibold text-[#D7FF4F] hover:underline" onClick={() => setLimite((n) => n + 200)}>Ver más</button>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

// ─── Dados de baja ───────────────────────────────────────────────────────────

const CAUSAS: CausaBaja[] = ["Perdido", "Robo", "Daño", "Error de registro", "Devuelto al proveedor", "Otro"];
const COLOR_CAUSA: Record<CausaBaja, string> = {
  Perdido: "bg-[#FFB07A]/15 text-[#FFB07A]",
  Robo: "bg-[#FF8A8A]/15 text-[#FF9C9C]",
  Daño: "bg-[#C9B6FF]/15 text-[#C9B6FF]",
  "Error de registro": "bg-[#8F908A]/20 text-[#C9CAC1]",
  "Devuelto al proveedor": "bg-[#7CC7FF]/15 text-[#9AD3FF]",
  Otro: "bg-[#8F908A]/20 text-[#C9CAC1]",
};

function VistaBajas({ barra, esAdministrador, onAbrir }: { barra: ReactNode; esAdministrador: boolean; onAbrir: (sku: string) => void }) {
  const [datos, setDatos] = useState<{ movimientos: MovimientoKardex[]; bajasVigentes: Record<string, number>; verCostos: boolean } | null>(null);
  const [error, setError] = useState("");
  const [causa, setCausa] = useState<CausaBaja | "todas" | "revertidas">("todas");
  const [periodo, setPeriodo] = useState<Periodo>("todo");
  const [rango, setRango] = useState({ desde: "", hasta: "" });
  const [texto, setTexto] = useState("");
  const [recarga, setRecarga] = useState(0);
  const [revertir, setRevertir] = useState<{ id: string; cantidad: number; motivo: string; estado: "" | "guardando" | "listo"; error: string } | null>(null);

  useEffect(() => {
    let vivo = true;
    pedir<{ movimientos: MovimientoKardex[]; bajasVigentes: Record<string, number>; verCostos: boolean }>("/api/shipping-v2/kardex?vista=bajas")
      .then((d) => vivo && setDatos(d))
      .catch((e) => vivo && setError(e instanceof Error ? e.message : "No se pudo cargar."));
    return () => { vivo = false; };
  }, [recarga]);

  const { desde, hasta } = rangoDe(periodo, rango);
  const bajas = useMemo(() => {
    const t = normalizar(texto.trim());
    const d0 = desde ? inicioDia(desde) : "";
    const d1 = hasta ? inicioDia(hasta) : "";
    return ordenarMovimientos((datos?.movimientos ?? []).filter((m) => (!d0 || m.fecha >= d0) && (!d1 || m.fecha < d1) && (!t || normalizar([m.sku, m.nombre, m.serie, m.nota, m.documento, m.hechoPor].join(" ")).includes(t)))).reverse();
  }, [datos, desde, hasta, texto]);
  const conteos = useMemo(() => {
    const c: Record<string, number> = { todas: 0, revertidas: 0 };
    for (const m of bajas) {
      if (m.motivo === "Baja revertida") { c.revertidas += 1; continue; }
      c.todas += 1;
      const k = m.causa || "Otro";
      c[k] = (c[k] ?? 0) + 1;
    }
    return c;
  }, [bajas]);
  const filas = bajas.filter((m) => (causa === "revertidas" ? m.motivo === "Baja revertida" : m.motivo === "Dada de baja" && (causa === "todas" || (m.causa || "Otro") === causa)));
  const unidades = filas.reduce((s, m) => s + Math.abs(m.cantidad), 0);
  const valor = Math.round(filas.reduce((s, m) => s + Math.abs(m.valor), 0) * 100) / 100;
  const verCostos = datos?.verCostos === true;

  async function confirmarRevertir() {
    if (!revertir) return;
    setRevertir({ ...revertir, estado: "guardando", error: "" });
    try {
      await pedir(`/api/shipping-v2/items/${revertir.id}/activo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "revertir-baja", cantidad: revertir.cantidad, motivo: revertir.motivo }),
      });
      setRevertir({ ...revertir, estado: "listo", error: "" });
      setTimeout(() => { setRevertir(null); setRecarga((n) => n + 1); }, 800);
    } catch (e) {
      setRevertir({ ...revertir, estado: "", error: e instanceof Error ? e.message : "No se pudo revertir." });
    }
  }

  function exportar() {
    const cols = [
      { titulo: "Fecha", ancho: 13 }, { titulo: "SKU", ancho: 12 }, { titulo: "Artículo", ancho: 36 }, { titulo: "Serie", ancho: 13 }, { titulo: "Causa", ancho: 20 },
      { titulo: "Desde", ancho: 24 }, { titulo: "Unidades", ancho: 9 }, ...(verCostos ? [{ titulo: "Costo", ancho: 10 }] : []), { titulo: "Motivo", ancho: 50 }, { titulo: "Quién", ancho: 18 },
    ];
    const rows = filas.map((m) => [fechaCorta(m.fecha), m.sku, m.nombre, m.serie, m.causa || (m.motivo === "Baja revertida" ? "Revertida" : "Otro"), textoDocumento(m), Math.abs(m.cantidad), ...(verCostos ? [Math.abs(m.valor)] : []), m.nota, m.hechoPor]);
    descargarXlsx(crearTablaXlsx("Dados de baja", cols, rows), `kardex-dados-de-baja-${ecuadorHoy()}.xlsx`);
  }

  const th = "px-2 py-1.5 text-left text-[10.5px] font-semibold uppercase tracking-wide text-[#8F908A] whitespace-nowrap";
  const td = "px-2 py-1.5 whitespace-nowrap";
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {barra}
        <label className="flex h-8 min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-[#3A3B35] bg-[#151515] px-2.5 focus-within:border-[#D7FF4F]/60">
          <Search className="h-3.5 w-3.5 text-[#8F908A]" aria-hidden="true" />
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="SKU, serie, motivo…" aria-label="Buscar" className="h-full min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-[#6F706A]" />
        </label>
        <SelectorPeriodo valor={periodo} onCambio={setPeriodo} rango={rango} onRango={setRango} />
        <button type="button" className={boton} onClick={exportar} disabled={!filas.length}><Download className="h-3.5 w-3.5" aria-hidden="true" />Excel</button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className={chip(causa === "todas")} onClick={() => setCausa("todas")}>Todas · {conteos.todas}</button>
        {CAUSAS.filter((c) => conteos[c]).map((c) => <button key={c} type="button" className={chip(causa === c)} onClick={() => setCausa(c)}>{c} · {conteos[c]}</button>)}
        {conteos.revertidas ? <button type="button" className={chip(causa === "revertidas")} onClick={() => setCausa("revertidas")}>Revertidas · {conteos.revertidas}</button> : null}
        <span className="ml-auto text-[12.5px] tabular-nums">{unidades} u.{verCostos ? <> · <strong>{dinero(valor)}</strong> a costo</> : null}</span>
      </div>
      {error ? <Aviso>{error}</Aviso> : null}
      {!datos && !error ? <p className="flex items-center gap-2 px-1 py-6 text-[12.5px] text-[#8F908A]"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />Cargando…</p> : null}
      {datos ? (
        <div className="overflow-x-auto rounded-xl border border-[#30312D] bg-[#171814]">
          {filas.length ? (
            <table className="w-full min-w-[820px] border-collapse text-[12.5px]">
              <thead className="border-b border-[#30312D]">
                <tr>
                  <th className={th}>Fecha</th><th className={th}>SKU</th><th className={th}>Artículo</th><th className={th}>Causa</th><th className={th}>Desde</th>
                  <th className={`${th} text-right`}>Unid.</th>{verCostos ? <th className={`${th} text-right`}>Costo</th> : null}<th className={th}>Motivo</th><th className={th}>Quién</th><th className={th} />
                </tr>
              </thead>
              <tbody>
                {filas.map((m) => {
                  const href = enlaceDocumento(m);
                  const doc = textoDocumento(m) || "Ficha";
                  const vigentes = datos.bajasVigentes[m.registroId] ?? 0;
                  const abierto = revertir?.id === m.registroId && m.motivo === "Dada de baja" && revertir;
                  const c = (m.causa || "Otro") as CausaBaja;
                  return (
                    <Fragment key={m.id ?? m.clave}>
                    <tr className={`border-b border-[#252622] align-top transition-colors duration-300 ${abierto ? (abierto.estado === "listo" ? "bg-[#7BE495]/[0.10]" : "bg-[#1C1D18]") : ""}`}>
                      <td className={td}>{fechaCorta(m.fecha, false)}</td>
                      <td className={td}><button type="button" onClick={() => onAbrir(m.sku)} className="font-mono font-semibold text-[#D7FF4F] hover:underline">{m.sku}</button>{m.serie ? <span className="block text-[11px] text-[#8F908A]">S/N {serieCorta(m.serie)}</span> : null}</td>
                      <td className={`${td} max-w-[220px] truncate text-[#B4B5AC]`} title={m.nombre}>{m.nombre}</td>
                      <td className={td}>{m.motivo === "Baja revertida" ? <span className="rounded-full bg-[#7BE495]/15 px-2 py-0.5 text-[11px] font-semibold text-[#7BE495]">Revertida</span> : <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${COLOR_CAUSA[c] ?? COLOR_CAUSA.Otro}`}>{c}</span>}</td>
                      <td className={td}>{href ? <Link href={href} className="text-[#D7FF4F] hover:underline">{doc}</Link> : doc}</td>
                      <td className={`${td} text-right tabular-nums`}>{Math.abs(m.cantidad)}</td>
                      {verCostos ? <td className={`${td} text-right tabular-nums`}>{m.costoUnitario ? dinero(Math.abs(m.valor)) : "—"}</td> : null}
                      <td className={`${td} max-w-[240px] truncate text-[#B4B5AC]`} title={m.nota}>{m.nota.replace(/^Conteo "[^"]*":\s*/, "")}</td>
                      <td className={td}>{m.hechoPor.split(" ")[0]}</td>
                      <td className={td}>
                        {esAdministrador && m.motivo === "Dada de baja" && vigentes > 0 && !abierto ? (
                          <button type="button" aria-label="Revertir la baja" title="Revertir la baja" onClick={() => setRevertir({ id: m.registroId, cantidad: Math.min(Math.abs(m.cantidad), vigentes), motivo: "", estado: "", error: "" })} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#3A3B35] text-[#C9CAC1] hover:border-[#D7FF4F]/50 hover:text-[#EDEDE7]">
                            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                    {abierto ? (
                      <tr className={`border-b border-[#252622] transition-colors duration-300 ${abierto.estado === "listo" ? "bg-[#7BE495]/[0.10]" : "bg-[#1C1D18]"}`}>
                        <td className={`${td} py-2`} colSpan={verCostos ? 10 : 9}>
                          <span className="flex flex-wrap items-center justify-end gap-1.5 animate-[sg-entrada_160ms_ease-out]">
                            <span className="mr-1 text-[12px] text-[#8F908A]">Revertir {m.sku}: vuelven</span>
                            <input type="number" min={1} max={vigentes} value={abierto.cantidad} aria-label="Unidades" onChange={(e) => setRevertir({ ...abierto, cantidad: Math.max(1, Math.min(vigentes, Number(e.target.value) || 1)) })} className={`${campo} w-14 text-[#EDEDE7]`} />
                            <input autoFocus value={abierto.motivo} placeholder="Motivo" aria-label="Motivo" onChange={(e) => setRevertir({ ...abierto, motivo: e.target.value })} className={`${campo} w-56 text-[#EDEDE7]`} />
                            <button type="button" disabled={abierto.motivo.trim().length < 5 || abierto.estado === "guardando"} onClick={confirmarRevertir} className="h-8 rounded-lg bg-[#D7FF4F] px-3 text-[12.5px] font-bold text-[#141510] disabled:opacity-50">
                              {abierto.estado === "guardando" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : abierto.estado === "listo" ? "✓ Revertida" : "Revertir"}
                            </button>
                            <button type="button" aria-label="Cerrar" onClick={() => setRevertir(null)} className="text-[#8F908A] hover:text-[#EDEDE7]"><X className="h-3.5 w-3.5" aria-hidden="true" /></button>
                            {abierto.error ? <span className="basis-full text-right text-[12px] text-[#FFB07A] animate-[sg-sacudir_300ms_ease-out]">{abierto.error}</span> : null}
                          </span>
                        </td>
                      </tr>
                    ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="px-3 py-6 text-center text-[12.5px] text-[#8F908A]">Nada dado de baja con estos filtros.</p>
          )}
        </div>
      ) : null}
    </>
  );
}

// ─── Resumen (Administrador) ─────────────────────────────────────────────────

function VistaResumen({ barra, onAbrir }: { barra: ReactNode; onAbrir: (sku: string) => void }) {
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [rango, setRango] = useState({ desde: "", hasta: "" });
  const [ambito, setAmbito] = useState<"Mercadería" | "Activo">("Mercadería");
  const [datos, setDatos] = useState<KardexResumen | null>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [abiertas, setAbiertas] = useState<string[]>([]);
  const opciones = PERIODOS.filter((p) => p.key !== "todo" && p.key !== "hoy");

  const { desde, hasta } = rangoDe(periodo, rango);
  useEffect(() => {
    if (!desde || !hasta) return;
    let vivo = true;
    setCargando(true);
    setError("");
    pedir<KardexResumen>(`/api/shipping-v2/kardex?vista=resumen&agrupar=sku&ambito=${encodeURIComponent(ambito)}&desde=${desde}&hasta=${hasta}`)
      .then((d) => vivo && setDatos(d))
      .catch((e) => vivo && setError(e instanceof Error ? e.message : "No se pudo cargar."))
      .finally(() => vivo && setCargando(false));
    return () => { vivo = false; };
  }, [desde, hasta, ambito]);

  const categorias = useMemo(() => {
    const out = new Map<string, { nombre: string; filas: KardexResumen["filas"]; t: KardexResumen["total"]; ultimaVenta: string | null }>();
    for (const f of datos?.filas ?? []) {
      const c = out.get(f.categoria) ?? { nombre: f.categoria, filas: [], t: { inicialU: 0, inicialV: 0, entradasU: 0, entradasV: 0, ajustesV: 0, salidasU: 0, salidasV: 0, finalU: 0, finalV: 0 }, ultimaVenta: null };
      c.filas.push(f);
      for (const k of Object.keys(c.t) as Array<keyof typeof c.t>) c.t[k] = Math.round((c.t[k] + f[k]) * 100) / 100;
      if (f.ultimaVenta && (!c.ultimaVenta || f.ultimaVenta > c.ultimaVenta)) c.ultimaVenta = f.ultimaVenta;
      out.set(f.categoria, c);
    }
    return [...out.values()].sort((a, b) => b.t.finalV - a.t.finalV);
  }, [datos]);

  function exportar() {
    if (!datos) return;
    const cols = [
      { titulo: "Categoría", ancho: 18 }, { titulo: "SKU · Artículo", ancho: 44 },
      { titulo: "Inicial u.", ancho: 9 }, { titulo: "Inicial $", ancho: 12 }, { titulo: "Entradas u.", ancho: 10 }, { titulo: "Entradas $", ancho: 12 },
      { titulo: "Ajustes $", ancho: 11 }, { titulo: "Salidas u.", ancho: 10 }, { titulo: "Salidas $", ancho: 12 }, { titulo: "Final u.", ancho: 9 }, { titulo: "Final $", ancho: 12 }, { titulo: "Última venta", ancho: 12 },
    ];
    const rows = (datos.filas).map((f) => [f.categoria, f.etiqueta, f.inicialU, f.inicialV, f.entradasU, f.entradasV, f.ajustesV, f.salidasU, f.salidasV, f.finalU, f.finalV, f.ultimaVenta ? fechaCorta(f.ultimaVenta, false) : ""]);
    const t = datos.total;
    rows.push(["Total", "", t.inicialU, t.inicialV, t.entradasU, t.entradasV, t.ajustesV, t.salidasU, t.salidasV, t.finalU, t.finalV, ""]);
    descargarXlsx(crearTablaXlsx(`Resumen ${desde} a ${hasta}`, cols, rows), `kardex-resumen-${desde}.xlsx`);
  }

  const th = "px-2 py-1.5 text-right text-[10.5px] font-semibold uppercase tracking-wide text-[#8F908A] whitespace-nowrap";
  const td = "px-2 py-1.5 text-right tabular-nums whitespace-nowrap";
  const g = "border-l border-[#30312D]";
  const celdas = (t: KardexResumen["total"], ultima: string | null) => (
    <>
      <td className={`${td} ${g}`}>{t.inicialU}</td><td className={td}>{dinero(t.inicialV)}</td>
      <td className={`${td} ${g}`}>{t.entradasU}</td><td className={td}>{dinero(t.entradasV)}</td>
      <td className={`${td} ${g} ${t.ajustesV ? "text-[#C9B6FF]" : ""}`}>{dinero(t.ajustesV, { signo: true })}</td>
      <td className={`${td} ${g}`}>{t.salidasU}</td><td className={td}>{dinero(t.salidasV)}</td>
      <td className={`${td} ${g} font-semibold`}>{t.finalU}</td><td className={`${td} font-semibold`}>{dinero(t.finalV)}</td>
      <td className={`${td} ${g} text-[#8F908A]`}>{ultima ? fechaCorta(ultima, false) : ""}</td>
    </>
  );
  // "Inventario al…": el último día del periodo, o hoy si el periodo no ha terminado.
  const ultimoDia = hasta ? [sumarDias(hasta, -1), ecuadorHoy()].sort()[0] : "";

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {barra}
        <div className="inline-flex overflow-hidden rounded-lg border border-[#3A3B35]" role="tablist" aria-label="Ámbito">
          <button type="button" role="tab" aria-selected={ambito === "Mercadería"} onClick={() => setAmbito("Mercadería")} className={segmento(ambito === "Mercadería")}>Mercadería</button>
          <button type="button" role="tab" aria-selected={ambito === "Activo"} onClick={() => setAmbito("Activo")} className={`border-l border-[#3A3B35] ${segmento(ambito === "Activo")}`}>Activos</button>
        </div>
        <SelectorPeriodo valor={periodo} onCambio={setPeriodo} rango={rango} onRango={setRango} opciones={opciones} />
        <span className="ml-auto" />
        <button type="button" className={boton} onClick={exportar} disabled={!datos?.filas.length}><Download className="h-3.5 w-3.5" aria-hidden="true" />Excel</button>
      </div>

      {error ? <Aviso>{error}</Aviso> : null}
      {datos ? (
        <section className={`flex flex-wrap items-baseline gap-x-6 gap-y-1 rounded-xl border border-[#30312D] bg-[#171814] px-3 py-2.5 text-[12.5px] tabular-nums transition-opacity ${cargando ? "opacity-60" : ""}`}>
          <span><span className="text-[#8F908A]">Inventario al {fechaCorta(ultimoDia, false)} </span><span className="font-[Barlow,sans-serif] text-[17px] font-bold">{datos.inventario.unidades} u. · {dinero(datos.inventario.valor)}</span></span>
          {ambito === "Mercadería" ? (
            <>
              <span><span className="text-[#8F908A]">Costo de lo vendido </span>{dinero(datos.costoVendido)}</span>
              <span><span className="text-[#8F908A]">Ventas sin IVA </span>{dinero(datos.ventas)}</span>
              <span className="text-[#7BE495]"><span className="text-[#8F908A]">Ganancia </span>{dinero(datos.ganancia)}</span>
            </>
          ) : null}
        </section>
      ) : cargando ? <p className="flex items-center gap-2 px-1 py-6 text-[12.5px] text-[#8F908A]"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />Calculando…</p> : null}

      {datos ? (
        <div className={`overflow-x-auto rounded-xl border border-[#30312D] bg-[#171814] transition-opacity ${cargando ? "opacity-60" : ""}`}>
          {categorias.length ? (
            <table className="w-full min-w-[900px] border-collapse text-[12.5px]">
              <thead>
                <tr className="border-b border-[#252622]">
                  <th className={`${th} text-left`} />
                  <th className={`${th} ${g} text-center`} colSpan={2}>Inicial</th>
                  <th className={`${th} ${g} text-center`} colSpan={2}>Entradas</th>
                  <th className={`${th} ${g}`}>Ajustes</th>
                  <th className={`${th} ${g} text-center`} colSpan={2}>Salidas</th>
                  <th className={`${th} ${g} text-center`} colSpan={2}>Final</th>
                  <th className={`${th} ${g}`}>Últ. venta</th>
                </tr>
              </thead>
              <tbody>
                {categorias.map((c) => {
                  const abierta = abiertas.includes(c.nombre);
                  return (
                    <FragmentoCategoria key={c.nombre}>
                      <tr className="cursor-pointer border-b border-[#252622] bg-[#1C1D18] font-semibold hover:bg-[#21221C]" onClick={() => setAbiertas((l) => (abierta ? l.filter((x) => x !== c.nombre) : [...l, c.nombre]))}>
                        <td className="px-2 py-1.5 text-left"><span className="inline-flex items-center gap-1">{abierta ? <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}{c.nombre}<span className="font-normal text-[#8F908A]">· {c.filas.length}</span></span></td>
                        {celdas(c.t, c.ultimaVenta)}
                      </tr>
                      {abierta ? c.filas.map((f) => (
                        <tr key={f.clave} className="border-b border-[#252622] text-[#C9CAC1] animate-[sg-entrada_160ms_ease-out]">
                          <td className="max-w-[320px] truncate px-2 py-1.5 pl-7 text-left" title={f.etiqueta}>
                            <button type="button" onClick={() => onAbrir(f.clave)} className="font-mono font-semibold text-[#D7FF4F] hover:underline">{f.clave}</button>{" "}
                            <span>{f.etiqueta.replace(f.clave, "").trim()}</span>
                          </td>
                          {celdas(f, f.ultimaVenta)}
                        </tr>
                      )) : null}
                    </FragmentoCategoria>
                  );
                })}
                <tr className="text-[#D7FF4F]">
                  <td className="px-2 py-2 text-left font-bold">Total</td>
                  {celdas(datos.total, null)}
                </tr>
              </tbody>
            </table>
          ) : (
            <p className="px-3 py-6 text-center text-[12.5px] text-[#8F908A]">Sin movimientos en este periodo.</p>
          )}
        </div>
      ) : null}
    </>
  );
}

function FragmentoCategoria({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
