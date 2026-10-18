import { unidadesLibres } from "@/lib/shipping-v2/unidades";
import { normalizarSerie, seguimientoDe } from "@/lib/shipping-v2/unidades-serie";

// "fuente" es obligatorio a propósito, no opcional: cada sitio que consume
// un ProductoCatalogo (agregarProducto en el formulario, hoy; cualquier
// otro futuro) tiene que decidir explícitamente qué hacer con cada fuente
// — un shippingItemId no significa lo mismo que un productoDigitalId, y un
// campo opcional dejaría pasar el caso "no decidí nada" sin que el
// compilador se queje.
export type FuenteProductoCatalogo = "shippingItem" | "productoDigital";

export type ProductoCatalogo = {
  id: string;
  sku: string;
  nombre: string;
  descripcion: string;
  precioVenta: number;
  unidad: string;
  cantidadDisponible: number;
  fuente: FuenteProductoCatalogo;
  /** Punto 10b-5: la serie de la unidad (equipos), para elegirla y para la factura. */
  numeroSerie?: string;
  /** Punto 10b-5: "Unidad" o "Lote" (vacío = el de la categoría). */
  seguimiento?: "Unidad" | "Lote";
  /** Punto 10b-5: para ordenar los lotes del más antiguo al más nuevo. */
  fechaRegistro?: string;
  /** Punto 10b-5: lo que se muestra junto al SKU en el buscador ("S/N 7HX2KQ3", "Lote 05-ago · más antiguo"). */
  detalle?: string;
};

type ProductoRecord = {
  id: string;
  fields?: Record<string, unknown>;
};

function firstStr(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : "";
  return "";
}

function firstNum(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstPositiveNum(value: unknown): number | null {
  const parsed = firstNum(value);
  return parsed > 0 ? parsed : null;
}

export function escapeShippingItemsProductFormula(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * `incluirEnCamino`: Reserva y Proforma también ofrecen lo que todavía no
 * llega (se puede apartar o cotizar desde que existe). Factura y Recibo NO:
 * solo venden lo que ya está en la tienda. Por omisión, solo en tienda.
 */
export function buildShippingItemsProductFilterFormula(query: string, opts: { incluirEnCamino?: boolean } = {}) {
  const escaped = escapeShippingItemsProductFormula(query.trim().toLowerCase());
  const soloEnTienda = opts.incluirEnCamino !== true;

  return (
    `AND({Disponible para venta},` +
    // Punto 1 de la auditoría Shipping V2: el mostrador solo vende lo que YA
    // ESTÁ en la tienda. "Disponible para venta" dice que se puede reservar
    // (aunque venga en camino); para venderlo además tiene que haber llegado
    // y, si requiere inspección, tener la ficha firmada. Misma regla que
    // lib/shipping-v2/item-venta.ts (evaluarVentaItem), que es la que de
    // verdad bloquea al emitir (reglas/entregables.ts).
    (soloEnTienda ? `{Recibido},OR(NOT({Requiere inspección}),{Revisado física/técnicamente}),` : ``) +
    `{Cantidad}>=1,` +
    `{Precio venta final}>0,` +
    `OR(` +
      `SEARCH("${escaped}",LOWER({Nombre del item})),` +
      `SEARCH("${escaped}",LOWER({SKU})),` +
      // Punto 10b-5: escanear la serie de la etiqueta encuentra esa unidad.
      `SEARCH("${escaped}",LOWER(SUBSTITUTE({Número de serie}&""," ","")))` +
    `))`
  );
}

export function mapShippingItemProductRecord(record: ProductoRecord): ProductoCatalogo | null {
  const fields = record.fields ?? {};
  const precioVenta = firstPositiveNum(fields["Precio venta final"]);

  if (precioVenta === null) return null;

  return {
    id: record.id,
    sku: firstStr(fields["SKU"]),
    nombre: firstStr(fields["Nombre del item"] ?? fields["Nombre"]),
    descripcion: firstStr(fields["Descripción"] ?? fields["Descripcion"]),
    precioVenta,
    unidad: firstStr(fields["Unidad"]) || "UNIDAD",
    // Unidades LIBRES: las comprometidas con un cliente/orden/reserva no se
    // venden en mostrador (ver verificarStockDisponible).
    cantidadDisponible: unidadesLibres({
      cantidad: firstNum(fields["Cantidad"] ?? 0),
      cantidadReservada: firstNum(fields["Cantidad Reservada"] ?? 0),
      reservado: fields["Reservado"] === true,
    }),
    fuente: "shippingItem",
    numeroSerie: normalizarSerie(firstStr(fields["Número de serie"])) || undefined,
    seguimiento: seguimientoDe({ seguimiento: firstStr(fields["Seguimiento"]), categoria: firstStr(fields["Categoría"]) }),
    fechaRegistro: firstStr(fields["Fecha de registro"]) || undefined,
  };
}

function fechaCorta(iso?: string) {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("es-EC", { day: "2-digit", month: "short", timeZone: "America/Guayaquil" }).replace(".", "") : "";
}

/**
 * Punto 10b-5 (decisiones G y C2 del 17-oct): las unidades de un equipo se
 * muestran con su serie para elegir la exacta; los lotes de un mismo SKU, del
 * más antiguo al más nuevo, con el primero marcado "más antiguo" (se vende
 * primero lo que entró primero, cada lote con su costo).
 */
export function ordenarYDetallarProductos(productos: ProductoCatalogo[]): ProductoCatalogo[] {
  const lotesPorSku = new Map<string, ProductoCatalogo[]>();
  for (const p of productos) {
    if (p.fuente !== "shippingItem" || p.seguimiento !== "Lote") continue;
    const clave = p.sku.toUpperCase();
    lotesPorSku.set(clave, [...(lotesPorSku.get(clave) ?? []), p]);
  }
  const antiguedad = (p: ProductoCatalogo) => p.fechaRegistro ?? "";
  for (const lotes of lotesPorSku.values()) lotes.sort((a, b) => antiguedad(a).localeCompare(antiguedad(b)) || a.id.localeCompare(b.id));

  const vistos = new Set<string>();
  const salida: ProductoCatalogo[] = [];
  for (const p of productos) {
    if (vistos.has(p.id)) continue;
    const lotes = p.fuente === "shippingItem" && p.seguimiento === "Lote" ? lotesPorSku.get(p.sku.toUpperCase()) : undefined;
    if (lotes && lotes.length > 1) {
      lotes.forEach((l, i) => {
        vistos.add(l.id);
        salida.push({ ...l, detalle: `Lote ${fechaCorta(l.fechaRegistro)}${i === 0 ? " · más antiguo" : ""}`.trim() });
      });
      continue;
    }
    vistos.add(p.id);
    // Cada equipo con su serie para elegir la unidad exacta; el que no la
    // tiene se puede vender igual (una etiqueta borrosa no frena la venta).
    salida.push(p.fuente === "shippingItem" && p.seguimiento === "Unidad" ? { ...p, detalle: p.numeroSerie ? `S/N ${p.numeroSerie}` : "sin serie" } : p);
  }
  return salida;
}
