// Ajuste de datos — OR000425 (Aida Marcillo), primer caso de Garantía SUPER
// GEEK (auditoría ops, punto 20). Decisiones del dueño, 2 y 4-nov-2026:
//   · La batería REP-000135 (Dell XPS 13 9300, recibida) se le da en garantía:
//     $0 al cliente, sale del inventario al entregar la orden.
//   · OP-2026-000122 (con su precio de $1 puesto a mano porque el sistema no
//     aceptaba $0) pasa a "Rechazado" con la nota "Reemplazada por la garantía
//     de OR000425" y se suelta de la batería.
//   · La batería queda apartada para la orden en una línea del presupuesto en
//     garantía confirmada, a $0.
// Reglas PURAS (sin red): qué falta hacer según lo leído. Lo usa
// scripts/ajuste-auditoria-ops-punto20.ts; la prueba vigila que una segunda
// corrida no haga nada.

export const OR000425 = {
  orden: "OR000425",
  operacion: "OP-2026-000122",
  sku: "REP-000135",
  /** El equipo de la orden: lo que se compró en SUPER GEEK (6 meses de garantía). */
  skuEquipo: "LAP-000020",
  descripcion: "Batería Dell XPS 13 9300 (52 Wh) — garantía",
  motivo: "Garantía de la batería de la Dell XPS 13 9300: la anterior salió mala. Decisión del dueño, 2-nov-2026.",
  confirmadaPor: "Alex (dueño)",
  notaOperacion: "Reemplazada por la garantía de OR000425 (punto 20, 4-nov-2026). La batería REP-000135 quedó en el presupuesto de la orden, a $0.",
} as const;

export type EstadoLeidoOR000425 = {
  ordenId: string | null;
  operacion: { id: string; estado: string; observacion: string } | null;
  articulo: {
    id: string;
    /** Operaciones a las que está enlazado ("Operación Comercial" del artículo). */
    operaciones: string[];
    /** Órdenes a las que está apartado ("Orden de Reparación (Stock)"). */
    ordenesStock: string[];
    estado: string;
  } | null;
  /** Línea del presupuesto de la orden que apunta a la batería (si existe). */
  linea: { id: string; estado: string; garantia: string; precio: number } | null;
};

export type AccionOR000425 =
  | { tipo: "soltar_de_operacion"; itemId: string; operacionId: string }
  /** Crea la línea (o completa una a medias) y la carga con cargarCompraEnLinea (aparta la batería). */
  | { tipo: "crear_linea_garantia"; ordenId: string; itemId: string }
  | { tipo: "completar_linea_garantia"; ordenId: string; lineaId: string; itemId: string; cargar: boolean }
  | { tipo: "rechazar_operacion"; operacionId: string };

export function planOR000425(e: EstadoLeidoOR000425): { acciones: AccionOR000425[]; bloqueos: string[] } {
  const bloqueos: string[] = [];
  if (!e.ordenId) bloqueos.push(`No se encontró la orden ${OR000425.orden}.`);
  if (!e.operacion) bloqueos.push(`No se encontró ${OR000425.operacion}.`);
  if (!e.articulo) bloqueos.push(`No se encontró ${OR000425.sku}.`);
  if (bloqueos.length || !e.ordenId || !e.operacion || !e.articulo) return { acciones: [], bloqueos };
  const apartada = e.articulo.ordenesStock.includes(e.ordenId);
  const terminal = ["vendido", "usado en reparación", "dado de baja", "cancelado"];
  if (terminal.includes(e.articulo.estado.toLowerCase()) && !apartada) {
    bloqueos.push(`${OR000425.sku} está "${e.articulo.estado}": no se puede apartar.`);
    return { acciones: [], bloqueos };
  }
  if (e.linea?.estado === "Cargada" && !apartada) {
    bloqueos.push(`La línea dice "Cargada" pero ${OR000425.sku} no está apartada para la orden: revisar a mano.`);
    return { acciones: [], bloqueos };
  }

  const acciones: AccionOR000425[] = [];
  if (e.articulo.operaciones.includes(e.operacion.id)) {
    acciones.push({ tipo: "soltar_de_operacion", itemId: e.articulo.id, operacionId: e.operacion.id });
  }
  if (!e.linea) {
    acciones.push({ tipo: "crear_linea_garantia", ordenId: e.ordenId, itemId: e.articulo.id });
  } else if (e.linea.estado !== "Cargada" || e.linea.garantia !== "Confirmada" || e.linea.precio !== 0) {
    acciones.push({ tipo: "completar_linea_garantia", ordenId: e.ordenId, lineaId: e.linea.id, itemId: e.articulo.id, cargar: e.linea.estado !== "Cargada" });
  }
  if (e.operacion.estado !== "Rechazado") {
    acciones.push({ tipo: "rechazar_operacion", operacionId: e.operacion.id });
  }
  return { acciones, bloqueos };
}
