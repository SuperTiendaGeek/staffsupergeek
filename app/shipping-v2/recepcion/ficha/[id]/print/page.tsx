import { Suspense } from "react";
import type { ReactNode } from "react";
import { getShippingV2ItemById, getShippingV2TechnicalOptionSets } from "@/lib/shipping-v2/airtable";
import type { ShippingV2Item, ShippingV2TechnicalOption } from "@/types/shipping-v2";
import { ShippingV2PrintControls } from "./ShippingV2PrintControls";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

function display(value?: string | number | string[] | null) {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "-";
  const text = String(value ?? "").trim();
  return text || "-";
}

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(value);
}

function Row({ label, value }: { label: string; value?: string | number | string[] | null }) {
  return (
    <div className="grid grid-cols-[155px_1fr] border-b border-neutral-200 py-2 text-sm">
      <dt className="font-semibold text-neutral-600">{label}</dt>
      <dd className="text-neutral-950">{display(value)}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="break-inside-avoid">
      <h2 className="mb-1 border-b-2 border-neutral-950 pb-1 text-sm font-bold uppercase tracking-normal text-neutral-950">{title}</h2>
      <dl>{children}</dl>
    </section>
  );
}

function itemTitle(item: ShippingV2Item) {
  const title = [item.technicalSheet.marcaFicha, item.technicalSheet.modeloFicha].filter(Boolean).join(" ");
  return title || item.nombre;
}

function namesFromIds(ids: string[], options: ShippingV2TechnicalOption[]) {
  return ids.map((id) => options.find((option) => option.id === id)?.name).filter((name): name is string => Boolean(name));
}

export default async function ShippingV2FichaTecnicaPrintPage({ params }: Props) {
  const { id } = await params;
  const [item, technicalOptions] = await Promise.all([
    getShippingV2ItemById(id, { includeAiName: false }),
    getShippingV2TechnicalOptionSets(),
  ]);
  const sheet = item.technicalSheet;
  const connectivity = namesFromIds(sheet.connectivityV2Ids, technicalOptions.connectivity);
  const ports = namesFromIds(sheet.portV2Ids, technicalOptions.ports);
  const extraFeatures = namesFromIds(sheet.extraFeatureV2Ids, technicalOptions.extraFeatures);

  return (
    <main className="min-h-screen bg-white px-6 py-5 text-black print:p-0">
      <style>{`
        @page { size: A4; margin: 14mm; }
        @media print {
          body { background: white !important; }
          main { min-height: auto !important; }
        }
      `}</style>
      <Suspense fallback={null}>
        <ShippingV2PrintControls />
      </Suspense>

      <article className="mx-auto max-w-[794px] bg-white print:max-w-none">
        <header className="mb-5 border-b-4 border-neutral-950 pb-4">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-normal text-neutral-500">Ficha técnica</p>
              <h1 className="mt-1 text-3xl font-bold leading-tight text-neutral-950">{display(itemTitle(item))}</h1>
              <p className="mt-2 max-w-2xl text-sm text-neutral-700">{display(item.nombre)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold uppercase text-neutral-500">Precio</p>
              <p className="text-2xl font-bold text-neutral-950">{formatCurrency(item.precioVenta || item.precioVentaSugerido)}</p>
              <p className="mt-2 text-xs font-semibold text-neutral-600">SKU {display(item.sku)}</p>
            </div>
          </div>
        </header>

        <div className="grid gap-6 md:grid-cols-2">
          <Section title="Equipo">
            <Row label="Marca" value={sheet.marcaFicha} />
            <Row label="Modelo" value={sheet.modeloFicha} />
            <Row label="Sistema operativo" value={sheet.sistemaOperativo} />
            <Row label="Categoría" value={item.categoria} />
            <Row label="SKU" value={item.sku} />
          </Section>

          <Section title="Pantalla">
            <Row label="Tamaño" value={sheet.pantallaTamano} />
            <Row label="Resolución" value={sheet.pantallaResolucion} />
          </Section>

          <Section title="Procesador y gráficos">
            <Row label="CPU marca" value={sheet.cpuMarca} />
            <Row label="CPU modelo" value={sheet.cpuModelo} />
            <Row label="Frecuencia base" value={sheet.cpuFrecuenciaBase} />
            <Row label="Frecuencia turbo" value={sheet.cpuFrecuenciaTurbo} />
            <Row label="GPU" value={sheet.gpu} />
          </Section>

          <Section title="Memoria y almacenamiento">
            <Row label="RAM capacidad" value={sheet.ramCapacidad} />
            <Row label="RAM tipo" value={sheet.ramTipo} />
            <Row label="Almacenamiento" value={sheet.almacenamientoPrincipal} />
            <Row label="Tipo" value={sheet.almacenamientoTipo} />
          </Section>

          <Section title="Conectividad">
            <Row label="Conectividad" value={connectivity} />
            <Row label="Puertos" value={ports} />
            <Row label="Extras" value={extraFeatures} />
          </Section>

          <Section title="Batería y observaciones">
            <Row label="Salud batería" value={sheet.bateriaSalud === null ? "" : `${sheet.bateriaSalud}%`} />
            <Row label="Estado batería" value={sheet.bateriaEstado} />
            <Row label="Observación" value={sheet.observacionFichaTecnica} />
          </Section>
        </div>
      </article>
    </main>
  );
}
