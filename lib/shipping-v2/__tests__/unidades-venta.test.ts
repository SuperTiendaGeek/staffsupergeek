// Vender unidades libera la reserva que la venta cumple (caso OTR-000187).
import { aplicarVentaUnidades, unidadesLibres } from "../unidades";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

// 8 compradas, 4 del cliente. Se factura el pedido del cliente (4).
const pedido = aplicarVentaUnidades({ cantidad: 8, cantidadReservada: 4 }, 4, { liberaReserva: true });
assert(pedido.cantidad === 4, "Quedan 4 en stock");
assert(pedido.cantidadReservada === 0, "La reserva del cliente se libera");
assert(pedido.reservado === false, "Ya no figura reservado");
assert(unidadesLibres(pedido) === 4, "Las 4 de stock quedan libres para vender");

// Venta de mostrador de 2 unidades libres de ese mismo artículo, ANTES de facturar el pedido.
const mostrador = aplicarVentaUnidades({ cantidad: 8, cantidadReservada: 4 }, 2, { liberaReserva: false });
assert(mostrador.cantidad === 6 && mostrador.cantidadReservada === 4, "El mostrador no toca la reserva del cliente");
assert(unidadesLibres(mostrador) === 2, "Quedan 2 libres");

// Dato viejo: bandera Reservado sin Cantidad Reservada = 1 unidad comprometida.
const viejo = aplicarVentaUnidades({ cantidad: 1, reservado: true }, 1, { liberaReserva: true });
assert(viejo.cantidad === 0 && viejo.cantidadReservada === 0 && viejo.reservado === false, "Pedido viejo de 1 unidad: todo en 0, sin reserva colgada");

// Repuesto de stock multiunidad (REP-000017: 52, 1 comprometida a una orden).
const repuesto = aplicarVentaUnidades({ cantidad: 52, cantidadReservada: 1 }, 1, { liberaReserva: true });
assert(repuesto.cantidad === 51 && repuesto.cantidadReservada === 0, "Facturar la orden libera la unidad que tenía comprometida");

// Nunca más reservadas que existentes.
const raro = aplicarVentaUnidades({ cantidad: 3, cantidadReservada: 3 }, 2, { liberaReserva: false });
assert(raro.cantidad === 1 && raro.cantidadReservada === 1 && raro.reservado === true, "Reservadas nunca superan la cantidad que queda");

// Todo reservado y se entrega todo
const completo = aplicarVentaUnidades({ cantidad: 4, cantidadReservada: 4, reservado: true }, 4, { liberaReserva: true });
assert(completo.cantidad === 0 && completo.cantidadReservada === 0 && !completo.reservado, "Entregado completo: sin stock ni reserva");

if (fallos > 0) { console.error(`Fallaron ${fallos} comprobaciones.`); process.exit(1); }
console.log("Venta de unidades con reserva: OK");
