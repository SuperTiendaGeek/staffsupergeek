// Comprobante de abono — PURO (pedido del dueño, 2-nov-2026).
//
// Constancia que se le entrega al cliente cuando paga (todo o una parte) de
// una orden de reparación o de un pedido (Operación Comercial). No es un
// comprobante de venta: el documento tributario (factura o recibo) se emite
// cuando la cuenta queda en $0. Se imprime en ticket de 80 mm o en PDF A4, con
// el mismo estilo de los documentos de Facturación.
//
// Lo arma la calculadora única: los cargos, lo pagado y el saldo salen de la
// cuenta (getCuentaUnificada), nunca de campos viejos de Airtable.
//
// Ejemplo: OP-2026-000126, Camila paga $130 por transferencia →
//   ABO-000303 · Pagado $130 · Total de la cuenta $130 · Saldo $0.

import { cargosVisiblesDeCuenta, type CargoVisible, type CuentaParaResumen } from "@/lib/estado-cuenta/resumen-mensaje";
import { etiquetaAbono } from "./metodos";

const TOL = 0.005;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type AbonoDeCuenta = {
  id: string;
  idAbono: string | null;
  fecha: string | null;
  monto: number;
  metodoPago: string | null;
  estado: string;
  observacion: string | null;
  numeroTransaccion: string | null;
};

export type CuentaParaComprobante = CuentaParaResumen & {
  ordenIdVisible: string | null;
  operacionCodigo: string | null;
  abonos: AbonoDeCuenta[];
};

export type ClienteComprobante = { nombre: string; identificacion: string; telefono: string; correo: string };

export type ComprobanteAbono = {
  numero: string;
  fecha: string | null;
  /** A qué cuenta corresponde: "OP-2026-000126", "OR000522" o "OR000522 · OP-2026-000129". */
  referencia: string;
  cliente: ClienteComprobante;
  abono: { monto: number; metodo: string; transaccion: string; observacion: string; anulado: boolean };
  cargos: CargoVisible[];
  /** Todos los pagos vigentes de la cuenta, en orden de fecha; `esEste` marca el del comprobante. */
  pagos: Array<{ numero: string; fecha: string | null; metodo: string; monto: number; esEste: boolean }>;
  totalCuenta: number;
  totalPagado: number;
  saldoPendiente: number;
  saldoAFavor: number;
};

export function numeroDeAbono(a: Pick<AbonoDeCuenta, "id" | "idAbono">): string {
  const n = Number(a.idAbono);
  return Number.isFinite(n) && n > 0 ? `ABO-${String(n).padStart(6, "0")}` : `ABO-${a.id.slice(-6).toUpperCase()}`;
}

export function referenciaDeCuenta(c: Pick<CuentaParaComprobante, "ordenIdVisible" | "operacionCodigo">): string {
  return [c.ordenIdVisible, c.operacionCodigo].filter(Boolean).join(" · ") || "—";
}

/** El abono que se pide: por record id o por "ID Abono"; solo pagos de dinero (monto > 0). */
export function buscarAbonoParaComprobante(
  abonos: readonly AbonoDeCuenta[],
  abonoId: string,
): { ok: true; abono: AbonoDeCuenta } | { ok: false; motivo: string } {
  const id = abonoId.trim();
  const abono = abonos.find((a) => a.id === id || (a.idAbono !== null && a.idAbono === id));
  if (!abono) return { ok: false, motivo: "Ese abono no pertenece a esta cuenta." };
  if (!(abono.monto > TOL)) return { ok: false, motivo: "Ese movimiento no es un pago del cliente (es una devolución o un traspaso a saldo a favor)." };
  return { ok: true, abono };
}

export function armarComprobanteAbono(
  cuenta: CuentaParaComprobante,
  abono: AbonoDeCuenta,
  cliente: ClienteComprobante,
): ComprobanteAbono {
  const vigentes = cuenta.abonos
    .filter((a) => a.estado !== "Anulado")
    .sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? ""));
  return {
    numero: numeroDeAbono(abono),
    fecha: abono.fecha,
    referencia: referenciaDeCuenta(cuenta),
    cliente,
    abono: {
      monto: r2(abono.monto),
      metodo: etiquetaAbono(abono.metodoPago, abono.monto),
      transaccion: abono.numeroTransaccion?.trim() ?? "",
      observacion: abono.observacion?.trim() ?? "",
      anulado: abono.estado === "Anulado",
    },
    cargos: cargosVisiblesDeCuenta(cuenta),
    pagos: vigentes.map((a) => ({
      numero: numeroDeAbono(a),
      fecha: a.fecha,
      metodo: etiquetaAbono(a.metodoPago, a.monto),
      monto: r2(a.monto),
      esEste: a.id === abono.id,
    })),
    totalCuenta: r2(cuenta.totalCuenta),
    totalPagado: r2(cuenta.totalAbonado),
    saldoPendiente: cuenta.saldo > TOL ? r2(cuenta.saldo) : 0,
    saldoAFavor: cuenta.saldo < -TOL ? r2(-cuenta.saldo) : 0,
  };
}

/** Fecha corta en hora de Ecuador: "02/11/2026". */
export function fechaComprobante(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00-05:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-EC", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Guayaquil" });
}

/** Dónde se imprime (ticket 80 mm) y se descarga (PDF A4) el comprobante, según la pantalla. */
export function enlacesComprobanteAbono(origenTipo: "orden" | "operacion", id: string, abonoId: string): { ticket: string; pdf: string } {
  const i = encodeURIComponent(id);
  const a = encodeURIComponent(abonoId);
  return origenTipo === "orden"
    ? { ticket: `/tecnicos/ordenes/${i}/abonos/${a}/imprimir`, pdf: `/api/tecnicos/ordenes/${i}/abonos/${a}/pdf` }
    : { ticket: `/operaciones/${i}/abonos/${a}/imprimir`, pdf: `/api/operaciones/${i}/abonos/${a}/pdf` };
}
