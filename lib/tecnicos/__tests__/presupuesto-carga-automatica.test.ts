/**
 * Aprobado = cargado: lo que el cliente aprueba desde el enlace se carga a la
 * orden en la misma respuesta, sin el paso "Cliente aprobó → Cargar".
 * Ejecutar: npm test presupuesto-carga-automatica
 */
import fs from "fs";
import { withLock } from "@/lib/concurrencia";
import { resumirCargaAutomatica, textoCargaAutomatica, type ResultadoCargaResumible } from "../presupuesto/enlace-reglas";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const R = (o: Partial<ResultadoCargaResumible>): ResultadoCargaResumible =>
  ({ descripcion: "Limpieza", cargada: true, accion: { tipo: "crear_servicio" }, ...o });

async function main() {
  // ─── Resumen del resultado ─────────────────────────────────────────────────
  {
    const r = resumirCargaAutomatica([
      R({ descripcion: "Limpieza" }),
      R({ descripcion: "Pantalla 15.6", cargada: false, esperandoPedido: true, accion: { tipo: "crear_pedido_aprobado" } }),
      R({ descripcion: "SSD 512", cargada: false, accion: { tipo: "pendiente", motivo: "REP-1 no tiene unidades libres." } }),
      R({ descripcion: "Office", cargada: false, error: "Otra persona modificó este artículo", accion: { tipo: "asignar_producto_digital" } }),
    ]);
    assert(r.cargadas === 1, "cuenta lo cargado");
    assert(r.esperandoPedido === 1, "bajo pedido aprobado NO es un fallo: espera pedido al proveedor");
    assert(r.sinCargar.length === 2, "cuenta lo que no se pudo cargar");
    assert(r.sinCargar[0].motivo === "REP-1 no tiene unidades libres.", "motivo de un paso pendiente");
    assert(r.sinCargar[1].motivo.startsWith("Otra persona"), "el error real gana sobre el tipo de paso");
  }
  {
    const r = resumirCargaAutomatica([R({ cargada: false, esperandoPedido: true, error: "Airtable 500", accion: { tipo: "crear_pedido_aprobado" } })]);
    assert(r.esperandoPedido === 0 && r.sinCargar.length === 1, "bajo pedido que falló al crear la operación SÍ es un fallo");
  }

  // ─── Texto para el aviso al taller ─────────────────────────────────────────
  assert(textoCargaAutomatica(null, 0) === "", "sin aprobadas no dice nada de carga");
  assert(textoCargaAutomatica(null, 2).includes("Reintentar carga"), "si la carga falló entera, pide reintentar");
  {
    const t = textoCargaAutomatica({ cargadas: 2, esperandoPedido: 0, sinCargar: [] }, 2);
    assert(t.includes("Se cargó a la orden: 2 líneas") && !t.includes("Reintentar"), "todo cargado: no pide reintentar");
    assert(!t.includes("Falta cargar"), "ya no dice 'Falta cargar lo aprobado'");
  }
  {
    const t = textoCargaAutomatica({ cargadas: 0, esperandoPedido: 1, sinCargar: [{ descripcion: "SSD", motivo: "sin stock" }] }, 2);
    assert(t.includes("1 repuesto bajo pedido") && t.includes("SSD (sin stock)") && t.includes("Reintentar carga"), "mezcla: pedido + fallo con motivo");
  }

  // ─── Por qué existe aprobarYCargarSinTurno ─────────────────────────────────
  // withLock NO es reentrante: pedir el mismo turno dentro del turno se queda
  // esperando para siempre. La respuesta del enlace ya tiene el turno de la orden.
  {
    let adentro = false;
    let entroMientrasTeniaElTurno = true;
    await withLock("prueba:reentrante", async () => {
      await Promise.race([
        withLock("prueba:reentrante", async () => { adentro = true; }),
        new Promise((r) => setTimeout(r, 60)),
      ]);
      entroMientrasTeniaElTurno = adentro;
    });
    assert(!entroMientrasTeniaElTurno, "withLock con la misma clave dentro de sí mismo NO entra (no es reentrante)");
  }

  const enlace = fs.readFileSync("lib/tecnicos/presupuesto/enlace.ts", "utf8");
  const cargar = fs.readFileSync("lib/tecnicos/presupuesto/cargar.ts", "utf8");
  const responder = enlace.slice(enlace.indexOf("export async function responderPresupuesto"), enlace.indexOf("async function avisarAlTaller"));
  assert(responder.includes("aprobarYCargarSinTurno("), "la respuesta del enlace carga lo aprobado");
  assert(!/aprobarYCargar\(/.test(responder), "…con la versión SIN turno (la otra se bloquearía)");
  assert(responder.indexOf("crearRespuestaFirmada(") < responder.indexOf("aprobarYCargarSinTurno("), "la constancia firmada se guarda ANTES de cargar");
  const sinTurno = cargar.slice(cargar.indexOf("export async function aprobarYCargarSinTurno"), cargar.indexOf('// ─── "Ya se pidió al proveedor"'));
  assert(sinTurno.length > 0 && !sinTurno.includes("withLock"), "aprobarYCargarSinTurno no pide turno");
  assert(/withLock\(`presupuesto:\$\{opts\.ordenId\}`, \(\) => aprobarYCargarSinTurno\(opts\)\)/.test(cargar), "aprobarYCargar = turno + la misma función");

  if (fallos > 0) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
  console.log("\nTodo OK");
}

void main();
