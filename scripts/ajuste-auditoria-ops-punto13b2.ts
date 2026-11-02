/**
 * Ajuste de datos — auditoría Técnicos y Operaciones, punto 13B-2.
 * Pasa al saldo a favor único del cliente el crédito VIGENTE de las notas de
 * crédito de producción (destino "Cambio de equipo" o "Saldo a favor") que
 * todavía no están en la tabla "Saldo a Favor". Hoy: NC 001-002-000000005,
 * Aaron Narvaez, $320, vence el 23-abr-2027. Si la NC no está enlazada al
 * cliente, se enlaza por su cédula/RUC. El Egreso en Finanzas ya existe (la
 * reversa de la NC): solo se enlaza, no se crea otro.
 *
 * USO
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/ajuste-auditoria-ops-punto13b2.ts            # vista previa
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/ajuste-auditoria-ops-punto13b2.ts --aplicar   # escribir
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

const texto = (v: unknown) => (typeof v === "string" ? v : v && typeof v === "object" && "name" in v ? String((v as { name: unknown }).name) : "");
const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

async function main(): Promise<void> {
  await cargarEnvLocal();
  const { airtableRequest, tableUrl, linkedIds } = await import("../lib/finanzas/airtable-client");
  const { movimientosPorIds, CAMPO_INVERSO } = await import("../lib/saldo-favor/airtable");
  const { generarSaldoPorNotaCredito, clientePorIdentificacion } = await import("../lib/saldo-favor/servidor");

  const url = new URL(tableUrl("Notas de Crédito Electrónicas"));
  url.searchParams.set("pageSize", "100");
  url.searchParams.set("filterByFormula", `AND({Estado}='AUTORIZADO', {Ambiente}='PRODUCCIÓN', {Saldo Disponible} > 0)`);
  const data = await airtableRequest<{ records?: Array<{ id: string; fields: Record<string, unknown> }> }>(url.toString());
  const ncs = data.records ?? [];

  type Accion = { id: string; numero: string; cliente: string; monto: number; vence: string; enlazarCliente: boolean };
  const acciones: Accion[] = [];
  const bloqueos: string[] = [];
  let yaBien = 0;
  for (const r of ncs) {
    const f = r.fields;
    const num = texto(f["Número de Nota de Crédito"]) || r.id;
    const destino = texto(f["Destino"]);
    const estadoCredito = texto(f["Estado Crédito"]);
    if (destino !== "Cambio de equipo" && destino !== "Saldo a favor") { bloqueos.push(`${num}: destino "${destino || "vacío"}" con saldo $${numero(f["Saldo Disponible"])}; revisar a mano`); continue; }
    if (estadoCredito && estadoCredito !== "Vigente") { bloqueos.push(`${num}: crédito ${estadoCredito} pero con saldo; revisar a mano`); continue; }
    const previos = (await movimientosPorIds(linkedIds(f[CAMPO_INVERSO]))).filter((m) => m.estado !== "Anulado" && m.tipo === "Generado");
    if (previos.length) { yaBien++; continue; }
    let enlazarCliente = false;
    if (!linkedIds(f["Cliente"]).length) {
      const id = await clientePorIdentificacion(texto(f["Cliente Identificación"]));
      if (!id) { bloqueos.push(`${num} (${texto(f["Cliente Nombre"])}): no hay un único cliente con la identificación ${texto(f["Cliente Identificación"]) || "(vacía)"}`); continue; }
      enlazarCliente = true;
    }
    acciones.push({ id: r.id, numero: num, cliente: texto(f["Cliente Nombre"]), monto: numero(f["Saldo Disponible"]), vence: texto(f["Fecha de Caducidad"]), enlazarCliente });
  }

  console.log(`\nNotas de crédito de producción con saldo: ${ncs.length}`);
  for (const a of acciones) {
    console.log(`  · NC ${a.numero} ${a.cliente}: Generado $${a.monto.toFixed(2)} (vence ${a.vence})${a.enlazarCliente ? " + se enlaza al cliente por su identificación" : ""}`);
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
    const r = await generarSaldoPorNotaCredito({ ncId: a.id, registradoPor: "Claude (autorizado por el dueño)" });
    console.log(r.estado === "creado" ? `✓ NC ${a.numero}: ${r.codigo} $${r.monto.toFixed(2)}` : `· NC ${a.numero}: ${r.motivo}`);
  }
  console.log("\n✅ Listo. Vuelve a correr la vista previa: debe decir 0 acciones.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
