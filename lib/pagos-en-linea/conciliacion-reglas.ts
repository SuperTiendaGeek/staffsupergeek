// Revisión automática de pagos en línea (conciliación) — reglas PURAS
// (etapa D2, 26-nov-2026; Codex punto 2). Prueba en __tests__/conciliacion.test.ts.
//
// Por qué: el cliente puede pagar y cerrar la página, y el aviso de DeUna
// puede no llegar. Sin esto, ese pago quedaría sin abono aunque el dinero sí
// llegó. La revisión pregunta a la pasarela por los cobros que quedaron a medias.
//
// Qué se revisa (solo intentos con orden o pedido; los "Por asignar" son de la bandeja):
//   · "Aprobado" (cualquier pasarela): el dinero se confirmó pero el abono no
//     se registró → se reintenta hasta 30 días.
//   · DeUna "Abierto" o "Vencido" con ID: ¿se pagó? → hasta 48 h (DeUna
//     responde NOT_FOUND a los 7 días; 48 h deja margen de sobra).
//   · PayPhone "Abierto" con ID (volvió de PayPhone sin confirmar) → hasta 48 h.
// Cada intento se consulta con SU ambiente (QA o producción).

import type { EstadoPago, Pasarela } from "./reglas";

export const HORAS_REVISAR_ABIERTOS = 48;
export const DIAS_REVISAR_APROBADOS = 30;

export type IntentoParaConciliar = {
  codigo: string;
  pasarela: Pasarela;
  estado: EstadoPago;
  idTransaccion: string;
  creado: string;
  pedidoId: string | null;
  ordenId: string | null;
};

export function porConciliar(i: IntentoParaConciliar, ahora: Date = new Date()): boolean {
  if (!i.pedidoId && !i.ordenId) return false;
  const horas = (ahora.getTime() - Date.parse(i.creado)) / 3_600_000;
  if (!Number.isFinite(horas) || horas < 0) return false;
  if (i.estado === "Aprobado") return horas <= DIAS_REVISAR_APROBADOS * 24;
  if (!i.idTransaccion || horas > HORAS_REVISAR_ABIERTOS) return false;
  if (i.pasarela === "DeUna") return i.estado === "Abierto" || i.estado === "Vencido";
  return i.estado === "Abierto";
}

/** Orden de trabajo: primero los aprobados (dinero ya confirmado), luego los más viejos. */
export function ordenarParaConciliar<T extends IntentoParaConciliar>(lista: readonly T[]): T[] {
  return [...lista].sort((a, b) => (a.estado === "Aprobado" ? 0 : 1) - (b.estado === "Aprobado" ? 0 : 1) || a.creado.localeCompare(b.creado));
}
