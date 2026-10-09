// Cómo vuelve un artículo al inventario (auditoría Shipping V2, punto 7 ·
// 9-oct-2026). UNA sola regla para los tres caminos: anular una factura,
// anular un recibo y la nota de crédito con devolución física.
//
// ─── Decisiones del dueño ───────────────────────────────────────────────────
// · ANULACIÓN (factura o recibo): fue un error del documento; el artículo no
//   salió o vuelve igual. Vuelve como estaba (sin reabrir la inspección). Si
//   el documento venía de una orden, un pedido o una reserva, la unidad vuelve
//   a quedar APARTADA para ese mismo origen, lista para el documento correcto.
// · DEVOLUCIÓN del cliente (nota de crédito con devolución física): la unidad
//   queda libre. Si su categoría pide inspección (laptops, RAM, SSD,
//   baterías…) vuelve a "En revisión" con la inspección reabierta; un cable o
//   accesorio vuelve directo a la venta. Al devolverlo se indica si viene en
//   BUEN ESTADO o CON FALLA: con falla queda en revisión siempre, con la nota
//   de la falla, y no se vende hasta firmar la inspección.
// · En los dos casos se respetan los bloqueos: un activo sigue siendo activo y
//   un artículo con novedad abierta sigue "Con novedad" (antes todo volvía a
//   "Disponible" a ciegas — F-4).
//
// Módulo puro: recibe los campos del registro tal como vienen de Airtable y
// devuelve los campos a escribir. Sin red.

import { calcularDisponibleVenta } from "./item-comercial";
import { estadoSegunLlegada, requiereInspeccionPorDefecto } from "./item-venta";
import { normalizarUnidades, unidadesReservadas } from "./unidades";

export type TipoRetorno = "anulacion" | "devolucion";
export type CondicionDevolucion = "buena" | "falla";

function normalize(value?: string | null) {
  return String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}
function texto(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "name" in (v as Record<string, unknown>)) return String((v as { name: unknown }).name ?? "");
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return "";
}

/** Etiquetas de "ya salió": al volver, el artículo arranca como recién llegado. */
const SALIDAS_POR_VENTA = new Set(["vendido", "agotado"]);

/**
 * Campos a escribir en el Shipping Item cuando vuelven `cantidad` unidades.
 * NO incluye los vínculos al documento (Factura / Recibo / Nota de Crédito):
 * cada camino maneja los suyos.
 */
export function camposRetornoItem(
  f: Record<string, unknown>,
  input: {
    cantidad: number;
    tipo: TipoRetorno;
    /** Anulación de un documento con origen (orden, pedido o reserva). */
    reapartar?: boolean;
    condicion?: CondicionDevolucion;
    notaFalla?: string;
    /** Fecha (texto) para la nota de la falla. */
    fecha?: string;
  }
): Record<string, unknown> {
  const n = normalizarUnidades(input.cantidad);
  const actuales = {
    cantidad: normalizarUnidades(f["Cantidad"]),
    cantidadReservada: normalizarUnidades(f["Cantidad Reservada"]),
    reservado: f["Reservado"] === true,
  };
  const nuevaCantidad = actuales.cantidad + n;
  const apartadasAntes = Math.min(unidadesReservadas(actuales), actuales.cantidad);
  const apartadas = Math.min(nuevaCantidad, apartadasAntes + (input.tipo === "anulacion" && input.reapartar ? n : 0));
  const todas = nuevaCantidad > 0 && apartadas >= nuevaCantidad;

  const estadoActual = texto(f["Estado Item"]);
  const base = SALIDAS_POR_VENTA.has(normalize(estadoActual)) ? "Recibido" : estadoActual;
  const usoLocal = f["Es uso local"] === true;
  const categoria = texto(f["Categoría"]);
  const tipoOperacion = texto(f["Tipo de operación"]);

  const campos: Record<string, unknown> = {
    "Cantidad": nuevaCantidad,
    "Cantidad Reservada": apartadas,
    "Reservado": todas,
    // Volvió físicamente (o nunca salió): está en la tienda.
    "Recibido": true,
  };

  let requiere = f["Requiere inspección"] === true;
  let firmada = f["Revisado física/técnicamente"] === true;
  let estadoRevision = texto(f["Estado de revisión"]);

  if (input.tipo === "devolucion") {
    const conFalla = input.condicion === "falla";
    const pideInspeccion = conFalla || requiere || requiereInspeccionPorDefecto({ categoria, tipoOperacion });
    if (pideInspeccion) {
      requiere = true;
      firmada = false;
      // Un veredicto de problema (Faltante, Dañado…) se respeta; si no, la
      // revisión queda pendiente.
      const bloqueante = ["faltante", "danado", "incompleto", "diferente al comprado", "en garantia con proveedor"].includes(normalize(estadoRevision));
      if (!bloqueante) estadoRevision = "Recibido pendiente de revisión";
      campos["Requiere inspección"] = true;
      campos["Revisado física/técnicamente"] = false;
      campos["Revisado por"] = "";
      campos["Fecha revisión"] = null;
      campos["Estado de revisión"] = estadoRevision;
    }
    if (conFalla) {
      const previo = texto(f["Observaciones internas"]).trim();
      const nota = `[${input.fecha ?? ""}] Devuelto CON FALLA${input.notaFalla?.trim() ? `: ${input.notaFalla.trim()}` : ""}. No se vende hasta firmar la inspección.`.replace("[] ", "");
      campos["Observaciones internas"] = previo ? `${previo}\n${nota}` : nota;
    }
  }

  const etiqueta = estadoSegunLlegada({
    estado: base,
    recibido: true,
    requiereInspeccion: requiere,
    inspeccionFirmada: firmada,
    usoLocal,
    todasReservadas: todas,
  });
  const estadoFinal = etiqueta ?? (base !== estadoActual ? base : null);
  if (estadoFinal) campos["Estado Item"] = estadoFinal;

  campos["Disponible para venta"] = calcularDisponibleVenta({
    estado: estadoFinal ?? estadoActual,
    estadoRevision,
    usoLocal,
    unidadesLibres: Math.max(0, nuevaCantidad - apartadas),
  });
  return campos;
}
