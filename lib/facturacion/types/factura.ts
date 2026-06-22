/**
 * Tipos TypeScript derivados del XSD oficial SRI Factura v2.1.0
 * (Ficha Técnica 2.32, noviembre 2025).
 * Orden de campos refleja la secuencia del XSD — no reordenar.
 */

// ─── Impuesto en línea de detalle ────────────────────────────────────────────

export type ImpuestoDetalle = {
  codigo: "2" | "3" | "5";      // 2=IVA, 3=ICE, 5=IRBPNR
  codigoPorcentaje: string;      // p.e. "10"=15%, "2"=12%, "0"=0%
  tarifa: number;                // valor numérico: 15, 12, 0 …
  baseImponible: number;
  valor: number;
};

// ─── Detalle adicional de línea ──────────────────────────────────────────────

export type DetalleAdicional = {
  nombre: string;   // max 300 chars
  valor: string;    // max 300 chars
};

// ─── Línea de factura ────────────────────────────────────────────────────────

export type DetalleFactura = {
  codigoPrincipal?: string;
  codigoAuxiliar?: string;
  descripcion: string;
  unidadMedida?: string;
  cantidad: number;
  precioUnitario: number;
  precioSinSubsidio?: number;
  descuento: number;
  precioTotalSinImpuesto: number;
  detallesAdicionales?: DetalleAdicional[];  // máx 3
  impuestos: ImpuestoDetalle[];
};

// ─── Totales de impuesto ─────────────────────────────────────────────────────

export type TotalImpuesto = {
  codigo: "2" | "3" | "5";
  codigoPorcentaje: string;
  descuentoAdicional?: number;
  baseImponible: number;
  tarifa?: number;
  valor: number;
  valorDevolucionIva?: number;
};

// ─── Formas de pago ──────────────────────────────────────────────────────────

export type Pago = {
  formaPago: string;      // "01"=efectivo … "21"
  total: number;
  plazo?: number;
  unidadTiempo?: string;  // "dias", "meses", "anios"
};

// ─── Compensaciones ──────────────────────────────────────────────────────────

export type Compensacion = {
  codigo: "1";
  tarifa: number;
  valor: number;
};

// ─── Reembolsos (factura de reembolso) ───────────────────────────────────────

export type ReembolsoDetalle = {
  tipoIdentificacionProveedorReembolso: string;
  identificacionProveedorReembolso: string;
  codPaisPagoProveedorReembolso?: string;         // 3 dígitos
  tipoProveedorReembolso: "01" | "02";
  codDocReembolso: string;
  estabDocReembolso: string;                      // 3 dígitos
  ptoEmiDocReembolso: string;                     // 3 dígitos
  secuencialDocReembolso: string;                 // 9 dígitos
  fechaEmisionDocReembolso: string;               // DD/MM/YYYY
  numeroautorizacionDocReemb: string;             // 10–49 dígitos
  detalleImpuestos: {
    codigo: "2" | "3" | "5";
    codigoPorcentaje: string;
    tarifa: string;
    baseImponibleReembolso: number;
    impuestoReembolso: number;
  }[];
};

// ─── Otros rubros de terceros ────────────────────────────────────────────────

export type OtroRubroTercero = {
  concepto: string;
  total: number;
};

// ─── Campo adicional (infoAdicional) ─────────────────────────────────────────

export type CampoAdicional = {
  nombre: string;   // max 300 chars
  valor: string;    // max 300 chars
};

// ─── Input principal ─────────────────────────────────────────────────────────

export type FacturaInput = {
  // infoTributaria (orden XSD)
  ambiente: "1" | "2";
  tipoEmision?: "1";           // "1" = emisión normal (único valor vigente)
  razonSocial: string;
  nombreComercial?: string;
  ruc: string;                 // 13 dígitos, termina en 001
  claveAcceso: string;         // 49 dígitos, generado con generateAccessKey()
  codDoc?: string;             // "01" factura — default "01"
  estab: string;               // 3 dígitos
  ptoEmi: string;              // 3 dígitos
  secuencial: string;          // hasta 9 dígitos (se rellena con ceros)
  dirMatriz: string;

  // infoFactura (orden XSD)
  fechaEmision: Date;
  dirEstablecimiento?: string;
  contribuyenteEspecial?: string;
  obligadoContabilidad?: "SI" | "NO";
  // exportación
  comercioExterior?: "EXPORTADOR";
  incoTermFactura?: string;
  lugarIncoTerm?: string;
  paisOrigen?: string;
  puertoEmbarque?: string;
  puertoDestino?: string;
  paisDestino?: string;
  paisAdquisicion?: string;
  // comprador
  tipoIdentificacionComprador: string;   // "04"=RUC, "05"=CC, "07"=consumidor final
  guiaRemision?: string;
  razonSocialComprador: string;
  identificacionComprador: string;
  direccionComprador?: string;
  // totales
  totalSinImpuestos: number;
  totalSubsidio?: number;
  incoTermTotalSinImpuestos?: string;
  totalDescuento: number;
  // reembolso (totales cabecera)
  codDocReembolso?: string;
  totalComprobantesReembolso?: number;
  totalBaseImponibleReembolso?: number;
  totalImpuestoReembolso?: number;
  totalConImpuestos: TotalImpuesto[];
  compensaciones?: Compensacion[];
  propina?: number;
  fleteInternacional?: number;
  seguroInternacional?: number;
  gastosAduaneros?: number;
  gastosTransporteOtros?: number;
  importeTotal: number;
  moneda?: string;
  pagos?: Pago[];
  valorRetIva?: number;
  valorRetRenta?: number;

  // detalles
  detalles: DetalleFactura[];

  // secciones opcionales (orden XSD: reembolsos → otrosRubros → infoAdicional)
  reembolsos?: ReembolsoDetalle[];
  otrosRubrosTerceros?: OtroRubroTercero[];
  infoAdicional?: CampoAdicional[];   // máx 15 campos
};

// ─── Tipos de salida ─────────────────────────────────────────────────────────

export type FacturaXml = string;

export type ComprobanteAutorizado = {
  claveAcceso: string;
  numeroAutorizacion: string;
  fechaAutorizacion: string;     // ISO string devuelto por el SRI
  ambiente: "1" | "2";
  estado: "AUTORIZADO" | "NO AUTORIZADO";
  xml: string;                   // XML completo tal como lo devuelve el SRI
};
