/**
 * Doble en memoria de la API REST de Airtable para "Cuentas Financieras",
 * "Movimientos Financieros" (con o sin su nombre viejo "Shipping Finanzas
 * Movimientos"), y — desde la Fase 20.2 — cualquier "otra tabla" genérica
 * (Abonos, Facturas Electrónicas, Operación Comercial, Órdenes de
 * Reparación) que un test necesite para simular los puentes de ingresos.
 *
 * No es un archivo de test — no tiene assert() ni se ejecuta solo. Lo
 * importan los tests de lib/finanzas/__tests__ que necesitan simular
 * Airtable sin tocar la red real.
 *
 * Simula el mantenimiento automático que Airtable hace de los campos
 * inversos: Cuenta Origen/Destino → Movimientos (Origen)/(Destino) en
 * Cuentas Financieras (Fase 20.1), y Abono/Factura Electrónica →
 * "Movimiento Financiero"/"Movimientos Financieros (Facturación)" en
 * Abonos/Facturas Electrónicas (Fase 20.2) — tanto al crear (POST) como al
 * actualizar (PATCH, para actualizarMovimiento) un Movimiento.
 */

import { CUADRES_FIELDS, TABLA_CUADRES } from "../cuadres";
import { CUENTAS_FIELDS } from "../cuentas";
import { MOVIMIENTOS_FIELDS } from "../movimientos-fields";

export type DoubleRecord = { id: string; createdTime: string; fields: Record<string, unknown> };

export type AirtableDoubleState = {
  cuentas: Map<string, DoubleRecord>;
  movimientos: Map<string, DoubleRecord>;
  otras: Map<string, Map<string, DoubleRecord>>;
  tablaMovimientosActiva: string;
  nextId: number;
};

export function crearEstadoDouble(tablaMovimientosActiva = "Movimientos Financieros"): AirtableDoubleState {
  return { cuentas: new Map(), movimientos: new Map(), otras: new Map(), tablaMovimientosActiva, nextId: 1 };
}

function generarId(state: AirtableDoubleState) {
  return `rec${String(state.nextId++).padStart(14, "0")}`;
}

function storeDeOtraTabla(state: AirtableDoubleState, tabla: string): Map<string, DoubleRecord> {
  let store = state.otras.get(tabla);
  if (!store) {
    store = new Map();
    state.otras.set(tabla, store);
  }
  return store;
}

/** Crea un registro en cualquier tabla que no sea Cuentas/Movimientos (Abonos, Facturas Electrónicas, Operación Comercial, Órdenes de Reparación...). */
export function crearRegistroDouble(state: AirtableDoubleState, tabla: string, fields: Record<string, unknown>): string {
  const id = generarId(state);
  storeDeOtraTabla(state, tabla).set(id, { id, createdTime: new Date().toISOString(), fields });
  return id;
}

/**
 * Registra una "otra tabla" en el doble sin crear ningún registro — necesario
 * para que el dispatcher de `construirFetchDouble` acepte un POST inicial a
 * una tabla que todavía no tiene ningún registro (si no, respondería
 * `TABLE_NOT_FOUND`, igual que le pasaría a una tabla que de verdad no
 * existe). Fase 20.4 — usado para "Finanzas Cuadres".
 */
export function registrarTablaDouble(state: AirtableDoubleState, tabla: string): void {
  storeDeOtraTabla(state, tabla);
}

export function crearCuentaDouble(
  state: AirtableDoubleState,
  overrides: Partial<{
    nombre: string;
    tipo: string;
    permiteTransferirA: string[];
    permiteRecibirDe: string[];
    activa: boolean;
    saldoInicial: number;
    fechaCorte: string | null;
    // Fase 20.5 — solo tienen sentido en cuentas Tipo de Cuenta = "Tarjeta de Crédito".
    tcDiaCorte: number | null;
    tcDiaPago: number | null;
    tcCupo: number | null;
  }>
): string {
  const id = generarId(state);
  state.cuentas.set(id, {
    id,
    createdTime: new Date().toISOString(),
    fields: {
      [CUENTAS_FIELDS.nombre]: overrides.nombre ?? id,
      [CUENTAS_FIELDS.tipo]: overrides.tipo ?? "Temporal",
      [CUENTAS_FIELDS.permiteTransferirA]: overrides.permiteTransferirA ?? [],
      [CUENTAS_FIELDS.permiteRecibirDe]: overrides.permiteRecibirDe ?? [],
      [CUENTAS_FIELDS.activa]: overrides.activa ?? true,
      [CUENTAS_FIELDS.saldoInicial]: overrides.saldoInicial ?? 0,
      [CUENTAS_FIELDS.fechaCorte]: overrides.fechaCorte ?? null,
      [CUENTAS_FIELDS.movimientosOrigen]: [],
      [CUENTAS_FIELDS.movimientosDestino]: [],
      [CUENTAS_FIELDS.tcDiaCorte]: overrides.tcDiaCorte ?? null,
      [CUENTAS_FIELDS.tcDiaPago]: overrides.tcDiaPago ?? null,
      [CUENTAS_FIELDS.tcCupo]: overrides.tcCupo ?? null,
    },
  });
  return id;
}

/** Deja a dos cuentas transferirse mutuamente (para pruebas de Movimiento Interno). */
export function permitirTransferencia(state: AirtableDoubleState, origenId: string, destinoId: string) {
  const origen = state.cuentas.get(origenId)!;
  const actuales = (origen.fields[CUENTAS_FIELDS.permiteTransferirA] as string[]) ?? [];
  origen.fields[CUENTAS_FIELDS.permiteTransferirA] = [...actuales, destinoId];
}

function agregarAInverso(store: Map<string, DoubleRecord>, id: string, campo: string, valor: string) {
  const registro = store.get(id);
  if (!registro) return;
  const actuales = (registro.fields[campo] as string[] | undefined) ?? [];
  registro.fields[campo] = [...actuales, valor];
}

function sincronizarInversos(state: AirtableDoubleState, movimiento: DoubleRecord) {
  const origenIds = (movimiento.fields[MOVIMIENTOS_FIELDS.cuentaOrigen] as string[] | undefined) ?? [];
  const destinoIds = (movimiento.fields[MOVIMIENTOS_FIELDS.cuentaDestino] as string[] | undefined) ?? [];
  for (const cuentaId of origenIds) agregarAInverso(state.cuentas, cuentaId, CUENTAS_FIELDS.movimientosOrigen, movimiento.id);
  for (const cuentaId of destinoIds) agregarAInverso(state.cuentas, cuentaId, CUENTAS_FIELDS.movimientosDestino, movimiento.id);

  // Fase 20.2 — inversos en "otras tablas" (Abonos/Facturas Electrónicas).
  const abonoIds = (movimiento.fields[MOVIMIENTOS_FIELDS.abono] as string[] | undefined) ?? [];
  const abonosStore = state.otras.get("Abonos");
  if (abonosStore) for (const abonoId of abonoIds) agregarAInverso(abonosStore, abonoId, "Movimiento Financiero", movimiento.id);

  const facturaIds = (movimiento.fields[MOVIMIENTOS_FIELDS.facturaElectronica] as string[] | undefined) ?? [];
  const facturasStore = state.otras.get("Facturas Electrónicas");
  if (facturasStore) {
    for (const facturaId of facturaIds) agregarAInverso(facturasStore, facturaId, "Movimientos Financieros (Facturación)", movimiento.id);
  }

  // Fase 20.3 — self-link "Reversa a" → inverso "Compensado Por", DENTRO de
  // la misma tabla de movimientos (no una "otra tabla" — Airtable mantiene
  // este inverso igual que cualquier otro link, solo que apunta a un
  // registro de la propia tabla).
  const reversaAIds = (movimiento.fields[MOVIMIENTOS_FIELDS.reversaA] as string[] | undefined) ?? [];
  for (const originalId of reversaAIds) agregarAInverso(state.movimientos, originalId, MOVIMIENTOS_FIELDS.compensadoPor, movimiento.id);
}

/**
 * Fase 20.4 — inversos de "Finanzas Cuadres": Cuenta → Cuadres (en Cuentas
 * Financieras) y Movimiento de Ajuste → Cuadre de Caja (en Movimientos
 * Financieros). A diferencia de `sincronizarInversos` (Movimiento-céntrica),
 * esta propaga desde un registro de Cuadre hacia las otras dos tablas.
 */
function sincronizarInversosCuadre(state: AirtableDoubleState, cuadre: DoubleRecord) {
  const cuentaIds = (cuadre.fields[CUADRES_FIELDS.cuenta] as string[] | undefined) ?? [];
  for (const cuentaId of cuentaIds) agregarAInverso(state.cuentas, cuentaId, CUENTAS_FIELDS.cuadres, cuadre.id);

  const movimientoIds = (cuadre.fields[CUADRES_FIELDS.movimientoAjuste] as string[] | undefined) ?? [];
  for (const movId of movimientoIds) agregarAInverso(state.movimientos, movId, MOVIMIENTOS_FIELDS.cuadreDeCaja, cuadre.id);
}

function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of input) {
    if (char === "(") depth++;
    if (char === ")") depth--;
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function evaluarFormula(formula: string, record: DoubleRecord): boolean {
  const recordIdMatch = formula.match(/^RECORD_ID\(\)='([^']*)'$/);
  if (recordIdMatch) return record.id === recordIdMatch[1];

  if (formula.startsWith("OR(") && formula.endsWith(")")) {
    return splitTopLevel(formula.slice(3, -1)).some((clause) => evaluarFormula(clause, record));
  }
  if (formula.startsWith("AND(") && formula.endsWith(")")) {
    return splitTopLevel(formula.slice(4, -1)).every((clause) => evaluarFormula(clause, record));
  }

  const fieldMatch = formula.match(/^\{([^}]+)\}='([^']*)'$/);
  if (fieldMatch) {
    const [, field, value] = fieldMatch;
    return String(record.fields[field] ?? "") === value;
  }

  // Fase 20.4 — listarMovimientos({desde, hasta}) usa IS_AFTER/IS_BEFORE
  // para el reporte diario. Comparación de fechas ISO como Date, no como
  // texto (evita sorpresas con zonas horarias distintas entre el valor
  // guardado y el límite de la consulta).
  const isAfterMatch = formula.match(/^IS_AFTER\(\{([^}]+)\},\s*'([^']*)'\)$/);
  if (isAfterMatch) {
    const [, field, value] = isAfterMatch;
    const fieldValue = record.fields[field];
    if (typeof fieldValue !== "string" || !fieldValue) return false;
    return new Date(fieldValue).getTime() > new Date(value).getTime();
  }
  const isBeforeMatch = formula.match(/^IS_BEFORE\(\{([^}]+)\},\s*'([^']*)'\)$/);
  if (isBeforeMatch) {
    const [, field, value] = isBeforeMatch;
    const fieldValue = record.fields[field];
    if (typeof fieldValue !== "string" || !fieldValue) return false;
    return new Date(fieldValue).getTime() < new Date(value).getTime();
  }

  throw new Error(`Doble de Airtable: fórmula no soportada — ${formula}`);
}

function jsonResponse(ok: boolean, status: number, body: unknown): Response {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return { ok, status, text: async () => text, json: async () => JSON.parse(text) } as Response;
}

export function construirFetchDouble(state: AirtableDoubleState) {
  return async (urlInput: string | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(urlInput));
    const method = (init?.method ?? "GET").toUpperCase();
    const segments = decodeURIComponent(url.pathname).split("/").filter(Boolean); // ["v0", baseId, tableName, maybe recordId]
    const tableName = segments[2];
    const recordId = segments[3];

    const esCuentas = tableName === "Cuentas Financieras";
    const nombresMovimientosConocidos = ["Movimientos Financieros", "Shipping Finanzas Movimientos"];
    const esMovimientosActiva = tableName === state.tablaMovimientosActiva;
    const esMovimientosOtroNombre = nombresMovimientosConocidos.includes(tableName) && !esMovimientosActiva;
    const esOtraTabla = !esCuentas && !esMovimientosActiva && state.otras.has(tableName);

    if (esMovimientosOtroNombre) return jsonResponse(false, 404, "TABLE_NOT_FOUND");
    if (!esCuentas && !esMovimientosActiva && !esOtraTabla) return jsonResponse(false, 404, "TABLE_NOT_FOUND");

    const store = esCuentas ? state.cuentas : esMovimientosActiva ? state.movimientos : storeDeOtraTabla(state, tableName);

    if (method === "GET" && recordId) {
      const record = store.get(recordId);
      return record ? jsonResponse(true, 200, record) : jsonResponse(false, 404, "Record not found");
    }

    if (method === "GET") {
      let records = [...store.values()];
      const formula = url.searchParams.get("filterByFormula");
      if (formula) records = records.filter((r) => evaluarFormula(formula, r));
      return jsonResponse(true, 200, { records });
    }

    if (method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}")) as { records: Array<{ fields: Record<string, unknown> }> };
      const creados = body.records.map((r) => {
        const id = generarId(state);
        const record: DoubleRecord = { id, createdTime: new Date().toISOString(), fields: r.fields };
        store.set(id, record);
        if (store === state.movimientos) sincronizarInversos(state, record);
        if (tableName === TABLA_CUADRES) sincronizarInversosCuadre(state, record);
        return record;
      });
      return jsonResponse(true, 200, { records: creados });
    }

    if (method === "PATCH") {
      const body = JSON.parse(String(init?.body ?? "{}")) as { records: Array<{ id: string; fields: Record<string, unknown> }> };
      const actualizados = body.records.map((r) => {
        const existente = store.get(r.id);
        if (!existente) throw new Error(`Doble de Airtable: PATCH sobre record inexistente ${r.id}`);
        const actualizado: DoubleRecord = { ...existente, fields: { ...existente.fields, ...r.fields } };
        store.set(r.id, actualizado);
        if (store === state.movimientos) sincronizarInversos(state, actualizado);
        if (tableName === TABLA_CUADRES) sincronizarInversosCuadre(state, actualizado);
        return actualizado;
      });
      return jsonResponse(true, 200, { records: actualizados });
    }

    return jsonResponse(false, 400, "Método no soportado por el doble");
  };
}

export function activarEnvFalso() {
  process.env.AIRTABLE_API_KEY = "fake-token-para-test";
  process.env.AIRTABLE_BASE_ID = "appFAKEBASE0001";
}

export function limpiarEnvFalso() {
  delete process.env.AIRTABLE_API_KEY;
  delete process.env.AIRTABLE_BASE_ID;
}
