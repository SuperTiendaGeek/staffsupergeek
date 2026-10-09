/**
 * Corregir estado (punto 5 de la auditoría, 8-oct-2026).
 * Ejecutar: npx tsx lib/shipping-v2/__tests__/correccion-estado.test.ts
 */
import {
  ESTADOS_CORREGIBLES,
  ESTADOS_RETIRADOS,
  estadoSeCorrigeAMano,
  evaluarCorreccionEstado,
  todasReservadas,
  type ArticuloParaCorregir,
} from "../correccion-estado";
import { estadoSegunLlegada } from "../item-venta";

let fallos = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { fallos++; console.error("✗", msg); } else console.log("✓", msg);
}
const admin = { esAdministrador: true, motivo: "se marcó mal" };
const est = (a: ArticuloParaCorregir, valor: string, extra: Partial<typeof admin> = {}) =>
  evaluarCorreccionEstado(a, { campo: "estado", valor, ...admin, ...extra }).ok;
const rev = (a: ArticuloParaCorregir, valor: string) =>
  evaluarCorreccionEstado(a, { campo: "revision", valor, ...admin }).ok;

const enTienda: ArticuloParaCorregir = { estado: "Disponible", estadoRevision: "Recibido correctamente", recibido: true, requiereInspeccion: false, cantidad: 2 };
const enCamino: ArticuloParaCorregir = { estado: "En tránsito", estadoRevision: "Pendiente de recepción", recibido: false, cantidad: 1 };

console.log("— Quién y con qué —");
assert(!est(enTienda, "Recibido", { esAdministrador: false }), "Staff no corrige el estado");
assert(!est(enTienda, "Recibido", { motivo: "x" }), "Motivo obligatorio");
assert(est(enTienda, "En revisión"), "Administrador con motivo: sí");

console.log("\n— Etiquetas que solo pone su acción —");
for (const v of ["Vendido", "Agotado", "Dado de baja", "Uso local", "Con novedad", "Destinado a partes"]) {
  assert(!est(enTienda, v), `No se pone "${v}" a mano`);
}
for (const v of ESTADOS_RETIRADOS) assert(!ESTADOS_CORREGIBLES.includes(v) && !est(enTienda, v), `"${v}" está retirado`);
assert(!est({ ...enTienda, estado: "Vendido", cantidad: 1 }, "Disponible"), "Desde Vendido no se corrige (caso LAP-000016): se anula el documento");
assert(!est({ ...enTienda, estado: "Dado de baja", cantidad: 0 }, "Disponible"), "Desde Dado de baja: Revertir baja");
assert(!est({ ...enTienda, usoLocal: true, estado: "Uso local" }, "Disponible"), "Un activo no se corrige aquí");
assert(!estadoSeCorrigeAMano({ estado: "Vendido" }) && estadoSeCorrigeAMano({ estado: "Pagado" }), "El botón sabe cuándo no aplica");

console.log("\n— Coherencia con la llegada —");
assert(!est(enTienda, "En tránsito"), "Recibido no vuelve a En tránsito (se desmarca en Recepción)");
assert(est(enCamino, "Pagado"), "En camino: se corrige entre etapas de camino");
assert(!est(enCamino, "Disponible"), "Sin Recibido no queda Disponible");
assert(!est(enCamino, "En packing"), "En packing solo si está en una caja");
assert(est({ ...enCamino, enPacking: true }, "En packing"), "En una caja: sí");
assert(!est({ ...enTienda, estado: "En revisión", requiereInspeccion: true, inspeccionFirmada: false }, "Disponible"), "Inspección sin firmar: no Disponible");
assert(!est({ ...enTienda, cantidad: 0, estado: "Recibido" }, "Disponible"), "Con 0 unidades no vuelve a la venta");
assert(!est({ ...enTienda, novedadesAbiertas: 1 }, "En revisión"), "Con novedades abiertas: se resuelve en Novedades");

console.log("\n— Reservado —");
const pan: ArticuloParaCorregir = { ...enTienda, cantidad: 1, cantidadReservada: 1 };
assert(todasReservadas(pan) && !todasReservadas(enTienda), "todasReservadas");
assert(est(pan, "Reservado"), "PAN-000001: todo apartado → Reservado");
assert(!est({ ...pan, estado: "Recibido" }, "Disponible"), "Todo apartado no se marca Disponible");
assert(!est({ ...enTienda, estado: "Recibido" }, "Reservado"), "Con unidades libres no es Reservado");

console.log("\n— Cancelado —");
assert(est(enCamino, "Cancelado"), "Compra que no llegó: se cancela");
assert(!est(enTienda, "Cancelado"), "Lo que ya llegó no se cancela (Dar de baja)");
assert(!est({ ...enCamino, enPacking: true }, "Cancelado"), "En una caja: sacarlo primero");
assert(!est({ ...enCamino, enPagoVivo: true }, "Cancelado"), "En un pago: anularlo primero");
assert(!est({ ...enCamino, cantidadReservada: 1 }, "Cancelado"), "Con reserva de cliente: liberarla primero");
assert(est({ ...enCamino, estado: "Cancelado" }, "En tránsito"), "Un Cancelado por error vuelve a su etapa");

console.log("\n— Estado de revisión —");
assert(!rev(enTienda, "Faltante"), "Un problema se registra como novedad, no a mano");
assert(!rev(enTienda, "Pendiente de recepción"), "Recibido: no vuelve a Pendiente de recepción");
assert(rev(enCamino, "Recibido correctamente") === false, "Sin Recibido: no");
assert(!rev({ ...enTienda, estadoRevision: "Recibido pendiente de revisión", requiereInspeccion: true }, "Recibido correctamente"), "Inspección sin firmar: no");
assert(rev({ ...enTienda, estadoRevision: "Faltante" }, "Aceptado con observación"), "Sin novedades abiertas: se corrige");

console.log("\n— Regla de llegada con todo reservado (PAN-000001) —");
assert(estadoSegunLlegada({ estado: "Pagado", recibido: true, requiereInspeccion: false, todasReservadas: true }) === "Reservado", "Llega con todo apartado → Reservado");
assert(estadoSegunLlegada({ estado: "Pagado", recibido: true, requiereInspeccion: false }) === "Disponible", "Llega con unidades libres → Disponible");
assert(estadoSegunLlegada({ estado: "Disponible", recibido: true, todasReservadas: true }) === "Reservado", "Disponible con todo apartado se corrige a Reservado");
assert(estadoSegunLlegada({ estado: "Recibido", recibido: true, requiereInspeccion: true, todasReservadas: true }) === "En revisión", "Inspección pendiente manda");

if (fallos) { console.error(`\n${fallos} prueba(s) fallaron`); process.exit(1); }
console.log("\nTodo bien.");
