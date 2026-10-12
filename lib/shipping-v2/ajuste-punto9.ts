// Ajuste de datos del punto 9 de la auditoría (Pagos a proveedor), aprobado
// por el dueño el 12-oct-2026.
//
// · Ningún proveedor da crédito: toda compra registrada ya se pagó. Las que
//   no tienen un pago registrado quedan cubiertas por UN "pago histórico" por
//   proveedor: Pagado, sin egreso en Finanzas ("No aplica") y sin pedir
//   soporte (decisión del dueño: "todos histórico sin egreso").
// · "Pendiente de pago" y "Pagado" dejan de ser Estado Item: lo que todavía no
//   llega pasa a "Registrado" (su etapa logística).
// · Lo que no es una compra no "requiere pago" (p. ej. un Reajuste marcado
//   por error): se apaga la casilla.
// · Los artículos de prueba (LAP-000110, CAB-000003) no se tocan: el dueño
//   los elimina; dentro de un pago ya no se podrían eliminar.
//
// Módulo puro: sin red.

import { ESTADO_INICIAL_EN_CAMINO, OBSERVACION_PAGO_HISTORICO, estadoSinEtapaDePago, faltaRespaldo } from "./pagos-situacion";

function normalize(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export const SKUS_DE_PRUEBA = new Set(["LAP-000110", "CAB-000003"]);

const TIPOS_COMPRA = new Set(["compra a proveedor", "compra ya pagada"]);
const ESTADOS_CANCELADOS = new Set(["cancelado", "anulado", "archivado"]);

export type RegistroAjuste9 = {
  id: string;
  sku: string;
  estado: string;
  tipoOperacion: string;
  requierePago: boolean;
  esRegalo: boolean;
  recibido: boolean;
  proveedorId: string;
  proveedorNombre: string;
  costoProveedor: number | null;
  cantidad: number | null;
  unidadesEnPacking: number | null;
  /** Fecha de registro (ISO). */
  fechaRegistro: string;
  /** Pagos vinculados que NO están anulados. */
  pagosVivos: number;
};

export type CambioItem9 = { id: string; sku: string; fields: Record<string, unknown>; resumen: string[] };
export type PagoHistorico9 = {
  proveedorId: string;
  proveedorNombre: string;
  itemIds: string[];
  skus: string[];
  totalAproximado: number;
};
export type PlanAjuste9 = {
  cambiosItems: CambioItem9[];
  pagosHistoricos: PagoHistorico9[];
  /** Lo que se deja a mano, con el motivo. */
  aRevisar: Array<{ sku: string; motivo: string }>;
};

/** Unidades para el total aproximado (lo vendido ya tiene Cantidad 0). */
function unidadesCompradas(r: RegistroAjuste9): number {
  const cantidad = Number(r.cantidad) || 0;
  const enPacking = Number(r.unidadesEnPacking) || 0;
  return Math.max(cantidad, enPacking, 1);
}

export function planAjustePunto9(registros: RegistroAjuste9[], opciones: { corteISO: string }): PlanAjuste9 {
  const corte = Date.parse(opciones.corteISO);
  const cambiosItems: CambioItem9[] = [];
  const aRevisar: Array<{ sku: string; motivo: string }> = [];
  const porProveedor = new Map<string, PagoHistorico9>();

  for (const r of registros) {
    const fields: Record<string, unknown> = {};
    const resumen: string[] = [];
    const esPrueba = SKUS_DE_PRUEBA.has(r.sku);
    const esCompra = TIPOS_COMPRA.has(normalize(r.tipoOperacion));
    let requierePago = r.requierePago;

    // 1) Etapas de pago → etapa logística.
    const nuevoEstado = estadoSinEtapaDePago(r.estado);
    if (nuevoEstado && !esPrueba) {
      if (r.recibido) {
        aRevisar.push({ sku: r.sku, motivo: `Está "${r.estado}" pero ya llegó: corregir con "Corregir estado".` });
      } else {
        fields["Estado Item"] = nuevoEstado;
        resumen.push(`${r.estado} → ${nuevoEstado}`);
      }
    }

    // 2) Lo que no es compra no requiere pago.
    if (requierePago && !esCompra && !r.esRegalo && !esPrueba) {
      fields["Requiere pago"] = false;
      resumen.push(`${r.tipoOperacion || "Sin tipo"}: no requiere pago`);
      requierePago = false;
    }

    if (Object.keys(fields).length) cambiosItems.push({ id: r.id, sku: r.sku, fields, resumen });

    // 3) Compras sin pago registrado → pago histórico de su proveedor.
    const sinRespaldo = faltaRespaldo({
      requierePago,
      esRegalo: r.esRegalo,
      cancelado: ESTADOS_CANCELADOS.has(normalize(r.estado)),
      faltaProveedor: false,
      enPagoVivo: r.pagosVivos > 0,
    });
    if (!sinRespaldo || esPrueba) continue;
    const registrado = Date.parse(r.fechaRegistro);
    if (Number.isFinite(registrado) && Number.isFinite(corte) && registrado >= corte) continue; // nuevo: sigue el camino normal
    if (!r.proveedorId) {
      aRevisar.push({ sku: r.sku, motivo: "Compra sin proveedor de compra: asignarlo y registrar su respaldo." });
      continue;
    }
    const grupo = porProveedor.get(r.proveedorId) ?? {
      proveedorId: r.proveedorId,
      proveedorNombre: r.proveedorNombre || r.proveedorId,
      itemIds: [],
      skus: [],
      totalAproximado: 0,
    };
    grupo.itemIds.push(r.id);
    grupo.skus.push(r.sku);
    grupo.totalAproximado = Math.round((grupo.totalAproximado + (Number(r.costoProveedor) || 0) * unidadesCompradas(r)) * 100) / 100;
    porProveedor.set(r.proveedorId, grupo);
  }

  const pagosHistoricos = Array.from(porProveedor.values()).sort((a, b) => a.proveedorNombre.localeCompare(b.proveedorNombre, "es"));
  return { cambiosItems, pagosHistoricos, aRevisar };
}

/** Campos del registro en Shipping Pagos para un pago histórico. */
export function camposPagoHistorico(p: PagoHistorico9, input: { pagoId: string; ahoraISO: string; registradoPor: string }): Record<string, unknown> {
  return {
    "Pago ID": input.pagoId,
    "Estado Pago": "Pagado",
    Proveedor: [p.proveedorId],
    "Items relacionados": p.itemIds,
    "Total a pagar": p.totalAproximado,
    "Fecha de creación": input.ahoraISO,
    "Método de pago": "No aplica",
    "Cuenta origen": "No aplica",
    "Estado de integración con Finanzas": "No aplica",
    Observación: `${OBSERVACION_PAGO_HISTORICO} Total aproximado (costo × unidades registradas). ${p.itemIds.length} artículo(s).`,
    "Registrado por": input.registradoPor,
  };
}

export { ESTADO_INICIAL_EN_CAMINO };
