// Código de barras de la etiqueta adhesiva (punto 10b, 17-oct-2026).
//
// Code 128 con bwip-js, la misma librería que dibuja el código del RIDE de las
// facturas. bwip-js elige solo el juego de caracteres más corto (por ejemplo,
// un IMEI de 15 dígitos sale casi tan angosto como una serie de 7 letras).
//
// La etiqueta mide 50 × 25 mm y se imprime en una Zebra de 203 ppp. El código
// usa todo el ancho útil dejando a cada lado el margen en blanco que el lector
// necesita (10 módulos): mientras más ancho cada módulo, más fácil se lee.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bwipjs = require("bwip-js") as { toSVG: (opts: Record<string, unknown>) => string };

export type CodigoBarrasEtiqueta = {
  /** El SVG listo para incrustar, con su ancho y alto en milímetros. */
  svg: string;
  /** Ancho de cada módulo (barra más fina) en mm, para saber si se leerá bien. */
  moduloMm: number;
};

const MARGEN_LECTOR_MODULOS = 10;

export function codigoBarrasEtiqueta(texto: string, opciones: { anchoUtilMm: number; altoMm: number }): CodigoBarrasEtiqueta | null {
  const valor = String(texto ?? "").trim();
  if (!valor) return null;
  let crudo: string;
  try {
    crudo = bwipjs.toSVG({ bcid: "code128", text: valor, scale: 1, height: 8, includetext: false, paddingwidth: 0, paddingheight: 0 });
  } catch {
    return null;
  }
  const caja = crudo.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
  if (!caja) return null;
  const modulos = Number(caja[1]);
  if (!(modulos > 0)) return null;
  const moduloMm = Math.floor((opciones.anchoUtilMm / (modulos + 2 * MARGEN_LECTOR_MODULOS)) * 1000) / 1000;
  const anchoMm = Math.round(moduloMm * modulos * 100) / 100;
  const svg = crudo.replace(
    /<svg /,
    `<svg width="${anchoMm}mm" height="${opciones.altoMm}mm" preserveAspectRatio="none" shape-rendering="crispEdges" role="img" aria-label="Código de barras ${valor.replace(/[<>&"]/g, "")}" `
  );
  return { svg, moduloMm };
}
