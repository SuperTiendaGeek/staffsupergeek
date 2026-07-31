import fs from "node:fs";
import path from "node:path";
import {
  resolverDatosShippingItemParaReserva,
  resolverPrecioShippingItemParaReserva,
  ShippingItemReservaPrecioError,
} from "../reservas/precioShippingItem";

let fallos = 0;

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

const datos = resolverDatosShippingItemParaReserva(
  {
    id: "recITEM",
    fields: {
      "Nombre del item": "Laptop reserva",
      "Precio venta final": 340,
    },
  },
  {
    descripcionItem: "Texto del cliente",
    precioVenta: 1,
  }
);

assert(datos.precioVenta === 340, "Reserva ignora el precio enviado por el cliente y usa Precio venta final");
assert(datos.descripcionItem === "Texto del cliente", "Reserva conserva descripción enviada cuando existe");

try {
  resolverPrecioShippingItemParaReserva({
    id: "recSINPRECIO",
    fields: { "Nombre del item": "Sin precio", "Precio venta sugerido": 120 },
  });
  assert(false, "Reserva sin precio final debía fallar");
} catch (e) {
  assert(e instanceof ShippingItemReservaPrecioError, "Reserva sin precio final falla con error de precio controlado");
}

try {
  resolverPrecioShippingItemParaReserva({
    id: "recPRECIOCERO",
    fields: { "Nombre del item": "Precio cero", "Precio venta final": 0 },
  });
  assert(false, "Reserva con precio final 0 debía fallar");
} catch (e) {
  assert(e instanceof ShippingItemReservaPrecioError, "Reserva con precio final 0 se trata como sin precio asignado");
}

const rutaReservas = fs.readFileSync(path.join(process.cwd(), "app/api/facturacion/reservas/route.ts"), "utf8");
assert(
  rutaReservas.includes("fetchRecordsByIds(\"Shipping Items\"") &&
    rutaReservas.includes("resolverDatosShippingItemParaReserva") &&
    rutaReservas.includes("datosItemReserva.precioVenta"),
  "La ruta server-side de Reservas reconsulta Shipping Items y usa el precio releído"
);

if (fallos > 0) {
  console.error(`Fallaron ${fallos} comprobaciones.`);
  process.exit(1);
}

console.log("Precio de reserva desde Shipping Items: OK");
