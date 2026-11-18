import "server-only";

// Pantalla del cliente (etapa 10E-B) — datos para "Cobrar en el mostrador".
// Todo sale de la MISMA vista pública que ve el cliente en su enlace
// (vistaPublica de la orden, vistaPublicaPedido del pedido): así es imposible
// que el monitor del mostrador muestre costos de proveedor o notas internas,
// y el monto lo sigue calculando la calculadora única.

import { fetchRecordById } from "@/lib/finanzas/airtable-client";
import { asegurarEnlace, tokenDeLaOrden, urlEnlace, vistaPublica } from "@/lib/tecnicos/presupuesto/enlace";
import { leerOrdenEnlace } from "@/lib/tecnicos/presupuesto/airtable";
import { tokenDelPedido, urlEnlacePedido, vistaPublicaPedido } from "@/lib/pedidos-especiales/enlace";
import type { OpcionDePago, PagoVisible } from "@/lib/pagos-en-linea/reglas";
import type { CobroEnPantalla } from "./reglas";

export type DatosCobroMostrador = {
  codigo: string;
  cliente: string;
  detalle: string;
  /** Para "Enviar por WhatsApp" (solo lo ve el empleado). */
  telefono: string;
  lineas: CobroEnPantalla["lineas"];
  total: number;
  pagado: number;
  falta: number;
  /** Lo que se puede cobrar en línea ahora (vacío si el pago en línea está apagado). */
  opciones: OpcionDePago[];
  ultimo: PagoVisible | null;
  /** Enlace del cliente (el QR le agrega ?cobrar=…). */
  enlace: string;
};

export class SinEnlace extends Error {}

export async function datosCobroOrden(ordenId: string, origin: string): Promise<DatosCobroMostrador> {
  // El enlace de la orden: el que ya tiene (aunque haya vencido para aprobar,
  // sirve para pagar) o uno nuevo.
  const token = (await tokenDeLaOrden(ordenId)) || (await asegurarEnlace(ordenId)).token;
  const [vista, o] = await Promise.all([vistaPublica(token), leerOrdenEnlace(ordenId)]);
  if (!vista) throw new SinEnlace("No se pudo leer el enlace de esta orden.");
  const cuenta = vista.cuenta ?? { total: 0, pagado: 0, falta: 0, faltaRepuestos: 0 };
  return {
    codigo: vista.orden.idVisible,
    cliente: vista.orden.cliente,
    detalle: vista.orden.equipo,
    telefono: o.telefono,
    lineas: vista.lineas
      .filter((l) => l.situacion === "aprobada" || l.situacion === "en_proceso")
      .map((l) => ({ descripcion: l.cantidad > 1 ? `${l.descripcion} ×${l.cantidad}` : l.descripcion, monto: l.subtotal, nota: l.situacion === "en_proceso" ? "en proceso" : "aprobado" })),
    total: cuenta.total,
    pagado: cuenta.pagado,
    falta: cuenta.falta,
    opciones: vista.pagoEnLinea.disponible ? vista.pagoEnLinea.opciones : [],
    ultimo: vista.pagoEnLinea.ultimo,
    enlace: urlEnlace(origin, token),
  };
}

export async function datosCobroPedido(pedidoId: string, origin: string): Promise<DatosCobroMostrador> {
  const token = await tokenDelPedido(pedidoId);
  if (!token) throw new SinEnlace("Este pedido todavía no tiene enlace: envía primero la cotización.");
  const [vista, op] = await Promise.all([vistaPublicaPedido(token), fetchRecordById("Operación Comercial", pedidoId)]);
  if (!vista) throw new SinEnlace("No se pudo leer el enlace de este pedido.");
  const tel = op?.fields["Cliente Teléfono"];
  return {
    codigo: vista.codigo,
    cliente: vista.nombre,
    detalle: vista.producto,
    telefono: Array.isArray(tel) ? String(tel[0] ?? "") : typeof tel === "string" ? tel : "",
    lineas: (vista.elegido?.items ?? []).map((i) => ({ descripcion: i.cantidad > 1 ? `${i.descripcion} ×${i.cantidad}` : i.descripcion, monto: i.subtotal, nota: "" })),
    total: vista.pago.total,
    pagado: vista.pago.pagado,
    falta: vista.pago.faltaTotal,
    opciones: vista.pagoEnLinea.disponible ? vista.pagoEnLinea.opciones : [],
    ultimo: vista.pagoEnLinea.ultimo,
    enlace: urlEnlacePedido(origin, token),
  };
}
