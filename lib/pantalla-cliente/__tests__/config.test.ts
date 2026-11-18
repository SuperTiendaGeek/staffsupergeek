/**
 * Test — ajustes de la pantalla del cliente (etapa 10E-C).
 * Ejecutar: npm test pantalla-cliente
 */
import {
  CONFIG_INICIAL, agregarAlHistorial, describirCambios, grupoDeRol, normalizarConfig, puedeUsarPantalla, validarConfig,
} from "../config";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

// Dueño, 18-nov: solo Administradores y Staff.
assert(puedeUsarPantalla("Administrador", CONFIG_INICIAL) && puedeUsarPantalla("Staff", CONFIG_INICIAL), "Administrador y Staff la usan");
assert(!puedeUsarPantalla("Técnico", CONFIG_INICIAL) && !puedeUsarPantalla("tecnico", CONFIG_INICIAL), "un técnico no la usa");
assert(!puedeUsarPantalla("Proveedor", { ...CONFIG_INICIAL, roles: ["Administrador", "Staff", "Técnico"] }), "un proveedor externo nunca");
assert(!puedeUsarPantalla("Administrador", { ...CONFIG_INICIAL, activa: false }), "apagada en la tienda: nadie");
assert(grupoDeRol("admin") === "Administrador" && grupoDeRol("Logística") === "Staff" && grupoDeRol(undefined) === null, "grupos de rol");

// Sin nada guardado o con datos raros: valores iniciales.
const vacio = normalizarConfig(null);
assert(JSON.stringify(vacio) === JSON.stringify(CONFIG_INICIAL), "sin registro: valores iniciales (30 s, 3 min, Bienvenido)");
const raro = normalizarConfig({ segundosGracias: 999, minutosSinActividad: "5", roles: ["Staff", "Jefe"], textoReposo: "  Hola  " });
assert(raro.segundosGracias === 30 && raro.minutosSinActividad === 3 && raro.roles.join() === "Staff" && raro.textoReposo === "Hola", "valores fuera de opciones vuelven al inicial");

// Validación al guardar.
assert(validarConfig({ ...CONFIG_INICIAL, minutosSinActividad: 5 }).ok, "5 minutos es una opción válida");
assert(!validarConfig({ ...CONFIG_INICIAL, minutosSinActividad: 7 }).ok, "7 minutos no es opción");
assert(!validarConfig({ ...CONFIG_INICIAL, roles: [] }).ok, "encendida sin roles: se rechaza");
assert(validarConfig({ ...CONFIG_INICIAL, activa: false, roles: [] }).ok, "apagada puede quedar sin roles");
assert(!validarConfig({ ...CONFIG_INICIAL, textoReposo: "x".repeat(41) }).ok, "texto de más de 40 letras: se rechaza");

// Historial.
const cambio = describirCambios(CONFIG_INICIAL, { ...CONFIG_INICIAL, minutosSinActividad: 5, roles: ["Administrador", "Staff", "Técnico"] });
assert(cambio === "Técnico: sí; sin actividad 3 → 5 min", "describe solo lo que cambió");
assert(describirCambios(CONFIG_INICIAL, CONFIG_INICIAL) === "", "sin cambios: vacío");
const h = agregarAlHistorial("b\na", "c", 2);
assert(h === "c\nb", "lo más nuevo arriba, guarda solo las últimas N");

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo bien.");
