import type { ShippingV2Proveedor } from "@/types/shipping-v2";

export function getShippingV2ProveedorLabel(proveedor: ShippingV2Proveedor) {
  return proveedor.proveedorId || proveedor.nombre || proveedor.id;
}

export function createShippingV2ProveedorLabelMap(proveedores: ShippingV2Proveedor[]) {
  return new Map(proveedores.map((proveedor) => [proveedor.id, getShippingV2ProveedorLabel(proveedor)]));
}

export function resolveShippingV2ProveedorLabel(recordId: string | undefined, labelsById: Map<string, string>) {
  if (!recordId) return "";
  return labelsById.get(recordId) || recordId;
}
