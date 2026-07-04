import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getShippingV2ItemById, getShippingV2TechnicalOptionSets } from "@/lib/shipping-v2/airtable";
import { isFichaGenerada } from "@/lib/shipping-v2/technical-sheet";
import type { ShippingV2Item, ShippingV2TechnicalOption, ShippingV2TechnicalSheet } from "@/types/shipping-v2";
import { ShippingV2PrintControls } from "./ShippingV2PrintControls";
import { FichaVentaPrintTemplate, type FichaVentaData } from "./FichaVentaPrintTemplate";
import pageStyles from "./page.module.css";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

type ShippingV2TechnicalOptionSets = Awaited<ReturnType<typeof getShippingV2TechnicalOptionSets>>;

function clean(value?: string | number | null) {
  return String(value ?? "").trim();
}

function hasValue(value?: string | number | null) {
  const text = clean(value);
  return Boolean(text && text !== "-" && text.toLowerCase() !== "no aplica");
}

function joinParts(parts: Array<string | number | null | undefined>, separator = " ") {
  return parts.map(clean).filter(hasValue).join(separator);
}

function namesFromIds(ids: unknown, options: unknown) {
  if (!Array.isArray(ids) || !Array.isArray(options)) return [];
  return ids
    .map((id) => (options as ShippingV2TechnicalOption[]).find((option) => option.id === id)?.name)
    .filter((name): name is string => Boolean(name));
}

function safe<T>(compute: () => T, fallback: T): T {
  try {
    return compute();
  } catch {
    return fallback;
  }
}

function stripGhz(value: string) {
  return value.replace(/\s*ghz\s*$/i, "").trim();
}

function screenLine(sheet: ShippingV2TechnicalSheet) {
  const line = joinParts([sheet.pantallaTamano, sheet.pantallaResolucion]);
  return hasValue(line) ? line : null;
}

function cpuModelLine(sheet: ShippingV2TechnicalSheet) {
  const line = joinParts([sheet.cpuMarca, sheet.cpuModelo]);
  return hasValue(line) ? line : null;
}

function cpuFrequencyLine(sheet: ShippingV2TechnicalSheet) {
  const base = clean(sheet.cpuFrecuenciaBase);
  const turbo = clean(sheet.cpuFrecuenciaTurbo);
  if (!hasValue(base) && !hasValue(turbo)) return null;
  if (hasValue(base) && hasValue(turbo)) return `${stripGhz(base)}-${stripGhz(turbo)}GHz CPU`;
  return `${stripGhz(hasValue(base) ? base : turbo)}GHz CPU`;
}

function storageLine(sheet: ShippingV2TechnicalSheet) {
  const line = joinParts([sheet.almacenamientoPrincipal, sheet.almacenamientoTipo]);
  return hasValue(line) ? line : null;
}

function ramLine(sheet: ShippingV2TechnicalSheet) {
  const capacidad = clean(sheet.ramCapacidad);
  const tipo = clean(sheet.ramTipo);
  if (!hasValue(capacidad) && !hasValue(tipo)) return null;
  return [capacidad, "RAM", tipo].filter((part, index) => index === 1 || hasValue(part)).join(" ");
}

function connectivityLine(sheet: ShippingV2TechnicalSheet, technicalOptions: ShippingV2TechnicalOptionSets) {
  const all = [
    ...namesFromIds(sheet.connectivityV2Ids, technicalOptions.connectivity),
    ...namesFromIds(sheet.portV2Ids, technicalOptions.ports),
    ...namesFromIds(sheet.extraFeatureV2Ids, technicalOptions.extraFeatures),
  ].filter(hasValue);
  return all.length ? all.join(", ") : null;
}

function buildFichaVentaData(item: ShippingV2Item, technicalOptions: ShippingV2TechnicalOptionSets): FichaVentaData {
  const sheet = item.technicalSheet;

  return {
    marca: safe(() => clean(sheet.marcaFicha) || clean(item.marca) || "Equipo", "Equipo"),
    modelo: safe(() => clean(sheet.modeloFicha) || clean(item.modelo) || clean(item.nombre), ""),
    precio: safe(() => item.precioVenta ?? item.precioVentaSugerido ?? null, null),
    sistemaOperativo: safe(() => {
      const os = clean(sheet.sistemaOperativo);
      return hasValue(os) ? os.toLocaleUpperCase("es") : null;
    }, null),
    pantalla: safe(() => screenLine(sheet), null),
    cpuLinea1: safe(() => cpuModelLine(sheet), null),
    cpuLinea2: safe(() => cpuFrequencyLine(sheet), null),
    almacenamiento: safe(() => storageLine(sheet), null),
    ram: safe(() => ramLine(sheet), null),
    conectividadYPuertos: safe(() => connectivityLine(sheet, technicalOptions), null),
    bateriaEstado: safe(() => {
      const estado = clean(sheet.bateriaEstado);
      return hasValue(estado) ? estado : null;
    }, null),
    sku: safe(() => clean(item.sku), ""),
  };
}

export default async function ShippingV2FichaTecnicaPrintPage({ params }: Props) {
  const { id } = await params;
  const [item, technicalOptions] = await Promise.all([
    getShippingV2ItemById(id, { includeAiName: false }),
    getShippingV2TechnicalOptionSets(),
  ]);

  if (!isFichaGenerada(item)) {
    const hasMinimumFicha = Boolean(clean(item.technicalSheet.marcaFicha) && clean(item.technicalSheet.modeloFicha));
    if (hasMinimumFicha) {
      redirect(`/shipping-v2/recepcion/ficha/${encodeURIComponent(item.id)}`);
    }
    return (
      <main className={pageStyles.printPage}>
        <div className={pageStyles.emptyState}>Ficha no generada</div>
      </main>
    );
  }

  const ficha = buildFichaVentaData(item, technicalOptions);

  return (
    <main className={pageStyles.printPage}>
      <Suspense fallback={null}>
        <ShippingV2PrintControls />
      </Suspense>

      <section className={pageStyles.sheet} aria-label="Hoja A4 con la ficha de venta en la mitad izquierda">
        <div className={pageStyles.half}>
          <FichaVentaPrintTemplate ficha={ficha} />
        </div>
        <div className={pageStyles.cutLine} aria-hidden="true" />
        <div className={pageStyles.half} aria-hidden="true" />
      </section>
    </main>
  );
}
