// Reglas para ELIMINAR un Shipping Item (solo Administrador).
//
// Borrar un registro de Airtable no se puede deshacer, así que la regla es
// conservadora: solo se elimina un item que no dejó rastro de dinero,
// logística ni documentos. Si tiene cualquiera de esos vínculos, el sistema
// explica qué lo bloquea y qué hacer en su lugar (quitarlo del pago, anular
// la factura, etc.). Lo que sí se pierde sin daño (eventos, fotos, la opción
// de una operación ya rechazada) se muestra como aviso antes de confirmar.
//
// Este módulo es puro (sin Airtable) para poder probarlo; la lectura y la
// escritura viven en lib/shipping-v2/airtable.ts (evaluarEliminacionShippingItem
// / eliminarShippingItem).

/**
 * Campos link del item leídos POR ID (no por nombre): si alguien renombra un
 * campo en Airtable, la verificación no puede quedar ciega y dar un falso
 * "se puede borrar". Cualquier vínculo que no esté en esta lista también
 * bloquea (ver `vinculosDesconocidos`).
 */
export const CAMPOS_ITEM = {
  sku: "fldCe4yFR032xDZ8V",
  nombre: "fldIvyL3XnoMMT3i2",
  estado: "fldXg4Y5h2rvytukZ",
  // Bloquean
  pagos: "fldb0ZZAxRSTx1Af8",
  pagosRegalo: "fldze0tIj6IL19rqg",
  packings: "fldIj9gTOtpTD7Xc3",
  recepciones: "fldSMRiYkW7ey9MVS",
  novedades: "fldqChWrJSyhSwNoD",
  migraciones: "fld8DbH8oGIOPmwXC",
  itemPadre: "fldNsZnyq5V5cOCx1",
  itemsHijos: "fldBEn772eSe1fstO",
  operacion: "fldnKX50kzjZRghxl",
  ordenStock: "fldnSAsUGWzMWQQOu",
  factura: "fldA2rvyJmzqP0Sfo",
  notaCredito: "fldC7kGzR0MENqpVz",
  recibo: "fldiPZgq8Pw0dA06A",
  reservas: "fldhKY3r1dDGKyEfh",
  intervenciones1: "fldeb9JVRMuyW4rR6",
  intervenciones2: "fldv5udAghxzATfHo",
  presupuesto: "fld56ubP1rQcohqdk",
  // No bloquean (se pierden sin daño o son catálogos)
  eventos: "fld6a0wcWWooYAezr",
  opcionOrigen: "fldg48EHyUaFbFutj",
  proveedorCompra: "fldvCzej6uvRQJ8aW",
  proveedorLogistico: "fldKmTB85XjOtomyf",
  destinatarios: "fldqlpFo8TPhRr42w",
  conectividad: "fldPZIgwXDr8Wkb9y",
  puertos: "fldY3mY4h84VwnhzV",
  extras: "fld88v5S7ztr40flg",
  fotos: "fldIfhSPM29upwdKY",
  evidencias: "fldnqMaoLOlYtw6m3",
} as const;

/** Vínculos que no impiden borrar: catálogos, proveedores y bitácora. */
const VINCULOS_INOFENSIVOS = new Set<string>([
  CAMPOS_ITEM.eventos, CAMPOS_ITEM.opcionOrigen, CAMPOS_ITEM.proveedorCompra, CAMPOS_ITEM.proveedorLogistico,
  CAMPOS_ITEM.destinatarios, CAMPOS_ITEM.conectividad, CAMPOS_ITEM.puertos, CAMPOS_ITEM.extras,
]);

/** Vínculos que se evalúan con detalle (pagos por estado, presupuesto por estado). */
const VINCULOS_EVALUADOS = new Set<string>(Object.values(CAMPOS_ITEM));

export type ContextoEliminacion = {
  sku: string;
  nombre: string;
  estado: string;
  /** Pagos donde aparece (como item o como regalo), con su estado. */
  pagos: Array<{ codigo: string; estado: string }>;
  /** Líneas de presupuesto de órdenes que apuntan al item. */
  presupuesto: Array<{ descripcion: string; estado: string }>;
  /** Conteo de vínculos por campo (ids de CAMPOS_ITEM). */
  conteo: Partial<Record<string, number>>;
  /** Campos link no reconocidos que tienen algo (bloquean por prudencia). */
  vinculosDesconocidos: string[];
  fotos: number;
};

export type EvaluacionEliminacion = {
  permitido: boolean;
  bloqueos: string[];
  avisos: string[];
  /** Lo que el admin debe escribir para confirmar. */
  confirmacion: string;
};

function n(ctx: ContextoEliminacion, campo: string): number {
  return ctx.conteo[campo] ?? 0;
}

function plural(k: number, uno: string, varios: string) {
  return k === 1 ? `1 ${uno}` : `${k} ${varios}`;
}

export function evaluarEliminacion(ctx: ContextoEliminacion): EvaluacionEliminacion {
  const bloqueos: string[] = [];
  const avisos: string[] = [];
  const C = CAMPOS_ITEM;

  if (ctx.estado.trim().toLowerCase() === "vendido") {
    bloqueos.push("El item está Vendido. Una venta no se borra: se revierte con nota de crédito o anulando el recibo.");
  }

  // Documentos de venta
  if (n(ctx, C.factura) > 0) bloqueos.push("Tiene factura electrónica vinculada. Anúlala o emite nota de crédito; el item queda como respaldo del documento.");
  if (n(ctx, C.notaCredito) > 0) bloqueos.push("Tiene nota de crédito vinculada: es respaldo tributario y no se puede perder.");
  if (n(ctx, C.recibo) > 0) bloqueos.push("Tiene recibo vinculado. El recibo necesita el item como respaldo.");
  if (n(ctx, C.reservas) > 0) bloqueos.push("Tiene reservas de clientes. Cancela o libera la reserva primero.");

  // Técnicos / órdenes / operaciones
  if (n(ctx, C.ordenStock) > 0) bloqueos.push("Está cargado como repuesto en una orden de reparación. Quítalo desde la tarjeta Repuestos de la orden.");
  if (n(ctx, C.operacion) > 0) bloqueos.push("Está vinculado a una Operación Comercial activa (se cobra en la cuenta de la orden). Primero usa \"El cliente desiste\" o \"Liberar a inventario\" en el presupuesto de la orden.");
  const lineasActivas = ctx.presupuesto.filter((l) => l.estado.trim().toLowerCase() !== "rechazada");
  if (lineasActivas.length > 0) {
    bloqueos.push(`Está en ${plural(lineasActivas.length, "línea de presupuesto activa", "líneas de presupuesto activas")} (${lineasActivas.map((l) => `${l.descripcion || "sin descripción"}: ${l.estado}`).join("; ")}). Recházalas o desiste primero.`);
  }

  // Dinero con proveedores
  const pagosVivos = ctx.pagos.filter((p) => p.estado.trim().toLowerCase() !== "anulado");
  if (pagosVivos.length > 0) {
    bloqueos.push(`Está incluido en ${pagosVivos.map((p) => `${p.codigo || "un pago"} (${p.estado || "sin estado"})`).join(", ")}. Quítalo del pago o anula el pago en /shipping-v2/pagos. Si ya se pagó y lo devolviste, registra el reembolso como novedad en lugar de borrarlo.`);
  }
  const pagosAnulados = ctx.pagos.length - pagosVivos.length;
  if (pagosAnulados > 0) avisos.push(`Aparece en ${plural(pagosAnulados, "pago anulado", "pagos anulados")}; ese pago quedará sin este item en su lista.`);

  // Logística
  if (n(ctx, C.packings) > 0) bloqueos.push("Está dentro de un packing. Quítalo del packing primero (afecta el reparto de flete y arancel).");
  if (n(ctx, C.recepciones) > 0) bloqueos.push("Tiene una recepción registrada. La recepción es el respaldo de lo que llegó.");
  if (n(ctx, C.novedades) > 0) bloqueos.push("Tiene novedades registradas (garantía, daño, faltante). Son el respaldo del reclamo al proveedor.");
  if (n(ctx, C.migraciones) > 0) bloqueos.push("Viene de una migración: su registro de migración lo necesita.");
  if (n(ctx, C.intervenciones1) + n(ctx, C.intervenciones2) > 0) bloqueos.push("Tiene intervenciones técnicas registradas.");
  if (n(ctx, C.itemPadre) > 0) bloqueos.push("Es una pieza de un despiece. Quítala desde el despiece del equipo padre.");
  if (n(ctx, C.itemsHijos) > 0) bloqueos.push("Tiene piezas de despiece. Borrarlo dejaría esas piezas huérfanas.");

  for (const campo of ctx.vinculosDesconocidos) {
    bloqueos.push(`Tiene un vínculo que el portal no reconoce (${campo}). Por prudencia no se borra; revísalo en Airtable.`);
  }

  // Lo que se pierde sin daño
  const eventos = n(ctx, C.eventos);
  if (eventos > 0) avisos.push(`Su historial (${plural(eventos, "evento", "eventos")}) queda guardado, pero sin enlace al item. Se registra un evento final con una copia de sus datos.`);
  if (n(ctx, C.opcionOrigen) > 0) avisos.push("La opción de la Operación Comercial de origen quedará sin artículo (la operación ya no lo usa).");
  if (ctx.fotos > 0) avisos.push(`Se pierden ${plural(ctx.fotos, "foto o evidencia", "fotos y evidencias")} del item.`);
  if (ctx.sku) avisos.push(`El SKU ${ctx.sku} queda libre: si es el último de su serie, el próximo item de esa categoría podría recibir el mismo número. Si ya imprimiste su etiqueta, destrúyela.`);

  return {
    permitido: bloqueos.length === 0,
    bloqueos,
    avisos,
    confirmacion: (ctx.sku || ctx.nombre || "ELIMINAR").trim(),
  };
}

/** Compara lo que escribió el admin con lo esperado (sin distinguir mayúsculas/espacios). */
export function confirmacionValida(esperada: string, escrita: unknown): boolean {
  if (typeof escrita !== "string") return false;
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase();
  return norm(esperada).length > 0 && norm(esperada) === norm(escrita);
}

/**
 * Detecta campos link no contemplados: valores que son listas de record ids
 * ("rec…") en campos que no están en CAMPOS_ITEM. Así, si mañana se agrega en
 * Airtable un vínculo nuevo al item, borrar queda bloqueado hasta revisarlo.
 */
export function detectarVinculosDesconocidos(campos: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const [id, valor] of Object.entries(campos)) {
    if (VINCULOS_EVALUADOS.has(id) || VINCULOS_INOFENSIVOS.has(id)) continue;
    if (Array.isArray(valor) && valor.length > 0 && valor.every((v) => typeof v === "string" && /^rec[A-Za-z0-9]{14}$/.test(v))) {
      out.push(id);
    }
  }
  return out;
}
