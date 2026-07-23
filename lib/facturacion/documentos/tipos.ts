// DTO unificado para la pantalla única de Facturación (rediseño de pantallas).
//
// Los cuatro documentos del módulo (factura y nota de crédito = tributarios;
// recibo y proforma = internos) viven en tablas distintas con campos distintos.
// Esta capa los proyecta a UNA sola forma común para poder listarlos, buscarlos
// y ordenarlos juntos, y para que la barra de acciones sepa qué ofrecer según
// el tipo del documento seleccionado. No reemplaza a los tipos originales de
// cada módulo; solo es la vista de "resumen" que consume la pantalla.

export type TipoDocumento = "factura" | "recibo" | "proforma" | "notaCredito";

/** Agrupaciones de navegación (chips). Ventas junta factura + recibo porque
 *  ambos son ventas cerradas que mueven inventario/caja; proformas (cotización)
 *  y notas de crédito (corrección) son de otra naturaleza y van aparte. */
export type GrupoVista = "ventas" | "proformas" | "nc";

export const TIPO_LABEL: Record<TipoDocumento, string> = {
  factura:     "Factura",
  recibo:      "Recibo",
  proforma:    "Proforma",
  notaCredito: "Nota de crédito",
};

export type DocumentoResumen = {
  tipo:                  TipoDocumento;
  recordId:              string;
  numero:                string;   // "001-001-000000123" | "REC-000045" | "PRO-000012" | NC
  fecha:                 string;   // "YYYY-MM-DD"
  clienteNombre:         string;
  clienteIdentificacion: string;
  clienteCorreo:         string;   // "" para recibo/proforma (documentos internos)
  total:                 number;
  estado:                string;   // etiqueta cruda del sistema (AUTORIZADO, Vigente, Anulado…)
  ambiente:              string;   // "PRUEBAS" | "PRODUCCIÓN" | "" (internos)
  // Flags que la barra de acciones usa para decidir qué botones habilitar:
  claveAcceso:           string;   // tributarios (RIDE/XML)
  tieneXml:              boolean;
  tieneRide:             boolean;
  tienePdf:              boolean;
  numeroDocModificado:   string;   // NC → número de la factura que corrige
};

export type ListadoDocumentos = {
  documentos: DocumentoResumen[];
  suma:       number;
};
