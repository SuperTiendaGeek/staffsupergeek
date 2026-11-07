// Comprobante de entrega ENT-<orden> — regla PURA (auditoría ops, punto 6).
//
// Para la entrega SIN cobro (cuenta en $0 y sin garantía): diagnóstico sin
// costo, equipo que no se pudo reparar, cliente que no aprobó la reparación.
// No hay venta, así que no hay factura ni recibo: queda esta constancia NO
// tributaria con el MOTIVO (las políticas serias de "no charge" exigen decir
// qué tipo de entrega sin cobro fue), lo que se devolvió y quién retiró.
// Ticket 80 mm y PDF A4, estilo Facturación (igual que el de garantía).

import { ESTADO_ENTREGADA, normalizarMotivoSinCobro, type MotivoSinCobro } from "./reglas";

export type ComprobanteEntrega = {
  numero: string;
  /** ISO de la entrega. */
  fecha: string;
  orden: { codigo: string; equipo: string };
  cliente: { nombre: string; identificacion: string; telefono: string };
  motivo: MotivoSinCobro;
  detalle: string;
  accesorios: string;
  estado: string;
  retiradoPor: string;
  entregadoPor: string;
};

export function armarComprobanteEntrega(input: {
  ordenCodigo: string;
  estadoOrden: string;
  equipo: string;
  cliente: ComprobanteEntrega["cliente"];
  campos: Record<string, unknown>;
}): { ok: true; comprobante: ComprobanteEntrega } | { ok: false; motivo: string } {
  const f = input.campos;
  const t = (k: string) => {
    const v = f[k];
    if (typeof v === "string") return v.trim();
    if (v && typeof v === "object" && "name" in v) return String((v as { name: unknown }).name ?? "").trim();
    return "";
  };
  if (input.estadoOrden !== ESTADO_ENTREGADA) return { ok: false, motivo: "La orden todavía no se entrega." };
  const motivo = normalizarMotivoSinCobro(t("Motivo sin cobro"));
  if (!motivo) return { ok: false, motivo: "Esta entrega tuvo cobro: su documento es la factura o el recibo." };
  return {
    ok: true,
    comprobante: {
      numero: `ENT-${input.ordenCodigo}`,
      fecha: t("Fecha de entrega"),
      orden: { codigo: input.ordenCodigo, equipo: input.equipo },
      cliente: input.cliente,
      motivo,
      detalle: t("Detalle sin cobro"),
      accesorios: t("Accesorios devueltos"),
      estado: t("Estado al entregar"),
      retiradoPor: t("Retirado por") || input.cliente.nombre,
      entregadoPor: t("Entregado por"),
    },
  };
}
