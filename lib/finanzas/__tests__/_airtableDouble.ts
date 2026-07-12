/**
 * Doble en memoria de la API REST de Airtable para las tablas "Cuentas
 * Financieras" y "Movimientos Financieros" (con o sin su nombre viejo
 * "Shipping Finanzas Movimientos", según el escenario del test).
 *
 * No es un archivo de test — no tiene assert() ni se ejecuta solo. Lo
 * importan los tests de lib/finanzas/__tests__ que necesitan simular
 * Airtable sin tocar la red real.
 *
 * Simula, entre otras cosas, el mantenimiento automático que Airtable hace
 * de los campos inversos (Cuenta Origen/Destino → Movimientos (Origen)/
 * (Destino)) — así el código bajo prueba puede leer esos inversos igual que
 * en producción.
 */

import { CUENTAS_FIELDS } from "../cuentas";
import { MOVIMIENTOS_FIELDS } from "../movimientos-fields";

export type DoubleRecord = { id: string; createdTime: string; fields: Record<string, unknown> };

export type AirtableDoubleState = {
  cuentas: Map<string, DoubleRecord>;
  movimientos: Map<string, DoubleRecord>;
  tablaMovimientosActiva: string;
  nextId: number;
};

export function crearEstadoDouble(tablaMovimientosActiva = "Movimientos Financieros"): AirtableDoubleState {
  return { cuentas: new Map(), movimientos: new Map(), tablaMovimientosActiva, nextId: 1 };
}

function generarId(state: AirtableDoubleState) {
  return `rec${String(state.nextId++).padStart(14, "0")}`;
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

function sincronizarInversos(state: AirtableDoubleState, movimiento: DoubleRecord) {
  const origenIds = (movimiento.fields[MOVIMIENTOS_FIELDS.cuentaOrigen] as string[] | undefined) ?? [];
  const destinoIds = (movimiento.fields[MOVIMIENTOS_FIELDS.cuentaDestino] as string[] | undefined) ?? [];
  for (const cuentaId of origenIds) {
    const cuenta = state.cuentas.get(cuentaId);
    if (!cuenta) continue;
    const actuales = (cuenta.fields[CUENTAS_FIELDS.movimientosOrigen] as string[] | undefined) ?? [];
    cuenta.fields[CUENTAS_FIELDS.movimientosOrigen] = [...actuales, movimiento.id];
  }
  for (const cuentaId of destinoIds) {
    const cuenta = state.cuentas.get(cuentaId);
    if (!cuenta) continue;
    const actuales = (cuenta.fields[CUENTAS_FIELDS.movimientosDestino] as string[] | undefined) ?? [];
    cuenta.fields[CUENTAS_FIELDS.movimientosDestino] = [...actuales, movimiento.id];
  }
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

    if (esMovimientosOtroNombre) return jsonResponse(false, 404, "TABLE_NOT_FOUND");
    if (!esCuentas && !esMovimientosActiva) return jsonResponse(false, 404, "TABLE_NOT_FOUND");

    const store = esCuentas ? state.cuentas : state.movimientos;

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
