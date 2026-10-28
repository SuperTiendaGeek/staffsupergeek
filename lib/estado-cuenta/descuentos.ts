// Descuentos de la cuenta — reglas PURAS (auditoría ops, punto 4B).
//
// Modelo profesional (Lightspeed, Odoo): un descuento NO es un servicio
// negativo. Es una rebaja sobre UNA línea de la cuenta que queda registrada
// con quién la dio, cuánto y por qué; en la factura sale en la columna
// "Descuento" de esa línea, como pide el SRI. Antes se anotaba como un
// servicio de costo negativo (OR000423: "Descuento: SSD REP-000017 facturado
// a $20"), que un documento no puede llevar.
//
// Decisiones del dueño (27-oct-2026):
//   · Solo el administrador. Motivo obligatorio. Sin tope, pero nunca más
//     que el precio de la línea.
//   · Solo sobre lo YA cargado (servicio, repuesto, producto digital,
//     repuesto histórico). Lo aprobado sin artículo se ajusta en el
//     presupuesto, no con descuento.
//   · Un descuento vigente por línea. No se borra: se anula (queda en el
//     historial).
//   · Con factura o recibo vigente la cuenta no se toca: primero se anula el
//     documento (igual que cualquier otro cambio de la cuenta).
//
// Sin dependencias de servidor ni de Airtable.

export type TipoCargo = "Servicio" | "Repuesto" | "Repuesto histórico" | "Producto digital";

export type EstadoDescuento = "Vigente" | "Anulado";

export type DescuentoCuenta = {
  id: string;
  cargoId: string;
  tipoCargo: TipoCargo | "";
  /** Nombre del cargo al momento del descuento. */
  cargo: string;
  precioCargo: number;
  /** Monto descontado, positivo, IVA incluido. */
  monto: number;
  motivo: string;
  estado: EstadoDescuento;
  autorizadoPor: string;
  fecha: string | null;
};

/** Una línea de la cuenta sobre la que se puede dar descuento. */
export type CargoDescontable = { id: string; tipo: TipoCargo; nombre: string; precio: number };

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const TOLERANCIA = 0.005;
const MOTIVO_MINIMO = 4;

export function descuentosVigentes<T extends { estado: string }>(descuentos: readonly T[]): T[] {
  return descuentos.filter((d) => d.estado === "Vigente");
}

/** Descuento vigente de cada cargo (cargoId → descuento). */
export function descuentoPorCargo<T extends { estado: string; cargoId: string }>(descuentos: readonly T[]): Map<string, T> {
  const out = new Map<string, T>();
  for (const d of descuentosVigentes(descuentos)) if (!out.has(d.cargoId)) out.set(d.cargoId, d);
  return out;
}

/** "10 %" de $40 → $4.00 (redondeado a centavos). */
export function montoDesdePorcentaje(precio: number, porcentaje: number): number {
  if (!Number.isFinite(precio) || !Number.isFinite(porcentaje)) return 0;
  return round2((precio * porcentaje) / 100);
}

/**
 * Las líneas descontables de una cuenta, con su precio actual. Lo aprobado sin
 * artículo NO está aquí a propósito (decisión del dueño).
 */
export function cargosDescontables(cuenta: {
  items: ReadonlyArray<{ id: string; nombre: string; precio: number }>;
  servicios: ReadonlyArray<{ id: string; nombre: string; costo: number }>;
  productosDigitales: ReadonlyArray<{ id: string; nombre: string; precioVenta: number }>;
  repuestosHistoricos: ReadonlyArray<{ id: string; nombre: string; subtotal: number }>;
  repuestosHistoricosCuentanParaTotal: boolean;
}): CargoDescontable[] {
  return [
    ...cuenta.items.map((i) => ({ id: i.id, tipo: "Repuesto" as const, nombre: i.nombre, precio: i.precio })),
    ...cuenta.servicios.map((s) => ({ id: s.id, tipo: "Servicio" as const, nombre: s.nombre, precio: s.costo })),
    ...cuenta.productosDigitales.map((p) => ({ id: p.id, tipo: "Producto digital" as const, nombre: p.nombre, precio: p.precioVenta })),
    ...(cuenta.repuestosHistoricosCuentanParaTotal
      ? cuenta.repuestosHistoricos.map((r) => ({ id: r.id, tipo: "Repuesto histórico" as const, nombre: r.nombre, precio: r.subtotal }))
      : []),
  ].filter((c) => c.precio > TOLERANCIA);
}

/** null = se puede dar el descuento. Si no, el mensaje para el usuario. */
export function validarDescuento(input: {
  esAdmin: boolean;
  cargo: CargoDescontable | null;
  monto: number;
  motivo: string;
  descuentos: ReadonlyArray<{ estado: string; cargoId: string }>;
  hayDocumentoVigente: boolean;
}): string | null {
  if (!input.esAdmin) return "Solo el administrador puede dar descuentos.";
  if (!input.cargo) return "Esa línea no está cargada en la cuenta. Lo aprobado sin artículo se ajusta en el presupuesto.";
  if (input.hayDocumentoVigente) return "La cuenta ya tiene factura o recibo. Para cambiarla, anula primero el documento.";
  if (!Number.isFinite(input.monto) || input.monto <= TOLERANCIA) return "El descuento debe ser mayor a $0.";
  if (input.monto > input.cargo.precio + TOLERANCIA) return `No puede ser mayor al precio de la línea ($${input.cargo.precio.toFixed(2)}).`;
  if (input.motivo.trim().length < MOTIVO_MINIMO) return "Escribe el motivo del descuento.";
  if (descuentoPorCargo(input.descuentos).has(input.cargo.id)) return "Esa línea ya tiene un descuento. Quítalo primero para cambiarlo.";
  return null;
}

/** null = se puede quitar. */
export function validarAnulacion(input: {
  esAdmin: boolean;
  descuento: { estado: string } | null;
  hayDocumentoVigente: boolean;
}): string | null {
  if (!input.esAdmin) return "Solo el administrador puede quitar descuentos.";
  if (!input.descuento) return "Ese descuento no existe.";
  if (input.descuento.estado !== "Vigente") return "Ese descuento ya estaba quitado.";
  if (input.hayDocumentoVigente) return "La cuenta ya tiene factura o recibo. Para cambiarla, anula primero el documento.";
  return null;
}

/** Texto del campo primario en Airtable: "−$20.00 · SSD 120GB · OR000423". */
export function descripcionDescuento(monto: number, cargo: string, cuenta: string): string {
  return [`−$${round2(monto).toFixed(2)}`, cargo.trim() || "línea", cuenta.trim()].filter(Boolean).join(" · ");
}

// ─── Lectura de la tabla "Descuentos de Cuenta" (puro: recibe los campos) ────

export const TABLA_DESCUENTOS = "Descuentos de Cuenta";
/** Campo inverso en "Órdenes de Reparación" y en "Operación Comercial". */
export const CAMPO_DESCUENTOS = "Descuentos de Cuenta";

export const CAMPOS_DESCUENTO = [
  "Cargo ID", "Tipo de cargo", "Cargo", "Precio del cargo", "Monto", "Motivo", "Estado", "Autorizado por", "Fecha",
];

const TIPOS: readonly TipoCargo[] = ["Servicio", "Repuesto", "Repuesto histórico", "Producto digital"];

export function descuentoDesdeCampos(id: string, f: Record<string, unknown>): DescuentoCuenta {
  const txt = (v: unknown) => (typeof v === "string" ? v : v && typeof v === "object" && "name" in v ? String((v as { name: unknown }).name ?? "") : "");
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const tipo = txt(f["Tipo de cargo"]);
  return {
    id,
    cargoId: txt(f["Cargo ID"]),
    tipoCargo: (TIPOS as readonly string[]).includes(tipo) ? (tipo as TipoCargo) : "",
    cargo: txt(f["Cargo"]),
    precioCargo: num(f["Precio del cargo"]),
    monto: num(f["Monto"]),
    motivo: txt(f["Motivo"]),
    estado: txt(f["Estado"]) === "Vigente" ? "Vigente" : "Anulado",
    autorizadoPor: txt(f["Autorizado por"]),
    fecha: txt(f["Fecha"]) || null,
  };
}
