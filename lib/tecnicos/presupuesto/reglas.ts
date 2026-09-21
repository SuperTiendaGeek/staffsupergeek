// Presupuesto de una orden de reparación — tipos y reglas PURAS.
//
// La idea central: armar un presupuesto NO toca nada real. Las líneas viven en
// la tabla "Presupuesto por Orden" y no reservan inventario, no asignan
// productos digitales y no suman a la cuenta de la orden. Solo cuando el
// cliente aprueba, cada línea se "carga": recién ahí se crea el servicio, se
// reserva el repuesto o se asigna la licencia, con las MISMAS funciones que
// usan hoy las tarjetas de la orden. A partir de ese momento afecta al
// inventario, al Resumen financiero y a la factura/recibo.
//
// Ciclo de una línea:
//   Propuesta ──(cliente aprueba)──▶ Aprobada ──(se cargó)──▶ Cargada
//       │                               │
//       └──(cliente no acepta)──▶ Rechazada   (Aprobada = aceptada pero aún
//                                              sin cargar: p. ej. repuesto sin
//                                              stock; se reintenta después)
//
// Lo Cargado no se edita desde aquí: se ajusta en su tarjeta, como siempre.
// Un trabajo extra es una línea nueva, que se aprueba aparte — así queda
// constancia de qué aprobó el cliente y cuándo.

export const TIPOS_LINEA = ["Servicio", "Repuesto", "Producto digital"] as const;
export type TipoLinea = (typeof TIPOS_LINEA)[number];

export const ESTADOS_LINEA = ["Propuesta", "Aprobada", "Cargada", "Rechazada"] as const;
export type EstadoLinea = (typeof ESTADOS_LINEA)[number];

export type LineaPresupuesto = {
  id:                 string;
  tipo:               TipoLinea;
  descripcion:        string;
  cantidad:           number;
  /** Precio FINAL con IVA, igual que el resto de cargos de la orden. */
  precioUnitario:     number;
  estado:             EstadoLinea;
  notaCarga:          string;
  servicioCatalogoId: string | null;
  /** Shipping Item propuesto. Solo referencia: NO está reservado. */
  itemId:             string | null;
  productoCatalogoId: string | null;
  cargoServicioId:    string | null;
  cargoProductoDigitalId: string | null;
  aprobadoPor:        string;
  fechaAprobacion:    string;
  creadoPor:          string;
};

export type NuevaLineaInput = {
  tipo:               TipoLinea;
  descripcion:        string;
  cantidad:           number;
  precioUnitario:     number;
  servicioCatalogoId?: string | null;
  itemId?:            string | null;
  productoCatalogoId?: string | null;
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const subtotalLinea = (l: Pick<LineaPresupuesto, "cantidad" | "precioUnitario">) =>
  round2((l.cantidad || 0) * (l.precioUnitario || 0));

/**
 * Validación de una línea nueva (o editada). Devuelve el error para el
 * usuario, o null si está bien. La usan el formulario y el servidor.
 */
export function validarLinea(l: NuevaLineaInput): string | null {
  if (!TIPOS_LINEA.includes(l.tipo)) return "Tipo de línea inválido.";
  if (!l.descripcion?.trim()) return "La línea necesita una descripción.";
  if (!Number.isInteger(l.cantidad) || l.cantidad < 1) return "La cantidad debe ser un número entero mayor a 0.";
  if (!(l.precioUnitario >= 0)) return "El precio no puede ser negativo.";
  if (l.tipo === "Servicio" && !l.servicioCatalogoId) {
    return "Elige el servicio del catálogo (así queda igual que en la tarjeta de servicios).";
  }
  if (l.tipo === "Producto digital" && !l.productoCatalogoId) return "Elige el producto digital del catálogo.";
  // Un artículo del inventario se reserva de a una unidad por orden, y un
  // producto digital es siempre una unidad (una clave, una cuenta). Para
  // varios, se agregan varias líneas.
  if (l.tipo === "Repuesto" && l.itemId && l.cantidad !== 1) {
    return "Un repuesto del inventario va de a una unidad por línea. Agrega otra línea para otra unidad.";
  }
  if (l.tipo === "Producto digital" && l.cantidad !== 1) {
    return "Cada producto digital es una unidad (una licencia). Agrega otra línea para otra.";
  }
  return null;
}

/** Solo lo Propuesto se edita o borra libremente. */
export const esEditable = (l: Pick<LineaPresupuesto, "estado">) => l.estado === "Propuesta";

/**
 * Una línea Aprobada sin cargar (p. ej. repuesto que no estaba en stock) puede
 * recibir su artículo de inventario más tarde, para poder cargarla.
 */
export const aceptaVincularArticulo = (l: Pick<LineaPresupuesto, "estado" | "tipo">) =>
  l.tipo === "Repuesto" && (l.estado === "Propuesta" || l.estado === "Aprobada");

export type EstadoPresupuesto = "sin_presupuesto" | "propuesto" | "aprobado" | "rechazado";

/**
 * Estado del presupuesto de la orden, derivado de sus líneas — no se guarda
 * aparte, así nunca puede contradecirlas.
 *   · aprobado:  al menos una línea aceptada (Aprobada o Cargada).
 *   · propuesto: hay líneas esperando respuesta y ninguna aceptada.
 *   · rechazado: todas las líneas fueron rechazadas.
 */
export function estadoPresupuesto(lineas: Array<Pick<LineaPresupuesto, "estado">>): EstadoPresupuesto {
  if (lineas.length === 0) return "sin_presupuesto";
  if (lineas.some((l) => l.estado === "Aprobada" || l.estado === "Cargada")) return "aprobado";
  if (lineas.some((l) => l.estado === "Propuesta")) return "propuesto";
  return "rechazado";
}

export function totalesPresupuesto(lineas: LineaPresupuesto[]) {
  const suma = (estados: EstadoLinea[]) =>
    round2(lineas.filter((l) => estados.includes(l.estado)).reduce((s, l) => s + subtotalLinea(l), 0));
  return {
    propuesto: suma(["Propuesta"]),
    aprobado:  suma(["Aprobada", "Cargada"]),
    pendienteDeCargar: suma(["Aprobada"]),
    rechazado: suma(["Rechazada"]),
  };
}

// ─── Plan de carga ───────────────────────────────────────────────────────────
// Qué va a pasar con cada línea al aprobar. Se calcula ANTES de escribir nada
// y se muestra como vista previa; al confirmar, el servidor lo recalcula con
// datos frescos (el stock pudo cambiar entre la vista previa y el clic).

export type AccionCarga =
  | { tipo: "crear_servicio"; costo: number }
  | { tipo: "reservar_repuesto"; itemId: string; sku: string; precioInventario: number | null }
  | { tipo: "asignar_producto_digital"; productoId: string; etiqueta: string }
  | { tipo: "pendiente"; motivo: string };

export type PasoCarga = { lineaId: string; descripcion: string; subtotal: number; accion: AccionCarga };

export type ContextoCarga = {
  /** Estado actual de los artículos de inventario referenciados. */
  items: Map<string, { sku: string; disponible: boolean; motivoNoDisponible?: string; precio: number | null }>;
  /** Unidades libres por producto del catálogo, en el orden en que se asignan. */
  unidadesDigitales: Map<string, Array<{ productoId: string; etiqueta: string }>>;
};

export function planDeCarga(lineas: LineaPresupuesto[], ctx: ContextoCarga): PasoCarga[] {
  // Si dos líneas piden el mismo producto digital, la segunda no puede
  // recibir la misma unidad: se reparte de a una en orden.
  const digitalesUsados = new Map<string, number>();

  return lineas
    .filter((l) => l.estado === "Propuesta" || l.estado === "Aprobada")
    .map((l): PasoCarga => {
      const base = { lineaId: l.id, descripcion: l.descripcion, subtotal: subtotalLinea(l) };

      if (l.tipo === "Servicio") {
        if (!l.servicioCatalogoId) return { ...base, accion: { tipo: "pendiente", motivo: "Falta elegir el servicio del catálogo." } };
        return { ...base, accion: { tipo: "crear_servicio", costo: subtotalLinea(l) } };
      }

      if (l.tipo === "Repuesto") {
        if (!l.itemId) {
          return { ...base, accion: { tipo: "pendiente", motivo: "Sin artículo de inventario: vincúlalo cuando llegue el repuesto." } };
        }
        const it = ctx.items.get(l.itemId);
        if (!it || !it.disponible) {
          return { ...base, accion: { tipo: "pendiente", motivo: it?.motivoNoDisponible ?? "El artículo ya no está disponible (¿se vendió o reservó?)." } };
        }
        return { ...base, accion: { tipo: "reservar_repuesto", itemId: l.itemId, sku: it.sku, precioInventario: it.precio } };
      }

      // Producto digital
      if (!l.productoCatalogoId) return { ...base, accion: { tipo: "pendiente", motivo: "Falta elegir el producto del catálogo." } };
      const usados = digitalesUsados.get(l.productoCatalogoId) ?? 0;
      digitalesUsados.set(l.productoCatalogoId, usados + 1);
      const unidad = ctx.unidadesDigitales.get(l.productoCatalogoId)?.[usados] ?? null;
      if (!unidad) return { ...base, accion: { tipo: "pendiente", motivo: "No hay unidades disponibles de este producto digital." } };
      return { ...base, accion: { tipo: "asignar_producto_digital", productoId: unidad.productoId, etiqueta: unidad.etiqueta } };
    });
}
