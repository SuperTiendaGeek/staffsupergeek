import "server-only";

import { resolverRutaP12 } from "./firma/resolverP12";

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
  // Firma digital
  firmaPath: string;         // SRI_FIRMA_PATH (local) o materializada en /tmp desde SRI_FIRMA_P12_BASE64
  firmaPassword: string;     // SRI_FIRMA_PASSWORD — contraseña del .p12 — NUNCA al repo
};

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

  const firmaPassword = getRequired("SRI_FIRMA_PASSWORD");

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
    firmaPath:            resolverRutaP12({
                            firmaPathLocal: getOptionalMaybe("SRI_FIRMA_PATH"),
                            p12Base64:      getOptionalMaybe("SRI_FIRMA_P12_BASE64"),
                            password:       firmaPassword,
                          }),
    firmaPassword,
  };
}
