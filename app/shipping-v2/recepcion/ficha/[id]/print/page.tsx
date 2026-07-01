import { Suspense } from "react";
import { getShippingV2ItemById, getShippingV2TechnicalOptionSets } from "@/lib/shipping-v2/airtable";
import type { ShippingV2Item, ShippingV2TechnicalOption } from "@/types/shipping-v2";
import { ShippingV2PrintControls } from "./ShippingV2PrintControls";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

function clean(value?: string | number | null) {
  return String(value ?? "").trim();
}

function hasValue(value?: string | number | null) {
  const text = clean(value);
  return Boolean(text && text !== "-" && text.toLowerCase() !== "no aplica");
}

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function namesFromIds(ids: string[], options: ShippingV2TechnicalOption[]) {
  return ids.map((id) => options.find((option) => option.id === id)?.name).filter((name): name is string => Boolean(name));
}

function joinParts(parts: Array<string | number | null | undefined>) {
  return parts.map(clean).filter(hasValue).join(" ");
}

function itemBrand(item: ShippingV2Item) {
  const sheet = item.technicalSheet;
  return clean(sheet.marcaFicha) || clean(item.marca) || "Laptop";
}

function itemModel(item: ShippingV2Item) {
  const sheet = item.technicalSheet;
  return clean(sheet.modeloFicha) || clean(item.modelo) || clean(item.nombre);
}

function cpuText(item: ShippingV2Item) {
  const sheet = item.technicalSheet;
  const frequency = [sheet.cpuFrecuenciaBase, sheet.cpuFrecuenciaTurbo].map(clean).filter(hasValue).join(" - ");
  return joinParts([sheet.cpuMarca, sheet.cpuModelo, frequency]);
}

function ramText(item: ShippingV2Item) {
  const sheet = item.technicalSheet;
  return joinParts([sheet.ramCapacidad, sheet.ramTipo]);
}

function storageText(item: ShippingV2Item) {
  const sheet = item.technicalSheet;
  return joinParts([sheet.almacenamientoPrincipal, sheet.almacenamientoTipo]);
}

function screenText(item: ShippingV2Item) {
  const sheet = item.technicalSheet;
  const size = clean(sheet.pantallaTamano);
  const resolution = clean(sheet.pantallaResolucion);
  if (hasValue(size) && hasValue(resolution)) return `${size} / ${resolution}`;
  return joinParts([size, resolution]);
}

function batteryText(item: ShippingV2Item) {
  const sheet = item.technicalSheet;
  if (typeof sheet.bateriaSalud === "number" && Number.isFinite(sheet.bateriaSalud)) {
    return `Bateria ${sheet.bateriaSalud}% de salud`;
  }
  return clean(sheet.bateriaEstado);
}

function featureText(labels: string[]) {
  return labels.filter(hasValue).slice(0, 7).join(" / ");
}

function Line({ value, tone = "black", className = "" }: { value: string; tone?: "black" | "blue" | "red"; className?: string }) {
  if (!hasValue(value)) return null;
  const density = value.length > 76 ? "line--xs" : value.length > 48 ? "line--sm" : "";
  return <div className={`line ${tone} ${density} ${className}`}>{value}</div>;
}

export default async function ShippingV2FichaTecnicaPrintPage({ params }: Props) {
  const { id } = await params;
  const [item, technicalOptions] = await Promise.all([
    getShippingV2ItemById(id, { includeAiName: false }),
    getShippingV2TechnicalOptionSets(),
  ]);
  const sheet = item.technicalSheet;
  const brand = itemBrand(item);
  const model = itemModel(item);
  const price = formatCurrency(item.precioVenta ?? item.precioVentaSugerido);
  const connectivity = namesFromIds(sheet.connectivityV2Ids, technicalOptions.connectivity);
  const ports = namesFromIds(sheet.portV2Ids, technicalOptions.ports);
  const extraFeatures = namesFromIds(sheet.extraFeatureV2Ids, technicalOptions.extraFeatures);
  const commercialNote = clean(item.observacionVenta) || clean(sheet.observacionFichaTecnica);
  const footerNote = batteryText(item) || commercialNote;
  const secondaryNote = footerNote === commercialNote ? "" : commercialNote;
  const specLines = [
    sheet.sistemaOperativo,
    screenText(item),
    cpuText(item),
    clean(sheet.gpu),
    storageText(item),
    ramText(item),
    featureText([...connectivity, ...ports, ...extraFeatures]),
    footerNote,
    secondaryNote,
  ].filter(hasValue);
  const densityClass = specLines.length <= 5 ? "sale-card--sparse" : specLines.length >= 8 ? "sale-card--dense" : "";

  return (
    <main className="print-page">
      <style>{`
        @page {
          size: A4 landscape;
          margin: 0;
        }

        * {
          box-sizing: border-box;
        }

        html,
        body {
          margin: 0;
          background: #f2f2f2;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .print-page {
          min-height: 100vh;
          background: #f2f2f2;
          color: #050505;
          font-family: Impact, "Arial Black", system-ui, sans-serif;
          padding: 18px;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .print-sheet {
          width: 297mm;
          height: 210mm;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 148.5mm 148.5mm;
          background: white;
          box-shadow: 0 24px 70px rgba(0, 0, 0, 0.18);
        }

        .half-page {
          width: 148.5mm;
          height: 210mm;
          padding: 5mm;
        }

        .half-page--empty {
          border-left: 1px dashed #d0d0d0;
          background:
            linear-gradient(90deg, transparent calc(50% - 0.5px), #f2f2f2 calc(50% - 0.5px), #f2f2f2 calc(50% + 0.5px), transparent calc(50% + 0.5px));
        }

        .sale-card {
          width: 100%;
          height: 100%;
          overflow: hidden;
          border: 2.2mm solid #050505;
          background: #ffffff;
          padding: 5mm;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          color: #000;
          font-family: Impact, "Arial Black", system-ui, sans-serif;
          text-transform: uppercase;
          page-break-inside: avoid;
        }

        .top {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 4mm;
          align-items: start;
        }

        .brand {
          color: #000;
          font-size: 15mm;
          line-height: 0.86;
          letter-spacing: -0.5mm;
          word-break: break-word;
        }

        .model {
          color: #000;
          font-size: 13mm;
          line-height: 0.86;
          letter-spacing: -0.4mm;
          word-break: break-word;
        }

        .priceBox {
          min-width: 42mm;
          border: 1.4mm solid #0057ff;
          background: #ffffff;
          padding: 2mm 3mm;
          color: #0057ff;
          text-align: center;
        }

        .priceLabel {
          color: #050505;
          font-size: 4mm;
          line-height: 1;
        }

        .price {
          color: #0057ff;
          font-size: 15mm;
          line-height: 1;
        }

        .specs {
          display: flex;
          flex: 1;
          flex-direction: column;
          justify-content: center;
          gap: 1.8mm;
          min-height: 0;
        }

        .line {
          font-size: 9.5mm;
          line-height: 0.92;
          letter-spacing: -0.25mm;
          word-break: break-word;
        }

        .line--sm {
          font-size: 8mm;
          line-height: 0.94;
        }

        .line--xs {
          font-size: 6.7mm;
          line-height: 0.95;
        }

        .line.black {
          color: #000;
        }

        .line.blue {
          color: #0057ff;
        }

        .line.red {
          color: #e00000;
        }

        .ports {
          font-size: 6.7mm;
          line-height: 0.95;
          letter-spacing: -0.18mm;
          color: #000;
        }

        .battery {
          font-size: 7.5mm;
          line-height: 0.95;
          letter-spacing: -0.18mm;
          color: #0057ff;
        }

        .sale-card--sparse .line {
          font-size: 10.8mm;
        }

        .sale-card--sparse .ports {
          font-size: 7.6mm;
        }

        .sale-card--dense .line {
          font-size: 8.4mm;
        }

        .sale-card--dense .ports {
          font-size: 6.1mm;
        }

        .footer {
          display: flex;
          justify-content: flex-end;
          align-items: flex-end;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 3mm;
          font-weight: 800;
          color: #000;
        }

        @media print {
          html,
          body {
            width: 297mm;
            height: 210mm;
            margin: 0 !important;
            background: white !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .print-page {
            width: 297mm;
            min-height: 210mm;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }

          .print-sheet {
            width: 297mm;
            height: 210mm;
            margin: 0 !important;
            display: grid;
            grid-template-columns: 148.5mm 148.5mm;
            box-shadow: none !important;
          }

          .half-page {
            width: 148.5mm;
            height: 210mm;
            padding: 5mm;
          }

          .sale-card {
            width: 100%;
            height: 100%;
            page-break-inside: avoid;
            break-inside: avoid;
          }
        }
      `}</style>

      <Suspense fallback={null}>
        <ShippingV2PrintControls />
      </Suspense>

      <section className="print-sheet" aria-label="Hoja A4 horizontal para fichas de venta">
        <section className="half-page">
          <article className={`sale-card ${densityClass}`}>
            <div className="top">
              <div>
                <div className="brand">{brand}</div>
                {model ? <div className="model">{model}</div> : null}
              </div>
              {price ? (
                <div className="priceBox">
                  <div className="priceLabel">Precio</div>
                  <div className="price">{price}</div>
                </div>
              ) : null}
            </div>

            <div className="specs">
              <Line value={clean(sheet.sistemaOperativo)} />
              <Line value={screenText(item)} />
              <Line value={cpuText(item)} tone="blue" />
              <Line value={clean(sheet.gpu)} tone="blue" />
              <Line value={storageText(item)} tone="red" />
              <Line value={ramText(item)} tone="red" />
              <Line value={featureText([...connectivity, ...ports, ...extraFeatures])} className="ports" />
              <Line value={footerNote} tone="blue" className="battery" />
              <Line value={secondaryNote} className="ports" />
            </div>

            <div className="footer">SKU {clean(item.sku)}</div>
          </article>
        </section>
        <section className="half-page half-page--empty" aria-hidden="true" />
      </section>
    </main>
  );
}
