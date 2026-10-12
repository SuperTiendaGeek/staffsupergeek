// Ajuste de datos del punto 9b (pantalla Pagos), aprobado por el dueño el
// 12-oct-2026. Ya NO se crean pagos históricos: el dueño registra cada pago
// con su respaldo desde Pagos.
//
// 1. Regalos: los llaveros y piezas 3D de Roberto con costo $0
//    (ACC-000019 a ACC-000026) son regalos: no se pagan.
// 2. "Unidades compradas" (campo nuevo): lo que se compró, para que el pago no
//    dependa de lo que queda en la tienda. Para datos anteriores se toma lo
//    mayor entre lo que viajó en la caja y Cantidad + dadas de baja (mínimo 1).
// 3. "Pendiente de pago"/"Pagado" ya no son estados: lo que no llegó → "Registrado".
// 4. Lo que no es compra no requiere pago (un Reajuste marcado por error).
// Los artículos de prueba (LAP-000110, CAB-000003) no se tocan.
//
// Módulo puro: sin red.

import { estadoSinEtapaDePago } from "./pagos-situacion";

function normalize(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export const SKUS_DE_PRUEBA = new Set(["LAP-000110", "CAB-000003"]);
export const REGALOS_ROBERTO = new Set(["ACC-000019", "ACC-000020", "ACC-000021", "ACC-000022", "ACC-000023", "ACC-000024", "ACC-000025", "ACC-000026"]);
const TIPOS_COMPRA = new Set(["compra a proveedor", "compra ya pagada"]);

export type RegistroAjuste9b = {
  id: string;
  sku: string;
  estado: string;
  tipoOperacion: string;
  requierePago: boolean;
  esRegalo: boolean;
  recibido: boolean;
  costoProveedor: number | null;
  cantidad: number | null;
  unidadesEnPacking: number | null;
  unidadesDadasDeBaja: number | null;
  unidadesCompradas: number | null;
  pagosVivos: number;
};

export type CambioAjuste9b = { id: string; sku: string; fields: Record<string, unknown>; resumen: string[]; supuesto?: boolean };

export function unidadesCompradasEstimadas(r: Pick<RegistroAjuste9b, "cantidad" | "unidadesEnPacking" | "unidadesDadasDeBaja">): { unidades: number; supuesto: boolean } {
  const enCaja = Number(r.unidadesEnPacking) || 0;
  const enTienda = (Number(r.cantidad) || 0) + (Number(r.unidadesDadasDeBaja) || 0);
  const unidades = Math.max(enCaja, enTienda);
  return unidades > 0 ? { unidades, supuesto: false } : { unidades: 1, supuesto: true };
}

export function planAjustePunto9b(r: RegistroAjuste9b): CambioAjuste9b | null {
  if (SKUS_DE_PRUEBA.has(r.sku)) return null;
  const fields: Record<string, unknown> = {};
  const resumen: string[] = [];
  let supuesto = false;
  let requierePago = r.requierePago;

  // 1. Regalos de Roberto
  if (REGALOS_ROBERTO.has(r.sku) && !r.esRegalo && !(Number(r.costoProveedor) > 0) && r.pagosVivos === 0) {
    fields["Tipo de operación"] = "Regalo de proveedor";
    fields["Es regalo"] = true;
    fields["Requiere pago"] = false;
    resumen.push("→ regalo (no se paga)");
    requierePago = false;
  }

  // 4. Lo que no es compra no requiere pago
  if (requierePago && !r.esRegalo && !TIPOS_COMPRA.has(normalize(r.tipoOperacion))) {
    fields["Requiere pago"] = false;
    resumen.push(`${r.tipoOperacion || "Sin tipo"}: no requiere pago`);
    requierePago = false;
  }

  // 2. Unidades compradas
  if (requierePago && !(Number(r.unidadesCompradas) > 0)) {
    const est = unidadesCompradasEstimadas(r);
    fields["Unidades compradas"] = est.unidades;
    supuesto = est.supuesto;
    resumen.push(`compradas = ${est.unidades}${est.supuesto ? " (supuesto: ya vendido, sin caja)" : ""}`);
  }

  // 3. Etapas de pago
  const nuevoEstado = estadoSinEtapaDePago(r.estado);
  if (nuevoEstado && !r.recibido) {
    fields["Estado Item"] = nuevoEstado;
    resumen.push(`${r.estado} → ${nuevoEstado}`);
  }

  return Object.keys(fields).length ? { id: r.id, sku: r.sku, fields, resumen, supuesto } : null;
}
