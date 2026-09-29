/** Cómo nace el artículo al pasar una operación a Pedido (caso OP-2026-000060). */
import { planArticuloDePedido } from "../pedido";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const real = planArticuloDePedido({ cantidadCliente: 4, unidadesCompradas: 8, llegada: "packing" });
assert(real.ok, "4 para el cliente + 4 para stock, en packing");
if (real.ok) {
  assert(real.cantidad === 8, "Cantidad = 8 compradas");
  assert(real.cantidadReservada === 4, "Cantidad Reservada = 4 del cliente");
  assert(real.reservado === false, "No queda 'Reservado' entero: hay 4 libres para stock");
  assert(real.requierePacking === true && real.modoLogistico === "Pendiente de packing", "Entra al flujo de Packings");
}

const exacto = planArticuloDePedido({ cantidadCliente: 4 });
assert(exacto.ok && exacto.cantidad === 4 && exacto.cantidadReservada === 4 && exacto.reservado === true, "Sin indicar compradas: se compra lo del cliente y queda todo reservado");
assert(exacto.ok && exacto.requierePacking === false && exacto.modoLogistico === "Tracking directo", "Sin indicar llegada: tracking directo (como antes)");

const viejo = planArticuloDePedido({ cantidadCliente: 0 });
assert(viejo.ok && viejo.cantidad === 1 && viejo.cantidadReservada === 1, "Opción vieja sin cantidad: 1 unidad");

assert(!planArticuloDePedido({ cantidadCliente: 4, unidadesCompradas: 3 }).ok, "No se pueden comprar menos de las que pidió el cliente");
assert(!planArticuloDePedido({ cantidadCliente: 1, unidadesCompradas: 1.5 }).ok, "Unidades enteras");
assert(!planArticuloDePedido({ cantidadCliente: 1, unidadesCompradas: 0 }).ok, "Al menos 1");
assert(!planArticuloDePedido({ cantidadCliente: 1, llegada: "avion" as never }).ok, "Llegada desconocida se rechaza");

if (fallos > 0) { console.error(`Fallaron ${fallos} comprobaciones.`); process.exit(1); }
console.log("Paso a Pedido: OK");
