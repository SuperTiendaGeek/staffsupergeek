// Bandeja "Pagos recibidos" (maquetas 12 y 12b aprobadas por el dueño el
// 18-nov-2026) — reglas PURAS. Prueba en __tests__/bandeja.test.ts.
//
// Qué resuelve: el personal ve en un solo lugar todo lo que entró por PayPhone
// y DeUna; asigna los pagos que llegaron SIN referencia (QR impreso del
// mostrador) y revisa los que el sistema no pudo aplicar solo. El sistema
// SUGIERE la orden o el pedido (misma cédula, mismo monto) pero nunca asigna
// solo. "Cierre del día": cobrado − comisión = neto que debe llegar al banco.

import { isAdministratorRole, isProviderRole, isTechnicianRole } from "@/lib/apps";
import type { EstadoPago, Pasarela } from "./reglas";
import { identificacionCorta } from "./deuna-reglas";

/** Quién ve "Pagos recibidos": Administradores y Staff (no Técnicos ni proveedores). */
export function puedeVerBandeja(rol: string | undefined): boolean {
  if (!rol || isProviderRole(rol)) return false;
  return isAdministratorRole(rol) || !isTechnicianRole(rol);
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Una fila de la bandeja (lo que viaja al navegador: sin datos secretos). */
export type FilaPago = {
  codigo: string;
  pasarela: Pasarela;
  estado: EstadoPago;
  /** "OR000552" / "OP-2026-000151" / "" (sin referencia). */
  cuenta: string;
  origen: string;
  monto: number;
  tarifa: number | null;
  neto: number | null;
  /** Nombre del pagador (DeUna) o la tarjeta ("Visa ···· 4242"). */
  pagador: string;
  /** Cédula corta (···4521). La completa no viaja a la lista. */
  cedula: string;
  /** N.º de transferencia (DeUna) o autorización (PayPhone). */
  referencia: string;
  creado: string;
  pagadoEn: string;
  detalle: string;
  asignadoPor: string;
  asignadoEn: string;
  /** Movimiento en Finanzas: por acreditar / acreditado / — */
  finanzas: "Por acreditar" | "Acreditado" | "";
  ambiente: string;
  /** Para "Ver cuenta": la orden o el pedido al que quedó aplicado. */
  destino: { origen: "Orden" | "Pedido"; id: string } | null;
  /** Ya tiene abono registrado (no se puede descartar). */
  conAbono: boolean;
};

/** Enlace interno a la cuenta (orden de Técnicos o pedido de Operaciones). */
export function urlCuenta(d: FilaPago["destino"]): string {
  if (!d) return "";
  return d.origen === "Orden" ? `/tecnicos/ordenes/${d.id}` : `/operaciones/${d.id}`;
}

/** Estados en los que el dinero SÍ entró (cuentan en "Recibido hoy"). */
const CON_DINERO: ReadonlySet<EstadoPago> = new Set(["Aprobado", "Aplicado", "Por asignar", "En revisión"]);

export function conDinero(f: Pick<FilaPago, "estado" | "pagadoEn" | "ambiente">): boolean {
  return CON_DINERO.has(f.estado) && !!f.pagadoEn && f.ambiente !== "Prueba";
}

/** Cómo se llama cada estado en la bandeja (palabras del personal). */
export function etiquetaEstado(estado: EstadoPago, vencido: boolean): string {
  switch (estado) {
    case "Aplicado": return "Aplicado";
    case "Aprobado": return "Aplicándose";
    case "Por asignar": return "Por asignar";
    case "En revisión": return "Por revisar";
    case "No corresponde": return "No corresponde";
    case "Rechazado": return "Sin pago";
    case "Vencido": return "Vencido sin pago";
    case "Abierto": return vencido ? "Vencido sin pago" : "Esperando pago";
  }
}

/** El código de la cuenta, del texto principal "PL-000027 · OR000551 · $105.00 · DeUna". */
export function cuentaDelResumen(resumen: string): string {
  const parte = (resumen ?? "").split(" · ")[1] ?? "";
  return parte === "Sin referencia" ? "" : parte.trim();
}

// ─── Fechas (Ecuador, UTC−5, sin horario de verano) ─────────────────────────

const MS_DIA = 86_400_000;
const DESFASE = 5 * 3_600_000;

/** "2026-11-18" del instante dado, en hora de Ecuador. Las fechas sin hora se respetan. */
export function diaEcuador(iso: string): string {
  if (!iso) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso) || /T00:00:00(\.000)?Z$/.test(iso)) return iso.slice(0, 10);
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t - DESFASE).toISOString().slice(0, 10) : "";
}

/** "2026-11-18 14:32" en hora de Ecuador. */
export function fechaHoraEcuador(iso: string): string {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t - DESFASE).toISOString().slice(0, 16).replace("T", " ") : "";
}

/** Rango [desde, hasta) en ISO UTC de días de Ecuador. Ej.: "2026-11-18" → 05:00Z a 05:00Z del 19. */
export function rangoDias(desde: string, hasta: string): { desde: string; hasta: string } {
  const a = Date.parse(`${desde}T00:00:00Z`) + DESFASE;
  const b = Date.parse(`${hasta}T00:00:00Z`) + DESFASE + MS_DIA;
  return { desde: new Date(a).toISOString(), hasta: new Date(b).toISOString() };
}

export type Periodo = "hoy" | "7dias" | "mes";

/** Días de Ecuador de cada periodo del historial. */
export function diasDelPeriodo(p: Periodo, hoy: string): { desde: string; hasta: string } {
  if (p === "hoy") return { desde: hoy, hasta: hoy };
  if (p === "7dias") return { desde: new Date(Date.parse(`${hoy}T00:00:00Z`) - 6 * MS_DIA).toISOString().slice(0, 10), hasta: hoy };
  return { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy };
}

// ─── Arriba: las cuatro tarjetas (maqueta 12) ───────────────────────────────

export type ResumenBandeja = {
  recibido: number;
  pagos: number;
  porPasarela: Record<Pasarela, number>;
  pendientes: number;
  montoPendientes: number;
  comisiones: number;
  neto: number;
};

/**
 * Ej. (maqueta 12): 6 DeUna por $310 y 3 PayPhone por $175 → recibido $485,
 * comisiones $17,19 (7,13 + 10,06), neto $467,81; 3 por asignar o revisar.
 */
export function resumenDelDia(filas: readonly FilaPago[], hoy: string, abiertos: readonly FilaPago[] = []): ResumenBandeja {
  const delDia = filas.filter((f) => conDinero(f) && diaEcuador(f.pagadoEn) === hoy);
  const porPasarela: Record<Pasarela, number> = { PayPhone: 0, DeUna: 0 };
  for (const f of delDia) porPasarela[f.pasarela]++;
  const recibido = r2(delDia.reduce((s, f) => s + f.monto, 0));
  const comisiones = r2(delDia.reduce((s, f) => s + (f.tarifa ?? 0), 0));
  return {
    recibido,
    pagos: delDia.length,
    porPasarela,
    pendientes: abiertos.length,
    montoPendientes: r2(abiertos.reduce((s, f) => s + f.monto, 0)),
    comisiones,
    neto: r2(recibido - comisiones),
  };
}

// ─── Sugerir a qué cuenta va un pago sin referencia ─────────────────────────

export type Candidato = {
  origen: "Orden" | "Pedido";
  id: string;
  codigo: string;
  cliente: string;
  detalle: string;
  /** Lo que falta por cobrar en esa cuenta. */
  falta: number;
  cedula: string;
  /** Cuenta «Es prueba»: solo recibe pagos de QA (y al revés). */
  esPrueba?: boolean;
};

/** D2: un pago de pruebas (QA) solo se asigna a cuentas «Es prueba»; uno real, nunca. */
export function mismoMundo(c: Pick<Candidato, "esPrueba">, ambientePago: string): boolean {
  return !!c.esPrueba === (ambientePago === "Prueba");
}

export type CandidatoSugerido = Candidato & { mismaCedula: boolean; mismoMonto: boolean; puntaje: number };

const soloDigitos = (s: string) => (s ?? "").replace(/\D/g, "");

/**
 * Ordena las cuentas abiertas para un pago: primero misma cédula Y mismo
 * monto, luego misma cédula, luego mismo monto. Las que tienen menos saldo
 * que el pago van al final (no se pueden asignar).
 */
export function sugerir(pago: { monto: number; identificacion: string }, candidatos: readonly Candidato[]): CandidatoSugerido[] {
  const ced = soloDigitos(pago.identificacion);
  return candidatos
    .map((c) => {
      const mismaCedula = !!ced && ced.length >= 6 && soloDigitos(c.cedula) === ced;
      const mismoMonto = Math.abs(r2(c.falta) - r2(pago.monto)) < 0.009;
      const cabe = c.falta + 0.009 >= pago.monto;
      const puntaje = (mismaCedula ? 2 : 0) + (mismoMonto ? 1.5 : 0) + (cabe ? 1 : -5);
      return { ...c, mismaCedula, mismoMonto, puntaje };
    })
    .sort((a, b) => b.puntaje - a.puntaje || a.codigo.localeCompare(b.codigo));
}

/** La sugerencia que se muestra en la fila: solo si coincide algo y el pago cabe. */
export function mejorSugerencia(pago: { monto: number; identificacion: string }, candidatos: readonly Candidato[]): CandidatoSugerido | null {
  const s = sugerir(pago, candidatos)[0];
  return s && (s.mismaCedula || s.mismoMonto) && s.falta + 0.009 >= pago.monto ? s : null;
}

// ─── Cierre del día ─────────────────────────────────────────────────────────

export type MovimientoCierre = { id: string; monto: number; neto: number; estado: "Pendiente" | "Acreditado"; observacion: string };

export type CierrePasarela = {
  pasarela: Pasarela;
  pagos: number;
  cobrado: number;
  comision: number;
  neto: number;
  porAcreditar: number;
  acreditados: number;
};

export function cierre(pasarela: Pasarela, movs: readonly MovimientoCierre[]): CierrePasarela {
  const cobrado = r2(movs.reduce((s, m) => s + m.monto, 0));
  const neto = r2(movs.reduce((s, m) => s + m.neto, 0));
  return {
    pasarela,
    pagos: movs.length,
    cobrado,
    comision: r2(cobrado - neto),
    neto,
    porAcreditar: movs.filter((m) => m.estado === "Pendiente").length,
    acreditados: movs.filter((m) => m.estado === "Acreditado").length,
  };
}

/** Para la vista: cédula corta. */
export const cedulaCorta = identificacionCorta;

/** CSV (se abre en Excel) del historial. Separador ";" (Excel en español). */
export function csvHistorial(filas: readonly FilaPago[]): string {
  const c = (v: string | number | null) => {
    const t = v == null ? "" : typeof v === "number" ? v.toFixed(2).replace(".", ",") : v;
    return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const cab = ["Fecha", "Código", "Pasarela", "Pagó", "Aplicado a", "Monto", "Comisión", "Neto", "Estado", "Finanzas", "Referencia", "Asignado por"];
  const lineas = filas.map((f) => [
    fechaHoraEcuador(f.pagadoEn || f.creado), f.codigo, f.pasarela, f.pagador, f.cuenta, f.monto, f.tarifa, f.neto,
    f.estado, f.finanzas, f.referencia, f.asignadoPor,
  ].map(c).join(";"));
  return "﻿" + [cab.join(";"), ...lineas].join("\n");
}
