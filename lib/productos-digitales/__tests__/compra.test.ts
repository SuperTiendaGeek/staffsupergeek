/**
 * Test — compra y gestión de licencias (punto 5B-2 · 7-nov-2026).
 * Ejecutar: npm test productos-digitales
 */
import {
  accionesDeGestion,
  costoDeFila,
  destinoReclamo,
  errorFilaLicencia,
  errorGestion,
  errorSolicitudDeFila,
  esCategoriaLicencia,
  planArticuloDeLicencia,
} from "../compra";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

// ─── Fila de "Registrar compra" ──────────────────────────────────────────────
const cat = { activo: true };
assert(errorFilaLicencia({ catalogoId: "", costo: 5, precio: 18, reposicion: false }, null) !== null, "Sin producto del catálogo → error");
assert(errorFilaLicencia({ catalogoId: "recA", costo: 5, precio: 18, reposicion: false }, { activo: false }) !== null, "Producto inactivo → error");
assert(errorFilaLicencia({ catalogoId: "recA", costo: null, precio: 18, reposicion: false }, cat) !== null, "Compra sin costo → error (caso DIG-000082)");
assert(errorFilaLicencia({ catalogoId: "recA", costo: 0, precio: 18, reposicion: false }, cat) !== null, "Compra en $0 sin marcar reposición → error");
assert(errorFilaLicencia({ catalogoId: "recA", costo: 5, precio: 0, reposicion: false }, cat) !== null, "Sin precio de venta → error");
assert(errorFilaLicencia({ catalogoId: "recA", costo: 5, precio: 18, reposicion: false }, cat) === null, "Compra normal válida");
assert(errorFilaLicencia({ catalogoId: "recA", costo: null, precio: 18, reposicion: true }, cat) === null, "Reposición del proveedor sin costo → válida");
assert(errorFilaLicencia({ catalogoId: "recA", costo: 3, precio: 18, reposicion: true }, cat) !== null, "Reposición con costo → error (va en $0)");
assert(costoDeFila({ catalogoId: "recA", costo: 9, precio: 18, reposicion: true }) === 0, "La reposición se guarda en $0");
assert(costoDeFila({ catalogoId: "recA", costo: 4.555, precio: 18, reposicion: false }) === 4.56, "El costo se redondea a centavos");

// ─── La solicitud que cumple la fila ─────────────────────────────────────────
const sol = { codigo: "SOL-000010", estado: "Por comprar", categoria: "Licencia digital" };
assert(errorSolicitudDeFila(sol, "recA", "recA") === null, "Solicitud de licencia del mismo producto → válida");
assert(errorSolicitudDeFila({ ...sol, estado: "Comprada" }, "recA", "recA") !== null, "Solicitud ya comprada → error (nunca dos compras)");
assert(errorSolicitudDeFila({ ...sol, categoria: "Batería" }, "recA", "recA") !== null, "Solicitud de un repuesto → no se compra como licencia");
assert(errorSolicitudDeFila(sol, "recA", "recB") !== null, "Otro producto del catálogo → error (no se le entrega otro por error)");
assert(esCategoriaLicencia(" licencia digital ") && !esCategoriaLicencia("Cargador"), "Reconoce la categoría Licencia digital");

// ─── El artículo sigue a su licencia ─────────────────────────────────────────
const nuevo = { estado: "Disponible", cantidad: 1, disponibleVenta: false };
let p = planArticuloDeLicencia("Disponible", nuevo);
assert(Object.keys(p.fields).length === 0 && p.delta === 0, "Disponible y al día → nada que escribir");
p = planArticuloDeLicencia("Disponible", { estado: "Disponible", cantidad: 1, disponibleVenta: true });
assert(p.fields["Disponible para venta"] === false && !("Estado Item" in p.fields) && p.delta === 0, "Recién comprada → nunca \"Disponible para venta\" (no se ofrece como artículo)");
p = planArticuloDeLicencia("Reservado", nuevo);
assert(p.fields["Estado Item"] === "Reservado" && p.fields["Disponible para venta"] === false && p.delta === 0, "Reservada para una orden → artículo Reservado, sin Kardex");
p = planArticuloDeLicencia("Usado", { estado: "Reservado", cantidad: 1 });
assert(p.fields["Estado Item"] === "Vendido" && p.fields["Cantidad"] === 0 && p.delta === -1, "Vendida → artículo Vendido y sale 1 del Kardex");
p = planArticuloDeLicencia("Reservado", { estado: "Vendido", cantidad: 0 });
assert(p.fields["Estado Item"] === "Reservado" && p.fields["Cantidad"] === 1 && p.delta === 1, "Documento anulado → vuelve a Reservado y entra 1 al Kardex");
p = planArticuloDeLicencia("Anulado", { estado: "Disponible", cantidad: 1 });
assert(p.fields["Estado Item"] === "Dado de baja" && p.delta === -1, "Anulada sin vender → Dado de baja (sale 1)");
p = planArticuloDeLicencia("Anulado", { estado: "Vendido", cantidad: 0, disponibleVenta: false });
assert(Object.keys(p.fields).length === 0 && p.delta === 0, "Vendida y devuelta con nota de crédito → sigue Vendido (sin otro movimiento)");
p = planArticuloDeLicencia("En reclamo", nuevo);
assert(p.fields["Estado Item"] === "Con novedad" && p.delta === 0, "En reclamo → Con novedad, sigue en el libro");

// ─── Gestión ─────────────────────────────────────────────────────────────────
assert(accionesDeGestion({ estado: "Disponible" }).join() === "editar,reclamo,anular", "Libre: editar, reclamo y anular");
assert(accionesDeGestion({ estado: "Reservado" }).join() === "editar", "Reservada: solo editar (se reemplaza desde la orden)");
assert(accionesDeGestion({ estado: "En reclamo" }).join() === "editar,resolver", "En reclamo: editar y resolver");
assert(accionesDeGestion({ estado: "Anulado" }).length === 0, "Anulada: nada");
assert(errorGestion("reclamo", { estado: "Disponible" }, "") !== null, "Reclamo sin motivo → error");
assert(errorGestion("reclamo", { estado: "Reservado" }, "No activa") !== null, "Reclamo de una reservada → error");
assert(errorGestion("anular", { estado: "Disponible" }, "Clave duplicada") === null, "Anular libre con motivo → permitido");
assert(destinoReclamo("funciono") === "Disponible" && destinoReclamo("repuesta") === "Anulado" && destinoReclamo("no_repuesta") === "Anulado",
  "Resolver: funcionó → Disponible; repuesta o no repuesta → Anulado");

if (fallos) { console.error(`\n${fallos} prueba(s) fallaron`); process.exit(1); }
console.log("\nTodo bien");
