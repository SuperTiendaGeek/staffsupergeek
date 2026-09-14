// Contrato del ciclo de vida de packings Shipping V2.
// Los escenarios salen de los 17 packings reales de la base, no de ejemplos
// inventados: son exactamente los casos que hacían ilegible la lista.
//
// Ejecutar: npx tsx lib/shipping-v2/__tests__/packing-lifecycle.test.ts

import {
  calculateShippingV2PackingReviewProgress,
  formatShippingV2PackingReviewProgress,
  getShippingV2PackingFaseInfo,
  getShippingV2PackingTopPendingStep,
  getShippingV2PackingWorkHint,
} from "../packing-lifecycle";

let fallos = 0;

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

// ─── Fases y etiquetas ───────────────────────────────────────────────────────

assert(getShippingV2PackingFaseInfo("En Proceso").fase === "preparacion", "En Proceso es fase Preparación");
assert(getShippingV2PackingFaseInfo("Cerrado").fase === "preparacion", "Cerrado (armado) sigue siendo Preparación, no cierre de ciclo");
assert(getShippingV2PackingFaseInfo("Cerrado").estadoLabel === "Armado · listo para enviar", "Cerrado se muestra como Armado para no confundir con el cierre final");
assert(getShippingV2PackingFaseInfo("En tránsito").fase === "en-camino", "En tránsito es fase En camino");
assert(getShippingV2PackingFaseInfo("Recibido").fase === "en-bodega", "Recibido es fase En bodega");
assert(getShippingV2PackingFaseInfo("Recibido").estadoLabel === "Recibido · falta revisar", "Recibido dice explícitamente que falta revisar");
assert(getShippingV2PackingFaseInfo("En revisión").fase === "revision", "En revisión es fase Revisión");
assert(getShippingV2PackingFaseInfo("Cerrado final").estadoLabel === "Ciclo cerrado", "Cerrado final se muestra como Ciclo cerrado");
assert(getShippingV2PackingFaseInfo("Cerrado final").terminado === true, "Ciclo cerrado cuenta como terminado");
assert(getShippingV2PackingFaseInfo("Recibido").terminado === false, "Recibido NO cuenta como terminado");
assert(getShippingV2PackingFaseInfo("En revisión").terminado === false, "En revisión NO cuenta como terminado");
assert(getShippingV2PackingFaseInfo("en transito").fase === "en-camino", "Tolera estado sin tilde y en minúscula");
assert(getShippingV2PackingFaseInfo("").fase === "desconocida", "Estado vacío no revienta: queda como desconocida");

// ─── Avance del ciclo por packing ───────────────────────────────────────────
//
// El criterio de artículo completo vive en reception-checklist.ts y tiene su
// propio test. Aquí solo se comprueba la agregación por packing.

const itemCompleto = {
  estado: "Disponible",
  recibido: true,
  revisadoFisicamente: true,
  fotosTomadas: true,
  shopifyPublicado: true,
  marketplacePublicado: true,
  mercadoLibrePublicado: true,
  gruposFacebookPublicado: true,
};
const sinRecibido = { ...itemCompleto, recibido: false };
const sinPublicar = {
  estado: "En revisión",
  recibido: true,
  revisadoFisicamente: true,
  fotosTomadas: true,
};
// Grupos Facebook es opcional, así que no marcarlo no deja nada pendiente.
const sinGruposFacebook = { ...itemCompleto, gruposFacebookPublicado: false };
const repuesto = { estado: "Repuesto", esRepuesto: true, recibido: true, revisadoFisicamente: true, fotosTomadas: true };

const pkTodoListo = calculateShippingV2PackingReviewProgress(Array.from({ length: 7 }, () => itemCompleto));
assert(pkTodoListo.completo && pkTodoListo.revisados === 7, "7 artículos completos → packing al 100%");
assert(formatShippingV2PackingReviewProgress(pkTodoListo) === "7/7 completos", "Formato legible del avance");
assert(pkTodoListo.porcentaje === 100, "Porcentaje 100 cuando todo está completo");

// Caso real PK-20260610-47604: todo hecho salvo la casilla Recibido, que se
// agregó después de procesar ese packing.
const pk47604 = calculateShippingV2PackingReviewProgress(Array.from({ length: 10 }, () => sinRecibido));
assert(pk47604.revisados === 0 && pk47604.pendientes === 10, "PK-20260610-47604: 0/10 mientras falte Recibido");
assert(pk47604.pendientesPorPaso.recibido === 10, "El desglose señala que a los 10 les falta Recibido");
assert(pk47604.pendientesDeBodega === 10, "Los 10 tienen pendiente trabajo de bodega");

const topPaso = getShippingV2PackingTopPendingStep(pk47604);
assert(topPaso?.key === "recibido" && topPaso.cantidad === 10, "El paso que más falta es Recibido en 10 artículos");
assert(getShippingV2PackingTopPendingStep(pkTodoListo) === null, "Sin pendientes no hay paso destacado");

// Packing mixto: un repuesto sin publicaciones cierra igual; uno vendible no.
const pkMixto = calculateShippingV2PackingReviewProgress([itemCompleto, repuesto, sinPublicar]);
assert(pkMixto.revisados === 2, "El repuesto cuenta como completo aunque no tenga publicaciones");
assert(pkMixto.pendientes === 1, "El artículo vendible sin publicar queda pendiente");
assert(pkMixto.sinPublicacionAplicable === 1, "Se reporta cuántos artículos no llevan publicación");
assert(pkMixto.pendientesDeBodega === 0, "Al que falta no le falta bodega, le faltan publicaciones");

const pkSinGruposFacebook = calculateShippingV2PackingReviewProgress(Array.from({ length: 5 }, () => sinGruposFacebook));
assert(pkSinGruposFacebook.completo, "Un packing sin Grupos Facebook cierra su ciclo igual");

assert(calculateShippingV2PackingReviewProgress([]).total === 0, "Packing sin artículos no revienta");
assert(!calculateShippingV2PackingReviewProgress([]).completo, "Packing sin artículos nunca se da por completo");

// ─── Qué falta: una línea accionable ─────────────────────────────────────────

const hintListo = getShippingV2PackingWorkHint({ estado: "En revisión", progress: pkTodoListo, novedadesAbiertas: 0 });
assert(hintListo.listoParaCerrarCiclo, "Todo revisado y sin novedades → listo para cerrar ciclo");
assert(hintListo.tono === "listo", "El tono de listo para cerrar es positivo");

const hintNovedad = getShippingV2PackingWorkHint({ estado: "En revisión", progress: pkTodoListo, novedadesAbiertas: 2 });
assert(!hintNovedad.listoParaCerrarCiclo, "Con novedades abiertas no se ofrece cerrar el ciclo");
assert(hintNovedad.texto.includes("2"), "El aviso dice cuántas novedades hay que resolver");

const hintPendiente = getShippingV2PackingWorkHint({ estado: "En revisión", progress: pk47604, novedadesAbiertas: 0 });
assert(hintPendiente.texto.includes("10"), "El aviso dice cuántos artículos faltan por completar");
assert(hintPendiente.texto.includes("Recibido"), "El aviso nombra el paso que más falta");
assert(!hintPendiente.listoParaCerrarCiclo, "Con artículos pendientes no se ofrece cerrar el ciclo");

const hintRecibidoTerminado = getShippingV2PackingWorkHint({ estado: "Recibido", progress: pkTodoListo, novedadesAbiertas: 0 });
assert(
  hintRecibidoTerminado.listoParaCerrarCiclo,
  "Un packing en Recibido con todo ya revisado se marca como listo para cerrar ciclo"
);

const hintCerrado = getShippingV2PackingWorkHint({
  estado: "Cerrado final",
  progress: pkTodoListo,
  novedadesAbiertas: 0,
});
assert(hintCerrado.texto.includes("Solo queda vender"), "Un packing cerrado dice explícitamente que no hay trabajo de bodega");

const hintTransito = getShippingV2PackingWorkHint({
  estado: "En tránsito",
  progress: calculateShippingV2PackingReviewProgress([]),
  novedadesAbiertas: 0,
});
assert(hintTransito.tono === "espera", "Un packing en tránsito no pide acción: está en espera");

const hintSinItems = getShippingV2PackingWorkHint({
  estado: "Recibido",
  progress: calculateShippingV2PackingReviewProgress([]),
  novedadesAbiertas: 0,
});
assert(hintSinItems.tono === "alerta", "Un packing recibido sin artículos vinculados se señala como anomalía");

if (fallos > 0) {
  console.error(`Fallaron ${fallos} comprobaciones.`);
  process.exit(1);
}

console.log("✅ packing-lifecycle.test.ts — todos los asserts pasaron");
