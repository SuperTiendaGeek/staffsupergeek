// Recibo — documento INTERNO no tributario (Fase 18 PR4).
//
// A diferencia de la proforma, el recibo SÍ tiene efectos reales: descuenta
// inventario y registra el ingreso en el Sistema Contable SG, igual que una
// factura. Pero NO se envía al SRI, no tiene validez tributaria y NO desglosa
// IVA (el precio es el precio final). Se usa para clientes que no quieren un
// comprobante tributario a su nombre, solo una constancia de compra.

export type LineaRecibo = {
  codigo?:        string;
  descripcion:    string;
  unidadMedida?:  string;
  cantidad:       number;
  /** Precio final por unidad (sin desglose de IVA). */
  precioUnitario: number;
  descuento:      number;
  /** Record id del Shipping Item, si la línea salió del buscador de inventario
   *  (descuenta stock al generar el recibo, como una factura). */
  shippingItemId?: string;
};

export type ReciboCliente = {
  identificacion?: string;
  razonSocial:     string;
  correo?:         string;
  airtableId?:     string;
};

export type CrearReciboInput = {
  cliente:   ReciboCliente;
  lineas:    LineaRecibo[];
  /** Código SRI de forma de pago (mismo catálogo del formulario de facturas). */
  formaPago: string;
  nota?:     string;
};

export type EstadoRecibo = "Vigente" | "Anulado";

export type ReciboRegistro = {
  recordId:              string;
  numero:                string;   // "REC-000001"
  fecha:                 string;   // "YYYY-MM-DD"
  estado:                EstadoRecibo;
  clienteNombre:         string;
  clienteIdentificacion: string;
  total:                 number;
  formaPago:             string;
  tienePdf:              boolean;
};
