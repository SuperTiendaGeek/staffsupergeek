/**
 * Cantidad y precio unitario de una opción de cotización.
 * Caso real: OP-2026-000060 — "4 YI Home Camera — $120" se guardaba como UN
 * artículo de $120 y nacía en inventario con Cantidad 1 (OTR-000187).
 */
import {
  cantidadDeOpcion,
  precioUnitarioDeOpcion,
  resolverPreciosOpcion,
  validarCantidadOpcion,
} from "../opciones";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

// Caso real: 4 × $30
const camaras = resolverPreciosOpcion({ cantidad: 4, precioUnitarioCliente: 30 });
assert(camaras.cantidad === 4 && camaras.precioUnitario === 30 && camaras.total === 120, "4 × $30 → total $120 (lo que ya abonó el cliente)");

// Opciones anteriores al campo: sin cantidad = 1 unidad a su total.
assert(cantidadDeOpcion(undefined) === 1 && cantidadDeOpcion(null) === 1 && cantidadDeOpcion(0) === 1, "Sin cantidad = 1");
assert(precioUnitarioDeOpcion({ precioVentaCliente: 120 }) === 120, "Opción vieja de $120 sin cantidad: unitario $120 (nada cambia)");
assert(precioUnitarioDeOpcion({ cantidad: 4, precioVentaCliente: 120 }) === 30, "Con cantidad 4 y total $120, unitario $30");
assert(precioUnitarioDeOpcion({ cantidad: 4, precioUnitarioCliente: 29.99, precioVentaCliente: 119.96 }) === 29.99, "Si hay unitario guardado, manda el unitario");
assert(precioUnitarioDeOpcion({}) === null, "Sin precios: null (no se inventa)");

// Compatibilidad: el presupuesto de Técnicos o un cliente viejo puede mandar el total.
const porTotal = resolverPreciosOpcion({ cantidad: 3, precioVentaCliente: 100 });
assert(porTotal.total === 100 && porTotal.precioUnitario === 33.33, "Total $100 en 3 unidades → unitario 33,33 y el total se respeta");

// Redondeo
const centavos = resolverPreciosOpcion({ cantidad: 3, precioUnitarioCliente: 19.999 });
assert(centavos.precioUnitario === 20 && centavos.total === 60, "El unitario se redondea a centavos antes de multiplicar");

// Validación de lo que escribe el usuario
assert(validarCantidadOpcion("") === null && validarCantidadOpcion(undefined) === null, "Cantidad vacía se acepta (= 1)");
assert(validarCantidadOpcion(4) === null, "4 se acepta");
assert(validarCantidadOpcion(0) !== null, "0 se rechaza");
assert(validarCantidadOpcion(2.5) !== null, "2,5 se rechaza (unidades enteras)");
assert(validarCantidadOpcion(100000) !== null, "Cantidades absurdas se rechazan");

if (fallos > 0) { console.error(`Fallaron ${fallos} comprobaciones.`); process.exit(1); }
console.log("Cantidad y precio unitario de opciones: OK");
