"use client";

// Punto 18b (25-oct-2026): la ficha es el CONTENEDOR del SKU. Este bloque
// lista los registros (unidades o lotes) que comparten el SKU, con lo que los
// distingue sin inventar códigos: serie (o "sin serie" con su fecha), estado,
// cantidad, origen, inspección y, para quien los ve, el costo. Al elegir una
// fila, la misma ficha pasa a esa unidad: lo del producto queda igual y cambia
// solo lo propio del registro (costos, recorrido, pestañas, novedades).

import Link from "next/link";
import { useState } from "react";
import { ChevronDown, Layers } from "lucide-react";
import type { ShippingV2UnidadHermana } from "@/types/shipping-v2";
import { existenciasDelSku, sigueEnInventario } from "@/lib/shipping-v2/ficha-articulo";
import { normalizarSerie } from "@/lib/shipping-v2/unidades-serie";
import { useFichaArticulo } from "./contexto";

export const ID_BLOQUE_UNIDADES = "unidades-del-sku";
const VISIBLES = 5;

// Columnas escritas completas (Tailwind solo genera las clases que ve enteras
// en el código; armarlas por partes dejaba la tabla en una sola columna).
const COLUMNAS_CON_COSTO = "grid-cols-[minmax(6.5rem,1.1fr)_minmax(5.5rem,1fr)_2.25rem_minmax(6rem,1.4fr)_4.25rem_4.5rem_4.5rem]";
const COLUMNAS_SIN_COSTO = "grid-cols-[minmax(6.5rem,1.1fr)_minmax(5.5rem,1fr)_2.25rem_minmax(6rem,1.4fr)_4.25rem_4.5rem]";

const OPERACION_CORTA: Record<string, string> = {
  "Compra a proveedor": "Compra",
  "Compra ya pagada": "Compra",
  "Reajuste de inventario": "Reajuste",
  "Regalo de proveedor": "Regalo",
  "Encargo de cliente": "Encargo",
  "Pedido de cliente": "Encargo",
  "Despiece": "Despiece",
  "Parte / componente": "Despiece",
};

function dinero(valor: number | null | undefined) {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(valor);
}

function fechaCorta(valor?: string) {
  if (!valor) return "";
  const soloFecha = /^\d{4}-\d{2}-\d{2}$/.test(valor);
  const fecha = new Date(soloFecha ? `${valor}T12:00:00Z` : valor);
  if (Number.isNaN(fecha.getTime())) return valor;
  return new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "short", year: "2-digit", timeZone: soloFecha ? "UTC" : "America/Guayaquil" }).format(fecha);
}

function tonoEstado(estado: string) {
  const e = estado.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (e.includes("disponible")) return "text-[#D7FF4F]";
  if (e.includes("reservado")) return "text-[#F4E85B]";
  if (e.includes("transito") || e.includes("packing") || e.includes("registrado")) return "text-violet-200";
  if (e.includes("novedad") || e.includes("revision")) return "text-[#FFB07A]";
  return "text-[#8F908A]";
}

function inspeccion(h: ShippingV2UnidadHermana) {
  if (h.inspeccionFirmada) return { texto: "Firmada", clase: "text-[#9FEFB3]", title: [h.revisadoPor, fechaCorta(h.fechaRevision)].filter(Boolean).join(" · ") || undefined };
  if (!h.recibido) return { texto: "—", clase: "text-[#5E5F59]", title: "Aún no llega" };
  if (h.requiereInspeccion) return { texto: "Pendiente", clase: "text-[#F4C95B]", title: "Falta revisar y firmar" };
  return { texto: "No requiere", clase: "text-[#6F706B]", title: undefined };
}

export function UnidadesDelSku({
  sku,
  hermanas,
  actualId,
  verCostos,
  kardexHref,
  onElegir,
}: {
  sku: string;
  hermanas: readonly ShippingV2UnidadHermana[];
  actualId: string;
  verCostos: boolean;
  /** Kardex del producto (todas sus unidades). Sin enlace para quien no usa el Kardex. */
  kardexHref?: string;
  onElegir: (id: string) => void;
}) {
  const [todas, setTodas] = useState(false);
  // Punto 18b (velocidad): al pasar el mouse (o el teclado) por una unidad, su
  // ficha se pide por adelantado; al hacer clic aparece al instante.
  const precargar = useFichaArticulo()?.precargar;
  // Lo que sigue en el inventario primero (lo más nuevo arriba); lo que salió, al final.
  const ordenadas = [...hermanas].sort((a, b) => {
    const fa = sigueEnInventario(a) ? 0 : 1;
    const fb = sigueEnInventario(b) ? 0 : 1;
    return fa - fb || (b.fechaRegistro ?? "").localeCompare(a.fechaRegistro ?? "");
  });
  const indiceActual = ordenadas.findIndex((h) => h.id === actualId);
  const visibles = todas
    ? ordenadas
    : indiceActual >= VISIBLES
      ? [...ordenadas.slice(0, VISIBLES - 1), ordenadas[indiceActual]]
      : ordenadas.slice(0, VISIBLES);
  const ocultas = ordenadas.length - visibles.length;
  const e = existenciasDelSku(hermanas);
  const columnas = verCostos ? COLUMNAS_CON_COSTO : COLUMNAS_SIN_COSTO;

  return (
    <section id={ID_BLOQUE_UNIDADES} className="scroll-mt-16 overflow-hidden rounded-lg border border-[#2E2F28] bg-[#171814]">
      <h2 className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b border-[#2E2F28] bg-[#1A1B17] px-3 py-1 text-[10.5px] font-bold uppercase tracking-wide text-[#8F908A]">
        <Layers className="h-3.5 w-3.5" aria-hidden="true" />
        Unidades de {sku}
        <span className="font-semibold normal-case tracking-normal text-[#B4B5AC]">
          {e.enInventario} en inventario
          {e.porEstado.map((x) => ` · ${x.cantidad} ${x.estado.toLowerCase()}`).join("")}
          {e.reservadas ? ` · ${e.reservadas} apartada${e.reservadas === 1 ? "" : "s"}` : ""}
          {e.salieron ? <span className="text-[#6F706B]"> · {e.salieron} salieron</span> : null}
        </span>
        {kardexHref ? (
          <Link href={kardexHref} className="ml-auto font-semibold normal-case tracking-normal text-[#D7FF4F] hover:underline" title="Movimientos de todas las unidades del producto">
            Kardex del producto
          </Link>
        ) : null}
      </h2>
      <div role="table" aria-label={`Unidades de ${sku}`} className="overflow-x-auto">
        <div role="row" className={`grid ${columnas} min-w-[32rem] items-center gap-2 border-b border-[#24251F] px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#6F706B]`}>
          <span role="columnheader">Serie</span>
          <span role="columnheader">Estado</span>
          <span role="columnheader" className="text-right">Cant.</span>
          <span role="columnheader">Origen</span>
          <span role="columnheader">Ingreso</span>
          <span role="columnheader">Inspección</span>
          {verCostos ? <span role="columnheader" className="text-right">Costo u.</span> : null}
        </div>
        {visibles.map((h) => {
          const actual = h.id === actualId;
          const serie = normalizarSerie(h.numeroSerie);
          const salio = !sigueEnInventario(h);
          const insp = inspeccion(h);
          const origen = [OPERACION_CORTA[h.tipoOperacion ?? ""] ?? h.tipoOperacion, h.proveedorNombre].filter(Boolean).join(" · ");
          return (
            <button
              key={h.id}
              type="button"
              role="row"
              aria-current={actual ? "true" : undefined}
              onClick={() => (actual ? undefined : onElegir(h.id))}
              onMouseEnter={actual ? undefined : () => precargar?.(h.id)}
              onFocus={actual ? undefined : () => precargar?.(h.id)}
              title={actual ? "Unidad que estás viendo" : "Ver esta unidad"}
              className={`grid w-full ${columnas} min-w-[32rem] items-center gap-2 border-b border-l-2 border-b-[#24251F] px-3 py-1 text-left text-[12px] leading-5 transition last:border-b-0 ${actual ? "border-l-[#D7FF4F] bg-[#D7FF4F]/[0.06]" : "border-l-transparent hover:bg-[#1D1E1A]"} ${salio ? "opacity-60" : ""}`}
            >
              <span role="cell" className={`truncate font-mono ${serie ? "font-semibold text-[#E6E6E1]" : "text-[#8F908A]"}`}>
                {serie ? `S/N ${serie}` : "sin serie"}
                {h.seguimiento === "Lote" ? <span className="ml-1 font-sans text-[11px] text-[#8F908A]">lote</span> : null}
              </span>
              <span role="cell" className={`truncate font-semibold ${tonoEstado(h.estado)}`}>{h.estado}</span>
              <span role="cell" className="text-right tabular-nums text-[#E6E6E1]">
                {h.cantidad ?? 0}
                {(h.cantidadReservada ?? 0) > 0 ? <span className="ml-0.5 text-[11px] text-[#F4E85B]" title={`${h.cantidadReservada} apartada(s)`}>·{h.cantidadReservada}</span> : null}
              </span>
              <span role="cell" className="truncate text-[#B4B5AC]" title={origen || undefined}>{origen || "—"}</span>
              <span role="cell" className="truncate text-[#8F908A]">{fechaCorta(h.fechaRegistro)}</span>
              <span role="cell" className={`truncate ${insp.clase}`} title={insp.title}>{insp.texto}</span>
              {verCostos ? <span role="cell" className="text-right tabular-nums text-[#B4B5AC]">{dinero(h.costoUnidad)}</span> : null}
            </button>
          );
        })}
      </div>
      {ocultas > 0 || todas ? (
        <button
          type="button"
          onClick={() => setTodas((v) => !v)}
          className="flex w-full items-center justify-center gap-1 border-t border-[#24251F] py-0.5 text-[11.5px] font-semibold text-[#8F908A] transition hover:text-[#D7FF4F]"
        >
          {todas ? "Ver menos" : `Ver las ${ordenadas.length}`}
          <ChevronDown className={`h-3.5 w-3.5 transition ${todas ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      ) : null}
    </section>
  );
}
