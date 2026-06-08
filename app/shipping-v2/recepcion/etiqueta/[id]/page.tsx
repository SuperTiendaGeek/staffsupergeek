import { notFound } from "next/navigation";
import { getShippingV2ItemById } from "@/lib/shipping-v2/airtable";
import { PrintSkuLabelButton } from "./PrintSkuLabelButton";

type Props = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

function PrintableSkuLabel({ sku }: { sku: string }) {
  return (
    <>
      <main className="label-sheet">
        <div className="sku" title={sku}>{sku}</div>
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

  try {
    const item = await getShippingV2ItemById(id, { includeAiName: false });
    return <PrintableSkuLabel sku={item.sku?.trim() || "SKU no disponible"} />;
  } catch (error) {
    console.error("Error al cargar etiqueta SKU Shipping V2:", error);
    if (error instanceof Error && error.message.includes("NOT_FOUND")) notFound();
    return <PrintableSkuLabel sku="SKU no disponible" />;
  }
}
