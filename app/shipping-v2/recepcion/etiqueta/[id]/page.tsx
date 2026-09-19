import { notFound, redirect } from "next/navigation";
import { getShippingV2AccessContextForSession, getShippingV2ItemById } from "@/lib/shipping-v2/airtable";
import { getSessionFromCookie } from "@/lib/session";
import { requirePantallaVisible } from "@/lib/permissions/pantallas";
import { PrintSkuLabelButton } from "./PrintSkuLabelButton";
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
 * Etiqueta de 5 × 2.5 cm (Zebra ZP 505).
 *
 * El SKU manda: sigue siendo lo más grande, porque es lo que se escanea y se
 * dicta. Debajo, la línea técnica y el precio — lo que el empleado necesita
 * para vender sin ir a la computadora. Lo que falte no se imprime: sin datos,
 * la etiqueta queda como antes.
 */
function PrintableSkuLabel({ sku, linea = "", precio = "" }: { sku: string; linea?: string; precio?: string }) {
  const conDatos = Boolean(linea || precio);
  return (
    <>
      <main className={`label-sheet${conDatos ? " con-datos" : ""}`}>
        <div className="sku" title={sku}>{sku}</div>
        {linea ? <div className="linea" title={linea}>{linea}</div> : null}
        {precio ? <div className="precio">{precio}</div> : null}
      </main>
      <div className="no-print actions">
        <PrintSkuLabelButton />
      </div>
      <style>{`
        @page {
          size: 50mm 25mm;
          margin: 0;
        }

        * {
          box-sizing: border-box;
        }

        html,
        body {
          width: 50mm;
          min-height: 25mm;
          margin: 0;
          background: #ffffff;
          color: #000000;
          font-family: Arial, Helvetica, sans-serif;
        }

        .label-sheet {
          width: 50mm;
          height: 25mm;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          background: #ffffff;
          padding: 1.5mm;
        }

        .sku {
          width: 100%;
          max-height: 100%;
          overflow: hidden;
          color: #000000;
          font-size: clamp(12pt, 11mm, 30pt);
          font-weight: 800;
          line-height: 0.95;
          text-align: center;
          overflow-wrap: anywhere;
          text-wrap: balance;
        }

        /* Con línea técnica y precio el SKU cede altura, pero sigue mandando. */
        .con-datos {
          justify-content: space-between;
          padding: 1.2mm 1.5mm;
        }

        .con-datos .sku {
          font-size: clamp(11pt, 7.5mm, 22pt);
          line-height: 1;
        }

        .linea {
          width: 100%;
          overflow: hidden;
          color: #000000;
          font-size: 7.5pt;
          font-weight: 700;
          line-height: 1.1;
          text-align: center;
          /* Dos renglones como máximo: una línea larga se parte, no se pierde. */
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }

        .precio {
          color: #000000;
          font-size: 13pt;
          font-weight: 800;
          line-height: 1;
        }

        .actions {
          position: fixed;
          left: 8px;
          top: calc(25mm + 12px);
        }

        .actions button {
          border: 1px solid #d0d0d0;
          border-radius: 6px;
          background: #ffffff;
          color: #000000;
          cursor: pointer;
          font: 600 13px Arial, Helvetica, sans-serif;
          padding: 7px 12px;
        }

        @media print {
          html,
          body {
            width: 50mm;
            height: 25mm;
          }

          .no-print {
            display: none !important;
          }
        }
      `}</style>
    </>
  );
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
