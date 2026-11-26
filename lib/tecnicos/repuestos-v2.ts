import {
  buscarShippingItemsRepuestoStockDisponibles,
  reservarShippingItemComoRepuestoDeOrdenStock,
  liberarShippingItemDeOrdenStock,
  type ShippingV2RepuestoStockResumen,
} from "@/lib/shipping-v2/airtable";
import { AIRTABLE_TABLES, loadAirtableEnv } from "@/lib/tecnicos/config/airtable";
import { resolveModoRepuestos } from "@/lib/cuenta-unificada/config";
import { MENSAJE_SIN_INVENTARIO, esPrueba } from "@/lib/pruebas/reglas";
import { ErrorPrueba } from "@/lib/pruebas/servidor";

type AirtableClient = { baseUrl: string; headers: HeadersInit };

function getClient(): AirtableClient {
  const { token, baseId } = loadAirtableEnv();
  return {
    baseUrl: `https://api.airtable.com/v0/${baseId}`,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  };
}

async function fetchOrdenModoYVisible(
  ordenRecordId: string,
  client: AirtableClient
): Promise<{ idVisible: string; modo: "legacy" | "v2"; esPrueba: boolean } | null> {
  const res = await fetch(
    `${client.baseUrl}/${encodeURIComponent(AIRTABLE_TABLES.ordenes)}/${encodeURIComponent(ordenRecordId)}`,
    { headers: client.headers, cache: "no-store" }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { id: string; fields: Record<string, unknown> };
  const idVisible = typeof data.fields["ID"] === "string" ? (data.fields["ID"] as string) : data.id;
  return { idVisible, modo: resolveModoRepuestos(data.fields["Modo repuestos"]), esPrueba: esPrueba(data.fields) };
}

export async function buscarRepuestosStockDisponibles(
  query?: string
): Promise<ShippingV2RepuestoStockResumen[]> {
  return buscarShippingItemsRepuestoStockDisponibles(query);
}

export async function agregarRepuestoStockAOrden({
  ordenRecordId,
  itemId,
  registradoPor,
  compradoParaEstaOrden,
}: {
  ordenRecordId: string;
  itemId: string;
  registradoPor: string;
  /** Solo cargarCompraEnLinea: el artículo se compró para esta orden y puede venir en camino. */
  compradoParaEstaOrden?: boolean;
}): Promise<ShippingV2RepuestoStockResumen> {
  const client = getClient();
  const orden = await fetchOrdenModoYVisible(ordenRecordId, client);
  if (!orden) throw new Error("Orden no encontrada.");
  // Punto 16: una orden de prueba no aparta inventario real.
  if (orden.esPrueba) throw new ErrorPrueba(MENSAJE_SIN_INVENTARIO);

  // Antes aquí se rechazaba toda orden en modo "Legacy". Con el inventario
  // único, todo repuesto sale de Shipping Items y la vía anterior está
  // congelada, así que ese bloqueo dejaba 11 órdenes abiertas sin ninguna
  // forma de agregar un repuesto. El modo ya no decide nada.

  return reservarShippingItemComoRepuestoDeOrdenStock({
    itemId,
    ordenRecordId,
    ordenIdVisible: orden.idVisible,
    registradoPor,
    compradoParaEstaOrden,
  });
}

export async function quitarRepuestoStockDeOrden({
  ordenRecordId,
  itemId,
  registradoPor,
}: {
  ordenRecordId: string;
  itemId: string;
  registradoPor: string;
}): Promise<ShippingV2RepuestoStockResumen> {
  const client = getClient();
  const orden = await fetchOrdenModoYVisible(ordenRecordId, client);
  if (!orden) throw new Error("Orden no encontrada.");

  return liberarShippingItemDeOrdenStock({
    itemId,
    ordenRecordId,
    ordenIdVisible: orden.idVisible,
    registradoPor,
  });
}
