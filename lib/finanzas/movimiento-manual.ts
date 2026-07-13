import "server-only";

import type { CategoriaMovimiento, Movimiento } from "@/types/finanzas";
import { cleanString } from "./airtable-client";
import { crearMovimiento } from "./movimientos";

// Fase 20.3 §5 — reservadas a sus propios flujos dedicados: un anticipo
// manual sin abono real detrás rompería la semántica de "Sin distribuir
// hasta facturar" (20.2), y Depósito de Caja/Acreditación Pasarela ya tienen
// su propia capacidad (§3/§4) que no debe poder saltarse por este camino
// genérico.
const CATEGORIAS_RESERVADAS: readonly CategoriaMovimiento[] = ["Anticipo Cliente", "Depósito de Caja", "Acreditación Pasarela"];

export type MovimientoManualInput = {
  tipo: "Ingreso" | "Egreso";
  categoria: CategoriaMovimiento;
  monto: number;
  cuentaId: string;
  metodo?: string;
  fecha: string;
  observacion: string;
  comprobanteUrl?: string;
  registradoPor: string;
};

/**
 * Movimiento manual admin-only para ingresos/egresos sueltos que ningún
 * puente cubre (gasto suelto, compra local, otro ingreso). No construye
 * devoluciones ni ajustes complejos — categorías y campos ya existentes,
 * nada más. Para un Egreso, la política de 20.1 ya se aplica sin cambios
 * (se registra siempre, con Alerta Descuadre si el saldo queda negativo).
 */
export async function crearMovimientoManual(input: MovimientoManualInput): Promise<Movimiento> {
  if (CATEGORIAS_RESERVADAS.includes(input.categoria)) {
    throw new Error(`La categoría "${input.categoria}" está reservada a su propio flujo — no se puede usar en un movimiento manual.`);
  }
  if (!cleanString(input.observacion)) {
    throw new Error("La observación es obligatoria en un movimiento manual.");
  }

  return crearMovimiento({
    tipo: input.tipo,
    origen: "Manual",
    categoria: input.categoria,
    monto: input.monto,
    cuentaOrigenId: input.tipo === "Egreso" ? input.cuentaId : undefined,
    cuentaDestinoId: input.tipo === "Ingreso" ? input.cuentaId : undefined,
    metodo: input.metodo,
    fecha: input.fecha,
    observacion: input.observacion,
    comprobanteUrl: input.comprobanteUrl,
    registradoPor: input.registradoPor,
  });
}
