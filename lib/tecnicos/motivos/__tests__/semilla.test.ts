/**
 * Test — catálogo inicial de motivos y clasificación de las órdenes viejas (rediseño R7).
 * Casos tomados de los «Ingresa Por» reales del taller (23-nov-2026).
 * Ejecutar: npm test semilla
 */
import { CATALOGO_INICIAL, clasificarIngreso, contieneFrase } from "../semilla";
import { accionesPendientes, idsPorNombre, planMigracionMotivos } from "../migracion";
import { GRUPOS_MOTIVO, plano } from "../reglas";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}
const es = (texto: string, esperado: string[]) => {
  const r = clasificarIngreso(texto);
  assert(r.join(" | ") === esperado.join(" | "), `«${texto}» → ${esperado.join(" · ") || "(nada)"}${r.join(" | ") === esperado.join(" | ") ? "" : ` (salió: ${r.join(" · ")})`}`);
};

// ─── Catálogo ───
assert(CATALOGO_INICIAL.length === 27 && CATALOGO_INICIAL.length < 30, "27 motivos (menos de 30)");
assert(new Set(CATALOGO_INICIAL.map((m) => plano(m.nombre))).size === CATALOGO_INICIAL.length, "sin nombres repetidos");
assert(CATALOGO_INICIAL.every((m) => GRUPOS_MOTIVO.includes(m.grupo) && m.nombre.length <= 60), "cada uno con su grupo y nombre corto");
assert(GRUPOS_MOTIVO.every((g) => CATALOGO_INICIAL.some((m) => m.grupo === g)), "los 4 grupos tienen motivos");

// ─── Frases ───
assert(contieneFrase(" bisagras rotas ", "bisagra") && !contieneFrase(" cabezales tapados ", "tapa") && !contieneFrase(" reduce ", "red"), "palabra completa (con plural)");

// ─── Clasificación (casos reales) ───
es("No enciende", ["No enciende"]);
es("Mantenimiento y cambio de pasta térmica", ["Mantenimiento y pasta térmica"]);
es("Enciende pero no da video", ["Enciende sin imagen"]);
es("No tiene signos de vida. Cliente informa que el equipo se apago y no ha vuelto a encender.", ["No enciende"]);
es("Sistema operativo no carga, posible error de firmware o HDD", ["No arranca el sistema", "Configuración y drivers"]);
es("Limpieza de sistema de tinta y de cabezal", ["Mantenimiento de impresora"]);
es("Cabezales tapados", ["Impresora no imprime"]);
es("Formateo sin respaldo", ["Formateo e instalación del sistema"]);
es("Derrame de liquidos/grasas. No enciende", ["No enciende", "Derrame de líquido"]);
es("Bisagra derecha rota", ["Bisagras o carcasa rotas"]);
es("Revisión general", ["Revisión general"]);
es("Revisión por lentitud e instalación de Microsoft Office y Antivirus", ["Lentitud", "Office, antivirus y programas"]);
es("Pin de carga defectuoso", ["No carga (pin o cargador)"]);
es("Cambio de memoria RAM a 16GB DDR4", ["Mejora de RAM o disco"]);
es("", []);
es(".", []);

// ─── Plan (se puede correr dos veces sin repetir) ───
{
  const ordenes = [
    { id: "rec1", codigo: "OR1", ingresaPor: "No enciende", motivoIds: [] },
    { id: "rec2", codigo: "OR2", ingresaPor: "No enciende", motivoIds: ["recYA"] },
    { id: "rec3", codigo: "OR3", ingresaPor: ".", motivoIds: [] },
  ];
  const p = planMigracionMotivos({ existentes: [{ id: "recNE", nombre: "NO ENCIENDE" }], ordenes });
  assert(p.crear.length === 26 && !p.crear.some((m) => m.nombre === "No enciende"), "no crea los que ya existen (sin tildes ni mayúsculas)");
  assert(p.ligar.length === 1 && p.ligar[0].codigo === "OR1" && p.yaTenian === 1 && p.sinMotivo.length === 1, "solo liga órdenes sin motivos; las vacías quedan aparte");
  assert(idsPorNombre(["No enciende", "Inventado"], [{ id: "recNE", nombre: "No enciende" }]).join() === "recNE", "ids por nombre (ignora los que no existen)");
  const fin = planMigracionMotivos({
    existentes: CATALOGO_INICIAL.map((m, i) => ({ id: `rec${i}`, nombre: m.nombre })),
    ordenes: ordenes.map((o) => ({ ...o, motivoIds: o.codigo === "OR3" ? [] : ["recX"] })),
  });
  assert(accionesPendientes(fin) === 0, "después de aplicar, la vista previa da 0 acciones");
}

if (fallos > 0) { console.error(`\n${fallos} fallo(s).`); process.exit(1); }
console.log("\nTodo bien.");
