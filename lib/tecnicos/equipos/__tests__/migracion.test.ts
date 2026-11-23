/**
 * Test — plan del script de equipos y contraseñas (rediseño R5).
 * Ejecutar: npm test equipos
 */
import { AVISO_CONTRASENA, planMigracionEquipos, totalAcciones, type OrdenVieja } from "../migracion";
import { interpretarEquipo } from "../reglas";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const o = (x: Partial<OrdenVieja> & { id: string; codigo: string }): OrdenVieja =>
  ({ fecha: "2026-01-01", clienteId: "recC1", equipoTexto: "Laptop HP 14-dq1004la SN SCD04450QJ", fichaId: null, notaInterna: "", ...x });

const ordenes = [
  o({ id: "r1", codigo: "OR000100", fecha: "2025-03-01", notaInterna: "PIN: 2008" }),
  o({ id: "r2", codigo: "OR000200", fecha: "2026-02-01", equipoTexto: "Laptop Hp 14-DQ1004LA sn scd04450qj", notaInterna: "Pass 9999. Pitido al encender" }),
  o({ id: "r3", codigo: "OR000300", fecha: "2026-03-01", clienteId: "recC2", equipoTexto: "Impresora Epson L2010", notaInterna: "Equipo sufrió una caída" }),
  o({ id: "r4", codigo: "OR000400", clienteId: null }),
  o({ id: "r5", codigo: "OR000500", fecha: "2026-04-01", clienteId: "recC3", equipoTexto: "Laptop Dell Latitude 5490", fichaId: "recF1", notaInterna: "Clave: 1111" }),
  o({ id: "r6", codigo: "OR000600", clienteId: null, notaInterna: "Contraseña: 7777" }),
];
const fichas = [{ id: "recF1", clienteId: "recC3", datos: interpretarEquipo("Laptop Dell Latitude 5490"), tieneContrasena: false }];

const p = planMigracionEquipos(ordenes, fichas, new Set());
assert(p.crear.length === 2, "dos fichas nuevas: la HP (dos órdenes, misma serie) y la Epson");
const hp = p.crear.find((c) => c.datos.marca === "HP")!;
assert(hp.ordenes.join(",") === "OR000100,OR000200" && hp.contrasena === "9999", "la HP junta sus dos órdenes y guarda la contraseña más reciente");
assert(p.ligar.length === 3 && !p.ligar.some((l) => l.ordenId === "r5"), "se ligan las 3 sin ficha; la que ya tenía no se toca");
assert(p.contrasenasExistentes.length === 1 && p.contrasenasExistentes[0].contrasena === "1111", "la ficha existente sin contraseña recibe la de su nota");
assert(p.saltadas.some((s) => s.codigo === "OR000400" && s.motivo === "sin cliente"), "sin cliente: se salta");
assert(p.saltadas.some((s) => s.codigo === "OR000600") && !p.notas.some((n) => n.ordenId === "r6"), "contraseña sin ficha: la nota se queda donde está");

const notaR2 = p.notas.find((n) => n.ordenId === "r2")!;
assert(notaR2.texto === `Nota interna anterior: Pitido al encender\n${AVISO_CONTRASENA}` && !notaR2.texto.includes("9999"), "la nota pasa a la Actividad SIN la contraseña");
assert(p.notas.find((n) => n.ordenId === "r1")!.texto === `Nota interna anterior: ${AVISO_CONTRASENA}`, "nota que era solo la contraseña: queda el aviso");
assert(p.notas.find((n) => n.ordenId === "r3")!.texto === "Nota interna anterior: Equipo sufrió una caída", "nota sin contraseña: pasa completa");
assert(totalAcciones(p) === 2 + 3 + 1 + 4, "total de acciones");

// Segunda vuelta: todo hecho → 0 acciones
{
  const despues = ordenes.map((x) => (x.id === "r1" || x.id === "r2" ? { ...x, fichaId: "recHP" } : x.id === "r3" ? { ...x, fichaId: "recEP" } : x));
  const fichas2 = [
    { ...fichas[0], tieneContrasena: true },
    { id: "recHP", clienteId: "recC1", datos: interpretarEquipo("Laptop HP 14-dq1004la SN SCD04450QJ"), tieneContrasena: true },
    { id: "recEP", clienteId: "recC2", datos: interpretarEquipo("Impresora Epson L2010"), tieneContrasena: false },
  ];
  const p2 = planMigracionEquipos(despues, fichas2, new Set(["r1", "r2", "r3", "r5"]));
  assert(totalAcciones(p2) === 0, `segunda vuelta en 0 (crear ${p2.crear.length}, ligar ${p2.ligar.length}, claves ${p2.contrasenasExistentes.length}, notas ${p2.notas.length})`);
}

if (fallos) { console.error(`\n${fallos} prueba(s) fallaron`); process.exit(1); }
console.log("\nTodo bien.");
