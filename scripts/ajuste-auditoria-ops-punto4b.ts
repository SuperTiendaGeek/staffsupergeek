/**
 * Ajuste de datos de UNA SOLA VEZ — auditoría Técnicos y Operaciones, punto 4B.
 * Reglas y caso en lib/operaciones/ajuste-auditoria-ops-punto4b.ts (con pruebas).
 *
 *   · OR000423: el servicio de −$20 ("Descuento: SSD REP-000017…") pasa a ser un
 *     descuento de $20 sobre la línea del SSD; el servicio negativo se borra.
 *     El total de la orden no cambia.
 *
 * USO
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/ajuste-auditoria-ops-punto4b.ts            # vista previa
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/ajuste-auditoria-ops-punto4b.ts --aplicar   # escribir
 *   (después, la vista previa debe decir 0 acciones)
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { CASO_OR000423 as C, MARCA_PUNTO4B, planOR000423, type AccionPunto4B } from "../lib/operaciones/ajuste-auditoria-ops-punto4b";

const APLICAR = process.argv.includes("--aplicar");
const TOPE_ACCIONES = 2;
const PAUSA_MS = 250;

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

async function leer(tabla: string, id: string): Promise<Registro | null> {
  const res = await fetch(`${url(tabla)}/${id}`, { headers: HEADERS });
  await esperar(PAUSA_MS);
  if (res.status === 404) return null;
  if (!res.ok) {
    const cuerpo = await res.text();
    // Airtable responde 403 (no 404) a un registro borrado.
    if (res.status === 403 && cuerpo.includes("INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND")) return null;
    throw new Error(`Airtable ${tabla}/${id}: ${res.status} ${cuerpo}`);
  }
  return (await res.json()) as Registro;
}

async function aplicar(a: AccionPunto4B): Promise<void> {
  const res = a.tipo === "crear-descuento"
    ? await fetch(url("Descuentos de Cuenta"), { method: "POST", headers: HEADERS, body: JSON.stringify({ fields: a.campos, typecast: true }) })
    : await fetch(`${url("Servicios por Orden")}/${a.id}`, { method: "DELETE", headers: HEADERS });
  await esperar(PAUSA_MS);
  if (!res.ok) throw new Error(`Airtable ${a.tipo}: ${res.status} ${await res.text()}`);
}

async function main(): Promise<void> {
  await cargarEnvLocal();
  const token = process.env.AIRTABLE_API_KEY?.trim();
  const baseId = process.env.AIRTABLE_BASE_ID?.trim();
  if (!token || !baseId) throw new Error("Faltan AIRTABLE_API_KEY / AIRTABLE_BASE_ID en .env.local");
  BASE = `https://api.airtable.com/v0/${baseId}`;
  HEADERS = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const [servicioR, ssdR, ordenR] = [
    await leer("Servicios por Orden", C.servicioNegativoId),
    await leer("Shipping Items", C.ssdId),
    await leer("Órdenes de Reparación", C.ordenId),
  ];
  if (!ordenR) throw new Error(`${C.ordenVisible} no existe`);
  const descuentos: Registro[] = [];
  for (const id of ids(ordenR.fields["Descuentos de Cuenta"])) {
    const r = await leer("Descuentos de Cuenta", id);
    if (r) descuentos.push(r);
  }

  const plan = planOR000423({
    servicio: {
      existe: Boolean(servicioR),
      costo: numero(servicioR?.fields["Costo real"]),
      ordenIds: ids(servicioR?.fields["Orden de Reparación"]),
      observacion: texto(servicioR?.fields["Observación"]),
      fecha: texto(servicioR?.fields["Fecha de registro"]) || null,
    },
    ssd: {
      existe: Boolean(ssdR),
      sku: texto(ssdR?.fields["SKU"]),
      nombre: texto(ssdR?.fields["Nombre del item"]),
      precio: numero(ssdR?.fields["Precio venta final"]),
      ordenStockIds: ids(ssdR?.fields["Orden de Reparación (Stock)"]),
    },
    descuentosDeLaOrden: descuentos.map((d) => ({ cargoId: texto(d.fields["Cargo ID"]), estado: texto(d.fields["Estado"]), monto: numero(d.fields["Monto"]) })),
  });

  const marca = plan.bloqueos.length ? "BLOQUEADO" : plan.acciones.length ? "APLICAR" : "ya está bien";
  console.log(`\n${plan.caso}  [${marca}]`);
  for (const b of plan.bloqueos) console.log(`   ✗ ${b}`);
  for (const a of plan.acciones) console.log(`   · ${a.descripcion}`);
  console.log(`\nAcciones: ${plan.acciones.length}. Bloqueados: ${plan.bloqueos.length ? 1 : 0}.`);

  if (!APLICAR) {
    console.log("\nVista previa: no se escribió nada. Para aplicar: --aplicar");
    return;
  }
  if (plan.bloqueos.length) throw new Error("Caso bloqueado: no se aplica nada.");
  if (plan.acciones.length > TOPE_ACCIONES) throw new Error(`Más de ${TOPE_ACCIONES} acciones: algo no cuadra.`);
  for (const a of plan.acciones) {
    await aplicar(a);
    console.log(`✓ ${a.descripcion}`);
  }
  console.log(`\n✅ Aplicadas ${plan.acciones.length} acciones (${MARCA_PUNTO4B}). Vuelve a correr la vista previa: debe decir 0 acciones.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
