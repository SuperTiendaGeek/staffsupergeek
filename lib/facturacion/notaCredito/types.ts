/**
 * Tipos de la Nota de Crédito electrónica (SRI Ecuador), esquema
 * notaCredito v1.1.0 — ficha técnica 2.32.
 *
 * Diferencias estructurales con la factura (v2.1.0) que hay que respetar sí
 * o sí, porque el SRI valida contra el XSD y rechaza cualquier desvío:
 *
 *  1. El bloque de cabecera es <infoNotaCredito>, no <infoFactura>, y su
 *     secuencia es distinta (incluye codDocModificado / numDocModificado /
 *     fechaEmisionDocSustento / valorModificacion / motivo, y NO lleva
 *     totalDescuento, pagos, propina ni los campos de comercio exterior).
 *  2. En <detalle>, los códigos se llaman <codigoInterno> y <codigoAdicional>
 *     (en factura son codigoPrincipal / codigoAuxiliar).
 *  3. <totalImpuesto> de la NC lleva SOLO codigo, codigoPorcentaje,
 *     baseImponible y valor — sin <tarifa> ni <descuentoAdicional>.
 *
 * Los tipos de línea (ImpuestoDetalle) y la marca interna tipo/shippingItemId
 * se reutilizan de la factura sin cambios.
 */

import type { ImpuestoDetalle, DetalleAdicional, CampoAdicional } from "../types/factura";

// ─── Línea de nota de crédito ────────────────────────────────────────────────

export type DetalleNotaCredito = {
  codigoInterno?: string;
  codigoAdicional?: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  descuento: number;
  precioTotalSinImpuesto: number;
  detallesAdicionales?: DetalleAdicional[];  // máx 3
  impuestos: ImpuestoDetalle[];
  // Marcas internas — NUNCA se serializan al XML del SRI. Viajan en
  // "Líneas JSON" para que el reverso de inventario (Fase 18 PR2) sepa qué
  // Shipping Item devolver al stock y por cuántas unidades.
  tipo?: "producto" | "servicio";
  shippingItemId?: string;
  /** true = el cliente devolvió físicamente el item (suma de vuelta al stock).
   *  false = ajuste de precio/descuento posterior, no vuelve mercadería. */
  devolucionFisica?: boolean;
};

// ─── Total de impuesto en NC (más acotado que en factura) ────────────────────

export type TotalImpuestoNotaCredito = {
  codigo: "2" | "3" | "5";
  codigoPorcentaje: string;
  baseImponible: number;
  valor: number;
};

// ─── Input principal ─────────────────────────────────────────────────────────

export type NotaCreditoInput = {
  // infoTributaria (idéntica a la factura salvo codDoc = "04")
  ambiente: "1" | "2";
  tipoEmision?: "1";
  razonSocial: string;
  nombreComercial?: string;
  ruc: string;
  claveAcceso: string;          // 49 dígitos, generada con tipoComprobante "04"
  codDoc?: "04";
  estab: string;                // 3 dígitos
  ptoEmi: string;               // 3 dígitos
  secuencial: string;           // 9 dígitos (serie propia de NC)
  dirMatriz: string;

  // infoNotaCredito (orden estricto del XSD)
  fechaEmision: Date;
  dirEstablecimiento?: string;
  tipoIdentificacionComprador: string;   // "04" RUC, "05" cédula, "07" consumidor final
  razonSocialComprador: string;
  identificacionComprador: string;
  contribuyenteEspecial?: string;
  obligadoContabilidad?: "SI" | "NO";
  rise?: string;
  /** Tipo del documento que se modifica: "01" = factura. */
  codDocModificado: string;
  /** Número del documento modificado, formato 000-000-000000000. */
  numDocModificado: string;
  /** Fecha de emisión del documento modificado. */
  fechaEmisionDocSustento: Date;
  totalSinImpuestos: number;
  /** Importe total de la NC (base + impuestos) — lo que se acredita. */
  valorModificacion: number;
  moneda?: string;
  totalConImpuestos: TotalImpuestoNotaCredito[];
  /** Motivo específico. El SRI observa motivos genéricos tipo "ajuste". */
  motivo: string;

  // detalles
  detalles: DetalleNotaCredito[];

  // infoAdicional (opcional, máx 15)
  infoAdicional?: CampoAdicional[];
};

export type NotaCreditoXml = string;
