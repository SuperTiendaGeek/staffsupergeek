/**
 * Inventario de borradores y posibles duplicados en Facturas Electronicas.
 *
 * USO
 *   PRUEBAS_CON_RED=1 NODE_OPTIONS="--conditions react-server" npx tsx scripts/inventario-duplicados-factura-mostrador.ts
 *
 * SOLO LECTURA. Este script hace unicamente GET contra Airtable y aborta si
 * cualquier llamada intenta usar otro metodo.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { assertPruebaConRedPermitida } from "../lib/facturacion/__tests__/_guardaRed";

const TABLE = "Facturas Electrónicas";
const SCRIPT_NAME = "inventario-duplicados-factura-mostrador";
const FIELDS = [
  "Número de Factura",
  "Estado",
  "Cliente - Nombre",
  "Cliente - Identificación",
  "Total",
  "Fecha de Emisión",
  "Ambiente",
] as const;

type AirtableRecord = {
  id: string;
  createdTime?: string;
  fields: Record<string, unknown>;
};

type FacturaInventario = {
  recordId: string;
  numeroFactura: string;
  estado: string;
  clienteNombre: string;
  clienteIdentificacion: string;
  total: number;
  totalKey: string;
  fechaEmision: string;
  ambiente: string;
};

async function cargarEnvLocal(): Promise<void> {
  const raw = await readFile(path.join(process.cwd(), ".env.local"), "utf8").catch(() => "");
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

function getClient(): { baseUrl: string; headers: Record<string, string> } {
  const token = process.env.AIRTABLE_API_KEY?.trim();
  const baseId = process.env.AIRTABLE_BASE_ID?.trim();
  if (!token) throw new Error("Falta AIRTABLE_API_KEY en .env.local");
  if (!baseId) throw new Error("Falta AIRTABLE_BASE_ID en .env.local");
  return {
    baseUrl: `https://api.airtable.com/v0/${baseId}`,
    headers: { Authorization: `Bearer ${token}` },
  };
}

async function airtableGet<T>(url: string): Promise<T> {
  const client = getClient();
  const res = await fetch(url, {
    method: "GET",
    headers: client.headers,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Airtable GET ${url} -> ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

function tableUrl(): string {
  return `${getClient().baseUrl}/${encodeURIComponent(TABLE)}`;
}

async function listarFacturas(filterByFormula: string): Promise<FacturaInventario[]> {
  const records: AirtableRecord[] = [];
  let offset: string | undefined;

  do {
    const params = new URLSearchParams({
      filterByFormula,
      pageSize: "100",
      "sort[0][field]": "Fecha de Emisión",
      "sort[0][direction]": "desc",
      "sort[1][field]": "Número de Factura",
      "sort[1][direction]": "desc",
    });
    for (const field of FIELDS) params.append("fields[]", field);
    if (offset) params.set("offset", offset);

    const data = await airtableGet<{ records: AirtableRecord[]; offset?: string }>(`${tableUrl()}?${params}`);
    records.push(...(data.records ?? []));
    offset = data.offset;
  } while (offset);

  return records.map(mapFactura);
}

function safeStr(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeNum(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function totalKey(total: number): string {
  return (Math.round(total * 100) / 100).toFixed(2);
}

function identidadKey(factura: Pick<FacturaInventario, "clienteIdentificacion" | "totalKey">): string {
  return `${factura.clienteIdentificacion.trim()}|${factura.totalKey}`;
}

function duplicadoEmitidoKey(factura: FacturaInventario): string {
  return `${identidadKey(factura)}|${factura.fechaEmision}`;
}

function mapFactura(record: AirtableRecord): FacturaInventario {
  const f = record.fields;
  const total = safeNum(f["Total"]);
  return {
    recordId: record.id,
    numeroFactura: safeStr(f["Número de Factura"]) || "(sin numero)",
    estado: safeStr(f["Estado"]) || "(sin estado)",
    clienteNombre: safeStr(f["Cliente - Nombre"]) || "(sin nombre)",
    clienteIdentificacion: safeStr(f["Cliente - Identificación"]) || "(sin identificacion)",
    total,
    totalKey: totalKey(total),
    fechaEmision: safeStr(f["Fecha de Emisión"]) || "(sin fecha)",
    ambiente: safeStr(f["Ambiente"]) || "(sin ambiente)",
  };
}

function formatoFactura(factura: FacturaInventario): string {
  return [
    factura.recordId,
    factura.numeroFactura,
    factura.estado,
    factura.fechaEmision,
    factura.ambiente,
    factura.clienteIdentificacion,
    factura.clienteNombre,
    `$${factura.totalKey}`,
  ].join(" | ");
}

function imprimirLista(titulo: string, facturas: FacturaInventario[]): void {
  console.log(`\n${titulo} (${facturas.length})`);
  console.log("-".repeat(titulo.length + 5 + String(facturas.length).length));
  if (facturas.length === 0) {
    console.log("  Sin registros.");
    return;
  }
  for (const factura of facturas) console.log(`  ${formatoFactura(factura)}`);
}

async function main(): Promise<void> {
  await cargarEnvLocal();
  assertPruebaConRedPermitida(SCRIPT_NAME);

  const originalFetch = global.fetch;
  global.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    if (method !== "GET") throw new Error(`Este inventario es solo lectura: intento de ${method}`);
    return originalFetch(input, init);
  }) as typeof fetch;

  console.log("\nINVENTARIO DE DUPLICADOS DE FACTURA DE MOSTRADOR");
  console.log("Solo lectura: GET contra Airtable. No crea, no modifica, no borra.\n");

  const borradores = await listarFacturas('{Estado}="BORRADOR"');
  const noBorradores = await listarFacturas('NOT({Estado}="BORRADOR")');

  const noBorradoresPorIdentidadYTotal = new Map<string, FacturaInventario[]>();
  for (const factura of noBorradores) {
    const key = identidadKey(factura);
    const grupo = noBorradoresPorIdentidadYTotal.get(key) ?? [];
    grupo.push(factura);
    noBorradoresPorIdentidadYTotal.set(key, grupo);
  }

  imprimirLista("A) BORRADORES", borradores);

  console.log("\nB) BORRADORES CON FACTURAS NO BORRADOR DEL MISMO CLIENTE Y TOTAL");
  console.log("----------------------------------------------------------------");
  if (borradores.length === 0) {
    console.log("  Sin borradores que revisar.");
  }
  for (const borrador of borradores) {
    const coincidencias = noBorradoresPorIdentidadYTotal.get(identidadKey(borrador)) ?? [];
    console.log(`\n  Borrador: ${formatoFactura(borrador)}`);
    if (coincidencias.length === 0) {
      console.log("    Sin coincidencias no borrador.");
      continue;
    }
    for (const factura of coincidencias) console.log(`    Coincide: ${formatoFactura(factura)}`);
  }

  const gruposDuplicadosEmitidos = new Map<string, FacturaInventario[]>();
  for (const factura of noBorradores) {
    const key = duplicadoEmitidoKey(factura);
    const grupo = gruposDuplicadosEmitidos.get(key) ?? [];
    grupo.push(factura);
    gruposDuplicadosEmitidos.set(key, grupo);
  }

  const duplicadosEmitidos = [...gruposDuplicadosEmitidos.values()]
    .filter((grupo) => grupo.length > 1)
    .sort((a, b) => b.length - a.length || a[0].fechaEmision.localeCompare(b[0].fechaEmision));

  console.log("\nC) GRUPOS NO BORRADOR CON MISMA IDENTIFICACION + TOTAL + FECHA");
  console.log("----------------------------------------------------------------");
  if (duplicadosEmitidos.length === 0) {
    console.log("  Sin grupos duplicados emitidos.");
  }
  for (const grupo of duplicadosEmitidos) {
    const ref = grupo[0];
    console.log(`\n  ${ref.clienteIdentificacion} | $${ref.totalKey} | ${ref.fechaEmision} (${grupo.length} facturas)`);
    for (const factura of grupo) console.log(`    ${formatoFactura(factura)}`);
  }

  console.log("\nRESUMEN");
  console.log(`  Borradores: ${borradores.length}`);
  console.log(`  Facturas no borrador leidas: ${noBorradores.length}`);
  console.log(`  Borradores con coincidencias: ${
    borradores.filter((borrador) => (noBorradoresPorIdentidadYTotal.get(identidadKey(borrador)) ?? []).length > 0).length
  }`);
  console.log(`  Grupos duplicados ya emitidos: ${duplicadosEmitidos.length}\n`);
}

main().catch((error) => {
  console.error("\nERROR:", error instanceof Error ? error.message : error);
  process.exit(1);
});
