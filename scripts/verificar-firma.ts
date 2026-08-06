/**
 * Estado de la firma electrónica: de dónde sale, de quién es y cuánto le queda.
 *
 * Es la forma de comprobar el PR1 sin pantalla: PR1 no cambia nada visible en
 * el portal, así que este script es lo que hace visible el mecanismo nuevo.
 * También sirve como chequeo rápido cualquier día ("¿con qué firma estoy
 * facturando y cuándo vence?").
 *
 * USO
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/verificar-firma.ts
 *
 * NO escribe nada. Solo lee.
 *
 * QUÉ ESPERAR
 *   · Origen "entorno"  → todavía no hay ninguna firma cargada desde el portal
 *                         (normal hasta el PR2). Se usan las variables de
 *                         entorno de siempre: el sistema firma como ayer.
 *   · Origen "airtable" → ya hay una firma cargada y es la que se usa.
 *
 * Nunca imprime la contraseña ni el contenido del certificado.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { obtenerFirmaActiva } from "../lib/facturacion/firma/resolverFirmaActiva";
import { leerFirmaActiva }    from "../lib/facturacion/firma/almacen";
import {
  diasRestantes,
  nivelVigencia,
  mensajeVigencia,
} from "../lib/facturacion/firma/vigencia";
import { identificacionCoincideConRuc } from "../lib/facturacion/firma/inspeccionar";

// Mismo patrón que el resto de scripts del proyecto: se lee .env.local a mano
// para no depender de dotenv (el proyecto no lo tiene).
async function cargarEnvLocal(): Promise<void> {
  const raw = await readFile(path.join(process.cwd(), ".env.local"), "utf8").catch(() => "");
  for (const linea of raw.split(/\r?\n/)) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith("#")) continue;
    const corte = limpia.indexOf("=");
    if (corte < 1) continue;
    const clave = limpia.slice(0, corte).trim();
    let valor   = limpia.slice(corte + 1).trim();
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) {
      valor = valor.slice(1, -1);
    }
    process.env[clave] ||= valor;
  }
}

const SEMAFORO: Record<string, string> = {
  vigente:      "🟢 VIGENTE",
  "por-vencer": "🟡 POR VENCER",
  critica:      "🔴 CRÍTICA",
  vencida:      "⚫ VENCIDA",
};

function linea(etiqueta: string, valor: string): void {
  console.log(`  ${etiqueta.padEnd(20)}: ${valor}`);
}

async function main(): Promise<void> {
  await cargarEnvLocal();

  console.log("\n══ Firma electrónica ══════════════════════════════════════\n");

  const firma = await obtenerFirmaActiva();

  linea("Origen", firma.origen === "airtable"
    ? "Airtable (cargada desde el portal)"
    : "Variables de entorno (aún no se ha cargado ninguna firma desde el portal)");
  linea("Archivo en uso", firma.p12Path);
  linea("Contraseña", firma.password ? "configurada (no se muestra)" : "AUSENTE");

  if (!firma.metadatos) {
    console.log("\n  ⚠ No se pudieron leer los datos del certificado.");
    console.log("    Revisa que el archivo exista y que la contraseña sea la correcta.\n");
    process.exit(1);
  }

  const m   = firma.metadatos;
  const hoy = new Date();
  const ruc = process.env.SRI_RUC?.trim() ?? "";

  console.log("");
  linea("Titular", m.titular);
  linea("Emisor", m.emisor);
  linea("Identificación", m.identificacion || "(no se pudo leer)");
  linea("Válido desde", m.validoDesde.toISOString().split("T")[0]);
  linea("Válido hasta", m.validoHasta.toISOString().split("T")[0]);

  console.log("");
  const coincide = identificacionCoincideConRuc(m.identificacion, ruc);
  linea("SRI_RUC", ruc || "(no configurado)");
  linea("¿Coincide?", coincide
    ? "sí — el certificado es del emisor configurado"
    : "NO — el certificado NO corresponde a SRI_RUC. Revísalo antes de facturar.");

  console.log("");
  const dias  = diasRestantes(m.validoHasta, hoy);
  const nivel = nivelVigencia(m.validoHasta, hoy);
  linea("Días restantes", String(dias));
  linea("Estado", SEMAFORO[nivel] ?? nivel);

  console.log(`\n  ${mensajeVigencia(m.validoHasta, hoy)}\n`);

  // Qué hay hoy en la tabla de Airtable, independientemente de qué se esté
  // usando. Sirve para ver que la tabla existe y que el nombre de los campos
  // es el que el código espera.
  console.log("── Tabla \"Configuración Firma Electrónica\" ────────────────\n");
  try {
    const registro = await leerFirmaActiva();
    if (!registro) {
      console.log("  Sin firma activa todavía. Es lo esperado antes del PR2:");
      console.log("  la pantalla para cargarla aún no existe.\n");
    } else {
      linea("Nombre", registro.nombre);
      linea("Titular / Emisor", registro.titularEmisor);
      linea("Estado", registro.estado);
      linea("Subido por", registro.subidoPor);
      linea("Válido hasta", registro.validoHasta?.toISOString().split("T")[0] ?? "—");
      console.log("");
    }
  } catch (e) {
    console.log(`  ⚠ No se pudo leer la tabla: ${e instanceof Error ? e.message : String(e)}`);
    console.log("    Revisa que exista y que los campos se llamen exactamente como en almacen.ts.\n");
  }

  if (nivel === "vencida") process.exit(1);
}

main().catch((e) => {
  console.error("\n✗ Error:", e instanceof Error ? e.message : e, "\n");
  process.exit(1);
});
