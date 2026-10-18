// Construye los campos de una línea de factura a partir de un producto
// elegido en el buscador de mostrador — compartido entre
// components/facturacion/FacturacionForm.tsx (client, agregarProducto()) y
// sus pruebas (sin red, sin componente: no hay arnés de pruebas de React en
// este proyecto). Sin "server-only": mismo criterio que ivaIncluido.ts, se
// importa desde un client component.
//
// Decide según ProductoCatalogo.fuente — el compilador obliga a cubrir las
// dos ramas (fuente no es opcional, ver productosShippingItems.ts).

import type { ProductoCatalogo } from "./airtable/productosShippingItems";

export type CamposLineaDesdeProducto = {
  codigoPrincipal:    string;
  descripcion:        string;
  unidadMedida:       string;
  cantidad:           number;
  precioUnitario:     number;
  descuento:          number;
  tarifaIva:          "4"; // ninguna de las dos fuentes trae IVA propio — 15% por defecto
  tipo:               "producto" | "productoDigital";
  shippingItemId?:    string;
  productoDigitalId?: string;
  // Solo presente para "producto" (Shipping Items) — la validación temprana
  // de stock en el formulario lo usa; un producto digital no tiene cantidad.
  stockDisponible?:   number;
};

/**
 * Punto 10b-5: la descripción de la línea lleva la serie del equipo vendido
 * ("Dell Latitude 5420 … S/N 7HX2KQ3"): así la factura, el recibo y la
 * reserva dicen qué unidad exacta salió (sirve también para la garantía).
 */
export function descripcionDeProducto(p: { nombre: string; seguimiento?: string; numeroSerie?: string }): string {
  return p.seguimiento === "Unidad" && p.numeroSerie ? `${p.nombre} S/N ${p.numeroSerie}` : p.nombre;
}

export function camposLineaDesdeProducto(p: ProductoCatalogo): CamposLineaDesdeProducto {
  if (p.fuente === "productoDigital") {
    return {
      codigoPrincipal:    p.id,
      descripcion:        p.nombre,
      unidadMedida:       "UNIDAD",
      cantidad:           1, // fijo — cada registro es una unidad única, nunca editable
      precioUnitario:     p.precioVenta,
      descuento:          0,
      tarifaIva:          "4",
      tipo:               "productoDigital",
      productoDigitalId:  p.id,
    };
  }
  return {
    codigoPrincipal:  p.sku || p.id,
    descripcion:      descripcionDeProducto(p),
    unidadMedida:     p.unidad,
    cantidad:         1,
    precioUnitario:   p.precioVenta,
    descuento:        0,
    tarifaIva:        "4",
    // Fase 17.b: la línea de mostrador queda vinculada a su Shipping Item —
    // descuenta stock al facturar, igual que el gancho.
    tipo:             "producto",
    shippingItemId:   p.id,
    stockDisponible:  p.cantidadDisponible,
  };
}
