// Garantías SUPER GEEK — reglas PURAS (auditoría ops, punto 20 · 4-nov-2026).
//
// Caso que lo originó: OR000425 (Aida Marcillo). La batería de su Dell XPS
// salió mala y SUPER GEEK la cambia sin costo. El sistema no aceptaba un
// repuesto a $0 y el dueño tuvo que ponerle $1 (OP-2026-000122).
//
// Modelo profesional (Odoo Repairs "under warranty", RepairDesk "warranty
// claim"): el cliente paga $0, pero la pieza SÍ sale del inventario con su
// costo. No es una venta: es un gasto de garantía. Por eso:
//   · La línea del presupuesto lleva "Garantía SUPER GEEK" con su motivo.
//     Un técnico la PROPONE; solo un administrador la CONFIRMA (decisión del
//     dueño, 2-nov). Si la activa un administrador, nace confirmada.
//   · Confirmada = precio $0 y aprobada SIN pasar por el cliente. Se carga
//     igual que cualquier línea (aparta la pieza o crea su solicitud de
//     compra; con precio $0 el anticipo está cubierto solo).
//   · La cuenta cobra $0 por esa pieza aunque el artículo tenga su "Precio
//     venta final" (la calculadora única lo respeta: lib/estado-cuenta).
//   · La factura o el recibo llevan SOLO lo pagado; la pieza en garantía no
//     se marca "Vendido".
//   · Al ENTREGAR (orden → "Finalizado Entregado") la pieza sale del
//     inventario: Kardex "Salida por garantía" con su costo, y el artículo
//     queda "Usado en reparación". Si la orden se reabre, vuelve apartada
//     ("Garantía revertida"). Decisiones del dueño, 4-nov.
//   · Finanzas no se toca: la pieza ya se pagó al comprarla. El gasto de
//     garantía del período se ve en el Kardex (motivo "Salida por garantía").
//   · El cliente ve la línea confirmada en el enlace y el PDF como "Garantía
//     SUPER GEEK · $0", informativa (no la aprueba ni la rechaza). La que
//     solo está propuesta no se le muestra.
//
// Sin red ni Airtable: lo usan la ruta del presupuesto, la calculadora de la
// cuenta, el enlace público, la facturación y la entrega.

import type { LineaPresupuesto, TipoLinea } from "@/lib/tecnicos/presupuesto/reglas";
import { ESTADO_ENTREGADA } from "@/lib/tecnicos/cobros/reglas";
import { aplicarVentaUnidades, comprometerUnidades, normalizarUnidades, type UnidadesItem } from "@/lib/shipping-v2/unidades";

export const ESTADOS_GARANTIA = ["Propuesta", "Confirmada"] as const;
export type EstadoGarantia = "" | (typeof ESTADOS_GARANTIA)[number];

/** Lo que puede ir en garantía: piezas y mano de obra (no licencias). */
export const TIPOS_CON_GARANTIA: readonly TipoLinea[] = ["Repuesto", "Servicio"];

export const MOTIVO_GARANTIA_MIN = 5;
export const MOTIVO_GARANTIA_MAX = 300;

export const ETIQUETA_GARANTIA = "Garantía SUPER GEEK";

/** Estado del artículo después de salir por garantía (decisión del dueño, 4-nov). */
export const ESTADO_ITEM_SALIDA_GARANTIA = "Usado en reparación";
export const MOTIVO_KARDEX_SALIDA = "Salida por garantía";
export const MOTIVO_KARDEX_REVERSA = "Garantía revertida";

/** El mismo "entregada" que usa el panel de Cobros. */
export const ESTADO_ORDEN_ENTREGADA = ESTADO_ENTREGADA;

/** Qué pasa con la pieza mala que se le saca al equipo (dueño, 4-nov). */
export const PIEZAS_RETIRADAS = ["Reclamar al proveedor", "Se desecha", "Se devuelve al cliente"] as const;
export type PiezaRetirada = (typeof PIEZAS_RETIRADAS)[number];
export const RECLAMAR_AL_PROVEEDOR: PiezaRetirada = "Reclamar al proveedor";

export function normalizarPiezaRetirada(v: unknown): PiezaRetirada | "" {
  const t = typeof v === "string" ? v : v && typeof v === "object" && "name" in v ? String((v as { name: unknown }).name ?? "") : "";
  return (PIEZAS_RETIRADAS as readonly string[]).includes(t) ? (t as PiezaRetirada) : "";
}

export function normalizarGarantia(v: unknown): EstadoGarantia {
  const t = typeof v === "string" ? v : v && typeof v === "object" && "name" in v ? String((v as { name: unknown }).name ?? "") : "";
  return (ESTADOS_GARANTIA as readonly string[]).includes(t) ? (t as EstadoGarantia) : "";
}

type LineaConGarantia = Pick<LineaPresupuesto, "garantia">;

export const esGarantiaConfirmada = (l: LineaConGarantia): boolean => normalizarGarantia(l.garantia) === "Confirmada";
export const esGarantiaPropuesta = (l: LineaConGarantia): boolean => normalizarGarantia(l.garantia) === "Propuesta";
export const tieneGarantia = (l: LineaConGarantia): boolean => normalizarGarantia(l.garantia) !== "";

/** El cliente no ve una garantía que todavía no confirma un administrador. */
export const visibleParaCliente = (l: LineaConGarantia): boolean => !esGarantiaPropuesta(l);

// ─── Proponer, confirmar, quitar ─────────────────────────────────────────────

export type AccionGarantia = "proponer" | "confirmar" | "quitar";

export type CambiosGarantia = {
  garantia: EstadoGarantia;
  motivoGarantia?: string;
  garantiaConfirmadaPor?: string;
  /** De qué venta viene (vacío = sin documento). */
  garantiaDe?: string;
  garantiaOrigenId?: string;
  garantiaVence?: string;
  /** Vencida o sin documento: la da un administrador como cortesía. */
  garantiaCortesia?: boolean;
  /** La garantía deja la línea en $0. Al quitarla, el precio se pone a mano. */
  precioUnitario?: number;
};

export type ResultadoGarantia =
  | { ok: true; cambios: CambiosGarantia; /** Aprobar y cargar la línea ya (sin el cliente). */ aprobar: boolean; historial: string }
  | { ok: false; error: string };

/** Lo que el técnico eligió en "¿Qué falló?" (null = sin documento). */
export type OrigenElegido = { clave: string; texto: string; vence: string | null; vigente: boolean };

function textoCortesia(origen: OrigenElegido | null | undefined): string {
  if (!origen) return " — de cortesía (sin documento original)";
  if (!origen.vigente) return ` — de cortesía (la garantía venció${origen.vence ? ` el ${fechaCortaISO(origen.vence)}` : ""})`;
  return "";
}
const fechaCortaISO = (f: string) => { const [y, m, d] = f.slice(0, 10).split("-"); return d && m && y ? `${d}/${m}/${y}` : f; };

export function evaluarGarantia(
  l: Pick<LineaPresupuesto, "tipo" | "estado" | "garantia" | "grupoAlternativas" | "motivoGarantia" | "garantiaCortesia" | "garantiaDe" | "garantiaVence">,
  accion: AccionGarantia,
  quien: { esAdmin: boolean; nombre: string; motivo?: string; origen?: OrigenElegido | null },
): ResultadoGarantia {
  const actual = normalizarGarantia(l.garantia);
  if (!TIPOS_CON_GARANTIA.includes(l.tipo)) return { ok: false, error: "Solo un repuesto o un servicio puede ir en garantía." };
  if (l.estado !== "Propuesta") {
    return { ok: false, error: "La garantía se decide antes de aprobar. Si ya está aprobada, usa \"Modificar\"." };
  }

  if (accion === "proponer") {
    if (actual) return { ok: false, error: "Esta línea ya está en garantía." };
    if (l.grupoAlternativas) return { ok: false, error: "Quita la línea de las alternativas antes de ponerla en garantía." };
    const motivo = (quien.motivo ?? "").trim();
    if (motivo.length < MOTIVO_GARANTIA_MIN) return { ok: false, error: "Escribe el motivo de la garantía." };
    if (motivo.length > MOTIVO_GARANTIA_MAX) return { ok: false, error: `El motivo admite hasta ${MOTIVO_GARANTIA_MAX} caracteres.` };
    const origen = quien.origen ?? null;
    const cortesia = !origen || !origen.vigente;
    const deDonde = {
      garantiaDe: origen?.texto ?? "",
      garantiaOrigenId: origen?.clave ?? "",
      garantiaVence: origen?.vence ?? "",
      garantiaCortesia: cortesia,
    };
    const de = origen ? ` · de ${origen.texto}` : "";
    if (quien.esAdmin) {
      return {
        ok: true,
        cambios: { garantia: "Confirmada", motivoGarantia: motivo, garantiaConfirmadaPor: quien.nombre, precioUnitario: 0, ...deDonde },
        aprobar: true,
        historial: `${ETIQUETA_GARANTIA} confirmada ($0)${textoCortesia(origen)}${de}: ${motivo}`,
      };
    }
    return {
      ok: true,
      cambios: { garantia: "Propuesta", motivoGarantia: motivo, precioUnitario: 0, ...deDonde },
      aprobar: false,
      historial: `${ETIQUETA_GARANTIA} propuesta ($0)${textoCortesia(origen)}${de}, falta que la confirme un administrador: ${motivo}`,
    };
  }

  if (accion === "confirmar") {
    if (!quien.esAdmin) return { ok: false, error: "Solo un administrador confirma una garantía." };
    if (actual !== "Propuesta") return { ok: false, error: "No hay una garantía propuesta que confirmar." };
    return {
      ok: true,
      cambios: { garantia: "Confirmada", garantiaConfirmadaPor: quien.nombre, precioUnitario: 0 },
      aprobar: true,
      historial: `${ETIQUETA_GARANTIA} confirmada ($0)${l.garantiaCortesia ? " de cortesía" : ""}${l.motivoGarantia ? `: ${l.motivoGarantia}` : "."}`,
    };
  }

  // quitar
  if (!actual) return { ok: false, error: "Esta línea no está en garantía." };
  return {
    ok: true,
    cambios: { garantia: "", garantiaConfirmadaPor: "", garantiaDe: "", garantiaOrigenId: "", garantiaVence: "", garantiaCortesia: false },
    aprobar: false,
    historial: `${ETIQUETA_GARANTIA} retirada: la línea vuelve a ser normal, a $0 (si se cobra, bórrala y agrégala con su precio).`,
  };
}

/** Elegir qué pasa con la pieza mala: solo en un repuesto en garantía, antes de reclamarla. */
export function errorPiezaRetirada(
  l: Pick<LineaPresupuesto, "tipo" | "garantia" | "piezaRetiradaSku" | "estado">,
  destino: string,
): string | null {
  if (l.tipo !== "Repuesto" || !tieneGarantia(l)) return "Solo un repuesto en garantía tiene pieza retirada.";
  if (l.estado === "Rechazada") return "La línea ya no está en la orden.";
  if (destino && !(PIEZAS_RETIRADAS as readonly string[]).includes(destino)) return "Destino de la pieza inválido.";
  if (l.piezaRetiradaSku) return `La pieza retirada ya se registró para el reclamo (${l.piezaRetiradaSku}).`;
  return null;
}

/** Al editar una línea en garantía no se le puede poner precio. */
export function errorPrecioEnGarantia(l: LineaConGarantia, precioNuevo: number | undefined): string | null {
  if (!tieneGarantia(l) || precioNuevo === undefined) return null;
  return precioNuevo === 0 ? null : "Una línea en garantía va a $0. Quita la garantía para ponerle precio.";
}

/**
 * "Modificar" devuelve una línea aprobada a Propuesta. Una garantía
 * confirmada vuelve a quedar propuesta: lo que cambie lo confirma otra vez
 * un administrador (y mientras tanto el cliente no la ve).
 */
export function garantiaTrasModificar(l: LineaConGarantia): EstadoGarantia {
  return esGarantiaConfirmada(l) ? "Propuesta" : normalizarGarantia(l.garantia);
}

// ─── La cuenta ───────────────────────────────────────────────────────────────

export type CargosEnGarantia = {
  /** Artículos (Shipping Items) que la cuenta cobra a $0. */
  items: Set<string>;
  /** Servicios por Orden cargados desde una línea en garantía. */
  servicios: Set<string>;
};

/**
 * Qué cargos de la cuenta son garantía confirmada. Solo cuenta lo aprobado
 * (Aprobada o Cargada): una línea quitada o rechazada ya no protege su pieza.
 */
export function cargosEnGarantia(
  lineas: ReadonlyArray<Pick<LineaPresupuesto, "tipo" | "estado" | "garantia" | "itemId" | "cargoServicioId">>,
): CargosEnGarantia {
  const items = new Set<string>();
  const servicios = new Set<string>();
  for (const l of lineas) {
    if (!esGarantiaConfirmada(l) || (l.estado !== "Aprobada" && l.estado !== "Cargada")) continue;
    if (l.tipo === "Repuesto" && l.itemId) items.add(l.itemId);
    if (l.tipo === "Servicio" && l.cargoServicioId) servicios.add(l.cargoServicioId);
  }
  return { items, servicios };
}

/**
 * Piezas malas que hay que registrar para reclamarlas al proveedor: las de
 * repuestos en garantía ya entregados, con destino "Reclamar al proveedor" y
 * todavía sin su artículo en Shipping V2.
 */
export function reclamosPendientes<L extends Pick<LineaPresupuesto, "tipo" | "garantia" | "garantiaEntregada" | "piezaRetirada" | "piezaRetiradaSku">>(lineas: readonly L[]): L[] {
  return lineas.filter((l) => l.tipo === "Repuesto" && esGarantiaConfirmada(l) && l.garantiaEntregada === true
    && l.piezaRetirada === RECLAMAR_AL_PROVEEDOR && !l.piezaRetiradaSku);
}

/** Un repuesto en garantía que se entrega sin decir qué pasó con la pieza mala: aviso. */
export function sinDestinoDePieza(lineas: ReadonlyArray<Pick<LineaPresupuesto, "tipo" | "garantia" | "estado" | "piezaRetirada" | "descripcion">>): string[] {
  return lineas.filter((l) => l.tipo === "Repuesto" && esGarantiaConfirmada(l) && l.estado === "Cargada" && !l.piezaRetirada).map((l) => l.descripcion);
}

/**
 * La cuenta sin lo que va en garantía: el documento de venta lleva solo lo
 * pagado (decisión del dueño, 2-nov). La usa la pre-factura (traductor.ts).
 */
export function sinGarantia<C extends { items: ReadonlyArray<{ garantia?: boolean }>; servicios: ReadonlyArray<{ garantia?: boolean }> }>(cuenta: C): C {
  return { ...cuenta, items: cuenta.items.filter((i) => !i.garantia), servicios: cuenta.servicios.filter((s) => !s.garantia) };
}

// ─── La entrega: la pieza sale (o vuelve) ────────────────────────────────────

export type ArticuloParaGarantia = UnidadesItem & {
  id: string;
  sku: string;
  estado: string;
  recibido: boolean;
  /** Órdenes a las que está apartado ("Orden de Reparación (Stock)"). */
  ordenesStock: readonly string[];
};

export type PasoGarantia =
  | { tipo: "salida" | "revertir"; lineaId: string; itemId: string; sku: string; campos: CamposArticuloGarantia }
  /** Mano de obra en garantía: no mueve inventario, solo queda la fecha de entrega (su nueva garantía cuenta desde ahí). */
  | { tipo: "marcar"; lineaId: string; entregada: boolean }
  | { tipo: "omitir"; lineaId: string; itemId: string | null; sku: string; motivo: string };

export type CamposArticuloGarantia = {
  cantidad: number;
  cantidadReservada: number;
  reservado: boolean;
  /** Solo si cambia. */
  estado?: string;
  disponibleVenta?: boolean;
  /** Marca de la línea ("Garantía entregada"). */
  entregada: boolean;
};

/** Lo que pasa con el artículo cuando la pieza sale por garantía (una unidad). */
export function camposSalidaGarantia(a: UnidadesItem): Omit<CamposArticuloGarantia, "entregada"> {
  const tras = aplicarVentaUnidades(a, 1, { liberaReserva: true });
  // Igual que una venta: el registro se cierra solo cuando se acaba. Un
  // registro de varias unidades sigue vivo con las que quedan.
  return tras.cantidad === 0
    ? { ...tras, estado: ESTADO_ITEM_SALIDA_GARANTIA, disponibleVenta: false }
    : { ...tras };
}

/** La orden se reabrió: la pieza vuelve a la tienda, apartada para la orden. */
export function camposReversaGarantia(a: UnidadesItem & { estado: string }): Omit<CamposArticuloGarantia, "entregada"> {
  const cantidad = normalizarUnidades(a.cantidad) + 1;
  const comp = comprometerUnidades({ cantidad, cantidadReservada: a.cantidadReservada, reservado: false }, 1);
  const reservada = comp.ok ? comp.cantidadReservada : Math.min(cantidad, normalizarUnidades(a.cantidadReservada) + 1);
  const reservado = comp.ok ? comp.reservado : reservada >= cantidad;
  const volvio = a.estado === ESTADO_ITEM_SALIDA_GARANTIA;
  return {
    cantidad,
    cantidadReservada: reservada,
    reservado,
    ...(volvio ? { estado: "Reservado", disponibleVenta: comp.ok ? comp.disponibleVenta : !reservado } : {}),
  };
}

/**
 * Qué hacer con las piezas en garantía de una orden cuando cambia su estado.
 *   · Se entrega  → sale cada pieza confirmada, cargada y apartada para esta
 *                   orden que todavía no salió.
 *   · Se reabre   → vuelve cada pieza que ya había salido.
 * La marca "Garantía entregada" de la línea es lo que evita hacerlo dos veces.
 */
export function planGarantiasDeLaOrden(input: {
  ordenId: string;
  nuevoEstado: string;
  lineas: ReadonlyArray<Pick<LineaPresupuesto, "id" | "tipo" | "estado" | "garantia" | "itemId" | "garantiaEntregada" | "descripcion">>;
  articulos: ReadonlyMap<string, ArticuloParaGarantia>;
}): PasoGarantia[] {
  const entregada = input.nuevoEstado === ESTADO_ORDEN_ENTREGADA;
  const pasos: PasoGarantia[] = [];
  for (const l of input.lineas) {
    if (!esGarantiaConfirmada(l) || l.estado !== "Cargada") continue;
    const ya = l.garantiaEntregada === true;
    if (entregada === ya) continue; // ya está como debe
    if (l.tipo === "Servicio") { pasos.push({ tipo: "marcar", lineaId: l.id, entregada }); continue; }
    if (l.tipo !== "Repuesto") continue;
    const a = l.itemId ? input.articulos.get(l.itemId) : undefined;
    if (!l.itemId || !a) {
      pasos.push({ tipo: "omitir", lineaId: l.id, itemId: l.itemId ?? null, sku: "", motivo: `"${l.descripcion}" no tiene su artículo.` });
      continue;
    }
    if (entregada) {
      if (!a.ordenesStock.includes(input.ordenId)) {
        pasos.push({ tipo: "omitir", lineaId: l.id, itemId: a.id, sku: a.sku, motivo: `${a.sku} ya no está apartado para esta orden.` });
        continue;
      }
      if (!a.recibido) {
        pasos.push({ tipo: "omitir", lineaId: l.id, itemId: a.id, sku: a.sku, motivo: `${a.sku} todavía no llega a la tienda.` });
        continue;
      }
      if (normalizarUnidades(a.cantidad) < 1) {
        pasos.push({ tipo: "omitir", lineaId: l.id, itemId: a.id, sku: a.sku, motivo: `${a.sku} no tiene unidades en la tienda.` });
        continue;
      }
      pasos.push({ tipo: "salida", lineaId: l.id, itemId: a.id, sku: a.sku, campos: { ...camposSalidaGarantia(a), entregada: true } });
    } else {
      pasos.push({ tipo: "revertir", lineaId: l.id, itemId: a.id, sku: a.sku, campos: { ...camposReversaGarantia(a), entregada: false } });
    }
  }
  return pasos;
}
