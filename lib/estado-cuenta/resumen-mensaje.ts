// Resumen de la cuenta para el mensaje al cliente — PURO (auditoría ops,
// punto 4C).
//
// Antes la Automatización 2 de Airtable (la que redacta el WhatsApp con IA)
// recibía "Resumen General Presupuestos": un texto crudo armado con los
// campos viejos ("Total a Pagar:110, Total de Servicios:130, Saldo:20…"),
// sin descuentos ni lo aprobado, que la IA no sabía ordenar. Ahora, al pedir
// el mensaje, el sistema escribe una FOTO de la cuenta en ese momento, con la
// calculadora única y ya en viñetas; la IA solo la redacta.

import { ETIQUETA_ESTADO_PAGO, type EstadoPago } from "./reglas";

const dinero = (n: number) => `$${(Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2)}`;
const TOL = 0.005;

export type CuentaParaResumen = {
  items: ReadonlyArray<{ id: string; nombre: string; precio: number }>;
  servicios: ReadonlyArray<{ id: string; nombre: string; costo: number }>;
  productosDigitales: ReadonlyArray<{ id: string; nombre: string; precioVenta: number }>;
  repuestosHistoricos: ReadonlyArray<{ id: string; nombre: string; subtotal: number }>;
  repuestosHistoricosCuentanParaTotal: boolean;
  aprobadoSinArticulo: ReadonlyArray<{ id: string; nombre: string; monto: number }>;
  descuentos: ReadonlyArray<{ cargoId: string; monto: number; estado: string }>;
  totalCuenta: number;
  totalAbonado: number;
  saldo: number;
  estadoPago: EstadoPago;
};

/** Líneas propuestas al cliente que todavía no responde. */
export type LineaPorConfirmar = { estado: string; cantidad: number; precioUnitario: number; grupoAlternativas?: string };

/**
 * Lo que falta que el cliente confirme: las líneas "Propuesta". Las
 * alternativas (mismo grupo) cuentan una sola vez, por la más barata, y el
 * monto se presenta como "desde".
 */
export function presupuestoPorConfirmar(lineas: readonly LineaPorConfirmar[]): { cantidad: number; monto: number; conAlternativas: boolean } {
  const propuestas = lineas.filter((l) => l.estado === "Propuesta");
  const sueltas = propuestas.filter((l) => !l.grupoAlternativas);
  const grupos = new Map<string, number>();
  for (const l of propuestas) {
    if (!l.grupoAlternativas) continue;
    const m = (l.cantidad || 1) * l.precioUnitario;
    grupos.set(l.grupoAlternativas, Math.min(grupos.get(l.grupoAlternativas) ?? Infinity, m));
  }
  const monto = sueltas.reduce((s, l) => s + (l.cantidad || 1) * l.precioUnitario, 0) + [...grupos.values()].reduce((s, m) => s + m, 0);
  return { cantidad: sueltas.length + grupos.size, monto: Math.round(monto * 100) / 100, conAlternativas: grupos.size > 0 };
}

export function resumenCuentaParaMensaje(
  cuenta: CuentaParaResumen,
  porConfirmar: { cantidad: number; monto: number; conAlternativas: boolean } = { cantidad: 0, monto: 0, conAlternativas: false },
): string {
  const descuento = new Map<string, number>();
  for (const d of cuenta.descuentos) if (d.estado === "Vigente" && !descuento.has(d.cargoId)) descuento.set(d.cargoId, d.monto);

  const linea = (id: string, nombre: string, precio: number) => {
    const desc = descuento.get(id);
    return desc && desc > TOL
      ? `• ${nombre}: ${dinero(precio)} − descuento ${dinero(desc)} = ${dinero(Math.max(0, precio - desc))}`
      : `• ${nombre}: ${dinero(precio)}`;
  };
  const cargos = [
    ...cuenta.servicios.filter((s) => s.costo > TOL).map((s) => linea(s.id, s.nombre, s.costo)),
    ...cuenta.items.filter((i) => i.precio > TOL).map((i) => linea(i.id, i.nombre, i.precio)),
    ...cuenta.productosDigitales.filter((p) => p.precioVenta > TOL).map((p) => linea(p.id, p.nombre || "Producto digital", p.precioVenta)),
    ...(cuenta.repuestosHistoricosCuentanParaTotal
      ? cuenta.repuestosHistoricos.filter((r) => r.subtotal > TOL).map((r) => linea(r.id, r.nombre, r.subtotal))
      : []),
    ...cuenta.aprobadoSinArticulo.filter((p) => p.monto > TOL).map((p) => `• ${p.nombre}: ${dinero(p.monto)} (aprobado, en espera)`),
  ];

  const out: string[] = [];
  const hayPagos = cuenta.totalAbonado > TOL;
  if (cargos.length === 0 && !hayPagos && porConfirmar.cantidad === 0) return "Sin cargos ni pagos registrados.";

  if (cargos.length > 0 || hayPagos) out.push(`Estado de pago: ${ETIQUETA_ESTADO_PAGO[cuenta.estadoPago]}`);
  if (cargos.length > 0) {
    out.push("Cargos:", ...cargos, `Total: ${dinero(cuenta.totalCuenta)}`);
  }
  if (hayPagos) out.push(`Pagado: ${dinero(cuenta.totalAbonado)}`);
  if (cuenta.saldo > TOL) out.push(`Saldo pendiente: ${dinero(cuenta.saldo)}`);
  else if (cuenta.saldo < -TOL) out.push(`Saldo a favor del cliente: ${dinero(-cuenta.saldo)}`);
  else if (cargos.length > 0) out.push("Cuenta pagada en su totalidad.");
  if (porConfirmar.cantidad > 0) {
    const items = porConfirmar.cantidad === 1 ? "1 ítem" : `${porConfirmar.cantidad} ítems`;
    out.push(`Presupuesto por confirmar: ${items} ${porConfirmar.conAlternativas ? "desde" : "por"} ${dinero(porConfirmar.monto)}`);
  }
  return out.join("\n");
}
