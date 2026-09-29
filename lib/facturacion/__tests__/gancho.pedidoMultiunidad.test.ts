/**
 * Facturar un pedido de varias unidades desde su operación.
 * Caso real OP-2026-000060 / OTR-000187: el cliente pagó $120 por 4 cámaras
 * ($30 c/u); se compraron 8 (4 para stock). Antes la línea salía con
 * cantidad 1 y el recibo/factura descontaba 1 del inventario.
 */
import { construirLineaProducto, evaluarItemNoListo } from "../gancho/construccion";
import { lineasReciboDesdePrefactura } from "../gancho/prefill";
import { totalRecibo } from "../recibos/calculos";
import type { DatosVenta } from "../emitirFactura";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const item = { id: "recvPXv0mzJArNmLr", nombre: "4 YI Home Camara 1080p", precio: 120, cantidad: 4 };
const linea = construirLineaProducto(item, { sku: "OTR-000187", tarifaIva: "15%" });

assert(linea.cantidad === 4, "La línea sale con 4 unidades (antes 1)");
assert(linea.shippingItemId === "recvPXv0mzJArNmLr", "Sigue vinculada a su artículo (descuenta inventario)");
assert(Math.abs(linea.precioTotalSinImpuesto + linea.impuestos[0].valor - 120) < 0.005, "Base + IVA de la línea = $120, lo que abonó el cliente");

// Recibo desde la misma pre-factura: 4 × $30 = $120.
const lineasRecibo = lineasReciboDesdePrefactura({ detalles: [linea] } as unknown as DatosVenta);
assert(lineasRecibo[0].cantidad === 4 && lineasRecibo[0].precioUnitario === 30, "Recibo: 4 × $30,00");
assert(totalRecibo(lineasRecibo) === 120, "Recibo total $120");

// Una unidad (pedidos de siempre): sin cambios.
const uno = construirLineaProducto({ id: "rec1", nombre: "Batería", precio: 90 }, { sku: "REP-1", tarifaIva: "15%" });
assert(uno.cantidad === 1, "Artículo de 1 unidad: cantidad 1 como siempre");

// Bloqueos
const listo = evaluarItemNoListo(item, { reservado: false, cantidadReservada: 4, tieneFacturaPrevia: false, cantidad: 8 });
assert(listo === null, "8 en stock y 4 reservadas: se puede facturar el pedido");
const corto = evaluarItemNoListo(item, { reservado: false, cantidadReservada: 4, tieneFacturaPrevia: false, cantidad: 3 });
assert(corto?.motivo === "SIN_STOCK", "Si solo quedan 3 de las 4 del cliente, no se factura a ciegas");
const sinReserva = evaluarItemNoListo(item, { reservado: false, cantidadReservada: 0, tieneFacturaPrevia: false, cantidad: 8 });
assert(sinReserva?.motivo === "NO_RESERVADO", "Sin unidades apartadas sigue bloqueando como antes");

if (fallos > 0) { console.error(`Fallaron ${fallos} comprobaciones.`); process.exit(1); }
console.log("Pedido multiunidad desde la operación: OK");
