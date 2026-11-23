/**
 * Test de fuentes — motivos de ingreso con chips (rediseño R7, tableros 7 y 8).
 * Ejecutar: npm test motivos/__tests__/fuentes
 */
import { readFileSync } from "node:fs";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}
const leer = (p: string) => readFileSync(p, "utf8");

// Registro de la orden
const registro = leer("app/tecnicos/ordenes/OrdenesPageClient.tsx");
assert(registro.includes("<MotivosSelector") && registro.includes("motivoIds: ordenMotivos.map((m) => m.id)"), "el registro elige motivos con chips y los manda");
assert(registro.includes("clienteDice: ordenClienteDice.trim()") && registro.includes("contrasena: ordenContrasena.trim()"), "también «Cliente dice» y la contraseña del equipo");
assert(!registro.includes("Técnico o canal de ingreso") && !registro.includes('label="Ingresa Por"'), "ya no está el campo libre «Ingresa Por»");
assert(!/<FieldShell[^>]*>\s*<MotivosSelector/.test(registro), "el selector no va dentro de un <label> (tiene varios botones)");
const rutaOrdenes = leer("app/api/tecnicos/ordenes/route.ts");
assert(rutaOrdenes.includes("camposDeMotivos(motivoIds, clienteDice)") && rutaOrdenes.includes("motivoIds: idsMotivos"), "la ruta de crear valida los motivos y los liga");
assert(rutaOrdenes.includes("contrasena, usuario"), "la contraseña va a la ficha del equipo (nunca a la orden)");

// La orden y el regreso
const pantalla = leer("app/tecnicos/ordenes/[id]/OrdenDetalleClient.tsx");
assert(pantalla.includes("<MotivoIngresoCard"), "la orden muestra los chips en «Motivo de ingreso»");
const regreso = leer("components/tecnicos/ordenes/RegresoEquipoDialog.tsx");
assert(regreso.includes("<MotivosSelector") && regreso.includes("motivoIds: motivos.map((m) => m.id)"), "«Regresó el equipo» usa los mismos chips");
assert(leer("lib/tecnicos/regreso/servidor.ts").includes("camposDeMotivos(o.motivoIds"), "el regreso liga los motivos a la orden nueva");

// Selector
const selector = leer("components/tecnicos/motivos/MotivosSelector.tsx");
assert(selector.includes("buscarMotivos(catalogo, texto, 6)") && selector.includes("+ Crear «"), "busca al instante y ofrece crear");
assert(selector.includes("¿Es lo mismo que «") && selector.includes("agregarPalabra: a.texto"), "antes de crear pregunta «¿Es lo mismo que…?»; usarlo guarda la palabra parecida");

// Catálogo: solo administrador cambia
const rutaMotivo = leer("app/api/tecnicos/motivos/[id]/route.ts");
assert(/agregarPalabra[\s\S]*isAdministratorRole\(session\.user\.rol\)/.test(rutaMotivo), "cambiar el catálogo es solo de administrador (agregar palabra parecida, de todos)");
assert(leer("app/api/tecnicos/motivos/[id]/unir/route.ts").includes("isAdministratorRole(session.user.rol)"), "unir motivos es solo de administrador");
const servidor = leer("lib/tecnicos/motivos/servidor.ts");
assert(!/method: "DELETE"/.test(servidor), "nunca se borra un motivo (se une o se desactiva)");
assert(servidor.includes('tipoActividad: "Sistema"') && servidor.includes("Motivo de ingreso:"), "cambiar los motivos de una orden queda en la Actividad");
assert(leer("components/staff/StaffAppFrame.tsx").includes('href: "/tecnicos/motivos"'), "el catálogo está en el menú de Técnicos");
assert(leer("lib/asistente/servidor.ts").includes("motivoParaIA("), "la IA lee los chips del motivo");

// Tailwind lee lib/**: nada de corchetes con dos puntos
for (const p of ["lib/tecnicos/motivos/reglas.ts", "lib/tecnicos/motivos/semilla.ts", "lib/tecnicos/motivos/migracion.ts", "lib/tecnicos/motivos/servidor.ts"]) {
  assert(!/\[[^\]\n\s]*:[^\]\n\s]*\]/.test(leer(p)), `${p} no tiene corchetes con «:» (rompen el CSS)`);
}

if (fallos > 0) { console.error(`\n${fallos} fallo(s).`); process.exit(1); }
console.log("\nTodo bien.");
