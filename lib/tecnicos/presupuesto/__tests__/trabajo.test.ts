/**
 * Test — estado de trabajo por línea (rediseño de la orden, R2).
 * Ejecutar: npm test trabajo
 */
import {
  lineaConTrabajo, normalizarEstadoTrabajo, normalizarMotivoEspera, resumenTrabajos, revisarCambioTrabajo,
  textoActividadTrabajo, trabajoVisible,
} from "../trabajo";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const aprobada = { estado: "Aprobada" as const, bajoPedido: false };
const pedido = { estado: "Aprobada" as const, bajoPedido: true };

// Normalizar
assert(normalizarEstadoTrabajo({ name: "Hecho" }) === "Hecho" && normalizarEstadoTrabajo("Listo") === "", "estados válidos");
assert(normalizarMotivoEspera("Repuesto") === "Repuesto" && normalizarMotivoEspera("x") === "", "motivos válidos");

// Qué líneas tienen avance
assert(lineaConTrabajo({ estado: "Aprobada" }) && lineaConTrabajo({ estado: "Cargada" }), "aprobadas y cargadas tienen avance");
assert(!lineaConTrabajo({ estado: "Propuesta" }) && !lineaConTrabajo({ estado: "Rechazada" }), "propuestas y rechazadas no");

// Lo que se ve
{
  const v = trabajoVisible(aprobada);
  assert(v.estado === "Por hacer" && v.textoCliente === "Pendiente" && !v.automatico && v.tono === "gris", "sin marcar: Por hacer / Pendiente");

  const hecho = trabajoVisible({ ...aprobada, estadoTrabajo: "Hecho" });
  assert(hecho.texto === "Hecho" && hecho.textoCliente === "Listo" && hecho.tono === "verde", "Hecho → el cliente ve Listo");

  const camino = trabajoVisible(pedido, "en_camino");
  assert(camino.estado === "En espera" && camino.motivo === "Repuesto" && camino.automatico && camino.texto === "En espera · repuesto",
    "bajo pedido en camino: En espera · repuesto, solo");
  assert(camino.textoCliente === "Esperando el repuesto · ya viene en camino", "el cliente ve que viene en camino");

  const falta = trabajoVisible(pedido, "falta_pedir");
  assert(falta.automatico && falta.textoCliente === "Esperando el repuesto", "falta pedir: también espera el repuesto");

  const pago = trabajoVisible(pedido, "esperando_pago");
  assert(pago.motivo === "Pago del cliente" && pago.automatico && pago.textoCliente === "Esperando tu pago", "falta el anticipo: espera el pago");

  const llego = trabajoVisible(pedido, "llego");
  assert(llego.estado === "Por hacer" && !llego.automatico, "llegó la pieza: vuelve a Por hacer");

  const manual = trabajoVisible({ ...pedido, estadoTrabajo: "En proceso" }, "en_camino");
  assert(manual.estado === "En proceso" && !manual.automatico, "lo que marca el técnico manda sobre lo automático");

  const novedad = trabajoVisible({ ...aprobada, estadoTrabajo: "En espera", motivoEspera: "Novedad", novedadCliente: " La bisagra derecha está partida. " });
  assert(novedad.texto === "En espera · novedad" && novedad.novedad === "La bisagra derecha está partida." && novedad.textoCliente === "Novedad", "novedad con su frase");
}

// Cambiar
{
  const propuesta = revisarCambioTrabajo({ linea: { estado: "Propuesta" }, estado: "Hecho" });
  assert(!propuesta.ok, "no se marca avance en una línea propuesta");

  const malo = revisarCambioTrabajo({ linea: { estado: "Aprobada" }, estado: "Listo" });
  assert(!malo.ok, "estado inválido");

  const espera = revisarCambioTrabajo({ linea: { estado: "Aprobada" }, estado: "En espera" });
  assert(!espera.ok && espera.error === "Elige por qué espera.", "En espera pide el motivo");

  const sinFrase = revisarCambioTrabajo({ linea: { estado: "Aprobada" }, estado: "En espera", motivo: "Novedad", novedad: "x" });
  assert(!sinFrase.ok, "Novedad pide la frase para el cliente");

  const bien = revisarCambioTrabajo({ linea: { estado: "Cargada" }, estado: "En espera", motivo: "Novedad", novedad: "  Hay que cambiar la bisagra  " });
  assert(bien.ok && bien.cambio.novedadCliente === "Hay que cambiar la bisagra" && bien.cambio.motivoEspera === "Novedad", "Novedad válida");

  const hecho = revisarCambioTrabajo({ linea: { estado: "Aprobada" }, estado: "Hecho", motivo: "Repuesto", novedad: "algo" });
  assert(hecho.ok && hecho.cambio.motivoEspera === "" && hecho.cambio.novedadCliente === "", "Hecho limpia motivo y frase");

  assert(textoActividadTrabajo("Mantenimiento de bisagra", { estadoTrabajo: "Hecho", motivoEspera: "", novedadCliente: "" }) === "Mantenimiento de bisagra → Hecho", "texto en la Actividad");
  assert(textoActividadTrabajo("Bisagra", { estadoTrabajo: "En espera", motivoEspera: "Novedad", novedadCliente: "Está partida" }) === "Bisagra → En espera · novedad: Está partida", "texto con novedad");
}

// Resumen
{
  const r = resumenTrabajos([{ estado: "Hecho" }, { estado: "Hecho" }, { estado: "En espera" }]);
  assert(r.texto === "2 de 3 hechos" && r.enEspera === 1, "2 de 3 hechos");
  assert(resumenTrabajos([{ estado: "Hecho" }]).texto === "1 de 1 hecho" && resumenTrabajos([]).texto === "", "singular y vacío");
}

if (fallos) { console.error(`\n${fallos} prueba(s) fallaron`); process.exit(1); }
console.log("\nTodo bien.");
