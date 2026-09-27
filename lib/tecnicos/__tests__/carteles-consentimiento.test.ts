/**
 * Carteles de consentimiento: el cliente no puede aprobar un servicio con
 * cartel sin leerlo y aceptarlo, y lo aceptado queda con el texto exacto.
 * Ejecutar: npm test carteles
 */
import fs from "fs";
import {
  aPublico, alertaAPublica, botonDe, cartelVacio, cartelVisible, faltantesDeConsentimiento,
  huellaCartel, lineas, textoCompletoCartel, validarCartel, CARTEL_BOTON_DEFECTO,
  type AlertaGeneral, type CartelServicio, type RequisitosConsentimiento,
} from "../carteles/reglas";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const cartel = (o: Partial<CartelServicio> = {}): CartelServicio => ({
  ...cartelVacio("recSERV", "Respaldo de información Windows"),
  activo: true,
  titulo: "Antes de aprobar: respaldo de información",
  intro: "",
  incluye: ["Documentos, Imágenes, Escritorio, Música, Videos y Descargas"],
  noIncluye: ["Programas instalados y licencias"],
  avisos: ["Guardamos tu respaldo 7 días después de la entrega"],
  consentimiento: "Autorizo a SUPER GEEK a trabajar en mi equipo y entiendo qué incluye el servicio.",
  ...o,
});

// ─── Texto y validación ─────────────────────────────────────────────────────
assert(lineas("- uno\n\n • dos\n  tres  ").join("|") === "uno|dos|tres", "las viñetas se limpian línea por línea");
assert(botonDe(cartel()) === CARTEL_BOTON_DEFECTO, "sin texto de botón se usa el de fábrica");
assert(botonDe(cartel({ textoBoton: "Acepto" })) === "Acepto", "se respeta el texto del botón");
assert(validarCartel(cartel()) === null, "un cartel completo es válido");
assert(validarCartel(cartel({ titulo: "" })) !== null, "sin título no se puede activar");
assert(validarCartel(cartel({ consentimiento: "corto" })) !== null, "sin consentimiento no se puede activar");
assert(validarCartel(cartel({ incluye: [], noIncluye: [], avisos: [], intro: "" })) !== null, "un cartel sin contenido no se activa");
assert(validarCartel({ ...cartel({ titulo: "" }), activo: false }) === null, "un borrador desactivado se puede guardar igual");
assert(cartelVisible(cartel()) && !cartelVisible(cartel({ activo: false })) && !cartelVisible(undefined),
  "solo un cartel activo y completo se le muestra al cliente");

{
  const t = textoCompletoCartel(cartel());
  assert(t.includes("Qué sí incluye:") && t.includes("Qué no incluye:") && t.includes("Ten en cuenta:"),
    "el texto guardado como constancia lleva las tres secciones");
  assert(t.includes("Autorizo a SUPER GEEK"), "y el consentimiento completo");
}

// Cambiar cualquier parte cambia la huella → el cliente lo vuelve a aceptar.
const base = cartel();
for (const [campo, cambiado] of [
  ["título", cartel({ titulo: "Otro título" })],
  ["incluye", cartel({ incluye: ["Solo Documentos"] })],
  ["no incluye", cartel({ noIncluye: [] })],
  ["avisos", cartel({ avisos: ["Guardamos tu respaldo 30 días"] })],
  ["consentimiento", cartel({ consentimiento: "Autorizo con otras condiciones distintas a las anteriores." })],
  ["botón", cartel({ textoBoton: "De acuerdo" })],
] as Array<[string, CartelServicio]>) {
  assert(huellaCartel(base) !== huellaCartel(cambiado), `cambiar ${campo} obliga a aceptar de nuevo`);
}
assert(huellaCartel(base) === huellaCartel({ ...base, servicioNombre: "otro nombre interno" }),
  "un dato interno que el cliente no ve no invalida la aceptación");

// La vista del cliente no lleva datos internos.
assert(!Object.keys(aPublico(base)).some((k) => /servicio|activo/i.test(k)), "el cartel público no expone datos internos");

// ─── Qué falta para poder enviar ────────────────────────────────────────────
const alerta: AlertaGeneral = { id: "recA1", titulo: "Retiro del equipo", contenido: "Si no retiro mi equipo en 3 meses…", textoCasilla: "", activa: true, orden: 1 };
const req: RequisitosConsentimiento = { porLinea: new Map([["recL1", huellaCartel(base)]]), generales: [alertaAPublica(alerta)] };
const todas = [{ clave: "recL1", huella: huellaCartel(base) }, { clave: `general:${alerta.id}`, huella: alertaAPublica(alerta).huella }];

assert(faltantesDeConsentimiento(["recL1"], req, todas, true).length === 0, "con todo aceptado no falta nada");
{
  const f = faltantesDeConsentimiento(["recL1"], req, [todas[1]], true);
  assert(f.length === 1 && f[0].tipo === "linea", "aprobar un servicio con cartel exige su aceptación");
}
{
  const f = faltantesDeConsentimiento(["recL1"], req, [todas[0]], true);
  assert(f.length === 1 && f[0].tipo === "general", "el aviso de la orden también se acepta");
}
{
  const f = faltantesDeConsentimiento(["recL1"], req, [{ clave: "recL1", huella: "vieja" }, todas[1]], true);
  assert(f.length === 1 && /cambiaron/.test(f[0].motivo), "si el texto cambió mientras respondía, se vuelve a leer");
}
assert(faltantesDeConsentimiento(["recOtra"], req, [], true).length === 1,
  "una línea sin cartel no pide nada, pero el aviso general sí");
assert(faltantesDeConsentimiento([], { porLinea: new Map(), generales: [alertaAPublica(alerta)] }, [], false).length === 0,
  "sin cambios que enviar no se exige nada");

// ─── Dónde vive el texto ────────────────────────────────────────────────────
const reglas = fs.readFileSync("lib/tecnicos/carteles/reglas.ts", "utf8");
assert(!/respaldo de informaci/i.test(reglas) && !/Documentos, Im[aá]genes/i.test(reglas),
  "el texto de los carteles NO está escrito en el código: vive en Airtable");
const ruta = fs.readFileSync("app/api/tecnicos/catalogo/servicios/[id]/cartel/route.ts", "utf8");
assert((ruta.match(/requireTecnicosSession\(\)/g) ?? []).length === 2, "editar y borrar un cartel exige sesión de Técnicos");
const publico = fs.readFileSync("lib/tecnicos/presupuesto/enlace.ts", "utf8");
assert(publico.includes("consentimientos"), "la respuesta firmada guarda los consentimientos aceptados");

if (fallos > 0) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo OK");
