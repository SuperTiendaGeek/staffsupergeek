/**
 * Test — presupuesto de la orden (tarjeta "Presupuesto").
 *
 * Reglas que protege:
 *   · Armar un presupuesto NO toca nada real: la tarjeta no importa ninguna
 *     función que reserve, asigne o cree cargos.
 *   · Al aprobar, cada línea se carga con las MISMAS funciones de las
 *     tarjetas (no hay un segundo camino para reservar un repuesto).
 *   · Lo que no se puede cargar queda pendiente sin frenar al resto.
 *   · Dos líneas del mismo producto digital reciben unidades distintas.
 *
 * Ejecutar: npm test presupuesto-reglas
 */

import fs from "fs";
import path from "path";
import {
  validarLinea, estadoPresupuesto, totalesPresupuesto, planDeCarga, esEditable, aceptaVincularArticulo,
  type LineaPresupuesto, type ContextoCarga,
} from "../presupuesto/reglas";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const linea = (o: Partial<LineaPresupuesto>): LineaPresupuesto => ({
  id: "recL", tipo: "Servicio", descripcion: "x", cantidad: 1, precioUnitario: 10, estado: "Propuesta", notaCarga: "",
  servicioCatalogoId: null, itemId: null, productoCatalogoId: null, cargoServicioId: null, cargoProductoDigitalId: null,
  aprobadoPor: "", fechaAprobacion: "", creadoPor: "", ...o,
});

// ─── Validación ──────────────────────────────────────────────────────────────
assert(validarLinea({ tipo: "Servicio", descripcion: "Limpieza", cantidad: 1, precioUnitario: 25 }) !== null,
  "Un servicio sin catálogo se rechaza (debe quedar igual que en la tarjeta de servicios)");
assert(validarLinea({ tipo: "Servicio", descripcion: "Limpieza", cantidad: 2, precioUnitario: 25, servicioCatalogoId: "recS" }) === null,
  "Un servicio del catálogo con cantidad 2 es válido");
assert(validarLinea({ tipo: "Repuesto", descripcion: "Pantalla", cantidad: 2, precioUnitario: 80, itemId: "recI" }) !== null,
  "Un repuesto del inventario va de a una unidad por línea");
assert(validarLinea({ tipo: "Repuesto", descripcion: "Pantalla por conseguir", cantidad: 2, precioUnitario: 80 }) === null,
  "Un repuesto por conseguir (sin artículo) sí admite cantidad");
assert(validarLinea({ tipo: "Producto digital", descripcion: "Office", cantidad: 1, precioUnitario: 30 }) !== null,
  "Un producto digital sin catálogo se rechaza");
assert(validarLinea({ tipo: "Repuesto", descripcion: "", cantidad: 1, precioUnitario: 1 }) !== null, "Sin descripción se rechaza");
assert(validarLinea({ tipo: "Repuesto", descripcion: "x", cantidad: 1, precioUnitario: -1 }) !== null, "Precio negativo se rechaza");

// ─── Estados ─────────────────────────────────────────────────────────────────
assert(estadoPresupuesto([]) === "sin_presupuesto", "Sin líneas → sin presupuesto");
assert(estadoPresupuesto([{ estado: "Propuesta" }]) === "propuesto", "Solo propuestas → propuesto");
assert(estadoPresupuesto([{ estado: "Propuesta" }, { estado: "Aprobada" }]) === "aprobado", "Una aprobada basta → aprobado");
assert(estadoPresupuesto([{ estado: "Rechazada" }, { estado: "Rechazada" }]) === "rechazado", "Todo rechazado → rechazado");
assert(esEditable({ estado: "Propuesta" }) && !esEditable({ estado: "Cargada" }) && !esEditable({ estado: "Aprobada" }),
  "Solo lo Propuesto se edita; lo aprobado queda como constancia");
assert(aceptaVincularArticulo({ estado: "Aprobada", tipo: "Repuesto" }) && !aceptaVincularArticulo({ estado: "Cargada", tipo: "Repuesto" }),
  "Un repuesto aprobado pendiente de stock acepta vincular su artículo; uno cargado no");

const t = totalesPresupuesto([
  linea({ id: "a", cantidad: 2, precioUnitario: 25, estado: "Propuesta" }),
  linea({ id: "b", precioUnitario: 80, estado: "Aprobada" }),
  linea({ id: "c", precioUnitario: 40, estado: "Cargada" }),
  linea({ id: "d", precioUnitario: 99, estado: "Rechazada" }),
]);
assert(t.propuesto === 50 && t.aprobado === 120 && t.pendienteDeCargar === 80 && t.rechazado === 99, "Totales por estado");

// ─── Plan de carga ───────────────────────────────────────────────────────────
const ctx: ContextoCarga = {
  items: new Map([
    ["recOK", { sku: "REP-000010", disponible: true, precio: 80 }],
    ["recVENDIDO", { sku: "REP-000011", disponible: false, motivoNoDisponible: "REP-000011 no tiene unidades libres", precio: 60 }],
  ]),
  unidadesDigitales: new Map([["recOFFICE", [{ productoId: "recPD1", etiqueta: "Office · ****AB12" }, { productoId: "recPD2", etiqueta: "Office · ****CD34" }]]]),
};
const plan = planDeCarga([
  linea({ id: "s", tipo: "Servicio", servicioCatalogoId: "recS", cantidad: 2, precioUnitario: 25 }),
  linea({ id: "r1", tipo: "Repuesto", itemId: "recOK", precioUnitario: 80 }),
  linea({ id: "r2", tipo: "Repuesto", itemId: "recVENDIDO", precioUnitario: 60 }),
  linea({ id: "r3", tipo: "Repuesto", descripcion: "Bisagra por conseguir" }),
  linea({ id: "d1", tipo: "Producto digital", productoCatalogoId: "recOFFICE" }),
  linea({ id: "d2", tipo: "Producto digital", productoCatalogoId: "recOFFICE" }),
  linea({ id: "d3", tipo: "Producto digital", productoCatalogoId: "recOFFICE" }),
  linea({ id: "x", estado: "Cargada", servicioCatalogoId: "recS" }),
  linea({ id: "y", estado: "Rechazada", servicioCatalogoId: "recS" }),
], ctx);
const paso = (id: string) => plan.find((p) => p.lineaId === id)!;

assert(!plan.some((p) => p.lineaId === "x" || p.lineaId === "y"), "Lo Cargado y lo Rechazado nunca se vuelve a cargar");
assert(paso("s").accion.tipo === "crear_servicio" && (paso("s").accion as { costo: number }).costo === 50, "Servicio ×2 de $25 → servicio de $50");
assert(paso("r1").accion.tipo === "reservar_repuesto", "Repuesto disponible → se reserva");
assert(paso("r2").accion.tipo === "pendiente", "Repuesto vendido mientras tanto → pendiente, no error");
assert(paso("r3").accion.tipo === "pendiente", "Repuesto sin artículo → pendiente hasta vincularlo");
assert(paso("d1").accion.tipo === "asignar_producto_digital" && paso("d2").accion.tipo === "asignar_producto_digital",
  "Dos licencias del mismo producto → dos asignaciones");
assert((paso("d1").accion as { productoId: string }).productoId !== (paso("d2").accion as { productoId: string }).productoId,
  "…y cada una recibe una unidad DISTINTA");
assert(paso("d3").accion.tipo === "pendiente", "La tercera, sin unidades libres, queda pendiente");

// ─── Guardas a nivel de código fuente ────────────────────────────────────────
const raiz = path.join(__dirname, "..", "..", "..");
const cargar = fs.readFileSync(path.join(raiz, "lib", "tecnicos", "presupuesto", "cargar.ts"), "utf8");
assert(cargar.includes("createServicioPorOrden(") && cargar.includes("agregarRepuestoStockAOrden(") && cargar.includes("asignarProductoDigitalAOrden("),
  "La carga usa las mismas funciones que las tarjetas de la orden (un solo camino)");
assert(cargar.includes("withLock(`presupuesto:"), "La carga toma turno por orden (un doble clic no duplica servicios)");

const card = fs.readFileSync(path.join(raiz, "components", "tecnicos", "ordenes", "PresupuestoCard.tsx"), "utf8");
assert(!/repuestos-v2"\s*,\s*\{\s*method:\s*"POST"/.test(card) && !card.includes("/productos-digitales\", { method"),
  "La tarjeta de presupuesto no reserva ni asigna nada por su cuenta");
assert(card.includes("/presupuesto/cargar") && card.includes("confirmar: true"),
  "Cargar a la orden pasa siempre por vista previa + confirmación");

if (fallos > 0) { console.error(`\n${fallos} fallo(s).`); process.exit(1); }
console.log("\nOK — presupuesto de la orden.");
