import "server-only";

// API pública del módulo Facturación.
// Punto de entrada para los route handlers en app/api/facturacion/.

export { getFacturacionConfig } from "./config";
export type { FacturacionConfig, AmbienteSRI } from "./config";

export { generateAccessKey, modulo11 } from "./claveAcceso";
export type { AccessKeyInput } from "./claveAcceso";

// Fase 1: tipos, builder XML y validación XSD
export { construirFacturaXml } from "./xml/construirFacturaXml";
export { validarContraXsd } from "./xml/validarXsd";
export type { ResultadoValidacion } from "./xml/validarXsd";
export type {
  FacturaInput,
  FacturaXml,
  ComprobanteAutorizado,
  DetalleFactura,
  ImpuestoDetalle,
  TotalImpuesto,
  Pago,
  CampoAdicional,
} from "./types/factura";

// Fase 2: firma XAdES-BES
export { firmarXml } from "./firma/firmar";
export type { FirmaInput } from "./firma/firmar";

// Fase 3: clientes SOAP SRI
export { enviarComprobante } from "./sri/recepcion";
export type { ResultadoRecepcion, MensajeSRI } from "./sri/recepcion";
export { consultarAutorizacion } from "./sri/autorizacion";
export type { ResultadoAutorizacion } from "./sri/autorizacion";
export { esperarAutorizacion } from "./sri/cola";

// Fase 4: orquestación completa, persistencia, RIDE, correo
export { emitirFactura } from "./emitirFactura";
export type { DatosVenta, ResultadoEmision } from "./emitirFactura";
