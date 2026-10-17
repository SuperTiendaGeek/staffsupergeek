"use client";

import { useLayoutEffect, useRef } from "react";
import { Lilita_One } from "next/font/google";
import type { FichaVentaData } from "@/lib/shipping-v2/ficha-venta-data";
import styles from "./ficha-print.module.css";
import { markFichaPrintReady } from "./ficha-print-ready";

const lilitaOne = Lilita_One({
  subsets: ["latin"],
  weight: "400",
  style: "normal",
  display: "swap",
  fallback: ["Luckiest Guy", "Chalkboard SE", "Comic Sans MS", "sans-serif"],
});

export type { FichaVentaData };

// Marca, modelo y batería mantienen el ajuste aproximado por ancho estimado
// (no cambian de comportamiento). El resto de las líneas se ajustan en el
// navegador con medición real, ver el useLayoutEffect más abajo.
const CARD_WIDTH_MM = 126;
const MIXED_CASE_RATIO = 0.5;
// Aire mínimo entre el texto ajustado a ancho y el borde de corte (~4mm).
const EDGE_SAFETY_PX = 15;

function fitWidthMm(text: string, ratio: number, min: number, max: number, widthMm = CARD_WIDTH_MM) {
  const length = text.length || 1;
  const size = widthMm / (length * ratio);
  return Math.round(Math.min(max, Math.max(min, size)) * 10) / 10;
}

function formatPrice(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

// Ajusta un elemento de una sola línea para que su ancho renderizado llene
// exactamente `availableWidthPx`. Mide con scrollWidth (no getBoundingClientRect)
// porque scrollWidth no se ve afectado por el transform skew de la línea.
function fitLineToWidth(el: HTMLElement | null, availableWidthPx: number, min: number, max: number, basePx = 100) {
  if (!el || !el.textContent || availableWidthPx <= 0) return;
  el.style.whiteSpace = "nowrap";
  el.style.fontSize = `${basePx}px`;
  const measured = el.scrollWidth || 1;
  const scale = availableWidthPx / measured;
  const finalSize = Math.min(max, Math.max(min, basePx * scale));
  el.style.fontSize = `${finalSize}px`;
}

export function FichaVentaPrintTemplate({ ficha }: { ficha: FichaVentaData }) {
  const price = formatPrice(ficha.precio);
  const battery = ficha.bateriaEstado ? `Batería ${ficha.bateriaEstado}` : "";
  const fitSignature = [
    ficha.marca,
    ficha.modelo,
    price,
    ficha.sistemaOperativo,
    ficha.pantalla,
    ficha.cpuLinea1,
    ficha.cpuLinea2,
    ficha.gpu,
    ficha.gpuIntegrada,
    ficha.almacenamiento,
    ficha.ram,
    ficha.conectividadYPuertos,
    battery,
    ficha.sku,
  ].join("|");

  const brandSizeMm = fitWidthMm(ficha.marca, MIXED_CASE_RATIO, 11, 30, CARD_WIDTH_MM * 0.6);
  const modelSizeMm = fitWidthMm(ficha.modelo, MIXED_CASE_RATIO, 8, 24) * 0.8;
  // Presupuesto de ancho reducido: la batería comparte la fila del footer con el SKU.
  const batterySizeMm = fitWidthMm(battery, MIXED_CASE_RATIO, 8, 18, CARD_WIDTH_MM - 26);
  const priceInitialMm = fitWidthMm(price, 0.57, 22, 55, CARD_WIDTH_MM * 0.5);

  const cardRef = useRef<HTMLElement>(null);
  const linesGroupRef = useRef<HTMLDivElement>(null);
  const topRowRef = useRef<HTMLDivElement>(null);
  const brandRef = useRef<HTMLSpanElement>(null);
  const priceRef = useRef<HTMLParagraphElement>(null);
  const osRef = useRef<HTMLParagraphElement>(null);
  const screenRef = useRef<HTMLParagraphElement>(null);
  const cpu1Ref = useRef<HTMLParagraphElement>(null);
  const cpu2Ref = useRef<HTMLParagraphElement>(null);
  const gpuRef = useRef<HTMLParagraphElement>(null);
  const gpuIntegradaRef = useRef<HTMLParagraphElement>(null);
  const storageRef = useRef<HTMLParagraphElement>(null);
  const ramRef = useRef<HTMLParagraphElement>(null);
  const connectivityWrapRef = useRef<HTMLDivElement>(null);
  const connectivityRef = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    let cancelled = false;

    async function run() {
      const fontsReady = typeof document !== "undefined" ? document.fonts?.ready : null;
      if (fontsReady) {
        try {
          await fontsReady;
        } catch {
          // seguimos con las métricas de fallback si fonts.ready rechaza
        }
      }
      if (cancelled) return;

      const card = cardRef.current;
      if (!card) {
        markFichaPrintReady();
        return;
      }

      const cardHeightPx = card.clientHeight || 1;
      const maxSpecPx = cardHeightPx * 0.15;
      const minSpecPx = 22;

      const specsWidthPx = (linesGroupRef.current?.clientWidth ?? card.clientWidth) - EDGE_SAFETY_PX;
      fitLineToWidth(osRef.current, specsWidthPx, minSpecPx, maxSpecPx);
      fitLineToWidth(screenRef.current, specsWidthPx, minSpecPx, maxSpecPx);
      fitLineToWidth(cpu1Ref.current, specsWidthPx, minSpecPx, maxSpecPx);
      fitLineToWidth(cpu2Ref.current, specsWidthPx, minSpecPx, maxSpecPx);
      fitLineToWidth(gpuRef.current, specsWidthPx, minSpecPx, maxSpecPx);
      fitLineToWidth(gpuIntegradaRef.current, specsWidthPx, minSpecPx, maxSpecPx);
      fitLineToWidth(storageRef.current, specsWidthPx, minSpecPx, maxSpecPx);
      fitLineToWidth(ramRef.current, specsWidthPx, minSpecPx, maxSpecPx);

      // Precio: presupuesto grande dentro de la fila superior (más del doble que antes).
      const topRow = topRowRef.current;
      const topRowWidthPx = (topRow?.clientWidth ?? card.clientWidth) - EDGE_SAFETY_PX;
      const gapPx = topRow ? parseFloat(getComputedStyle(topRow).columnGap || getComputedStyle(topRow).gap || "0") || 0 : 0;
      fitLineToWidth(priceRef.current, topRowWidthPx * 0.48, minSpecPx * 1.2, maxSpecPx * 1.35);

      // Si el precio ahora más grande choca con la marca, el precio manda: la marca cede
      // espacio. Se mide con getBoundingClientRect (a diferencia del resto, aquí SÍ importa
      // el rectángulo ya inclinado por el skew) porque marca y precio tienen alturas
      // distintas y sus orígenes de inclinación independientes pueden solaparse visualmente
      // aunque sus cajas de layout no se toquen.
      if (brandRef.current && priceRef.current && ficha.precio !== null) {
        const brandEl = brandRef.current;
        brandEl.style.whiteSpace = "nowrap";
        const clearancePx = Math.max(10, (parseFloat(getComputedStyle(priceRef.current).fontSize) || 40) * 0.08);
        for (let i = 0; i < 10; i++) {
          const brandRect = brandEl.getBoundingClientRect();
          const priceRect = priceRef.current.getBoundingClientRect();
          const overlap = brandRect.right - priceRect.left + clearancePx;
          if (overlap <= 0) break;
          const currentPx = parseFloat(getComputedStyle(brandEl).fontSize) || 40;
          const nextPx = Math.max(minSpecPx * 0.7, currentPx * 0.9);
          brandEl.style.fontSize = `${nextPx}px`;
          if (nextPx <= minSpecPx * 0.7) break;
        }
      }

      // Conectividad: bloque flexible, se adapta al alto que sobra entre RAM y batería.
      // Búsqueda binaria sobre el font-size real (mide scrollHeight/scrollWidth ya envueltos).
      // Es texto multilínea normal (sin fit-to-width horizontal ni skew): el ancho
      // disponible sale directo del wrap, con el mismo margen de seguridad de borde.
      const wrap = connectivityWrapRef.current;
      const paragraph = connectivityRef.current;
      if (wrap && paragraph && paragraph.textContent) {
        const availableHeight = wrap.clientHeight;
        // Sin resta de EDGE_SAFETY_PX aquí: el párrafo ya envuelve dentro de
        // wrap.clientWidth (el padding de la tarjeta ya lo acota), así que
        // comparar scrollWidth contra un valor más chico que ese mismo ancho
        // de envoltura nunca podía cumplirse.
        const availableWidth = wrap.clientWidth;
        // Margen de seguridad real (no solo "no desborda al pixel"): el wrap tiene
        // overflow:hidden, así que un ajuste demasiado justo corta la última línea.
        const heightSafety = Math.max(3, availableHeight * 0.02);
        let lo = 9;
        let hi = maxSpecPx * 1.1;
        for (let i = 0; i < 10; i++) {
          const mid = (lo + hi) / 2;
          paragraph.style.fontSize = `${mid}px`;
          const fits = paragraph.scrollHeight <= availableHeight - heightSafety && paragraph.scrollWidth <= availableWidth;
          if (fits) lo = mid;
          else hi = mid;
        }
        paragraph.style.fontSize = `${lo}px`;
      }

      if (!cancelled) markFichaPrintReady();
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [fitSignature]);

  return (
    <article ref={cardRef} className={cx(styles.card, lilitaOne.className)}>
      <div className={styles.skewContent}>
        <div className={styles.linesGroup} ref={linesGroupRef}>
          <div className={styles.topRow} ref={topRowRef}>
            <p className={styles.brand} style={{ fontSize: `${brandSizeMm}mm` }}>
              <span ref={brandRef}>{ficha.marca}</span>
            </p>
            {price ? (
              <p className={styles.price} ref={priceRef} style={{ fontSize: `${priceInitialMm}mm` }}>
                {price}
              </p>
            ) : null}
          </div>
          {ficha.modelo ? (
            <p className={styles.model} style={{ fontSize: `${modelSizeMm}mm` }}>
              {ficha.modelo}
            </p>
          ) : null}
          {ficha.sistemaOperativo ? (
            <p ref={osRef} className={cx(styles.line, styles.os)}>
              {ficha.sistemaOperativo}
            </p>
          ) : null}
          {ficha.pantalla ? (
            <p ref={screenRef} className={cx(styles.line, styles.screen)}>
              {ficha.pantalla}
            </p>
          ) : null}
          {ficha.cpuLinea1 ? (
            <p ref={cpu1Ref} className={cx(styles.line, styles.cpuLine1)}>
              {ficha.cpuLinea1}
            </p>
          ) : null}
          {ficha.cpuLinea2 ? (
            <p ref={cpu2Ref} className={cx(styles.line, styles.cpuLine2)}>
              {ficha.cpuLinea2}
            </p>
          ) : null}
          {ficha.gpu ? (
            <p ref={gpuRef} className={cx(styles.line, styles.gpu)}>
              {ficha.gpu}
            </p>
          ) : null}
          {ficha.gpuIntegrada ? (
            <p ref={gpuIntegradaRef} className={cx(styles.line, styles.gpu)}>
              {ficha.gpuIntegrada}
            </p>
          ) : null}
          {ficha.almacenamiento ? (
            <p ref={storageRef} className={cx(styles.line, styles.storage)}>
              {ficha.almacenamiento}
            </p>
          ) : null}
          {ficha.ram ? (
            <p ref={ramRef} className={cx(styles.line, styles.ram)}>
              {ficha.ram}
            </p>
          ) : null}

          <div className={styles.connectivityWrap} ref={connectivityWrapRef}>
            {ficha.conectividadYPuertos ? (
              <p ref={connectivityRef} className={styles.connectivity}>
                {ficha.conectividadYPuertos}
              </p>
            ) : null}
          </div>
        </div>

        <div className={styles.footerRow}>
          {battery ? (
            <p className={cx(styles.line, styles.battery)} style={{ fontSize: `${batterySizeMm}mm` }}>
              {battery}
            </p>
          ) : null}
          <span className={styles.sku}>{ficha.sku}</span>
        </div>
      </div>
    </article>
  );
}
