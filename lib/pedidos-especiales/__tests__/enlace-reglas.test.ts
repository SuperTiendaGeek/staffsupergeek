/**
 * Test — enlace del cliente para su pedido especial (punto 10A-3).
 * Ejecutar: npm test enlace-reglas
 */
import {
  confirmacionPorPago, construirVistaCliente, detalleEleccion, elegidasDeOpcion, eleccionVigente, errorEleccion,
  huellaLineaCliente, leerEleccion, mensajeComprobante, mensajeConsulta, type EleccionCliente, type LineaCliente,
} from "../enlace-reglas";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

// Camila: dos monitores (elige uno) + cable que se suma.
const LG: LineaCliente = { id: "recLG", descripcion: "Monitor LG 27\" 4K", cantidad: 1, precioUnitario: 420, estado: "Propuesta", grupoAlternativas: "pedido", tiempoEstimado: "12–15 días" };
const DELL: LineaCliente = { id: "recDELL", descripcion: "Monitor Dell 27\" 4K", cantidad: 1, precioUnitario: 390, estado: "Propuesta", grupoAlternativas: "pedido" };
const CABLE: LineaCliente = { id: "recCABLE", descripcion: "Cable USB-C 2 m", cantidad: 1, precioUnitario: 20, estado: "Propuesta" };
const LINEAS = [LG, DELL, CABLE];
const HUELLAS = Object.fromEntries(LINEAS.map((l) => [l.id, huellaLineaCliente(l)]));
const AHORA = new Date("2026-11-12T15:00:00Z");
const VENCE = "2026-11-13T23:00:00Z"; // viernes 13-nov, 18:00 Ecuador

// 1. Huella: cambia si cambia lo que el cliente ve
assert(huellaLineaCliente(LG) === huellaLineaCliente({ ...LG }), "huella estable");
assert(huellaLineaCliente(LG) !== huellaLineaCliente({ ...LG, precioUnitario: 430 }), "otro precio → otra huella");
assert(huellaLineaCliente(LG) !== huellaLineaCliente({ ...LG, cantidad: 2 }), "otra cantidad → otra huella");

// 2. Qué queda elegido al tocar una opción
const e1 = elegidasDeOpcion(LINEAS, "recLG");
assert(e1.ok && e1.elegidas.join(",") === "recLG,recCABLE", "opción 1 + lo que se suma");
assert(!elegidasDeOpcion(LINEAS, null).ok, "con dos alternativas hay que elegir una");
assert(!elegidasDeOpcion(LINEAS, "recCABLE").ok, "lo que se suma no es una opción");
const solo = elegidasDeOpcion([LG, CABLE], null);
assert(solo.ok && solo.elegidas.join(",") === "recLG,recCABLE", "una sola alternativa: se elige sola");
const sinAlt = elegidasDeOpcion([CABLE], null);
assert(sinAlt.ok && sinAlt.elegidas.join(",") === "recCABLE", "sin alternativas: se elige lo que hay");

// 3. Validación de la elección
const base = { estado: "Esperando al cliente", vence: VENCE, lineas: LINEAS, opcionId: "recLG", huellasVistas: HUELLAS, ahora: AHORA };
assert(errorEleccion(base) === null, "elección válida");
assert(errorEleccion({ ...base, estado: "Cotizando" })?.codigo === "NO_LISTA", "cotizando: aún no lista");
assert(errorEleccion({ ...base, estado: "Aceptado" })?.codigo === "CERRADO", "aceptado: ya confirmado");
assert(errorEleccion({ ...base, estado: "Cancelado" })?.codigo === "CERRADO", "cancelado");
assert(errorEleccion({ ...base, ahora: new Date("2026-11-14T00:00:00Z") })?.codigo === "VENCIDA", "vencida");
assert(errorEleccion({ ...base, lineas: [{ ...LG, precioUnitario: 450 }, DELL, CABLE] })?.codigo === "CAMBIO", "el empleado cambió el precio mientras el cliente miraba");
assert(errorEleccion({ ...base, opcionId: null })?.codigo === "OPCION", "sin opción");

// 4. Elección guardada → leída → vigente
const det = detalleEleccion(LINEAS, ["recLG", "recCABLE"]);
assert(det.total === 440 && det.paraConfirmar === 220, "detalle: total $440, para confirmar $220");
const leida = leerEleccion("2026-11-12T15:05:00Z", JSON.stringify(det));
assert(!!leida && leida.elegidas.join(",") === "recLG,recCABLE", "se lee la elección guardada");
assert(leerEleccion("x", JSON.stringify({ version: 2, lineas: [] })) === null, "una respuesta de orden no es elección");
assert(leerEleccion("x", "no-json") === null, "detalle ilegible → null");
const elecs: EleccionCliente[] = [leida!];
assert(eleccionVigente(elecs, LINEAS) !== null, "elección vigente");
assert(eleccionVigente(elecs, [{ ...LG, precioUnitario: 400 }, DELL, CABLE]) === null, "cambió el precio de lo elegido → hay que volver a elegir");
assert(eleccionVigente(elecs, [{ ...LG, estado: "Rechazada" }, DELL, CABLE]) === null, "lo elegido ya no está propuesto");
const MOUSE: LineaCliente = { id: "recMOUSE", descripcion: "Mouse", cantidad: 1, precioUnitario: 15, estado: "Propuesta" };
assert(eleccionVigente(elecs, [...LINEAS, MOUSE]) === null, "se agregó algo que se suma → volver a elegir");
const vieja: EleccionCliente = { fecha: "2026-11-12T14:00:00Z", elegidas: ["recDELL", "recCABLE"], huellas: { recDELL: HUELLAS.recDELL, recCABLE: HUELLAS.recCABLE } };
assert(eleccionVigente([vieja, leida!], LINEAS)?.elegidas[0] === "recLG", "vale la elección más reciente");

// 5. ¿El pago confirma el pedido?
assert(confirmacionPorPago({ estado: "Esperando al cliente", eleccion: leida, lineas: LINEAS, pagado: 219.99 }) === null, "$219.99 no alcanza los $220");
const conf = confirmacionPorPago({ estado: "Esperando al cliente", eleccion: leida, lineas: LINEAS, pagado: 220 });
assert(!!conf && conf.total === 440 && conf.elegidas.length === 2, "$220 confirma: LG + cable");
assert(confirmacionPorPago({ estado: "Esperando al cliente", eleccion: null, lineas: LINEAS, pagado: 500 }) === null, "sin elección no se confirma solo (el empleado usa Aceptar en tienda)");
assert(confirmacionPorPago({ estado: "Aceptado", eleccion: leida, lineas: LINEAS, pagado: 500 }) === null, "ya aceptado: nada");
const chico = detalleEleccion([CABLE], ["recCABLE"]);
assert(confirmacionPorPago({ estado: "Esperando al cliente", eleccion: leerEleccion("t", JSON.stringify(chico)), lineas: [CABLE], pagado: 20 }) !== null, "hasta $100 se confirma con el pago completo");

// 6. Vista del cliente
const vbase = { codigo: "OP-2026-000142", clienteNombre: "Camila Rivas Pérez", estado: "Esperando al cliente", vence: VENCE, lineas: LINEAS, elecciones: [] as EleccionCliente[], pagado: 0, ahora: AHORA };
const v = construirVistaCliente(vbase);
assert(v.fase === "cotizacion" && v.nombre === "Camila", "cotización para Camila");
assert(v.opciones.length === 2 && v.opciones[0].total === 440 && v.opciones[0].paraConfirmar === 220 && v.opciones[1].total === 410, "cada opción con el cable incluido y lo que se paga para confirmar");
assert(v.extras.length === 1 && v.extras[0].subtotal === 20, "el cable aparece aparte");
assert(v.textoVence === "viernes 13-nov, 18:00", "vence en hora de Ecuador");
assert(Object.keys(v.huellas).length === 3, "huellas de lo que ve");
assert(construirVistaCliente({ ...vbase, estado: "Cotizando" }).fase === "preparando", "cotizando → preparando");
assert(construirVistaCliente({ ...vbase, ahora: new Date("2026-11-14T00:00:00Z") }).fase === "vencida", "vencida sin elección");
const vp = construirVistaCliente({ ...vbase, elecciones: elecs, pagado: 50 });
assert(vp.fase === "por_pagar" && vp.elegido?.opcionId === "recLG" && vp.elegido.total === 440, "eligió la opción 1: por pagar");
assert(vp.pago.paraConfirmar === 220 && vp.pago.faltaParaConfirmar === 170, "pagó $50: faltan $170 para confirmar");
assert(construirVistaCliente({ ...vbase, elecciones: elecs, ahora: new Date("2026-11-20T00:00:00Z") }).fase === "por_pagar", "eligió a tiempo: se respeta aunque después venza");
const vc = construirVistaCliente({ ...vbase, estado: "Aceptado", lineas: [{ ...LG, estado: "Cargada" }, { ...DELL, estado: "Rechazada" }, { ...CABLE, estado: "Aprobada" }], pagado: 220 });
assert(vc.fase === "confirmado" && vc.elegido?.total === 440 && vc.pago.faltaTotal === 220, "confirmado: lo aceptado y lo que falta al retirar");
assert(construirVistaCliente({ ...vbase, estado: "Cancelado" }).fase === "cancelado", "cancelado");
assert(construirVistaCliente({ ...vbase, estado: "Entregado" }).fase === "entregado", "entregado");
assert(construirVistaCliente({ ...vbase, estado: "Requerimiento" }).fase === "preparando", "estado viejo Requerimiento → preparando");

// 7. Mensajes a la tienda
assert(mensajeConsulta({ nombre: "Camila", codigo: "OP-2026-000142", producto: "Monitor LG" }) === "Hola, soy Camila. Mi pedido es el N° OP-2026-000142 (Monitor LG). Tengo una consulta: ", "consulta prellenada");
assert(mensajeComprobante({ nombre: "Camila", codigo: "OP-2026-000142", monto: 220 }) === "Hola, soy Camila. Te envío el comprobante de pago de mi pedido N° OP-2026-000142 por $220.", "comprobante prellenado");

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo OK");
