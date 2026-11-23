/**
 * Test — Actividad de la orden (rediseño de la orden, R3).
 * Ejecutar: npm test actividad
 */
import { deHistorial, dePago, deRespuesta, esEditable, filtrar, novedadesParaCliente, ordenar, revisarNota } from "../reglas";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

// Historial viejo y nuevo
{
  const estado = deHistorial({ id: "rec1", texto: "En Proceso", fecha: "2026-11-05T16:09:00Z", autor: "Kevin" });
  assert(estado.tipo === "Cambio de estado" && estado.texto === "Estado: En Proceso" && estado.visibilidad === "Interna", "una fila vieja con solo el estado = cambio de estado");

  const vieja = deHistorial({ id: "rec2", texto: "Pasta térmica cambiada; 45 °C", fecha: "2026-11-20T16:05:00Z", autor: "Kevin", mensajeIA: " Hola Gustavo… " });
  assert(vieja.tipo === "Nota" && vieja.visibilidad === "Interna" && vieja.mensajeAnterior === "Hola Gustavo…", "una nota vieja pasa como Interna y guarda su mensaje IA anterior");

  const nueva = deHistorial({ id: "rec3", texto: "Estamos esperando el repuesto", fecha: "2026-11-09T12:50:00Z", autor: "Maritza", tipo: { name: "Nota" }, visibilidad: "Al cliente" });
  assert(nueva.visibilidad === "Al cliente" && nueva.tipo === "Nota", "una nota nueva respeta su visibilidad");

  const trabajo = deHistorial({ id: "rec4", texto: "Bisagra → Hecho", fecha: "2026-11-21T10:12:00Z", autor: "Kevin", tipo: "Trabajo" });
  assert(trabajo.tipo === "Trabajo" && !esEditable(trabajo), "lo automático no se edita");
  assert(esEditable(vieja) && esEditable(nueva), "las notas sí");
}

// Pagos y respuestas
{
  const p = dePago({ id: "recA", idAbono: "ABO-000316", fecha: "2026-11-07T09:40:00Z", monto: 160, metodoPago: "Transferencia", estado: "Vigente", registradoPor: "Maritza" });
  assert(p.texto === "Pago $160.00 · Transferencia · ABO-000316" && p.tipo === "Pago" && !p.anulado, "texto del pago");
  const a = dePago({ id: "recB", idAbono: "ABO-1", fecha: "2026-11-08", monto: 10, metodoPago: null, estado: "Anulado" });
  assert(a.anulado === true && a.texto === "Pago $10.00 · ABO-1 · anulado", "pago anulado marcado");

  const r = deRespuesta({ id: "recR", fecha: "2026-11-06T18:20:00Z", nombre: "Gustavo", detalle: [
    { decision: "aprobar", cantidad: 1, precioUnitario: 120 }, { decision: "aprobar", cantidad: 1, precioUnitario: 25 },
    { decision: "aprobar", cantidad: 1, precioUnitario: 15 }, { decision: "no", cantidad: 1, precioUnitario: 40 },
  ] });
  assert(r.texto === "El cliente aprobó 3 líneas · $160.00, no aprobó 1 por el enlace" && r.visibilidad === "Al cliente", "texto de la aprobación del cliente");
}

// Orden y filtros
{
  const e = ordenar([
    deHistorial({ id: "a", texto: "nota", fecha: "2026-11-01T10:00:00Z", autor: "" }),
    dePago({ id: "p", idAbono: null, fecha: "2026-11-03T10:00:00Z", monto: 5, metodoPago: "Efectivo", estado: "Vigente" }),
    deHistorial({ id: "b", texto: "para el cliente", fecha: "2026-11-02T10:00:00Z", autor: "", tipo: "Nota", visibilidad: "Al cliente" }),
    deHistorial({ id: "c", texto: "Te avisamos", fecha: "2026-11-04T10:00:00Z", autor: "", tipo: "Aviso al cliente", visibilidad: "Al cliente" }),
  ]);
  assert(e.map((x) => x.id).join(",") === "c,pago:p,b,a", "más reciente arriba");
  assert(filtrar(e, "Notas").map((x) => x.id).join(",") === "b,a", "filtro Notas");
  assert(filtrar(e, "Pagos").length === 1 && filtrar(e, "Al cliente").map((x) => x.id).join(",") === "c,b", "filtros Pagos y Al cliente");
  assert(novedadesParaCliente(e).map((x) => x.texto).join("|") === "Te avisamos|para el cliente", "el cliente solo ve lo escrito para él");
}

// Nota nueva
assert(!revisarNota({ texto: " ", visibilidad: "Interna" }).ok, "nota vacía no");
assert(!revisarNota({ texto: "hola", visibilidad: "Pública" }).ok, "visibilidad inválida no");
{
  const r = revisarNota({ texto: "  Pasta cambiada  ", visibilidad: "Interna" });
  assert(r.ok && r.texto === "Pasta cambiada", "nota válida y limpia");
}

if (fallos) { console.error(`\n${fallos} prueba(s) fallaron`); process.exit(1); }
console.log("\nTodo bien.");
