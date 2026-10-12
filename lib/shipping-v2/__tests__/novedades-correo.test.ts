/**
 * Correo al proveedor con botón RESPONDER (punto 8c).
 * Ejecutar: npx tsx lib/shipping-v2/__tests__/novedades-correo.test.ts
 */
import {
  construirCorreoNovedad,
  evaluarEnlace,
  generarTokenEnlace,
  huellaToken,
  proveedorRecibeCorreo,
  TOKEN_ENLACE_REGEX,
  urlEnlaceNovedad,
  venceEnlace,
} from "../novedades-correo";

let fallos = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { fallos++; console.error("✗", msg); } else console.log("✓", msg);
}

const token = generarTokenEnlace();
assert(TOKEN_ENLACE_REGEX.test(token), "El código del enlace tiene el formato esperado (43 caracteres)");
assert(generarTokenEnlace() !== token, "Cada enlace es distinto");
assert(huellaToken(token).length === 64 && huellaToken(token) !== token, "En Airtable se guarda la huella, no el código");

const ahora = new Date("2026-10-11T12:00:00Z");
const vence = venceEnlace(ahora);
assert(vence === "2026-10-18T12:00:00.000Z", "El enlace dura 7 días");
assert(evaluarEnlace({ token, huellaGuardada: huellaToken(token), vence, ahora }).ok, "Enlace correcto y vigente → abre");
assert(!evaluarEnlace({ token, huellaGuardada: huellaToken(token), vence, ahora: new Date("2026-10-18T12:00:01Z") }).ok, "Pasados 7 días → vencido");
assert(!evaluarEnlace({ token, huellaGuardada: "", vence, ahora }).ok, "Si ya respondió (huella borrada) → ya no abre");
assert(!evaluarEnlace({ token: generarTokenEnlace(), huellaGuardada: huellaToken(token), vence, ahora }).ok, "Otro código no abre esta novedad");
assert(!evaluarEnlace({ token: "abc", huellaGuardada: huellaToken("abc"), vence, ahora }).ok, "Un código con formato inválido no se acepta");

assert(proveedorRecibeCorreo({ email: "Affordablesalesebay@gmail.com", permisosPortal: ["Ver novedades", "Responder novedades"] }), "Roberto (correo + permiso) recibe correo");
assert(!proveedorRecibeCorreo({ email: "x@y.com", permisosPortal: ["Ver novedades"] }), "Sin permiso de responder, no");
assert(!proveedorRecibeCorreo({ email: "", permisosPortal: ["Responder novedades"] }), "Sin correo, no");

const url = urlEnlaceNovedad("https://staff.supertiendageek.com/", token);
assert(url === `https://staff.supertiendageek.com/novedad-proveedor/${token}`, "El enlace apunta a la página pública de la novedad");
const correo = construirCorreoNovedad({
  motivo: "nueva", proveedorNombre: "Roberto", novedadId: "NOV-1", sku: "LAP-000100", articulo: "Laptop <script>",
  tipo: "Dañado", descripcion: "Bisagra rota", url, vence, correoRespuesta: "staff@supertiendageek.com",
});
assert(correo.asunto.includes("LAP-000100") && correo.asunto.includes("Dañado"), "Asunto con SKU y tipo");
assert(correo.html.includes("RESPONDER") && correo.html.includes(url), "Lleva el botón RESPONDER con su enlace");
assert(!correo.html.includes("<script>") && correo.html.includes("&lt;script&gt;"), "El texto del artículo va escapado (no inyecta HTML)");
assert(correo.texto.includes(url) && correo.texto.includes("staff@supertiendageek.com"), "Versión de texto con el enlace y el correo de respuesta");
const resp = construirCorreoNovedad({ motivo: "respuesta", proveedorNombre: "Roberto", novedadId: "NOV-1", sku: "LAP-000100", articulo: "Laptop", tipo: "Dañado", descripcion: "", mensaje: "¿Puede enviar otra bisagra?", url, vence, correoRespuesta: "staff@supertiendageek.com" });
assert(resp.asunto.includes("Respuesta") && resp.html.includes("¿Puede enviar otra bisagra?"), "Al contestar, el correo incluye nuestro mensaje");

if (fallos) { console.error(`Fallaron ${fallos}.`); process.exit(1); }
console.log("✅ novedades-correo.test.ts — todos los asserts pasaron");
