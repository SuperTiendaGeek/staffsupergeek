import "server-only";

// Historia del cliente — LECTURA (auditoría ops, punto 13C). Lee todo lo del
// cliente desde sus campos inversos (regla de la casa: nunca filtrar por un
// campo de link) y lo entrega a ./historial.ts, que arma la lista.
//
// Las cuentas (cuánto debe cada orden o pedido) salen de la MISMA calculadora
// que la pantalla de la orden (lib/estado-cuenta), en bloque. El saldo a favor
// sale del libro "Saldo a Favor" (lib/saldo-favor). Aquí no se calcula nada
// de dinero por cuenta propia.

import { fetchRecordById, linkedIds } from "@/lib/finanzas/airtable-client";
import {
  CAMPOS_ORDEN_CUENTA,
  estadosDeCuentaDeOperaciones,
  estadosDeCuentaDeOrdenes,
  ids,
  numero,
  porIds,
  texto,
  type CuentaEnBloque,
  type Registro,
} from "@/lib/estado-cuenta/airtable";
import { movimientosDeCliente, type RegistroSaldo } from "@/lib/saldo-favor/airtable";
import { calcularSaldoCliente, type SaldoCliente } from "@/lib/saldo-favor/reglas";
import { hoyEcuador } from "@/lib/saldo-favor/servidor";
import {
  armarHistorial,
  resumirCliente,
  type CuentaResumen,
  type EntradaDocumento,
  type EntradaOperacion,
  type EntradaOrden,
  type EntradaPago,
  type EntradaReserva,
  type EntradaSaldo,
  type EventoHistorial,
  type ResumenCliente,
} from "./historial";

export type HistorialCliente = {
  saldo: Pick<SaldoCliente, "disponible" | "proximoVence">;
  resumen: ResumenCliente;
  eventos: EventoHistorial[];
};

const resumenDeCuenta = (c: CuentaEnBloque | undefined): CuentaResumen | null =>
  c ? { totalCuenta: c.totalCuenta, porCobrar: c.porCobrar, aFavor: c.aFavor, estadoPago: c.estadoPago } : null;

const fechaDe = (r: Registro, campo: string) => texto(r.fields[campo]) || r.createdTime || "";

/** Referencia legible de un movimiento de saldo: lo que va después del cliente en su descripción. */
function referenciaSaldo(m: RegistroSaldo): string {
  const partes = m.descripcion.split(" · ");
  return partes.length > 2 ? partes.slice(2).join(" · ") : "";
}

export async function historialDeCliente(clienteId: string): Promise<HistorialCliente | null> {
  const cliente = await fetchRecordById("Clientes", clienteId);
  if (!cliente) return null;
  const f = cliente.fields;

  const [ordenesMap, operacionesMap, reservas, facturas, notas, recibos, proformas, movimientosSaldo] = await Promise.all([
    porIds("Órdenes de Reparación", linkedIds(f["Órdenes Relacionadas"]), ["ID", "Fecha de Ingreso", "Equipo", "Estado Actual", ...CAMPOS_ORDEN_CUENTA]),
    porIds("Operación Comercial", linkedIds(f["Operaciones Comerciales"]), ["Código Operación", "Producto Solicitado", "Estado", "Orden de Reparación"]),
    porIds("Reservas", linkedIds(f["Reservas"]), ["Número", "Fecha", "Estado", "Descripción Item", "Precio", "Total Abonado"]),
    porIds("Facturas Electrónicas", linkedIds(f["Facturas Electrónicas"]), ["Número de Factura", "Fecha de Emisión", "Total", "Estado", "Ambiente", "Estado Anulación"]),
    porIds("Notas de Crédito Electrónicas", linkedIds(f["Notas de Crédito Electrónicas"]), ["Número de Nota de Crédito", "Fecha de Emisión", "Total", "Estado", "Ambiente", "Destino", "Estado Crédito"]),
    porIds("Recibos", linkedIds(f["Recibos"]), ["Número", "Fecha", "Total", "Estado"]),
    porIds("Proformas", linkedIds(f["Proformas"]), ["Número", "Fecha", "Total", "Estado"]),
    movimientosDeCliente(clienteId),
  ]);

  // Cuentas: cada orden (con todos sus pedidos) y cada pedido suelto.
  const ordenes = [...ordenesMap.values()];
  const operaciones = [...operacionesMap.values()];
  const sueltas = operaciones.filter((op) => ids(op.fields["Orden de Reparación"]).length === 0).map((op) => op.id);
  const [cuentasOrden, cuentasSueltas] = await Promise.all([
    estadosDeCuentaDeOrdenes(ordenes),
    estadosDeCuentaDeOperaciones(sueltas),
  ]);

  const codigoOrden = new Map(ordenes.map((o) => [o.id, texto(o.fields["ID"]) || o.id]));
  const entradasOrden: EntradaOrden[] = ordenes.map((o) => ({
    id: o.id,
    codigo: codigoOrden.get(o.id)!,
    fecha: fechaDe(o, "Fecha de Ingreso"),
    equipo: texto(o.fields["Equipo"]),
    estado: texto(o.fields["Estado Actual"]),
    cuenta: resumenDeCuenta(cuentasOrden.get(o.id)),
  }));
  const entradasOperacion: EntradaOperacion[] = operaciones.map((op) => {
    const ordenId = ids(op.fields["Orden de Reparación"])[0] ?? null;
    return {
      id: op.id,
      codigo: texto(op.fields["Código Operación"]) || op.id,
      fecha: op.createdTime ?? "",
      producto: texto(op.fields["Producto Solicitado"]),
      estado: texto(op.fields["Estado"]),
      ordenCodigo: ordenId ? codigoOrden.get(ordenId) ?? "su orden" : null,
      cuenta: ordenId ? null : resumenDeCuenta(cuentasSueltas.get(op.id)),
    };
  });

  // Pagos: los abonos de todas sus cuentas (la calculadora ya los juntó sin repetir).
  const abonoCuenta = new Map<string, string>();
  for (const o of ordenes) for (const a of cuentasOrden.get(o.id)?.abonos ?? []) if (!abonoCuenta.has(a.id)) abonoCuenta.set(a.id, codigoOrden.get(o.id)!);
  for (const opId of sueltas) {
    const codigo = texto(operacionesMap.get(opId)?.fields["Código Operación"]) || opId;
    for (const a of cuentasSueltas.get(opId)?.abonos ?? []) if (!abonoCuenta.has(a.id)) abonoCuenta.set(a.id, codigo);
  }
  const abonos = await porIds("Abonos", [...abonoCuenta.keys()], ["Monto", "Método de Pago", "Fecha de Abono", "Estado del Abono", "Número de Transacción"]);
  const entradasPago: EntradaPago[] = [...abonos.values()].map((a) => ({
    id: a.id,
    fecha: fechaDe(a, "Fecha de Abono"),
    monto: numero(a.fields["Monto"]),
    metodo: texto(a.fields["Método de Pago"]),
    estado: texto(a.fields["Estado del Abono"]),
    referencia: texto(a.fields["Número de Transacción"]),
    cuentaCodigo: abonoCuenta.get(a.id) ?? "",
  }));

  const entradasReserva: EntradaReserva[] = [...reservas.values()].map((r) => ({
    id: r.id,
    codigo: texto(r.fields["Número"]) || r.id,
    fecha: fechaDe(r, "Fecha"),
    descripcion: texto(r.fields["Descripción Item"]),
    estado: texto(r.fields["Estado"]),
    precio: numero(r.fields["Precio"]),
    abonado: numero(r.fields["Total Abonado"]),
  }));

  const doc = (tipo: EntradaDocumento["tipo"], r: Registro, campoNumero: string, campoFecha: string): EntradaDocumento => ({
    id: r.id,
    tipo,
    codigo: texto(r.fields[campoNumero]),
    fecha: fechaDe(r, campoFecha),
    total: numero(r.fields["Total"]),
    estado: texto(r.fields["Estado"]),
    ambiente: texto(r.fields["Ambiente"]) || undefined,
    destino: texto(r.fields["Destino"]) || undefined,
    estadoCredito: texto(r.fields["Estado Crédito"]) || undefined,
    estadoAnulacion: texto(r.fields["Estado Anulación"]) || undefined,
  });
  const entradasDocumento: EntradaDocumento[] = [
    ...[...facturas.values()].map((r) => doc("factura", r, "Número de Factura", "Fecha de Emisión")),
    ...[...notas.values()].map((r) => doc("nota_credito", r, "Número de Nota de Crédito", "Fecha de Emisión")),
    ...[...recibos.values()].map((r) => doc("recibo", r, "Número", "Fecha")),
    ...[...proformas.values()].map((r) => doc("proforma", r, "Número", "Fecha")),
  ];

  const entradasSaldo: EntradaSaldo[] = movimientosSaldo.map((m) => ({
    id: m.id, codigo: m.codigo, tipo: m.tipo, monto: m.monto, fecha: m.fecha,
    vence: m.vence ?? null, estado: m.estado, referencia: referenciaSaldo(m),
  }));

  const saldo = calcularSaldoCliente(movimientosSaldo, hoyEcuador());
  const entradas = {
    ordenes: entradasOrden,
    operaciones: entradasOperacion,
    reservas: entradasReserva,
    documentos: entradasDocumento,
    pagos: entradasPago,
    saldo: entradasSaldo,
  };
  return {
    saldo: { disponible: saldo.disponible, proximoVence: saldo.proximoVence },
    resumen: resumirCliente(entradas),
    eventos: armarHistorial(entradas),
  };
}
