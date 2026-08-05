/**
 * Test — bloqueo por firma vencida y umbrales de aviso (PR3).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/firma.avisos.test.ts
 *
 * Dos piezas, ambas sin red:
 *   · assertFirmaVigente() — el guard que impide emitir con un certificado
 *     caducado. Es el que evita el "[39] FIRMA INVALIDA" del SRI y, en
 *     producción, el hueco en la numeración que deja ese intento fallido.
 *   · umbralDeHoy() / claveAviso() — cuándo toca notificar y con qué clave,
 *     que es lo que impide que el mismo aviso se mande cien veces.
 */

import { assertFirmaVigente, type FirmaResuelta } from "../firma/resolverFirmaActiva";
import { claveAviso, umbralDeHoy } from "../firma/avisos";
import { FacturacionRechazoError } from "../errores";
import type { MetadatosFirma } from "../firma/inspeccionar";

let fallos = 0;

function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); }
  else       { console.log("✓", msg); }
}

const HOY = new Date(2026, 7, 5); // 5-ago-2026

function enDias(n: number): Date {
  const d = new Date(2026, 7, 5);
  d.setDate(d.getDate() + n);
  return d;
}

function meta(validoHasta: Date): MetadatosFirma {
  return {
    titular:        "ALEXIS RUBEN BOLANOS FLORES",
    emisor:         "SECURITY DATA S.A. 2",
    identificacion: "1003710272",
    validoDesde:    enDias(-300),
    validoHasta,
  };
}

function firma(validoHasta?: Date): FirmaResuelta {
  return {
    p12Path:  "/tmp/no-importa.p12",
    password: "x",
    origen:   "airtable",
    metadatos: validoHasta ? meta(validoHasta) : undefined,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// assertFirmaVigente
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n── deja pasar lo que debe ──");

let paso = true;
try { assertFirmaVigente(firma(enDias(200)), HOY); } catch { paso = false; }
assert(paso, "Con 200 días por delante, la emisión sigue adelante");

paso = true;
try { assertFirmaVigente(firma(enDias(28)), HOY); } catch { paso = false; }
assert(paso, "Con 28 días (el caso real de hoy) la emisión sigue adelante");

paso = true;
try { assertFirmaVigente(firma(HOY), HOY); } catch { paso = false; }
assert(paso, "El día exacto del vencimiento TODAVÍA se puede emitir");

paso = true;
try { assertFirmaVigente(firma(undefined), HOY); } catch { paso = false; }
assert(paso,
  "Sin metadatos legibles NO se bloquea: mejor que el SRI rechace a dejar al taller sin facturar");

console.log("\n── bloquea lo que debe ──");

let capturado: unknown = null;
try { assertFirmaVigente(firma(enDias(-1)), HOY); } catch (e) { capturado = e; }
assert(capturado !== null,
  "Un certificado vencido ayer BLOQUEA la emisión");
assert(capturado instanceof FacturacionRechazoError,
  "El bloqueo lanza FacturacionRechazoError — el endpoint lo traduce a 400, no a 500");

const mensaje = (capturado as Error).message;
assert(mensaje.includes("venció"),          "El mensaje dice que la firma venció");
assert(mensaje.includes("agosto"),          "El mensaje incluye la fecha exacta, en español");
assert(mensaje.includes("Firma electrónica"), "El mensaje dice dónde cargar el certificado renovado");
assert(!mensaje.includes("39"),             "El mensaje NO menciona el error críptico del SRI");

capturado = null;
try { assertFirmaVigente(firma(enDias(-400)), HOY); } catch (e) { capturado = e; }
assert(capturado !== null, "Un certificado vencido hace más de un año también bloquea");

// El guard usa la fecha que se le pasa, no la del reloj: emitirFactura le
// manda la fecha civil de Ecuador, no la UTC del servidor.
capturado = null;
try { assertFirmaVigente(firma(new Date(2026, 8, 2)), new Date(2026, 8, 3)); } catch (e) { capturado = e; }
assert(capturado !== null,
  "Con la firma real (2-sep-2026), emitir el 3-sep queda bloqueado");

paso = true;
try { assertFirmaVigente(firma(new Date(2026, 8, 2)), new Date(2026, 8, 2)); } catch { paso = false; }
assert(paso, "…y el 2-sep todavía se puede emitir");

// ═══════════════════════════════════════════════════════════════════════════
// umbralDeHoy — cuándo toca notificar
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n── umbrales de notificación ──");

assert(umbralDeHoy(enDias(60), HOY) === 60,  "A 60 días toca avisar, con umbral 60");
assert(umbralDeHoy(enDias(30), HOY) === 30,  "A 30 días toca avisar, con umbral 30");
assert(umbralDeHoy(enDias(15), HOY) === 15,  "A 15 días toca avisar, con umbral 15");
assert(umbralDeHoy(enDias(7),  HOY) === 7,   "A 7 días toca avisar, con umbral 7");
assert(umbralDeHoy(enDias(1),  HOY) === 1,   "A 1 día toca avisar, con umbral 1");

assert(umbralDeHoy(enDias(59), HOY) === null, "A 59 días NO toca — si no, avisaría todos los días");
assert(umbralDeHoy(enDias(31), HOY) === null, "A 31 días NO toca");
assert(umbralDeHoy(enDias(2),  HOY) === null, "A 2 días NO toca");
assert(umbralDeHoy(HOY,        HOY) === null, "El día del vencimiento no dispara un umbral nuevo");
assert(umbralDeHoy(enDias(-1), HOY) === null, "Ya vencida no se re-notifica todos los días");

// ═══════════════════════════════════════════════════════════════════════════
// claveAviso — la deduplicación
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n── clave de deduplicación ──");

const vence = new Date(2026, 8, 2);

assert(claveAviso(vence, 30) === claveAviso(vence, 30),
  "La misma firma y el mismo umbral generan SIEMPRE la misma clave (por eso no se duplica)");
assert(claveAviso(vence, 30) !== claveAviso(vence, 15),
  "Umbrales distintos generan claves distintas: los 5 avisos se mandan, uno por uno");
assert(claveAviso(vence, 30) !== claveAviso(new Date(2027, 8, 2), 30),
  "Al renovar la firma, la clave cambia: el ciclo de avisos empieza de cero el año que viene");
assert(claveAviso(vence, 30).includes("2026-09-02"),
  "La clave lleva la fecha de vencimiento, para poder rastrearla en Airtable");
assert(claveAviso(vence, 30).startsWith("firma-vence:"),
  "La clave lleva prefijo propio: no choca con las entidades de otros módulos");

// La clave se deriva en UTC a propósito. El servidor de Vercel corre en UTC y
// una máquina local en Ecuador va 5 horas por detrás: si la clave usara la
// fecha LOCAL, las dos calcularían claves distintas para el mismo certificado
// y el aviso se duplicaría. El `notAfter` de un certificado es un instante
// absoluto, así que su fecha UTC es la misma en todas partes.
const notAfterReal = new Date("2026-09-02T18:50:23.000Z"); // el del certificado de hoy
assert(claveAviso(notAfterReal, 7).includes("2026-09-02"),
  "La clave usa la fecha UTC del vencimiento: idéntica en Vercel y en la máquina local");
assert(claveAviso(notAfterReal, 7) === claveAviso(new Date(notAfterReal.getTime()), 7),
  "El mismo instante produce siempre la misma clave, sin importar cuándo se calcule");

// ─────────────────────────────────────────────────────────────────────────────

if (fallos > 0) {
  console.error(`\n❌ firma.avisos.test.ts — ${fallos} aserción(es) fallida(s)`);
  process.exit(1);
}
console.log("\n✅ firma.avisos.test.ts — todos los asserts pasaron");
