import { Suspense } from "react";
import type { CSSProperties } from "react";
import { getShippingV2ItemById, getShippingV2TechnicalOptionSets } from "@/lib/shipping-v2/airtable";
import type { ShippingV2Item, ShippingV2TechnicalOption } from "@/types/shipping-v2";
import { ShippingV2PrintControls } from "./ShippingV2PrintControls";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

type PosterLine = {
  key: string;
  value: string;
  tone?: "black" | "blue" | "red";
  role?: "main" | "ports" | "battery";
};

type SaleCardStyle = CSSProperties & {
  "--brand-size": string;
  "--model-size": string;
  "--price-size": string;
  "--line-size": string;
  "--ports-size": string;
  "--battery-size": string;
  "--spec-gap": string;
  "--card-gap": string;
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
  const state = clean(item.technicalSheet.bateriaEstado);
  if (!hasValue(state)) return "";
  if (state === "Excelente") return "Bateria en excelente estado";
  if (state === "Muy buena") return "Bateria en muy buen estado";
  if (state === "Buena / Aceptable") return "Bateria en buen estado";
  if (state === "Regular / Requiere Servicio") return "Bateria regular";
  if (state === "Mala / Agotada") return "Bateria agotada";
  return state;
}

function featureText(labels: string[]) {
  return labels.filter(hasValue).slice(0, 7).join(" / ");
}

function makeLine(key: string, value: string, tone: PosterLine["tone"] = "black", role: PosterLine["role"] = "main"): PosterLine | null {
  if (!hasValue(value)) return null;
  return { key, value, tone, role };
}

function compact<T>(items: Array<T | null>) {
  return items.filter((item): item is T => item !== null);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function layoutForPoster(input: { brand: string; model: string; price: string; lines: PosterLine[] }) {
  const lineLoad = input.lines.reduce((total, line) => {
    const divisor = line.role === "ports" ? 32 : line.role === "battery" ? 34 : 22;
    return total + Math.max(1, Math.ceil(line.value.length / divisor));
  }, 0);
  const titleLoad = Math.ceil(input.brand.length / 14) + Math.ceil(input.model.length / 22);
  const load = lineLoad + titleLoad + input.lines.length;
  const density = load <= 18 ? "poster-xl" : load >= 22 ? "poster-compact" : "poster-standard";

  const lineSize = density === "poster-xl" ? 15.4 : density === "poster-compact" ? 11.4 : 13.8;
  const brandBase = density === "poster-compact" ? 17.5 : density === "poster-xl" ? 24 : 21;
  const modelBase = density === "poster-compact" ? 13.8 : density === "poster-xl" ? 18.6 : 16.2;
  const brandSize = clamp(brandBase - Math.max(0, input.brand.length - 10) * 0.32, 12.5, 24);
  const modelSize = clamp(modelBase - Math.max(0, input.model.length - 18) * 0.22, 9.4, 18.6);
  const priceSize = input.price.length > 5 ? 16.2 : 19.4;

  const style: SaleCardStyle = {
    "--brand-size": `${brandSize.toFixed(1)}mm`,
    "--model-size": `${modelSize.toFixed(1)}mm`,
    "--price-size": `${priceSize.toFixed(1)}mm`,
    "--line-size": `${lineSize.toFixed(1)}mm`,
    "--ports-size": `${(lineSize * (density === "poster-xl" ? 0.82 : 0.8)).toFixed(1)}mm`,
    "--battery-size": `${(lineSize * (density === "poster-compact" ? 0.94 : 0.96)).toFixed(1)}mm`,
    "--spec-gap": density === "poster-xl" ? "1.5mm" : density === "poster-compact" ? "0.35mm" : "0.7mm",
    "--card-gap": density === "poster-xl" ? "1.6mm" : density === "poster-compact" ? "0.5mm" : "0.8mm",
  };

  return { className: density, style };
}

function Line({ line }: { line: PosterLine }) {
  const density = line.value.length > 92 ? "line--xs" : line.value.length > 62 ? "line--sm" : "";
  return <div className={`line ${line.tone ?? "black"} ${line.role ?? "main"} ${density}`}>{line.value}</div>;
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
  const posterLines = compact([
    makeLine("os", clean(sheet.sistemaOperativo)),
    makeLine("screen", screenText(item)),
    makeLine("cpu", cpuText(item), "blue"),
    makeLine("gpu", clean(sheet.gpu), "blue"),
    makeLine("storage", storageText(item), "red"),
    makeLine("ram", ramText(item), "red"),
    makeLine("features", featureText([...connectivity, ...ports, ...extraFeatures]), "black", "ports"),
    makeLine("battery", footerNote, "blue", "battery"),
    makeLine("note", secondaryNote, "black", "ports"),
  ]);
  const layout = layoutForPoster({ brand, model, price, lines: posterLines });

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
          padding: 2mm;
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
          border: 3.2mm solid #050505;
          background: #ffffff;
          padding: 2.2mm;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          color: #000;
          font-family: Impact, "Arial Black", system-ui, sans-serif;
          text-transform: uppercase;
          page-break-inside: avoid;
          gap: var(--card-gap);
        }

        .top {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 3mm;
          align-items: start;
        }

        .brand {
          color: #000;
          font-size: var(--brand-size);
          line-height: 0.86;
          letter-spacing: -0.8mm;
          word-break: break-word;
          font-style: italic;
        }

        .model {
          color: #000;
          font-size: var(--model-size);
          line-height: 0.86;
          letter-spacing: -0.65mm;
          word-break: break-word;
          font-style: italic;
        }

        .priceBox {
          min-width: 46mm;
          border: 1.4mm solid #0057ff;
          background: #ffffff;
          padding: 1.7mm 2.4mm;
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
          font-size: var(--price-size);
          line-height: 1;
          font-style: italic;
        }

        .specs {
          display: flex;
          flex: 1;
          flex-direction: column;
          justify-content: space-between;
          gap: var(--spec-gap);
          min-height: 0;
        }

        .line {
          font-size: var(--line-size);
          line-height: 0.92;
          letter-spacing: -0.06mm;
          word-break: break-word;
          font-style: italic;
        }

        .line--sm {
          font-size: calc(var(--line-size) * 0.94);
          line-height: 0.94;
        }

        .line--xs {
          font-size: calc(var(--line-size) * 0.82);
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

        .line.ports {
          font-size: var(--ports-size);
          line-height: 0.95;
          letter-spacing: -0.18mm;
          color: #000;
        }

        .line.battery {
          font-size: var(--battery-size);
          line-height: 0.95;
          letter-spacing: -0.18mm;
          color: #0057ff;
        }

        .poster-xl .specs {
          justify-content: space-around;
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
            padding: 2mm;
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
          <article className={`sale-card ${layout.className}`} style={layout.style}>
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
              {posterLines.map((line) => <Line key={line.key} line={line} />)}
            </div>

            <div className="footer">SKU {clean(item.sku)}</div>
          </article>
        </section>
        <section className="half-page half-page--empty" aria-hidden="true" />
      </section>
    </main>
  );
}
