import "server-only";

// API pública del módulo Facturación.
// Punto de entrada para los route handlers en app/api/facturacion/.

export { getFacturacionConfig, getConsumidorFinalLimite } from "./config";
export type { FacturacionConfig, AmbienteSRI } from "./config";

export { FacturacionRechazoError } from "./errores";

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

// Gestión de la firma electrónica (carga desde el portal + vigencia)
export { obtenerFirmaActiva, assertFirmaVigente } from "./firma/resolverFirmaActiva";
export type { FirmaResuelta, OrigenFirma } from "./firma/resolverFirmaActiva";
export { inspeccionarP12, identificacionCoincideConRuc, FirmaInvalidaError } from "./firma/inspeccionar";
export type { MetadatosFirma } from "./firma/inspeccionar";
export {
  diasRestantes,
  nivelVigencia,
  requiereAviso,
  tocaNotificar,
  mensajeVigencia,
} from "./firma/vigencia";
export type { NivelVigencia } from "./firma/vigencia";
export { leerFirmaActiva, listarFirmas, guardarFirmaActiva, existeHuella } from "./firma/almacen";
export type { FirmaRegistro, FirmaGuardar } from "./firma/almacen";
export { evaluarCargaFirma, avisoAlCargar } from "./firma/validarCarga";
export { notificarVencimientoFirma, claveAviso, umbralDeHoy } from "./firma/avisos";
export type { RechazoCarga } from "./firma/validarCarga";

// Fase 3: clientes SOAP SRI
export { enviarComprobante } from "./sri/recepcion";
export type { ResultadoRecepcion, MensajeSRI } from "./sri/recepcion";
export { consultarAutorizacion } from "./sri/autorizacion";
export type { ResultadoAutorizacion } from "./sri/autorizacion";
export { esperarAutorizacion } from "./sri/cola";

// Fase 4: orquestación completa, persistencia, RIDE, correo
export { emitirFactura } from "./emitirFactura";
export type { DatosVenta, ResultadoEmision } from "./emitirFactura";

// Fase 16 PR1: endurecimiento (validación XSD real + regla consumidor final server-side)
export { assertConsumidorFinalPermitido } from "./reglas/consumidorFinal";
export { assertXmlValidoSri } from "./reglas/validacionXsd";
