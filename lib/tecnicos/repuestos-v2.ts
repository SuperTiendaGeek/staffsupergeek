import {
  buscarShippingItemsRepuestoStockDisponibles,
  reservarShippingItemComoRepuestoDeOrdenStock,
  liberarShippingItemDeOrdenStock,
  type ShippingV2RepuestoStockResumen,
} from "@/lib/shipping-v2/airtable";
import { AIRTABLE_TABLES, loadAirtableEnv } from "@/lib/tecnicos/config/airtable";
import { resolveModoRepuestos } from "@/lib/cuenta-unificada/config";

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
): Promise<{ idVisible: string; modo: "legacy" | "v2" } | null> {
  const res = await fetch(
    `${client.baseUrl}/${encodeURIComponent(AIRTABLE_TABLES.ordenes)}/${encodeURIComponent(ordenRecordId)}`,
    { headers: client.headers, cache: "no-store" }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { id: string; fields: Record<string, unknown> };
  const idVisible = typeof data.fields["ID"] === "string" ? (data.fields["ID"] as string) : data.id;
  return { idVisible, modo: resolveModoRepuestos(data.fields["Modo repuestos"]) };
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
}: {
  ordenRecordId: string;
  itemId: string;
  registradoPor: string;
}): Promise<ShippingV2RepuestoStockResumen> {
  const client = getClient();
  const orden = await fetchOrdenModoYVisible(ordenRecordId, client);
  if (!orden) throw new Error("Orden no encontrada.");
  if (orden.modo !== "v2") {
    throw new Error("Esta orden está en modo Legacy: no se pueden agregar repuestos de stock nuevos.");
  }

  return reservarShippingItemComoRepuestoDeOrdenStock({
    itemId,
    ordenRecordId,
    ordenIdVisible: orden.idVisible,
    registradoPor,
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
