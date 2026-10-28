/**
 * Ajuste de datos de UNA SOLA VEZ — auditoría Técnicos y Operaciones, punto 7.
 * Reglas en lib/finanzas/ajuste-auditoria-ops-punto7.ts (con pruebas).
 *
 * Asigna la cuenta destino a los ingresos de mostrador que quedaron sin
 * cuenta, según la hoja revisada por el dueño (convertida a
 * private/punto7-asignaciones.json — carpeta fuera de git: datos del negocio).
 *
 * USO
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/ajuste-auditoria-ops-punto7.ts            # vista previa
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/ajuste-auditoria-ops-punto7.ts --aplicar   # escribir
 *   (después, la vista previa debe decir 0 acciones)
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { MARCA_PUNTO7, planPunto7, resumenPorCuenta, type Asignacion, type LecturaMovimiento } from "../lib/finanzas/ajuste-auditoria-ops-punto7";

const APLICAR = process.argv.includes("--aplicar");
const ARCHIVO = path.join(process.cwd(), "private", "punto7-asignaciones.json");
const TOPE_ACCIONES = 90;
const PAUSA_MS = 250;
const T_MOV = "Movimientos Financieros";
const T_CUENTAS = "Cuentas Financieras";

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

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const texto = (v: unknown) => (typeof v === "string" ? v : v && typeof v === "object" && "name" in v ? String((v as { name: unknown }).name) : "");
const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

type Registro = { id: string; fields: Record<string, unknown> };
let BASE = "";
let HEADERS: Record<string, string> = {};
const url = (tabla: string) => `${BASE}/${encodeURIComponent(tabla)}`;

async function listar(tabla: string, formula?: string): Promise<Registro[]> {
  const out: Registro[] = [];
  let offset: string | undefined;
  do {
    const u = new URL(url(tabla));
    u.searchParams.set("pageSize", "100");
    if (formula) u.searchParams.set("filterByFormula", formula);
    if (offset) u.searchParams.set("offset", offset);
    const res = await fetch(u.toString(), { headers: HEADERS });
    await esperar(PAUSA_MS);
    if (!res.ok) throw new Error(`Airtable ${tabla}: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { records?: Registro[]; offset?: string };
    out.push(...(data.records ?? []));
    offset = data.offset;
  } while (offset);
  return out;
}

async function main(): Promise<void> {
  await cargarEnvLocal();
  const token = process.env.AIRTABLE_API_KEY?.trim();
  const baseId = process.env.AIRTABLE_BASE_ID?.trim();
  if (!token || !baseId) throw new Error("Faltan AIRTABLE_API_KEY / AIRTABLE_BASE_ID en .env.local");
  BASE = `https://api.airtable.com/v0/${baseId}`;
  HEADERS = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const asignaciones = JSON.parse(await readFile(ARCHIVO, "utf8")) as Asignacion[];
  const cuentas = new Map((await listar(T_CUENTAS)).map((r) => [texto(r.fields["Nombre"]), r.id]));

  const movimientos = new Map<string, LecturaMovimiento>();
  const lista = asignaciones.map((a) => a.movimientoId);
  for (let i = 0; i < lista.length; i += 40) {
    const lote = lista.slice(i, i + 40);
    const formula = `OR(${lote.map((id) => `RECORD_ID()='${id}'`).join(",")})`;
    for (const r of await listar(T_MOV, formula)) {
      movimientos.set(r.id, {
        existe: true,
        tipo: texto(r.fields["Tipo de movimiento"]),
        origen: texto(r.fields["Origen"]),
        monto: numero(r.fields["Monto"]),
        cuentaDestinoIds: ids(r.fields["Cuenta Destino (Finanzas)"]),
        estado: texto(r.fields["Estado del Movimiento"]),
        observacion: texto(r.fields["Observación"]),
      });
    }
  }

  const plan = planPunto7({ asignaciones, movimientos, cuentas, fecha: new Date().toISOString().slice(0, 10) });
  for (const a of plan.acciones) console.log(`  · ${a.descripcion}`);
  for (const b of plan.bloqueos) console.log(`  ✗ ${b}`);
  console.log("\nPor cuenta:");
  for (const [cuenta, r] of resumenPorCuenta(plan.acciones, asignaciones)) console.log(`  ${cuenta.padEnd(22)} ${String(r.cantidad).padStart(3)}  $${r.monto.toFixed(2)}`);
  console.log(`\nAcciones: ${plan.acciones.length}. Ya estaban bien: ${plan.yaBien}. Bloqueados: ${plan.bloqueos.length}.`);

  if (!APLICAR) {
    console.log("\nVista previa: no se escribió nada. Para aplicar: --aplicar");
    return;
  }
  if (plan.bloqueos.length) throw new Error("Hay movimientos bloqueados: no se aplica nada. Revisa la vista previa.");
  if (plan.acciones.length > TOPE_ACCIONES) throw new Error(`Más de ${TOPE_ACCIONES} acciones: algo no cuadra.`);

  for (let i = 0; i < plan.acciones.length; i += 10) {
    const lote = plan.acciones.slice(i, i + 10);
    const res = await fetch(url(T_MOV), {
      method: "PATCH",
      headers: HEADERS,
      body: JSON.stringify({ records: lote.map((a) => ({ id: a.movimientoId, fields: a.campos })), typecast: true }),
    });
    await esperar(PAUSA_MS);
    if (!res.ok) throw new Error(`Airtable PATCH movimientos: ${res.status} ${await res.text()}`);
    for (const a of lote) console.log(`✓ ${a.descripcion}`);
  }
  console.log(`\n✅ Aplicadas ${plan.acciones.length} acciones (${MARCA_PUNTO7}). Vuelve a correr la vista previa: debe decir 0 acciones.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
