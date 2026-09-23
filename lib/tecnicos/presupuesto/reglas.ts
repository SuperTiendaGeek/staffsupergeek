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

/** Qué tan indispensable es la línea para la reparación.
 *   Necesaria   → sin esto no se puede reparar.
 *   Recomendada → el técnico lo aconseja, pero la reparación sigue sin ello.
 *   Opcional    → mejora sugerida.
 *  Una línea sin valor (creada antes de existir el campo) cuenta como Recomendada. */
export const PRIORIDADES = ["Necesaria", "Recomendada", "Opcional"] as const;
export type Prioridad = (typeof PRIORIDADES)[number];
export const NOTA_CLIENTE_MAX = 500;
export function normalizarPrioridad(v: unknown): Prioridad {
  return (PRIORIDADES as readonly string[]).includes(String(v)) ? (v as Prioridad) : "Recomendada";
}
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
  /** Repuesto BAJO PEDIDO. Mientras es presupuesto, sus datos viven en la
   *  línea; la operación comercial se crea recién cuando el cliente aprueba. */
  bajoPedido:         boolean;
  proveedorId:        string | null;
  urlProveedor:       string;
  costoProveedor:     number | null;
  tiempoEstimado:     string;
  categoria:          string;
  /** La operación comercial (existe desde que el cliente aprobó). */
  operacionId:        string | null;
  /** Bitácora: aprobaciones, recotizaciones, cancelaciones. */
  historial:          string;
  aprobadoPor:        string;
  fechaAprobacion:    string;
  creadoPor:          string;
  prioridad?:         Prioridad;
  /** Explicación para el cliente (enlace y PDF). */
  notaCliente?:       string;
  /** Líneas con el mismo grupo son alternativas: el cliente elige solo una. */
  grupoAlternativas?: string;
  /** Última respuesta del cliente desde el enlace público (si hubo). */
  respuestaCliente?:  "Aprobó" | "No aprobó" | "";
  /** Huella de lo que vio al responder (ver enlace-reglas.ts). */
  huellaRespondida?:  string;
  fechaRespuestaCliente?: string;
};

/** Datos de un repuesto que se trae BAJO PEDIDO (se vuelven la opción
 *  elegida de una Operación Comercial). */
export type DatosBajoPedido = {
  proveedorId:     string;
  categoria:       string;
  costoProveedor?: number | null;
  urlProveedor?:   string;
  tiempoEstimado?: string;
};

export type NuevaLineaInput = {
  tipo:               TipoLinea;
  descripcion:        string;
  cantidad:           number;
  precioUnitario:     number;
  servicioCatalogoId?: string | null;
  itemId?:            string | null;
  productoCatalogoId?: string | null;
  bajoPedido?:        DatosBajoPedido | null;
  prioridad?:         Prioridad;
  notaCliente?:       string;
};

// Categorías de la Operación Comercial que tiene sentido pedir como repuesto.
// Es la misma lista de opciones que "Categoría" de Operación Comercial y de
// Shipping Items (el artículo la copia tal cual al nacer); se dejan fuera los
// equipos completos (Laptop, Desktop, All in One, Monitor, Consola).
export const CATEGORIAS_REPUESTO_PEDIDO = [
  "Repuesto", "Pantalla", "Batería", "Teclado", "Cargador", "RAM", "SSD", "HDD",
  "Mainboard", "Tarjeta gráfica", "Fuente de poder", "Cable", "Accesorio", "Otro",
] as const;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const subtotalLinea = (l: Pick<LineaPresupuesto, "cantidad" | "precioUnitario">) =>
  round2((l.cantidad || 0) * (l.precioUnitario || 0));

/**
 * Validación de una línea nueva (o editada). Devuelve el error para el
 * usuario, o null si está bien. La usan el formulario y el servidor.
 */
export function validarLinea(l: NuevaLineaInput): string | null {
  if (!TIPOS_LINEA.includes(l.tipo)) return "Tipo de línea inválido.";
  if (l.prioridad !== undefined && !(PRIORIDADES as readonly string[]).includes(l.prioridad)) return "Prioridad inválida.";
  if ((l.notaCliente ?? "").length > NOTA_CLIENTE_MAX) return `La nota para el cliente admite hasta ${NOTA_CLIENTE_MAX} caracteres.`;
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
  if (l.bajoPedido) {
    if (l.tipo !== "Repuesto") return "Solo un repuesto se puede traer bajo pedido.";
    if (l.itemId) return "Un repuesto bajo pedido todavía no está en inventario: no lleva artículo.";
    if (!l.bajoPedido.proveedorId) return "Elige el proveedor al que se le va a pedir (así queda su pago pendiente en Shipping).";
    if (!(CATEGORIAS_REPUESTO_PEDIDO as readonly string[]).includes(l.bajoPedido.categoria)) return "Elige la categoría del repuesto.";
    if (!(l.precioUnitario > 0)) return "Falta el precio de venta al cliente.";
    // El costo es lo que se le va a pagar al proveedor: sin él, el pago
    // pendiente en /shipping-v2/pagos queda en $0 y marcado como incompleto.
    const costo = l.bajoPedido.costoProveedor;
    if (costo == null || !Number.isFinite(costo)) return "Falta el costo del proveedor (es lo que queda pendiente de pago en Shipping).";
    if (costo < 0) return "El costo del proveedor no puede ser negativo.";
    // Una operación genera un solo artículo (ver crearShippingItemDesdeOpcion),
    // así que cada repuesto bajo pedido es una unidad por línea.
    if (l.cantidad !== 1) return "Un repuesto bajo pedido va de a una unidad por línea. Agrega otra línea para otra unidad.";
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

// ─── Repuesto bajo pedido: estado derivado de la operación ───────────────────
// La tarjeta NO guarda una copia del estado de la operación: lo lee siempre
// del registro real, porque la operación también se mueve desde el tablero de
// Operaciones (y el cron diario auto-rechaza las cotizaciones sin gestión).

export type InfoPedido = {
  operacionId:     string;
  codigo:          string;
  estadoOperacion: string;          // Requerimiento | Cotizado | Aprobado | Pedido | Entregado | Rechazado
  opcionElegidaId: string | null;
  proveedorNombre: string;
  urlProveedor:    string;
  costoProveedor:  number | null;
  precioCliente:   number | null;
  tiempoEstimado:  string;
  /** Artículo en Shipping Items (existe desde que la operación pasó a Pedido). */
  item: {
    id: string; sku: string; recibido: boolean;
    estado?: string;
    /** Pagos a proveedor vinculados que no están anulados. */
    pagos?: Array<{ id: string; codigo: string; estado: string }>;
  } | null;
};

export type FasePedido =
  | "articulo_cancelado"   // el artículo se canceló en Shipping (el proveedor no lo tenía)
  | "vendido"              // ya se facturó o se emitió recibo
  | "cotizado"             // propuesta al cliente, esperando respuesta
  | "vencido"              // rechazado (por el cliente o por el cron de 15 días)
  | "esperando_pedido"     // el cliente aprobó; falta comprarlo
  | "en_camino"            // ya se pidió: tiene SKU, falta que llegue
  | "recibido"             // llegó a la tienda
  | "sin_articulo";        // en Pedido pero el artículo no se pudo crear (revisar)

const norm = (v?: string) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export function fasePedido(p: InfoPedido): FasePedido {
  if (p.item) {
    const e = norm(p.item.estado);
    if (e === "cancelado" || e === "archivado") return "articulo_cancelado";
    if (e === "vendido") return "vendido";
    return p.item.recibido ? "recibido" : "en_camino";
  }
  const e = p.estadoOperacion;
  if (e === "Rechazado") return "vencido";
  if (e === "Aprobado") return "esperando_pedido";
  if (e === "Pedido" || e === "Entregado") return "sin_articulo";
  return "cotizado";
}

// ─── Plan de carga ───────────────────────────────────────────────────────────
// Qué va a pasar con cada línea al aprobar. Se calcula ANTES de escribir nada
// y se muestra como vista previa; al confirmar, el servidor lo recalcula con
// datos frescos (el stock pudo cambiar entre la vista previa y el clic).

export type AccionCarga =
  | { tipo: "crear_pedido_aprobado" }
  | { tipo: "aprobar_pedido"; operacionId: string; codigo: string }
  | { tipo: "ya_en_inventario"; sku: string }
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
  /** Estado real de la operación de cada repuesto bajo pedido, por operacionId. */
  pedidos?: Map<string, InfoPedido>;
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

      // Bajo pedido que todavía es solo presupuesto: al aprobar se crea la
      // operación comercial directamente en "Aprobado". Antes de eso no existe
      // (no consume código ni llena el tablero con cotizaciones muertas).
      if (l.tipo === "Repuesto" && l.bajoPedido && !l.operacionId) {
        if (!l.proveedorId || l.costoProveedor === null || !(l.precioUnitario > 0)) {
          return { ...base, accion: { tipo: "pendiente", motivo: "Faltan datos del pedido (proveedor, costo o precio)." } };
        }
        return { ...base, accion: { tipo: "crear_pedido_aprobado" } };
      }

      if (l.tipo === "Repuesto" && l.operacionId) {
        const p = ctx.pedidos?.get(l.operacionId);
        if (!p) return { ...base, accion: { tipo: "pendiente", motivo: "No se encontró la operación comercial de este repuesto." } };
        const fase = fasePedido(p);
        if (fase === "vencido") {
          return { ...base, accion: { tipo: "pendiente", motivo: `La cotización ${p.codigo} está rechazada o venció. Reactívala antes de aprobar.` } };
        }
        if (fase === "en_camino" || fase === "recibido" || fase === "vendido") return { ...base, accion: { tipo: "ya_en_inventario", sku: p.item!.sku } };
        if (fase === "articulo_cancelado") return { ...base, accion: { tipo: "pendiente", motivo: "El artículo se canceló en Shipping. Recotiza este repuesto." } };
        if (!p.opcionElegidaId) return { ...base, accion: { tipo: "pendiente", motivo: `La operación ${p.codigo} no tiene opción elegida.` } };
        return { ...base, accion: { tipo: "aprobar_pedido", operacionId: p.operacionId, codigo: p.codigo } };
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

// ─── Sincronizar la línea con su operación ───────────────────────────────────
// La operación puede avanzar sin pasar por la tarjeta (alguien la aprueba o la
// pide desde el tablero de Operaciones). Para que no queden dos verdades, la
// línea se pone al día con lo que diga la operación. Devuelve solo lo que hay
// que escribir; null si ya está al día.

export type CambioSincronizacion = Partial<Pick<LineaPresupuesto, "estado" | "itemId" | "notaCarga">> & {
  aprobadoPor?: string;
};

export function sincronizarConPedido(l: LineaPresupuesto, p: InfoPedido | undefined): CambioSincronizacion | null {
  if (!l.operacionId || !p) return null;
  if (l.estado === "Rechazada") return null; // lo decidió la tarjeta: se respeta
  const fase = fasePedido(p);

  // Ya existe el artículo: el repuesto está en la cuenta de la orden por el
  // vínculo orden↔operación. La línea queda Cargada apuntando a ese SKU.
  if (fase === "articulo_cancelado") {
    return l.notaCarga.includes("se canceló en Shipping") ? null
      : { notaCarga: `El artículo ${p.item!.sku} se canceló en Shipping. Recotiza o cancela esta línea.` };
  }
  if (p.item && (l.estado !== "Cargada" || l.itemId !== p.item.id)) {
    return {
      estado: "Cargada",
      itemId: p.item.id,
      notaCarga: "",
      ...(l.estado === "Propuesta" ? { aprobadoPor: "Operaciones" } : {}),
    };
  }
  // Aprobada desde Operaciones sin pasar por la tarjeta.
  if (l.estado === "Propuesta" && (fase === "esperando_pedido" || fase === "sin_articulo")) {
    return { estado: "Aprobada", aprobadoPor: "Operaciones", notaCarga: "Esperando pedido al proveedor." };
  }
  // Rechazada en Operaciones después de que el cliente aprobó: se avisa, no se
  // borra nada — alguien tiene que decidir qué pasó.
  if (l.estado === "Aprobada" && fase === "vencido" && !l.notaCarga.includes("rechazada en Operaciones")) {
    return { notaCarga: `La operación ${p.codigo} fue rechazada en Operaciones. Reactívala o rechaza esta línea.` };
  }
  return null;
}

// ─── Reversas: qué se puede deshacer en cada momento ─────────────────────────
// Cada situación tiene un camino. Cuando algo NO se puede deshacer desde aquí
// (ya se pagó al proveedor, ya se facturó), se dice por qué y dónde se hace,
// en vez de dejar el botón muerto.
//
//   cancelar   → el cliente desiste. La línea queda Rechazada.
//   recotizar  → el proveedor no lo tiene / hay otra alternativa. La línea
//                queda Rechazada (constancia) y se abre una nueva propuesta
//                con los mismos datos para editar y volver a aprobar.
//   liberar    → el repuesto YA LLEGÓ y el cliente desiste: queda como
//                inventario de la tienda, sin cobrárselo al cliente.
//
// El dinero abonado no se toca: queda a favor en la orden (el panel de cobros
// lo marca como "Abonos de más") para aplicarlo a la alternativa o, si se le
// devuelve al cliente, anular el abono en la tarjeta Abonos.

export type AccionReversa = "cancelar" | "recotizar" | "liberar";
export type Reversa = { permitido: boolean; motivo?: string };
export type ReversasLinea = Record<AccionReversa, Reversa>;

const NO = (motivo: string): Reversa => ({ permitido: false, motivo });
const SI: Reversa = { permitido: true };

export function reversasDisponibles(l: LineaPresupuesto, p: InfoPedido | undefined): ReversasLinea {
  const ninguna = { cancelar: NO("No aplica."), recotizar: NO("No aplica."), liberar: NO("No aplica.") };
  if (l.estado === "Propuesta" || l.estado === "Rechazada") return ninguna;
  const esPedido = l.bajoPedido || !!l.operacionId;

  // Aprobada sin cargar: todavía no se compró ni se reservó nada.
  if (l.estado === "Aprobada" && !p?.item) {
    return {
      cancelar: SI,
      recotizar: esPedido ? SI : NO("Solo un repuesto bajo pedido se recotiza. Cancela y agrega otra línea."),
      liberar: NO("Todavía no hay artículo."),
    };
  }

  // Cargada: servicio, repuesto de stock o producto digital se quitan desde
  // su tarjeta, como siempre. Aquí solo se gestiona lo bajo pedido.
  if (!esPedido || !p?.item) {
    const msg = "Ya está cargado a la orden: quítalo desde su tarjeta (Servicios, Repuestos o Productos digitales).";
    return { cancelar: NO(msg), recotizar: NO(msg), liberar: NO(msg) };
  }

  const fase = fasePedido(p);
  if (fase === "vendido") {
    const msg = "Ya se facturó o se emitió recibo: corresponde una nota de crédito o la anulación del recibo.";
    return { cancelar: NO(msg), recotizar: NO(msg), liberar: NO(msg) };
  }
  if (fase === "articulo_cancelado") {
    return { cancelar: SI, recotizar: SI, liberar: NO("El artículo está cancelado.") };
  }
  if (fase === "recibido") {
    const msg = "El repuesto ya llegó. Si el cliente no lo quiere, usa \"Liberar a inventario\"; si llegó dañado, regístralo como novedad en Recepción.";
    return { cancelar: NO(msg), recotizar: NO(msg), liberar: SI };
  }

  // En camino: se puede deshacer solo si todavía no hay dinero comprometido
  // con el proveedor.
  const pago = (p.item.pagos ?? [])[0];
  if (pago) {
    const pagado = norm(pago.estado) === "pagado";
    const msg = pagado
      ? `Ya se le pagó al proveedor (${pago.codigo}). Cuando llegue, usa "Liberar a inventario"; si no va a llegar, registra el reembolso como novedad en Shipping V2 y anula el pago antes de cancelar.`
      : `Está incluido en el pago ${pago.codigo} (${pago.estado}). Quítalo de ese pago o anúlalo en /shipping-v2/pagos y vuelve a intentar.`;
    return { cancelar: NO(msg), recotizar: NO(msg), liberar: NO("Todavía no llega.") };
  }
  return { cancelar: SI, recotizar: SI, liberar: NO("Todavía no llega.") };
}

/** Línea de bitácora con fecha (Ecuador) y usuario. */
export function entradaHistorial(texto: string, usuario: string, ahora: Date = new Date()): string {
  const f = new Date(ahora.getTime() - 5 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " ");
  return `[${f}] ${usuario}: ${texto}`;
}


// ─── Alternativas ────────────────────────────────────────────────────────────
// Varias líneas con el mismo "Grupo de alternativas" son opciones excluyentes
// (p. ej. pantalla original o genérica): se aprueba como máximo UNA.

/** Prioridad de un grupo: la más exigente de sus líneas. */
export function prioridadDeGrupo(lineas: Array<Pick<LineaPresupuesto, "prioridad">>): Prioridad {
  const ps = lineas.map((l) => normalizarPrioridad(l.prioridad));
  return ps.includes("Necesaria") ? "Necesaria" : ps.includes("Recomendada") ? "Recomendada" : "Opcional";
}

/**
 * Antes de aprobar/cargar: impide aprobar dos alternativas del mismo grupo,
 * o una alternativa cuando ya hay otra aprobada. Devuelve el motivo o null.
 */
export function conflictoAlternativas(todas: LineaPresupuesto[], elegidas: string[]): string | null {
  const set = new Set(elegidas);
  const porGrupo = new Map<string, LineaPresupuesto[]>();
  for (const l of todas) if (l.grupoAlternativas) porGrupo.set(l.grupoAlternativas, [...(porGrupo.get(l.grupoAlternativas) ?? []), l]);
  for (const miembros of porGrupo.values()) {
    const sel = miembros.filter((l) => set.has(l.id));
    if (sel.length > 1) return `"${sel.map((l) => l.descripcion).join('" y "')}" son alternativas: el cliente elige solo una.`;
    if (sel.length === 1) {
      const otra = miembros.find((l) => !set.has(l.id) && (l.estado === "Aprobada" || l.estado === "Cargada"));
      if (otra) return `Ya está aprobada la alternativa "${otra.descripcion}". Cancélala antes de aprobar "${sel[0].descripcion}".`;
    }
  }
  return null;
}

/** Otras alternativas del grupo que siguen en Propuesta (se rechazan al elegir una). */
export function hermanasPropuestas(todas: LineaPresupuesto[], elegida: LineaPresupuesto): LineaPresupuesto[] {
  if (!elegida.grupoAlternativas) return [];
  return todas.filter((l) => l.id !== elegida.id && l.grupoAlternativas === elegida.grupoAlternativas && l.estado === "Propuesta");
}

/** Clave corta para un grupo nuevo de alternativas. */
export function nuevoGrupoAlternativas(): string {
  return `ALT-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, "0")}`;
}


// ─── El presupuesto y las tarjetas de la orden van juntos ────────────────────
// Un cargo creado desde el presupuesto se puede quitar después desde SU
// tarjeta (Servicios, Repuestos, Productos digitales) — es el camino natural
// cuando el cliente se arrepiente. Si eso pasa, la línea NO puede quedar
// "Cargada": vuelve a "Aprobada" (aprobada por el cliente, pendiente de
// cargar) para que el técnico decida si la vuelve a cargar o la rechaza.

// null = no se pudo leer esa fuente; entonces no se revisa (no se toca nada).
export type CargosPresentes = {
  /** Record ids de "Servicios por Orden" vigentes en la orden. */
  servicios: ReadonlySet<string> | null;
  /** Record ids de productos digitales asignados a la orden. */
  digitales: ReadonlySet<string> | null;
  /** Record ids de Shipping Items reservados a la orden (repuestos de stock). */
  itemsEnOrden: ReadonlySet<string> | null;
};

export type CargaPerdida = { lineaId: string; nota: string };

/** Líneas Cargadas cuyo cargo ya no existe en la orden. */
export function cargasPerdidas(lineas: LineaPresupuesto[], p: CargosPresentes): CargaPerdida[] {
  const out: CargaPerdida[] = [];
  for (const l of lineas) {
    if (l.estado !== "Cargada") continue;
    // Bajo pedido: su estado lo gobierna la operación (ver sincronizarConPedido).
    if (l.operacionId) continue;
    if (l.tipo === "Servicio" && l.cargoServicioId && p.servicios && !p.servicios.has(l.cargoServicioId)) {
      out.push({ lineaId: l.id, nota: "Se quitó el servicio desde la tarjeta Servicios. Vuelve a cargarla o recházala." });
    } else if (l.tipo === "Producto digital" && l.cargoProductoDigitalId && p.digitales && !p.digitales.has(l.cargoProductoDigitalId)) {
      out.push({ lineaId: l.id, nota: "Se quitó la licencia desde la tarjeta Productos digitales. Vuelve a cargarla o recházala." });
    } else if (l.tipo === "Repuesto" && l.itemId && p.itemsEnOrden && !p.itemsEnOrden.has(l.itemId)) {
      out.push({ lineaId: l.id, nota: "Se quitó el repuesto desde la tarjeta Repuestos. Vuelve a cargarla o recházala." });
    }
  }
  return out;
}

/** Cargos de la orden que NO salieron de una línea del presupuesto. */
export function cargosSinPresupuesto(lineas: LineaPresupuesto[], p: CargosPresentes) {
  const deLineas = new Set<string>();
  for (const l of lineas) {
    if (l.cargoServicioId) deLineas.add(l.cargoServicioId);
    if (l.cargoProductoDigitalId) deLineas.add(l.cargoProductoDigitalId);
    if (l.itemId && (l.estado === "Cargada" || l.estado === "Aprobada")) deLineas.add(l.itemId);
  }
  const contar = (ids: ReadonlySet<string> | null) => (ids ? [...ids].filter((x) => !deLineas.has(x)).length : 0);
  const servicios = contar(p.servicios);
  const repuestos = contar(p.itemsEnOrden);
  const digitales = contar(p.digitales);
  return { servicios, repuestos, digitales, total: servicios + repuestos + digitales };
}
