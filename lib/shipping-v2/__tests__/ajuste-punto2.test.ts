/** Ajuste de datos del punto 2 (origen del artículo). npm test ajuste-punto2 */
import { planAjustePunto2, type RegistroAjuste2 } from "../ajuste-punto2";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const base: RegistroAjuste2 = {
  id: "rec1", sku: "X-1", estado: "Disponible", estadoRevision: "", tipoOperacion: "Compra a proveedor", recibido: true,
  origenArticulo: "", proveedorId: "recEBAY", paisZonaProveedor: "USA", casilleroId: "", packingId: "", cantidad: 1, observacionesInternas: "",
};
const plan = (p: Partial<RegistroAjuste2>) => planAjustePunto2({ ...base, ...p }, "recLAARBOX");

{
  const { cambio } = plan({});
  assert(cambio?.fields["Origen del artículo"] === "Ya está en la tienda", "Recibido → Ya está en la tienda");
  assert(cambio?.fields["Proveedor logístico / intermediario"] === undefined, "Lo que está en la tienda no recibe casillero");
}
{
  const { cambio } = plan({ estado: "Pendiente de pago", recibido: false, estadoRevision: "No aplica" });
  assert(cambio?.fields["Origen del artículo"] === "Proveedor extranjero", "eBay sin llegar → extranjero");
  assert(JSON.stringify(cambio?.fields["Proveedor logístico / intermediario"]) === JSON.stringify(["recLAARBOX"]), "…con casillero Laarbox");
  assert(cambio?.fields["Estado de revisión"] === "Pendiente de recepción", "…y aparece en Por llegar (C-2)");
}
{
  const { cambio } = plan({ estado: "Pendiente de pago", recibido: false, estadoRevision: "No aplica", proveedorId: "recDTC", paisZonaProveedor: "Ecuador" });
  assert(cambio?.fields["Origen del artículo"] === "Proveedor local" && cambio?.fields["Proveedor logístico / intermediario"] === undefined, "LAP-000110 (local) → Proveedor local, sin casillero");
}
{
  const { cambio, sinProveedor } = plan({ estado: "Pagado", recibido: false, proveedorId: "", paisZonaProveedor: "" });
  assert(sinProveedor && cambio === null, "Sin llegar y sin proveedor → se reporta al dueño, no se toca");
}
{
  const { cambio } = plan({ estado: "En tránsito", recibido: false, casilleroId: "recROBERTO", estadoRevision: "Pendiente de recepción", origenArticulo: "Proveedor extranjero" });
  assert(cambio === null, "Ya con origen, casillero y revisión → sin cambios (idempotente)");
}
{
  const { cambio } = plan({ tipoOperacion: "Migración histórica", origenArticulo: "Ya está en la tienda" });
  assert(cambio?.fields["Tipo de operación"] === "Reajuste de inventario" && typeof cambio?.fields["Observaciones internas"] === "string", "Migración histórica → Reajuste con nota");
}
{
  const { cambio } = plan({ tipoOperacion: "Migración histórica", origenArticulo: "Ya está en la tienda", observacionesInternas: "x\n[6-oct-2026] Migrado del sistema anterior (ago-2026)." });
  assert(cambio?.fields["Observaciones internas"] === undefined, "La nota no se repite");
}
{
  assert(plan({ tipoOperacion: "Repuesto", origenArticulo: "Ya está en la tienda" }).cambio?.fields["Tipo de operación"] === "Compra a proveedor", "Repuesto con proveedor → Compra a proveedor");
  assert(plan({ tipoOperacion: "Parte / componente", proveedorId: "", origenArticulo: "Ya está en la tienda" }).cambio?.fields["Tipo de operación"] === "Reajuste de inventario", "Parte sin proveedor → Reajuste");
}
{
  const { cambio } = plan({ tipoOperacion: "Compra ya pagada", origenArticulo: "Ya está en la tienda" });
  assert(cambio === null, "Compra ya pagada no se toca (se hace en el punto 9)");
}
{
  const { cambio } = plan({ estado: "Vendido", tipoOperacion: "Migración histórica", recibido: false });
  assert(cambio?.fields["Tipo de operación"] === "Reajuste de inventario" && cambio?.fields["Origen del artículo"] === undefined, "Vendido: solo se convierte el tipo");
}

if (fallos > 0) { console.error(`\n${fallos} assert(s) fallaron.`); process.exit(1); }
console.log("\n✅ ajuste-punto2.test.ts — todos los asserts pasaron");
