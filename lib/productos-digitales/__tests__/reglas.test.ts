/**
 * Test — productos digitales 5A (auditoría ops, punto 5 · 7-nov-2026).
 * Ejecutar: npm test productos-digitales
 */
import { nombreLimpio, camposDeCredenciales, contarPorEstado, credencialesDelTipo, errorCredenciales, filtrarFilas, ordenarFilas, type FilaDigital } from "../reglas";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

// ─── Credenciales por tipo (caso "Elfina.8990") ─────────────────────────────
const uc = credencialesDelTipo("Usuario/Contraseña", { claveActivacion: "Elfina.8990", usuarioCorreo: " ana@mic-365.com ", contrasena: "Abc123" });
assert(uc.claveActivacion === null && uc.usuarioCorreo === "ana@mic-365.com" && uc.contrasena === "Abc123", "usuario/contraseña: la clave autocompletada NO sale (ni en el PDF)");
const cl = credencialesDelTipo("Clave de activación", { claveActivacion: "XXXX-1111", usuarioCorreo: "x", contrasena: "y" });
assert(cl.claveActivacion === "XXXX-1111" && cl.usuarioCorreo === null && cl.contrasena === null, "clave de activación: sin usuario ni contraseña");
assert(camposDeCredenciales("Suscripción").usuario && !camposDeCredenciales("Suscripción").clave, "suscripción = usuario y contraseña");
assert(camposDeCredenciales("Otro").clave && camposDeCredenciales("Otro").usuario && camposDeCredenciales(null).clave, "Otro / sin tipo: los dos campos");
assert(credencialesDelTipo("Otro", { claveActivacion: "  " }).claveActivacion === null, "un campo con solo espacios queda vacío");
assert(errorCredenciales("Clave de activación", {}) === "Falta la clave de activación.", "clave obligatoria en su tipo");
assert(errorCredenciales("Usuario/Contraseña", { usuarioCorreo: "a@b.c" }) === "Faltan el usuario y la contraseña.", "usuario y contraseña obligatorios en su tipo");
assert(errorCredenciales("Usuario/Contraseña", { usuarioCorreo: "a@b.c", contrasena: "1", claveActivacion: "basura" }) === null, "la clave de más no impide guardar (se descarta)");
assert(errorCredenciales("Otro", {}) === null, "Otro: no se exige nada");

assert(nombreLimpio("Bitdefender Internet Security · Usado · 14/04/2026") === "Bitdefender Internet Security", "el nombre no lleva estado ni fecha");
assert(nombreLimpio('"Microsoft 365 Education (PC, Mac)" · Usado · 03/08/2026') === "Microsoft 365 Education (PC, Mac)", "sin comillas");
assert(nombreLimpio("McAfee AntiVirus 1 Year") === "McAfee AntiVirus 1 Year" && nombreLimpio("#ERROR!") === "#ERROR!", "un nombre normal queda igual");

// ─── Pantalla ───────────────────────────────────────────────────────────────
const f = (p: Partial<FilaDigital> & { id: string; numero: number }): FilaDigital => ({
  sku: `DIG-${String(p.numero).padStart(6, "0")}`, producto: "Office", estado: "Usado", ordenCodigo: "", clienteNombre: "",
  documento: "", proveedor: "", usuarioCorreo: "", fechaCompra: "", fechaUso: "", precio: null, ...p,
});
const filas = [
  f({ id: "a", numero: 1, producto: "Bitdefender", ordenCodigo: "OR000400", clienteNombre: "José Núñez", fechaCompra: "2026-04-13", precio: 15 }),
  f({ id: "b", numero: 2, producto: "McAfee", estado: "Disponible", fechaCompra: "2026-11-01", precio: 20 }),
  f({ id: "c", numero: 3, producto: "Microsoft 365 Education (PC, Mac)", ordenCodigo: "OR000517", clienteNombre: "Christopher Conejo", usuarioCorreo: "ji41416@mic-365.com", documento: "REC-000082", fechaCompra: "2026-10-20", precio: 30 }),
];
const c = contarPorEstado(filas);
assert(c[""] === 3 && c["Usado"] === 2 && c["Disponible"] === 1, "conteo por estado para los filtros");
assert(filtrarFilas(filas, "", "or000517")[0]?.id === "c", "busca por número de orden");
assert(filtrarFilas(filas, "", "DIG-000002")[0]?.id === "b", "busca por SKU");
assert(filtrarFilas(filas, "", "jose nunez")[0]?.id === "a", "busca por cliente sin tildes");
assert(filtrarFilas(filas, "", "ji41416")[0]?.id === "c" && filtrarFilas(filas, "", "REC-000082").length === 1, "busca por correo de la cuenta y por documento");
assert(filtrarFilas(filas, "Disponible", "").length === 1, "filtra por estado");
assert(ordenarFilas(filas, "sku", "desc").map((x) => x.id).join() === "c,b,a", "por defecto lo más reciente primero");
assert(ordenarFilas(filas, "compra", "asc").map((x) => x.id).join() === "a,c,b", "ordena por fecha de compra");
assert(ordenarFilas(filas, "orden", "asc").map((x) => x.id).join() === "a,c,b", "sin orden va al final");
assert(ordenarFilas(filas, "precio", "desc")[0].id === "c", "ordena por precio");

if (fallos > 0) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nProductos digitales 5A: todo OK");
