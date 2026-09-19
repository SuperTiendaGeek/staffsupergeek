import { notFound, redirect } from "next/navigation";
import { getShippingV2AccessContextForSession, getShippingV2ItemById } from "@/lib/shipping-v2/airtable";
import { getSessionFromCookie } from "@/lib/session";
import { requirePantallaVisible } from "@/lib/permissions/pantallas";
import { EtiquetaSku } from "./EtiquetaSku";
import { lineaEtiqueta, parsearEspecificaciones } from "@/lib/shipping-v2/especificaciones";

type Props = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

function formatoPrecio(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor) || valor <= 0) return "";
  // Mismo formato que la lista de Recepción: "$25,00".
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(valor);
}

/**
 * Etiqueta de 5 × 2.5 cm (Zebra ZP 505). El dibujo y el ajuste de tamaños
 * viven en EtiquetaSku, que corre en el navegador porque necesita medir el
 * texto ya dibujado. Aquí solo se leen los datos.
 */
function PrintableSkuLabel(props: { sku: string; linea?: string; precio?: string }) {
  return <EtiquetaSku {...props} />;
}

export default async function ShippingV2SkuLabelPage({ params }: Props) {
  const { id } = await params;
  const session = await getSessionFromCookie();
  requirePantallaVisible(session?.user.pantallasRestringidas ?? {}, "shipping-v2", "recepcion");
  const access = await getShippingV2AccessContextForSession(session);
  if (!access.permissions.canUseRecepcion) {
    redirect("/shipping-v2/packings");
  }

  let item;
  try {
    item = await getShippingV2ItemById(id, { includeAiName: false, access });
  } catch (error) {
    console.error("Error al cargar etiqueta SKU Shipping V2:", error);
    if (error instanceof Error && error.message.includes("NOT_FOUND")) notFound();
    return <PrintableSkuLabel sku="SKU no disponible" />;
  }
  if (item.recibido !== true) {
    redirect("/shipping-v2/recepcion");
  }
  const linea = lineaEtiqueta(
    item.categoria,
    parsearEspecificaciones(item.especificacionesTecnicas).valores,
    item.technicalSheet
  );
  // Igual que la lista de Recepción: un precio final en 0 cae al sugerido.
  const precio = formatoPrecio(item.precioVenta || item.precioVentaSugerido);
  return <PrintableSkuLabel sku={item.sku?.trim() || "SKU no disponible"} linea={linea} precio={precio} />;
}
