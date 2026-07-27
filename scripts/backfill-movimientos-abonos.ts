/**
 * Backfill de movimientos financieros para abonos anteriores al puente.
 *
 * Contexto (auditoría F-11). El puente `crearMovimientoParaAbono` entró en
 * producción el 14-jul-2026 a las 17:22. Desde entonces TODOS los abonos han
 * generado su movimiento sin excepción — el puente no falla. Pero los 133
 * abonos anteriores ($7.589) nunca lo tuvieron, y /finanzas no los ve.
 *
 * De esos 133, 83 quedaron con fecha 2026-01-01 exacta: es la fecha por defecto
 * que puso la migración, no la del cobro real. Meterlos a /finanzas con esa
 * fecha metería $4.366 en un solo día que en realidad se cobraron a lo largo de
 * meses, así que se excluyen por defecto (ver DESDE).
 *
 * El script NO inventa movimientos a mano: llama al mismo puente que usa la
 * aplicación, de modo que la cuenta contable, la categoría, el estado y la
 * referencia legible salen exactamente igual que en un abono de hoy. El puente
 * además es idempotente (si el abono ya tiene movimiento, no crea otro), así
 * que se puede volver a correr sin miedo.
 *
 * USO
 *   # 1) ver qué haría, sin escribir nada:
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/backfill-movimientos-abonos.ts
 *
 *   # 2) aplicar de verdad:
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/backfill-movimientos-abonos.ts --aplicar
 *
 *   # opcional: cambiar la fecha de corte
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/backfill-movimientos-abonos.ts --desde=2026-06-01 --aplicar
 *
 * (El NODE_OPTIONS hace falta porque el puente vive detrás de "server-only",
 *  igual que en los tests de lib/facturacion/__tests__.)
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { crearMovimientoParaAbono } from "../lib/finanzas/puentes/abonos";

const ABONOS_TABLE = "Abonos";

// Solo abonos con fecha confiable. Antes de esto están los 83 migrados con
// fecha ficticia 2026-01-01.
const DESDE_POR_DEFECTO = "2026-04-01";

type AirtableRecord = { id: string; fields: Record<string, unknown> };

function arg(nombre: string): string | undefined {
  const encontrado = process.argv.find((a) => a.startsWith(`--${nombre}=`));
  return encontrado?.split("=")[1];
}

const APLICAR = process.argv.includes("--aplicar");
const DESDE = arg("desde") ?? DESDE_POR_DEFECTO;

// Mismo patrón que scripts/inspect-shipping-v2-schema.mjs: se lee .env.local a
// mano para no depender de dotenv (el proyecto no lo tiene).
async function cargarEnvLocal(): Promise<void> {
  const archivo = path.join(process.cwd(), ".env.local");
  const raw = await readFile(archivo, "utf8").catch(() => "");
  for (const linea of raw.split(/\r?\n/)) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith("#")) continue;
    const corte = limpia.indexOf("=");
    if (corte < 1) continue;
    const clave = limpia.slice(0, corte).trim();
    let valor = limpia.slice(corte + 1).trim();
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) {
      valor = valor.slice(1, -1);
    }
    process.env[clave] ||= valor;
  }
}

function env(nombre: string): string {
  const valor = process.env[nombre]?.trim();
  if (!valor) throw new Error(`Falta ${nombre} en .env.local`);
  return valor;
}

function texto(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "name" in (v as Record<string, unknown>)) return String((v as { name: unknown }).name);
  return "";
}

function numero(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function primerLink(v: unknown): string {
  return Array.isArray(v) && typeof v[0] === "string" ? (v[0] as string) : "";
}

/**
 * ¿Este abono debe recibir un movimiento financiero?
 *
 * Exportada y pura para poder cubrirla con tests: es la única pieza con riesgo
 * real del script (incluir de más significa duplicar dinero en /finanzas).
 * Deja fuera, en este orden: anulados, los que ya tienen movimiento (el puente
 * igual es idempotente, pero así ni se intentan), los que no cuelgan de una
 * orden / operación / reserva, los de monto cero y los anteriores al corte.
 */
export function esCandidatoBackfill(fields: Record<string, unknown>, desde: string): boolean {
  if (texto(fields["Estado del Abono"]) === "Anulado") return false;

  const movimiento = fields["Movimiento Financiero"];
  if (Array.isArray(movimiento) && movimiento.length > 0) return false;

  const tieneDestino =
    !!primerLink(fields["Aplicado a: Orden"]) ||
    !!primerLink(fields["Aplicado a: Operación"]) ||
    !!primerLink(fields["Reservas"]);
  if (!tieneDestino) return false;

  if (numero(fields["Monto"]) <= 0) return false;

  return texto(fields["Fecha de Abono"]) >= desde;
}

async function traerAbonos(): Promise<AirtableRecord[]> {
  const token = env("AIRTABLE_API_KEY");
  const baseId = env("AIRTABLE_BASE_ID");
  const registros: AirtableRecord[] = [];
  let offset: string | undefined;

  do {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(ABONOS_TABLE)}`);
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!res.ok) throw new Error(`Airtable ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { records?: AirtableRecord[]; offset?: string };
    registros.push(...(data.records ?? []));
    offset = data.offset;
  } while (offset);

  return registros;
}

async function main(): Promise<void> {
  await cargarEnvLocal();

  console.log(`\nBackfill de movimientos financieros para abonos`);
  console.log(`  modo:  ${APLICAR ? "APLICAR (escribe en Airtable)" : "SIMULACIÓN (no escribe nada)"}`);
  console.log(`  desde: ${DESDE}\n`);

  const todos = await traerAbonos();

  const candidatos = todos.filter((r) => esCandidatoBackfill(r.fields, DESDE));

  const excluidos = todos.filter((r) => {
    const anulado = texto(r.fields["Estado del Abono"]) === "Anulado";
    const yaTiene = Array.isArray(r.fields["Movimiento Financiero"]) && (r.fields["Movimiento Financiero"] as unknown[]).length > 0;
    return !anulado && !yaTiene && texto(r.fields["Fecha de Abono"]) < DESDE;
  });

  const total = candidatos.reduce((s, r) => s + numero(r.fields["Monto"]), 0);
  const totalExcluido = excluidos.reduce((s, r) => s + numero(r.fields["Monto"]), 0);

  console.log(`Abonos en la tabla: ${todos.length}`);
  console.log(`A procesar:         ${candidatos.length}  ($${total.toFixed(2)})`);
  console.log(`Fuera del corte:    ${excluidos.length}  ($${totalExcluido.toFixed(2)}) — quedan como histórico\n`);

  if (candidatos.length === 0) {
    console.log("Nada que hacer.");
    return;
  }

  let ok = 0;
  let fallos = 0;

  for (const abono of candidatos) {
    const idAbono = numero(abono.fields["ID Abono"]);
    const monto = numero(abono.fields["Monto"]);
    const fecha = texto(abono.fields["Fecha de Abono"]).slice(0, 10);
    const metodo = texto(abono.fields["Método de Pago"]) || null;
    const etiqueta = `ID ${String(idAbono).padStart(3)} · ${fecha} · $${monto.toFixed(2).padStart(8)} · ${metodo ?? "sin método"}`;

    if (!APLICAR) {
      console.log(`  [simulado] ${etiqueta}`);
      ok++;
      continue;
    }

    const resultado = await crearMovimientoParaAbono({
      abonoId: abono.id,
      monto,
      metodoPago: metodo,
      fecha,
      registradoPor: texto(abono.fields["Registrado Por"]) || "Backfill",
      numeroTransaccion: texto(abono.fields["Número de Transacción"]) || undefined,
      observacion: "Regularización de abono anterior al puente de finanzas",
    });

    if (resultado.ok) {
      ok++;
      console.log(`  ✓ ${etiqueta} → ${resultado.movimientoId}`);
    } else {
      fallos++;
      console.error(`  ✗ ${etiqueta} → ${resultado.error}`);
    }
  }

  console.log(`\n${APLICAR ? "Aplicado" : "Simulación"}: ${ok} correctos, ${fallos} con error.`);
  if (!APLICAR) console.log("Para escribir de verdad, repite el comando con --aplicar\n");
}

// Solo se ejecuta cuando ESTE archivo es el que se invoca. Sin esta guarda, el
// test que importa `esCandidatoBackfill` dispararía también el backfill.
const invocadoDirectamente = process.argv[1]
  ? path.resolve(process.argv[1]).endsWith(path.join("scripts", "backfill-movimientos-abonos.ts"))
  : false;

if (invocadoDirectamente) {
  main().catch((e) => {
    console.error("\nError:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
