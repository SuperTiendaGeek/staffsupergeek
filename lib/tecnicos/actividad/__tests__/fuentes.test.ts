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
// Actividad v2 (24-nov, tableros 13–15): la caja solo anota; el mensaje nace de una línea.
assert(tarjeta.includes('placeholder="Anota lo que pasó…"') && !/Redactar mensaje para el cliente con IA/.test(tarjeta), "la caja solo anota (sin ✨ ni WhatsApp)");
assert(!tarjeta.includes("Para quién es la nota") && !tarjeta.includes('"Nota interna"'), "ya no hay selector Nota interna / Al cliente");
assert(tarjeta.includes('void mensaje(e.id, "crear")') && tarjeta.includes("Crear mensaje"), "cada línea posible trae «✨ Crear mensaje»");
assert(tarjeta.includes("<MensajeCliente") && tarjeta.includes("Se guarda solo"), "el mensaje queda pegado a su línea y se guarda solo");
assert(/buildWhatsAppUrl\(telefono, t\)/.test(tarjeta) && tarjeta.includes('enviar("Copiado")') && tarjeta.includes('enviar("WhatsApp")'), "junto al mensaje: «Enviar por WhatsApp» (wa.me con el teléfono del cliente) y «Copiar»");
assert(tarjeta.includes("Reenviar") && tarjeta.includes("Enviado por WhatsApp"), "el mensaje enviado dice quién y cuándo, y se puede reenviar");
assert(tarjeta.includes('mensaje(e.id, "talCual")'), "«Enviar tal cual» (sin IA) en las acciones de la línea");
assert(tarjeta.includes("navigator.clipboard.writeText(e.texto)"), "cada nota o mensaje de la lista se puede copiar");
assert(tarjeta.includes("sg-destello_700ms") && !tarjeta.includes("sg-destello_900ms"), "el destello de la línea nueva dura 700 ms (antes 900)");
assert(tarjeta.includes('(e.tipo === "Nota" || e.tipo === "Aviso al cliente") && (e.texto.split'), "las notas largas también se pliegan con «ver todo»");
assert(tarjeta.includes("desplazar(") && !tarjeta.includes('behavior: "smooth"'), "llevar a la vista respeta «reducir movimiento»");
const desplazar = leer("components/tecnicos/desplazar.ts");
assert(desplazar.includes("prefers-reduced-motion: reduce") && desplazar.includes('quieto ? "auto" : "smooth"'), "desplazar(): sin animación si la persona pidió reducir movimiento");

const mensaje = leer("lib/tecnicos/actividad/mensaje.ts");
assert(mensaje.includes('"Estado Generado IA"') && mensaje.includes('"Mensaje enviado"') && mensaje.includes('"Mensaje enviado por"'), "el mensaje se guarda en su línea (Estado Generado IA + Mensaje enviado/por)");
assert(!mensaje.includes('"Solicitar Mensaje Cliente": true'), "no dispara la Automatización 2 vieja");
assert(/ids\(r\.fields\["Órdenes de Reparación"\]\)\.includes\(ordenId\)/.test(mensaje), "solo se toca una línea de la misma orden");
assert(/"Cliente avisado"/.test(mensaje) && /=== "Completado"/.test(mensaje) && mensaje.includes('"Último movimiento"'), "enviar el mensaje con la orden Completado marca «Cliente avisado» y cuenta como movimiento");
assert(mensaje.includes("formatoWhatsApp("), "el mensaje de la IA sale en párrafos para WhatsApp");
const rutaMensaje = leer("app/api/tecnicos/ordenes/[id]/actividad/[linea]/mensaje/route.ts");
assert(rutaMensaje.includes("requireTecnicosSession"), "la ruta del mensaje pide sesión de Técnicos");

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
