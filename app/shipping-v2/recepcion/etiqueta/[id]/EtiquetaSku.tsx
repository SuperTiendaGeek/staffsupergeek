"use client";

import { useLayoutEffect, useRef } from "react";
import { Barlow_Condensed } from "next/font/google";
import { PrintSkuLabelButton } from "./PrintSkuLabelButton";

// Letra CONDENSADA a propósito: en 5 cm de ancho, una letra angosta deja que el
// SKU crezca en altura y grosor. Con Arial el SKU ya tocaba los bordes y no
// podía ganar presencia. Se descarga en el build (next/font), igual que la
// Lilita One de la ficha: la etiqueta no depende de internet al imprimir.
const barlow = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  display: "block",
});

type Props = {
  sku: string;
  linea?: string;
  precio?: string;
  /** Punto 10b: código de barras (SVG en mm) con la serie del equipo o el SKU del lote. */
  codigoSvg?: string;
  /** Lo que se lee debajo del código: "S/N 7HX2KQ3" o el SKU. */
  codigoTexto?: string;
};

/**
 * Encoge (o agranda) el texto hasta que entre JUSTO en su caja, en un solo
 * renglón.
 *
 * Solo con CSS no se puede: el largo cambia por item ("65W · USB-C" contra
 * "1080p · Batería + Wi-Fi · Visión nocturna"). Se mide el texto ya dibujado y
 * se busca el tamaño más grande que cabe, por bisección — 14 pasos alcanzan
 * para quedar a menos de 0.01 px del tamaño exacto.
 */
function useAjustarTexto(minPx: number, maxPx: number, dependencia: string) {
  const caja = useRef<HTMLDivElement>(null);
  const texto = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const contenedor = caja.current;
    const span = texto.current;
    if (!contenedor || !span) return;

    const ajustar = () => {
      const ancho = contenedor.clientWidth;
      const alto = contenedor.clientHeight;
      if (!ancho || !alto) return;
      let bajo = minPx;
      let alto_ = maxPx;
      for (let i = 0; i < 14; i++) {
        const medio = (bajo + alto_) / 2;
        span.style.fontSize = `${medio}px`;
        if (span.offsetWidth <= ancho && span.offsetHeight <= alto) bajo = medio;
        else alto_ = medio;
      }
      span.style.fontSize = `${bajo}px`;
    };

    ajustar();
    // La letra llega un instante después: sin esto se mide con la de
    // reemplazo, que es más ancha, y el texto queda más chico de lo debido.
    document.fonts?.ready.then(ajustar).catch(() => undefined);
  }, [minPx, maxPx, dependencia]);

  return { caja, texto };
}

export function EtiquetaSku({ sku, linea = "", precio = "", codigoSvg = "", codigoTexto = "" }: Props) {
  // Tamaños en px de pantalla (1 mm ≈ 3.78 px). Los máximos solo importan si
  // sobra espacio; los mínimos son el piso legible en la Zebra (203 ppp).
  const conCodigo = Boolean(codigoSvg);
  const skuAjuste = useAjustarTexto(14, conCodigo ? 60 : 120, sku + linea + precio + codigoTexto);
  const lineaAjuste = useAjustarTexto(6, 16, linea);
  const precioAjuste = useAjustarTexto(10, conCodigo ? 26 : 30, precio);
  const serieAjuste = useAjustarTexto(6, 14, codigoTexto);

  return (
    <>
      <main className={`label-sheet ${barlow.className} ${conCodigo ? "con-codigo" : ""}`}>
        {/* Punto 10b (17-oct): SKU y precio arriba, la línea técnica y, con
            todo el ancho, el código de barras de la serie (o del SKU en un
            lote) con su texto debajo. Sin código queda como antes. */}
        {conCodigo ? (
          <div className="cabecera">
            <div ref={skuAjuste.caja} className="fila sku">
              <span ref={skuAjuste.texto}>{sku}</span>
            </div>
            {precio ? (
              <div ref={precioAjuste.caja} className="fila precio">
                <span ref={precioAjuste.texto}>{precio}</span>
              </div>
            ) : null}
          </div>
        ) : (
          <div ref={skuAjuste.caja} className="fila sku">
            <span ref={skuAjuste.texto}>{sku}</span>
          </div>
        )}
        {linea ? (
          <div ref={lineaAjuste.caja} className="fila linea" title={linea}>
            <span ref={lineaAjuste.texto}>{linea}</span>
          </div>
        ) : null}
        {conCodigo ? (
          <>
            <div className="codigo" dangerouslySetInnerHTML={{ __html: codigoSvg }} />
            <div ref={serieAjuste.caja} className="fila serie">
              <span ref={serieAjuste.texto}>{codigoTexto}</span>
            </div>
          </>
        ) : precio ? (
          <div ref={precioAjuste.caja} className="fila precio">
            <span ref={precioAjuste.texto}>{precio}</span>
          </div>
        ) : null}
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
        }

        .label-sheet {
          width: 50mm;
          height: 25mm;
          display: flex;
          flex-direction: column;
          gap: 0.3mm;
          overflow: hidden;
          background: #ffffff;
          padding: 0.8mm 1.2mm;
        }

        .fila {
          width: 100%;
          min-height: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          color: #000000;
        }

        .fila span {
          display: block;
          white-space: nowrap;
          line-height: 1;
        }

        /* Tamaños de partida, por si el ajuste no llegara a correr: la
           etiqueta sigue siendo legible, solo menos exacta. */
        .sku {
          flex: 1 1 auto;
        }

        .sku span {
          font-size: 11mm;
          font-weight: 800;
          letter-spacing: -0.01em;
          line-height: 0.9;
        }

        .linea {
          flex: 0 0 3.6mm;
        }

        .linea span {
          font-size: 3mm;
          font-weight: 700;
        }

        .precio {
          flex: 0 0 5.4mm;
        }

        .precio span {
          font-size: 5.2mm;
          font-weight: 800;
        }

        /* Punto 10b: con código de barras. */
        .cabecera {
          flex: 0 0 7mm;
          display: flex;
          gap: 1mm;
          min-height: 0;
        }

        .con-codigo .cabecera .sku {
          justify-content: flex-start;
        }

        .con-codigo .cabecera .precio {
          flex: 0 0 auto;
          max-width: 17mm;
          justify-content: flex-end;
        }

        .con-codigo .linea {
          flex: 0 0 3.2mm;
        }

        .con-codigo .linea span {
          line-height: 1.15;
        }

        .codigo {
          flex: 1 1 auto;
          min-height: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }

        .codigo svg {
          display: block;
        }

        .serie {
          flex: 0 0 3.4mm;
        }

        .serie span {
          font-size: 2.8mm;
          font-weight: 800;
          letter-spacing: 0.04em;
          line-height: 1.15;
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
