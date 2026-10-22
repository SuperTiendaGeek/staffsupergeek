// Separar una unidad de un registro con varias (punto 10b, 17-oct-2026).
//
// Un registro como LAP-000076 con 9 laptops pasa a tener 8, y nace un registro
// nuevo con 1 laptop y el MISMO SKU (las dos son unidades del mismo producto;
// se distinguen por su serie). Sirve para desarmar una sola unidad, y servirá
// para separar los registros de equipos que hoy tienen varias unidades.
//
// Regla de oro del dueño: los costos no se pierden ni se mezclan. La unidad
// nueva se lleva SU parte exacta de flete, arancel y otros de la caja (no un
// "otros costos" genérico), las mismas unidades compradas que salen del
// original y los mismos vínculos de compra (orden de compra, pago, caja,
// proveedor), así que el total a respaldar de la compra y el reparto de la caja
// no cambian. Solo reglas, sin red: las escrituras están en airtable.ts.

import schema from "./schema.generated.json";
import { SHIPPING_V2_ITEM_FIELDS as F } from "./schema.generated";
import { normalizarUnidades, unidadesLibres } from "./unidades";

const TIPOS_COPIABLES = new Set([
  "singleLineText",
  "multilineText",
  "singleSelect",
  "multipleSelects",
  "checkbox",
  "dateTime",
  "date",
  "currency",
  "number",
  "percent",
  "url",
  "email",
  "phoneNumber",
  "multipleAttachments",
  "multipleRecordLinks",
]);

/**
 * Lo que NO pasa a la unidad nueva: cantidades y costos de registro (se
 * calculan aparte), su historia (documentos de venta, reservas, novedades,
 * eventos, mejoras, despiece, recepción) y las marcas de quién la registró.
 */
const NO_COPIAR = new Set<string>([
  F.sku,
  F.numeroSerie,
  F.cantidad,
  F.cantidadReservada,
  F.reservado,
  F.unidadesCompradas,
  F.unidadesEnPacking,
  F.fleteAsignadoRegistro,
  F.arancelAsignadoRegistro,
  F.otrosCostosAsignadosRegistro,
  F.estadoDespiece,
  F.evidencias,
  F.fechaRegistro,
  F.registradoPor,
  F.ultimaActualizacion,
  F.actualizadoPor,
  F.observacionesInternas,
  "Unidades dadas de baja",
  "Item padre",
  "Items hijos",
  "Shipping Recepciones",
  "Shipping Novedades",
  "Shipping Migraciones",
  "Shipping Eventos",
  "Shipping Destinatarios",
  "Operación Comercial",
  "Opción origen",
  "Orden de Reparación (Stock)",
  "Factura",
  "Nota de Crédito",
  "Recibo",
  "Reservas",
  "Shipping Intervenciones",
  "Presupuesto por Orden",
  "Intervenciones (pieza retirada)",
  "Costo asignado por despiece",
  "Costo de mejoras",
  "Motivo de despiece",
  "Fecha de despiece",
  "Responsable de despiece",
  // Punto 10d: un anuncio aparte es de UNA unidad (vínculo inverso de Shipping Publicaciones).
  "Shipping Publicaciones", "Shipping Revisión de inventario", "Shipping Conteo líneas",
  "Shipping Cambios de código", "SKUs anteriores",
]);

type CampoEsquema = { type?: string };
const CAMPOS_ITEMS = (schema as { tables: Record<string, { fields: Record<string, CampoEsquema> }> }).tables["Shipping Items"].fields;

export type EvaluacionSeparar = { ok: true } | { ok: false; motivo: string };

export function evaluarSepararUnidad(item: {
  cantidad?: number | null;
  cantidadReservada?: number | null;
  reservado?: boolean | null;
  estado?: string | null;
  usoLocal?: boolean | null;
}, opciones: { esAdministrador: boolean }): EvaluacionSeparar {
  if (!opciones.esAdministrador) return { ok: false, motivo: "Solo un Administrador puede separar unidades." };
  if (item.usoLocal === true) return { ok: false, motivo: "Es un activo de la tienda: usa las acciones de Activos." };
  const estado = String(item.estado ?? "").trim().toLowerCase();
  if (["vendido", "agotado", "dado de baja", "cancelado", "desarmado completamente", "desarmado parcialmente"].includes(estado)) {
    return { ok: false, motivo: `Un artículo "${item.estado}" no se separa.` };
  }
  if (normalizarUnidades(item.cantidad) < 2) return { ok: false, motivo: "Este registro ya es una sola unidad." };
  if (unidadesLibres({ cantidad: item.cantidad, cantidadReservada: item.cantidadReservada, reservado: item.reservado }) < 1) {
    return { ok: false, motivo: "Todas las unidades están reservadas: libera una antes de separarla." };
  }
  return { ok: true };
}

const centavos = (v: number) => Math.round(v * 100);

/**
 * Los costos de la caja guardados en el registro (flete, arancel y otros son
 * TOTALES del registro, repartidos entre sus "Unidades en packing"): la unidad
 * nueva se lleva lo de una unidad y el original conserva el resto, al centavo.
 */
export function repartoRegistroAlSeparar(input: {
  unidadesEnPacking?: number | null;
  flete?: number | null;
  arancel?: number | null;
  otros?: number | null;
}) {
  const unidades = normalizarUnidades(input.unidadesEnPacking);
  const parte = (total?: number | null) => {
    if (!(unidades > 0) || typeof total !== "number" || !Number.isFinite(total)) return { nueva: null as number | null, original: total ?? null };
    const una = Math.round(centavos(total) / unidades);
    return { nueva: una / 100, original: (centavos(total) - una) / 100 };
  };
  const flete = parte(input.flete);
  const arancel = parte(input.arancel);
  const otros = parte(input.otros);
  return {
    nueva: { unidadesEnPacking: unidades > 0 ? 1 : null, flete: flete.nueva, arancel: arancel.nueva, otros: otros.nueva },
    original: { unidadesEnPacking: unidades > 0 ? unidades - 1 : null, flete: flete.original, arancel: arancel.original, otros: otros.original },
  };
}

/**
 * Campos del registro nuevo a partir del registro original tal como lo
 * devuelve Airtable. Copia solo lo que el esquema conoce y se puede escribir.
 */
export function camposUnidadSeparada(
  original: Record<string, unknown>,
  opciones: { nota: string; actor: string; ahora?: string }
): Record<string, unknown> {
  const ahora = opciones.ahora ?? new Date().toISOString();
  const campos: Record<string, unknown> = {};
  for (const [nombre, valor] of Object.entries(original)) {
    if (NO_COPIAR.has(nombre)) continue;
    const tipo = CAMPOS_ITEMS[nombre]?.type;
    if (!tipo || !TIPOS_COPIABLES.has(tipo)) continue;
    if (valor === null || valor === undefined || valor === "" || (Array.isArray(valor) && valor.length === 0)) continue;
    if (tipo === "multipleAttachments" && Array.isArray(valor)) {
      campos[nombre] = valor
        .filter((a): a is { url: string; filename?: string } => Boolean(a && typeof (a as { url?: unknown }).url === "string"))
        .map((a) => ({ url: a.url, ...(a.filename ? { filename: a.filename } : {}) }));
      continue;
    }
    campos[nombre] = valor;
  }

  const sku = typeof original[F.sku] === "string" ? (original[F.sku] as string) : "";
  const reparto = repartoRegistroAlSeparar({
    unidadesEnPacking: original[F.unidadesEnPacking] as number,
    flete: original[F.fleteAsignadoRegistro] as number,
    arancel: original[F.arancelAsignadoRegistro] as number,
    otros: original[F.otrosCostosAsignadosRegistro] as number,
  });
  const compradas = normalizarUnidades(original[F.unidadesCompradas] as number);
  const obsPrevias = typeof original[F.observacionesInternas] === "string" ? (original[F.observacionesInternas] as string).trim() : "";

  return {
    ...campos,
    [F.sku]: sku,
    [F.cantidad]: 1,
    [F.cantidadReservada]: 0,
    [F.reservado]: false,
    ...(compradas > 0 ? { [F.unidadesCompradas]: 1 } : {}),
    ...(reparto.nueva.unidadesEnPacking ? { [F.unidadesEnPacking]: 1 } : {}),
    ...(reparto.nueva.flete !== null ? { [F.fleteAsignadoRegistro]: reparto.nueva.flete } : {}),
    ...(reparto.nueva.arancel !== null ? { [F.arancelAsignadoRegistro]: reparto.nueva.arancel } : {}),
    ...(reparto.nueva.otros !== null ? { [F.otrosCostosAsignadosRegistro]: reparto.nueva.otros } : {}),
    [F.observacionesInternas]: [opciones.nota, obsPrevias].filter(Boolean).join("\n"),
    [F.fechaRegistro]: ahora,
    [F.registradoPor]: opciones.actor,
    [F.ultimaActualizacion]: ahora,
    [F.actualizadoPor]: opciones.actor,
  };
}

/** Lo que cambia en el registro original: una unidad menos y su parte de costos. */
export function camposOriginalTrasSeparar(original: Record<string, unknown>, opciones: { actor: string; ahora?: string }): Record<string, unknown> {
  const ahora = opciones.ahora ?? new Date().toISOString();
  const reparto = repartoRegistroAlSeparar({
    unidadesEnPacking: original[F.unidadesEnPacking] as number,
    flete: original[F.fleteAsignadoRegistro] as number,
    arancel: original[F.arancelAsignadoRegistro] as number,
    otros: original[F.otrosCostosAsignadosRegistro] as number,
  });
  const compradas = normalizarUnidades(original[F.unidadesCompradas] as number);
  return {
    [F.cantidad]: normalizarUnidades(original[F.cantidad] as number) - 1,
    ...(compradas > 0 ? { [F.unidadesCompradas]: Math.max(compradas - 1, 0) } : {}),
    ...(reparto.original.unidadesEnPacking !== null ? { [F.unidadesEnPacking]: reparto.original.unidadesEnPacking } : {}),
    ...(reparto.nueva.flete !== null ? { [F.fleteAsignadoRegistro]: reparto.original.flete } : {}),
    ...(reparto.nueva.arancel !== null ? { [F.arancelAsignadoRegistro]: reparto.original.arancel } : {}),
    ...(reparto.nueva.otros !== null ? { [F.otrosCostosAsignadosRegistro]: reparto.original.otros } : {}),
    [F.ultimaActualizacion]: ahora,
    [F.actualizadoPor]: opciones.actor,
  };
}
