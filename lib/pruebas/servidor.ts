import "server-only";

// Datos de prueba (auditoría ops, punto 16) — lado servidor. Reglas en ./reglas.ts.
// Lecturas de una sola casilla («Es prueba»): una llamada a Airtable cada una,
// y solo en las acciones raras (abono a mano, apartar un repuesto o una
// licencia, marcar/desmarcar). Las listas filtran en la propia fórmula.

import { porIds } from "@/lib/estado-cuenta/airtable";
import { airtableMutation, tableUrl } from "@/lib/finanzas/airtable-client";
import { CAMPO_ES_PRUEBA, esPrueba } from "./reglas";

export const T_ORDENES_PRUEBA = "Órdenes de Reparación";
export const T_OPERACIONES_PRUEBA = "Operación Comercial";
export const T_CLIENTES_PRUEBA = "Clientes";

/** Lo que se pidió no se hace porque el registro es de prueba (409 en las rutas). */
export class ErrorPrueba extends Error {
  readonly status = 409;
  constructor(message: string) { super(message); this.name = "ErrorPrueba"; }
}

export type OrigenPrueba = { tipo: "orden" | "operacion" | "cliente"; id: string };

const tablaDe = (tipo: OrigenPrueba["tipo"]) =>
  tipo === "orden" ? T_ORDENES_PRUEBA : tipo === "operacion" ? T_OPERACIONES_PRUEBA : T_CLIENTES_PRUEBA;

/** ¿La orden, el pedido o el cliente está marcado? Sin id o sin registro: no. */
export async function esDePrueba(origen: OrigenPrueba): Promise<boolean> {
  if (!origen.id || !/^rec[A-Za-z0-9]{14}$/.test(origen.id)) return false;
  const r = (await porIds(tablaDe(origen.tipo), [origen.id], [CAMPO_ES_PRUEBA])).get(origen.id);
  return esPrueba(r?.fields);
}

/** Lanza ErrorPrueba si el origen es de prueba. */
export async function exigirNoPrueba(origen: OrigenPrueba, mensaje: string): Promise<void> {
  if (await esDePrueba(origen)) throw new ErrorPrueba(mensaje);
}

/** Ambiente del SRI con que corre este despliegue: "2" = producción. Mismo valor por defecto que lib/facturacion/config.ts. */
export function ambienteSri(): string {
  return (process.env.SRI_AMBIENTE ?? "1").trim() || "1";
}

/** Marca o desmarca una orden o un pedido. */
export async function guardarMarcaPrueba(origen: { tipo: "orden" | "operacion"; id: string }, valor: boolean): Promise<void> {
  await airtableMutation(`${tableUrl(tablaDe(origen.tipo))}/${encodeURIComponent(origen.id)}`, {
    method: "PATCH",
    body: JSON.stringify({ fields: { [CAMPO_ES_PRUEBA]: valor } }),
  });
}
