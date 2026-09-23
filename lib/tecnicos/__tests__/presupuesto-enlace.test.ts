/**
 * Enlace público de aprobación del presupuesto: un solo enlace por orden que
 * detecta lo agregado, editado o quitado y pide re-aprobar solo eso.
 * Ejecutar: npm test presupuesto-enlace
 */
import fs from "fs";
import {
  construirVista, estadoEnlace, huellaLinea, nuevaVigencia, registrarIntentoFallido, validarEnvio,
  MAX_INTENTOS_CEDULA, TOKEN_REGEX, type DetalleRespondido, type EnvioRespuesta,
} from "../presupuesto/enlace-reglas";
import { conflictoAlternativas, hermanasPropuestas, type LineaPresupuesto } from "../presupuesto/reglas";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const L = (o: Partial<LineaPresupuesto>): LineaPresupuesto => ({
  id: "recL", tipo: "Servicio", descripcion: "Limpieza", cantidad: 1, precioUnitario: 35, estado: "Propuesta", notaCarga: "",
  servicioCatalogoId: "recS", itemId: null, productoCatalogoId: null, cargoServicioId: null, cargoProductoDigitalId: null, operacionId: null,
  bajoPedido: false, proveedorId: "recPROV", urlProveedor: "https://ml.com/x", costoProveedor: 20, tiempoEstimado: "", categoria: "", historial: "",
  aprobadoPor: "", fechaAprobacion: "", creadoPor: "", ...o,
});
const respondida = (l: LineaPresupuesto, valor: "Aprobó" | "No aprobó", huella = huellaLinea(l)) => ({ ...l, respuestaCliente: valor, huellaRespondida: huella });
const visto = (l: LineaPresupuesto, decision: "aprobar" | "no"): DetalleRespondido =>
  ({ lineaId: l.id, descripcion: l.descripcion, cantidad: l.cantidad, precioUnitario: l.precioUnitario, huella: huellaLinea(l), decision });

// ─── Huella ─────────────────────────────────────────────────────────────────
const a = L({ id: "recA" });
assert(huellaLinea(a) === huellaLinea({ ...a, descripcion: "  Limpieza " }), "la huella ignora espacios de más");
assert(huellaLinea(a) !== huellaLinea({ ...a, precioUnitario: 40 }), "cambiar el precio cambia la huella");
assert(huellaLinea(a) !== huellaLinea({ ...a, cantidad: 2 }), "cambiar la cantidad cambia la huella");
assert(huellaLinea(a) !== huellaLinea({ ...a, descripcion: "Limpieza profunda" }), "cambiar la descripción cambia la huella");
assert(huellaLinea(a) === huellaLinea({ ...a, costoProveedor: 99, proveedorId: "recOTRO" } as LineaPresupuesto), "costo/proveedor internos NO cambian la huella");

// ─── Situaciones ────────────────────────────────────────────────────────────
{
  const v = construirVista([L({ id: "recN" })], []);
  assert(v.lineas[0].situacion === "nueva" && v.lineas[0].pendiente, "línea nunca respondida → nueva y pendiente");
  assert(v.pendientes === 1 && v.totalPendiente === 35, "cuenta pendientes y su total");
}
{
  const antes = L({ id: "recM", precioUnitario: 35 });
  const ahora = { ...respondida(antes, "No aprobó"), estado: "Propuesta" as const, precioUnitario: 30 };
  const v = construirVista([ahora], [[visto(antes, "no")]]);
  assert(v.lineas[0].situacion === "modificada", "respondida y luego editada → modificada");
  assert(v.lineas[0].anterior?.precioUnitario === 35, "muestra el precio anterior que vio el cliente");
}
{
  const l = respondida(L({ id: "recR" }), "No aprobó");
  const v = construirVista([l], [[visto(l, "no")]]);
  assert(v.lineas[0].situacion === "repropuesta" && v.lineas[0].pendiente, "dijo no y el taller la reabrió sin cambios → propuesta de nuevo");
}
{
  const l = respondida(L({ id: "recAp", estado: "Aprobada" }), "Aprobó");
  const v = construirVista([l], [[visto(l, "aprobar")]]);
  assert(v.lineas[0].situacion === "aprobada" && v.lineas[0].puedeResponder && !v.lineas[0].pendiente, "aprobada sin efectos → puede cambiar de opinión");
  assert(v.totalAprobado === 35, "suma al total aprobado");
}
{
  const cargada = L({ id: "recC", estado: "Cargada", cargoServicioId: "recCargo" });
  const pedido = L({ id: "recP", estado: "Aprobada", operacionId: "recOP", bajoPedido: true, tipo: "Repuesto" });
  const v = construirVista([cargada, pedido], []);
  assert(v.lineas.every((x) => x.situacion === "en_proceso" && !x.puedeResponder), "cargada o bajo pedido con operación → en proceso, bloqueada");
}
{
  const anulada = L({ id: "recX", estado: "Rechazada", operacionId: "recOP" });
  const noAp = respondida(L({ id: "recNo", estado: "Rechazada" }), "No aprobó");
  const v = construirVista([anulada, noAp], []);
  assert(v.lineas[0].situacion === "anulada" && !v.lineas[0].puedeResponder, "reversa del taller → anulada, bloqueada");
  assert(v.lineas[1].situacion === "no_aprobada" && v.lineas[1].puedeResponder, "no aprobada → puede cambiar a aprobar");
}
{
  const quitada = L({ id: "recQ", descripcion: "Teclado" });
  const v = construirVista([L({ id: "recN" })], [[visto(quitada, "aprobar")]]);
  assert(v.retiradas.length === 1 && v.retiradas[0].descripcion === "Teclado", "línea respondida que ya no existe → retirada por el taller");
}
{
  const l = L({ id: "recB", tipo: "Repuesto", bajoPedido: true, tiempoEstimado: "2 a 3 días" });
  const v = construirVista([l], []);
  const claves = Object.keys(v.lineas[0]);
  assert(!claves.some((k) => /proveedor|costo|url/i.test(k)), "la vista del cliente no incluye proveedor, costo ni URL");
  assert(v.lineas[0].tiempoEstimado === "2 a 3 días", "muestra el tiempo estimado del bajo pedido");
}

// ─── Envío ──────────────────────────────────────────────────────────────────
const n1 = L({ id: "recN1" });
const n2 = L({ id: "recN2", precioUnitario: 10 });
const vista = construirVista([n1, n2], []).lineas;
const base: EnvioRespuesta = {
  decisiones: [
    { lineaId: "recN1", decision: "aprobar", huella: huellaLinea(n1) },
    { lineaId: "recN2", decision: "no", huella: huellaLinea(n2) },
  ],
  nombre: "Carlos Pérez", cedula4: "4567", acepta: true,
};
{
  const r = validarEnvio(vista, base, "1001234567");
  assert(r.ok && r.cambios.length === 2 && r.cedulaVerificada, "envío completo y cédula correcta → ok");
  assert(r.ok && r.cambios.find((c) => c.lineaId === "recN1")?.nuevoEstado === "Aprobada", "aprobar → Aprobada (el técnico la carga)");
  assert(r.ok && r.cambios.find((c) => c.lineaId === "recN2")?.nuevoEstado === "Rechazada", "no aprobar → Rechazada");
}
{
  const r = validarEnvio(vista, { ...base, cedula4: "0000" }, "1001234567");
  assert(!r.ok && r.codigo === "CEDULA", "cédula incorrecta → rechazada");
  const sin = validarEnvio(vista, { ...base, cedula4: "" }, "-");
  assert(sin.ok && !sin.cedulaVerificada, "orden sin cédula → no se pide");
}
assert(!validarEnvio(vista, { ...base, acepta: false }, "").ok, "sin aceptar términos → rechazada");
assert(!validarEnvio(vista, { ...base, nombre: "C" }, "").ok, "sin nombre → rechazada");
{
  const r = validarEnvio(vista, { ...base, decisiones: [base.decisiones[0]] }, "");
  assert(!r.ok && r.codigo === "PENDIENTES", "falta responder una línea pendiente → rechazada");
}
{
  const r = validarEnvio(vista, { ...base, decisiones: [{ ...base.decisiones[0], huella: "vieja" }, base.decisiones[1]] }, "");
  assert(!r.ok && r.codigo === "CAMBIO", "el taller cambió la línea mientras respondía → pide recargar");
}
{
  const enProceso = construirVista([L({ id: "recC", estado: "Cargada", cargoServicioId: "x" })], []).lineas;
  const r = validarEnvio(enProceso, { ...base, decisiones: [{ lineaId: "recC", decision: "no", huella: enProceso[0].huella }] }, "");
  assert(!r.ok && r.codigo === "CAMBIO", "no puede des-aprobar algo ya en proceso");
}
{
  const ap = respondida(L({ id: "recAp", estado: "Aprobada" }), "Aprobó");
  const v = construirVista([ap], []).lineas;
  const igual = validarEnvio(v, { ...base, decisiones: [{ lineaId: "recAp", decision: "aprobar", huella: v[0].huella }] }, "");
  assert(!igual.ok, "reenviar lo mismo no genera cambios");
  const cambia = validarEnvio(v, { ...base, decisiones: [{ lineaId: "recAp", decision: "no", huella: v[0].huella }] }, "");
  assert(cambia.ok && cambia.cambios[0].nuevoEstado === "Rechazada", "cambiar de opinión (aprobada sin efectos → no)");
}

// ─── Vigencia y bloqueo ─────────────────────────────────────────────────────
const ahora = new Date("2026-09-21T12:00:00Z");
assert(estadoEnlace(nuevaVigencia(ahora), "", ahora) === "vigente", "enlace nuevo → vigente 7 días");
assert(estadoEnlace("2026-09-20T12:00:00Z", "", ahora) === "vencido", "pasada la fecha → vencido");
assert(estadoEnlace(nuevaVigencia(ahora), "2026-09-21T12:10:00Z", ahora) === "bloqueado", "con bloqueo activo → bloqueado");
{
  let n = 0; let bloqueo: string | null = null;
  for (let i = 0; i < MAX_INTENTOS_CEDULA; i++) { const r = registrarIntentoFallido(n, ahora); n = r.intentos; bloqueo = r.bloqueadoHasta; }
  assert(!!bloqueo, `${MAX_INTENTOS_CEDULA} intentos fallidos → bloqueo`);
}
assert(TOKEN_REGEX.test("A".repeat(32)) && !TOKEN_REGEX.test("abc' OR 1=1 --xxxxxxxxxxxxxxxxxxx"), "el token se valida antes de usarlo en la fórmula");

// ─── Rutas públicas ─────────────────────────────────────────────────────────
const proxy = fs.readFileSync("proxy.ts", "utf8");
assert(!proxy.includes('"/presupuesto"') && !proxy.includes('"/api/publico'), "las rutas públicas no exigen login");
const api = fs.readFileSync("app/api/publico/presupuesto/[token]/route.ts", "utf8");
assert(!/require\w*Session/.test(api), "la API pública no pide sesión (la protege el token)");
const tallerEnlace = fs.readFileSync("app/api/tecnicos/ordenes/[id]/presupuesto/enlace/route.ts", "utf8");
assert((tallerEnlace.match(/requireTecnicosSession\(\)/g) ?? []).length === 2, "crear/ver el enlace exige sesión de Técnicos");
const enlaceSrv = fs.readFileSync("lib/tecnicos/presupuesto/enlace.ts", "utf8");
assert(!enlaceSrv.includes("aprobarYCargar"), "la respuesta del cliente NO carga a la orden: lo hace el técnico");
assert(enlaceSrv.includes("randomBytes(24)"), "token aleatorio de 24 bytes");

// ─── Prioridad, nota y alternativas (22-sep) ────────────────────────────────
assert(huellaLinea(a) !== huellaLinea({ ...a, prioridad: "Necesaria" }), "cambiar la prioridad pide re-aprobar");
assert(huellaLinea(a) !== huellaLinea({ ...a, notaCliente: "La batería está al 58 %" }), "cambiar la nota pide re-aprobar");
{
  const v = construirVista([L({ id: "recSin" })], []);
  assert(v.lineas[0].prioridad === "Recomendada", "línea sin prioridad cuenta como Recomendada");
}
const orig = L({ id: "recO", tipo: "Repuesto", descripcion: "Pantalla original", precioUnitario: 120, prioridad: "Necesaria", grupoAlternativas: "ALT-1" });
const gen = L({ id: "recG", tipo: "Repuesto", descripcion: "Pantalla genérica", precioUnitario: 80, prioridad: "Recomendada", grupoAlternativas: "ALT-1" });
const bat = L({ id: "recBat", descripcion: "Batería", precioUnitario: 45, prioridad: "Recomendada" });
const nec = L({ id: "recNec", descripcion: "Mainboard", precioUnitario: 150, prioridad: "Necesaria" });
{
  const v = construirVista([orig, gen, bat], []);
  assert(v.grupos.length === 1 && v.grupos[0].prioridad === "Necesaria", "grupo de alternativas con la prioridad más exigente");
  assert(v.lineas.filter((x) => x.grupo).every((x) => x.prioridad === "Necesaria"), "todas las alternativas comparten la prioridad del grupo");
  assert(v.pendientes === 2, "un grupo cuenta como UN punto por responder");
  assert(v.totalPendiente === 125, "pendiente = alternativa más barata (80) + batería (45)");
  assert(v.porPrioridad.Necesaria === 80 && v.porPrioridad.desde.join() === "Necesaria", "Necesario 'desde' $80 mientras no elige");
  const solo = construirVista([L({ id: "recX", grupoAlternativas: "ALT-9" })], []);
  assert(solo.grupos.length === 0 && solo.lineas[0].grupo === "", "un grupo de una sola línea no es alternativa");
}
{
  const vista = construirVista([orig, gen, bat], []).lineas;
  const H = (l: LineaPresupuesto) => vista.find((x) => x.id === l.id)!.huella;
  const envio = (d: Array<[LineaPresupuesto, "aprobar" | "no"]>, extra: Partial<EnvioRespuesta> = {}): EnvioRespuesta =>
    ({ decisiones: d.map(([l, decision]) => ({ lineaId: l.id, decision, huella: H(l) })), nombre: "Carlos Pérez", cedula4: "", acepta: true, ...extra });
  const dos = validarEnvio(vista, envio([[orig, "aprobar"], [gen, "aprobar"], [bat, "no"]]), "");
  assert(!dos.ok && dos.codigo === "ALTERNATIVAS", "no puede aprobar dos alternativas");
  const una = validarEnvio(vista, envio([[orig, "no"], [gen, "aprobar"], [bat, "no"]]), "");
  assert(una.ok && una.necesariasRechazadas.length === 0, "elige la genérica: el grupo necesario queda cubierto");
  const ninguna = validarEnvio(vista, envio([[orig, "no"], [gen, "no"], [bat, "aprobar"]]), "");
  assert(!ninguna.ok && ninguna.codigo === "NECESARIA", "ninguna alternativa de un grupo necesario → debe confirmar que entiende");
  const entiende = validarEnvio(vista, envio([[orig, "no"], [gen, "no"], [bat, "aprobar"]], { entiendeNecesarias: true }), "");
  assert(entiende.ok && entiende.necesariasRechazadas.length === 1, "con la confirmación se acepta y se avisa al taller");
}
{
  const vista = construirVista([nec], []).lineas;
  const r = validarEnvio(vista, { decisiones: [{ lineaId: "recNec", decision: "no", huella: vista[0].huella }], nombre: "Ana López", cedula4: "", acepta: true }, "");
  assert(!r.ok && r.codigo === "NECESARIA", "rechazar una línea necesaria exige confirmación");
  const opcional = construirVista([L({ id: "recOp", prioridad: "Opcional" })], []).lineas;
  const r2 = validarEnvio(opcional, { decisiones: [{ lineaId: "recOp", decision: "no", huella: opcional[0].huella }], nombre: "Ana López", cedula4: "", acepta: true }, "");
  assert(r2.ok, "rechazar algo opcional no pide confirmación");
}
{
  const cargadaOrig = { ...orig, estado: "Cargada" as const, cargoServicioId: "x" };
  const v = construirVista([cargadaOrig, gen], []);
  const g = v.lineas.find((x) => x.id === "recG")!;
  assert(!g.pendiente && !g.puedeResponder && g.decisionActual === "no", "si una alternativa ya está en proceso, la otra queda cerrada");
}
// Taller: no se aprueban dos alternativas a la vez.
assert(conflictoAlternativas([orig, gen, bat], ["recO", "recG"]) !== null, "cargar: dos alternativas juntas → conflicto");
assert(conflictoAlternativas([orig, gen, bat], ["recO", "recBat"]) === null, "cargar: una alternativa + otra línea → ok");
assert(conflictoAlternativas([{ ...gen, estado: "Aprobada" }, orig], ["recO"]) !== null, "cargar: ya hay otra alternativa aprobada → conflicto");
assert(hermanasPropuestas([orig, gen, bat], orig).map((x) => x.id).join() === "recG", "al elegir una, las hermanas propuestas se descartan");

// Regresión 21-sep: el GET de un solo registro con fields[] da 422 en Airtable.
const air = fs.readFileSync("lib/tecnicos/presupuesto/airtable.ts", "utf8");
const bloque = air.slice(air.indexOf("export async function leerRespuestasOrden"), air.indexOf("export async function crearRespuestaFirmada"));
assert(!bloque.includes('"fields[]"'), "leerRespuestasOrden no usa fields[] en el GET de un registro");

if (fallos > 0) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo OK");
