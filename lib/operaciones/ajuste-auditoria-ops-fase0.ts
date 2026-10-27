/**
 * Ajuste de datos de UNA SOLA VEZ — auditoría Técnicos y Operaciones
 * (27-oct-2026), Fase 0 de los puntos 2, 3 y 5. Reglas PURAS: el script
 * scripts/ajuste-auditoria-ops-fase0.ts lee el estado real, llama a estas
 * funciones y solo escribe con --aplicar.
 *
 *   · Punto 2: OP-2026-000100, 102, 103 y 109 siguen en "Pedido" aunque su
 *     orden ya se cobró y se documentó (su artículo ya está Vendido). Se
 *     cierran ("Entregado") y se enlazan al recibo de su orden.
 *   · Punto 3 (OR000432): la tapa Dell ya estaba comprada (REP-000038, llegó
 *     el 18-oct, "Disponible"). "Ya se pidió al proveedor" creó un artículo
 *     fantasma (REP-000103). REP-000038 queda apartado para la orden (pasa a
 *     ser el artículo de OP-2026-000097 y de la línea del presupuesto) y
 *     REP-000103 se elimina con la regla de eliminación de Shipping V2.
 *   · Punto 5 (OR000517): al cliente se le entregó ji41416@mic-365.com, pero
 *     la orden apuntaba a e4099@365zz.co. ji41416 se asigna a la orden y a su
 *     línea; e4099 queda libre (no se le entregó a nadie).
 *
 * Cada registro tocado lleva "Regularización auditoría ops Fase 0".
 */

export const MARCA_FASE0 = "Regularización auditoría ops Fase 0";
const HOY = "27-oct-2026";
const agregar = (antes: string, nuevo: string) => (antes.trim() ? `${antes.trim()}\n${nuevo}` : nuevo);

// ─── Punto 2: operaciones colgadas ───────────────────────────────────────────

export type CasoOperacionColgada = {
  operacion: string; operacionId: string;
  orden: string; ordenId: string;
  recibo: string; reciboId: string;
  articulo: string; articuloId: string;
};

export const OPERACIONES_COLGADAS: CasoOperacionColgada[] = [
  { operacion: "OP-2026-000100", operacionId: "recx0uc3kIErZIM2Z", orden: "OR000499", ordenId: "recOoxB7R3s5DjCAa", recibo: "REC-000074", reciboId: "recinZibq52QEBfja", articulo: "REP-000106", articuloId: "recEawMc0L7gSz5a6" },
  { operacion: "OP-2026-000102", operacionId: "recG3JAf4ukEhDYoU", orden: "OR000504", ordenId: "recy2SibeD3qvULUw", recibo: "REC-000073", reciboId: "rec2a4HbnQuIM7niH", articulo: "REP-000104", articuloId: "recpPFadPTQY8gyzX" },
  { operacion: "OP-2026-000103", operacionId: "rec8HgzpF2YX4hYD6", orden: "OR000505", ordenId: "rec1QyNtFzDNme6FZ", recibo: "REC-000063", reciboId: "recyCh383FTTSsCR5", articulo: "REP-000105", articuloId: "recCUX4VnIupVpfl9" },
  { operacion: "OP-2026-000109", operacionId: "recKpj73iCp7nHg1x", orden: "OR000422", ordenId: "recQCG8Ia5abJAaG7", recibo: "REC-000056", reciboId: "rec9Wsn5d3G0FI49h", articulo: "REP-000107", articuloId: "recTchrex8Aja075m" },
];

export type LecturaOperacionColgada = {
  operacion: { existe: boolean; estado: string; ordenIds: string[]; reciboIds: string[]; observacion: string };
  recibo: { existe: boolean; estado: string; ordenIds: string[] };
  articulo: { existe: boolean; estado: string; operacionIds: string[] };
};

export type AccionFase0 =
  | { tipo: "operacion"; id: string; campos: Record<string, unknown>; resumen: string }
  | { tipo: "articulo"; id: string; campos: Record<string, unknown>; resumen: string }
  | { tipo: "eliminar-articulo"; id: string; sku: string; motivo: string; resumen: string }
  | { tipo: "linea-presupuesto"; id: string; campos: Record<string, unknown>; resumen: string }
  | { tipo: "producto-digital"; id: string; campos: Record<string, unknown>; resumen: string }
  | { tipo: "evento-articulo"; articuloId: string; descripcion: string; datos: string; resumen: string }
  | { tipo: "revision"; id: string; campos: Record<string, unknown>; resumen: string };

export type PlanFase0 = { caso: string; estado: "aplicar" | "ya-aplicado" | "bloqueado"; acciones: AccionFase0[]; bloqueos: string[] };

function cerrarPlan(caso: string, acciones: AccionFase0[], bloqueos: string[]): PlanFase0 {
  if (bloqueos.length) return { caso, estado: "bloqueado", acciones: [], bloqueos };
  return { caso, estado: acciones.length ? "aplicar" : "ya-aplicado", acciones, bloqueos };
}

export function planOperacionColgada(c: CasoOperacionColgada, l: LecturaOperacionColgada): PlanFase0 {
  const bloqueos: string[] = [];
  const acciones: AccionFase0[] = [];
  if (!l.operacion.existe) bloqueos.push(`${c.operacion} no existe.`);
  if (!l.recibo.existe) bloqueos.push(`${c.recibo} no existe.`);
  if (!l.articulo.existe) bloqueos.push(`${c.articulo} no existe.`);
  if (bloqueos.length) return cerrarPlan(c.operacion, acciones, bloqueos);

  if (!l.operacion.ordenIds.includes(c.ordenId)) bloqueos.push(`${c.operacion} ya no está vinculada a ${c.orden}.`);
  if (l.recibo.estado !== "Vigente") bloqueos.push(`${c.recibo} está ${l.recibo.estado || "sin estado"}: no se cierra la operación.`);
  if (!l.recibo.ordenIds.includes(c.ordenId)) bloqueos.push(`${c.recibo} no es de ${c.orden}.`);
  if (l.articulo.estado !== "Vendido") bloqueos.push(`${c.articulo} está "${l.articulo.estado}", no Vendido.`);
  if (!l.articulo.operacionIds.includes(c.operacionId)) bloqueos.push(`${c.articulo} no es el artículo de ${c.operacion}.`);
  if (!["Pedido", "Entregado"].includes(l.operacion.estado)) bloqueos.push(`${c.operacion} está "${l.operacion.estado}" (se esperaba Pedido).`);
  if (bloqueos.length) return cerrarPlan(c.operacion, acciones, bloqueos);

  const campos: Record<string, unknown> = {};
  const cambios: string[] = [];
  if (l.operacion.estado !== "Entregado") { campos["Estado"] = "Entregado"; cambios.push("Pedido → Entregado"); }
  if (!l.operacion.reciboIds.includes(c.reciboId)) { campos["Recibos"] = [...l.operacion.reciboIds, c.reciboId]; cambios.push(`enlazada a ${c.recibo}`); }
  if (cambios.length) {
    campos["Observación Interna"] = agregar(
      l.operacion.observacion,
      `[${HOY}] ${MARCA_FASE0} (autorizado por el dueño): ${c.orden} ya se cobró y se documentó con ${c.recibo}; su artículo ${c.articulo} está Vendido. La operación se cierra.`
    );
    acciones.push({ tipo: "operacion", id: c.operacionId, campos, resumen: `${c.operacion}: ${cambios.join(", ")}` });
  }
  return cerrarPlan(c.operacion, acciones, bloqueos);
}

// ─── Punto 3: la tapa de OR000432 ────────────────────────────────────────────

export const CASO_OR000432 = {
  orden: "OR000432", ordenId: "recgTvWxNUNTGHf4K",
  operacion: "OP-2026-000097", operacionId: "recVnl34ZhMGomCe1", opcionId: "recwsN6zqfxSTPOW7",
  lineaId: "reccv4QtYzDL6Vq4D",
  real: { sku: "REP-000038", id: "recZYWqnDtSUA4WD8" },
  fantasma: { sku: "REP-000103", id: "recm5aWLEanNl0iPN" },
  /** "Posible duplicado" que la Revisión de inventario ya había detectado (18-oct). */
  revisionId: "recVMm6aubG3o4Ozc",
} as const;

export type LecturaArticulo = {
  existe: boolean; sku: string; estado: string; recibido: boolean; cantidad: number; cantidadReservada: number; reservado: boolean;
  operacionIds: string[]; presupuestoIds: string[]; ordenStockIds: string[]; facturaIds: string[];
  pagoIds: string[]; ordenCompraIds: string[];
};
export type LecturaOR000432 = {
  real: LecturaArticulo;
  fantasma: LecturaArticulo;
  operacion: { existe: boolean; estado: string; articuloIds: string[] };
  linea: { existe: boolean; articuloIds: string[]; historial: string };
  revision: { existe: boolean; estado: string; articuloIds: string[] };
};

export function planOR000432(l: LecturaOR000432): PlanFase0 {
  const c = CASO_OR000432;
  const bloqueos: string[] = [];
  const acciones: AccionFase0[] = [];
  if (!l.real.existe) bloqueos.push(`${c.real.sku} no existe.`);
  if (!l.operacion.existe) bloqueos.push(`${c.operacion} no existe.`);
  if (!l.linea.existe) bloqueos.push("La línea del presupuesto no existe.");
  if (bloqueos.length) return cerrarPlan(c.orden, acciones, bloqueos);

  const realYaAsignado = l.real.operacionIds.includes(c.operacionId) && l.real.presupuestoIds.includes(c.lineaId)
    && l.real.cantidadReservada >= 1 && l.real.estado === "Reservado";

  if (!realYaAsignado) {
    if (!l.real.recibido) bloqueos.push(`${c.real.sku} no figura como Recibido.`);
    if (l.real.estado !== "Disponible") bloqueos.push(`${c.real.sku} está "${l.real.estado}" (se esperaba Disponible).`);
    if (l.real.cantidad !== 1) bloqueos.push(`${c.real.sku} tiene ${l.real.cantidad} unidades (se esperaba 1).`);
    if (l.real.cantidadReservada > 0 || l.real.reservado) bloqueos.push(`${c.real.sku} ya está apartado para otro cliente.`);
    if (l.real.ordenStockIds.length || l.real.facturaIds.length) bloqueos.push(`${c.real.sku} ya está en otra orden o en una factura.`);
    if (l.real.operacionIds.some((id) => id !== c.operacionId)) bloqueos.push(`${c.real.sku} ya pertenece a otra operación.`);
  }
  if (l.fantasma.existe) {
    if (l.fantasma.pagoIds.length) bloqueos.push(`${c.fantasma.sku} ya tiene un pago al proveedor: revisar a mano antes de eliminarlo.`);
    if (l.fantasma.ordenCompraIds.length) bloqueos.push(`${c.fantasma.sku} está en una orden de compra: revisar a mano.`);
    if (l.fantasma.recibido) bloqueos.push(`${c.fantasma.sku} figura como Recibido: no sería un fantasma.`);
  }
  if (l.operacion.estado !== "Pedido") bloqueos.push(`${c.operacion} está "${l.operacion.estado}" (se esperaba Pedido).`);
  if (bloqueos.length) return cerrarPlan(c.orden, acciones, bloqueos);

  if (!realYaAsignado) {
    acciones.push({
      tipo: "articulo", id: c.real.id,
      campos: {
        "Operación Comercial": [c.operacionId],
        "Opción origen": [c.opcionId],
        "Presupuesto por Orden": [c.lineaId],
        "Reservado": true,
        "Cantidad Reservada": 1,
        "Disponible para venta": false,
        "Estado Item": "Reservado",
      },
      resumen: `${c.real.sku}: apartado para ${c.orden} (artículo de ${c.operacion} y de su línea del presupuesto) · Disponible → Reservado`,
    });
    acciones.push({
      tipo: "evento-articulo", articuloId: c.real.id,
      descripcion: `${MARCA_FASE0} (autorizado por el dueño, ${HOY}): ${c.real.sku} es la tapa que pidió ${c.orden} (comprada el 24-sep, llegó el 18-oct). Queda apartada para la orden como artículo de ${c.operacion}. El artículo duplicado ${c.fantasma.sku} se elimina.`,
      datos: JSON.stringify({ orden: c.orden, operacion: c.operacion, eliminado: c.fantasma.sku }),
      resumen: `evento en ${c.real.sku}`,
    });
  }
  // El asunto "Posible duplicado" ya avisaba de esto. Se cierra y se suelta
  // REP-000103 de él: la regla de eliminación no borra un artículo vinculado.
  if (l.revision.existe && (l.revision.estado !== "Resuelto" || l.revision.articuloIds.includes(c.fantasma.id))) {
    acciones.push({
      tipo: "revision", id: c.revisionId,
      campos: {
        "Artículo": l.revision.articuloIds.filter((id) => id !== c.fantasma.id),
        "Estado": "Resuelto",
        "Resuelto por": "Claude (autorizado por el dueño)",
        "Fecha resuelto": new Date().toISOString(),
        "Motivo": `${MARCA_FASE0}: no era el mismo producto en 2 SKU sino un artículo fantasma. ${c.fantasma.sku} se creó con "Ya se pidió al proveedor" sin compra real; la tapa real es ${c.real.sku} y queda apartada para ${c.orden}. ${c.fantasma.sku} se elimina.`,
      },
      resumen: `asunto de Revisión "Posible duplicado ${c.real.sku}/${c.fantasma.sku}": se cierra como resuelto`,
    });
  }
  if (l.fantasma.existe) {
    if (l.fantasma.operacionIds.length || l.fantasma.presupuestoIds.length || l.fantasma.cantidadReservada > 0 || l.fantasma.reservado) {
      acciones.push({
        tipo: "articulo", id: c.fantasma.id,
        campos: { "Operación Comercial": [], "Presupuesto por Orden": [], "Reservado": false, "Cantidad Reservada": 0 },
        resumen: `${c.fantasma.sku}: se suelta de ${c.operacion} y de la línea (para poder eliminarlo)`,
      });
    }
    acciones.push({
      tipo: "eliminar-articulo", id: c.fantasma.id, sku: c.fantasma.sku,
      motivo: `${MARCA_FASE0}: artículo duplicado de ${c.real.sku}, creado por "Ya se pidió al proveedor" sin compra real (${c.orden}).`,
      resumen: `${c.fantasma.sku}: se elimina (con la regla de eliminación de Shipping V2)`,
    });
  }
  if (!l.linea.historial.includes(MARCA_FASE0)) {
    acciones.push({
      tipo: "linea-presupuesto", id: c.lineaId,
      campos: { "Historial": agregar(l.linea.historial, `[2026-10-27] ${MARCA_FASE0}: corresponde a ${c.real.sku} (ya comprado el 24-sep). ${c.fantasma.sku} era un duplicado y se eliminó.`) },
      resumen: "historial de la línea del presupuesto",
    });
  }
  return cerrarPlan(c.orden, acciones, bloqueos);
}

// ─── Punto 5: la licencia de OR000517 ────────────────────────────────────────

export const CASO_OR000517 = {
  orden: "OR000517", ordenId: "recVx53QeO1Qjio2m", lineaId: "rec8iYpIZAD4NunQs",
  entregada: { usuario: "ji41416@mic-365.com", id: "reconxyBxVkxoLsSm", fechaEntrega: "2026-10-20" },
  liberar: { usuario: "e4099@365zz.co", id: "recN6fPplwm3VpFk4" },
} as const;

export type LecturaProductoDigital = {
  existe: boolean; estado: string; ordenIds: string[]; lineaIds: string[]; facturaIds: string[]; reciboIds: string[]; observaciones: string;
};

export function planOR000517(l: { entregada: LecturaProductoDigital; liberar: LecturaProductoDigital }): PlanFase0 {
  const c = CASO_OR000517;
  const bloqueos: string[] = [];
  const acciones: AccionFase0[] = [];
  if (!l.entregada.existe || !l.liberar.existe) return cerrarPlan(c.orden, acciones, ["No se encontraron las dos licencias."]);

  const entregadaLista = l.entregada.ordenIds.includes(c.ordenId) && l.entregada.lineaIds.includes(c.lineaId);
  const liberada = l.liberar.ordenIds.length === 0 && l.liberar.lineaIds.length === 0;

  if (!entregadaLista) {
    if (l.entregada.estado !== "Disponible") bloqueos.push(`${c.entregada.usuario} está "${l.entregada.estado}".`);
    if (l.entregada.ordenIds.some((id) => id !== c.ordenId)) bloqueos.push(`${c.entregada.usuario} ya está vinculada a otra orden.`);
    if (l.entregada.facturaIds.length || l.entregada.reciboIds.length) bloqueos.push(`${c.entregada.usuario} ya está en un documento de venta.`);
  }
  if (!liberada) {
    if (l.liberar.estado !== "Disponible") bloqueos.push(`${c.liberar.usuario} está "${l.liberar.estado}" (si se vendió, no se libera).`);
    if (l.liberar.ordenIds.some((id) => id !== c.ordenId)) bloqueos.push(`${c.liberar.usuario} está vinculada a otra orden.`);
    if (l.liberar.facturaIds.length || l.liberar.reciboIds.length) bloqueos.push(`${c.liberar.usuario} ya está en un documento de venta.`);
  }
  if (bloqueos.length) return cerrarPlan(c.orden, acciones, bloqueos);

  if (!entregadaLista) {
    acciones.push({
      tipo: "producto-digital", id: c.entregada.id,
      campos: {
        "Orden de Reparación": [c.ordenId],
        "Presupuesto por Orden": [c.lineaId],
        "Tipo de Uso": "Orden de reparación",
        "Fecha de Uso / Venta": c.entregada.fechaEntrega,
        "Usado/Vendido por": "Regularización auditoría (entregada al cliente el 20-oct)",
        "Observaciones Internas": agregar(l.entregada.observaciones, `[${HOY}] ${MARCA_FASE0}: esta es la cuenta que se le entregó a Christopher Conejo (${c.orden}) el 20-oct. Se vincula a la orden y a su línea del presupuesto.`),
      },
      resumen: `${c.entregada.usuario}: asignada a ${c.orden} y a su línea`,
    });
  }
  if (!liberada) {
    acciones.push({
      tipo: "producto-digital", id: c.liberar.id,
      campos: {
        "Estado": "Disponible",
        "Orden de Reparación": [],
        "Presupuesto por Orden": [],
        "Tipo de Uso": null,
        "Fecha de Uso / Venta": null,
        "Usado/Vendido por": null,
        "Usuario ID Portal": null,
        "Observaciones Internas": agregar(l.liberar.observaciones, `[${HOY}] ${MARCA_FASE0}: el sistema la había asignado sola a ${c.orden}, pero al cliente se le entregó ${c.entregada.usuario}. Queda libre (nunca se entregó).`),
      },
      resumen: `${c.liberar.usuario}: liberada (vuelve a estar libre para vender)`,
    });
  }
  return cerrarPlan(c.orden, acciones, bloqueos);
}
