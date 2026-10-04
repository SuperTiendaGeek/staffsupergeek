/**
 * Ajuste de datos del punto 1 (regla de venta). Ejecutar: npm test ajuste-punto1
 */
import { NOTA_AJUSTE_PUNTO1, planAjustePunto1, type RegistroAjuste } from "../ajuste-punto1";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const base: RegistroAjuste = {
  id: "rec1", sku: "X-1", estado: "Disponible", estadoRevision: "", categoria: "Accesorio", tipoOperacion: "Migración histórica",
  recibido: false, requiereInspeccion: false, revisado: false, usoLocal: false, disponibleVenta: true, reservado: false,
  cantidad: 1, cantidadReservada: 0, tieneNovedades: false, observacionesInternas: "",
};
const r = (p: Partial<RegistroAjuste>) => planAjustePunto1({ ...base, ...p });

{
  const c = r({ categoria: "Laptop" });
  assert(c?.fields["Recibido"] === true, "Migrado Disponible sin Recibido → se marca Recibido");
  assert(c?.fields["Requiere inspección"] === undefined, "…y queda sin inspección pendiente (ya estaba en false)");
  assert(c?.fields["Observaciones internas"] === NOTA_AJUSTE_PUNTO1, "…con nota del ajuste");
  assert(c?.fields["Estado Item"] === undefined, "…y la etiqueta sigue 'Disponible'");
}
{
  const c = r({ recibido: true, observacionesInternas: "" });
  assert(c === null, "Disponible ya recibido y sin inspección → sin cambios (idempotente)");
}
{
  const c = r({ estado: "En revisión", categoria: "Laptop", recibido: true, revisado: true });
  assert(c?.fields["Requiere inspección"] === true && c?.fields["Estado Item"] === "Disponible", "En revisión con Revisado → requiere (firmada) y pasa a Disponible");
}
{
  const c = r({ estado: "En revisión", categoria: "Laptop", recibido: true, revisado: false });
  assert(c?.fields["Requiere inspección"] === true && c?.fields["Estado Item"] === undefined, "En revisión sin Revisado → requiere y sigue En revisión");
}
{
  const c = r({ estado: "En tránsito", categoria: "RAM", tipoOperacion: "Compra a proveedor" });
  assert(c?.fields["Requiere inspección"] === true && c?.fields["Recibido"] === undefined, "En tránsito RAM → requiere por categoría; no se marca Recibido");
}
{
  const c = r({ estado: "En tránsito", categoria: "Cable", tipoOperacion: "Compra a proveedor" });
  assert(c === null, "En tránsito Cable → nada que cambiar");
}
{
  const c = r({ estado: "Pagado", categoria: "Monitor", tipoOperacion: "Compra ya pagada", recibido: true, revisado: true, disponibleVenta: true });
  assert(c?.fields["Estado Item"] === "Disponible", "C-1: monitor llegado directo y revisado, en 'Pagado' → Disponible");
}
{
  const c = r({ estado: "Pagado", categoria: "Monitor", tipoOperacion: "Compra ya pagada", recibido: true, revisado: false, estadoRevision: "Recibido correctamente" });
  assert(
    c?.fields["Estado Item"] === "Disponible" && c?.fields["Requiere inspección"] === undefined && typeof c?.fields["Observaciones internas"] === "string",
    "C-1: monitor llegado directo, revisión 'Recibido correctamente' sin firma → hoy se vende: Disponible, sin inspección pendiente, con nota"
  );
}
{
  const c = r({ estado: "Pendiente de pago", categoria: "RAM", tipoOperacion: "Compra a proveedor", recibido: true, revisado: false, estadoRevision: "Recibido pendiente de revisión" });
  assert(c?.fields["Requiere inspección"] === true && c?.fields["Estado Item"] === "En revisión", "C-1: RAM llegada directo sin revisar → requiere inspección y pasa a En revisión");
}
{
  const c = r({ estado: "Vendido", cantidad: 0 });
  assert(c === null, "Vendido → no se toca");
}
{
  const c = r({ estado: "En tránsito", categoria: "Cable", tipoOperacion: "Compra a proveedor", cantidad: 3, cantidadReservada: 1, disponibleVenta: false });
  assert(c?.fields["Disponible para venta"] === true, "Pedido con unidades libres apagado → se puede reservar");
}
{
  const c = r({ estado: "En tránsito", categoria: "Cable", tipoOperacion: "Compra a proveedor", disponibleVenta: false, tieneNovedades: true });
  assert(c === null, "Con novedades vinculadas → no se enciende la reserva");
}

if (fallos > 0) { console.error(`\n${fallos} assert(s) fallaron.`); process.exit(1); }
console.log("\n✅ ajuste-punto1.test.ts — todos los asserts pasaron");
