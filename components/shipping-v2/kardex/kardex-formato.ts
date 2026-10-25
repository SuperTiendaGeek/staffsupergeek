// Formato y enlaces del Kardex (punto 12), compartidos por la pestaña Kardex y
// la ficha del artículo. Sin red.

import type { MovimientoKardex } from "@/lib/shipping-v2/kardex";

const ZONA = "America/Guayaquil";

export function fechaCorta(valor?: string, conHora = true): string {
  if (!valor) return "";
  const d = new Date(valor.length === 10 ? `${valor}T12:00:00-05:00` : valor);
  if (Number.isNaN(d.getTime())) return "";
  const dia = d.toLocaleDateString("es-EC", { day: "2-digit", month: "short", timeZone: ZONA }).replace(".", "").replace(" ", "-");
  if (!conHora || valor.length === 10) return dia;
  const hora = d.toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: ZONA });
  return `${dia} ${hora}`;
}

export function dinero(v: number | null | undefined, opciones: { signo?: boolean } = {}): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const signo = v < 0 ? "−" : opciones.signo && v > 0 ? "+" : "";
  return `${signo}$${abs}`;
}

export function cantidadTexto(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0";
}

/** "…KQ3" para una serie larga; los lotes no tienen serie. */
export function serieCorta(serie: string): string {
  if (!serie) return "";
  if (/^SG\d{8}$/.test(serie)) return serie;
  return serie.length > 5 ? `…${serie.slice(-3)}` : serie;
}

/** Enlace al documento de un movimiento (o null si no tiene pantalla). */
export function enlaceDocumento(m: Pick<MovimientoKardex, "documentoTipo" | "documentoId" | "registroId">): string | null {
  const id = m.documentoId;
  switch (m.documentoTipo) {
    case "Factura": return id ? `/facturacion/documentos/factura/${id}` : null;
    case "Recibo": return id ? `/facturacion/imprimir/recibo/${id}` : null;
    case "Nota de crédito": return "/facturacion/nota-credito/historial";
    case "Orden de compra": return id ? `/shipping-v2/pagos/ordenes/${id}` : null;
    case "Caja": return id ? `/shipping-v2/packings/${id}` : null;
    case "Conteo": return id ? `/shipping-v2/control/conteo/${id}` : "/shipping-v2/control?vista=conteos";
    case "Revisión": return "/shipping-v2/control";
    case "Novedad": return "/shipping-v2/novedades";
    case "Mejora":
    case "Despiece":
    case "Ficha":
    case "Recepción":
    case "Pago":
      return m.registroId ? `/shipping-v2/items/${m.registroId}` : null;
    default:
      return null;
  }
}

export function enlaceReserva(id: string): string {
  return `/facturacion/imprimir/reserva/${id}`;
}

/** Texto del documento: el número si lo hay, o el código de la caja/OC. */
export function textoDocumento(m: Pick<MovimientoKardex, "documento" | "documentoTipo" | "documentoId">, codigos: Record<string, string> = {}): string {
  if (m.documento) {
    // Corto: el tipo ya se entiende por el número (REC-…, 001-002-…).
    return m.documento
      .replace(/^Factura\s+/, "Fac. ")
      .replace(/^Recibo\s+/, "")
      .replace(/^Nota de crédito\s+/, "NC ");
  }
  if (m.documentoTipo === "Reconstrucción") return "";
  const codigo = codigos[m.documentoId];
  if (codigo) return codigo;
  if (m.documentoTipo === "Caja") return "Caja";
  if (m.documentoTipo === "Orden de compra") return "Orden de compra";
  return m.documentoTipo || "";
}

export function descargarXlsx(bytes: Uint8Array, nombre: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
