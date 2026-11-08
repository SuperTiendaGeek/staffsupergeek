// Ajuste de datos — punto 5C (con el 14) · 8-nov-2026. Regla PURA, con prueba.
//
// Decisiones del dueño (8-nov):
//   1. "Microsoft Office 365 Education" (recx5XRoG0UHUoc9m) es el mismo producto
//      que "Microsoft 365 Education (PC, Mac)" (reca9w17ykdNVyeeG). Sus
//      licencias y sus líneas de presupuesto pasan al catálogo que queda y el
//      duplicado se BORRA ("no quiero ensuciar la tabla"), solo cuando ya no le
//      queda nada enlazado.
//   2. "Producto Digital" (texto) mezclaba nombre · estado · fecha y se quedaba
//      viejo (DIG-000080 decía "Disponible" ya vendida; DIG-000059 decía
//      "#ERROR!"). Se corrige en origen: guarda SOLO el nombre del catálogo.
//   3. Una licencia sin "Fecha de Compra" toma la fecha en que se registró
//      (DIG-000059: 04/09/2026).
//   4. DIG-000082 era una prueba (sin costo ni duración) → "Anulado".
//   5. Líneas digitales aprobadas ANTES de la 5B-2 que no tienen solicitud de
//      compra (OR000535, McAfee) → nace su solicitud por el camino normal
//      (aprobarYCargar). OR000368 son datos de prueba (punto 16): no se toca.
//
// El plan es idempotente: aplicado, la vista previa vuelve a dar 0 acciones.

export const CATALOGO_DUPLICADO = "recx5XRoG0UHUoc9m"; // "Microsoft Office 365 Education"
export const CATALOGO_DESTINO = "reca9w17ykdNVyeeG"; // "Microsoft 365 Education (PC, Mac)"
export const UNIDADES_DE_PRUEBA = ["recn4FGiTwN4n4A3g"]; // DIG-000082
export const ORDENES_DE_PRUEBA = ["OR000368"]; // punto 16
export const NOTA_ANULADA_PRUEBA = "Anulada en el ajuste 5C: era un registro de prueba (decisión del dueño, 8-nov-2026).";

export type CatalogoAjuste = { id: string; nombre: string };

export type UnidadAjuste = {
  id: string;
  sku: string;
  catalogoId: string | null;
  nombreActual: string;
  estado: string;
  fechaCompra: string | null;
  /** Fecha de registro en Ecuador (AAAA-MM-DD). */
  fechaRegistro: string;
  observaciones: string;
};

export type LineaAjuste = {
  id: string;
  orden: string;
  ordenId: string | null;
  descripcion: string;
  tipo: string;
  estado: string;
  catalogoId: string | null;
  solicitudId: string | null;
  cargoProductoDigitalId: string | null;
};

export type AccionAjuste5C =
  | { tipo: "mover_unidad"; id: string; sku: string; desde: string; hacia: string }
  | { tipo: "mover_linea"; id: string; orden: string; desde: string; hacia: string }
  | { tipo: "nombre"; id: string; sku: string; antes: string; despues: string }
  | { tipo: "fecha_compra"; id: string; sku: string; fecha: string }
  | { tipo: "anular_prueba"; id: string; sku: string; observaciones: string }
  | { tipo: "crear_solicitud"; lineaId: string; ordenId: string; orden: string; descripcion: string }
  | { tipo: "borrar_catalogo"; id: string; nombre: string };

export type Omitido = { que: string; motivo: string };

export function planAjuste5C(input: {
  catalogo: readonly CatalogoAjuste[];
  unidades: readonly UnidadAjuste[];
  lineas: readonly LineaAjuste[];
}): { acciones: AccionAjuste5C[]; omitidos: Omitido[] } {
  const acciones: AccionAjuste5C[] = [];
  const omitidos: Omitido[] = [];
  const nombres = new Map(input.catalogo.map((c) => [c.id, c.nombre.trim()]));
  const destino = (catalogoId: string | null) => (catalogoId === CATALOGO_DUPLICADO ? CATALOGO_DESTINO : catalogoId);
  const duplicadoExiste = nombres.has(CATALOGO_DUPLICADO);
  if (duplicadoExiste && !nombres.has(CATALOGO_DESTINO)) {
    throw new Error(`No existe el catálogo destino ${CATALOGO_DESTINO}: no se puede unir.`);
  }

  for (const u of input.unidades) {
    const final = destino(u.catalogoId);
    if (u.catalogoId === CATALOGO_DUPLICADO) {
      acciones.push({ tipo: "mover_unidad", id: u.id, sku: u.sku, desde: nombres.get(CATALOGO_DUPLICADO)!, hacia: nombres.get(CATALOGO_DESTINO)! });
    }
    const nombre = final ? nombres.get(final) ?? "" : "";
    if (!nombre) omitidos.push({ que: u.sku, motivo: "sin catálogo: el nombre no se toca" });
    else if (u.nombreActual !== nombre) acciones.push({ tipo: "nombre", id: u.id, sku: u.sku, antes: u.nombreActual, despues: nombre });

    const esPrueba = UNIDADES_DE_PRUEBA.includes(u.id);
    if (esPrueba && u.estado !== "Anulado") {
      const obs = u.observaciones.includes(NOTA_ANULADA_PRUEBA) ? u.observaciones : [u.observaciones.trim(), NOTA_ANULADA_PRUEBA].filter(Boolean).join("\n");
      acciones.push({ tipo: "anular_prueba", id: u.id, sku: u.sku, observaciones: obs });
    }
    if (!u.fechaCompra && !esPrueba && u.estado !== "Anulado") {
      acciones.push({ tipo: "fecha_compra", id: u.id, sku: u.sku, fecha: u.fechaRegistro });
    }
  }

  for (const l of input.lineas) {
    if (l.catalogoId === CATALOGO_DUPLICADO) {
      acciones.push({ tipo: "mover_linea", id: l.id, orden: l.orden, desde: nombres.get(CATALOGO_DUPLICADO)!, hacia: nombres.get(CATALOGO_DESTINO)! });
    }
    // Aprobada antes de la 5B-2: ni licencia ni solicitud.
    if (l.tipo === "Producto digital" && l.estado === "Aprobada" && !l.solicitudId && !l.cargoProductoDigitalId) {
      if (ORDENES_DE_PRUEBA.includes(l.orden)) omitidos.push({ que: `${l.orden} · ${l.descripcion}`, motivo: "datos de prueba (punto 16)" });
      else if (!l.ordenId) omitidos.push({ que: `${l.orden} · ${l.descripcion}`, motivo: "la línea no tiene orden" });
      else acciones.push({ tipo: "crear_solicitud", lineaId: l.id, ordenId: l.ordenId, orden: l.orden, descripcion: l.descripcion });
    }
  }

  // Al final: el duplicado se borra cuando ya no le queda nada (el script lo
  // vuelve a leer justo antes de borrarlo).
  if (duplicadoExiste) acciones.push({ tipo: "borrar_catalogo", id: CATALOGO_DUPLICADO, nombre: nombres.get(CATALOGO_DUPLICADO)! });

  return { acciones, omitidos };
}

/** ¿Se puede borrar el catálogo? Solo si ya no tiene licencias ni líneas enlazadas. */
export function puedeBorrarCatalogo(enlaces: { unidades: number; lineas: number }): boolean {
  return enlaces.unidades === 0 && enlaces.lineas === 0;
}
