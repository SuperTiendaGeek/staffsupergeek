// F-36 — resolución del cliente de una reserva.
//
// Una reserva guarda al cliente cuatro veces (vínculo + dos textos + copia en
// `Abonos JSON`). Las copias se congelan al crearla; el vínculo apunta a la
// ficha viva. Este módulo decide cuál gana, y está separado de airtable.ts
// para poder probarlo sin red.

import type { ReservaCliente } from "./types";

/** Campos de la ficha de cliente, tal como llegan de Airtable. */
export type ClienteRecordFields = Record<string, unknown>;

function texto(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (Array.isArray(v) && typeof v[0] === "string") return v[0].trim();
  return "";
}

/**
 * Combina la ficha viva del cliente con la copia guardada en la reserva.
 *
 * Regla: **la ficha manda campo por campo**, no en bloque. Si la ficha tiene
 * el dato, gana; si lo tiene vacío, se conserva lo que guardó la reserva en
 * vez de borrarlo. Así, corregir una cédula en la ficha se refleja en el
 * comprobante, pero una ficha incompleta no vacía una reserva que sí tenía
 * el correo del cliente.
 *
 * `razonSocial` nunca queda vacía: si la ficha no trae nombre, se mantiene el
 * de la reserva. Un comprobante sin nombre no sirve.
 */
export function combinarClienteReserva(
  guardado: ReservaCliente,
  fichaViva: ClienteRecordFields | null,
  clienteRecordId?: string
): ReservaCliente {
  if (!fichaViva) {
    return clienteRecordId ? { ...guardado, airtableId: clienteRecordId } : guardado;
  }

  const nombreFicha = texto(fichaViva["Nombre"]);
  const cedulaFicha = texto(fichaViva["Cédula"]);
  const correoFicha = texto(fichaViva["Correo"]);
  const telefonoFicha = texto(fichaViva["Teléfono"]);

  const combinado: ReservaCliente = {
    razonSocial: nombreFicha || guardado.razonSocial,
    airtableId: clienteRecordId ?? guardado.airtableId,
  };

  const identificacion = cedulaFicha || guardado.identificacion;
  if (identificacion) combinado.identificacion = identificacion;

  const correo = correoFicha || guardado.correo;
  if (correo) combinado.correo = correo;

  const telefono = telefonoFicha || guardado.telefono;
  if (telefono) combinado.telefono = telefono;

  return combinado;
}

/**
 * ¿La copia guardada en la reserva se quedó vieja respecto de la ficha?
 * Sirve para avisar en pantalla, no para bloquear nada.
 */
export function copiaDesactualizada(guardado: ReservaCliente, vivo: ReservaCliente): boolean {
  if (guardado.razonSocial && vivo.razonSocial && guardado.razonSocial !== vivo.razonSocial) return true;
  if (guardado.identificacion && vivo.identificacion && guardado.identificacion !== vivo.identificacion) return true;
  return false;
}
