import "server-only";

// El artículo de Shipping de una licencia sigue a su unidad DIG (punto 5B-2).
// La regla vive en ./compra.ts (planArticuloDeLicencia, con prueba); aquí se
// lee, se escribe y se anota en el Kardex.
//
// Regla de oro (igual que el Kardex): NUNCA rompe la operación que lo llama.
// Si falla, la venta, la anulación o la reserva ya quedaron hechas; se anota
// en el log y la revisión diaria del Kardex muestra la diferencia.
//
// Las licencias viejas (antes del 5B-2) no tienen artículo: no pasa nada.

import { airtableMutation, fetchRecordsByIds, firstNumber, linkedIds, tableUrl } from "@/lib/finanzas/airtable-client";
import { kardexDocumento, kardexPorCambio } from "@/lib/shipping-v2/kardex-registro";
import type { TipoDocumentoKardex } from "@/lib/shipping-v2/kardex";
import { planArticuloDeLicencia } from "./compra";

const T_DIGITALES = "Productos Digitales";
const T_ITEMS = "Shipping Items";
export const CAMPO_ARTICULO_DE_LICENCIA = "Artículo Shipping";

const texto = (v: unknown): string =>
  typeof v === "string" ? v : v && typeof v === "object" && "name" in v ? String((v as { name: unknown }).name ?? "") : "";

export async function sincronizarArticulosDeLicencias(
  productoIds: string[],
  opts: {
    documento?: { tipo: TipoDocumentoKardex; id: string };
    /** Precio por unidad SIN IVA de cada licencia en el documento (para el Kardex). */
    precios?: Map<string, number>;
    hechoPor?: string;
  } = {},
): Promise<void> {
  const ids = [...new Set(productoIds.filter(Boolean))];
  if (!ids.length) return;
  try {
    const digitales = await fetchRecordsByIds(T_DIGITALES, ids);
    const pares = digitales
      .map((d) => ({ d, itemId: linkedIds(d.fields[CAMPO_ARTICULO_DE_LICENCIA])[0] }))
      .filter((p): p is { d: (typeof digitales)[number]; itemId: string } => !!p.itemId);
    if (!pares.length) return;
    const items = new Map((await fetchRecordsByIds(T_ITEMS, pares.map((p) => p.itemId))).map((r) => [r.id, r]));
    const lineasDocumento: Array<{ itemId: string; cantidad: number; precio: number | null }> = [];
    for (const { d, itemId } of pares) {
      const item = items.get(itemId);
      if (!item) continue;
      const antes = item.fields;
      const plan = planArticuloDeLicencia(texto(d.fields["Estado"]), {
        estado: texto(antes["Estado Item"]),
        cantidad: firstNumber(antes["Cantidad"]) ?? 0,
        disponibleVenta: antes["Disponible para venta"] === true,
      });
      if (!Object.keys(plan.fields).length) continue;
      await airtableMutation(tableUrl(T_ITEMS), {
        method: "PATCH",
        body: JSON.stringify({ records: [{ id: itemId, fields: plan.fields }], typecast: true }),
      });
      if (plan.delta === 0) continue;
      if (opts.documento) {
        lineasDocumento.push({ itemId, cantidad: 1, precio: opts.precios?.get(d.id) ?? null });
      } else {
        await kardexPorCambio({
          itemId,
          antes,
          motivo: plan.delta < 0 ? "Dada de baja" : "Baja revertida",
          clave: `licencia|${d.id}|${texto(d.fields["Estado"])}|${Date.now()}`,
        });
      }
    }
    if (opts.documento && lineasDocumento.length) {
      await kardexDocumento({ tipo: opts.documento.tipo, documentoId: opts.documento.id, lineas: lineasDocumento, hechoPor: opts.hechoPor });
    }
  } catch (e) {
    console.error("[licencias] sincronizar artículo", ids, e);
  }
}
