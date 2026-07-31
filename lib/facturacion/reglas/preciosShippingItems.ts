export type LineaPrecioShippingItem = {
  descripcion?: string;
  shippingItemId?: string | null;
  precioUnitario?: number | null;
};

export function lineasShippingItemsConPrecioInvalido(lineas: readonly LineaPrecioShippingItem[]) {
  return lineas.filter((linea) => {
    if (!linea.shippingItemId) return false;
    return typeof linea.precioUnitario !== "number" || !Number.isFinite(linea.precioUnitario) || linea.precioUnitario <= 0;
  });
}

export function mensajePrecioShippingItemInvalido(lineas: readonly LineaPrecioShippingItem[]) {
  const invalidas = lineasShippingItemsConPrecioInvalido(lineas);
  if (invalidas.length === 0) return null;

  const nombres = invalidas
    .map((linea) => linea.descripcion?.trim())
    .filter((descripcion): descripcion is string => Boolean(descripcion));

  return nombres.length > 0
    ? `Los productos de Shipping Items requieren precio unitario mayor a 0: ${nombres.join(", ")}.`
    : "Los productos de Shipping Items requieren precio unitario mayor a 0.";
}
