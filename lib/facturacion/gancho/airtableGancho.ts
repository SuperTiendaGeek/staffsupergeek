import "server-only";
import { evaluarVentaItem } from "@/lib/shipping-v2/item-venta";

// Lecturas de Airtable propias del gancho — deliberadamente separadas de
// lib/cuenta-unificada/index.ts (que no expone cliente, ni los campos de
// Shipping Items que necesita la precondición dura, ni el campo inverso de
// facturas) para no tocar ese módulo compartido, ya en producción, fuera de
// lo que pide esta PR.
//
// Regla de la casa: nunca filtrar por campo de link — se leen los IDs del
// campo inverso ya presentes en el registro y se hace fetch por RECORD_ID().
//
// ─── Las lecturas fallan en voz alta ─────────────────────────────────────────
// Hasta sep-2026, cualquier error de Airtable (un 429 por ráfaga, un 503) se
// leía como "no existe" o "no hay nada". En facturación eso era peligroso:
//   - Idempotencia: "no pude leer la orden" = "la orden no tiene factura" →
//     se podía emitir una segunda factura real.
//   - Inventario tras vender: "no pude leer el artículo" = "había 0" → la
//     Cantidad quedaba en 0 y se pisaba la lista de facturas del artículo.
//   - Pre-factura: "no pude leer el cliente" = Consumidor Final.
// Ahora un GET que falla se reintenta (es seguro: leer no cambia nada) y, si
// sigue fallando, LANZA ErrorLecturaAirtable. Solo un 404 de un registro
// puntual significa "no existe" (fetchRecord → null).

const ORDENES_TABLE   = "Órdenes de Reparación";
const OPERACIONES_TABLE = "Operación Comercial";
const RESERVAS_TABLE  = "Reservas";
const CLIENTES_TABLE  = "Clientes";
const SHIPPING_ITEMS_TABLE = "Shipping Items";
const FACTURAS_TABLE  = "Facturas Electrónicas";
const RECIBOS_TABLE   = "Recibos";

export type AirtableRecord = {
  id: string;
  fields: Record<string, unknown>;
};

type AirtableClient = {
  baseUrl: string;
  headers: HeadersInit;
};

function getClient(): AirtableClient {
  const token  = process.env.AIRTABLE_API_KEY?.trim();
  const baseId = process.env.AIRTABLE_BASE_ID?.trim();
  if (!token)  throw new Error("Falta AIRTABLE_API_KEY en .env.local.");
  if (!baseId) throw new Error("Falta AIRTABLE_BASE_ID en .env.local.");
  return {
    baseUrl: `https://api.airtable.com/v0/${baseId}`,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  };
}

export class ErrorLecturaAirtable extends Error {
  readonly tabla: string;
  readonly status: number | null;
  constructor(tabla: string, status: number | null, detalle?: string) {
    super(
      `No se pudo leer "${tabla}" en Airtable (${status ?? "sin respuesta"}${detalle ? `: ${detalle}` : ""}). Intenta de nuevo en un momento.`
    );
    this.name = "ErrorLecturaAirtable";
    this.tabla = tabla;
    this.status = status;
  }
}

// Texto para dejar constancia en un campo de estado ("Sincronización
// Inventario", "Reverso Inventario"…) cuando la lectura previa falló y por eso
// NO se escribió nada. Siempre dice qué quedó sin hacer, para que se reintente.
export function textoLecturaFallida(e: unknown, queNoSeHizo: string): string {
  const causa = e instanceof Error ? e.message : String(e);
  return `${causa} ${queNoSeHizo}`;
}

const STATUS_REINTENTABLES = new Set([429, 500, 502, 503, 504]);
const ESPERAS_REINTENTO_MS = [400, 1200];

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// GET con reintento. Un GET no cambia nada en Airtable, así que reintentar es
// seguro (a diferencia de un POST, que podría crear dos veces).
async function getConReintento(url: string, headers: HeadersInit, tabla: string): Promise<Response> {
  for (let intento = 0; ; intento++) {
    const ultimo = intento >= ESPERAS_REINTENTO_MS.length;
    let res: Response;
    try {
      res = await fetch(url, { headers, cache: "no-store" });
    } catch (e) {
      if (ultimo) throw new ErrorLecturaAirtable(tabla, null, e instanceof Error ? e.message : String(e));
      await esperar(ESPERAS_REINTENTO_MS[intento]);
      continue;
    }
    if (res.ok || ultimo || !STATUS_REINTENTABLES.has(res.status)) return res;
    await esperar(ESPERAS_REINTENTO_MS[intento]);
  }
}

// Un id de Airtable es "rec" + letras/números. Cualquier otra cosa (comillas
// incluidas) no se mete en la fórmula: no existe ningún registro con ese id,
// así que se trata como "no encontrado".
const PATRON_RECORD_ID = /^rec[A-Za-z0-9]+$/;

/** Un registro por id. 404 → null ("no existe"). Cualquier otro error → lanza. */
export async function fetchRecord(table: string, id: string): Promise<AirtableRecord | null> {
  const client = getClient();
  const res = await getConReintento(
    `${client.baseUrl}/${encodeURIComponent(table)}/${encodeURIComponent(id)}`,
    client.headers,
    table
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new ErrorLecturaAirtable(table, res.status);
  return (await res.json()) as AirtableRecord;
}

// Lotes de 50 ids por consulta para que la fórmula no crezca sin límite, y se
// sigue el "offset" de Airtable por si una página no alcanza.
const IDS_POR_CONSULTA = 50;

/**
 * Registros por id. Los que no existen simplemente no vienen en el resultado.
 * Si Airtable falla (después de reintentar) → lanza ErrorLecturaAirtable.
 * NUNCA devuelve [] por un error.
 */
export async function fetchRecordsByIds(table: string, ids: string[]): Promise<AirtableRecord[]> {
  const unicos = [...new Set(ids.filter((id) => typeof id === "string" && PATRON_RECORD_ID.test(id)))];
  if (unicos.length === 0) return [];
  const client = getClient();
  const registros: AirtableRecord[] = [];
  for (let i = 0; i < unicos.length; i += IDS_POR_CONSULTA) {
    const lote = unicos.slice(i, i + IDS_POR_CONSULTA);
    const formula =
      lote.length === 1
        ? `RECORD_ID()='${lote[0]}'`
        : `OR(${lote.map((id) => `RECORD_ID()='${id}'`).join(",")})`;
    let offset: string | undefined;
    do {
      const url = new URL(`${client.baseUrl}/${encodeURIComponent(table)}`);
      url.searchParams.set("filterByFormula", formula);
      url.searchParams.set("pageSize", "100");
      if (offset) url.searchParams.set("offset", offset);
      const res = await getConReintento(url.toString(), client.headers, table);
      if (!res.ok) throw new ErrorLecturaAirtable(table, res.status);
      const data = (await res.json()) as { records?: AirtableRecord[]; offset?: string };
      registros.push(...(data.records ?? []));
      offset = typeof data.offset === "string" && data.offset ? data.offset : undefined;
    } while (offset);
  }
  return registros;
}

export function linkedIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim() !== "");
}

export function firstString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}

// ─── Fetchers específicos ─────────────────────────────────────────────────────

export async function fetchOrden(ordenId: string) {
  return fetchRecord(ORDENES_TABLE, ordenId);
}

export async function fetchOperacion(operacionId: string) {
  return fetchRecord(OPERACIONES_TABLE, operacionId);
}

export async function fetchReserva(reservaId: string) {
  return fetchRecord(RESERVAS_TABLE, reservaId);
}

export async function fetchCliente(clienteId: string) {
  return fetchRecord(CLIENTES_TABLE, clienteId);
}

export type ItemDetalleGancho = {
  id: string;
  sku: string;
  reservado: boolean;
  tieneFacturaPrevia: boolean;
  // Igual que tieneFacturaPrevia, pero para el recibo interno: un item ya
  // vendido con recibo tampoco puede volver a venderse.
  tieneReciboPrevio: boolean;
  // Repuesto BAJO PEDIDO (nació del presupuesto de una orden, vía Operación
  // Comercial) que todavía no llegó a la tienda: nadie marcó "Recibido" en
  // /shipping-v2/recepcion. No se puede facturar ni emitir recibo por algo
  // que no se ha entregado (decisión del 21-sep-2026).
  bajoPedidoSinLlegar: boolean;
  // Auditoría Shipping V2, punto 1 — generaliza lo anterior a TODO artículo:
  // solo se factura lo que ya está en la tienda (Recibido) y, si requiere
  // inspección, con la ficha firmada. null = se puede entregar.
  // Regla: lib/shipping-v2/item-venta.ts (evaluarVentaItem).
  pendienteDeEntrega: "no-llego" | "falta-inspeccion" | null;
  tarifaIva: string; // "15%" | "0%" | "Exento" | "No objeto" | "" (vacío)
  // Fase 17.b (inventario por cantidad): unidades en stock según el campo
  // "Cantidad" de Shipping Items. Campo vacío/ausente → 0, fail-closed:
  // un item sin cantidad definida se trata como sin stock, nunca al revés.
  cantidad: number;
  // F-42: unidades comprometidas (reserva u orden) aún no vendidas. Hace falta
  // aquí porque la bandera `reservado` ahora solo se enciende cuando NO queda
  // ninguna unidad libre; para un registro multiunidad con 1 de 52
  // comprometidas, `reservado` es false pero el artículo SÍ está apartado y
  // debe poder facturarse.
  cantidadReservada: number;
};

export function numberOrZero(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const n = parseFloat(String(value));
  return Number.isFinite(n) ? n : 0;
}

function pendienteDeEntregaDe(fields: Record<string, unknown>): ItemDetalleGancho["pendienteDeEntrega"] {
  // Solo las dos condiciones de LLEGADA. Los bloqueos comerciales (vendido,
  // con novedad…) ya tienen su propio motivo más arriba en
  // evaluarItemNoListo, y la verificación final al emitir
  // (reglas/entregables.ts) los vuelve a mirar todos.
  const evaluacion = evaluarVentaItem({
    recibido: fields["Recibido"] === true,
    requiereInspeccion: fields["Requiere inspección"] === true,
    inspeccionFirmada: fields["Revisado física/técnicamente"] === true,
  });
  if (evaluacion.vendible || evaluacion.motivo === "bloqueado") return null;
  return evaluacion.motivo;
}

export async function fetchDetalleItems(itemIds: string[]): Promise<Map<string, ItemDetalleGancho>> {
  const records = await fetchRecordsByIds(SHIPPING_ITEMS_TABLE, itemIds);
  const map = new Map<string, ItemDetalleGancho>();
  for (const r of records) {
    map.set(r.id, {
      id: r.id,
      sku: firstString(r.fields["SKU"]),
      reservado: r.fields["Reservado"] === true,
      tieneFacturaPrevia: linkedIds(r.fields["Factura"]).length > 0,
      tieneReciboPrevio:  linkedIds(r.fields["Recibo"]).length > 0,
      bajoPedidoSinLlegar:
        linkedIds(r.fields["Presupuesto por Orden"]).length > 0 &&
        linkedIds(r.fields["Operación Comercial"]).length > 0 &&
        r.fields["Recibido"] !== true,
      pendienteDeEntrega: pendienteDeEntregaDe(r.fields),
      tarifaIva: firstString(r.fields["Tarifa IVA"]),
      cantidad: numberOrZero(r.fields["Cantidad"]),
      cantidadReservada: numberOrZero(r.fields["Cantidad Reservada"]),
    });
  }
  return map;
}

export type FacturaVinculadaGancho = {
  recordId: string;
  numeroFactura: string;
  estado: string;
  claveAcceso: string;
};

export async function fetchFacturasVinculadas(facturaIds: string[]): Promise<FacturaVinculadaGancho[]> {
  const records = await fetchRecordsByIds(FACTURAS_TABLE, facturaIds);
  return records.map((r) => ({
    recordId:      r.id,
    numeroFactura: firstString(r.fields["Número de Factura"]),
    estado:        firstString(r.fields["Estado"]),
    claveAcceso:   firstString(r.fields["Clave de Acceso"]),
  }));
}

// ─── Recibos vinculados al origen (idempotencia no tributaria) ───────────────
// El recibo interno tiene el mismo efecto real que una factura sobre la cuenta
// (descuenta inventario y registra el ingreso), así que para decidir si una
// orden ya está cerrada hay que mirar los dos. Mismo patrón que
// fetchFacturasVinculadas: los IDs salen del campo inverso "Recibos" que ya
// trae el registro de la orden/operación.

export type ReciboVinculadoGancho = {
  recordId: string;
  numero:   string;
  estado:   string;
  total:    number;
};

export async function fetchRecibosVinculados(reciboIds: string[]): Promise<ReciboVinculadoGancho[]> {
  const records = await fetchRecordsByIds(RECIBOS_TABLE, reciboIds);
  return records.map((r) => ({
    recordId: r.id,
    numero:   firstString(r.fields["Número"]),
    estado:   firstString(r.fields["Estado"]),
    total:    numberOrZero(r.fields["Total"]),
  }));
}
