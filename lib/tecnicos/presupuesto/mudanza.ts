// Mudanza de órdenes viejas al presupuesto (presupuesto único, fase 3) —
// reglas PURAS, sin Airtable. El script scripts/mudanza-presupuesto.ts lee los
// datos, llama a planMudanza() por orden y, solo con --aplicar, escribe.
//
// Idea central: la mudanza NO toca dinero ni inventario. Por cada cargo que ya
// existe en la orden (servicio, repuesto de stock, producto digital, artículo
// de un pedido) y que ninguna línea reclama, crea una línea "Cargada" que
// APUNTA a ese cargo. Los totales, abonos y documentos quedan exactamente igual,
// porque el Resumen financiero lee los cargos, no las líneas.
//
// Además repara las líneas "Cargada" que nunca guardaron su vínculo (OR000486):
// si hay exactamente UN cargo sin dueño que les corresponde, se vinculan a él
// en vez de crear una línea nueva (eso duplicaría el cargo en el presupuesto).
// Si no se puede saber cuál es, esa parte de la orden no se toca y se reporta.
//
// Los repuestos del sistema antiguo ("Repuestos por Orden", sin Shipping Item)
// NO se mudan: siguen visibles en el Resumen financiero como "Histórico".

import type { LineaPresupuesto, TipoLinea } from "./reglas";

export const CREADO_POR_MUDANZA = "Mudanza de órdenes viejas";
export const APROBADO_POR_MUDANZA = "Registrado antes del presupuesto (sin constancia del cliente)";

export type CargoServicio = { id: string; catalogoId: string | null; nombre: string; costo: number };
export type CargoItem = { id: string; nombre: string; precio: number };
export type CargoDigital = { id: string; catalogoId: string | null; nombre: string; precio: number };
export type CargoPedido = { operacionId: string; codigo: string; itemIds: string[]; nombre: string; precio: number };

export type OrdenMudanza = {
  ordenId: string;
  idVisible: string;
  servicios: CargoServicio[];
  itemsStock: CargoItem[];
  digitales: CargoDigital[];
  /** Operaciones de la orden que ya tienen artículo en Shipping. */
  pedidos: CargoPedido[];
  historicos: { nombre: string; subtotal: number }[];
  /** Totales que calcula Airtable (rollups de la orden), para verificar la lectura. */
  rollups: { servicios: number | null; digitales: number | null };
  lineas: LineaPresupuesto[];
};

export type LineaNueva = {
  tipo: TipoLinea;
  descripcion: string;
  precioUnitario: number;
  servicioCatalogoId?: string;
  productoCatalogoId?: string;
  itemId?: string;
  cargoServicioId?: string;
  cargoProductoDigitalId?: string;
  operacionId?: string;
};

export type Vinculo = {
  lineaId: string;
  descripcion: string;
  /** Historial actual de la línea: la mudanza AGREGA una entrada, no lo reemplaza. */
  historialAnterior: string;
  campo: "cargoServicioId" | "cargoProductoDigitalId" | "itemId";
  cargoId: string;
};

export type PlanMudanza = {
  ordenId: string;
  idVisible: string;
  /** Motivo por el que la orden entera NO se toca. null = se puede aplicar. */
  bloqueada: string | null;
  crear: LineaNueva[];
  vincular: Vinculo[];
  avisos: string[];
  resumen: {
    cargos: number;
    lineasExistentes: number;
    historicos: number;
    totalHistoricos: number;
  };
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const iguales = (a: number, b: number) => Math.abs(a - b) < 0.011;
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Líneas que "son dueñas" de un cargo: solo las vigentes (Cargada / Aprobada). */
const vigente = (l: LineaPresupuesto) => l.estado === "Cargada" || l.estado === "Aprobada";

export function planMudanza(o: OrdenMudanza): PlanMudanza {
  const plan: PlanMudanza = {
    ordenId: o.ordenId,
    idVisible: o.idVisible,
    bloqueada: null,
    crear: [],
    vincular: [],
    avisos: [],
    resumen: {
      cargos: o.servicios.length + o.itemsStock.length + o.digitales.length + o.pedidos.length,
      lineasExistentes: o.lineas.length,
      historicos: o.historicos.length,
      totalHistoricos: r2(o.historicos.reduce((s, h) => s + h.subtotal, 0)),
    },
  };

  // 1) ¿Leímos todo? Lo que sumamos debe coincidir con lo que Airtable calcula.
  const sumaServ = r2(o.servicios.reduce((s, x) => s + x.costo, 0));
  if (o.rollups.servicios !== null && !iguales(sumaServ, o.rollups.servicios)) {
    plan.bloqueada = `Los servicios leídos suman $${sumaServ.toFixed(2)} y la orden dice $${o.rollups.servicios.toFixed(2)}.`;
    return plan;
  }
  const sumaDig = r2(o.digitales.reduce((s, x) => s + x.precio, 0));
  if (o.rollups.digitales !== null && !iguales(sumaDig, o.rollups.digitales)) {
    plan.bloqueada = `Los productos digitales leídos suman $${sumaDig.toFixed(2)} y la orden dice $${o.rollups.digitales.toFixed(2)}.`;
    return plan;
  }

  // 2) Qué cargos ya tienen dueño.
  const vivas = o.lineas.filter(vigente);
  const servConDueno = new Set(vivas.map((l) => l.cargoServicioId).filter((x): x is string => !!x));
  const digConDueno = new Set(vivas.map((l) => l.cargoProductoDigitalId).filter((x): x is string => !!x));
  const itemConDueno = new Set(vivas.filter((l) => l.tipo === "Repuesto" && !l.operacionId).map((l) => l.itemId).filter((x): x is string => !!x));
  // Una operación que el presupuesto ya conoce (en cualquier estado) es suya:
  // no se crea otra línea para ella.
  const opsConocidas = new Set(o.lineas.map((l) => l.operacionId).filter((x): x is string => !!x));

  const servSueltos = o.servicios.filter((s) => !servConDueno.has(s.id));
  const digSueltos = o.digitales.filter((d) => !digConDueno.has(d.id));
  const itemSueltos = o.itemsStock.filter((i) => !itemConDueno.has(i.id));

  // 3) Líneas "Cargada" sin vínculo: se intenta emparejarlas con UN cargo suelto.
  const huerfanas = o.lineas.filter((l) => l.estado === "Cargada" && !l.operacionId && !(
    l.tipo === "Servicio" ? l.cargoServicioId : l.tipo === "Producto digital" ? l.cargoProductoDigitalId : l.itemId
  ));
  const tiposAmbiguos = new Set<TipoLinea>();
  const tomados = new Set<string>();

  for (const l of huerfanas) {
    const subtotal = r2(l.cantidad * l.precioUnitario);
    let candidatos: { id: string; nombre: string; valor: number }[] = [];
    if (l.tipo === "Servicio") {
      candidatos = servSueltos
        .filter((s) => (l.servicioCatalogoId && s.catalogoId ? s.catalogoId === l.servicioCatalogoId : norm(s.nombre).startsWith(norm(l.descripcion))))
        .map((s) => ({ id: s.id, nombre: s.nombre, valor: s.costo }));
    } else if (l.tipo === "Producto digital") {
      candidatos = digSueltos
        .filter((d) => (l.productoCatalogoId && d.catalogoId ? d.catalogoId === l.productoCatalogoId : norm(d.nombre) === norm(l.descripcion)))
        .map((d) => ({ id: d.id, nombre: d.nombre, valor: d.precio }));
    } else {
      candidatos = itemSueltos.filter((i) => norm(i.nombre) === norm(l.descripcion)).map((i) => ({ id: i.id, nombre: i.nombre, valor: i.precio }));
    }
    candidatos = candidatos.filter((c) => !tomados.has(c.id));
    // Si hay varios, el precio desempata.
    if (candidatos.length > 1) {
      const mismoPrecio = candidatos.filter((c) => iguales(c.valor, subtotal));
      if (mismoPrecio.length >= 1) candidatos = mismoPrecio;
    }
    if (candidatos.length === 1) {
      const c = candidatos[0];
      tomados.add(c.id);
      plan.vincular.push({
        lineaId: l.id,
        descripcion: l.descripcion,
        historialAnterior: l.historial,
        campo: l.tipo === "Servicio" ? "cargoServicioId" : l.tipo === "Producto digital" ? "cargoProductoDigitalId" : "itemId",
        cargoId: c.id,
      });
      if (!iguales(c.valor, subtotal)) {
        plan.avisos.push(`"${l.descripcion}": la línea dice $${subtotal.toFixed(2)} y el cargo $${c.valor.toFixed(2)} (se vincula igual; manda el cargo).`);
      }
    } else if (candidatos.length > 1) {
      tiposAmbiguos.add(l.tipo);
      plan.avisos.push(`"${l.descripcion}": hay ${candidatos.length} cargos que podrían ser el suyo. Esa parte de la orden no se toca.`);
    }
    // 0 candidatos: el cargo ya no existe; al abrir la orden la línea pasa a
    // "Aprobada" sola (cargasPerdidas). No es trabajo de la mudanza.
  }

  // 4) Cargos sueltos que nadie reclama → línea nueva "Cargada".
  const libres = <T extends { id: string }>(xs: T[]) => xs.filter((x) => !tomados.has(x.id));
  if (tiposAmbiguos.has("Servicio")) {
    if (libres(servSueltos).length) plan.avisos.push(`${libres(servSueltos).length} servicio(s) sin línea quedan para revisar a mano.`);
  } else {
    for (const s of libres(servSueltos)) {
      plan.crear.push({ tipo: "Servicio", descripcion: s.nombre, precioUnitario: r2(s.costo), cargoServicioId: s.id, ...(s.catalogoId ? { servicioCatalogoId: s.catalogoId } : {}) });
    }
  }
  if (tiposAmbiguos.has("Producto digital")) {
    if (libres(digSueltos).length) plan.avisos.push(`${libres(digSueltos).length} producto(s) digital(es) sin línea quedan para revisar a mano.`);
  } else {
    for (const d of libres(digSueltos)) {
      plan.crear.push({ tipo: "Producto digital", descripcion: d.nombre || "Producto digital", precioUnitario: r2(d.precio), cargoProductoDigitalId: d.id, ...(d.catalogoId ? { productoCatalogoId: d.catalogoId } : {}) });
    }
  }
  if (tiposAmbiguos.has("Repuesto")) {
    if (libres(itemSueltos).length) plan.avisos.push(`${libres(itemSueltos).length} repuesto(s) sin línea quedan para revisar a mano.`);
  } else {
    for (const i of libres(itemSueltos)) {
      plan.crear.push({ tipo: "Repuesto", descripcion: i.nombre, precioUnitario: r2(i.precio), itemId: i.id });
    }
  }

  // 5) Pedidos (repuesto bajo pedido de Operaciones) que el presupuesto no conoce.
  for (const p of o.pedidos) {
    if (opsConocidas.has(p.operacionId)) continue;
    if (p.itemIds.length !== 1) {
      plan.avisos.push(`El pedido ${p.codigo} tiene ${p.itemIds.length} artículos: queda para revisar a mano.`);
      continue;
    }
    plan.crear.push({ tipo: "Repuesto", descripcion: p.nombre, precioUnitario: r2(p.precio), itemId: p.itemIds[0], operacionId: p.operacionId });
  }

  return plan;
}

/** Totales de todas las órdenes, para el encabezado del reporte. */
export function resumirMudanza(planes: PlanMudanza[]) {
  const aplicables = planes.filter((p) => !p.bloqueada);
  return {
    ordenes: planes.length,
    conCambios: aplicables.filter((p) => p.crear.length || p.vincular.length).length,
    bloqueadas: planes.filter((p) => p.bloqueada).length,
    lineasNuevas: aplicables.reduce((s, p) => s + p.crear.length, 0),
    vinculos: aplicables.reduce((s, p) => s + p.vincular.length, 0),
    conAvisos: planes.filter((p) => p.avisos.length).length,
  };
}
