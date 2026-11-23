/**
 * Test de fuentes — la Actividad reemplaza al historial y a la nota interna (R3).
 * Ejecutar: npm test actividad
 */
import { readFileSync } from "node:fs";
import path from "node:path";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}
const leer = (rel: string) => readFileSync(path.resolve(__dirname, "../../../..", rel), "utf8");

const pantalla = leer("app/tecnicos/ordenes/[id]/OrdenDetalleClient.tsx");
assert(/<ActividadCard\s/.test(pantalla), "la orden muestra la Actividad");
assert(!/title=\{item\.estadoGeneradoIA \? "Regenerar mensaje IA" : "Generar mensaje IA"\}/.test(pantalla), "ya no está el botón viejo «Generar mensaje IA»");

const tarjeta = leer("components/tecnicos/ordenes/ActividadCard.tsx");
assert(/accion: "redactar"|accion, apunte: texto/.test(tarjeta), "✨ pide el borrador a la IA");
assert(/buildWhatsAppUrl\(datos\?\.telefono/.test(tarjeta), "«WhatsApp» usa el teléfono del cliente");
// 23-nov (personal): sin selector «Nota interna / Al cliente»; el botón decide.
assert(!tarjeta.includes("Para quién es la nota") && !tarjeta.includes('"Nota interna"'), "ya no hay selector Nota interna / Al cliente");
assert(tarjeta.includes('guardar(texto, "nota")') && tarjeta.includes('guardar(texto, "whatsapp")'), "en la caja: «Guardar» (solo el personal) y «WhatsApp» (mensaje al cliente)");
assert(tarjeta.includes('guardar(borrador, "copiar")') && tarjeta.includes('guardar(borrador, "whatsapp")'), "el borrador de la IA: «Copiar» o «Enviar por WhatsApp»; los dos quedan como mensaje al cliente");
assert(tarjeta.includes("navigator.clipboard.writeText(e.texto)"), "cada nota o mensaje de la lista se puede copiar");
assert(tarjeta.includes("Enviado al cliente") && !tarjeta.includes(">Interna<"), "la lista ya no marca «Interna» en cada nota");

const ruta = leer("app/api/tecnicos/ordenes/[id]/asistente/route.ts");
assert(/accion === "redactar"/.test(ruta) && /pedidoRedactar\(/.test(ruta), "la ruta del asistente sabe redactar el mensaje");

const nota = leer("app/api/tecnicos/ordenes/[id]/asistente/nota/route.ts");
assert(/agregarNotaInterna\(/.test(nota) && !/agregarANotaInterna/.test(nota), "«Guardar en la Actividad» del técnico experto ya no escribe la nota interna");
const manual = leer("lib/manual-tecnico/servidor.ts");
assert(!/agregarANotaInterna/.test(manual) && /agregarNotaInterna\(/.test(manual), "el voto del Manual técnico se anota en la Actividad");

const servidor = leer("lib/tecnicos/actividad/servidor.ts");
assert(/"Cliente avisado"/.test(servidor) && /=== "Completado"/.test(servidor), "avisar por WhatsApp con la orden Completada marca «Cliente avisado»");

const enlace = leer("lib/tecnicos/presupuesto/enlace.ts");
assert(/novedadesDeLaOrden\(o\.id\)/.test(enlace), "el enlace del cliente trae sus novedades");

if (fallos) { console.error(`\n${fallos} prueba(s) fallaron`); process.exit(1); }
console.log("\nTodo bien.");
