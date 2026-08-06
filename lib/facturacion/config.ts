import "server-only";

// ─── Ambiente ─────────────────────────────────────────────────────────────────
// "1" = pruebas (celcer)   "2" = producción (cel)
// Resolución NAC-DGERCGC25-00000017: transmisión en tiempo real desde 01-ene-2026.

export type AmbienteSRI = "1" | "2";

function getRequired(key: string): string {
  const v = process.env[key]?.trim();
  if (!v) throw new Error(`Variable de entorno requerida no configurada: ${key}`);
  return v;
}

function getOptional(key: string, fallback: string): string {
  return process.env[key]?.trim() || fallback;
}

function getOptionalMaybe(key: string): string | undefined {
  return process.env[key]?.trim() || undefined;
}

// ─── Endpoints SRI ────────────────────────────────────────────────────────────

const ENDPOINTS = {
  "1": {
    recepcion:    "https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline",
    autorizacion: "https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline",
  },
  "2": {
    recepcion:    "https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline",
    autorizacion: "https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline",
  },
} as const;

// ─── Config pública ───────────────────────────────────────────────────────────

export type FacturacionConfig = {
  ambiente: AmbienteSRI;
  endpointRecepcion: string;
  endpointAutorizacion: string;
  // Datos del emisor
  ruc: string;
  razonSocial: string;
  nombreComercial: string;
  dirMatriz: string;
  dirEstablecimiento?: string;          // SRI_DIR_ESTABLECIMIENTO (opcional)
  obligadoContabilidad?: "SI" | "NO";   // SRI_OBLIGADO_CONTABILIDAD (opcional)
  // Punto de emisión
  establecimiento: string;   // SRI_ESTABLECIMIENTO — 3 dígitos
  puntoEmision: string;      // SRI_PUNTO_EMISION   — 3 dígitos
  secuencial: string;        // SRI_SECUENCIAL      — hasta 9 dígitos
  // La firma digital YA NO vive aquí — ver la nota de abajo.
};

// ─── Dónde quedó la firma digital ────────────────────────────────────────────
//
// `firmaPath` y `firmaPassword` salieron de esta config a propósito. Antes,
// getFacturacionConfig() exigía SRI_FIRMA_PASSWORD para CUALQUIER cosa: los 13
// llamadores incluyen imprimir un recibo, generar una proforma o mostrar un
// borrador — pantallas que no firman nada y que igual reventaban si la
// contraseña faltaba.
//
// Ahora la firma se resuelve aparte, y de forma asíncrona porque puede venir de
// Airtable (el administrador la carga desde /facturacion/firma):
//
//     import { obtenerFirmaActiva } from "./firma/resolverFirmaActiva";
//     const firma = await obtenerFirmaActiva();
//     firma.p12Path / firma.password
//
// Solo dos sitios la necesitan: emitirFactura() y emitirNotaCredito().

// ─── Límite Consumidor Final ─────────────────────────────────────────────────
// Regla general del SRI: sobre este monto hay que identificar al cliente
// (cédula o RUC), no se puede facturar a Consumidor Final. Única fuente de
// verdad — la usan tanto la UI (app/facturacion/page.tsx) como el guard
// server-side en emitirFactura().

export function getConsumidorFinalLimite(): number {
  const raw = process.env.CONSUMIDOR_FINAL_LIMITE;
  const n = parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 50;
}

export function getFacturacionConfig(): FacturacionConfig {
  const ambiente = getOptional("SRI_AMBIENTE", "1") as AmbienteSRI;
  if (ambiente !== "1" && ambiente !== "2") {
    throw new Error(`SRI_AMBIENTE debe ser "1" (pruebas) o "2" (producción). Valor: "${ambiente}"`);
  }

  const endpoints = ENDPOINTS[ambiente];

  const obligadoRaw = getOptionalMaybe("SRI_OBLIGADO_CONTABILIDAD");
  if (obligadoRaw && obligadoRaw !== "SI" && obligadoRaw !== "NO") {
    throw new Error(`SRI_OBLIGADO_CONTABILIDAD debe ser "SI" o "NO". Valor: "${obligadoRaw}"`);
  }

  return {
    ambiente,
    // SRI_RECEPTION_URL / SRI_AUTHORIZATION_URL son overrides opcionales;
    // no aparecen en .env.local estándar — se usan solo para endpoints no estándar.
    endpointRecepcion:    getOptional("SRI_RECEPTION_URL",    endpoints.recepcion),
    endpointAutorizacion: getOptional("SRI_AUTHORIZATION_URL", endpoints.autorizacion),
    ruc:                  getRequired("SRI_RUC"),
    razonSocial:          getRequired("SRI_RAZON_SOCIAL"),
    nombreComercial:      getOptional("SRI_NOMBRE_COMERCIAL", getRequired("SRI_RAZON_SOCIAL")),
    dirMatriz:            getRequired("SRI_DIR_MATRIZ"),
    dirEstablecimiento:   getOptionalMaybe("SRI_DIR_ESTABLECIMIENTO"),
    obligadoContabilidad: obligadoRaw as "SI" | "NO" | undefined,
    establecimiento:      getRequired("SRI_ESTABLECIMIENTO"),
    puntoEmision:         getRequired("SRI_PUNTO_EMISION"),
    secuencial:           getOptional("SRI_SECUENCIAL", "1"),
  };
}
