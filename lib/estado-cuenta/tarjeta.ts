// Tarjeta "Cuenta" de la orden y del pedido — reglas PURAS (auditoría ops,
// punto 11 · 21-nov-2026).
//
// Antes la orden mostraba el saldo tres veces, el total dos, los pagos en dos
// listas y dos botones de cobro (recuadro grande + cuadrícula + "Cuenta
// unificada" + repuestos históricos + otra lista de abonos). Ahora es una sola
// tarjeta con forma de estado de cuenta, como la tarjeta "Pago" de Shopify o
// la factura de Odoo: estado de pago y documento arriba, saldo, cargos
// agrupados (se abren con un toque), pagos y UNA acción según el momento.
//
// Aquí NO se calcula ningún total: todos salen de la calculadora única
// (lib/estado-cuenta/reglas.ts, vía getCuentaUnificada). Esta función solo
// ordena lo que ya viene resuelto para pintarlo igual en la orden y en el
// pedido especial.
//
// Decisiones del dueño (21-nov-2026): cargos agrupados y cerrados; "Entregar
// al cliente" solo en la cabecera (la cuenta termina en "Cuenta cerrada");
// anular un pago solo un administrador, con motivo, nunca con documento
// vigente ni si es un pago en línea; los anulados fuera de la lista, detrás
// de un enlace.
//
// Sin dependencias de servidor ni de Airtable.

import type { CuentaUnificada, CuentaUnificadaAbono } from "@/types/cuenta-unificada";
import { cargosDescontables, descuentoPorCargo } from "./descuentos";
import { ETIQUETA_ESTADO_PAGO, type EstadoPago } from "./reglas";
import { etiquetaAbono } from "@/lib/cobros/metodos";
import { numeroDeAbono } from "@/lib/cobros/comprobante-abono";
import { revisarAnulacion, type BloqueoAnulacion } from "@/lib/cobros/anular";

const TOL = 0.01;

export type MomentoCuenta = "sin_cargos" | "cobrar" | "emitir" | "cerrada" | "favor";

/** El documento de venta vigente de la cuenta (factura o recibo). */
export type DocumentoCuenta = {
  tipo: "factura" | "recibo";
  numero: string;
  recordId?: string;
  /** Estado del documento (AUTORIZADO, PENDIENTE, DEVUELTA… o Vigente en el recibo). */
  estado?: string;
};

const ESTADOS_DOCUMENTO_NORMALES = new Set(["AUTORIZADO", "Vigente"]);

/** Lo que dice la etiqueta del documento: el número y, si no es lo normal, su estado. */
export function textoDocumento(d: DocumentoCuenta): string {
  const extra = d.estado && !ESTADOS_DOCUMENTO_NORMALES.has(d.estado) ? ` · ${d.estado.toLowerCase()}` : "";
  return `${d.numero}${extra}`;
}

export type TonoTarjeta = "ambar" | "verde" | "azul" | "gris";

export type LineaTarjeta = {
  id: string;
  nombre: string;
  /** "Servicio", "Stock", "Pedido", "Garantía SUPER GEEK", "Sistema anterior"… */
  detalle: string;
  /** Precio de lista (antes del descuento). */
  precio: number;
  /** El administrador le puede dar descuento (punto 4B). */
  descontable: boolean;
  garantia: boolean;
};

export type ClaveGrupo = "servicios" | "repuestos" | "digitales" | "aprobado";

export type GrupoTarjeta = {
  clave: ClaveGrupo;
  nombre: string;
  /** Subtotal de la calculadora única (antes de descuentos). */
  total: number;
  lineas: LineaTarjeta[];
  /** Lo aprobado sin artículo: suma, pero todavía no se factura. */
  enEspera: boolean;
};

export type PagoTarjeta = {
  id: string;
  numero: string;
  fecha: string | null;
  etiqueta: string;
  monto: number;
  registradoPor: string | null;
  enLinea: boolean;
  comprobantes: NonNullable<CuentaUnificadaAbono["comprobantes"]>;
  /** null = se puede anular. Si no, por qué no (para mostrarlo o esconder el botón). */
  bloqueoAnular: BloqueoAnulacion | null;
  mensajeAnular: string | null;
};

export type PagoAnuladoTarjeta = {
  id: string;
  numero: string;
  fecha: string | null;
  etiqueta: string;
  monto: number;
  anuladoPor: string | null;
  motivo: string | null;
  fechaAnulacion: string | null;
};

export type AccionTarjeta =
  | { tipo: "registrar_pago"; monto: number }
  | { tipo: "emitir"; bloqueo: string | null }
  | { tipo: "saldo_a_favor"; sobrante: number }
  | { tipo: "ninguna" };

export type TarjetaCuenta = {
  momento: MomentoCuenta;
  estadoPago: EstadoPago;
  etiquetaEstado: string;
  tono: TonoTarjeta;
  documento: DocumentoCuenta | null;
  saldo: { etiqueta: string; monto: number; tono: TonoTarjeta };
  totalCuenta: number;
  totalAbonado: number;
  totalDescuentos: number;
  grupos: GrupoTarjeta[];
  /** Cuántas líneas hay en total (para la fila cerrada "Cargos"). */
  numeroLineas: number;
  /** Repuestos del sistema anterior que NO suman (solo referencia). */
  historicosReferencia: LineaTarjeta[];
  pagos: PagoTarjeta[];
  anulados: PagoAnuladoTarjeta[];
  accion: AccionTarjeta;
  /** Excepción que hay que revisar (documento emitido y falta cobrar). */
  alerta: string | null;
};

const MOTIVO_APROBADO: Record<string, string> = {
  falta_pedir: "falta pedirlo",
  sin_stock: "sin stock",
  sin_codigo: "falta comprar o entregar la licencia",
  pendiente: "pendiente",
};

function etiquetaDocumento(d: DocumentoCuenta): string {
  return `${d.tipo === "factura" ? "Factura" : "Recibo"} ${d.numero}`.trim();
}

/** Momento de la cuenta: qué le toca al empleado ahora. */
export function momentoDeCuenta(c: Pick<CuentaUnificada, "saldo" | "totalCuenta">, documento: DocumentoCuenta | null): MomentoCuenta {
  if (c.saldo < -TOL) return "favor";
  if (c.saldo > TOL) return "cobrar";
  if (c.totalCuenta <= TOL) return "sin_cargos";
  return documento ? "cerrada" : "emitir";
}

const TONO_ESTADO: Record<EstadoPago, TonoTarjeta> = {
  sin_cargos: "gris",
  sin_pago: "ambar",
  pago_parcial: "ambar",
  pagado: "verde",
  saldo_a_favor: "azul",
};

export function armarTarjetaCuenta(input: {
  cuenta: CuentaUnificada;
  documento: DocumentoCuenta | null;
  esAdmin: boolean;
}): TarjetaCuenta {
  const { cuenta, documento, esAdmin } = input;
  const descontables = new Set(cargosDescontables(cuenta).map((c) => c.id));
  const enPedido = !cuenta.ordenId;

  const servicios: LineaTarjeta[] = cuenta.servicios.map((s) => ({
    id: s.id,
    nombre: s.nombre,
    detalle: s.garantia ? "Garantía SUPER GEEK" : s.sinDocumento ? "Sin factura" : s.id.startsWith("recargo:") ? "Cargo del pedido" : "Servicio",
    precio: s.costo,
    descontable: descontables.has(s.id),
    garantia: !!s.garantia,
  }));
  const repuestos: LineaTarjeta[] = [
    ...cuenta.items.map((i) => ({
      id: i.id,
      nombre: i.cantidad && i.cantidad > 1 ? `${i.nombre} · ${i.cantidad} × $${(i.precioUnitario ?? 0).toFixed(2)}` : i.nombre,
      detalle: i.garantia ? "Garantía SUPER GEEK" : i.origen === "pedido" ? "Pedido" : "Stock",
      precio: i.precio,
      descontable: descontables.has(i.id),
      garantia: !!i.garantia,
    })),
    ...(cuenta.repuestosHistoricosCuentanParaTotal
      ? cuenta.repuestosHistoricos.map((r) => ({
          id: r.id, nombre: r.nombre, detalle: "Sistema anterior", precio: r.subtotal, descontable: descontables.has(r.id), garantia: false,
        }))
      : []),
  ];
  const digitales: LineaTarjeta[] = (cuenta.productosDigitales ?? []).map((p) => ({
    id: p.id, nombre: p.nombre || "Producto digital", detalle: "Producto digital", precio: p.precioVenta, descontable: descontables.has(p.id), garantia: false,
  }));
  const aprobado: LineaTarjeta[] = (cuenta.aprobadoSinArticulo ?? []).map((p) => ({
    id: p.id, nombre: p.nombre, detalle: `Aprobado · ${MOTIVO_APROBADO[p.motivo] ?? "pendiente"}`, precio: p.monto, descontable: false, garantia: false,
  }));

  const grupos: GrupoTarjeta[] = [
    { clave: "servicios" as const, nombre: enPedido ? "Cargos del pedido" : "Servicios", total: cuenta.totalServicios, lineas: servicios, enEspera: false },
    { clave: "repuestos" as const, nombre: enPedido ? "Artículos" : "Repuestos", total: cuenta.totalRepuestos, lineas: repuestos, enEspera: false },
    { clave: "digitales" as const, nombre: "Productos digitales", total: cuenta.totalProductosDigitales, lineas: digitales, enEspera: false },
    { clave: "aprobado" as const, nombre: "Aprobado, sin artículo · no se factura aún", total: cuenta.totalAprobadoSinArticulo, lineas: aprobado, enEspera: true },
  ].filter((g) => g.lineas.length > 0 || Math.abs(g.total) > TOL);

  const historicosReferencia: LineaTarjeta[] = cuenta.repuestosHistoricosCuentanParaTotal
    ? []
    : cuenta.repuestosHistoricos.map((r) => ({ id: r.id, nombre: r.nombre, detalle: "Sistema anterior · no suma", precio: r.subtotal, descontable: false, garantia: false }));

  const pagos: PagoTarjeta[] = [];
  const anulados: PagoAnuladoTarjeta[] = [];
  for (const a of cuenta.abonos) {
    const base = { id: a.id, numero: numeroDeAbono(a), fecha: a.fecha, etiqueta: etiquetaAbono(a.metodoPago, a.monto), monto: a.monto };
    if (a.estado === "Anulado") {
      anulados.push({ ...base, anuladoPor: a.anuladoPor ?? null, motivo: a.motivoAnulacion ?? null, fechaAnulacion: a.fechaAnulacion ?? null });
      continue;
    }
    const revision = revisarAnulacion({
      esAdmin,
      pago: { estado: a.estado, metodoPago: a.metodoPago, observacion: a.observacion, enLinea: !!a.enLinea },
      documento,
    });
    pagos.push({
      ...base,
      registradoPor: a.registradoPor ?? null,
      enLinea: !!a.enLinea,
      comprobantes: a.comprobantes ?? [],
      bloqueoAnular: revision.ok ? null : revision.bloqueo,
      mensajeAnular: revision.ok ? null : revision.mensaje,
    });
  }

  const momento = momentoDeCuenta(cuenta, documento);
  const pendientes = (cuenta.aprobadoSinArticulo ?? []).map((p) => p.nombre).filter(Boolean);
  const accion: AccionTarjeta =
    momento === "cobrar" ? { tipo: "registrar_pago", monto: cuenta.saldo }
    : momento === "emitir" ? { tipo: "emitir", bloqueo: pendientes.length ? `Se emite cuando llegue: ${pendientes.join(", ")}` : null }
    : momento === "favor" ? { tipo: "saldo_a_favor", sobrante: -cuenta.saldo }
    : { tipo: "ninguna" };

  const saldo =
    momento === "cobrar" ? { etiqueta: "Falta cobrar", monto: cuenta.saldo, tono: "ambar" as const }
    : momento === "favor" ? { etiqueta: "Sobra", monto: -cuenta.saldo, tono: "azul" as const }
    : { etiqueta: "Saldo", monto: 0, tono: momento === "sin_cargos" ? "gris" as const : "verde" as const };

  return {
    momento,
    estadoPago: cuenta.estadoPago,
    etiquetaEstado: ETIQUETA_ESTADO_PAGO[cuenta.estadoPago],
    tono: TONO_ESTADO[cuenta.estadoPago],
    documento,
    saldo,
    totalCuenta: cuenta.totalCuenta,
    totalAbonado: cuenta.totalAbonado,
    totalDescuentos: cuenta.totalDescuentos ?? 0,
    grupos,
    numeroLineas: grupos.reduce((n, g) => n + g.lineas.length, 0),
    historicosReferencia,
    pagos,
    anulados,
    accion,
    alerta: documento && momento === "cobrar"
      ? `${etiquetaDocumento(documento)} emitido y falta cobrar. Revisar.`
      : null,
  };
}

/** El descuento vigente de una línea (para pintar el precio tachado). */
export function descuentosDeTarjeta(cuenta: Pick<CuentaUnificada, "descuentos">) {
  return descuentoPorCargo(cuenta.descuentos ?? []);
}
