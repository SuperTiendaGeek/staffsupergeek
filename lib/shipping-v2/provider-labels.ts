import type { ShippingV2Proveedor } from "@/types/shipping-v2";

// Punto 11 (22-oct-2026): se muestra solo el nombre ("Roberto"), ya no
// "Roberto-Hardware". "Proveedor ID" queda como respaldo.
export function getShippingV2ProveedorLabel(proveedor: ShippingV2Proveedor) {
  return proveedor.nombre || proveedor.proveedorId || proveedor.id;
}

export function createShippingV2ProveedorLabelMap(proveedores: ShippingV2Proveedor[]) {
  return new Map(proveedores.map((proveedor) => [proveedor.id, getShippingV2ProveedorLabel(proveedor)]));
}

export function resolveShippingV2ProveedorLabel(recordId: string | undefined, labelsById: Map<string, string>) {
  if (!recordId) return "";
  return labelsById.get(recordId) || recordId;
}
