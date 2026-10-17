/**
 * Separar una unidad conservando el SKU y los costos (punto 10b, 17-oct-2026).
 * Ejecutar: npx tsx lib/shipping-v2/__tests__/separar-unidad.test.ts
 */
import { camposOriginalTrasSeparar, camposUnidadSeparada, evaluarSepararUnidad, repartoRegistroAlSeparar } from "../separar-unidad";
import { SHIPPING_V2_ITEM_FIELDS as F } from "../schema.generated";

let fallos = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { fallos++; console.error("✗", msg); } else console.log("✓", msg);
}

console.log("— Cuándo se puede —");
const admin = { esAdministrador: true };
assert(evaluarSepararUnidad({ cantidad: 9, estado: "Disponible" }, admin).ok, "9 laptops disponibles: sí");
assert(!evaluarSepararUnidad({ cantidad: 9, estado: "Disponible" }, { esAdministrador: false }).ok, "Solo Administrador");
assert(!evaluarSepararUnidad({ cantidad: 1, estado: "Disponible" }, admin).ok, "Ya es una sola unidad");
assert(!evaluarSepararUnidad({ cantidad: 2, cantidadReservada: 2, estado: "Reservado" }, admin).ok, "Todas reservadas: no");
assert(!evaluarSepararUnidad({ cantidad: 3, estado: "Disponible", usoLocal: true }, admin).ok, "Activo de la tienda: no");

console.log("\n— Reparto de costos de la caja, al centavo —");
const r = repartoRegistroAlSeparar({ unidadesEnPacking: 9, flete: 90, arancel: 45.5, otros: null });
assert(r.nueva.flete === 10 && r.original.flete === 80, "Flete 90 entre 9: la nueva lleva 10, quedan 80");
assert(r.nueva.arancel === 5.06 && r.original.arancel === 40.44, "Arancel 45,50: 5,06 + 40,44 = 45,50");
assert(r.nueva.otros === null && r.original.otros === null, "Sin otros costos: nada");
assert(r.nueva.unidadesEnPacking === 1 && r.original.unidadesEnPacking === 8, "Unidades en la caja: 1 y 8");

console.log("\n— Registro nuevo —");
const original: Record<string, unknown> = {
  [F.sku]: "LAP-000076",
  [F.nombre]: "Lenovo ThinkPad T480",
  [F.categoria]: "Laptop",
  [F.cantidad]: 9,
  [F.cantidadReservada]: 1,
  [F.unidadesCompradas]: 9,
  [F.unidadesEnPacking]: 9,
  [F.fleteAsignadoRegistro]: 90,
  [F.arancelAsignadoRegistro]: 45.5,
  [F.costoProveedor]: 180,
  [F.precioVentaFinal]: 320,
  [F.numeroSerie]: "PF1ABCDE",
  [F.recibido]: true,
  [F.proveedorCompra]: ["recPROV0000000001"],
  [F.observacionesInternas]: "Lote de 3R",
  "Shipping Packings": ["recPACK0000000001"],
  "Orden de compra": ["recOC00000000001"],
  "Factura": ["recFAC0000000001"],
  "Reservas": ["recRES0000000001"],
  "Shipping Eventos": ["recEV00000000001"],
  "Costo total unidad": 200,
  [F.fotos]: [{ id: "att1", url: "https://x/1.jpg", filename: "1.jpg", size: 10, thumbnails: {} }],
};
const nueva = camposUnidadSeparada(original, { nota: "Separada de LAP-000076 para desarmarla.", actor: "Admin", ahora: "2026-10-17T00:00:00Z" });
assert(nueva[F.sku] === "LAP-000076", "Conserva el mismo SKU");
assert(nueva[F.cantidad] === 1 && nueva[F.cantidadReservada] === 0 && nueva[F.unidadesCompradas] === 1, "1 unidad, sin reserva, 1 comprada");
assert(nueva[F.costoProveedor] === 180 && nueva[F.precioVentaFinal] === 320, "Mismo costo proveedor y precio por unidad");
assert(nueva[F.fleteAsignadoRegistro] === 10 && nueva[F.arancelAsignadoRegistro] === 5.06, "Su flete y arancel, por separado");
assert(nueva[F.numeroSerie] === undefined, "La serie no se copia (cada equipo tiene la suya)");
assert(JSON.stringify(nueva["Shipping Packings"]) === JSON.stringify(["recPACK0000000001"]) && JSON.stringify(nueva["Orden de compra"]) === JSON.stringify(["recOC00000000001"]), "Misma caja y misma orden de compra");
assert(nueva["Factura"] === undefined && nueva["Reservas"] === undefined && nueva["Shipping Eventos"] === undefined, "No se lleva ventas, reservas ni historial");
assert(nueva["Costo total unidad"] === undefined, "No escribe campos calculados");
const fotos = nueva[F.fotos] as Array<Record<string, unknown>>;
assert(fotos.length === 1 && fotos[0].url === "https://x/1.jpg" && fotos[0].id === undefined, "Copia las fotos por su dirección");
assert(String(nueva[F.observacionesInternas]).startsWith("Separada de LAP-000076") && String(nueva[F.observacionesInternas]).includes("Lote de 3R"), "Nota de dónde salió + observaciones previas");

console.log("\n— Registro original —");
const orig = camposOriginalTrasSeparar(original, { actor: "Admin", ahora: "2026-10-17T00:00:00Z" });
assert(orig[F.cantidad] === 8 && orig[F.unidadesCompradas] === 8 && orig[F.unidadesEnPacking] === 8, "Queda con 8");
assert(orig[F.fleteAsignadoRegistro] === 80 && orig[F.arancelAsignadoRegistro] === 40.44, "Y con el resto de sus costos");
const sumaCompra = (Number(nueva[F.unidadesCompradas]) + Number(orig[F.unidadesCompradas])) * 180;
assert(sumaCompra === 9 * 180, "El total de la compra no cambia (9 × $180)");

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo bien.");
