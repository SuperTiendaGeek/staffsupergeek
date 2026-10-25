// Forma única de un documento para el VISOR DE DOCUMENTOS (ventana flotante
// que se abre desde Facturación, el Kardex, la ficha del artículo, etc.).
// Sin red: lo usan el servidor (visor.ts) y la pantalla (DocumentoVista).

import type { ItemDetalle, TipoDocumento } from "./tipos";

export type TipoVisor = TipoDocumento | "reserva";

export const TIPOS_VISOR: TipoVisor[] = ["factura", "recibo", "proforma", "notaCredito", "reserva"];

export const ETIQUETA_TIPO_VISOR: Record<TipoVisor, string> = {
  factura: "Factura",
  recibo: "Recibo",
  proforma: "Proforma",
  notaCredito: "Nota de crédito",
  reserva: "Reserva",
};

export type TonoEstado = "ok" | "mal" | "pendiente" | "neutro";

export type DocumentoVisor = {
  tipo: TipoVisor;
  recordId: string;
  numero: string;
  fecha: string;            // "YYYY-MM-DD" o ISO
  estado: string;           // ya en palabras ("Autorizada", "Vigente", "Anulado"…)
  estadoCrudo: string;      // el valor del sistema (AUTORIZADO, Vigente…), para las acciones
  tono: TonoEstado;
  ambiente: string;         // "PRODUCCIÓN" | "PRUEBAS" | "" (internos)
  cliente: { nombre: string; identificacion: string; correo: string; telefono: string };
  items: ItemDetalle[];
  mostrarIva: boolean;
  subtotal: number | null;
  iva: number | null;
  total: number;
  /** Filas "etiqueta · valor" propias del tipo (forma de pago, validez, motivo, saldo…). */
  datos: Array<{ etiqueta: string; valor: string }>;
  /** Otros documentos ligados que se abren en el mismo visor. */
  relacionados: Array<{ etiqueta: string; tipo: TipoVisor; recordId: string; numero: string }>;
  abonos: Array<{ fecha: string; monto: number; formaPago: string }>;
  claveAcceso: string;
  /** Imprimir, PDF/RIDE y XML (solo si la sesión tiene Facturación). */
  enlaces: Array<{ etiqueta: string; href: string; descarga?: string }>;
  /** Flags que usa la barra de acciones de Facturación. */
  tieneXml: boolean;
  tieneRide: boolean;
  tienePdf: boolean;
  numeroDocModificado: string;
};

export const FORMA_PAGO_LABEL: Record<string, string> = {
  "01": "Efectivo",
  "15": "Compensación de deudas",
  "16": "Tarjeta de débito",
  "17": "Dinero electrónico",
  "18": "Tarjeta prepago",
  "19": "Tarjeta de crédito",
  "20": "Otros (sist. financiero)",
  "21": "Endoso de títulos",
};

export function formaPagoTexto(codigo: string): string {
  return FORMA_PAGO_LABEL[codigo] ?? codigo;
}

const ESTADO_FACTURA: Record<string, string> = {
  AUTORIZADO: "Autorizada",
  DEVUELTA: "Devuelta",
  "NO AUTORIZADO": "No autorizada",
  PENDIENTE: "En proceso",
  RECIBIDA: "En proceso",
  BORRADOR: "Borrador",
  ANULADA: "Anulada",
};

export function estadoTexto(tipo: TipoVisor, estado: string): string {
  if (tipo === "factura" || tipo === "notaCredito") return ESTADO_FACTURA[estado] ?? estado ?? "";
  return estado || "";
}

export function tonoEstado(estado: string): TonoEstado {
  const e = (estado || "").toUpperCase();
  if (["AUTORIZADO", "AUTORIZADA", "VIGENTE", "FACTURADA", "ACTIVA", "PAGADA"].includes(e)) return "ok";
  if (["ANULADA", "ANULADO", "NO AUTORIZADO", "DEVUELTA", "RECHAZADA", "LIBERADA", "CANCELADA"].includes(e)) return "mal";
  if (["PENDIENTE", "RECIBIDA", "SOLICITADA", "VENCIDA", "BORRADOR"].includes(e)) return "pendiente";
  return "neutro";
}

/** Tipo de documento del Kardex → tipo del visor (o null si es otra pantalla). */
export function tipoVisorDeKardex(documentoTipo: string): TipoVisor | null {
  switch (documentoTipo) {
    case "Factura": return "factura";
    case "Recibo": return "recibo";
    case "Nota de crédito": return "notaCredito";
    case "Reserva": return "reserva";
    case "Proforma": return "proforma";
    default: return null;
  }
}
