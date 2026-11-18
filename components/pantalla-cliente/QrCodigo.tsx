"use client";

import { useMemo } from "react";
import QRCode from "qrcode";

/** Código QR dibujado como SVG (sin imágenes externas). */
export function QrCodigo({ texto, tamano, etiqueta }: { texto: string; tamano: number; etiqueta: string }) {
  const { n, camino } = useMemo(() => {
    const qr = QRCode.create(texto, { errorCorrectionLevel: "M" });
    const size = qr.modules.size;
    let d = "";
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) if (qr.modules.get(y, x)) d += `M${x} ${y}h1v1h-1z`;
    }
    return { n: size, camino: d };
  }, [texto]);
  return (
    <svg width={tamano} height={tamano} viewBox={`-2 -2 ${n + 4} ${n + 4}`} role="img" aria-label={etiqueta} shapeRendering="crispEdges" style={{ background: "#FFFFFF", borderRadius: 12 }}>
      <path d={camino} fill="#151613" />
    </svg>
  );
}
