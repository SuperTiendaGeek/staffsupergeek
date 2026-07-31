// Proforma — documento INTERNO no tributario (Fase 18 PR3).
// No se envía al SRI, no lleva clave de acceso ni autorización, no toca
// inventario ni el libro contable. Solo es una constancia formal de lo que el
// cliente quiere comprar (para respaldos, presupuestos, aprobaciones).

export type LineaProforma = {
  codigo?:        string;
  descripcion:    string;
  unidadMedida?:  string;
  cantidad:       number;
  /** Precio unitario CON IVA incluido (mismo criterio que el mostrador). */
  precioUnitario: number;
  descuento:      number;
  /** Código de tarifa SRI: "4"=15%, "2"=0%, "1"=Exento, "0"=No objeto. */
  tarifaIva:      string;
  /** Metadata opcional en Líneas JSON; no requiere campo nuevo en Airtable. */
  origen?:        "manual" | "shipping-item" | string;
  /** Record ID de Shipping Items cuando la línea viene del inventario. */
  shippingItemId?: string;
};

export type ProformaCliente = {
  tipoIdentificacion: string;   // "04" RUC, "05" cédula, "07" consumidor final
  identificacion:     string;
  razonSocial:        string;
  correo?:            string;
  direccion?:         string;
  telefono?:          string;
  airtableId?:        string;   // link real a Clientes, si se eligió uno existente
};

export type CrearProformaInput = {
  cliente:  ProformaCliente;
  lineas:   LineaProforma[];
  /** Nota/observación opcional que se imprime en la proforma. */
  nota?:    string;
  /** Días de validez de la proforma (informativo, se imprime). */
  validezDias?: number;
};

export type EstadoProforma = "Vigente" | "Facturada" | "Vencida";

export type ProformaRegistro = {
  recordId:    string;
  numero:      string;        // "PRO-000001"
  fecha:       string;        // "YYYY-MM-DD"
  estado:      EstadoProforma;
  clienteNombre: string;
  clienteIdentificacion: string;
  total:       number;
  tienePdf:    boolean;
};
