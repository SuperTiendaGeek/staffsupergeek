// Historia del cliente en UNA sola lista (auditoría ops, punto 13C) — reglas
// PURAS: sin servidor, sin Airtable. El servidor (./historial-servidor.ts) lee
// todo lo del cliente y lo entrega aquí ya normalizado; la ficha del cliente
// solo pinta lo que sale de aquí.
//
// Qué entra en la lista (lo más nuevo arriba):
//   · Cuentas: órdenes, pedidos/operaciones y reservas, con su estado de pago.
//   · Documentos: facturas, notas de crédito, recibos y proformas (solo de
//     producción; los de pruebas del SRI no son reales).
//   · Pagos: los abonos de todas sus cuentas, una sola vez cada uno.
//   · Saldo: los movimientos de su saldo a favor (Generado, Usado, …).
//
// Ejemplo real (Aaron Narvaez): factura de la MacBook ($320) → NC 005 →
// saldo Generado $320 → recibo REC-000085 → saldo Usado $320. En la ficha se
// ve esa cadena completa, en orden, y arriba "Saldo a favor $0".

import { etiquetaAbono } from "@/lib/cobros/metodos";
import { ETIQUETA_ESTADO_PAGO, type EstadoPago } from "@/lib/estado-cuenta/reglas";
import type { TipoMovimientoSaldo } from "@/lib/saldo-favor/reglas";

const TOLERANCIA = 0.01;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type GrupoHistorial = "cuentas" | "documentos" | "pagos" | "saldo";
export type TipoEvento =
  | "orden" | "operacion" | "reserva"
  | "factura" | "nota_credito" | "recibo" | "proforma"
  | "pago" | "saldo";
/** Cómo se pinta el estado: ok (verde), pendiente (ámbar), alerta (rojo), neutro, anulado (tachado). */
export type Tono = "ok" | "pendiente" | "alerta" | "neutro" | "anulado";

export const GRUPO_DE: Record<TipoEvento, GrupoHistorial> = {
  orden: "cuentas", operacion: "cuentas", reserva: "cuentas",
  factura: "documentos", nota_credito: "documentos", recibo: "documentos", proforma: "documentos",
  pago: "pagos", saldo: "saldo",
};

export const ETIQUETA_TIPO: Record<TipoEvento, string> = {
  orden: "Orden", operacion: "Pedido", reserva: "Reserva",
  factura: "Factura", nota_credito: "NC", recibo: "Recibo", proforma: "Proforma",
  pago: "Pago", saldo: "Saldo",
};

export type EventoHistorial = {
  id: string;
  tipo: TipoEvento;
  grupo: GrupoHistorial;
  /** ISO o "aaaa-mm-dd". "" si no se sabe (va al final). */
  fecha: string;
  codigo: string;
  detalle: string;
  /** Con signo cuando importa: pagos y saldo (+ entra / − sale). */
  monto: number | null;
  estado: string;
  tono: Tono;
  href: string | null;
};

// ─── Entradas normalizadas (las arma el servidor) ───────────────────────────

export type CuentaResumen = { totalCuenta: number; porCobrar: number; aFavor: number; estadoPago: EstadoPago };

export type EntradaOrden = { id: string; codigo: string; fecha: string; equipo: string; estado: string; cuenta: CuentaResumen | null };
export type EntradaOperacion = {
  id: string; codigo: string; fecha: string; producto: string; estado: string;
  /** Código de la orden si el pedido es parte de ella (su cuenta es la de la orden). */
  ordenCodigo: string | null;
  cuenta: CuentaResumen | null;
};
export type EntradaReserva = { id: string; codigo: string; fecha: string; descripcion: string; estado: string; precio: number; abonado: number };
export type EntradaDocumento = {
  id: string;
  tipo: "factura" | "nota_credito" | "recibo" | "proforma";
  codigo: string; fecha: string; total: number; estado: string;
  ambiente?: string;
  /** NC: "Cambio de equipo" / "Saldo a favor" / "Reembolso". */
  destino?: string;
  /** NC: "Vigente" / "Consumido" / "Caducado". */
  estadoCredito?: string;
  /** Factura: "Solicitada" / "Anulada" / "Rechazada", si se pidió anularla. */
  estadoAnulacion?: string;
};
export type EntradaPago = { id: string; fecha: string; monto: number; metodo: string; estado: string; referencia: string; cuentaCodigo: string };
export type EntradaSaldo = { id: string; codigo: string; tipo: TipoMovimientoSaldo; monto: number; fecha: string; vence: string | null; estado: string; referencia: string };

export type EntradasHistorial = {
  ordenes: EntradaOrden[];
  operaciones: EntradaOperacion[];
  reservas: EntradaReserva[];
  documentos: EntradaDocumento[];
  pagos: EntradaPago[];
  saldo: EntradaSaldo[];
};

// ─── Estados → tono ──────────────────────────────────────────────────────────

const ANULADO = /anulad|cancelad/i;

export function tonoDeCuenta(c: CuentaResumen | null): Tono {
  if (!c) return "neutro";
  if (c.porCobrar > TOLERANCIA) return "pendiente";
  if (c.aFavor > TOLERANCIA) return "alerta";
  return c.estadoPago === "pagado" ? "ok" : "neutro";
}

/** Texto corto del estado de pago de una cuenta: "Debe $35.00", "Pagado", "Sobra $20.00". */
export function estadoDeCuenta(c: CuentaResumen | null): string {
  if (!c) return "";
  if (c.porCobrar > TOLERANCIA) return `Debe ${dinero(c.porCobrar)}`;
  if (c.aFavor > TOLERANCIA) return `Sobra ${dinero(c.aFavor)}`;
  return ETIQUETA_ESTADO_PAGO[c.estadoPago];
}

export function tonoDeDocumento(d: Pick<EntradaDocumento, "tipo" | "estado" | "estadoAnulacion">): Tono {
  const e = (d.estado || "").toUpperCase();
  if (ANULADO.test(d.estado) || d.estadoAnulacion === "Anulada") return "anulado";
  if (/RECHAZ|DEVUELT|NO AUTORIZ|ERROR/.test(e)) return "alerta";
  if (d.estadoAnulacion === "Solicitada") return "pendiente";
  if (/AUTORIZ|VIGENTE|EMITID|FACTURAD/.test(e)) return "ok";
  if (/PENDIENTE|BORRADOR|RECIBID/.test(e)) return "pendiente";
  return "neutro";
}

const esDePruebas = (ambiente?: string) => /prueba/i.test(ambiente ?? "");

const dinero = (n: number) => `$${r2(n).toFixed(2)}`;
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** "2027-04-23" → "23 abr 2027" (sin zona horaria: es una fecha, no un instante). */
export function fechaTexto(aaaammdd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(aaaammdd);
  return m ? `${Number(m[3])} ${MESES[Number(m[2]) - 1]} ${m[1]}` : aaaammdd;
}

// ─── Armar la lista ──────────────────────────────────────────────────────────

const HREF: Partial<Record<TipoEvento, (id: string) => string>> = {
  orden: (id) => `/tecnicos/ordenes/${encodeURIComponent(id)}`,
  operacion: (id) => `/operaciones/${encodeURIComponent(id)}`,
  reserva: (id) => `/facturacion/imprimir/reserva/${encodeURIComponent(id)}`,
  factura: (id) => `/facturacion/documentos/factura/${encodeURIComponent(id)}`,
  nota_credito: (id) => `/facturacion/nota-credito/${encodeURIComponent(id)}`,
  recibo: (id) => `/facturacion/imprimir/recibo/${encodeURIComponent(id)}`,
};
const href = (tipo: TipoEvento, id: string) => HREF[tipo]?.(id) ?? null;

/** Orden del mismo día: primero lo que origina (cuenta), luego documento, pago y saldo. */
const PESO: Record<GrupoHistorial, number> = { cuentas: 0, documentos: 1, pagos: 2, saldo: 3 };

export function armarHistorial(e: EntradasHistorial): EventoHistorial[] {
  const out: EventoHistorial[] = [];

  for (const o of e.ordenes) {
    out.push({
      id: o.id, tipo: "orden", grupo: "cuentas", fecha: o.fecha, codigo: o.codigo,
      detalle: [o.equipo || "Sin equipo", o.estado].filter(Boolean).join(" · "),
      monto: o.cuenta ? r2(o.cuenta.totalCuenta) : null,
      estado: estadoDeCuenta(o.cuenta), tono: tonoDeCuenta(o.cuenta), href: href("orden", o.id),
    });
  }

  for (const op of e.operaciones) {
    // Un pedido de una orden se cobra en la cuenta de la orden: aquí solo se
    // dice a cuál pertenece, para no contar dos veces lo que debe.
    const deOrden = !!op.ordenCodigo;
    out.push({
      id: op.id, tipo: "operacion", grupo: "cuentas", fecha: op.fecha, codigo: op.codigo,
      detalle: [op.producto || "Sin producto", op.estado, deOrden ? `cuenta de ${op.ordenCodigo}` : ""].filter(Boolean).join(" · "),
      monto: !deOrden && op.cuenta ? r2(op.cuenta.totalCuenta) : null,
      estado: deOrden ? "" : estadoDeCuenta(op.cuenta),
      tono: deOrden ? "neutro" : tonoDeCuenta(op.cuenta),
      href: href("operacion", op.id),
    });
  }

  for (const r of e.reservas) {
    const anulada = ANULADO.test(r.estado);
    out.push({
      id: r.id, tipo: "reserva", grupo: "cuentas", fecha: r.fecha, codigo: r.codigo,
      detalle: [r.descripcion, `abonado ${dinero(r.abonado)} de ${dinero(r.precio)}`].filter(Boolean).join(" · "),
      monto: r2(r.precio),
      estado: r.estado,
      tono: anulada ? "anulado" : /complet|entregad|factur/i.test(r.estado) ? "ok" : /liberad|vencid/i.test(r.estado) ? "neutro" : "pendiente",
      href: href("reserva", r.id),
    });
  }

  for (const d of e.documentos) {
    if (esDePruebas(d.ambiente)) continue;
    const anulacion = d.estadoAnulacion ? `anulación ${d.estadoAnulacion.toLowerCase()}` : "";
    const credito = d.tipo === "nota_credito" && d.estadoCredito && d.destino !== "Reembolso" ? `crédito ${d.estadoCredito.toLowerCase()}` : "";
    out.push({
      id: d.id, tipo: d.tipo, grupo: "documentos", fecha: d.fecha, codigo: d.codigo || "Sin número",
      detalle: [d.destino ?? "", credito, anulacion].filter(Boolean).join(" · "),
      monto: r2(d.total),
      estado: d.estado,
      tono: tonoDeDocumento(d),
      href: href(d.tipo, d.id),
    });
  }

  const pagosVistos = new Set<string>();
  for (const p of e.pagos) {
    if (pagosVistos.has(p.id)) continue; // el mismo abono llega por la orden y por su pedido
    pagosVistos.add(p.id);
    const anulado = ANULADO.test(p.estado);
    out.push({
      id: p.id, tipo: "pago", grupo: "pagos", fecha: p.fecha, codigo: p.cuentaCodigo,
      detalle: [etiquetaAbono(p.metodo, p.monto), p.referencia ? `N° ${p.referencia}` : ""].filter(Boolean).join(" · "),
      monto: r2(p.monto),
      estado: anulado ? "Anulado" : "",
      tono: anulado ? "anulado" : p.monto < 0 ? "neutro" : "ok",
      href: null,
    });
  }

  for (const s of e.saldo) {
    const anulado = s.estado === "Anulado";
    const suma = s.tipo === "Generado";
    out.push({
      id: s.id, tipo: "saldo", grupo: "saldo", fecha: s.fecha, codigo: s.codigo,
      detalle: [s.tipo, s.referencia, suma && s.vence ? `vence ${fechaTexto(s.vence)}` : ""].filter(Boolean).join(" · "),
      monto: r2(suma ? s.monto : -s.monto),
      estado: anulado ? "Anulado" : "",
      tono: anulado ? "anulado" : suma ? "ok" : "neutro",
      href: null,
    });
  }

  return out.sort((a, b) => {
    if (!a.fecha !== !b.fecha) return a.fecha ? -1 : 1;
    const da = a.fecha.slice(0, 10), db = b.fecha.slice(0, 10);
    if (da !== db) return db.localeCompare(da);
    if (a.fecha !== b.fecha && a.fecha.length > 10 && b.fecha.length > 10) return b.fecha.localeCompare(a.fecha);
    return PESO[a.grupo] - PESO[b.grupo];
  });
}

// ─── Resumen de arriba ───────────────────────────────────────────────────────

export type ResumenCliente = {
  /** Lo que el cliente debe sumando todas sus cuentas abiertas. */
  porCobrar: number;
  cuentasConDeuda: number;
  /** Dinero de más que quedó en cuentas sin pasar a saldo ni devolver (debería ser 0). */
  sobranteEnCuentas: number;
  ordenes: number;
  ordenesActivas: number;
};

const ESTADOS_FINALES_ORDEN = new Set(["Completado", "Finalizado Entregado", "Enviado a Reciclaje"]);

export function resumirCliente(e: Pick<EntradasHistorial, "ordenes" | "operaciones">): ResumenCliente {
  // Cuentas = cada orden + cada pedido suelto (los de una orden van en la suya).
  const cuentas = [
    ...e.ordenes.map((o) => o.cuenta),
    ...e.operaciones.filter((op) => !op.ordenCodigo).map((op) => op.cuenta),
  ].filter((c): c is CuentaResumen => !!c);
  const conDeuda = cuentas.filter((c) => c.porCobrar > TOLERANCIA);
  return {
    porCobrar: r2(conDeuda.reduce((s, c) => s + c.porCobrar, 0)),
    cuentasConDeuda: conDeuda.length,
    sobranteEnCuentas: r2(cuentas.reduce((s, c) => s + (c.aFavor > TOLERANCIA ? c.aFavor : 0), 0)),
    ordenes: e.ordenes.length,
    ordenesActivas: e.ordenes.filter((o) => !ESTADOS_FINALES_ORDEN.has(o.estado)).length,
  };
}
