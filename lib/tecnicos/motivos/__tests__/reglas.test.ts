/**
 * Test — motivos de ingreso: buscador, validaciones y revisión con IA (rediseño R7).
 * Ejecutar: npm test motivos
 */
import {
  agregarPalabra, buscarMotivos, dijoElCliente, distancia, empiezaParecido, frecuentes, leerParecido, listaPalabras,
  masParecido, motivoIgual, palabrasDe, pedidoParecido, planUnir, plano, revisarMotivosDeOrden, revisarNombreMotivo, textoMotivos,
  type Motivo,
} from "../reglas";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const m = (id: string, nombre: string, x: Partial<Motivo> = {}): Motivo => ({
  id, nombre, grupo: "Falla", palabras: [], activo: true, nuevo: false, usos: 0, usos90: 0, unidoEn: null, ...x,
});
const cat: Motivo[] = [
  m("recPASTA", "Mantenimiento y pasta térmica", { grupo: "Mantenimiento", palabras: ["limpieza", "pasta termica", "preventivo"], usos: 128, usos90: 30 }),
  m("recNOENC", "No enciende", { palabras: ["no prende", "muerto"], usos: 91, usos90: 25 }),
  m("recPANT", "Pantalla rota o con fallas", { palabras: ["display", "lcd"], usos: 26, usos90: 8 }),
  m("recCAL", "Se calienta", { palabras: ["temperatura", "ventilador"], usos: 21, usos90: 9 }),
  m("recFORM", "Formateo e instalación del sistema", { grupo: "Software", palabras: ["windows"], usos: 67, usos90: 12 }),
  m("recVIEJO", "Cambio de pasta", { activo: false, unidoEn: "recPASTA" }),
];

// ─── Texto ───
assert(plano("Térmica Ñandú") === "termica nandu" && plano("Térmica").length === "Térmica".length, "sin tildes y con el mismo largo (para resaltar)");
assert(palabrasDe("Wi-Fi, ¡no funciona!").join("|") === "wi|fi|no|funciona", "palabras sin signos");
assert(listaPalabras("pasta, Limpieza\nlimpieza; ").join("|") === "pasta|Limpieza", "lista de palabras parecidas sin repetidos");
assert(agregarPalabra(["no prende"], "No Prende").length === 1 && agregarPalabra(["no prende"], "muerto").length === 2, "agregar palabra parecida no repite");
assert(distancia("pnatalla", "pantalla") === 1 && distancia("abc", "abc") === 0, "distancia con transposición");
assert(empiezaParecido("termica", "ter") && empiezaParecido("pantalla", "pnat") && !empiezaParecido("bateria", "pnat"), "inicio de palabra con un error perdonado");

// ─── Buscador ───
{
  const r = buscarMotivos(cat, "pasta ter");
  assert(r[0]?.motivo.id === "recPASTA", "«pasta ter» → Mantenimiento y pasta térmica");
  const nombre = r[0].motivo.nombre;
  assert(r[0].marcas.map(([a, b]) => nombre.slice(a, b)).join("|") === "pasta|tér", "resalta «pasta» y «tér» en el nombre");
  assert(buscarMotivos(cat, "no prende")[0]?.motivo.id === "recNOENC", "palabras parecidas: «no prende» → No enciende");
  assert(buscarMotivos(cat, "pnatalla")[0]?.motivo.id === "recPANT", "un error al escribir: «pnatalla» → Pantalla");
  assert(buscarMotivos(cat, "cambio de pasta").every((x) => x.motivo.activo), "no muestra motivos desactivados");
  assert(buscarMotivos(cat, "zzz").length === 0 && buscarMotivos(cat, "   ").length === 0, "sin coincidencias o vacío → nada");
  assert(buscarMotivos(cat, "no").length >= 1 && buscarMotivos(cat, "no")[0].motivo.id === "recNOENC", "por el nombre primero");
}
assert(motivoIgual(cat, "NO ENCIENDE")?.id === "recNOENC" && motivoIgual(cat, "muerto")?.id === "recNOENC" && motivoIgual(cat, "no enciende bien") === null,
  "igual (sin tildes ni mayúsculas, o una palabra parecida exacta)");
{
  const f = frecuentes(cat, ["recPASTA"], 3).map((x) => x.id);
  assert(f.join(",") === "recNOENC,recFORM,recCAL", "frecuentes: por uso en 90 días, sin los elegidos ni desactivados");
}

assert(masParecido(cat, "No prende el equipo")?.id === "recNOENC", "más parecido aunque no coincidan todas las palabras («prende»)");
assert(masParecido(cat, "el equipo de la") === null && masParecido(cat, "No enciende", "recNOENC") === null, "sin palabras con sentido, o excluyéndose a sí mismo → nada");

// ─── Validaciones ───
assert(!revisarNombreMotivo("ab").ok && !revisarNombreMotivo("x".repeat(61)).ok, "nombre: entre 3 y 60 letras");
{ const r = revisarNombreMotivo("  pin   de carga flojo "); assert(r.ok && r.valor === "Pin de carga flojo", "nombre limpio y con mayúscula inicial"); }
assert(!revisarMotivosDeOrden([], cat).ok, "una orden necesita al menos un motivo");
assert(!revisarMotivosDeOrden(["recVIEJO"], cat).ok, "no se elige un motivo desactivado");
{ const r = revisarMotivosDeOrden(["recNOENC", "recNOENC", "recPANT"], cat); assert(r.ok && r.valor.length === 2, "sin repetidos"); }
assert(textoMotivos(["No enciende", "Se calienta"]) === "No enciende · Se calienta", "texto de los motivos");
assert(dijoElCliente("No enciende · Se calienta", ["No enciende", "Se calienta"]) === "", "si «Ingresa Por» repite los chips, no se muestra");
assert(dijoElCliente("\\-", []) === "" && dijoElCliente("no prende desde ayer", ["No enciende"]) === "no prende desde ayer", "lo que dijo el cliente, sin los «\\-» viejos");

// ─── Unir ───
{
  const r = planUnir(m("recN", "No prende el equipo", { nuevo: true, palabras: ["sin luz"] }), cat[1]);
  assert(r.ok && r.valor.palabras.includes("No prende el equipo") && r.valor.palabras.includes("sin luz") && r.valor.palabras.includes("muerto"),
    "al unir, el nombre y las palabras del que se va quedan como palabras parecidas");
  assert(!planUnir(cat[1], cat[1]).ok && !planUnir(cat[0], cat[5]).ok, "no se une consigo mismo ni con uno desactivado");
}

// ─── IA: ¿es lo mismo? ───
{
  const p = pedidoParecido("no prende el equipo", cat);
  assert(p.includes("id=recNOENC") && !p.includes("recVIEJO") && p.includes("JSON"), "la pregunta lista solo los activos y pide JSON");
  assert(leerParecido({ igual: "recNOENC", grupo: "Falla" }, cat).igual?.id === "recNOENC", "lee el parecido");
  const x = leerParecido({ igual: "recVIEJO", grupo: "Cualquiera" }, cat);
  assert(x.igual === null && x.grupo === null, "ignora ids desactivados o grupos que no existen");
  assert(leerParecido(null, cat).igual === null, "sin respuesta de la IA no hay parecido");
}

if (fallos > 0) { console.error(`\n${fallos} fallo(s).`); process.exit(1); }
console.log("\nTodo bien.");
