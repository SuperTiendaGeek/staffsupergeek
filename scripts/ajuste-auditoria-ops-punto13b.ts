/**
 * Ajuste de datos — auditoría Técnicos y Operaciones, punto 13B.
 * Pasa al nuevo saldo a favor del cliente lo abonado a las reservas que se
 * liberaron ANTES de que existiera (hoy: RES-000001 Elvis Castañeda $20 y
 * RES-000002 Karina Flores $10). Cada una queda como "Generado" con su fecha
 * de liberación (vence 6 meses después) y su salida "Saldo a favor de
 * cliente" sin cuenta en Finanzas. Es la misma función que usa el portal al
 * liberar una reserva; también sirve para completar una liberación nueva cuyo
 * saldo no se pudo guardar.
 *
 * El crédito de la nota de crédito de Aaron Narvaez ($320) NO se toca aquí:
 * se pasa en el 13B-2, junto con la factura de mostrador.
 *
 * USO
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/ajuste-auditoria-ops-punto13b.ts            # vista previa
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/ajuste-auditoria-ops-punto13b.ts --aplicar   # escribir
 *   (después, la vista previa debe decir 0 acciones)
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

const APLICAR = process.argv.includes("--aplicar");
const TOPE = 10;

async function cargarEnvLocal(): Promise<void> {
  const raw = await readFile(path.join(process.cwd(), ".env.local"), "utf8").catch(() => "");
  for (const linea of raw.split(/\r?\n/)) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith("#")) continue;
    const corte = limpia.indexOf("=");
    if (corte < 1) continue;
    const clave = limpia.slice(0, corte).trim();
    let valor = limpia.slice(corte + 1).trim();
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) valor = valor.slice(1, -1);
    process.env[clave] ||= valor;
  }
}

const texto = (v: unknown) => (typeof v === "string" ? v : "");
const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

async function main(): Promise<void> {
  await cargarEnvLocal();
  const { airtableRequest, tableUrl, linkedIds } = await import("../lib/finanzas/airtable-client");
  const { movimientosPorIds, CAMPO_INVERSO } = await import("../lib/saldo-favor/airtable");
  const { fechaLiberacionDeHistorial, venceDe } = await import("../lib/saldo-favor/reglas");
  const { generarSaldoPorReserva } = await import("../lib/saldo-favor/servidor");

  const url = new URL(tableUrl("Reservas"));
  url.searchParams.set("pageSize", "100");
  url.searchParams.set("filterByFormula", `AND({Estado}='Liberada', {Saldo a Favor Generado} > 0)`);
  const data = await airtableRequest<{ records?: Array<{ id: string; fields: Record<string, unknown> }> }>(url.toString());
  const reservas = data.records ?? [];

  type Accion = { id: string; numero: string; cliente: string; monto: number; fecha: string };
  const acciones: Accion[] = [];
  const bloqueos: string[] = [];
  let yaBien = 0;
  for (const r of reservas) {
    const f = r.fields;
    const numeroRes = texto(f["Número"]) || r.id;
    const cliente = texto(f["Cliente Nombre"]);
    const monto = numero(f["Saldo a Favor Generado"]);
    const previos = (await movimientosPorIds(linkedIds(f[CAMPO_INVERSO]))).filter((m) => m.estado !== "Anulado" && m.tipo === "Generado");
    if (previos.length) { yaBien++; continue; }
    if (!linkedIds(f["Cliente"]).length) { bloqueos.push(`${numeroRes} (${cliente}): no tiene cliente enlazado`); continue; }
    const fecha = fechaLiberacionDeHistorial(texto(f["Historial"]));
    if (!fecha) { bloqueos.push(`${numeroRes} (${cliente}): el historial no dice cuándo se liberó`); continue; }
    acciones.push({ id: r.id, numero: numeroRes, cliente, monto, fecha });
  }

  console.log(`\nReservas liberadas con saldo a favor: ${reservas.length}`);
  for (const a of acciones) {
    console.log(`  · ${a.numero} ${a.cliente}: Generado $${a.monto.toFixed(2)} (liberada ${a.fecha.slice(0, 10)}, vence ${venceDe(a.fecha)}) + salida sin cuenta en Finanzas`);
  }
  for (const b of bloqueos) console.log(`  ✗ ${b}`);
  console.log(`\nAcciones: ${acciones.length}. Ya estaban bien: ${yaBien}. Bloqueos: ${bloqueos.length}.`);

  if (!APLICAR) {
    console.log("\nVista previa: no se escribió nada. Para aplicar: --aplicar");
    return;
  }
  if (bloqueos.length) throw new Error("Hay bloqueos: no se aplica nada. Revisa la vista previa.");
  if (acciones.length > TOPE) throw new Error(`Más de ${TOPE} acciones: algo no cuadra.`);
  for (const a of acciones) {
    const r = await generarSaldoPorReserva({ reservaId: a.id, fecha: a.fecha, registradoPor: "Claude (autorizado por el dueño)" });
    console.log(r.estado === "creado" ? `✓ ${a.numero}: ${r.codigo} $${r.monto.toFixed(2)}` : `· ${a.numero}: ${r.motivo}`);
  }
  console.log("\n✅ Listo. Vuelve a correr la vista previa: debe decir 0 acciones.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
