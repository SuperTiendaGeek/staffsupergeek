// Contrato del ciclo de vida de una novedad.
// Ejecutar: npx tsx lib/shipping-v2/__tests__/novedades.test.ts

import {
  appendEntradaHilo,
  construirHiloNovedad,
  esNovedadBloqueante,
  getEstadoInicialNovedad,
  getNovedadBucket,
  getShippingV2NovedadAccionesDisponibles,
  getSolucionesDisponibles,
  getTurnoNovedad,
  isNovedadAbierta,
  isNovedadCerrada,
  normalizarEstadoNovedad,
  SHIPPING_V2_NOVEDAD_ESTADOS,
  SHIPPING_V2_NOVEDAD_TRANSICIONES,
  validarTransicionNovedad,
} from "../novedades";

let fallos = 0;

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

// ─── Estados finales: el bug que arrastraba el módulo ────────────────────────
//
// isOpenNovedadStatus() solo reconocía "resuelta/cancelada/cerrada" exactas, así
// que "Rechazada" y "Cerrada sin respuesta" contaban como ABIERTAS para siempre:
// bloqueaban el cierre de ciclo del packing y la disponibilidad del artículo.

assert(isNovedadCerrada("Cerrada"), "Cerrada es final");
assert(isNovedadCerrada("Rechazada"), "Rechazada es final (antes contaba como abierta)");
assert(isNovedadCerrada("Cerrada sin respuesta"), "Cerrada sin respuesta es final (antes contaba como abierta)");

assert(isNovedadAbierta("Abierta"), "Abierta sigue abierta");
assert(isNovedadAbierta("Enviada a proveedor"), "Enviada a proveedor sigue abierta");
assert(isNovedadAbierta("Escalada"), "Escalada sigue abierta: alguien tiene que hacer algo");
assert(isNovedadAbierta("En solución"), "En solución sigue abierta hasta que se cumpla");

// Fail-closed: un estado que Airtable traiga y no reconozcamos cuenta como abierto.
assert(isNovedadAbierta("Estado inventado"), "Un estado desconocido se trata como abierto, nunca como cerrado");
assert(normalizarEstadoNovedad("Estado inventado") === null, "Un estado desconocido no se normaliza");
assert(normalizarEstadoNovedad("en revision interna") === "En revisión interna", "Tolera minúsculas y falta de tilde");

for (const estado of SHIPPING_V2_NOVEDAD_ESTADOS) {
  assert(normalizarEstadoNovedad(estado) === estado, `"${estado}" se reconoce tal cual viene de Airtable`);
}

// ─── Nace encaminada ─────────────────────────────────────────────────────────

assert(getEstadoInicialNovedad("Proveedor") === "Enviada a proveedor", "Una novedad del proveedor nace ya en su cancha");
assert(getEstadoInicialNovedad("SUPER GEEK") === "Abierta", "Una novedad nuestra nace Abierta");
assert(getEstadoInicialNovedad(undefined) === "Abierta", "Sin responsable, se asume que la resolvemos nosotros");

// ─── Soluciones según quién resuelve ─────────────────────────────────────────

const solucionesProveedor = getSolucionesDisponibles("Proveedor");
assert(solucionesProveedor.includes("Reemplazo"), "El proveedor puede ofrecer un reemplazo");
assert(solucionesProveedor.includes("Reembolso"), "El proveedor puede ofrecer un reembolso");
assert(!solucionesProveedor.includes("Va a despiece"), "El despiece no es algo que ofrezca el proveedor");

const solucionesInternas = getSolucionesDisponibles("SUPER GEEK");
assert(solucionesInternas.includes("Va a despiece"), "Nosotros sí podemos mandarlo a despiece");
assert(solucionesInternas.includes("Se vende con descuento"), "Nosotros podemos venderlo con descuento");
assert(!solucionesInternas.includes("Reembolso"), "No nos reembolsamos a nosotros mismos");

// ─── Pestañas y turno ────────────────────────────────────────────────────────

assert(getNovedadBucket({ estado: "Abierta", responsable: "SUPER GEEK" }) === "nuestras", "Abierta nuestra va a Las resolvemos nosotros");
assert(getNovedadBucket({ estado: "Enviada a proveedor", responsable: "Proveedor" }) === "con-proveedor", "Enviada va a Con el proveedor");
assert(getNovedadBucket({ estado: "Respondida por proveedor", responsable: "Proveedor" }) === "con-proveedor", "Respondida sigue en Con el proveedor");
assert(getNovedadBucket({ estado: "En solución" }) === "en-solucion", "En solución tiene su propia pestaña");
assert(getNovedadBucket({ estado: "Rechazada" }) === "cerradas", "Rechazada va a Cerradas");

assert(getTurnoNovedad({ estado: "Enviada a proveedor", responsable: "Proveedor" }) === "proveedor", "Enviada: la pelota está en el proveedor");
assert(getTurnoNovedad({ estado: "Respondida por proveedor", responsable: "Proveedor" }) === "nosotros", "Respondida: nos toca aceptar o rechazar");
assert(getTurnoNovedad({ estado: "Abierta", responsable: "SUPER GEEK" }) === "nosotros", "Una novedad nuestra siempre es nuestro turno");
assert(getTurnoNovedad({ estado: "Cerrada" }) === "nadie", "Una novedad cerrada no espera a nadie");

// ─── Qué bloquea la venta ────────────────────────────────────────────────────

assert(esNovedadBloqueante({ tipo: "Dañado", estado: "Abierta" }), "Una novedad de daño abierta bloquea la venta");
assert(esNovedadBloqueante({ tipo: "Faltante", estado: "Enviada a proveedor" }), "Un faltante en manos del proveedor sigue bloqueando");
assert(!esNovedadBloqueante({ tipo: "Dañado", estado: "Cerrada" }), "Una novedad cerrada deja de bloquear");
assert(!esNovedadBloqueante({ tipo: "Observación menor", estado: "Abierta" }), "Una observación menor NO bloquea: se vende con observación");
assert(!esNovedadBloqueante({ tipo: "Dañado", estado: "Rechazada" }), "Una novedad anulada deja de bloquear el artículo");

// ─── Acciones: solo las que corresponden ─────────────────────────────────────

const nuestraAbierta = getShippingV2NovedadAccionesDisponibles({ estado: "Abierta", responsable: "SUPER GEEK" });
assert(nuestraAbierta.some((t) => t.accion === "resolver"), "En una novedad nuestra se puede definir la resolución");
assert(
  !nuestraAbierta.some((t) => t.accion === "cerrar"),
  "Cerrar ya no se ofrece desde Abierta: para eso está resolver con 'ya está hecho'"
);
assert(!nuestraAbierta.some((t) => t.accion === "responder"), "No se registra respuesta del proveedor en una novedad nuestra");
assert(!nuestraAbierta.some((t) => t.accion === "anular"), "Anular no se ofrece a staff normal");

const delProveedor = getShippingV2NovedadAccionesDisponibles({ estado: "Enviada a proveedor", responsable: "Proveedor" });
assert(delProveedor.some((t) => t.accion === "responder"), "Se puede registrar lo que respondió el proveedor");
assert(!delProveedor.some((t) => t.accion === "resolver"), "No definimos resolución interna en una novedad del proveedor");

const respondida = getShippingV2NovedadAccionesDisponibles({ estado: "Respondida por proveedor", responsable: "Proveedor" });
assert(respondida.some((t) => t.accion === "aceptar-propuesta"), "Podemos aceptar la propuesta");
assert(respondida.some((t) => t.accion === "rechazar-propuesta"), "Podemos rechazarla");

const cerrada = getShippingV2NovedadAccionesDisponibles({ estado: "Cerrada", isSiteAdmin: true });
assert(cerrada.length === 1 && cerrada[0].accion === "reabrir", "Una novedad cerrada solo admite reabrir, y solo admin");
assert(getShippingV2NovedadAccionesDisponibles({ estado: "Cerrada" }).length === 0, "El staff normal no toca una novedad cerrada");
assert(getShippingV2NovedadAccionesDisponibles({ estado: "Estado inventado" }).length === 0, "Un estado desconocido no ofrece acciones");

// Los botones que sobraban ya no existen.
const ACCIONES = SHIPPING_V2_NOVEDAD_TRANSICIONES.map((t) => t.accion);
assert(!ACCIONES.includes("escalar" as never), "Ya no existe Escalar: no hay instancia superior a SUPER GEEK y el proveedor");
assert(!ACCIONES.includes("revisar" as never), "Ya no existe Tomar para revisión: la novedad nace encaminada");
assert(!ACCIONES.includes("enviar-proveedor" as never), "Ya no existe Enviar al proveedor: nace ya en su cancha");

// ─── Validación antes de escribir ────────────────────────────────────────────

const sinRespuesta = validarTransicionNovedad({ estadoActual: "Enviada a proveedor", responsable: "Proveedor", accion: "responder" });
assert(!sinRespuesta.ok, "Registrar respuesta sin texto se rechaza");

const respuestaOk = validarTransicionNovedad({
  estadoActual: "Enviada a proveedor",
  responsable: "Proveedor",
  accion: "responder",
  valores: { respuesta: "Envío batería nueva en el próximo packing." },
  solucion: "Reemplazo",
});
assert(respuestaOk.ok, "Con texto y solución sí se registra la respuesta");

const solucionCruzada = validarTransicionNovedad({
  estadoActual: "Enviada a proveedor",
  responsable: "Proveedor",
  accion: "responder",
  valores: { respuesta: "Lo mandamos a despiece." },
  solucion: "Va a despiece",
});
assert(!solucionCruzada.ok, "El proveedor no puede proponer una solución que es nuestra");

const internaConSolucionProveedor = validarTransicionNovedad({
  estadoActual: "Abierta",
  responsable: "SUPER GEEK",
  accion: "resolver",
  valores: { descripcionSolucion: "Se vende con descuento." },
  solucion: "Reembolso",
});
assert(!internaConSolucionProveedor.ok, "En una novedad nuestra no se puede elegir una solución del proveedor");

const internaOk = validarTransicionNovedad({
  estadoActual: "Abierta",
  responsable: "SUPER GEEK",
  accion: "resolver",
  valores: { descripcionSolucion: "Webcam no enciende: se vende con $30 de descuento." },
  solucion: "Se vende con descuento",
});
assert(internaOk.ok, "Una resolución interna válida pasa");
assert(internaOk.ok && internaOk.estadoDestino === "En solución", "Sin marcar 'ya está hecho', queda esperando que se cumpla");

// ─── Cierre directo: no preguntar dos veces lo mismo ─────────────────────────
//
// "Se vende con descuento" ya está decidido y hecho: no hay nada que esperar.
// Obligar a pasar por "En solución" y volver a escribir cómo quedó resuelta era
// pedir la misma información dos veces.

const resolverYCerrar = validarTransicionNovedad({
  estadoActual: "Abierta",
  responsable: "SUPER GEEK",
  accion: "resolver",
  valores: { descripcionSolucion: "Se aplica $30 de descuento y observación en la ficha." },
  solucion: "Se vende con descuento",
  cerrarDirecto: true,
});
assert(resolverYCerrar.ok, "Se puede resolver y cerrar en un solo paso");
assert(resolverYCerrar.ok && resolverYCerrar.estadoDestino === "Cerrada", "Con 'ya está hecho' va directo a Cerrada");

const aceptarYCerrar = validarTransicionNovedad({
  estadoActual: "Respondida por proveedor",
  responsable: "Proveedor",
  accion: "aceptar-propuesta",
  cerrarDirecto: true,
});
assert(aceptarYCerrar.ok && aceptarYCerrar.estadoDestino === "Cerrada", "Aceptar una propuesta ya cumplida cierra de una vez");

const aceptarPendiente = validarTransicionNovedad({
  estadoActual: "Respondida por proveedor",
  responsable: "Proveedor",
  accion: "aceptar-propuesta",
});
assert(
  aceptarPendiente.ok && aceptarPendiente.estadoDestino === "En solución",
  "Si el reemplazo todavía no llega, queda esperando que se cumpla"
);

const cerrarSinDescripcion = validarTransicionNovedad({
  estadoActual: "En solución",
  responsable: "SUPER GEEK",
  accion: "cerrar",
});
assert(cerrarSinDescripcion.ok, "Marcar como cumplida NO vuelve a pedir la descripción: ya se registró al acordarla");

assert(
  !validarTransicionNovedad({ estadoActual: "Abierta", responsable: "SUPER GEEK", accion: "cerrar" }).ok,
  "No se cierra saltándose la resolución: para eso está resolver con 'ya está hecho'"
);

assert(
  !validarTransicionNovedad({
    estadoActual: "Enviada a proveedor",
    responsable: "Proveedor",
    accion: "responder",
    valores: { respuesta: "x" },
    solucion: "Reemplazo",
    cerrarDirecto: true,
  }).ok,
  "Registrar la respuesta del proveedor no puede cerrar la novedad de golpe"
);

const resolverEnNovedadDeProveedor = validarTransicionNovedad({
  estadoActual: "Enviada a proveedor",
  responsable: "Proveedor",
  accion: "resolver",
  valores: { descripcionSolucion: "x" },
  solucion: "Va a despiece",
});
assert(!resolverEnNovedadDeProveedor.ok, "No se define resolución interna en una novedad del proveedor");

const anularSinAdmin = validarTransicionNovedad({
  estadoActual: "Abierta",
  responsable: "SUPER GEEK",
  accion: "anular",
  valores: { motivo: "Error de registro." },
});
assert(!anularSinAdmin.ok, "Anular sin ser administrador se rechaza");

const reabrirProveedor = validarTransicionNovedad({
  estadoActual: "Cerrada",
  responsable: "Proveedor",
  accion: "reabrir",
  isSiteAdmin: true,
  valores: { motivo: "El reemplazo nunca llegó." },
});
assert(reabrirProveedor.ok, "El administrador puede reabrir");
assert(
  reabrirProveedor.ok && reabrirProveedor.estadoDestino === "Enviada a proveedor",
  "Al reabrir, una novedad del proveedor vuelve a SU cancha, no a la nuestra"
);

const reabrirInterna = validarTransicionNovedad({
  estadoActual: "Cerrada",
  responsable: "SUPER GEEK",
  accion: "reabrir",
  isSiteAdmin: true,
  valores: { motivo: "Apareció información nueva." },
});
assert(reabrirInterna.ok && reabrirInterna.estadoDestino === "Abierta", "Al reabrir, una novedad nuestra vuelve a Abierta");

assert(!validarTransicionNovedad({ estadoActual: "Abierta", accion: "inventada" }).ok, "Una acción que no existe se rechaza");
assert(!validarTransicionNovedad({ estadoActual: "Estado raro", accion: "cerrar" }).ok, "Un estado desconocido no deja escribir nada");

// ─── El hilo de conversación ─────────────────────────────────────────────────
//
// Rechazar una propuesta y recibir otra NO debe borrar lo anterior.

const primera = appendEntradaHilo(undefined, "3R Technology-USA", "Ofrezco 10% de descuento.", "2026-09-15T10:00:00.000Z");
const segunda = appendEntradaHilo(primera, "3R Technology-USA", "Está bien, envío el reemplazo.", "2026-09-17T09:00:00.000Z");
assert(segunda.includes("10% de descuento"), "La primera respuesta sobrevive a la segunda");
assert(segunda.includes("envío el reemplazo"), "La segunda respuesta también está");

const hilo = construirHiloNovedad({
  descripcion: "Batería hinchada, no mantiene carga.",
  registradoPor: "Técnico",
  fechaRegistro: "2026-09-15T08:00:00.000Z",
  mensajeProveedor: appendEntradaHilo(undefined, "Alexis", "Rechazamos la propuesta. El descuento no cubre el costo.", "2026-09-16T12:00:00.000Z"),
  respuestaProveedor: segunda,
});
assert(hilo.length === 4, "El hilo junta el registro inicial, lo nuestro y lo del proveedor");
assert(hilo[0].texto.includes("Batería hinchada"), "El hilo abre con el registro del técnico");
assert(hilo[0].lado === "super-geek", "El registro inicial es de nuestro lado");
assert(hilo[1].texto.includes("10% de descuento") && hilo[1].lado === "proveedor", "Segunda entrada: la primera oferta del proveedor");
assert(hilo[2].texto.includes("Rechazamos") && hilo[2].lado === "super-geek", "Tercera: nuestro rechazo");
assert(hilo[3].texto.includes("envío el reemplazo"), "Cuarta: la nueva propuesta, en orden cronológico");

const hiloVacio = construirHiloNovedad({});
assert(hiloVacio.length === 0, "Una novedad sin nada no revienta el hilo");

const hiloLegacy = construirHiloNovedad({ respuestaProveedor: "Texto viejo escrito a mano sin fecha" });
assert(hiloLegacy.length === 1 && hiloLegacy[0].lado === "proveedor", "Un texto viejo sin formato se muestra igual, no se pierde");

// Toda transición declarada debe salir de algún estado y llegar a uno válido.
for (const transicion of SHIPPING_V2_NOVEDAD_TRANSICIONES) {
  assert(transicion.desde.length > 0, `"${transicion.label}" declara desde qué estados aplica`);
  assert(
    (SHIPPING_V2_NOVEDAD_ESTADOS as readonly string[]).includes(transicion.hacia),
    `"${transicion.label}" lleva a un estado que existe en Airtable`
  );
}

if (fallos > 0) {
  console.error(`Fallaron ${fallos} comprobaciones.`);
  process.exit(1);
}

console.log("✅ novedades.test.ts — todos los asserts pasaron");
