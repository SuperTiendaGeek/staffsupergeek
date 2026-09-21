/**
 * Eliminar Shipping Item (solo Administrador): qué bloquea y qué no.
 * Ejecutar: npm test eliminar-item
 */
import { readFileSync } from "node:fs";
import { CAMPOS_ITEM as C, confirmacionValida, detectarVinculosDesconocidos, evaluarEliminacion, type ContextoEliminacion } from "../eliminar-item";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

function ctx(p: Partial<ContextoEliminacion> = {}): ContextoEliminacion {
  return { sku: "RAM-000026", nombre: "Repuesto prueba", estado: "Pendiente de pago", pagos: [], presupuesto: [], conteo: {}, vinculosDesconocidos: [], fotos: 0, ...p };
}

// Caso real de la prueba: pedido, recibido, cliente desistió (liberado). Solo eventos y opción.
const limpio = evaluarEliminacion(ctx({ conteo: { [C.eventos]: 3, [C.opcionOrigen]: 1 }, presupuesto: [{ descripcion: "Repuesto", estado: "Rechazada" }] }));
assert(limpio.permitido, "item liberado sin pago/packing/documentos se puede eliminar");
assert(limpio.confirmacion === "RAM-000026", "la confirmación es el SKU");
assert(limpio.avisos.some((a) => a.includes("3 eventos")), "avisa que el historial pierde el enlace");
assert(limpio.avisos.some((a) => a.includes("SKU RAM-000026 queda libre")), "avisa que el SKU puede reutilizarse");

const bloquea = (p: Partial<ContextoEliminacion>, texto: string, msg: string) => {
  const e = evaluarEliminacion(ctx(p));
  assert(!e.permitido && e.bloqueos.some((b) => b.includes(texto)), msg);
};
bloquea({ estado: "Vendido" }, "Vendido", "vendido bloquea");
bloquea({ conteo: { [C.factura]: 1 } }, "factura", "factura bloquea");
bloquea({ conteo: { [C.notaCredito]: 1 } }, "nota de crédito", "nota de crédito bloquea");
bloquea({ conteo: { [C.recibo]: 1 } }, "recibo", "recibo bloquea");
bloquea({ conteo: { [C.reservas]: 1 } }, "reservas", "reserva bloquea");
bloquea({ conteo: { [C.ordenStock]: 1 } }, "orden de reparación", "cargado a una orden bloquea");
bloquea({ conteo: { [C.operacion]: 1 } }, "Operación Comercial activa", "operación activa bloquea");
bloquea({ presupuesto: [{ descripcion: "X", estado: "Cargada" }] }, "presupuesto", "línea de presupuesto activa bloquea");
bloquea({ pagos: [{ codigo: "PAG-9", estado: "Pendiente" }] }, "PAG-9", "pago pendiente bloquea");
bloquea({ pagos: [{ codigo: "PAG-9", estado: "Pagado" }] }, "reembolso", "pago pagado bloquea y sugiere novedad");
bloquea({ pagos: [{ codigo: "PAG-9", estado: "desconocido" }] }, "PAG-9", "pago que no se pudo leer bloquea");
bloquea({ conteo: { [C.packings]: 1 } }, "packing", "packing bloquea");
bloquea({ conteo: { [C.recepciones]: 1 } }, "recepción", "recepción bloquea");
bloquea({ conteo: { [C.novedades]: 2 } }, "novedades", "novedad bloquea");
bloquea({ conteo: { [C.migraciones]: 1 } }, "migración", "migración bloquea");
bloquea({ conteo: { [C.intervenciones2]: 1 } }, "intervenciones", "intervención bloquea");
bloquea({ conteo: { [C.itemPadre]: 1 } }, "despiece", "pieza de despiece bloquea");
bloquea({ conteo: { [C.itemsHijos]: 4 } }, "huérfanas", "equipo con piezas bloquea");
bloquea({ vinculosDesconocidos: ["fldNUEVO123456789"] }, "no reconoce", "vínculo desconocido bloquea");

const anulado = evaluarEliminacion(ctx({ pagos: [{ codigo: "PAG-1", estado: "Anulado" }] }));
assert(anulado.permitido && anulado.avisos.some((a) => a.includes("pago anulado")), "pago anulado no bloquea, solo avisa");

// Detección genérica de vínculos
const desconocidos = detectarVinculosDesconocidos({
  [C.eventos]: ["recAAAAAAAAAAAAAA"],
  [C.sku]: "RAM-1",
  fldOTROlink000000: ["recBBBBBBBBBBBBBB"],
  fldTexto000000000: ["hola"],
  fldVacio000000000: [],
});
assert(desconocidos.length === 1 && desconocidos[0] === "fldOTROlink000000", "detecta solo links nuevos no contemplados");

assert(confirmacionValida("RAM-000026", " ram-000026 "), "confirmación ignora mayúsculas y espacios");
assert(!confirmacionValida("RAM-000026", "RAM-00002"), "confirmación incompleta no vale");
assert(!confirmacionValida("", ""), "confirmación vacía no vale");

// El endpoint exige Administrador en el servidor (no solo el botón oculto).
const ruta = readFileSync("app/api/shipping-v2/items/[id]/eliminar/route.ts", "utf8");
assert((ruta.match(/requireAdminSession\(\)/g) ?? []).length === 2, "GET y POST exigen sesión de Administrador");
const pagina = readFileSync("app/shipping-v2/items/[id]/page.tsx", "utf8");
assert(pagina.includes("{esAdmin && <EliminarItemAdmin"), "el botón solo se muestra a administradores");

// Presupuesto: ya no hay panel de vista previa; "Cliente aprobó" carga directo.
const card = readFileSync("components/tecnicos/ordenes/PresupuestoCard.tsx", "utf8");
assert(!card.includes("Vista previa"), "PresupuestoCard sin panel de vista previa");
assert(card.includes("confirmar: true"), "Cliente aprobó envía la carga confirmada");

if (fallos > 0) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo OK");
