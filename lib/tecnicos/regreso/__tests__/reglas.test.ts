/**
 * Test — orden cerrada y «Regresó el equipo» (rediseño de la orden, R6).
 * Ejecutar: npm test regreso
 */
import {
  esOrdenCerrada, normalizarTipoRegreso, origenesDeLaOrden, revisarCambioDeEstado, revisarRegreso,
  textoQueFallo, textoReapertura, textoRegresoEnAnterior, textoRegresoEnNueva,
} from "../reglas";
import type { OrigenGarantia } from "@/lib/garantias/plazos";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

// Cerradas
assert(esOrdenCerrada("Finalizado Entregado") && esOrdenCerrada("Enviado a Reciclaje"), "entregada y reciclaje están cerradas");
assert(!esOrdenCerrada("Completado") && !esOrdenCerrada("En Proceso") && !esOrdenCerrada(""), "las demás no");

// Cambio de estado
{
  const abierta = revisarCambioDeEstado({ estadoActual: "En Proceso", nuevoEstado: "Completado", esAdmin: false });
  assert(abierta.ok && abierta.reapertura === false, "orden abierta: cualquiera cambia, no es reapertura");

  const tecnico = revisarCambioDeEstado({ estadoActual: "Finalizado Entregado", nuevoEstado: "En Proceso", esAdmin: false, motivo: "me equivoqué de orden" });
  assert(!tecnico.ok && tecnico.status === 403 && /Regresó el equipo/.test(tecnico.error), "un técnico no reabre una entregada: se le indica «Regresó el equipo»");

  const reciclaje = revisarCambioDeEstado({ estadoActual: "Enviado a Reciclaje", nuevoEstado: "Pendiente", esAdmin: false });
  assert(!reciclaje.ok && /administrador/.test(reciclaje.error), "reciclaje: solo un administrador");

  const sinMotivo = revisarCambioDeEstado({ estadoActual: "Finalizado Entregado", nuevoEstado: "En Proceso", esAdmin: true, motivo: " corto " });
  assert(!sinMotivo.ok && sinMotivo.status === 400, "administrador sin motivo suficiente: no");

  const admin = revisarCambioDeEstado({ estadoActual: "Finalizado Entregado", nuevoEstado: "En Proceso", esAdmin: true, motivo: "Se marcó entregada por error" });
  assert(admin.ok && admin.reapertura === true, "administrador con motivo: reabre");

  const igual = revisarCambioDeEstado({ estadoActual: "Finalizado Entregado", nuevoEstado: "Finalizado Entregado", esAdmin: false });
  assert(igual.ok && !igual.reapertura, "mismo estado: no hace nada");

  assert(textoReapertura({ estadoActual: "Finalizado Entregado", nuevoEstado: "En Proceso", motivo: " Se marcó por error ", admin: "Alex" })
    === "Orden reabierta por Alex (Finalizado Entregado → En Proceso): Se marcó por error", "texto de la reapertura");
}

// Regreso
{
  assert(normalizarTipoRegreso("Garantía") === "Garantía" && normalizarTipoRegreso({ name: "Mantenimiento" }) === "Mantenimiento" && normalizarTipoRegreso("otro") === "", "tipos de regreso");

  const noEntregada = revisarRegreso({ estadoActual: "Completado", tipo: "Garantía", motivo: "La pantalla parpadea" });
  assert(!noEntregada.ok && noEntregada.status === 409, "solo desde una orden entregada");

  const sinTipo = revisarRegreso({ estadoActual: "Finalizado Entregado", tipo: "", motivo: "La pantalla parpadea" });
  assert(!sinTipo.ok && sinTipo.status === 400, "pide el tipo");

  const sinMotivo = revisarRegreso({ estadoActual: "Finalizado Entregado", tipo: "Otra falla", motivo: "  " });
  assert(!sinMotivo.ok && sinMotivo.error === "Escribe el motivo de ingreso.", "pide el motivo");

  const bien = revisarRegreso({ estadoActual: "Finalizado Entregado", tipo: "Garantía", motivo: "  La pantalla vuelve a parpadear  " });
  assert(bien.ok && bien.tipo === "Garantía" && bien.motivo === "La pantalla vuelve a parpadear", "regreso válido, motivo limpio");

  assert(textoRegresoEnNueva({ codigoAnterior: "OR000491", tipo: "Garantía", queFallo: "Pantalla 15.6\" FHD (garantía hasta 2027-05-21)" })
    === "Regresó de OR000491 · Garantía: Pantalla 15.6\" FHD (garantía hasta 2027-05-21)", "texto en la orden nueva");
  assert(textoRegresoEnNueva({ codigoAnterior: "OR000491", tipo: "Mantenimiento" }) === "Regresó de OR000491 · Mantenimiento", "sin qué falló");
  assert(textoRegresoEnAnterior({ codigoNueva: "OR000560", tipo: "Otra falla" }) === "Regresó el equipo → OR000560 (Otra falla)", "texto en la orden anterior");
}

// ¿Qué falló? — solo lo de esta orden, vigentes primero
{
  const base = { sku: "", categoria: "", fecha: "2026-11-21", plazo: { dias: 180 } as unknown as OrigenGarantia["plazo"], itemId: null, proveedorId: null };
  const origenes: OrigenGarantia[] = [
    { ...base, clave: "servicio:recSv1@recFacA", tipo: "servicio", nombre: "Reemplazo de backlight", documento: "Factura 001", vence: "2026-12-21", vigente: false },
    { ...base, clave: "articulo:recIt1@recFacA", tipo: "articulo", nombre: "Pantalla 15.6\" FHD", documento: "Factura 001", vence: "2027-05-21", vigente: true },
    { ...base, clave: "articulo:recIt2@recOtra", tipo: "articulo", nombre: "Mouse", documento: "Factura 002", vence: "2027-01-01", vigente: true },
    { ...base, clave: "garantia:recLin1", tipo: "garantia", nombre: "Batería", documento: "Garantía en OR000491", vence: "2027-02-01", vigente: true },
    { ...base, clave: "garantia:recLin2", tipo: "garantia", nombre: "Teclado", documento: "Garantía en OR000300", vence: "2027-02-01", vigente: true },
  ];
  const r = origenesDeLaOrden(origenes, { documentoIds: ["recFacA"], codigoOrden: "OR000491" });
  assert(r.map((g) => g.nombre).join("|") === "Pantalla 15.6\" FHD|Batería|Reemplazo de backlight", "solo lo de la orden y de su documento, vigentes primero");
  assert(textoQueFallo(r[0]) === "Pantalla 15.6\" FHD (garantía hasta 2027-05-21)" && textoQueFallo(r[2]) === "Reemplazo de backlight (garantía vencida el 2026-12-21)", "texto de lo que falló");
}

if (fallos) { console.error(`\n${fallos} prueba(s) fallaron`); process.exit(1); }
console.log("\nTodo bien.");
