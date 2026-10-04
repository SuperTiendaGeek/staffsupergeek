// "Tipo de proveedor" dice QUÉ provee un proveedor (Software, Hardware,
// Logístico, Otro) y desde el 4-oct-2026 es de selección múltiple: un mismo
// proveedor puede vender hardware y software (Mercado Libre), por ejemplo.
//
// Antes era de selección única y mezclaba el origen (USA, Local) con lo que
// provee. El origen ahora sale SOLO de "País / zona logística": Ecuador =
// local; cualquier otro valor = extranjero (decisión del dueño, 4-oct-2026).

import type { ShippingV2Proveedor } from "@/types/shipping-v2";

function normalize(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Tipos del proveedor, normalizados (sin tildes, en minúsculas). */
export function tiposDeProveedor(provider: Pick<ShippingV2Proveedor, "tipoProveedor" | "tiposProveedor">): string[] {
  const lista = provider.tiposProveedor?.length
    ? provider.tiposProveedor
    : (provider.tipoProveedor ?? "").split(/[,;]/);
  return lista.map((t) => normalize(t)).filter(Boolean);
}

export function esProveedorLogistico(provider: Pick<ShippingV2Proveedor, "tipoProveedor" | "tiposProveedor">): boolean {
  return tiposDeProveedor(provider).includes("logistico");
}

/**
 * Puede ser proveedor DE COMPRA quien provee algo además de logística (o no
 * tiene tipo indicado). Un transportista puro (solo "Logístico") no vende.
 */
export function proveeMercaderia(provider: Pick<ShippingV2Proveedor, "tipoProveedor" | "tiposProveedor">): boolean {
  const tipos = tiposDeProveedor(provider);
  return tipos.length === 0 || tipos.some((t) => t !== "logistico");
}
