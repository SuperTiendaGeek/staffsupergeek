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

/** Lo que sigue en el inventario primero (lo más nuevo arriba); lo que salió, al final. */
function ordenar(hermanas: readonly ShippingV2UnidadHermana[]) {
  return [...hermanas].sort((a, b) => {
    const fa = sigueEnInventario(a) ? 0 : 1;
    const fb = sigueEnInventario(b) ? 0 : 1;
    return fa - fb || (b.fechaRegistro ?? "").localeCompare(a.fechaRegistro ?? "");
  });
}

/** Cómo se nombra una unidad: su serie, o "sin serie · fecha". */
export function nombreUnidad(h: Pick<ShippingV2UnidadHermana, "numeroSerie" | "fechaRegistro" | "seguimiento">) {
  const serie = normalizarSerie(h.numeroSerie);
  if (serie) return `S/N ${serie}`;
  return `${h.seguimiento === "Lote" ? "lote" : "sin serie"}${h.fechaRegistro ? ` · ${fechaCorta(h.fechaRegistro).replace(/\s\d{2}$/, "")}` : ""}`;
}

function detalleUnidad(h: ShippingV2UnidadHermana) {
  const origen = [OPERACION_CORTA[h.tipoOperacion ?? ""] ?? h.tipoOperacion, h.proveedorNombre].filter(Boolean).join(" · ");
  const insp = inspeccion(h);
  return [origen, h.fechaRegistro ? `ingresó ${fechaCorta(h.fechaRegistro)}` : "", `inspección: ${insp.texto.toLowerCase()}`].filter(Boolean).join(" · ");
}

/**
 * Rediseño (26-oct): las unidades del SKU en la columna de la izquierda, bajo
 * la foto. Una línea por unidad (serie, estado y costo o inspección); el resto
 * (origen, ingreso, inspección) al pasar el mouse. La unidad que se ve queda
 * marcada.
 */
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
  /** Con costos: la última columna es el costo; sin costos (técnico): la inspección. */
  verCostos: boolean;
  /** Kardex del producto (todas sus unidades). Sin enlace para quien no usa el Kardex. */
  kardexHref?: string;
  onElegir: (id: string) => void;
}) {
  const [todas, setTodas] = useState(false);
  // Punto 18b (velocidad): al pasar el mouse (o el teclado) por una unidad, su
  // ficha se pide por adelantado; al hacer clic aparece al instante.
  const precargar = useFichaArticulo()?.precargar;
  const ordenadas = ordenar(hermanas);
  const indiceActual = ordenadas.findIndex((h) => h.id === actualId);
  const visibles = todas
    ? ordenadas
    : indiceActual >= VISIBLES
      ? [...ordenadas.slice(0, VISIBLES - 1), ordenadas[indiceActual]]
      : ordenadas.slice(0, VISIBLES);
  const ocultas = ordenadas.length - visibles.length;
  const e = existenciasDelSku(hermanas);

  return (
    <section id={ID_BLOQUE_UNIDADES} aria-label={`Unidades de ${sku}`} className="scroll-mt-16 overflow-hidden rounded-lg border border-[#2E2F28] bg-[#171814]">
      <h2 className="flex items-center gap-2 border-b border-[#2E2F28] bg-[#1A1B17] px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-wide text-[#8F908A]">
        <Layers className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="flex-1">Unidades del SKU</span>
        {kardexHref ? (
          <Link href={kardexHref} className="font-semibold normal-case tracking-normal text-[#D7FF4F] hover:underline" title="Movimientos de todas las unidades del producto">
            Kardex del producto
          </Link>
        ) : null}
      </h2>
      <p className="border-b border-[#24251F] px-3 py-1 text-[11.5px] text-[#B4B5AC] [contain:inline-size]">
        <b className="font-semibold text-[#F5F5F5]">{e.enInventario}</b> en inventario
        {e.porEstado.map((x) => ` · ${x.cantidad} ${x.estado.toLowerCase()}`).join("")}
        {e.reservadas ? ` · ${e.reservadas} apartada${e.reservadas === 1 ? "" : "s"}` : ""}
        {e.salieron ? <span className="text-[#6F706B]"> · {e.salieron} salieron</span> : null}
      </p>
      <ul>
        {visibles.map((h) => {
          const actual = h.id === actualId;
          const serie = normalizarSerie(h.numeroSerie);
          const salio = !sigueEnInventario(h);
          const insp = inspeccion(h);
          return (
            <li key={h.id}>
              <button
                type="button"
                aria-current={actual ? "true" : undefined}
                onClick={() => (actual ? undefined : onElegir(h.id))}
                onMouseEnter={actual ? undefined : () => precargar?.(h.id)}
                onFocus={actual ? undefined : () => precargar?.(h.id)}
                title={`${actual ? "Unidad que estás viendo" : "Ver esta unidad"} · ${detalleUnidad(h)}`}
                className={`grid w-full grid-cols-[minmax(0,1fr)_4.75rem_3.75rem] items-center gap-1.5 border-b border-l-2 border-b-[#24251F] px-2.5 py-1 text-left text-[12px] leading-5 transition ${actual ? "border-l-[#D7FF4F] bg-[#D7FF4F]/[0.06]" : "border-l-transparent hover:bg-[#1D1E1A]"} ${salio ? "opacity-60" : ""}`}
              >
                <span className={`min-w-0 truncate whitespace-nowrap font-mono text-[11.5px] ${serie ? "font-semibold text-[#E6E6E1]" : actual ? "text-[#E6E6E1]" : "text-[#8F908A]"}`}>
                  {nombreUnidad(h)}
                  {(h.cantidad ?? 1) !== 1 ? <span className="ml-1 font-sans text-[11px] text-[#B4B5AC]">×{h.cantidad ?? 0}</span> : null}
                </span>
                <span className={`truncate font-semibold ${tonoEstado(h.estado)}`}>{h.estado}</span>
                {verCostos
                  ? <span className="text-right tabular-nums text-[#B4B5AC]">{dinero(h.costoUnidad)}</span>
                  : <span className={`truncate text-right ${insp.clase}`} title={insp.title}>{insp.texto}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {ocultas > 0 || todas ? (
        <button
          type="button"
          onClick={() => setTodas((v) => !v)}
          className="flex w-full items-center justify-center gap-1 py-0.5 text-[11.5px] font-semibold text-[#8F908A] transition hover:text-[#D7FF4F]"
        >
          {todas ? "Ver menos" : `Ver las ${ordenadas.length}`}
          <ChevronDown className={`h-3.5 w-3.5 transition ${todas ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      ) : null}
    </section>
  );
}
