// Punto 10b-4 (17-oct-2026): la inspección y la ficha viven en el artículo,
// no en Recepción: /shipping-v2/items/LAP-000500/u/7HX2KQ3/inspeccion.
// La clave después de "u" es la serie de la unidad o, si todavía no tiene,
// el id de su registro. Aquí se resuelve la dirección y se corrige si cambió
// (el SKU tras una fusión, o la unidad ya recibió su serie).

import { notFound, redirect } from "next/navigation";
import { idDeUnidadPorRuta } from "@/lib/shipping-v2/airtable";
import { esRutaDeUnidad, nombreUnidad, rutaUnidad, type PaginaUnidad } from "@/lib/shipping-v2/unidades-serie";

export type ParamsUnidad = Promise<{ id: string; serie: string }>;
export type BusquedaUnidad = Promise<Record<string, string | string[] | undefined>>;

type ItemDeRuta = { id: string; sku?: string | null; numeroSerie?: string | null };

function decodificar(valor: string) {
  try {
    return decodeURIComponent(valor);
  } catch {
    return valor;
  }
}

function primero(valor: string | string[] | undefined) {
  return Array.isArray(valor) ? valor[0] : valor;
}

/** El registro de la unidad que nombra la dirección (o 404). */
export async function leerRutaUnidad(params: ParamsUnidad, busqueda?: BusquedaUnidad) {
  const { id, serie } = await params;
  const query = busqueda ? await busqueda : {};
  const sku = decodificar(id);
  const clave = decodificar(serie);
  const itemId = await idDeUnidadPorRuta(sku, clave);
  if (!itemId) notFound();
  return {
    itemId,
    sku,
    clave,
    desdeRecepcion: primero(query.desde) === "recepcion",
    imprimir: primero(query.print) === "1",
  };
}

/** Si la dirección ya no es la de esta unidad, se pasa a la correcta. */
export function asegurarRutaCanonica(
  item: ItemDeRuta,
  ruta: { sku: string; clave: string; desdeRecepcion: boolean; imprimir?: boolean },
  pagina: PaginaUnidad
) {
  if (!esRutaDeUnidad(item, ruta.sku, ruta.clave)) {
    redirect(rutaUnidad(item, pagina, { desde: ruta.desdeRecepcion ? "recepcion" : undefined, imprimir: ruta.imprimir }));
  }
}

/** A dónde vuelve "←": a Recepción si se llegó desde ahí, si no al detalle de la unidad. */
export function volverDeUnidad(item: ItemDeRuta, desdeRecepcion: boolean) {
  return desdeRecepcion
    ? { href: "/shipping-v2/recepcion", etiqueta: "Recepción" }
    : { href: `/shipping-v2/items/${encodeURIComponent(item.id)}`, etiqueta: nombreUnidad(String(item.sku ?? ""), item.numeroSerie) };
}
