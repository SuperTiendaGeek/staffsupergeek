/**
 * Test — Actividad de la orden (rediseño de la orden, R3).
 * Ejecutar: npm test actividad
 */
import { deHistorial, dePago, deRespuesta, esEditable, filtrar, leerEnviadoPor, lineaParaAvisar, novedadesParaCliente, ordenar, revisarMensaje, revisarNota, textoEnviadoPor } from "../reglas";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

// Historial viejo y nuevo
{
  const estado = deHistorial({ id: "rec1", texto: "En Proceso", fecha: "2026-11-05T16:09:00Z", autor: "Kevin" });
  assert(estado.tipo === "Cambio de estado" && estado.texto === "Estado: En Proceso" && estado.visibilidad === "Interna", "una fila vieja con solo el estado = cambio de estado");

  const vieja = deHistorial({ id: "rec2", texto: "Pasta térmica cambiada; 45 °C", fecha: "2026-11-20T16:05:00Z", autor: "Kevin", mensajeIA: " Hola Gustavo… " });
  assert(vieja.tipo === "Nota" && vieja.visibilidad === "Interna" && vieja.mensaje?.texto === "Hola Gustavo…" && vieja.mensaje.enviado === null, "una nota vieja pasa como Interna y trae su mensaje de la IA anterior (sin enviar)");
  assert(vieja.puedeMensaje === true && estado.puedeMensaje === true, "notas y cambios de estado pueden convertirse en mensaje");

  const nueva = deHistorial({ id: "rec3", texto: "Estamos esperando el repuesto", fecha: "2026-11-09T12:50:00Z", autor: "Maritza", tipo: { name: "Nota" }, visibilidad: "Al cliente" });
  assert(nueva.visibilidad === "Al cliente" && nueva.tipo === "Nota", "una nota nueva respeta su visibilidad");

  const trabajo = deHistorial({ id: "rec4", texto: "Bisagra → Hecho", fecha: "2026-11-21T10:12:00Z", autor: "Kevin", tipo: "Trabajo" });
  assert(trabajo.tipo === "Trabajo" && !esEditable(trabajo), "lo automático no se edita");
  assert(esEditable(vieja) && esEditable(nueva), "las notas sí");
}

// Actividad v2 (24-nov): el mensaje vive en su línea
{
  const enviada = deHistorial({ id: "rec9", texto: "Batería en camino", fecha: "2026-11-24T13:55:00Z", autor: "Alexis",
    tipo: "Nota", mensajeIA: "Hola, Robalino.\n\nSU EQUIPO…", mensajeEnviado: "2026-11-24T13:57:00Z", mensajeEnviadoPor: "Alexis Bolaños · WhatsApp" });
  assert(enviada.mensaje?.enviado === "2026-11-24T13:57:00Z" && enviada.mensaje.enviadoPor === "Alexis Bolaños · WhatsApp", "el mensaje sabe cuándo y quién lo envió");
  const pago = dePago({ id: "recP", idAbono: "A", fecha: "2026-11-23", monto: 1, metodoPago: null, estado: "Vigente" });
  const aviso = deHistorial({ id: "recAv", texto: "Hola", fecha: "2026-11-23", autor: "M", tipo: "Aviso al cliente", visibilidad: "Al cliente" });
  const resp = deHistorial({ id: "recRs", texto: "Enrique toma la orden", fecha: "2026-11-23", autor: "E", tipo: "Responsable" });
  assert(!pago.puedeMensaje && !aviso.puedeMensaje && !resp.puedeMensaje, "pagos, avisos ya enviados y cambios de responsable no llevan «Crear mensaje»");
  assert(filtrar([enviada, pago], "Al cliente").length === 1, "«Al cliente» muestra las líneas con mensaje");

  const nov = novedadesParaCliente([enviada, deHistorial({ id: "recX", texto: "nota interna", fecha: "2026-11-24T14:00:00Z", autor: "A", tipo: "Nota", mensajeIA: "borrador sin enviar" })]);
  assert(nov.length === 1 && nov[0].texto.startsWith("Hola, Robalino.") && nov[0].fecha === "2026-11-24T13:57:00Z", "el enlace del cliente ve solo el mensaje enviado (no la nota interna ni el borrador)");

  assert(textoEnviadoPor("Maritza Moreno", "Copiado") === "Maritza Moreno · Copiado", "quién y cómo");
  const p = leerEnviadoPor("Maritza Moreno · Copiado");
  assert(p?.nombre === "Maritza" && p.via === "Copiado" && leerEnviadoPor("")?.via === undefined, "se lee el primer nombre y la vía");
  assert(revisarMensaje("  ").ok === false && revisarMensaje("Hola\r\nqué tal").ok === true, "el mensaje no puede ir vacío");

  const completado = deHistorial({ id: "recC", texto: "Completado", fecha: "2026-11-25T16:00:00Z", autor: "E" });
  const notaVieja = deHistorial({ id: "recN", texto: "Listo", fecha: "2026-11-25T15:00:00Z", autor: "E", tipo: "Nota" });
  assert(lineaParaAvisar([notaVieja, completado, pago], "Completado") === "recC", "«Avisar al cliente» con la orden Completado: el mensaje nace en «Estado: Completado»");
  assert(lineaParaAvisar([notaVieja, pago], "En Proceso") === "recN", "si no, en la línea más reciente que pueda tener mensaje");
  assert(lineaParaAvisar([pago], "En Proceso") === null, "sin líneas posibles: no hay dónde");
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
