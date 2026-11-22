/**
 * Test de fuentes — avance por línea y SKU visible (rediseño R2 + R9).
 * Ejecutar: npm test trabajo
 */
import { readFileSync } from "node:fs";
import path from "node:path";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}
const leer = (rel: string) => readFileSync(path.resolve(__dirname, "../../../..", rel), "utf8");

const ruta = leer("app/api/tecnicos/ordenes/[id]/presupuesto/[lineaId]/trabajo/route.ts");
assert(/esOrdenCerrada\(orden\.estado\)/.test(ruta), "en una orden cerrada no se marca avance");
assert(/withLock\(`presupuesto:\$\{id\}`/.test(ruta), "con el mismo turno del presupuesto");
assert(/revisarCambioTrabajo\(/.test(ruta) && /tipoActividad: "Trabajo"/.test(ruta), "revisa con la regla pura y deja la Actividad");
assert(/visibilidad: resultado\.cambio\.motivoEspera === "Novedad" \? "Al cliente" : "Interna"/.test(ruta), "la novedad es «Al cliente»; lo demás, interno");
assert(/tomarSiNoTieneResponsable\(/.test(ruta), "pasar a En proceso asigna el responsable si faltaba");

const get = leer("app/api/tecnicos/ordenes/[id]/presupuesto/route.ts");
assert(/trabajos, skus,/.test(get), "el GET del presupuesto devuelve avance y SKU");

const tarjeta = leer("components/tecnicos/ordenes/PresupuestoCard.tsx");
assert(/<EstadoTrabajo ordenId=\{ordenId\}/.test(tarjeta), "la tarjeta muestra el botón de avance");
assert(/<CopyableSKU sku=\{skus\[l\.id\]\}/.test(tarjeta), "la línea del inventario muestra su SKU (se copia con un clic)");

const enlace = leer("lib/tecnicos/presupuesto/enlace.ts");
assert(/trabajo: \{ texto: t\.textoCliente/.test(enlace), "el enlace del cliente recibe el avance con el texto para el cliente");
const publico = leer("app/presupuesto/[token]/PresupuestoPublicoClient.tsx");
assert(/l\.trabajo\.texto/.test(publico) && /l\.trabajo\?\.novedad/.test(publico), "el cliente ve el avance y la novedad");

const estado = leer("app/api/tecnicos/ordenes/[id]/estado/route.ts");
assert(/estadoNormalizado === "En Proceso"[\s\S]{0,80}tomarSiNoTieneResponsable/.test(estado), "pasar la orden a En Proceso también asigna el responsable");

if (fallos) { console.error(`\n${fallos} prueba(s) fallaron`); process.exit(1); }
console.log("\nTodo bien.");
