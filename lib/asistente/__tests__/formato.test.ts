/**
 * Test del formato de los mensajes al cliente para WhatsApp (pedido del dueño, 23-nov).
 * Ejecutar: npm test asistente/__tests__/formato
 */
import { readFileSync } from "node:fs";
import { formatoWhatsApp, frases } from "../formato";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

// El ejemplo de Maritza (OR000574), tal como salió en un solo párrafo
const ximena = "Hola, Ximena. Le saludamos de SUPER GEEK. Sobre su laptop HP Pavilion G4 (orden OR000574): tras la revisión técnica, al encenderla no da señal de video y se detectaron problemas electrónicos en la tarjeta madre. Como el presupuesto de reparación sería muy elevado, le recomendamos adquirir otro computador. No hay valores pendientes de pago. Gracias por su confianza. SUPER GEEK";
const esperado = [
  "Hola, Ximena.",
  "",
  "Le saludamos de SUPER GEEK. Sobre su laptop HP Pavilion G4 (orden OR000574): tras la revisión técnica, al encenderla no da señal de video y se detectaron problemas electrónicos en la tarjeta madre.",
  "",
  "Como el presupuesto de reparación sería muy elevado, le recomendamos adquirir otro computador.",
  "",
  "No hay valores pendientes de pago.",
  "",
  "Gracias por su confianza.",
  "SUPER GEEK",
].join("\n");
assert(formatoWhatsApp(ximena) === esperado, "un solo párrafo queda como el ejemplo del dueño (saludo, párrafos, gracias y firma)");
assert(formatoWhatsApp(esperado) === esperado, "si ya viene con párrafos, no se toca");

const andres = formatoWhatsApp("Buen día, Sr. Andrés. Para la entrega queda pendiente el pago de $10.00 y la emisión de su factura o recibo. ¡Gracias por confiar en nosotros! SUPER GEEK");
assert(andres.startsWith("Buen día, Sr. Andrés.\n\n"), "no corta en «Sr.»");
assert(andres.includes("$10.00 y la emisión"), "no corta en «$10.00»");
assert(andres.endsWith("¡Gracias por confiar en nosotros!\nSUPER GEEK"), "el agradecimiento y la firma quedan juntos al final");

assert(formatoWhatsApp("Su equipo está listo. — SUPER GEEK") === "Su equipo está listo.\n\nSUPER GEEK", "firma sola en su línea aunque no haya agradecimiento");
assert(formatoWhatsApp("  Hola.\r\n\r\n\r\n\r\nListo  ") === "Hola.\n\nListo", "limpia espacios y saltos de más");
assert(formatoWhatsApp("") === "", "vacío queda vacío");
assert(frases("Hola, Sra. López. Ok.").length === 2, "frases: «Sra.» no parte la frase");

// La IA recibe la instrucción y la ruta aplica el formato a todo mensaje al cliente
const contexto = readFileSync("lib/asistente/contexto.ts", "utf8");
assert(contexto.includes("el saludo solo en la primera línea") && contexto.includes("«Gracias por su confianza.»"), "la IA recibe la instrucción de formato");
const ruta = readFileSync("app/api/tecnicos/ordenes/[id]/asistente/route.ts", "utf8");
assert((ruta.match(/formatoWhatsApp\(/g) ?? []).length >= 3, "redactar, más corto, otra versión y el resumen pasan por el formato");
assert(!/\[[^\]\n\s]*:[^\]\n\s]*\]/.test(readFileSync("lib/asistente/formato.ts", "utf8")), "lib/asistente/formato.ts sin corchetes con «:» (Tailwind)");

if (fallos > 0) { console.error(`\n${fallos} fallo(s).`); process.exit(1); }
console.log("\nTodo bien.");
