// Parser del "Líneas JSON" de una factura para la impresión térmica.
// Soporta los mismos formatos que el historial: v2 (detalles), v1 (lineas) y
// legacy (array de detalles). Devuelve ítems listos para el ticket.

export type ItemTicket = {
  descripcion:    string;
  cantidad:       number;
  precioUnitario: number;
  descuento:      number;
  ivaPct:         number;
  total:          number;   // precioTotalSinImpuesto (sin IVA, igual que el SRI)
};

export type LineasFacturaParseadas = {
  items:     ItemTicket[];
  formaPago: string;
};

const TARIFA_PCT: Record<string, number> = { "4": 15, "2": 0, "1": 0, "0": 0 };
const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const s = (v: unknown): string => (typeof v === "string" ? v : "");

function mapDetalleSri(d: Record<string, unknown>): ItemTicket {
  const impuestos = Array.isArray(d.impuestos) ? (d.impuestos as Array<{ tarifa?: number }>) : [];
  const cant = n(d.cantidad), precio = n(d.precioUnitario), desc = n(d.descuento);
  return {
    descripcion: s(d.descripcion),
    cantidad: cant, precioUnitario: precio, descuento: desc,
    ivaPct: impuestos[0]?.tarifa ?? 0,
    total: typeof d.precioTotalSinImpuesto === "number" ? d.precioTotalSinImpuesto : Math.round((cant * precio - desc) * 100) / 100,
  };
}

function mapLineaV1(l: Record<string, unknown>): ItemTicket {
  const cant = n(l.cantidad), precio = n(l.precioUnitario), desc = n(l.descuento);
  return {
    descripcion: s(l.descripcion),
    cantidad: cant, precioUnitario: precio, descuento: desc,
    ivaPct: TARIFA_PCT[s(l.tarifaIva)] ?? 0,
    total: Math.round((cant * precio - desc) * 100) / 100,
  };
}

export function parsearLineasFactura(raw: string): LineasFacturaParseadas {
  if (!raw) return { items: [], formaPago: "" };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      if (obj.version === 2 && Array.isArray(obj.detalles)) {
        return { items: (obj.detalles as Record<string, unknown>[]).map(mapDetalleSri), formaPago: s(obj.formaPago) };
      }
      if (obj.version === 1 && Array.isArray(obj.lineas)) {
        return { items: (obj.lineas as Record<string, unknown>[]).map(mapLineaV1), formaPago: s(obj.formaPago) };
      }
    }
    if (Array.isArray(parsed)) {
      return { items: (parsed as Record<string, unknown>[]).map(mapDetalleSri), formaPago: "" };
    }
  } catch { /* ignore */ }
  return { items: [], formaPago: "" };
}
