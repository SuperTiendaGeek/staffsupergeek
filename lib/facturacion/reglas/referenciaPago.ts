/**
 * Referencia (número de transacción) de un pago — reglas puras, sin
 * "server-only": FacturacionForm.tsx (cliente) necesita el mismo mensaje de
 * validación que el servidor, mismo criterio que
 * lib/facturacion/reglas/identificacion.ts (validarIdentificacion se usa en
 * los dos lados).
 *
 * Nunca toca el nodo <pago> del XML — ese nodo está cerrado en
 * formaPago/total/plazo/unidadTiempo (XSD del SRI), la referencia viaja
 * solo por infoAdicional (ver construirCamposReferenciaPago más abajo,
 * consumida por emitirFactura.ts).
 */

import type { CampoAdicional, Pago } from "../types/factura";

// ─── Obligatoriedad por forma de pago ────────────────────────────────────────

// Código SRI "20" = otros con utilización del sistema financiero. Cubre
// Transferencia, Depósito, PayPal, PayPhone y DeUna (ver
// lib/facturacion/gancho/config.ts, MAPA_METODO_PAGO_SRI) — los cinco
// dejan un número de transacción real. Para el resto de códigos (Efectivo,
// tarjetas, dinero electrónico, compensación, endoso) el campo sigue
// opcional.
export const CODIGO_SRI_REQUIERE_REFERENCIA = "20";

type PagoMinimo = { formaPago: string; referencia?: string; total?: number };

/**
 * Devuelve un mensaje claro en español si algún pago con forma "20" no
 * trae referencia, o null si todo está bien. Mismo patrón que
 * mensajeFaltantes()/mensajePrecioShippingItemInvalido() — el llamador
 * decide qué hacer con el mensaje (mostrarlo en pantalla o responder 400).
 */
export function mensajeReferenciaPagoFaltante(pagos: PagoMinimo[]): string | null {
  const faltante = pagos.find(
    (p) => p.formaPago === CODIGO_SRI_REQUIERE_REFERENCIA && !p.referencia?.trim()
  );
  if (!faltante) return null;
  const monto = typeof faltante.total === "number" ? ` de $${faltante.total.toFixed(2)}` : "";
  return (
    `Falta el número de referencia del pago${monto} con forma de pago "Otros (sistema financiero)" ` +
    `— obligatorio para transferencia, depósito, PayPal, PayPhone o DeUna.`
  );
}

// ─── Construcción de infoAdicional (Paso 5) ──────────────────────────────────

// Tope real del XSD del SRI para <infoAdicional>: hasta 15 <campoAdicional>.
// "Vendedor" (emitirFactura.ts) ya ocupa uno — el llamador descuenta ese y
// cualquier otro campo fijo antes de calcular cuánto espacio queda para
// estas referencias.
export const MAX_CAMPOS_INFO_ADICIONAL = 15;

const NOMBRE_CAMPO_MERGE = "Otras referencias de pago";
const SEPARADOR_MERGE = " · ";

// Guardas b) y c) del XSD para nombre/valor de un campoAdicional: 1–300
// caracteres, sin saltos de línea (patrón [^\n]*). Mejor un valor recortado
// que un comprobante rechazado.
function normalizarCampoTexto(valor: string): string {
  const sinSaltos = valor.replace(/\r\n?|\n/g, " ");
  return sinSaltos.length > 300 ? sinSaltos.slice(0, 300) : sinSaltos;
}

function nombreCampoPago(pago: Pago, contadores: Map<string, number>): string {
  // metodoPago presente → viene de un abono: "DeUna 1", "Transferencia 2".
  // Ausente → mostrador, solo hay código SRI: "Ref. pago 1". El contador es
  // por tipo de nombre (clave), empezando en 1 — no un contador global.
  const clave = pago.metodoPago?.trim() || "Ref. pago";
  const n = (contadores.get(clave) ?? 0) + 1;
  contadores.set(clave, n);
  return `${clave} ${n}`;
}

/**
 * Un campoAdicional por cada pago con referencia. Nunca pierde datos y
 * nunca genera un XML inválido por exceso de campos:
 *
 * Guarda a) TOPE DE 15 — si hay más referencias que `limiteCampos` (el
 * espacio que le queda al llamador tras Vendedor + cualquier otro campo
 * fijo), las que exceden se juntan en UN solo campo de cierre
 * ("Otras referencias de pago"), con cada entrada como "nombre: valor"
 * separada por " · " — se prefiere juntar (perder granularidad, pero no
 * datos) a truncar la lista silenciosamente (perder datos) o mandar más de
 * 15 campos (XML inválido, el SRI lo rechaza entero).
 */
export function construirCamposReferenciaPago(pagos: Pago[], limiteCampos: number): CampoAdicional[] {
  if (limiteCampos <= 0) return [];

  const conReferencia = pagos.filter((p) => p.referencia?.trim());
  if (conReferencia.length === 0) return [];

  const contadores = new Map<string, number>();
  const candidatos: CampoAdicional[] = conReferencia.map((p) => ({
    nombre: normalizarCampoTexto(nombreCampoPago(p, contadores)),
    valor: normalizarCampoTexto(p.referencia!.trim()),
  }));

  if (candidatos.length <= limiteCampos) return candidatos;

  const individuales = candidatos.slice(0, limiteCampos - 1);
  const excedente = candidatos.slice(limiteCampos - 1);
  const campoMerge: CampoAdicional = {
    nombre: normalizarCampoTexto(NOMBRE_CAMPO_MERGE),
    valor: normalizarCampoTexto(excedente.map((c) => `${c.nombre}: ${c.valor}`).join(SEPARADOR_MERGE)),
  };

  return [...individuales, campoMerge];
}

/**
 * Compone el infoAdicional final de una factura: "Vendedor" (si lo hay) +
 * cualquier infoAdicional extra que traiga el llamador, más un campo por
 * cada pago con referencia — todo dentro del tope de 15 del XSD.
 *
 * Aísla exactamente la lógica que emitirFactura.ts arma junto a la
 * inyección de "Vendedor", para poder probarla sola (Paso 7) sin levantar
 * todo el pipeline de emisión (firma, SRI, Airtable). Sin referencias, el
 * resultado es exactamente el infoAdicional de antes de esta fase — no
 * cambia el comportamiento existente en absoluto.
 */
export function construirInfoAdicionalFactura(
  vendedor: string | undefined,
  infoAdicionalExtra: CampoAdicional[] | undefined,
  pagos: Pago[]
): CampoAdicional[] {
  const base: CampoAdicional[] = [
    ...(vendedor?.trim() ? [{ nombre: "Vendedor", valor: vendedor.trim() }] : []),
    ...(infoAdicionalExtra ?? []),
  ];
  const espacioParaReferencias = Math.max(0, MAX_CAMPOS_INFO_ADICIONAL - base.length);
  const camposReferenciaPago = construirCamposReferenciaPago(pagos, espacioParaReferencias);
  return [...base, ...camposReferenciaPago];
}
