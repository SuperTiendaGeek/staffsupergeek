/**
 * Presupuesto único, fase 4: la orden ya no tiene tarjetas Repuestos,
 * Servicios ni Productos digitales. El presupuesto es el ÚNICO camino para
 * cargar o quitar cargos de una orden, y nada puede volver a abrir un segundo
 * camino sin que esta prueba falle.
 * Ejecutar: npm test presupuesto-fase4
 */
import fs from "fs";
import path from "path";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const leer = (rel: string) => fs.readFileSync(rel, "utf8");

function archivos(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "__tests__" || e.name.startsWith(".")) continue;
      archivos(p, out);
    } else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

// ─── 1. Las rutas de carga directa ya no existen ────────────────────────────
for (const ruta of [
  "app/api/tecnicos/ordenes/[id]/repuestos-v2/route.ts",
  "app/api/tecnicos/ordenes/[id]/servicios/route.ts",
  "app/api/tecnicos/ordenes/[id]/productos-digitales/route.ts",
  "app/api/tecnicos/servicios-por-orden/[id]/route.ts",
]) {
  assert(!fs.existsSync(ruta), `no existe ${ruta} (cargaba o quitaba cargos sin pasar por el presupuesto)`);
}
assert(fs.existsSync("app/api/tecnicos/ordenes/[id]/repuestos-v2/buscar/route.ts"),
  "el buscador de repuestos (solo lectura) sigue: lo usa el presupuesto");

// ─── 2. Solo cargar.ts carga o quita cargos de una orden ────────────────────
const funciones = [
  "createServicioPorOrden", "agregarRepuestoStockAOrden", "asignarProductoDigitalAOrden",
  "deleteServicioPorOrdenById", "quitarRepuestoStockDeOrden", "desasignarProductoDigitalDeOrden",
];
const codigo = [...archivos("app"), ...archivos("lib"), ...archivos("components"), ...archivos("scripts")];
for (const f of funciones) {
  const llamadores = codigo.filter((p) => {
    const src = leer(p)
      .replace(/\/\/.*$/gm, "")            // comentarios de línea
      .replace(/\/\*[\s\S]*?\*\//g, "");   // comentarios de bloque
    const llama = new RegExp(`\\b${f}\\(`).test(src);
    const define = new RegExp(`(function\\s+${f}\\b|const\\s+${f}\\s*=)`).test(src);
    return llama && !define;
  });
  assert(llamadores.length === 1 && llamadores[0] === path.join("lib", "tecnicos", "presupuesto", "cargar.ts"),
    `${f}() solo se llama desde lib/tecnicos/presupuesto/cargar.ts (hoy: ${llamadores.join(", ") || "nadie"})`);
}

// ─── 3. La pantalla de la orden ya no tiene las tarjetas ────────────────────
const orden = leer("app/tecnicos/ordenes/[id]/OrdenDetalleClient.tsx");
for (const texto of ["+ Agregar repuesto de stock", "Buscar servicio...", "Asignar producto", "Desasignar", "Guardar servicio"]) {
  assert(!orden.includes(texto), `la orden ya no muestra "${texto}"`);
}
assert(!/servicios-por-orden|\/productos-digitales`|\/servicios`|\/repuestos-v2`/.test(orden),
  "la orden no llama a ninguna ruta de carga directa");
assert(orden.includes("Repuestos históricos (sistema anterior)"),
  "los repuestos del sistema anterior se siguen viendo (ahora en el Resumen financiero)");
assert(orden.includes("cuentaUnificadaError &&"),
  "si la cuenta no carga, el Resumen financiero lo avisa (antes lo decía la tarjeta Repuestos)");

// ─── 4. Lo que hacían las tarjetas y no era cargar: sigue, en el presupuesto ─
const card = leer("components/tecnicos/ordenes/PresupuestoCard.tsx");
assert(card.includes("<EntregaProductoDigital") && card.includes('l.tipo === "Producto digital" && l.estado === "Cargada"'),
  "credenciales, PDF y portal del producto digital se ven en su línea aprobada");
assert(card.includes("digitalesSinLinea"), "un producto digital sin línea igual muestra su entrega (no se pierde la clave)");
assert(card.includes("+ Crear servicio nuevo en el catálogo") && card.includes('"/api/tecnicos/catalogo/servicios", {'),
  "el presupuesto permite crear un servicio nuevo en el catálogo (antes solo la tarjeta Servicios)");
assert(!card.includes("desde sus tarjetas"), "el aviso de cargos sueltos ya no menciona tarjetas que no existen");

const entrega = leer("components/tecnicos/ordenes/EntregaProductoDigital.tsx");
assert(entrega.includes("/credenciales") && entrega.includes("/pdf"), "la entrega usa los endpoints de credenciales y PDF");
assert(!/method:\s*"(POST|DELETE)"[^)]*\/productos-digitales`/.test(entrega) && !entrega.includes("/ordenes/"),
  "la entrega no asigna ni desasigna productos (solo lee y genera el PDF)");
assert(/esAdmin\s*&&/.test(entrega), "borrar el PDF sigue siendo solo del admin");

if (fallos > 0) { console.error(`\n${fallos} fallo(s).`); process.exit(1); }
console.log("\nOK — fase 4: el presupuesto es el único camino.");
