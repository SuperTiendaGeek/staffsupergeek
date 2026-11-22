/**
 * Test — Asistente de la orden, parte pura (punto 11B · 21-nov-2026).
 * Ejecutar: npm test asistente
 *
 * Reglas del dueño: el asistente lee, resume y redacta, nunca cambia datos;
 * lo que falta para entregar lo dice el sistema (lib/entrega), no la IA;
 * a la IA no le llegan teléfono, cédula ni número de serie.
 */
import fs from "fs";
import {
  diasDesde, esCambioDeEstado, faltaParaEntregar, normalizarResumen, normalizarTecnico, notasDelHistorial,
  pedidoBorrador, pedidoResumen, pedidoTecnico, pidePrecios, textoOrden, textoPlanoTecnico, ultimoCompletado,
  type DatosOrdenIA, type DatosTecnicoIA,
} from "../contexto";
import type { EntradaManual } from "@/lib/manual-tecnico/reglas";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const AHORA = "2026-11-21T15:00:00.000Z";
const orden = (o: Partial<DatosOrdenIA> = {}): DatosOrdenIA => ({
  codigo: "OR000573", estado: "En Proceso", tipoOrden: "Servicio de Reparación", fechaIngreso: "2026-11-15T16:40:00.000Z",
  clienteNombre: "Robalino Cordova", equipo: "Laptop Dell Latitude 7400 ST 4F1N3X2", ingresaPor: "No enciende",
  accesorios: "Cargador", diagnostico: "No disponible", notaInterna: "No disponible",
  historial: [
    { fecha: "2026-11-15T16:41:00.000Z", texto: "Pendiente", autor: "Maritza Moreno" },
    { fecha: "2026-11-20T18:40:00.000Z", texto: "Recomendamos un test de memoria RAM de 72 horas; sospechamos de la batería.", autor: "Maritza Moreno" },
    { fecha: "2026-11-21T14:00:00.000Z", texto: "Completado", autor: "Kevin" },
  ],
  lineas: [
    { descripcion: "Batería Dell 4 celdas", tipo: "Repuesto", estado: "Propuesta", cantidad: 1, precio: 85, respuestaCliente: "", garantia: "", fechaAprobacion: "" },
    { descripcion: "Diagnóstico", tipo: "Servicio", estado: "Cargada", cantidad: 1, precio: 15, respuestaCliente: "Aprobó", garantia: "", fechaAprobacion: "2026-11-16T15:00:00.000Z" },
  ],
  cuenta: { total: 15, pagado: 0, saldo: 15 },
  revisiones: [
    { clave: "pendientes", ok: true, texto: "Nada pendiente" },
    { clave: "cobro", ok: false, texto: "Falta cobrar $15.00" },
    { clave: "documento", ok: false, texto: "Falta emitir la factura o el recibo" },
  ],
  pendientes: [],
  entregadaEl: null,
  ...o,
});

// ── Lo que lee la IA ────────────────────────────────────────────────────────
{
  const t = textoOrden(orden(), AHORA);
  assert(!t.includes("4F1N3X2"), "el número de serie nunca llega a la IA");
  assert(t.includes("Equipo: Laptop Dell Latitude 7400"), "el equipo sí, sin la serie");
  assert(t.includes("hace 5 días"), "cuántos días lleva");
  assert(t.includes("falta cobrar $15.00") && t.includes("no la recalcules"), "la cuenta va calculada por el sistema");
  assert(t.includes("[falta] Falta cobrar $15.00") && t.includes("[falta] Falta emitir"), "lo que falta para entregar viene de la revisión del sistema");
  assert(t.includes("pasó a «Completado»") && t.includes("test de memoria RAM"), "el historial distingue cambios de estado y notas");
  const p = pedidoResumen(orden(), AHORA);
  assert(p.mensaje.includes('"proximoPaso"') && p.mensaje.includes("SUPER GEEK"), "el resumen pide JSON con próximo paso y firma");
  assert(/nunca cambias nada/i.test(p.sistema), "la IA sabe que solo lee, resume y redacta");
}
assert(diasDesde("2026-11-15T16:40:00.000Z", AHORA) === 5 && diasDesde("x", AHORA) === null, "días desde el ingreso");
assert(esCambioDeEstado(" en proceso ") && !esCambioDeEstado("En proceso de revisión del teclado"), "reconoce un cambio de estado");
assert(notasDelHistorial(orden().historial).length === 1, "las notas escritas, sin los cambios de estado");
assert(ultimoCompletado(orden().historial) === "2026-11-21T14:00:00.000Z", "cuándo pasó a Completado");

// ── Falta para entregar ─────────────────────────────────────────────────────
{
  const f = faltaParaEntregar(orden());
  assert(f[0].clave === "presupuesto-propuesto" && f[0].accion === "presupuesto", "primero: el presupuesto sin respuesta, lleva a la tarjeta Presupuesto");
  assert(f.find((x) => x.clave === "cobro")?.accion === "registrar_pago", "falta cobrar → Registrar pago");
  assert(f.find((x) => x.clave === "documento")?.accion === "cuenta", "falta el documento → la tarjeta Cuenta");
  assert(!f.some((x) => x.clave === "pendientes"), "«Nada pendiente» no se repite");
  assert(f[f.length - 1].ok && f[f.length - 1].texto.startsWith("Presupuesto aprobado · 16 nov"), "lo hecho va al final");
  const sobra = faltaParaEntregar(orden({ cuenta: { total: 15, pagado: 20, saldo: -5 }, revisiones: [{ clave: "cobro", ok: false, texto: "Sobran $5.00" }] }));
  assert(sobra.find((x) => x.clave === "cobro")?.accion === "cuenta", "si sobra dinero lleva a la Cuenta (saldo a favor o devolver)");
  const conPend = faltaParaEntregar(orden({ pendientes: [{ texto: "Batería Dell", detalle: "En camino", tipo: "linea" }], revisiones: [{ clave: "pendientes", ok: false, texto: "1 cosa aprobada sin entregar" }] }));
  assert(conPend.filter((x) => x.texto.includes("aprobada sin entregar")).length === 0 && conPend.some((x) => x.texto === "Batería Dell"), "lo pendiente se lista uno por uno");
  const entregada = faltaParaEntregar(orden({ entregadaEl: "2026-11-21T19:27:00.000Z" }));
  assert(entregada.length === 1 && entregada[0].ok && entregada[0].texto.startsWith("Entregada"), "orden entregada: nada falta");
}

// ── Lo que devuelve la IA ───────────────────────────────────────────────────
{
  const r = normalizarResumen({ resumen: "Dell Latitude 7400…", proximoPaso: "Cobrar", antesDeEntregar: null, mensaje: "Hola" }, "");
  assert(r.antesDeEntregar === null && r.mensaje === "Hola", "sin aviso, el aviso queda vacío");
  assert(normalizarResumen({ antesDeEntregar: "null" }, "").antesDeEntregar === null, "«null» escrito como texto también es vacío");
  assert(normalizarResumen(null, "Texto suelto").resumen === "Texto suelto", "si la IA no devolvió JSON, se muestra su texto");
}

// ── Técnico experto ─────────────────────────────────────────────────────────
const probada: EntradaManual = {
  id: "recMT", cod: 12, codigo: "MT-000012", tipo: "Solución", estado: "Verificada", marca: "HP", modelo: "EliteBook 840 G3",
  sistema: "Windows 10 Pro", sintoma: "No funciona ninguna tecla", causa: "Inicio rápido", solucion: "Desmarcar inicio rápido\nReiniciar",
  noFunciono: "Cambiar el teclado", notas: "", claves: "", ordenOrigen: "OR000580", usos: "", vecesFunciono: 3, vecesFallo: 0,
  registradoPor: "Kevin", verificadoPor: "Dueño", fechaVerificacion: "", creado: "",
};
const tec: DatosTecnicoIA = {
  codigo: "OR000598", equipo: "Laptop HP EliteBook 840 G3 SN 5CG7041XYZ", ingresaPor: "El teclado no responde", diagnostico: "",
  notas: [], biblioteca: { probadas: [probada], parecidas: [], relacionadas: [] },
};
{
  const p = pedidoTecnico(tec, [], "¿Qué pruebo ahora?");
  assert(p.mensajes.length === 1 && p.mensajes[0].role === "user", "la primera consulta es un solo mensaje");
  assert(p.mensajes[0].content.includes("PROBADO EN SUPER GEEK") && p.mensajes[0].content.includes("MT-000012"), "lleva lo probado en SUPER GEEK");
  assert(!p.mensajes[0].content.includes("5CG7041XYZ"), "sin número de serie");
  assert(/recomiéndalo PRIMERO/.test(p.sistema), "pide recomendar primero lo probado");
  const p2 = pedidoTecnico(tec, [{ rol: "ia", texto: "suelto" }, { rol: "tecnico", texto: "No enciende el teclado" }, { rol: "ia", texto: "Prueba X" }], "Ya probé X");
  assert(p2.mensajes.map((m) => m.role).join(",") === "user,assistant,user", "turnos alternados; se descarta una respuesta suelta al inicio");
  assert(p2.mensajes[0].content.includes("PROBADO EN SUPER GEEK") && !p2.mensajes[2].content.includes("PROBADO"), "la orden va solo en el primer mensaje");
}
{
  const r = normalizarTecnico({ causas: [{ titulo: "A", detalle: "a" }, { titulo: "" }, 3], pruebas: ["1", "2"], precaucion: "null" }, "");
  assert(r.causas.length === 1 && r.pruebas.length === 2 && r.precaucion === null, "ordena causas, pruebas y precaución");
  assert(normalizarTecnico(null, "texto").respuesta === "texto", "sin JSON muestra el texto");
  assert(textoPlanoTecnico(r).includes("Posibles causas:\n1. A — a"), "texto para copiar o pasar a la nota interna");
}
assert(pidePrecios("Cuánto cobrar") && !pidePrecios("Cómo desarmar"), "solo lleva la lista de precios si preguntan cuánto cobrar");

// ── Borrador del Manual técnico ─────────────────────────────────────────────
{
  const b = pedidoBorrador({ ...orden(), codigo: "OR000580", lineas: orden().lineas, chat: [{ rol: "tecnico", texto: "Era el inicio rápido" }] });
  assert(b.mensaje.includes("Era el inicio rápido") && b.mensaje.includes('"proponer"'), "el borrador lee el historial y el chat con el técnico experto");
  assert(!b.mensaje.includes("4F1N3X2") && !b.mensaje.includes("Robalino"), "el borrador no lleva serie ni nombre del cliente");
  assert(/NO vale la pena/.test(b.sistema), "la IA salta los casos obvios");
}

// ── El servidor usa estas reglas y no cambia datos ──────────────────────────
const ruta = fs.readFileSync("app/api/tecnicos/ordenes/[id]/asistente/route.ts", "utf8");
assert(ruta.includes("leerOrdenParaIA(") && ruta.includes("llamarClaude("), "la ruta del asistente lee la orden y usa el motor único");
assert(!/updateOrden|PATCH|crearRegistro|actualizar/.test(ruta), "la ruta del asistente no escribe nada");
const servidor = fs.readFileSync("lib/asistente/servidor.ts", "utf8");
assert(servidor.includes("revisarEntrega("), "lo que falta para entregar sale de la misma revisión de «Entregar al cliente»");
assert(!/Telefono|Cedula|Cédula|Estado Generado IA/.test(servidor.replace(/\/\/.*$/gm, "")), "el servidor no lee teléfono, cédula ni los mensajes ya generados");

if (fallos > 0) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo OK");
