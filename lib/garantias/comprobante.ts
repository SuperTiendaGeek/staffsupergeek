// Comprobante de entrega en garantía — regla PURA (auditoría ops, punto 20).
//
// Como no hay factura ni recibo, el cliente se lleva una constancia NO
// tributaria: qué se le cambió o reparó sin costo, de qué venta venía la
// garantía y su NUEVA garantía, que cuenta desde la entrega (dueño, 4-nov:
// "comprobante + plazo nuevo"). Ticket 80 mm y PDF A4, estilo Facturación.

import type { LineaPresupuesto } from "@/lib/tecnicos/presupuesto/reglas";
import { esGarantiaConfirmada } from "./reglas";
import { fechaCorta, nuevaGarantia, soloFecha, textoPlazo } from "./plazos";

export type LineaComprobanteGarantia = {
  id: string;
  descripcion: string;
  sku: string;
  tipo: string;
  garantiaDe: string;
  motivo: string;
  cortesia: boolean;
  piezaRetirada: string;
  /** "3 meses, hasta el 04/02/2027" · "sin garantía". */
  nuevaGarantia: string;
};

export type ComprobanteGarantia = {
  numero: string;
  fecha: string;
  /** Todo lo de la garantía ya se entregó (si no, es una constancia previa). */
  entregado: boolean;
  orden: { codigo: string; equipo: string };
  cliente: { nombre: string; identificacion: string; telefono: string };
  lineas: LineaComprobanteGarantia[];
};

export type LineaParaComprobante = Pick<LineaPresupuesto,
  "id" | "descripcion" | "tipo" | "estado" | "garantia" | "garantiaDe" | "motivoGarantia" | "garantiaCortesia" | "piezaRetirada" | "garantiaEntregada" | "fechaEntregaGarantia">
  & { sku: string; categoria: string; diasCatalogo: number | null };

export function armarComprobanteGarantia(input: {
  ordenCodigo: string;
  equipo: string;
  cliente: ComprobanteGarantia["cliente"];
  lineas: readonly LineaParaComprobante[];
  hoy: string;
}): ComprobanteGarantia | null {
  const enGarantia = input.lineas.filter((l) => esGarantiaConfirmada(l) && l.estado === "Cargada");
  if (!enGarantia.length) return null;
  const entregas = enGarantia.map((l) => (l.fechaEntregaGarantia ? soloFecha(l.fechaEntregaGarantia) : "")).filter(Boolean).sort();
  const entregado = enGarantia.every((l) => l.garantiaEntregada === true);
  const fecha = entregas[entregas.length - 1] || soloFecha(input.hoy);
  return {
    numero: `GAR-${input.ordenCodigo}`,
    fecha,
    entregado,
    orden: { codigo: input.ordenCodigo, equipo: input.equipo },
    cliente: input.cliente,
    lineas: enGarantia.map((l) => {
      const inicio = l.fechaEntregaGarantia ? soloFecha(l.fechaEntregaGarantia) : soloFecha(input.hoy);
      const g = nuevaGarantia({ tipoLinea: l.tipo, categoria: l.categoria, diasCatalogo: l.diasCatalogo, entrega: inicio });
      return {
        id: l.id,
        descripcion: l.descripcion,
        sku: l.sku,
        tipo: l.tipo,
        garantiaDe: l.garantiaDe ?? "",
        motivo: l.motivoGarantia ?? "",
        cortesia: l.garantiaCortesia === true,
        piezaRetirada: l.piezaRetirada ?? "",
        nuevaGarantia: g.vence ? `${textoPlazo(g.plazo)}, hasta el ${fechaCorta(g.vence)}${l.garantiaEntregada ? "" : " (cuenta desde la entrega)"}` : "sin garantía",
      };
    }),
  };
}
