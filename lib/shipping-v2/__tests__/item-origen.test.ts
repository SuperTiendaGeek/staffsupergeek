/** Origen y llegada de un artículo (auditoría Shipping V2, punto 2). npm test item-origen */
import {
  pendientesLogisticos,
  deducirOrigen, esSueltoPorLlegar, estadoAlPonerRastreo, modoLogisticoSegunOrigen, origenSegunZona,
  puedeEntrarACaja, tipoOperacionPermitido,
} from "../item-origen";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

console.log("— Local o extranjero —");
assert(origenSegunZona("Ecuador") === "Proveedor local", "Ecuador → local");
assert(origenSegunZona("USA") === "Proveedor extranjero", "USA → extranjero");
assert(origenSegunZona("Internacional") === "Proveedor extranjero", "Internacional → extranjero");
assert(origenSegunZona("") === "Proveedor extranjero", "Sin zona → extranjero (todo lo que no es Ecuador)");

console.log("\n— Tipos de operación por origen —");
assert(tipoOperacionPermitido("Ya está en la tienda", "Reajuste de inventario"), "Tienda: Reajuste sí");
assert(!tipoOperacionPermitido("Proveedor extranjero", "Reajuste de inventario"), "Extranjero: Reajuste no");
assert(tipoOperacionPermitido("Proveedor extranjero", "Regalo de proveedor"), "Extranjero: Regalo sí");
assert(!tipoOperacionPermitido("Proveedor local", "Regalo de proveedor"), "Local: Regalo no");
assert(!tipoOperacionPermitido("Ya está en la tienda", "Compra ya pagada"), "Compra ya pagada ya no se ofrece");
assert(!tipoOperacionPermitido("Proveedor extranjero", "Encargo enviado a proveedor"), "Encargo queda fuera");

console.log("\n— Origen de datos anteriores —");
assert(deducirOrigen({ recibido: true }) === "Ya está en la tienda", "Recibido → en la tienda");
assert(deducirOrigen({ recibido: false, tieneProveedor: true, paisZonaProveedor: "USA" }) === "Proveedor extranjero", "No llegó, eBay (USA) → extranjero");
assert(deducirOrigen({ recibido: false, tieneProveedor: true, paisZonaProveedor: "Ecuador" }) === "Proveedor local", "No llegó, DTC (Ecuador) → local");
assert(deducirOrigen({ recibido: false, tieneProveedor: false }) === null, "No llegó y sin proveedor → se le pregunta al dueño");
assert(deducirOrigen({ recibido: false, estado: "Repuesto", tieneProveedor: true, paisZonaProveedor: "Ecuador" }) === "Ya está en la tienda", "Repuesto sin casilla Recibido → ya está en la tienda (REP-000019)");
assert(deducirOrigen({ recibido: false, estado: "Uso local", tieneProveedor: false }) === "Ya está en la tienda", "Uso local sin proveedor → ya está en la tienda (OTR-000185)");
assert(deducirOrigen({ recibido: false, estado: "Recibido", tipoOperacion: "Migración histórica", tieneProveedor: false }) === "Ya está en la tienda", "Migrado sin casilla Recibido → ya está en la tienda (ACC-000070)");
assert(deducirOrigen({ recibido: false, estado: "Recibido", tieneProveedor: true, paisZonaProveedor: "USA" }) === "Proveedor extranjero", "Llegó en una caja y falta confirmarlo → sigue siendo de afuera");

console.log("\n— Rastreo → En tránsito —");
assert(estadoAlPonerRastreo({ estado: "Pendiente de pago" }) === "En tránsito", "Pendiente de pago + rastreo → En tránsito");
assert(estadoAlPonerRastreo({ estado: "Registrado" }) === "En tránsito", "Registrado + rastreo → En tránsito");
assert(estadoAlPonerRastreo({ estado: "En tránsito" }) === null, "Ya en tránsito → sin cambio");
assert(estadoAlPonerRastreo({ estado: "Pagado", packingId: "recPK" }) === null, "En una caja → manda la caja");
assert(estadoAlPonerRastreo({ estado: "Pagado", recibido: true }) === null, "Ya llegó → sin cambio");

console.log("\n— Por llegar y cajas —");
const suelto = { origenArticulo: "Proveedor local", recibido: false, estado: "Pendiente de pago" };
assert(esSueltoPorLlegar(suelto), "Laptop de proveedor local sin recibir → aparece en Por llegar (LAP-000110)");
assert(!esSueltoPorLlegar({ ...suelto, packingId: "recPK" }), "Si va en una caja, aparece dentro de su caja, no suelto");
assert(!esSueltoPorLlegar({ ...suelto, recibido: true }), "Ya recibido → no está por llegar");
assert(!esSueltoPorLlegar({ ...suelto, origenArticulo: "Ya está en la tienda" }), "Ya en la tienda → nunca por llegar");
assert(!esSueltoPorLlegar({ ...suelto, estado: "Cancelado" }), "Cancelado → no");
assert(!esSueltoPorLlegar({ ...suelto, cantidad: 0 }), "Cantidad 0 → no hay nada por llegar (REP-000021)");
assert(puedeEntrarACaja({ origenArticulo: "Proveedor extranjero", estado: "En tránsito" }), "Viajó solo a Doral → puede juntarse en una caja");
assert(puedeEntrarACaja({ origenArticulo: "Proveedor local", estado: "Pendiente de pago" }), "Local también puede ir en una caja");
assert(!puedeEntrarACaja({ origenArticulo: "Ya está en la tienda", estado: "Disponible" }), "Lo que está en la tienda no entra a cajas");
assert(!puedeEntrarACaja({ origenArticulo: "Proveedor extranjero", estado: "Pagado", packingId: "recPK" }), "Ya en otra caja → no");

console.log("\n— Campos heredados —");
assert(modoLogisticoSegunOrigen("Ya está en la tienda", false).modoLogistico === "No aplica", "Tienda → No aplica");
assert(modoLogisticoSegunOrigen("Proveedor local", false).modoLogistico === "Tracking directo", "Viaja solo → Tracking directo");
assert(modoLogisticoSegunOrigen("Proveedor extranjero", true).requierePacking === true, "Viaja en caja → requiere packing");

console.log("\n— Qué falta (Logística) —");
assert(pendientesLogisticos({ origenArticulo: "Proveedor extranjero" }).join(",") === "Rastreo al casillero,Rastreo a Ecuador,Flete,Arancel", "Extranjero recién registrado: faltan los dos rastreos, flete y arancel");
assert(pendientesLogisticos({ origenArticulo: "Proveedor extranjero", trackingHaciaIntermediario: "9400", trackingDesdeIntermediario: "LB1", fleteAsignadoRegistro: 12, arancelAsignadoRegistro: 0 }).length === 0, "Extranjero completo (arancel 0 cuenta como anotado)");
assert(pendientesLogisticos({ origenArticulo: "Proveedor local", trackingDirecto: "SV-1" }).join(",") === "Flete", "Local con rastreo: falta el flete");
assert(pendientesLogisticos({ origenArticulo: "Ya está en la tienda" }).length === 0, "En la tienda: nada pendiente");

if (fallos > 0) { console.error(`\n${fallos} assert(s) fallaron.`); process.exit(1); }
console.log("\n✅ item-origen.test.ts — todos los asserts pasaron");
