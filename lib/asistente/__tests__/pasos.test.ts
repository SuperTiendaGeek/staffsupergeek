/**
 * Test — «Sugerir pasos» del técnico experto (rediseño R7, tablero 9).
 * Ejecutar: npm test pasos
 */
import { readFileSync } from "node:fs";
import {
  agruparInventario, busquedaInventario, guiasDeFuentes, nombreCoincide, normalizarPasos, pedidoPasos, textoPlanoPasos,
} from "../pasos";
import { debeProponerMantenimiento } from "@/lib/tecnicos/motivos/reglas";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const datos = {
  codigo: "OR000536", equipo: "Laptop HP 14-dq1004la SN SCD04450QJ", ingresaPor: "No enciende · Bisagras o carcasa rotas",
  diagnostico: "", notas: [], biblioteca: { probadas: [], parecidas: [], relacionadas: [] },
};

// ─── Pedido ───
{
  const p = pedidoPasos(datos, ["No enciende", "Bisagras o carcasa rotas"]);
  assert(p.mensaje.includes("MOTIVOS DE INGRESO (chips): No enciende · Bisagras o carcasa rotas") && p.mensaje.includes('"buscar"'), "el pedido lleva los chips y pide JSON con «buscar»");
  assert(!p.mensaje.includes("SCD04450QJ"), "la serie del equipo no le llega a la IA");
  assert(pedidoPasos(datos, []).mensaje.includes("sin chips"), "orden vieja sin chips: usa el motivo de ingreso");
}

// ─── Respuesta ───
{
  const n = normalizarPasos({ titulo: "Cambio de palmrest", pasos: ["a", "b", "c", "d", "e", "f", "g", "h"], cuidado: "null", tiempo: "1 h 30 min", buscar: ["pasta térmica", "x", "y", "z"] });
  assert(n.pasos.length === 7 && n.cuidado === null && n.buscar.length === 3, "máximo 7 pasos y 3 búsquedas; «null» no es un cuidado");
  assert(normalizarPasos(null).pasos.length === 0, "sin JSON no hay pasos (la ruta avisa el error)");
}

// ─── Guías: solo páginas citadas de sitios de confianza ───
{
  const g = guiasDeFuentes([
    { url: "https://support.hp.com/manual-14", titulo: "Manual de servicio HP 14" },
    { url: "https://www.youtube.com/watch?v=1", titulo: "Video" },
    { url: "https://www.ifixit.com/Guide/HP-14", titulo: "Desarme HP 14-dq" },
    { url: "https://support.hp.com/manual-14", titulo: "repetida" },
    { url: "https://www.dell.com/a", titulo: "Dell" },
    { url: "https://www.lenovo.com/b", titulo: "Lenovo" },
  ]);
  assert(g.length === 3 && g[0].dominio === "ifixit.com" && !g.some((x) => x.dominio.includes("youtube")), "iFixit primero, sin sitios fuera de la lista, sin repetidas, máximo 3");
}

// ─── Inventario: SKU real, sin ofrecer el repuesto de otro modelo ───
{
  const b = busquedaInventario("batería HP 14-dq");
  assert(b?.palabra === "bater" && b.todas.join(" ") === "bateria hp 14 dq", "busca un trozo sin tildes y exige todas las palabras");
  assert(!!b && nombreCoincide("Batería HP 14-dq1004la original", b.todas) && !nombreCoincide("Batería Lenovo T480", b.todas), "solo la batería de ese modelo");
  assert(busquedaInventario("pasta térmica")?.palabra === "pasta", "«pasta térmica» → busca «pasta»");
  const inv = agruparInventario([
    { sku: "REP-000135", nombre: "Pasta térmica", precioVentaFinal: 5 },
    { sku: "REP-000135", nombre: "Pasta térmica", precioVentaFinal: 5 },
    { sku: "REP-000187", nombre: "Bisagras HP 14", precioVentaFinal: 15 },
    { sku: "", nombre: "Sin SKU", precioVentaFinal: null },
  ]);
  assert(inv.length === 2 && inv[0].unidades === 2, "agrupa las unidades por SKU");
  const t = textoPlanoPasos({ titulo: "Cambio de palmrest", pasos: ["Desconectar la batería"], cuidado: "Flex del teclado", tiempo: "1 h", guias: [], repuestos: inv });
  assert(t.startsWith("Pasos sugeridos · Cambio de palmrest") && t.includes("REP-000135") && t.includes("Cuidado: Flex del teclado"), "texto para la nota interna");
}

// ─── Próximo mantenimiento al entregar ───
assert(debeProponerMantenimiento([{ grupo: "Falla" }, { grupo: "Mantenimiento" }], ""), "con un motivo de Mantenimiento y sin fecha → propone la etiqueta");
assert(!debeProponerMantenimiento([{ grupo: "Mantenimiento" }], "2027-05-23") && !debeProponerMantenimiento([{ grupo: "Falla" }], ""), "si ya tiene fecha o no es mantenimiento → no");

// ─── Fuentes ───
const panel = readFileSync("components/asistente/AsistentePanel.tsx", "utf8");
assert(panel.includes('body: JSON.stringify({ modo: "pasos" })') && !panel.includes("¿Qué pruebo primero?"), "«Sugerir pasos» con botón; ya no consulta sola al abrir");
assert(panel.includes("textoPlanoPasos(r)"), "«Guardar como nota interna» va a la Actividad");
const ruta = readFileSync("app/api/tecnicos/ordenes/[id]/asistente/route.ts", "utf8");
assert(ruta.includes("guiasDeFuentes(r.fuentes)") && ruta.includes("repuestosParaPasos(n.buscar)"), "guías citadas y repuestos buscados en el inventario (no inventados)");
const pantalla = readFileSync("app/tecnicos/ordenes/[id]/OrdenDetalleClient.tsx", "utf8");
assert(/onEntregada[\s\S]*debeProponerMantenimiento\(motivosOrden, orden\.proximoMantenimiento\)[\s\S]{0,60}setShowMantenimientoModal\(true\)/.test(pantalla), "al entregar un mantenimiento se abre la etiqueta del próximo");
const selector = readFileSync("components/tecnicos/motivos/MotivosSelector.tsx", "utf8");
assert(selector.includes("const lleno = valor.length >= MAXIMO") && selector.includes("disabled={deshabilitado || lleno}"), "el límite de 8 motivos se respeta al elegir");
assert(!/\[[^\]\n\s]*:[^\]\n\s]*\]/.test(readFileSync("lib/asistente/pasos.ts", "utf8")), "lib/asistente/pasos.ts no tiene corchetes con «:» (rompen el CSS)");

if (fallos > 0) { console.error(`\n${fallos} fallo(s).`); process.exit(1); }
console.log("\nTodo bien.");
