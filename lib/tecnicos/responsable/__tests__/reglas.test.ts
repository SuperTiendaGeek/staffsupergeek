/**
 * Test — responsable de la orden y «Presupuesto enviado» (rediseño R1).
 * Ejecutar: npm test responsable
 */
import { iniciales, opcionesResponsable, primerNombre, revisarAsignacion, textoAsignacion } from "../reglas";
import { esMedioEnvio, tocaConstancia } from "@/lib/tecnicos/presupuesto/enviado";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const u = (x: Partial<{ id: string; nombre: string; email: string; rol: string; appsPermitidas: string[]; activo: boolean }>) => ({
  id: "rec1", nombre: "Kevin Vaca", email: "k@sg.ec", rol: "Tecnico", appsPermitidas: ["tecnicos"], activo: true, ...x,
});

assert(iniciales("Kevin Vaca") === "KV" && iniciales("Maritza") === "MA" && iniciales("  ") === "?", "iniciales: dos palabras, una palabra o nada");
assert(primerNombre("Maritza López") === "Maritza", "la cabecera muestra solo el primer nombre");

{
  const ops = opcionesResponsable([
    u({ id: "recZ", nombre: "Zoila Pérez" }),
    u({ id: "recA", nombre: "Ana Ruiz" }),
    u({ id: "recI", nombre: "Inactivo", activo: false }),
    u({ id: "recF", nombre: "Finanzas", appsPermitidas: ["finanzas"] }),
    u({ id: "recD", nombre: "Dueño", rol: "Administrador", appsPermitidas: [] }),
    u({ id: "recE", nombre: "", email: "sin-nombre@sg.ec" }),
  ]);
  assert(ops.map((o) => o.id).join(",") === "recA,recD,recE,recZ", "solo activos de Técnicos o administradores, en orden alfabético");
  assert(ops.find((o) => o.id === "recE")?.nombre === "sin-nombre@sg.ec", "sin nombre se muestra el correo");

  assert(revisarAsignacion({ usuarioId: "recA" }, ops).ok, "asignar a alguien de la lista");
  const nul = revisarAsignacion({ usuarioId: null }, ops);
  assert(nul.ok && nul.usuarioId === null, "null deja la orden sin responsable");
  assert(!revisarAsignacion({ usuarioId: "recI" }, ops).ok, "no se asigna a una persona inactiva");
  assert(!revisarAsignacion({}, ops).ok && !revisarAsignacion(null, ops).ok, "sin usuarioId no se hace nada");

  const ana = ops[0];
  assert(textoAsignacion({ id: "recA", nombre: "Ana Ruiz" }, ana) === "Ana Ruiz toma la orden", "tomarla uno mismo");
  assert(textoAsignacion({ id: "recD", nombre: "Dueño" }, ana) === "Dueño asigna la orden a Ana Ruiz", "asignarla a otra persona");
  assert(textoAsignacion({ id: "recD", nombre: "Dueño" }, null) === "Dueño deja la orden sin responsable", "quitar el responsable");
}

{
  const ahora = new Date("2026-11-22T20:00:00Z");
  assert(tocaConstancia(null, ahora), "primer envío: queda constancia en la Actividad");
  assert(!tocaConstancia("2026-11-22T19:30:00Z", ahora), "copiar otra vez dentro de la hora no repite la constancia");
  assert(tocaConstancia("2026-11-22T18:30:00Z", ahora), "más de una hora después sí");
  assert(esMedioEnvio("copiado") && esMedioEnvio("whatsapp") && !esMedioEnvio("correo"), "solo copiado o WhatsApp");
}

if (fallos > 0) { console.error(`\n${fallos} fallo(s).`); process.exit(1); }
console.log("\nTodo bien.");
