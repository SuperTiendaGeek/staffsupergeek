import "server-only";

// Verificación previa a emitir para líneas de producto digital — la puerta
// REAL, análoga a reglas/stock.ts para Shipping Items. El filtro del
// buscador (lib/facturacion/airtable/productosDigitales.ts) es cosmético:
// solo decide qué se OFRECE, y entre que se arma la factura y se pulsa
// "Emitir" el producto puede haberse vendido en otra pestaña, o haberse
// vinculado a una orden. Esta es la que de verdad puede bloquear la
// emisión — corre en /api/facturacion/emitir ANTES de emitirFactura(),
// porque después de la autorización del SRI ya no hay forma de rechazar la
// venta (la factura es un documento tributario real): una factura real
// sobre un producto no verificado es peor que pedir reintentar.
//
// Fail-closed: producto que no existe → bloquea (NO_ENCONTRADO), igual que
// stock.ts trata un item inexistente como disponible 0.
//
// ─── Por qué una función hermana y no dentro de verificarStockDisponible() ──
//
// stock.ts agrupa y compara POR CANTIDAD: varias líneas del mismo Shipping
// Item se suman y se comparan contra una "Cantidad" disponible numérica. Un
// producto digital no tiene cantidad — cada registro es una unidad única
// con su propio Estado ("Disponible"/"Usado"/…) y, la condición que de
// verdad importa aquí, si tiene o no una orden de reparación vinculada.
// Meter esta regla dentro de calcularFaltantes()/verificarStockDisponible()
// habría obligado a bifurcar su tipo de resultado (FaltanteStock tiene
// "solicitado"/"disponible" numéricos que no existen para un producto
// digital) solo para compartir un archivo — ensucia más de lo que ahorra.
// Mismo espíritu que stock.ts (fail-closed, mensaje en español, corre justo
// antes de emitir, releído aquí y no confía en lo que vio el formulario),
// tabla y condición de verdad distintas.

import { fetchRecordsByIds, linkedIds, firstString } from "../gancho/airtableGancho";
import type { DetalleFactura } from "../types/factura";

const PRODUCTOS_DIGITALES_TABLE = "Productos Digitales";
const ESTADO_DISPONIBLE = "Disponible";

export type ProductoDigitalNoDisponible = {
  productoDigitalId: string;
  descripcion:       string;
  motivo:             "NO_DISPONIBLE" | "YA_VINCULADO_A_ORDEN" | "NO_ENCONTRADO";
};

type EstadoActualProductoDigital = { estado: string; tieneOrden: boolean };

// Parte pura, testeable sin red: compara lo solicitado contra el estado
// actual ya leído.
export function calcularProductosDigitalesNoDisponibles(
  detalles: DetalleFactura[],
  estadoActualPorId: Map<string, EstadoActualProductoDigital>
): ProductoDigitalNoDisponible[] {
  // Dedupe por id — no hace falta agrupar cantidades (un producto digital
  // nunca lleva más de 1), pero el formulario podría, en teoría, mandar la
  // misma línea más de una vez.
  const solicitados = new Map<string, string>(); // id -> descripcion
  for (const d of detalles) {
    if (d.tipo !== "productoDigital" || !d.productoDigitalId) continue;
    if (!solicitados.has(d.productoDigitalId)) solicitados.set(d.productoDigitalId, d.descripcion);
  }

  const noDisponibles: ProductoDigitalNoDisponible[] = [];
  for (const [id, descripcion] of solicitados) {
    const actual = estadoActualPorId.get(id);

    if (!actual) {
      noDisponibles.push({ productoDigitalId: id, descripcion, motivo: "NO_ENCONTRADO" });
      continue;
    }
    // Se prueba primero la vinculación a orden: es el motivo específico de
    // este trabajo (el mismo producto vendiéndose dos veces) y el mensaje
    // que le sirve al usuario para entender qué pasó es más preciso que un
    // genérico "no está Disponible".
    if (actual.tieneOrden) {
      noDisponibles.push({ productoDigitalId: id, descripcion, motivo: "YA_VINCULADO_A_ORDEN" });
      continue;
    }
    if (actual.estado !== ESTADO_DISPONIBLE) {
      noDisponibles.push({ productoDigitalId: id, descripcion, motivo: "NO_DISPONIBLE" });
    }
  }
  return noDisponibles;
}

export async function verificarProductosDigitalesDisponibles(
  detalles: DetalleFactura[]
): Promise<ProductoDigitalNoDisponible[]> {
  const ids = [
    ...new Set(
      detalles
        .filter((d) => d.tipo === "productoDigital" && !!d.productoDigitalId)
        .map((d) => d.productoDigitalId as string)
    ),
  ];
  if (ids.length === 0) return [];

  const records = await fetchRecordsByIds(PRODUCTOS_DIGITALES_TABLE, ids);
  const estadoActualPorId = new Map<string, EstadoActualProductoDigital>();
  for (const r of records) {
    estadoActualPorId.set(r.id, {
      estado:     firstString(r.fields["Estado"]),
      tieneOrden: linkedIds(r.fields["Orden de Reparación"]).length > 0,
    });
  }

  return calcularProductosDigitalesNoDisponibles(detalles, estadoActualPorId);
}

export function mensajeProductosDigitalesNoDisponibles(noDisponibles: ProductoDigitalNoDisponible[]): string {
  const lista = noDisponibles
    .map((n) => {
      if (n.motivo === "YA_VINCULADO_A_ORDEN") {
        return `"${n.descripcion}" ya quedó vinculado a una orden de reparación`;
      }
      if (n.motivo === "NO_ENCONTRADO") {
        return `"${n.descripcion}" ya no existe`;
      }
      return `"${n.descripcion}" ya no está Disponible`;
    })
    .join("; ");
  return `No se puede facturar: ${lista}.`;
}
