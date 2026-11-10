// Solicitudes de compra — reglas PURAS (auditoría ops, Fase 2: puntos 9, 3, 8
// y 12). Sin servidor, sin Airtable, sin reloj propio.
//
// Una SOLICITUD es lo que hay que comprar para un cliente: una línea "bajo
// pedido" del presupuesto de una orden, o la opción aprobada de un pedido de
// cliente (Operaciones). Nace sola cuando el cliente aprueba; la COMPRA la
// hace siempre una persona de Staff en "Registrar compra" (la única pantalla
// de compras), igual que NetSuite (special order) y Odoo (Make to Order): la
// necesidad se crea sola, la compra la confirma alguien.
//
// Lo que ve el técnico en la orden (decisión del dueño, 1-nov-2026): un chip
// por repuesto que dice qué falta.
//   · Esperando pago del cliente — aprobó, pero no ha pagado ese repuesto.
//   · Falta pedir · 3 días       — pagado y nadie lo compró (rojo desde el 3.º día).
//   · Comprado · falta pagar al proveedor — está en una orden de compra que debe.
//   · En camino                  — comprado y pagado, no ha llegado.
//   · Llegó ✓ REP-000137         — Recepción lo marcó "Recibido" (decisión C).
//   · Instalado / entregado      — se vendió con su documento.
//   · Cancelado                  — con su motivo.
//
// Ejemplo real: OR000525 (Víctor Cabascango) aprobó un teclado y no ha
// pagado → "Esperando pago del cliente". Abona el precio completo → "Falta
// pedir · 0 días" y Maritza lo ve en la bandeja "Por comprar".

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const TOLERANCIA = 0.01;
const dinero = (n: number) => `$${r2(n).toFixed(2)}`;

import { CATEGORIAS_REPUESTO_STOCK, esCategoriaDeRepuesto } from "@/lib/shipping-v2/mejoras";
import { esCategoriaLicencia } from "@/lib/productos-digitales/compra";
import { anticipoRequerido } from "@/lib/pedidos-especiales/reglas";

export type EstadoSolicitud = "Por comprar" | "Comprada" | "Entregada" | "Cancelada";
export const ESTADOS_SOLICITUD: readonly EstadoSolicitud[] = ["Por comprar", "Comprada", "Entregada", "Cancelada"];

/** Días sin comprar a partir de los cuales el chip se pone rojo. */
export const DIAS_ALERTA = 3;

export type SolicitudBase = {
  id: string;
  codigo: string;
  descripcion: string;
  estado: EstadoSolicitud;
  cantidad: number;
  /** Por unidad, con IVA: lo que aprobó el cliente. */
  precioCliente: number;
  /** ISO. */
  fechaAprobacion: string;
  motivo?: string;
};

/** El artículo de inventario que cumple la solicitud (si ya existe). */
export type ArticuloDeSolicitud = {
  id: string;
  sku: string;
  recibido: boolean;
  /** "Estado Item" de Shipping (Vendido, Cancelado, En tránsito…). */
  estado: string;
  /** Lo que el proveedor todavía no cobró en su orden de compra (0 = pagado). */
  faltaPagarProveedor: number;
  /** Rastreo o caja, para el chip "En camino". */
  rastreo?: string;
};

// ─── Clave única ─────────────────────────────────────────────────────────────
// Una sola solicitud por línea de presupuesto o por opción de un pedido: el
// servidor busca la clave antes de crear. Aprobar dos veces no crea dos.

export const claveDeLinea = (lineaId: string) => `linea:${lineaId}`;
export const claveDeOpcion = (opcionId: string) => `opcion:${opcionId}`;

// ─── Anticipo ────────────────────────────────────────────────────────────────

export type Cobertura =
  | { tipo: "cubierta" }
  | { tipo: "parcial"; pagado: number; precio: number }
  | { tipo: "sin_pago"; precio: number };

/**
 * Regla del dueño (2-nov-2026): un repuesto bajo pedido se compra cuando lo
 * pagado por la cuenta alcanza para SU PRECIO COMPLETO. Lo pagado se reparte
 * entre los repuestos en el orden en que el cliente los aprobó; los
 * cancelados no cuentan.
 * Ej.: OR000507 pagó $50; aprobó bisagras $30, tapa $15 y cover $60 →
 * bisagras y tapa cubiertas ($45), cover con anticipo parcial de $5.
 */
export function coberturaAnticipo(
  solicitudes: ReadonlyArray<Pick<SolicitudBase, "id" | "estado" | "cantidad" | "precioCliente" | "fechaAprobacion"> & { categoria?: string }>,
  totalPagado: number,
  /**
   * "por_repuesto" (órdenes y pedidos viejos): cada repuesto se cubre con su
   * precio completo, en el orden en que se aprobó. "pedido_especial" (punto
   * 10, decisión del dueño 10-nov): el anticipo se mide sobre todo el pedido
   * con la regla de tramos (anticipoRequerido) y vale para todas sus compras.
   */
  modo: "por_repuesto" | "pedido_especial" = "por_repuesto",
): Map<string, Cobertura> {
  const out = new Map<string, Cobertura>();
  let queda = r2(Math.max(0, totalPagado));
  // Punto 5B-2 (dueño, 7-nov-2026): una licencia se compra en cuanto el
  // cliente aprueba, sin abono; tampoco consume lo pagado para los repuestos.
  for (const s of solicitudes) if (s.estado !== "Cancelada" && esCategoriaLicencia(s.categoria)) out.set(s.id, { tipo: "cubierta" });
  const vivas = solicitudes
    .filter((s) => s.estado !== "Cancelada" && !esCategoriaLicencia(s.categoria))
    .slice()
    .sort((a, b) => (a.fechaAprobacion || "").localeCompare(b.fechaAprobacion || "") || a.id.localeCompare(b.id));
  if (modo === "pedido_especial") {
    const total = r2(vivas.reduce((sum, s) => sum + Math.max(1, s.cantidad || 1) * (s.precioCliente || 0), 0));
    const anticipo = anticipoRequerido(total);
    for (const s of vivas) {
      if (anticipo <= TOLERANCIA || queda + TOLERANCIA >= anticipo) out.set(s.id, { tipo: "cubierta" });
      else if (queda > TOLERANCIA) out.set(s.id, { tipo: "parcial", pagado: queda, precio: anticipo });
      else out.set(s.id, { tipo: "sin_pago", precio: anticipo });
    }
    return out;
  }
  for (const s of vivas) {
    const precio = r2(Math.max(1, s.cantidad || 1) * (s.precioCliente || 0));
    if (precio <= TOLERANCIA || queda + TOLERANCIA >= precio) {
      out.set(s.id, { tipo: "cubierta" });
      queda = r2(Math.max(0, queda - precio));
    } else if (queda > TOLERANCIA) {
      out.set(s.id, { tipo: "parcial", pagado: queda, precio });
      queda = 0;
    } else {
      out.set(s.id, { tipo: "sin_pago", precio });
    }
  }
  return out;
}

// ─── El chip ─────────────────────────────────────────────────────────────────

export type ClaveSituacion =
  | "esperando_pago"
  | "falta_pedir"
  | "falta_pagar_proveedor"
  | "en_camino"
  | "llego"
  | "entregado"
  | "cancelado";

export type Tono = "neutro" | "exito" | "aviso" | "peligro" | "info";

export type Situacion = { clave: ClaveSituacion; texto: string; tono: Tono; dias: number };

/** Días completos entre dos fechas ("aaaa-mm-dd" o ISO), nunca negativo. */
export function diasEntre(desde: string, hoy: string): number {
  const a = Date.parse(desde.slice(0, 10) + "T00:00:00Z");
  const b = Date.parse(hoy.slice(0, 10) + "T00:00:00Z");
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.floor((b - a) / 86_400_000));
}

const norm = (v?: string) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function situacionDeSolicitud(input: {
  solicitud: Pick<SolicitudBase, "estado" | "fechaAprobacion" | "motivo"> & { categoria?: string };
  articulo: ArticuloDeSolicitud | null;
  cobertura: Cobertura | undefined;
  /** "aaaa-mm-dd" (Ecuador). */
  hoy: string;
}): Situacion {
  const { solicitud: s, articulo: a } = input;
  const dias = diasEntre(s.fechaAprobacion || input.hoy, input.hoy);
  if (s.estado === "Cancelada") {
    return { clave: "cancelado", texto: s.motivo ? `Cancelado · ${s.motivo}` : "Cancelado", tono: "neutro", dias };
  }
  const estadoItem = norm(a?.estado);
  if (s.estado === "Entregada" || estadoItem === "vendido") {
    return { clave: "entregado", texto: "Instalado / entregado", tono: "exito", dias };
  }
  const licencia = esCategoriaLicencia(s.categoria);
  if (a) {
    if (a.recibido) return { clave: "llego", texto: licencia ? `Comprada ✓ ${a.sku}` : `Llegó ✓ ${a.sku}`, tono: "exito", dias };
    if (a.faltaPagarProveedor > TOLERANCIA) {
      return { clave: "falta_pagar_proveedor", texto: "Comprado · falta pagar al proveedor", tono: "aviso", dias };
    }
    return { clave: "en_camino", texto: a.rastreo ? `En camino · ${a.rastreo}` : "En camino", tono: "info", dias };
  }
  const c = input.cobertura;
  if (c && c.tipo === "sin_pago") return { clave: "esperando_pago", texto: "Esperando pago del cliente", tono: "aviso", dias };
  if (c && c.tipo === "parcial") {
    return { clave: "esperando_pago", texto: `Anticipo parcial ${dinero(c.pagado)} de ${dinero(c.precio)}`, tono: "aviso", dias };
  }
  return {
    clave: "falta_pedir",
    texto: `${licencia ? "Falta comprar" : "Falta pedir"} · ${dias} ${dias === 1 ? "día" : "días"}`,
    tono: dias >= DIAS_ALERTA ? "peligro" : "aviso",
    dias,
  };
}

/**
 * Resumen para el tablero de órdenes. Lo más urgente primero:
 * "1 sin comprar" (falta pedir o esperando pago) gana a "Repuestos 2/3".
 * null si la orden no tiene repuestos bajo pedido vivos.
 */
export function resumenRepuestos(situaciones: readonly Situacion[]): { texto: string; tono: Tono } | null {
  const vivas = situaciones.filter((s) => s.clave !== "cancelado");
  if (vivas.length === 0) return null;
  const sinComprar = vivas.filter((s) => s.clave === "falta_pedir").length;
  if (sinComprar > 0) {
    const rojo = vivas.some((s) => s.clave === "falta_pedir" && s.tono === "peligro");
    return { texto: `${sinComprar} sin comprar`, tono: rojo ? "peligro" : "aviso" };
  }
  const listos = vivas.filter((s) => s.clave === "llego" || s.clave === "entregado").length;
  return { texto: `Repuestos ${listos}/${vivas.length}`, tono: listos === vivas.length ? "exito" : "info" };
}

// ─── Validaciones ────────────────────────────────────────────────────────────

export type Rechazo = { ok: false; motivo: string };
const NO = (motivo: string): Rechazo => ({ ok: false, motivo });

/** Decisión del dueño (1-nov): compran Staff y Administradores; los técnicos no. */
export function puedeComprar(perfil: "admin" | "staff" | "tecnico" | "proveedor" | "ninguno"): boolean {
  return perfil === "admin" || perfil === "staff";
}

/**
 * Antes de abrir "Registrar compra" con varias solicitudes: todas deben
 * seguir "Por comprar". Devuelve también las que no tienen el anticipo
 * completo, para pedir confirmación (no se bloquea: decisión A del dueño).
 */
export function validarComprar(
  solicitudes: ReadonlyArray<Pick<SolicitudBase, "id" | "codigo" | "descripcion" | "estado">>,
  coberturas: ReadonlyMap<string, Cobertura>,
): { ok: true; sinAnticipo: string[] } | Rechazo {
  if (solicitudes.length === 0) return NO("Marca al menos una solicitud.");
  const cerradas = solicitudes.filter((s) => s.estado !== "Por comprar");
  if (cerradas.length) {
    return NO(`${cerradas.map((s) => `${s.codigo} (${s.estado.toLowerCase()})`).join(", ")} ya no está por comprar. Actualiza la bandeja.`);
  }
  const sinAnticipo = solicitudes
    .filter((s) => (coberturas.get(s.id)?.tipo ?? "cubierta") !== "cubierta")
    .map((s) => s.descripcion);
  return { ok: true, sinAnticipo };
}

/**
 * La compra para una ORDEN se aparta como repuesto de la orden: el artículo
 * tiene que ser de una categoría de repuesto (si no, no se puede instalar).
 * Ej.: una solicitud "Otro" para OR000491 registrada como "Laptop" se rechaza
 * ANTES de crear el artículo. Para una operación comercial vale cualquiera.
 */
export function validarCategoriaDeCompra(
  s: { codigo: string; lineaId?: string | null; categoria?: string },
  categoria: string,
): { ok: true } | Rechazo {
  if (esCategoriaLicencia(s.categoria)) return NO(`${s.codigo} es una licencia: cómprala en "Registrar compra" → Producto digital.`);
  if (!s.lineaId) return { ok: true };
  if (esCategoriaDeRepuesto(categoria)) return { ok: true };
  return NO(`${s.codigo} es un repuesto para una orden: elige una categoría de repuesto (${CATEGORIAS_REPUESTO_STOCK.join(", ")}).`);
}

/** Cancelar desde la bandeja: solo lo que todavía no se compró, y con motivo. */
export function validarCancelar(s: Pick<SolicitudBase, "estado">, motivo: string): { ok: true } | Rechazo {
  if (!motivo.trim()) return NO("Escribe el motivo.");
  if (s.estado === "Cancelada") return NO("Ya está cancelada.");
  if (s.estado !== "Por comprar") {
    return NO("Ya está comprada: quítala de su orden de compra (Pagos) o, si ya llegó, libérala a stock desde la orden.");
  }
  return { ok: true };
}

/**
 * "Ya la tenemos": el artículo que se aparta debe tener unidades libres
 * suficientes y no estar vendido ni cancelado. (En camino sí sirve.)
 */
export function validarAsignarExistente(
  s: Pick<SolicitudBase, "estado" | "cantidad">,
  item: { estado: string; libres: number },
): { ok: true } | Rechazo {
  if (s.estado !== "Por comprar") return NO("Esta solicitud ya no está por comprar.");
  const e = norm(item.estado);
  if (e === "vendido" || e === "cancelado" || e === "archivado" || e === "dado de baja") return NO(`El artículo está ${item.estado.toLowerCase()}.`);
  if (item.libres < Math.max(1, s.cantidad)) return NO(`El artículo solo tiene ${item.libres} unidad(es) libre(s).`);
  return { ok: true };
}

// ─── "¿Esta compra es para una solicitud?" (punto 3) ─────────────────────────

const PALABRAS_VACIAS = new Set(["para", "con", "sin", "the", "and", "for", "de", "del", "la", "el", "los", "las", "y", "o", "en", "nuevo", "nueva", "original"]);

function palabras(texto: string): string[] {
  return norm(texto)
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((p) => p.length >= 3 && !PALABRAS_VACIAS.has(p));
}

/**
 * Solicitudes abiertas cuyo nombre se parece al de lo que se está comprando
 * para stock (al menos la mitad de sus palabras aparecen). Así, quien
 * registra "Tapa bisagra HP 15-DW" ve "¿Es para OR000507?".
 */
export function solicitudesParecidas<T extends Pick<SolicitudBase, "descripcion" | "estado">>(nombre: string, abiertas: readonly T[]): T[] {
  const buscadas = new Set(palabras(nombre));
  if (buscadas.size === 0) return [];
  return abiertas
    .filter((s) => s.estado === "Por comprar")
    .map((s) => {
      const ps = palabras(s.descripcion);
      const comunes = ps.filter((p) => buscadas.has(p)).length;
      return { s, puntaje: ps.length ? comunes / ps.length : 0, comunes };
    })
    .filter((x) => x.comunes >= 2 && x.puntaje >= 0.5)
    .sort((a, b) => b.puntaje - a.puntaje)
    .map((x) => x.s);
}

/** Línea de historial con fecha (Ecuador) y usuario. */
export function entradaHistorial(texto: string, usuario: string, ahora: Date = new Date()): string {
  const f = new Date(ahora.getTime() - 5 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " ");
  return `[${f}] ${usuario}: ${texto}`;
}
